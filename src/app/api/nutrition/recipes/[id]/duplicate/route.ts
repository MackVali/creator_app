import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  getRecipeWriteTables,
  loadRecipe,
  makeRecipeItemInserts,
  mapRecipeForClient,
} from "@/lib/nutrition/recipeServer";
import type { NutritionMealRpcItem } from "@/lib/nutrition/meals";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

function databaseErrorResponse(message: string, error: unknown) {
  console.error(message, { error });
  return NextResponse.json({ error: message }, { status: 500 });
}

function toRpcItems(recipeId: string, recipeItems: NonNullable<Awaited<ReturnType<typeof loadRecipe>>>["recipe_items"]): NutritionMealRpcItem[] {
  void recipeId;
  return [...(recipeItems ?? [])].map((item, index) => ({
    item_type: "food",
    food_id: item.food_id ?? undefined,
    quantity: Number(item.quantity) || 1,
    serving_unit: item.serving_unit ?? undefined,
    serving_grams: item.serving_grams == null ? undefined : Number(item.serving_grams),
    snapshot_name: item.snapshot_name,
    snapshot_brand_name: item.snapshot_brand_name ?? undefined,
    snapshot_calories: Number(item.snapshot_calories) || 0,
    snapshot_carbs_g: Number(item.snapshot_carbs_g) || 0,
    snapshot_protein_g: Number(item.snapshot_protein_g) || 0,
    snapshot_fat_g: Number(item.snapshot_fat_g) || 0,
    metadata:
      item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
        ? item.metadata
        : {},
    sort_order: index,
  }));
}

export async function POST(_request: NextRequest, context: Context) {
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
  const { id } = await context.params;

  try {
    const source = await loadRecipe(supabase, id);
    if (!source || source.user_id !== user.id || !source.is_active) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }
    const { recipeTable, recipeItemsTable } = getRecipeWriteTables(supabase);
    const { data: createdRecipe, error: createError } = await recipeTable
      .insert({
        user_id: user.id,
        name: `${source.name} Copy`.slice(0, 160),
        icon: source.icon,
        description: source.description,
        servings: source.servings,
        total_calories: source.total_calories,
        total_carbs_g: source.total_carbs_g,
        total_protein_g: source.total_protein_g,
        total_fat_g: source.total_fat_g,
        metadata: {
          ...(source.metadata &&
          typeof source.metadata === "object" &&
          !Array.isArray(source.metadata)
            ? source.metadata
            : {}),
          duplicated_from_recipe_id: source.id,
        },
      })
      .select("id")
      .single();
    if (createError || !createdRecipe) {
      return databaseErrorResponse("Unable to duplicate recipe", createError);
    }
    const newRecipeId = createdRecipe.id;
    const { error: itemError } = await recipeItemsTable.insert(
      makeRecipeItemInserts(newRecipeId, toRpcItems(newRecipeId, source.recipe_items)),
    );
    if (itemError) {
      await recipeTable.delete().eq("id", newRecipeId);
      return databaseErrorResponse("Unable to duplicate recipe", itemError);
    }
    const recipe = await loadRecipe(supabase, newRecipeId);
    if (!recipe) {
      return databaseErrorResponse("Unable to load duplicated recipe", { newRecipeId });
    }
    return NextResponse.json({ recipe: mapRecipeForClient(recipe) }, { status: 201 });
  } catch (error) {
    return databaseErrorResponse("Unable to duplicate recipe", error);
  }
}
