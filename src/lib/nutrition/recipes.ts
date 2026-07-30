import {
  buildFoodDedupeKey,
  normalizeFoodBarcode,
  normalizeFoodSearchText,
  reconcileFoodPackageProfile,
  type FoodSearchResult,
} from "@/lib/nutrition/foods";
import type { Json } from "@/types/supabase";

export type NutritionRecipeIngredientSourceType = "food" | "recipe";

export type NutritionRecipeIngredientDraft = {
  id: string;
  sourceType: NutritionRecipeIngredientSourceType;
  foodId: string | null;
  foodResourceId?: string | null;
  name: string;
  brandName?: string | null;
  quantity: number;
  servingUnit: NutritionRecipeServingUnit;
  servingSize?: number | null;
  servingGrams?: number | null;
  calories: number | null;
  carbs_g: number | null;
  protein_g: number | null;
  fat_g: number | null;
  metadata?: Record<string, unknown>;
};

export type NutritionRecipeTotals = {
  calories: number;
  carbs_g: number;
  protein_g: number;
  fat_g: number;
  incompleteIngredientIds: string[];
};

export type NutritionRecipeServingUnit =
  | "serving"
  | "g"
  | "oz"
  | "lb"
  | "ml"
  | "fl oz"
  | "tsp"
  | "tbsp"
  | "cup";

export type NutritionRecipeServingOption = {
  value: NutritionRecipeServingUnit;
  label: string;
};

export type NutritionRecipeListItem = {
  id: string;
  name: string;
  icon?: string | null;
  description?: string | null;
  servings?: number | string | null;
  total_calories?: number | string | null;
  total_carbs_g?: number | string | null;
  total_protein_g?: number | string | null;
  total_fat_g?: number | string | null;
  metadata?: unknown;
  recipe_items?: NutritionRecipeItemSnapshot[] | null;
};

export type NutritionRecipeItemSnapshot = {
  id: string;
  item_type: string;
  food_id?: string | null;
  custom_name?: string | null;
  quantity?: number | string | null;
  serving_unit?: string | null;
  serving_grams?: number | string | null;
  snapshot_name?: string | null;
  snapshot_brand_name?: string | null;
  snapshot_calories?: number | string | null;
  snapshot_carbs_g?: number | string | null;
  snapshot_protein_g?: number | string | null;
  snapshot_fat_g?: number | string | null;
  metadata?: unknown;
  sort_order?: number | null;
};

export type FoodResourceRecipeChoice = {
  id: string;
  food_id: string | null;
  name: string;
  brand_name: string | null;
  quantity: number | null;
  unit: string | null;
  status: string;
  metadata?: unknown;
  catalog_food?: unknown;
};

const GRAMS_PER_OUNCE = 28.349523125;
const GRAMS_PER_POUND = 453.59237;
const ML_BY_VOLUME_UNIT: Partial<Record<NutritionRecipeServingUnit, number>> = {
  ml: 1,
  "fl oz": 29.5735295625,
  tsp: 4.92892159375,
  tbsp: 14.78676478125,
  cup: 236.5882365,
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function toNullableRecipeNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toPositiveRecipeNumber(value: unknown) {
  const parsed = toNullableRecipeNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

export function normalizeRecipeQuantity(value: unknown, fallback = 1) {
  const parsed = toNullableRecipeNumber(value);
  if (parsed === null || parsed <= 0 || parsed > 10000) return fallback;
  return Math.round(parsed * 1000) / 1000;
}

export function formatRecipeNumber(value: unknown) {
  const parsed = toNullableRecipeNumber(value);
  if (parsed === null) return null;
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: parsed >= 100 ? 0 : 1,
  }).format(parsed);
}

export function normalizeRecipeServingUnit(value: unknown): NutritionRecipeServingUnit {
  if (typeof value !== "string") return "serving";
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  const alias: Record<string, NutritionRecipeServingUnit> = {
    gram: "g",
    grams: "g",
    ounce: "oz",
    ounces: "oz",
    pound: "lb",
    pounds: "lb",
    milliliter: "ml",
    milliliters: "ml",
    tablespoon: "tbsp",
    tablespoons: "tbsp",
    teaspoon: "tsp",
    teaspoons: "tsp",
    "fluid ounce": "fl oz",
    "fluid ounces": "fl oz",
  };
  const unit = alias[normalized] ?? normalized;
  return ["serving", "g", "oz", "lb", "ml", "fl oz", "tsp", "tbsp", "cup"].includes(unit)
    ? (unit as NutritionRecipeServingUnit)
    : "serving";
}

