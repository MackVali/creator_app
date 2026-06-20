import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  normalizeFoodSearchText,
  type FoodSearchResult,
} from "@/lib/nutrition/foods";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

type FoodSearchRow = FoodSearchResult & {
  normalized_name: string;
  normalized_brand_name: string | null;
};

function parseLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)));
}

function toNullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapFoodRow(row: FoodSearchRow): FoodSearchResult {
  return {
    id: row.id,
    name: row.name,
    brand_name: row.brand_name,
    serving_size: toNullableNumber(row.serving_size),
    serving_unit: row.serving_unit,
    serving_grams: toNullableNumber(row.serving_grams),
    calories: toNullableNumber(row.calories),
    carbs_g: toNullableNumber(row.carbs_g),
    protein_g: toNullableNumber(row.protein_g),
    fat_g: toNullableNumber(row.fat_g),
  };
}

function getFoodSearchRank(row: FoodSearchRow, normalizedQuery: string) {
  const normalizedBrand = row.normalized_brand_name ?? "";

  if (row.normalized_name === normalizedQuery) return 0;
  if (normalizedBrand === normalizedQuery) return 1;
  if (row.normalized_name.startsWith(normalizedQuery)) return 2;
  if (normalizedBrand.startsWith(normalizedQuery)) return 3;
  if (row.normalized_name.includes(normalizedQuery)) return 4;
  if (normalizedBrand.includes(normalizedQuery)) return 5;

  return 6;
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

  const searchParams = request.nextUrl.searchParams;
  const normalizedQuery = normalizeFoodSearchText(searchParams.get("q"));
  const limit = parseLimit(searchParams.get("limit"));

  if (normalizedQuery.length < 2) {
    return NextResponse.json({ foods: [] satisfies FoodSearchResult[] });
  }

  const fetchLimit = Math.min(MAX_LIMIT * 4, limit * 4);
  const pattern = `%${normalizedQuery.split(" ").filter(Boolean).join("%")}%`;
  const { data, error } = await supabase
    .from("foods")
    .select(
      "id,name,brand_name,serving_size,serving_unit,serving_grams,calories,carbs_g,protein_g,fat_g,normalized_name,normalized_brand_name",
    )
    .eq("is_active", true)
    .or(`normalized_name.ilike.${pattern},normalized_brand_name.ilike.${pattern}`)
    .order("name", { ascending: true })
    .limit(fetchLimit);

  if (error) {
    console.error("Failed to search nutrition foods", { error });
    return NextResponse.json({ error: "Unable to search foods" }, { status: 500 });
  }

  const foods = ((data ?? []) as FoodSearchRow[])
    .sort((a, b) => {
      const rankDelta =
        getFoodSearchRank(a, normalizedQuery) - getFoodSearchRank(b, normalizedQuery);
      if (rankDelta !== 0) return rankDelta;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit)
    .map(mapFoodRow);

  return NextResponse.json({ foods });
}
