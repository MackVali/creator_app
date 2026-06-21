import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  DEFAULT_NUTRITION_RECIPE_ICON,
  parseNutritionRecipeDraft,
  sanitizeNutritionRecipeIcon,
  type NutritionRecipeItemRow,
  type NutritionRecipeRow,
} from "@/lib/nutrition/meals";
import type { Database, Json } from "@/types/supabase";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

type RecipeWithItems = NutritionRecipeRow & {
  recipe_items?: NutritionRecipeItemRow[] | null;
};
type RecipeInsert = Database["public"]["Tables"]["recipes"]["Insert"];
type RecipeItemInsert = Database["public"]["Tables"]["recipe_items"]["Insert"];
type RecipeWriteTable = {
  insert: (value: RecipeInsert) => {
    select: (columns: string) => {
      single: () => Promise<{ data: { id: string } | null; error: unknown }>;
    };
  };
  delete: () => {
    eq: (column: "id", value: string) => Promise<{ error: unknown }>;
  };
};
type RecipeItemsWriteTable = {
  insert: (value: RecipeItemInsert[]) => Promise<{ error: unknown }>;
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

function sortRecipeItems(recipe: RecipeWithItems): RecipeWithItems {
  return {
    ...recipe,
    recipe_items: [...(recipe.recipe_items ?? [])].sort((a, b) => {
      const orderDelta = a.sort_order - b.sort_order;
      if (orderDelta !== 0) return orderDelta;
      return a.created_at.localeCompare(b.created_at);
    }),
  };
}

function mapRecipeForClient(recipe: RecipeWithItems) {
  const sortedRecipe = sortRecipeItems(recipe);

  return {
    ...sortedRecipe,
    icon: sanitizeNutritionRecipeIcon(
      "icon" in sortedRecipe ? sortedRecipe.icon : DEFAULT_NUTRITION_RECIPE_ICON,
    ),
    recipe_items: sortedRecipe.recipe_items ?? [],
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

async function loadRecipe(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  recipeId: string,
) {
  const { data, error } = await supabase
    .from("recipes")
    .select(
      "id,user_id,name,icon,description,servings,total_calories,total_carbs_g,total_protein_g,total_fat_g,metadata,is_active,created_at,updated_at,recipe_items(id,recipe_id,item_type,food_id,custom_name,quantity,serving_unit,serving_grams,snapshot_name,snapshot_brand_name,snapshot_calories,snapshot_carbs_g,snapshot_protein_g,snapshot_fat_g,metadata,sort_order,created_at,updated_at)",
    )
    .eq("id", recipeId)
    .maybeSingle();

  if (error) throw error;
  return data ? sortRecipeItems(data as RecipeWithItems) : null;
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
    .from("recipes")
    .select(
      "id,user_id,name,icon,description,servings,total_calories,total_carbs_g,total_protein_g,total_fat_g,metadata,is_active,created_at,updated_at,recipe_items(id,recipe_id,item_type,food_id,custom_name,quantity,serving_unit,serving_grams,snapshot_name,snapshot_brand_name,snapshot_calories,snapshot_carbs_g,snapshot_protein_g,snapshot_fat_g,metadata,sort_order,created_at,updated_at)",
    )
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    return databaseErrorResponse("Unable to load recipes", error);
  }

  return NextResponse.json({
    recipes: ((data ?? []) as RecipeWithItems[]).map(mapRecipeForClient),
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

  const parsed = parseNutritionRecipeDraft(payload);
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

    const recipeTable = (
      supabase as unknown as {
        from: (table: "recipes") => RecipeWriteTable;
      }
    ).from("recipes");
    const recipeItemsTable = (
      supabase as unknown as {
        from: (table: "recipe_items") => RecipeItemsWriteTable;
      }
    ).from("recipe_items");

    const { data: createdRecipe, error: createRecipeError } = await recipeTable
      .insert({
        user_id: user.id,
        name: parsed.value.recipe.name,
        icon: parsed.value.recipe.icon,
        description: parsed.value.recipe.description ?? null,
        servings: parsed.value.recipe.servings,
        total_calories: parsed.value.totals.total_calories,
        total_carbs_g: parsed.value.totals.total_carbs_g,
        total_protein_g: parsed.value.totals.total_protein_g,
        total_fat_g: parsed.value.totals.total_fat_g,
        metadata: parsed.value.recipe.metadata,
      })
      .select("id")
      .single();

    if (createRecipeError || !createdRecipe) {
      return databaseErrorResponse("Unable to create recipe", createRecipeError);
    }

    const recipeId = createdRecipe.id;
    const recipeItems: RecipeItemInsert[] = parsed.value.items.map((item) => ({
      recipe_id: recipeId,
      item_type: "food",
      food_id: item.food_id ?? null,
      custom_name: null,
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

    const { error: createItemsError } = await recipeItemsTable.insert(recipeItems);

    if (createItemsError) {
      await recipeTable.delete().eq("id", recipeId);
      return databaseErrorResponse("Unable to create recipe", createItemsError);
    }

    const recipe = await loadRecipe(supabase, recipeId);
    if (!recipe) {
      return databaseErrorResponse("Unable to load created recipe", { recipeId });
    }

    return NextResponse.json(
      { recipe: mapRecipeForClient(recipe) },
      { status: 201 },
    );
  } catch (error) {
    return databaseErrorResponse("Unable to create recipe", error);
  }
}