function hasCompleteNutrition(ingredient: Pick<NutritionRecipeIngredientDraft, "calories" | "carbs_g" | "protein_g" | "fat_g">) {
  return [ingredient.calories, ingredient.carbs_g, ingredient.protein_g, ingredient.fat_g].every(
    (value) => typeof value === "number" && Number.isFinite(value) && value >= 0,
  );
}

function getVolumeAnchor(ingredient: Pick<NutritionRecipeIngredientDraft, "servingSize" | "servingUnit" | "servingGrams">) {
  const unit = normalizeRecipeServingUnit(ingredient.servingUnit);
  const ml = ML_BY_VOLUME_UNIT[unit];
  const size = toPositiveRecipeNumber(ingredient.servingSize);
  const grams = toPositiveRecipeNumber(ingredient.servingGrams);
  return ml && size && grams ? grams / (size * ml) : null;
}

export function getRecipeIngredientServingOptions(
  ingredient: Pick<NutritionRecipeIngredientDraft, "servingSize" | "servingUnit" | "servingGrams">,
): NutritionRecipeServingOption[] {
  const options = new Map<NutritionRecipeServingUnit, NutritionRecipeServingOption>();
  const servingGrams = toPositiveRecipeNumber(ingredient.servingGrams);
  const defaultUnit = normalizeRecipeServingUnit(ingredient.servingUnit);
  options.set("serving", { value: "serving", label: "serving" });
  if (servingGrams) {
    options.set("g", { value: "g", label: "g" });
    options.set("oz", { value: "oz", label: "oz" });
    options.set("lb", { value: "lb", label: "lb" });
  }
  if (getVolumeAnchor(ingredient)) {
    for (const unit of ["ml", "fl oz", "tsp", "tbsp", "cup"] as const) {
      options.set(unit, { value: unit, label: unit });
    }
  }
  if (options.has(defaultUnit)) {
    const preferred = options.get(defaultUnit);
    options.delete(defaultUnit);
    if (preferred) return [preferred, ...options.values()];
  }
  return [...options.values()];
}

export function getRecipeIngredientMultiplier(ingredient: NutritionRecipeIngredientDraft) {
  const quantity = normalizeRecipeQuantity(ingredient.quantity);
  const unit = normalizeRecipeServingUnit(ingredient.servingUnit);
  const servingGrams = toPositiveRecipeNumber(ingredient.servingGrams);
  if (unit === "g") return servingGrams ? quantity / servingGrams : null;
  if (unit === "oz") return servingGrams ? (quantity * GRAMS_PER_OUNCE) / servingGrams : null;
  if (unit === "lb") return servingGrams ? (quantity * GRAMS_PER_POUND) / servingGrams : null;
  const volumeMl = ML_BY_VOLUME_UNIT[unit];
  const gramsPerMl = getVolumeAnchor(ingredient);
  if (volumeMl && gramsPerMl && servingGrams) return (quantity * volumeMl * gramsPerMl) / servingGrams;
  return quantity;
}

export function getRecipeIngredientLineNutrition(ingredient: NutritionRecipeIngredientDraft) {
  const multiplier = getRecipeIngredientMultiplier(ingredient);
  const complete = hasCompleteNutrition(ingredient) && multiplier !== null;
  return {
    complete,
    calories: complete ? ingredient.calories! * multiplier! : null,
    carbs_g: complete ? ingredient.carbs_g! * multiplier! : null,
    protein_g: complete ? ingredient.protein_g! * multiplier! : null,
    fat_g: complete ? ingredient.fat_g! * multiplier! : null,
  };
}

