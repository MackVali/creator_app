import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  getFoodBrowsePlacements,
  normalizeFoodBrowseAisle,
  normalizeFoodBrowseDepartment,
  normalizeFoodSearchText,
  type FoodBrowsePlacement,
  type FoodSearchResult,
} from "@/lib/nutrition/foods";
import type { Json } from "@/types/supabase";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 8;
const DEFAULT_BROWSE_LIMIT = 25;
const MAX_LIMIT = 50;
const MAX_SEARCH_FETCH_LIMIT = 80;
const MAX_BROWSE_FETCH_LIMIT = 300;

type FoodSearchRow = FoodSearchResult & {
  normalized_name: string;
  normalized_brand_name: string | null;
  source?: string | null;
  metadata?: Json | null;
};

function parseLimit(value: string | null, fallback = DEFAULT_LIMIT) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)));
}

function toNullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeFoodResultServingUnit(
  value: string | null | undefined,
  servingSize: number | null,
  servingGrams: number | null,
) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return null;

  const aliases: Record<string, string> = {
    gram: "g",
    grams: "g",
    ounce: "oz",
    ounces: "oz",
    pound: "lb",
    pounds: "lb",
    tablespoon: "tbsp",
    tablespoons: "tbsp",
    teaspoon: "tsp",
    teaspoons: "tsp",
    "fluid ounce": "fl oz",
    "fluid ounces": "fl oz",
    milliliter: "ml",
    milliliters: "ml",
  };
  const unit = aliases[normalized] ?? normalized;

  if (["g", "oz", "lb", "tsp", "tbsp", "cup", "ml", "fl oz", "serving"].includes(unit)) {
    return unit;
  }

  return servingSize && servingGrams ? "serving" : null;
}

function mapFoodRow(
  row: FoodSearchRow,
  browsePlacement?: FoodBrowsePlacement,
): FoodSearchResult {
  const servingSize = toNullableNumber(row.serving_size);
  const servingGrams = toNullableNumber(row.serving_grams);

  return {
    id: row.id,
    name: row.name,
    brand_name: row.brand_name,
    source: row.source ?? null,
    serving_size: servingSize,
    serving_unit: normalizeFoodResultServingUnit(row.serving_unit, servingSize, servingGrams),
    serving_grams: servingGrams,
    calories: toNullableNumber(row.calories),
    carbs_g: toNullableNumber(row.carbs_g),
    protein_g: toNullableNumber(row.protein_g),
    fat_g: toNullableNumber(row.fat_g),
    browse_department: browsePlacement?.department ?? null,
    browse_aisle: browsePlacement?.aisle ?? null,
    metadata: row.metadata ?? null,
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
  const mode = searchParams.get("mode");
  const normalizedQuery = normalizeFoodSearchText(searchParams.get("q"));
  const limit = parseLimit(
    searchParams.get("limit"),
    mode === "browse" ? DEFAULT_BROWSE_LIMIT : DEFAULT_LIMIT,
  );

  if (mode === "browse") {
    const department =
      normalizeFoodBrowseDepartment(searchParams.get("department")) ?? "Everyday";
    const aisle =
      normalizeFoodBrowseAisle(searchParams.get("aisle")) ?? "Breakfast basics";
    const fetchLimit = Math.min(MAX_BROWSE_FETCH_LIMIT, limit * 12);
    const { data, error } = await supabase
      .from("foods")
      .select(
        "id,name,brand_name,serving_size,serving_unit,serving_grams,calories,carbs_g,protein_g,fat_g,normalized_name,normalized_brand_name,source,metadata",
      )
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(fetchLimit);

    if (error) {
      console.error("Failed to browse nutrition foods", { error });
      return NextResponse.json({ error: "Unable to browse foods" }, { status: 500 });
    }

    const foods = ((data ?? []) as FoodSearchRow[])
      .map((row) => ({
        row,
        placement: getFoodBrowsePlacements(row).find(
          (placement) =>
            placement.department === department && placement.aisle === aisle,
        ),
      }))
      .filter(
        (match): match is { row: FoodSearchRow; placement: FoodBrowsePlacement } =>
          Boolean(match.placement),
      )
      .slice(0, limit)
      .map(({ row, placement }) => mapFoodRow(row, placement));

    return NextResponse.json({ foods });
  }

  if (normalizedQuery.length < 2) {
    return NextResponse.json({ foods: [] satisfies FoodSearchResult[] });
  }

  const fetchLimit = Math.min(MAX_SEARCH_FETCH_LIMIT, limit * 4);
  const pattern = `%${normalizedQuery.split(" ").filter(Boolean).join("%")}%`;
  const { data, error } = await supabase
    .from("foods")
    .select(
      "id,name,brand_name,serving_size,serving_unit,serving_grams,calories,carbs_g,protein_g,fat_g,normalized_name,normalized_brand_name,source,metadata",
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
    .map((row) => mapFoodRow(row));

  return NextResponse.json({ foods });
}
