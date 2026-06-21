import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  parseNutritionMealDraft,
  type NutritionMealItemRow,
  type NutritionMealRow,
} from "@/lib/nutrition/meals";
import type { Json } from "@/types/supabase";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

type MealWithItems = NutritionMealRow & {
  meal_items?: NutritionMealItemRow[] | null;
};

function parseLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)));
}

function parseDateParam(value: string | null, field: string) {
  if (!value) return { ok: true as const, value: undefined };
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: `${field} must be a valid date` },
        { status: 400 },
      ),
    };
  }
  return { ok: true as const, value: parsedDate.toISOString() };
}

function databaseErrorResponse(message: string, error: unknown) {
  console.error(message, { error });
  return NextResponse.json({ error: message }, { status: 500 });
}

function sortMealItems(meal: MealWithItems): MealWithItems {
  return {
    ...meal,
    meal_items: [...(meal.meal_items ?? [])].sort((a, b) => {
      const orderDelta = a.sort_order - b.sort_order;
      if (orderDelta !== 0) return orderDelta;
      return a.created_at.localeCompare(b.created_at);
    }),
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

async function verifyOptionalSourceLinks(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  userId: string,
  sourceNoteId?: string,
  habitId?: string,
) {
  if (sourceNoteId) {
    const { data, error } = await supabase
      .from("notes")
      .select("id")
      .eq("id", sourceNoteId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return false;
  }

  if (habitId) {
    const { data, error } = await supabase
      .from("habits")
      .select("id")
      .eq("id", habitId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return false;
  }

  return true;
}

async function loadMeal(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  mealId: string,
) {
  const { data, error } = await supabase
    .from("meals")
    .select(
      "id,user_id,occurred_at,timezone,name,note,source_note_id,source_note_entry_id,habit_id,total_calories,total_carbs_g,total_protein_g,total_fat_g,metadata,deleted_at,created_at,updated_at,meal_items(id,meal_id,item_type,food_id,recipe_id,custom_name,quantity,serving_unit,serving_grams,snapshot_name,snapshot_brand_name,snapshot_calories,snapshot_carbs_g,snapshot_protein_g,snapshot_fat_g,metadata,sort_order,created_at,updated_at)",
    )
    .eq("id", mealId)
    .maybeSingle();

  if (error) throw error;
  return data ? sortMealItems(data as MealWithItems) : null;
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
  const before = request.nextUrl.searchParams.get("before");
  const start = parseDateParam(request.nextUrl.searchParams.get("start"), "start");
  if (!start.ok) return start.response;
  const end = parseDateParam(request.nextUrl.searchParams.get("end"), "end");
  if (!end.ok) return end.response;

  let query = supabase
    .from("meals")
    .select(
      "id,user_id,occurred_at,timezone,name,note,source_note_id,source_note_entry_id,habit_id,total_calories,total_carbs_g,total_protein_g,total_fat_g,metadata,deleted_at,created_at,updated_at,meal_items(id,meal_id,item_type,food_id,recipe_id,custom_name,quantity,serving_unit,serving_grams,snapshot_name,snapshot_brand_name,snapshot_calories,snapshot_carbs_g,snapshot_protein_g,snapshot_fat_g,metadata,sort_order,created_at,updated_at)",
    )
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (before) {
    const beforeDate = new Date(before);
    if (Number.isNaN(beforeDate.getTime())) {
      return NextResponse.json({ error: "before must be a valid date" }, { status: 400 });
    }
    query = query.lt("occurred_at", beforeDate.toISOString());
  }
  if (start.value) {
    query = query.gte("occurred_at", start.value);
  }
  if (end.value) {
    query = query.lt("occurred_at", end.value);
  }

  const { data, error } = await query;

  if (error) {
    return databaseErrorResponse("Unable to load nutrition meals", error);
  }

  return NextResponse.json({
    meals: ((data ?? []) as MealWithItems[]).map(sortMealItems),
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

  const parsed = parseNutritionMealDraft(payload);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const sourceLinksValid = await verifyOptionalSourceLinks(
      supabase,
      user.id,
      parsed.value.meal.source_note_id,
      parsed.value.meal.habit_id,
    );

    if (!sourceLinksValid) {
      return NextResponse.json(
        { error: "sourceNoteId or habitId does not belong to the authenticated user" },
        { status: 400 },
      );
    }

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

    const nutritionRpcClient = supabase as unknown as {
      rpc: (
        functionName: "create_nutrition_meal",
        args: { p_meal: Json; p_items: Json },
      ) => Promise<{ data: NutritionMealRow | null; error: unknown }>;
    };

    const { data: createdMeal, error: createError } = await nutritionRpcClient.rpc(
      "create_nutrition_meal",
      {
        p_meal: parsed.value.meal as Json,
        p_items: parsed.value.items as unknown as Json,
      },
    );

    if (createError) {
      return databaseErrorResponse("Unable to create nutrition meal", createError);
    }

    const mealId = createdMeal?.id;
    if (!mealId) {
      return databaseErrorResponse("Unable to create nutrition meal", {
        reason: "Missing created meal id",
      });
    }

    const meal = await loadMeal(supabase, mealId);
    if (!meal) {
      return databaseErrorResponse("Unable to load created nutrition meal", {
        mealId,
      });
    }

    return NextResponse.json({ meal }, { status: 201 });
  } catch (error) {
    return databaseErrorResponse("Unable to create nutrition meal", error);
  }
}