export function getRecipeTotals(ingredients: NutritionRecipeIngredientDraft[]): NutritionRecipeTotals {
  const totals: NutritionRecipeTotals = {
    calories: 0,
    carbs_g: 0,
    protein_g: 0,
    fat_g: 0,
    incompleteIngredientIds: [],
  };
  for (const ingredient of ingredients) {
    const line = getRecipeIngredientLineNutrition(ingredient);
    if (!line.complete) {
      totals.incompleteIngredientIds.push(ingredient.id);
      continue;
    }
    totals.calories += line.calories ?? 0;
    totals.carbs_g += line.carbs_g ?? 0;
    totals.protein_g += line.protein_g ?? 0;
    totals.fat_g += line.fat_g ?? 0;
  }
  return totals;
}

export function makeRecipeIngredientFromFood(
  food: FoodSearchResult,
  id: string,
): NutritionRecipeIngredientDraft {
  const metadata = record(food.metadata);
  const catalogFoodId =
    typeof metadata.catalogFoodId === "string" && metadata.catalogFoodId.trim()
      ? metadata.catalogFoodId.trim()
      : food.source === "grocery_resource" || food.id.startsWith("grocery-resource-")
        ? null
        : food.id;
  const servingSize = toPositiveRecipeNumber(food.serving_size) ?? 1;
  const servingUnit = normalizeRecipeServingUnit(food.serving_unit);
  const servingGrams = toPositiveRecipeNumber(food.serving_grams);
  return {
    id,
    sourceType: "food",
    foodId: catalogFoodId,
    foodResourceId:
      typeof metadata.foodResourceId === "string" ? metadata.foodResourceId : null,
    name: food.name || "Food",
    brandName: food.brand_name ?? null,
    quantity: servingUnit === "g" && servingGrams ? servingGrams : 1,
    servingUnit: servingUnit === "g" && servingGrams ? "g" : "serving",
    servingSize,
    servingGrams,
    calories: toNullableRecipeNumber(food.calories),
    carbs_g: toNullableRecipeNumber(food.carbs_g),
    protein_g: toNullableRecipeNumber(food.protein_g),
    fat_g: toNullableRecipeNumber(food.fat_g),
    metadata,
  };
}

export function makeRecipeIngredientFromResource(
  resource: FoodResourceRecipeChoice,
  id: string,
): NutritionRecipeIngredientDraft {
  const metadata = record(resource.metadata);
  const snapshot = record(metadata.foodSnapshot);
  const catalogFood = record(resource.catalog_food);
  const catalogMetadata = record(catalogFood.metadata);
  const sourceMetadata = {
    ...catalogMetadata,
    ...metadata,
    source: resource.food_id ? "grocery_resource" : "grocery_custom",
    catalogFoodId: resource.food_id,
    foodResourceId: resource.id,
    foodResourceStatus: resource.status,
    foodResourceQuantity: resource.quantity,
    foodResourceUnit: resource.unit,
  };
  const servingSize =
    toPositiveRecipeNumber(metadata.serving_quantity) ??
    toPositiveRecipeNumber(snapshot.servingSize) ??
    toPositiveRecipeNumber(catalogFood.serving_size) ??
    1;
  const servingUnit = normalizeRecipeServingUnit(
    metadata.serving_unit ?? snapshot.servingUnit ?? catalogFood.serving_unit,
  );
  const servingGrams =
    toPositiveRecipeNumber(metadata.serving_grams) ??
    toPositiveRecipeNumber(snapshot.servingGrams) ??
    toPositiveRecipeNumber(catalogFood.serving_grams);
  return {
    id,
    sourceType: "food",
    foodId: resource.food_id,
    foodResourceId: resource.id,
    name: resource.name || String(catalogFood.name ?? "Grocery item"),
    brandName: resource.brand_name || (typeof catalogFood.brand_name === "string" ? catalogFood.brand_name : null),
    quantity: servingUnit === "g" && servingGrams ? servingGrams : 1,
    servingUnit: servingUnit === "g" && servingGrams ? "g" : "serving",
    servingSize,
    servingGrams,
    calories:
      toNullableRecipeNumber(metadata.calories) ??
      toNullableRecipeNumber(snapshot.calories) ??
      toNullableRecipeNumber(catalogFood.calories),
    carbs_g:
      toNullableRecipeNumber(metadata.carbs_g) ??
      toNullableRecipeNumber(snapshot.carbs_g) ??
      toNullableRecipeNumber(catalogFood.carbs_g),
    protein_g:
      toNullableRecipeNumber(metadata.protein_g) ??
      toNullableRecipeNumber(snapshot.protein_g) ??
      toNullableRecipeNumber(catalogFood.protein_g),
    fat_g:
      toNullableRecipeNumber(metadata.fat_g) ??
      toNullableRecipeNumber(snapshot.fat_g) ??
      toNullableRecipeNumber(catalogFood.fat_g),
    metadata: sourceMetadata,
  };
}

