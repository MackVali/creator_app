import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  getRecipeWriteTables,
  loadRecipe,
  makeRecipeItemInserts,
  mapRecipeForClient,
  parseCanonicalRecipeDraft,
  RECIPE_SELECT,
} from "@/lib/nutrition/recipeServer";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parseLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)));
}

function databaseErrorResponse(message: string, error: unknown) {
  console.error(message, { error });
  return NextResponse.json({ error: message }, { status: 500 });
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
    .select(RECIPE_SELECT)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    return databaseErrorResponse("Unable to load recipes", error);
  }

  return NextResponse.json({
    recipes: ((data ?? []) as Parameters<typeof mapRecipeForClient>[0][]).map(mapRecipeForClient),
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

  try {
    const parsed = await parseCanonicalRecipeDraft(supabase, user.id, payload);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { recipeTable, recipeItemsTable } = getRecipeWriteTables(supabase);

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
    const recipeItems = makeRecipeItemInserts(recipeId, parsed.value.items);

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
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Unable to create recipe";
    if (
      message === "Grocery item is unavailable." ||
      message === "Complete food details before adding this Grocery item." ||
      message === "Grocery item does not match the selected food."
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return databaseErrorResponse("Unable to create recipe", error);
  }
}
