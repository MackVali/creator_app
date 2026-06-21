import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 25;

type RecipeSearchRow = {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  servings: number | string | null;
  total_calories: number | string | null;
  total_carbs_g: number | string | null;
  total_protein_g: number | string | null;
  total_fat_g: number | string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

function parseLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)));
}

function normalizeRecipeSearchText(value: string | null) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function toNullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const query = normalizeRecipeSearchText(request.nextUrl.searchParams.get("q"));
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));

  if (query.length < 2) {
    return NextResponse.json({ recipes: [] });
  }

  const pattern = `%${query.split(" ").filter(Boolean).join("%")}%`;
  const { data, error } = await supabase
    .from("recipes")
    .select(
      "id,name,icon,description,servings,total_calories,total_carbs_g,total_protein_g,total_fat_g,metadata,created_at,updated_at",
    )
    .eq("user_id", user.id)
    .eq("is_active", true)
    .ilike("name", pattern)
    .order("name", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("Failed to search nutrition recipes", { error });
    return NextResponse.json({ error: "Unable to search recipes" }, { status: 500 });
  }

  const recipes = (data ?? []) as RecipeSearchRow[];

  return NextResponse.json({
    recipes: recipes.map((recipe) => ({
      ...recipe,
      servings: toNullableNumber(recipe.servings) ?? 1,
      total_calories: toNullableNumber(recipe.total_calories) ?? 0,
      total_carbs_g: toNullableNumber(recipe.total_carbs_g) ?? 0,
      total_protein_g: toNullableNumber(recipe.total_protein_g) ?? 0,
      total_fat_g: toNullableNumber(recipe.total_fat_g) ?? 0,
    })),
  });
}