export function makeRecipeIngredientFromRecipeItem(
  item: NutritionRecipeItemSnapshot,
): NutritionRecipeIngredientDraft {
  const metadata = record(item.metadata);
  const selectedServing = record(metadata.selectedServing);
  const perServing = record(metadata.perServing);
  const multiplier = toPositiveRecipeNumber(selectedServing.multiplier) ?? toPositiveRecipeNumber(item.quantity) ?? 1;
  const readBase = (key: "calories" | "carbs_g" | "protein_g" | "fat_g", snapshotKey: keyof NutritionRecipeItemSnapshot) =>
    toNullableRecipeNumber(perServing[key]) ??
    (() => {
      const line = toNullableRecipeNumber(item[snapshotKey]);
      return line === null ? null : line / multiplier;
    })();
  return {
    id: item.id,
    sourceType: "food",
    foodId: item.food_id ?? null,
    foodResourceId:
      typeof metadata.foodResourceId === "string" ? metadata.foodResourceId : null,
    name: item.snapshot_name?.trim() || item.custom_name?.trim() || "Food",
    brandName: item.snapshot_brand_name ?? null,
    quantity: normalizeRecipeQuantity(item.quantity),
    servingUnit: normalizeRecipeServingUnit(item.serving_unit),
    servingSize: 1,
    servingGrams: toPositiveRecipeNumber(item.serving_grams),
    calories: readBase("calories", "snapshot_calories"),
    carbs_g: readBase("carbs_g", "snapshot_carbs_g"),
    protein_g: readBase("protein_g", "snapshot_protein_g"),
    fat_g: readBase("fat_g", "snapshot_fat_g"),
    metadata,
  };
}

export function getRecipeInstructions(recipe: Pick<NutritionRecipeListItem, "metadata">) {
  const metadata = record(recipe.metadata);
  return typeof metadata.preparation_instructions === "string"
    ? metadata.preparation_instructions
    : "";
}

export function buildRecipeSavePayload(input: {
  name: string;
  icon: string;
  description: string;
  servings: number;
  instructions: string;
  ingredients: NutritionRecipeIngredientDraft[];
}) {
  return {
    name: input.name.trim(),
    icon: input.icon.trim(),
    description: input.description.trim() || undefined,
    servings: input.servings,
    metadata: {
      source: "nutrition-recipes-tab",
      preparation_instructions: input.instructions.trim() || undefined,
    },
    items: input.ingredients.map((ingredient) => {
      const line = getRecipeIngredientLineNutrition(ingredient);
      const multiplier = getRecipeIngredientMultiplier(ingredient);
      return {
        type: "food",
        foodId: ingredient.foodId ?? undefined,
        foodResourceId: ingredient.foodResourceId ?? undefined,
        quantity: normalizeRecipeQuantity(ingredient.quantity),
        servingUnit: normalizeRecipeServingUnit(ingredient.servingUnit),
        servingGrams: ingredient.servingGrams ?? undefined,
        snapshot: {
          name: ingredient.name,
          displayName: ingredient.name,
          brandName: ingredient.brandName ?? undefined,
          brand_name: ingredient.brandName ?? undefined,
          servingSize: ingredient.servingSize ?? undefined,
          serving_size: ingredient.servingSize ?? undefined,
          servingUnit: normalizeRecipeServingUnit(ingredient.servingUnit),
          serving_unit: normalizeRecipeServingUnit(ingredient.servingUnit),
          servingGrams: ingredient.servingGrams ?? undefined,
          serving_grams: ingredient.servingGrams ?? undefined,
          calories: line.calories ?? undefined,
          carbs_g: line.carbs_g ?? undefined,
          protein_g: line.protein_g ?? undefined,
          fat_g: line.fat_g ?? undefined,
        },
        metadata: {
          ...ingredient.metadata,
          source: ingredient.foodResourceId ? "recipe-grocery-ingredient" : "recipe-food-ingredient",
          foodResourceId: ingredient.foodResourceId ?? undefined,
          catalogFoodId: ingredient.foodId ?? undefined,
          snapshotTotals: "line",
          selectedServing: {
            amount: normalizeRecipeQuantity(ingredient.quantity),
            unit: normalizeRecipeServingUnit(ingredient.servingUnit),
            defaultServingGrams: ingredient.servingGrams ?? undefined,
            multiplier,
          },
          perServing: {
            calories: ingredient.calories,
            carbs_g: ingredient.carbs_g,
            protein_g: ingredient.protein_g,
            fat_g: ingredient.fat_g,
          },
        },
      };
    }),
  };
}

