import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildFoodInsertFromOwnedResource,
  toNullableRecipeNumber,
} from "@/lib/nutrition/recipes";
import {
  parseNutritionRecipeDraft,
  sanitizeNutritionRecipeIcon,
  DEFAULT_NUTRITION_RECIPE_ICON,
  type NutritionMealRpcItem,
  type NutritionRecipeItemRow,
  type NutritionRecipeRow,
} from "@/lib/nutrition/meals";
import type { Database, Json } from "@/types/supabase";

export const RECIPE_SELECT =
  "id,user_id,name,icon,description,servings,total_calories,total_carbs_g,total_protein_g,total_fat_g,metadata,is_active,created_at,updated_at,recipe_items(id,recipe_id,item_type,food_id,custom_name,quantity,serving_unit,serving_grams,snapshot_name,snapshot_brand_name,snapshot_calories,snapshot_carbs_g,snapshot_protein_g,snapshot_fat_g,metadata,sort_order,created_at,updated_at)";

type SupabaseServer = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
type RecipeWithItems = NutritionRecipeRow & {
  icon?: string | null;
  recipe_items?: NutritionRecipeItemRow[] | null;
};
type RecipeInsert = Database["public"]["Tables"]["recipes"]["Insert"] & {
  icon?: string | null;
};
type RecipeUpdate = Database["public"]["Tables"]["recipes"]["Update"] & {
  icon?: string | null;
};
type RecipeItemInsert = Database["public"]["Tables"]["recipe_items"]["Insert"];
type FoodInsert = Database["public"]["Tables"]["foods"]["Insert"];

type RecipeWriteTable = {
  insert: (value: RecipeInsert) => {
    select: (columns: string) => {
      single: () => Promise<{ data: { id: string } | null; error: unknown }>;
    };
  };
  update: (value: RecipeUpdate) => {
    eq: (column: string, value: string) => {
      eq: (column: string, value: string) => {
        select: (columns: string) => {
          maybeSingle: () => Promise<{ data: { id: string } | null; error: unknown }>;
        };
      };
      select: (columns: string) => {
        maybeSingle: () => Promise<{ data: { id: string } | null; error: unknown }>;
      };
    };
  };
  delete: () => {
    eq: (column: "id", value: string) => Promise<{ error: unknown }>;
  };
};
type RecipeItemsWriteTable = {
  insert: (value: RecipeItemInsert[]) => Promise<{ error: unknown }>;
  delete: () => {
    eq: (column: "recipe_id", value: string) => Promise<{ error: unknown }>;
  };
};
type FoodResourceRow = Pick<
  Database["public"]["Tables"]["food_resources"]["Row"],
  "id" | "user_id" | "food_id" | "name" | "brand_name" | "status" | "metadata"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getMetadataFoodResourceId(item: Record<string, unknown>) {
  if (typeof item.foodResourceId === "string" && item.foodResourceId.trim()) {
    return item.foodResourceId.trim();
  }
  const metadata = isRecord(item.metadata) ? item.metadata : {};
  return typeof metadata.foodResourceId === "string" && metadata.foodResourceId.trim()
    ? metadata.foodResourceId.trim()
    : null;
}

function sortRecipeItems(recipe: RecipeWithItems): RecipeWithItems {
  return {
    ...recipe,
    recipe_items: [...(recipe.recipe_items ?? [])].sort((a, b) => {
      const orderDelta = Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
      if (orderDelta !== 0) return orderDelta;
      return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
    }),
  };
}

export function mapRecipeForClient(recipe: RecipeWithItems) {
  const sortedRecipe = sortRecipeItems(recipe);
  return {
    ...sortedRecipe,
    icon: sanitizeNutritionRecipeIcon(
      "icon" in sortedRecipe ? sortedRecipe.icon : DEFAULT_NUTRITION_RECIPE_ICON,
    ),
    recipe_items: sortedRecipe.recipe_items ?? [],
  };
}

