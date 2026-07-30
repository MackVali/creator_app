import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  getRecipeWriteTables,
  loadRecipe,
  makeRecipeItemInserts,
  mapRecipeForClient,
  parseCanonicalRecipeDraft,
} from "@/lib/nutrition/recipeServer";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

function databaseErrorResponse(message: string, error: unknown) {
  console.error(message, { error });
  return NextResponse.json({ error: message }, { status: 500 });
}

async function authenticate() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      response: NextResponse.json(
        { error: "Supabase client not initialized" },
        { status: 500 },
      ),
    };
  }
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  return { supabase, user };
}

export async function GET(_request: NextRequest, context: Context) {
  const session = await authenticate();
  if ("response" in session) return session.response;
  const { id } = await context.params;

  try {
    const recipe = await loadRecipe(session.supabase, id);
    if (!recipe || recipe.user_id !== session.user.id) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }
    return NextResponse.json({ recipe: mapRecipeForClient(recipe) });
  } catch (error) {
    return databaseErrorResponse("Unable to load recipe", error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  const session = await authenticate();
  if ("response" in session) return session.response;
  const { id } = await context.params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payloadRecord =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};

  try {
    const existing = await loadRecipe(session.supabase, id);
    if (!existing || existing.user_id !== session.user.id) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    const { recipeTable, recipeItemsTable } = getRecipeWriteTables(session.supabase);

    if (payloadRecord.action === "archive") {
      const { data, error } = await recipeTable
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", session.user.id)
        .select("id")
        .maybeSingle();
      if (error) return databaseErrorResponse("Unable to archive recipe", error);
      if (!data) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
      return NextResponse.json({ recipe: { ...mapRecipeForClient(existing), is_active: false } });
    }

    const parsed = await parseCanonicalRecipeDraft(session.supabase, session.user.id, payload);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { data: updatedRecipe, error: updateRecipeError } = await recipeTable
      .update({
        name: parsed.value.recipe.name,
        icon: parsed.value.recipe.icon,
        description: parsed.value.recipe.description ?? null,
        servings: parsed.value.recipe.servings,
        total_calories: parsed.value.totals.total_calories,
        total_carbs_g: parsed.value.totals.total_carbs_g,
        total_protein_g: parsed.value.totals.total_protein_g,
        total_fat_g: parsed.value.totals.total_fat_g,
        metadata: parsed.value.recipe.metadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", session.user.id)
      .select("id")
      .maybeSingle();

    if (updateRecipeError || !updatedRecipe) {
      return databaseErrorResponse("Unable to update recipe", updateRecipeError);
    }

    const { error: deleteItemsError } = await recipeItemsTable.delete().eq("recipe_id", id);
    if (deleteItemsError) {
      return databaseErrorResponse("Unable to update recipe items", deleteItemsError);
    }

    const { error: insertItemsError } = await recipeItemsTable.insert(
      makeRecipeItemInserts(id, parsed.value.items),
    );
    if (insertItemsError) {
      return databaseErrorResponse("Unable to update recipe items", insertItemsError);
    }

    const recipe = await loadRecipe(session.supabase, id);
    if (!recipe) return databaseErrorResponse("Unable to load updated recipe", { id });
    return NextResponse.json({ recipe: mapRecipeForClient(recipe) });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Unable to update recipe";
    if (
      message === "Grocery item is unavailable." ||
      message === "Complete food details before adding this Grocery item." ||
      message === "Grocery item does not match the selected food."
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return databaseErrorResponse("Unable to update recipe", error);
  }
}