export function buildFoodInsertFromOwnedResource(
  resource: {
    id: string;
    name: string;
    brand_name: string | null;
    metadata: unknown;
  },
  userId: string,
) {
  const metadata = record(resource.metadata);
  const profile = reconcileFoodPackageProfile({
    name: resource.name,
    brand_name: resource.brand_name,
    source: "user_food_resource",
    metadata,
  });
  const snapshot = record(metadata.foodSnapshot);
  const perServing = record(metadata.perServing);
  const barcode = normalizeFoodBarcode(
    profile.barcode ??
      (typeof metadata.barcode === "string" ? metadata.barcode : null),
  );
  const name = resource.name.trim();
  const normalizedName = normalizeFoodSearchText(name);
  const brandName = resource.brand_name?.trim() || null;
  const normalizedBrandName = brandName ? normalizeFoodSearchText(brandName) : null;
  const servingSize =
    toPositiveRecipeNumber(profile.servingQuantity) ??
    toPositiveRecipeNumber(metadata.serving_quantity) ??
    toPositiveRecipeNumber(snapshot.servingSize) ??
    1;
  const servingUnit =
    typeof profile.servingUnit === "string" && profile.servingUnit.trim()
      ? profile.servingUnit.trim()
      : typeof metadata.serving_unit === "string" && metadata.serving_unit.trim()
        ? metadata.serving_unit.trim()
        : "serving";
  const servingGrams =
    toPositiveRecipeNumber(profile.servingGrams) ??
    toPositiveRecipeNumber(metadata.serving_grams) ??
    toPositiveRecipeNumber(snapshot.servingGrams);
  const nutrition = profile.nutritionPerServing ?? perServing;
  const calories = toNullableRecipeNumber(record(nutrition).calories ?? metadata.calories ?? snapshot.calories);
  const carbs_g = toNullableRecipeNumber(record(nutrition).carbs_g ?? metadata.carbs_g ?? snapshot.carbs_g);
  const protein_g = toNullableRecipeNumber(record(nutrition).protein_g ?? metadata.protein_g ?? snapshot.protein_g);
  const fat_g = toNullableRecipeNumber(record(nutrition).fat_g ?? metadata.fat_g ?? snapshot.fat_g);
  if (!normalizedName || !name || !servingSize || !servingUnit || ![calories, carbs_g, protein_g, fat_g].every((value) => value !== null)) {
    return null;
  }
  return {
    name,
    normalized_name: normalizedName,
    brand_name: brandName,
    normalized_brand_name: normalizedBrandName,
    barcode,
    normalized_barcode: barcode,
    serving_size: servingSize,
    serving_unit: servingUnit,
    serving_grams: servingGrams,
    calories,
    carbs_g,
    protein_g,
    fat_g,
    source: "user_food_resource",
    external_source: "user_food_resource",
    external_id: resource.id,
    dedupe_key: barcode ? buildFoodDedupeKey({ barcode }) : `user_food_resource:${resource.id}`,
    created_by_user_id: userId,
    is_active: true,
    metadata: {
      ...metadata,
      package_profile: profile,
      promoted_from_food_resource_id: resource.id,
      source: "user_food_resource",
    } satisfies Json,
  };
}