export async function verifyFoodIds(supabase: SupabaseServer, foodIds: string[]) {
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

export async function loadRecipe(supabase: SupabaseServer, recipeId: string) {
  const { data, error } = await supabase
    .from("recipes")
    .select(RECIPE_SELECT)
    .eq("id", recipeId)
    .maybeSingle();
  if (error) throw error;
  return data ? sortRecipeItems(data as RecipeWithItems) : null;
}

async function loadOwnedFoodResource(
  supabase: SupabaseServer,
  userId: string,
  foodResourceId: string,
) {
  const { data, error } = await supabase
    .from("food_resources")
    .select("id,user_id,food_id,name,brand_name,status,metadata")
    .eq("id", foodResourceId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as FoodResourceRow | null;
}

async function findExistingPromotedFood(foodInsert: FoodInsert) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Food promotion is unavailable.");
  if (foodInsert.normalized_barcode) {
    const { data, error } = await admin
      .from("foods")
      .select("id")
      .eq("normalized_barcode", foodInsert.normalized_barcode)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) return data.id;
  }
  if (foodInsert.external_source && foodInsert.external_id) {
    const { data, error } = await admin
      .from("foods")
      .select("id")
      .eq("external_source", foodInsert.external_source)
      .eq("external_id", foodInsert.external_id)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) return data.id;
  }
  if (foodInsert.dedupe_key) {
    const { data, error } = await admin
      .from("foods")
      .select("id")
      .eq("dedupe_key", foodInsert.dedupe_key)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) return data.id;
  }
  return null;
}

async function promoteFoodResourceToFood(
  supabase: SupabaseServer,
  userId: string,
  resource: FoodResourceRow,
) {
  if (resource.food_id) return resource.food_id;
  const foodInsert = buildFoodInsertFromOwnedResource(resource, userId);
  if (!foodInsert) {
    throw new Error("Complete food details before adding this Grocery item.");
  }
  const admin = createAdminClient();
  if (!admin) throw new Error("Food promotion is unavailable.");
  const existingId = await findExistingPromotedFood(foodInsert);
  const foodId = existingId ?? await (async () => {
    const { data, error } = await admin
      .from("foods")
      .insert(foodInsert as never)
      .select("id")
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  })();
  const { error: updateError } = await supabase
    .from("food_resources")
    .update({ food_id: foodId, updated_at: new Date().toISOString() } as never)
    .eq("id", resource.id)
    .eq("user_id", userId);
  if (updateError) throw updateError;
  return foodId;
}

export async function canonicalizeRecipePayload(
  supabase: SupabaseServer,
  userId: string,
  payload: unknown,
) {
  if (!isRecord(payload) || !Array.isArray(payload.items)) return payload;
  const items = [];
  for (const rawItem of payload.items) {
    if (!isRecord(rawItem) || rawItem.type !== "food") {
      items.push(rawItem);
      continue;
    }
    const foodResourceId = getMetadataFoodResourceId(rawItem);
    let foodId = typeof rawItem.foodId === "string" && rawItem.foodId.trim()
      ? rawItem.foodId.trim()
      : null;
    let foodResourceMetadata: Record<string, unknown> = {};
    if (foodResourceId) {
      const resource = await loadOwnedFoodResource(supabase, userId, foodResourceId);
      if (!resource) throw new Error("Grocery item is unavailable.");
      foodResourceMetadata = {
        foodResourceId: resource.id,
        foodResourceFoodIdBeforeSave: resource.food_id,
      };
      if (resource.food_id) {
        if (foodId && foodId !== resource.food_id) {
          throw new Error("Grocery item does not match the selected food.");
        }
        foodId = resource.food_id;
      } else {
        foodId = await promoteFoodResourceToFood(supabase, userId, resource);
      }
    }
    items.push({
      ...rawItem,
      foodId,
      metadata: {
        ...(isRecord(rawItem.metadata) ? rawItem.metadata : {}),
        ...foodResourceMetadata,
        ...(foodResourceId ? { foodResourceId } : {}),
        ...(foodId ? { catalogFoodId: foodId } : {}),
      },
    });
  }
  return { ...payload, items };
}

export async function parseCanonicalRecipeDraft(
  supabase: SupabaseServer,
  userId: string,
  payload: unknown,
) {
  const canonicalPayload = await canonicalizeRecipePayload(supabase, userId, payload);
  const parsed = parseNutritionRecipeDraft(canonicalPayload);
  if (!parsed.ok) return parsed;
  const foodsValid = await verifyFoodIds(supabase, parsed.value.foodIds);
  if (!foodsValid) {
    return { ok: false as const, error: "One or more food items are unavailable" };
  }
  return parsed;
}

export function makeRecipeItemInserts(
  recipeId: string,
  items: NutritionMealRpcItem[],
): RecipeItemInsert[] {
  return items.map((item) => ({
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
}

export function getRecipeWriteTables(supabase: SupabaseServer) {
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
  return { recipeTable, recipeItemsTable };
}

export function roundRecipeTotal(value: unknown) {
  return Math.round((toNullableRecipeNumber(value) ?? 0) * 1000) / 1000;
}
