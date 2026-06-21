import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  DEFAULT_NUTRITION_MEAL_TEMPLATE_ICON,
  parseNutritionMealTemplateDraft,
  sanitizeNutritionMealTemplateIcon,
  type NutritionMealTemplateItemRow,
  type NutritionMealTemplateRow,
} from "@/lib/nutrition/meals";
import type { Database, Json } from "@/types/supabase";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

type MealTemplateWithItems = NutritionMealTemplateRow & {
  meal_template_items?: NutritionMealTemplateItemRow[] | null;
};
type MealTemplateInsert = Database["public"]["Tables"]["meal_templates"]["Insert"];
type MealTemplateItemInsert =
  Database["public"]["Tables"]["meal_template_items"]["Insert"];
type MealTemplateWriteTable = {
  insert: (value: MealTemplateInsert) => {
    select: (columns: string) => {
      single: () => Promise<{ data: { id: string } | null; error: unknown }>;
    };
  };
  delete: () => {
    eq: (column: "id", value: string) => Promise<{ error: unknown }>;
  };
};
type MealTemplateItemsWriteTable = {
  insert: (value: MealTemplateItemInsert[]) => Promise<{ error: unknown }>;
};

function parseLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)));
}

function databaseErrorResponse(message: string, error: unknown) {
  console.error(message, { error });
  return NextResponse.json({ error: message }, { status: 500 });
}

function sortTemplateItems(template: MealTemplateWithItems): MealTemplateWithItems {
  return {
    ...template,
    meal_template_items: [...(template.meal_template_items ?? [])].sort((a, b) => {
      const orderDelta = a.sort_order - b.sort_order;
      if (orderDelta !== 0) return orderDelta;
      return a.created_at.localeCompare(b.created_at);
    }),
  };
}

function mapTemplateForClient(template: MealTemplateWithItems) {
  const sortedTemplate = sortTemplateItems(template);

  return {
    ...sortedTemplate,
    icon: sanitizeNutritionMealTemplateIcon(
      "icon" in sortedTemplate ? sortedTemplate.icon : DEFAULT_NUTRITION_MEAL_TEMPLATE_ICON,
    ),
    meal_items: sortedTemplate.meal_template_items ?? [],
  };
}

async function verifyFoodIds(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  foodIds: string[],
) {
  if (foodIds.length === 0) return true;

  const { data, error } = await supabase
    .from("foods")
    .select("id")
    .in("id", foodIds)
    .eq("is_active", true);

  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string }>;
  return new Set(rows.map((row) => row.id)).size === foodIds.length;
}

async function verifyRecipeIds(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  userId: string,
  recipeIds: string[],
) {
  if (recipeIds.length === 0) return true;

  const { data, error } = await supabase
    .from("recipes")
    .select("id")
    .in("id", recipeIds)
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string }>;
  return new Set(rows.map((row) => row.id)).size === recipeIds.length;
}

async function loadMealTemplate(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  templateId: string,
) {
  const { data, error } = await supabase
    .from("meal_templates")
    .select(
      "id,user_id,name,icon,total_calories,total_carbs_g,total_protein_g,total_fat_g,metadata,is_active,created_at,updated_at,meal_template_items(id,meal_template_id,item_type,food_id,recipe_id,custom_name,quantity,serving_unit,serving_grams,snapshot_name,snapshot_brand_name,snapshot_calories,snapshot_carbs_g,snapshot_protein_g,snapshot_fat_g,metadata,sort_order,created_at,updated_at)",
    )
    .eq("id", templateId)
    .maybeSingle();

  if (error) throw error;
  return data ? sortTemplateItems(data as MealTemplateWithItems) : null;
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client not initialized" },
      { status: 500 },
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  const { data, error } = await supabase
    .from("meal_templates")
    .select(
      "id,user_id,name,icon,total_calories,total_carbs_g,total_protein_g,total_fat_g,metadata,is_active,created_at,updated_at,meal_template_items(id,meal_template_id,item_type,food_id,recipe_id,custom_name,quantity,serving_unit,serving_grams,snapshot_name,snapshot_brand_name,snapshot_calories,snapshot_carbs_g,snapshot_protein_g,snapshot_fat_g,metadata,sort_order,created_at,updated_at)",
    )
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    return databaseErrorResponse("Unable to load meals", error);
  }

  return NextResponse.json({
    meals: ((data ?? []) as MealTemplateWithItems[]).map(mapTemplateForClient),
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client not initialized" },
      { status: 500 },
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseNutritionMealTemplateDraft(payload);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const foodsValid = await verifyFoodIds(supabase, parsed.value.foodIds);
    if (!foodsValid) {
      return NextResponse.json(
        { error: "One or more food items are unavailable" },
        { status: 400 },
      );
    }

    const recipesValid = await verifyRecipeIds(
      supabase,
      user.id,
      parsed.value.recipeIds,
    );
    if (!recipesValid) {
      return NextResponse.json(
        { error: "One or more recipes are unavailable" },
        { status: 400 },
      );
    }

    const mealTemplateTable = (
      supabase as unknown as {
        from: (table: "meal_templates") => MealTemplateWriteTable;
      }
    ).from("meal_templates");
    const mealTemplateItemsTable = (
      supabase as unknown as {
        from: (table: "meal_template_items") => MealTemplateItemsWriteTable;
      }
    ).from("meal_template_items");
    const { data: createdTemplate, error: createTemplateError } =
      await mealTemplateTable
      .insert({
        user_id: user.id,
        name: parsed.value.template.name,
        icon: parsed.value.template.icon,
        total_calories: parsed.value.totals.total_calories,
        total_carbs_g: parsed.value.totals.total_carbs_g,
        total_protein_g: parsed.value.totals.total_protein_g,
        total_fat_g: parsed.value.totals.total_fat_g,
        metadata: parsed.value.template.metadata,
      })
      .select("id")
      .single();

    if (createTemplateError || !createdTemplate) {
      return databaseErrorResponse("Unable to create meal", createTemplateError);
    }

    const templateId = createdTemplate.id;
    const templateItems: MealTemplateItemInsert[] = parsed.value.items.map((item) => ({
      meal_template_id: templateId,
      item_type: item.item_type,
      food_id: item.food_id ?? null,
      recipe_id: item.recipe_id ?? null,
      custom_name: item.custom_name ?? null,
      quantity: item.quantity,
      serving_unit: item.serving_unit ?? null,
      serving_grams: item.serving_grams ?? null,
      snapshot_name: item.snapshot_name,
      snapshot_brand_name: item.snapshot_brand_name ?? null,
      snapshot_calories: item.snapshot_calories,
      snapshot_carbs_g: item.snapshot_carbs_g,
      snapshot_protein_g: item.snapshot_protein_g,
      snapshot_fat_g: item.snapshot_fat_g,
      metadata: item.metadata as Json,
      sort_order: item.sort_order,
    }));

    const { error: createItemsError } =
      await mealTemplateItemsTable.insert(templateItems);

    if (createItemsError) {
      await mealTemplateTable.delete().eq("id", templateId);
      return databaseErrorResponse("Unable to create meal", createItemsError);
    }

    const template = await loadMealTemplate(supabase, templateId);
    if (!template) {
      return databaseErrorResponse("Unable to load created meal", { templateId });
    }

    return NextResponse.json(
      { meal: mapTemplateForClient(template) },
      { status: 201 },
    );
  } catch (error) {
    return databaseErrorResponse("Unable to create meal", error);
  }
}
