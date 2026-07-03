import type {
  NoteDatabaseDefinition,
  NoteDatabaseFieldDefinition,
} from "@/components/notes/NoteSlashTextarea";
import {
  isDefaultNutritionDatabaseDefinition,
  NUTRITION_FOOD_FIELD_ID,
} from "@/lib/skillStarterNotes";
import type { Database, Json } from "@/types/supabase";

export type FoodSearchResult = {
  id: string;
  name: string;
  brand_name: string | null;
  source?: string | null;
  serving_size: number | null;
  serving_unit: string | null;
  serving_grams: number | null;
  calories: number | null;
  carbs_g: number | null;
  protein_g: number | null;
  fat_g: number | null;
  browse_department?: string | null;
  browse_aisle?: string | null;
  metadata?: Json | null;
};

export const FOOD_BROWSE_DEPARTMENTS = [
  {
    label: "Everyday",
    aisles: [
      "Breakfast basics",
      "Cheap bulk foods",
      "High protein regulars",
      "Quick snacks",
    ],
  },
  { label: "Produce", aisles: ["Fruit", "Vegetables", "Herbs"] },
  {
    label: "Meat & Seafood",
    aisles: ["Chicken", "Beef", "Pork", "Turkey", "Fish", "Seafood"],
  },
  {
    label: "Dairy & Eggs",
    aisles: ["Eggs", "Milk", "Yogurt", "Cheese", "Butter / Cream"],
  },
  {
    label: "Pantry",
    aisles: [
      "Rice & grains",
      "Pasta",
      "Bread & tortillas",
      "Beans & legumes",
      "Canned foods",
      "Nut butters",
      "Oils",
      "Baking",
    ],
  },
  {
    label: "Frozen",
    aisles: [
      "Frozen meals",
      "Frozen protein",
      "Frozen vegetables",
      "Frozen fruit",
      "Frozen snacks",
    ],
  },
  {
    label: "Snacks",
    aisles: ["Nuts & trail mix", "Crackers", "Chips", "Bars", "Sweet snacks"],
  },
  {
    label: "Drinks",
    aisles: [
      "Water",
      "Juice",
      "Coffee / tea",
      "Soda",
      "Sports / energy drinks",
      "Protein drinks",
    ],
  },
  {
    label: "Condiments & Sauces",
    aisles: ["Sauces", "Dressings", "Spreads", "Seasonings", "Sweeteners"],
  },
  {
    label: "Prepared",
    aisles: ["Ready meals", "Restaurant / fast food", "Meal kits"],
  },
] as const;

export type FoodBrowseDepartmentLabel = (typeof FOOD_BROWSE_DEPARTMENTS)[number]["label"];
export type FoodBrowseAisleLabel =
  (typeof FOOD_BROWSE_DEPARTMENTS)[number]["aisles"][number];

export type FoodBrowsePlacement = {
  department: FoodBrowseDepartmentLabel;
  aisle: FoodBrowseAisleLabel;
};

export type FoodBrowsePlacementInput = {
  name?: string | null;
  normalized_name?: string | null;
  brand_name?: string | null;
  normalized_brand_name?: string | null;
  source?: string | null;
  metadata?: Json | null;
};

export type FoodBarcodeLookupResult = {
  food: FoodSearchResult | null;
  source: "foods" | "open_food_facts" | null;
  status:
    | "found"
    | "created"
    | "not_found"
    | "invalid_barcode"
    | "missing_nutrition"
    | "invalid_nutrition"
    | "external_error"
    | "rate_limited";
  retryAfterSeconds?: number;
};

export type FoodInsert = Database["public"]["Tables"]["foods"]["Insert"];

export type OpenFoodFactsProduct = {
  code?: unknown;
  product_name?: unknown;
  product_name_en?: unknown;
  abbreviated_product_name?: unknown;
  generic_name?: unknown;
  brands?: unknown;
  serving_size?: unknown;
  serving_quantity?: unknown;
  quantity?: unknown;
  nutriments?: unknown;
};

const FOOD_NAME_MAX_LENGTH = 160;
const FOOD_BRAND_MAX_LENGTH = 120;
const SERVING_UNIT_MAX_LENGTH = 24;
const MAX_SERVING_SIZE = 10000;
const MAX_SERVING_GRAMS = 5000;
const VALID_NORMALIZED_BARCODE_PATTERN = /^(\d{8}|\d{12}|\d{13}|\d{14})$/;
const PLACEHOLDER_FOOD_NAMES = new Set([
  "unknown",
  "unknown product",
  "unidentified product",
  "unnamed product",
  "product",
  "food",
  "no name",
  "not available",
  "n a",
  "na",
  "null",
  "undefined",
  "test",
  "fake",
]);
const FOOD_BROWSE_DEPARTMENT_LOOKUP = new Map<string, FoodBrowseDepartmentLabel>();
const FOOD_BROWSE_AISLE_LOOKUP = new Map<string, FoodBrowseAisleLabel>();
const FOOD_BROWSE_PLACEMENT_LOOKUP = new Map<string, FoodBrowsePlacement>();

for (const department of FOOD_BROWSE_DEPARTMENTS) {
  const normalizedDepartment = normalizeFoodSearchText(department.label);
  FOOD_BROWSE_DEPARTMENT_LOOKUP.set(normalizedDepartment, department.label);
  FOOD_BROWSE_DEPARTMENT_LOOKUP.set(
    normalizedDepartment.replace(/\s+/g, ""),
    department.label,
  );

  for (const aisle of department.aisles) {
    const normalizedAisle = normalizeFoodSearchText(aisle);
    FOOD_BROWSE_AISLE_LOOKUP.set(normalizedAisle, aisle);
    FOOD_BROWSE_AISLE_LOOKUP.set(normalizedAisle.replace(/\s+/g, ""), aisle);
    FOOD_BROWSE_PLACEMENT_LOOKUP.set(`${normalizedDepartment}:${normalizedAisle}`, {
      department: department.label,
      aisle,
    });
  }
}

const FOOD_BROWSE_KNOWN_NAME_PLACEMENTS: Record<
  string,
  FoodBrowsePlacement[]
> = {
  banana: [
    { department: "Everyday", aisle: "Breakfast basics" },
    { department: "Produce", aisle: "Fruit" },
    { department: "Everyday", aisle: "Quick snacks" },
  ],
  egg: [
    { department: "Everyday", aisle: "Breakfast basics" },
    { department: "Everyday", aisle: "High protein regulars" },
    { department: "Dairy & Eggs", aisle: "Eggs" },
  ],
  "chicken breast": [
    { department: "Everyday", aisle: "High protein regulars" },
    { department: "Meat & Seafood", aisle: "Chicken" },
  ],
  "white rice": [
    { department: "Everyday", aisle: "Cheap bulk foods" },
    { department: "Pantry", aisle: "Rice & grains" },
  ],
  oats: [
    { department: "Everyday", aisle: "Breakfast basics" },
    { department: "Everyday", aisle: "Cheap bulk foods" },
    { department: "Pantry", aisle: "Rice & grains" },
  ],
  "peanut butter": [
    { department: "Everyday", aisle: "Quick snacks" },
    { department: "Pantry", aisle: "Nut butters" },
    { department: "Snacks", aisle: "Nuts & trail mix" },
  ],
};

const NUTRITION_LIMITS = {
  serving: {
    calories: 3000,
    carbs_g: 500,
    protein_g: 500,
    fat_g: 500,
  },
  "100g": {
    calories: 1000,
    carbs_g: 100,
    protein_g: 100,
    fat_g: 100,
  },
} as const;

type FoodDedupeInput = {
  name?: string | null;
  brand_name?: string | null;
  barcode?: string | null;
  serving_size?: number | string | null;
  serving_unit?: string | null;
  serving_grams?: number | string | null;
};

export type NutritionEntryFields = {
  foodField: NoteDatabaseFieldDefinition | null;
  caloriesField: NoteDatabaseFieldDefinition | null;
  carbsField: NoteDatabaseFieldDefinition | null;
  proteinField: NoteDatabaseFieldDefinition | null;
  fatField: NoteDatabaseFieldDefinition | null;
};

function normalizeLookupKey(value: string | null | undefined) {
  return normalizeFoodSearchText(value).replace(/[^a-z0-9]+/g, "");
}

function fieldLookupKeys(field: NoteDatabaseFieldDefinition) {
  const normalizedName = normalizeLookupKey(field.name);
  const normalizedId = normalizeLookupKey(field.id);
  const idParts = field.id
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((part) => normalizeLookupKey(part))
    .filter(Boolean);

  return new Set([normalizedName, normalizedId, ...idParts].filter(Boolean));
}

function findFieldByStableIdOrLookupKey(
  fields: NoteDatabaseFieldDefinition[],
  stableId: string,
  lookupKeys: string[],
) {
  return (
    fields.find((field) => field.id === stableId) ??
    fields.find((field) => {
      const keys = fieldLookupKeys(field);
      return lookupKeys.some((lookupKey) => keys.has(lookupKey));
    }) ??
    null
  );
}

export function normalizeFoodSearchText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeFoodBrowseDepartment(
  value: string | null | undefined,
): FoodBrowseDepartmentLabel | null {
  const normalized = normalizeFoodSearchText(value);
  if (!normalized) return null;

  const compacted = normalized.replace(/\s+/g, "");
  return (
    FOOD_BROWSE_DEPARTMENT_LOOKUP.get(normalized) ??
    FOOD_BROWSE_DEPARTMENT_LOOKUP.get(compacted) ??
    null
  );
}

export function normalizeFoodBrowseAisle(
  value: string | null | undefined,
): FoodBrowseAisleLabel | null {
  const normalized = normalizeFoodSearchText(value);
  if (!normalized) return null;

  const compacted = normalized.replace(/\s+/g, "");
  return (
    FOOD_BROWSE_AISLE_LOOKUP.get(normalized) ??
    FOOD_BROWSE_AISLE_LOOKUP.get(compacted) ??
    null
  );
}

function getFoodBrowsePlacement(
  department: string | null | undefined,
  aisle: string | null | undefined,
): FoodBrowsePlacement | null {
  const normalizedDepartment = normalizeFoodSearchText(department);
  const normalizedAisle = normalizeFoodSearchText(aisle);
  if (!normalizedDepartment || !normalizedAisle) return null;

  return (
    FOOD_BROWSE_PLACEMENT_LOOKUP.get(
      `${normalizedDepartment}:${normalizedAisle}`,
    ) ?? null
  );
}

function addFoodBrowsePlacement(
  placements: Map<string, FoodBrowsePlacement>,
  placement: FoodBrowsePlacement | null,
) {
  if (!placement) return;

  placements.set(
    `${normalizeFoodSearchText(placement.department)}:${normalizeFoodSearchText(
      placement.aisle,
    )}`,
    placement,
  );
}

function extractFoodMetadataStrings(value: Json | undefined): string[] {
  if (typeof value === "string") return value.split(/[,|]+/);
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  return [];
}

function collectStructuredFoodBrowsePlacements(
  value: Json | undefined,
): FoodBrowsePlacement[] {
  if (!Array.isArray(value)) return [];

  const placements = new Map<string, FoodBrowsePlacement>();

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;

    const record = item as Record<string, Json | undefined>;
    if (typeof record.department !== "string" || typeof record.aisle !== "string") {
      continue;
    }

    addFoodBrowsePlacement(
      placements,
      getFoodBrowsePlacement(record.department, record.aisle),
    );
  }

  return [...placements.values()];
}

function collectFoodMetadataPlacements(
  metadata: Json | null | undefined,
): FoodBrowsePlacement[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];

  const record = metadata as Record<string, Json | undefined>;
  const placements = new Map<string, FoodBrowsePlacement>();

  for (const placement of collectStructuredFoodBrowsePlacements(record.browse)) {
    addFoodBrowsePlacement(placements, placement);
  }

  const departmentValues = [
    record.department,
    record.browse_department,
    record.grocery_department,
  ].flatMap(extractFoodMetadataStrings);
  const aisleValues = [
    record.aisle,
    record.browse_aisle,
    record.grocery_aisle,
  ].flatMap(extractFoodMetadataStrings);

  for (const departmentValue of departmentValues) {
    for (const aisleValue of aisleValues) {
      addFoodBrowsePlacement(
        placements,
        getFoodBrowsePlacement(departmentValue, aisleValue),
      );
    }
  }

  const placementFields = [
    record.category,
    record.categories,
    record.browse_category,
    record.browse_categories,
    record.browse_placement,
    record.browse_placements,
    record.food_category,
    record.food_categories,
  ];

  for (const placementValue of placementFields.flatMap(extractFoodMetadataStrings)) {
    const parts = placementValue
      .split(/\s*(?:\/|>|-)\s*/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length < 2) continue;

    addFoodBrowsePlacement(
      placements,
      getFoodBrowsePlacement(parts[0], parts.slice(1).join(" / ")),
    );
  }

  return [...placements.values()];
}

export function getFoodBrowsePlacements(
  food: FoodBrowsePlacementInput,
): FoodBrowsePlacement[] {
  const placements = new Map<string, FoodBrowsePlacement>();

  for (const placement of collectFoodMetadataPlacements(food.metadata)) {
    addFoodBrowsePlacement(placements, placement);
  }
  const normalizedName = normalizeFoodSearchText(food.normalized_name || food.name);
  for (const placement of FOOD_BROWSE_KNOWN_NAME_PLACEMENTS[normalizedName] ?? []) {
    addFoodBrowsePlacement(placements, placement);
  }

  return [...placements.values()];
}

export function normalizeFoodBarcode(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/[\s-]+/g, "");
  if (!/^\d+$/.test(normalized)) return null;

  return normalized.length > 0 ? normalized : null;
}

export function isValidNormalizedFoodBarcode(
  value: string | null | undefined,
): value is string {
  return Boolean(value && VALID_NORMALIZED_BARCODE_PATTERN.test(value));
}

export function parseOpenFoodFactsNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function coerceOpenFoodFactsString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function compactOpenFoodFactsString(value: unknown, maxLength: number) {
  const coerced = coerceOpenFoodFactsString(value);
  if (!coerced) return null;

  const compacted = coerced
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return compacted.length > maxLength ? compacted.slice(0, maxLength).trim() : compacted;
}

function isOpenFoodFactsRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function getOpenFoodFactsNutrimentNumber(
  nutriments: Record<string, unknown>,
  keys: string[],
) {
  for (const key of keys) {
    const parsed = parseOpenFoodFactsNumber(nutriments[key]);
    if (parsed !== null) return parsed;
  }

  return null;
}

function getOpenFoodFactsCalories(
  nutriments: Record<string, unknown>,
  basis: "serving" | "100g",
) {
  const suffix = basis === "serving" ? "serving" : "100g";
  const kcal = getOpenFoodFactsNutrimentNumber(nutriments, [
    `energy-kcal_${suffix}`,
    `energy_kcal_${suffix}`,
    `energy-kcal_${suffix}_value`,
  ]);
  if (kcal !== null) return kcal;

  const kj = getOpenFoodFactsNutrimentNumber(nutriments, [
    `energy-kj_${suffix}`,
    `energy_${suffix}`,
  ]);

  return kj !== null ? kj / 4.184 : null;
}

function roundFoodNutritionNumber(value: number) {
  return Math.round(value * 10) / 10;
}

function isValidNutritionNumber(
  basis: "serving" | "100g",
  key: keyof (typeof NUTRITION_LIMITS)["serving"],
  value: number,
) {
  return Number.isFinite(value) && value >= 0 && value <= NUTRITION_LIMITS[basis][key];
}

function sanitizePositiveNumber(value: number | null, max: number) {
  if (value === null || !Number.isFinite(value) || value <= 0 || value > max) return null;
  return roundFoodNutritionNumber(value);
}

function isUsableSharedFoodName(value: string | null | undefined) {
  const normalized = normalizeFoodSearchText(value);
  if (!normalized || normalized.length < 2) return false;
  if (PLACEHOLDER_FOOD_NAMES.has(normalized)) return false;
  if (/^(?:unknown|unnamed|unidentified|generic)\b/.test(normalized)) return false;
  if (/^(?:test|fake|sample|dummy)\b/.test(normalized)) return false;
  if (/^(?:barcode|ean|upc|gtin)\s*\d*$/.test(normalized)) return false;
  if (/^\d+$/.test(normalized.replace(/\s+/g, ""))) return false;
  if (!/[a-z]/.test(normalized)) return false;

  return true;
}

function hasUsefulOpenFoodFactsNutrition(
  nutrition: {
    calories: number;
    carbs_g: number;
    protein_g: number;
    fat_g: number;
  } | null,
) {
  if (!nutrition) return false;

  return (
    nutrition.calories > 0 ||
    nutrition.carbs_g > 0 ||
    nutrition.protein_g > 0 ||
    nutrition.fat_g > 0
  );
}

export function extractOpenFoodFactsNutrition(product: OpenFoodFactsProduct) {
  if (!isOpenFoodFactsRecord(product.nutriments)) return null;

  const nutriments = product.nutriments;
  const getNutritionForBasis = (basis: "serving" | "100g") => {
    const suffix = basis === "serving" ? "serving" : "100g";
    const calories = getOpenFoodFactsCalories(nutriments, basis);
    const carbs = getOpenFoodFactsNutrimentNumber(nutriments, [
      `carbohydrates_${suffix}`,
      `carbohydrates_${suffix}_value`,
    ]);
    const protein = getOpenFoodFactsNutrimentNumber(nutriments, [
      `proteins_${suffix}`,
      `proteins_${suffix}_value`,
      `protein_${suffix}`,
    ]);
    const fat = getOpenFoodFactsNutrimentNumber(nutriments, [
      `fat_${suffix}`,
      `fat_${suffix}_value`,
    ]);

    if (calories === null || carbs === null || protein === null || fat === null) {
      return null;
    }

    const nutrition = {
      basis,
      calories: roundFoodNutritionNumber(calories),
      carbs_g: roundFoodNutritionNumber(carbs),
      protein_g: roundFoodNutritionNumber(protein),
      fat_g: roundFoodNutritionNumber(fat),
    };

    if (
      !isValidNutritionNumber(basis, "calories", nutrition.calories) ||
      !isValidNutritionNumber(basis, "carbs_g", nutrition.carbs_g) ||
      !isValidNutritionNumber(basis, "protein_g", nutrition.protein_g) ||
      !isValidNutritionNumber(basis, "fat_g", nutrition.fat_g)
    ) {
      return null;
    }

    if (
      basis === "100g" &&
      nutrition.carbs_g + nutrition.protein_g + nutrition.fat_g > 110
    ) {
      return null;
    }

    return nutrition;
  };

  return getNutritionForBasis("serving") ?? getNutritionForBasis("100g");
}

function parseServingUnit(value: string | null) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (["g", "gram", "grams"].includes(normalized)) return "g";
  if (["ml", "milliliter", "milliliters"].includes(normalized)) return "ml";
  return normalized.slice(0, SERVING_UNIT_MAX_LENGTH);
}

function parseOpenFoodFactsServing(product: OpenFoodFactsProduct) {
  const servingSizeText = coerceOpenFoodFactsString(product.serving_size);
  const servingQuantity = parseOpenFoodFactsNumber(product.serving_quantity);
  const primaryMatch = servingSizeText?.match(/^([0-9]+(?:[\.,][0-9]+)?)\s*([^\d(,;]+)?/);
  const gramMatch = servingSizeText?.match(/([0-9]+(?:[\.,][0-9]+)?)\s*g\b/i);
  const servingSize = primaryMatch ? parseOpenFoodFactsNumber(primaryMatch[1]) : servingQuantity;
  const servingUnit = parseServingUnit(primaryMatch?.[2]?.trim() ?? null);
  const servingGrams = gramMatch
    ? parseOpenFoodFactsNumber(gramMatch[1])
    : servingUnit === "g"
      ? servingSize
      : servingQuantity;

  return {
    serving_size: sanitizePositiveNumber(servingSize, MAX_SERVING_SIZE),
    serving_unit: servingUnit,
    serving_grams: sanitizePositiveNumber(servingGrams, MAX_SERVING_GRAMS),
  };
}

export function mapOpenFoodFactsProductToFoodInsert(
  product: OpenFoodFactsProduct,
  input: { barcode: string; createdByUserId?: string | null },
): FoodInsert | null {
  const normalizedInputBarcode = normalizeFoodBarcode(input.barcode);
  if (!isValidNormalizedFoodBarcode(normalizedInputBarcode)) return null;

  const productBarcode = coerceOpenFoodFactsString(product.code);
  const normalizedProductBarcode = productBarcode
    ? normalizeFoodBarcode(productBarcode)
    : normalizedInputBarcode;

  if (
    !isValidNormalizedFoodBarcode(normalizedProductBarcode) ||
    normalizedProductBarcode !== normalizedInputBarcode
  ) {
    return null;
  }

  const barcode = normalizedInputBarcode;
  const normalizedBarcode = normalizedInputBarcode;
  if (!normalizedBarcode) return null;

  const name =
    compactOpenFoodFactsString(product.product_name, FOOD_NAME_MAX_LENGTH) ??
    compactOpenFoodFactsString(product.product_name_en, FOOD_NAME_MAX_LENGTH) ??
    compactOpenFoodFactsString(product.abbreviated_product_name, FOOD_NAME_MAX_LENGTH) ??
    compactOpenFoodFactsString(product.generic_name, FOOD_NAME_MAX_LENGTH);
  if (!isUsableSharedFoodName(name)) return null;

  const nutrition = extractOpenFoodFactsNutrition(product);
  if (!hasUsefulOpenFoodFactsNutrition(nutrition)) return null;

  const brandName = compactOpenFoodFactsString(product.brands, FOOD_BRAND_MAX_LENGTH);
  const normalizedName = normalizeFoodSearchText(name);
  if (!normalizedName) return null;

  const normalizedBrandName = brandName ? normalizeFoodSearchText(brandName) : null;
  const serving =
    nutrition.basis === "serving"
      ? parseOpenFoodFactsServing(product)
      : { serving_size: 100, serving_unit: "g", serving_grams: 100 };
  const externalId = normalizedBarcode;
  const metadata: Json = {
    source: "open_food_facts",
    source_summary: {
      code: externalId,
      product_name: name,
      brands: brandName,
      quantity: coerceOpenFoodFactsString(product.quantity),
      serving_size: coerceOpenFoodFactsString(product.serving_size),
      serving_quantity: parseOpenFoodFactsNumber(product.serving_quantity),
      nutrition_basis: nutrition.basis,
    },
  };

  return {
    name,
    normalized_name: normalizedName,
    brand_name: brandName,
    normalized_brand_name: normalizedBrandName,
    barcode,
    normalized_barcode: normalizedBarcode,
    serving_size: serving.serving_size,
    serving_unit: serving.serving_unit,
    serving_grams: serving.serving_grams,
    calories: nutrition.calories,
    carbs_g: nutrition.carbs_g,
    protein_g: nutrition.protein_g,
    fat_g: nutrition.fat_g,
    source: "open_food_facts",
    external_source: "open_food_facts",
    external_id: externalId,
    dedupe_key: buildFoodDedupeKey({ barcode }),
    created_by_user_id: input.createdByUserId ?? null,
    is_active: true,
    metadata,
  };
}

export function buildFoodDedupeKey(input: FoodDedupeInput) {
  const barcode = normalizeFoodBarcode(input.barcode);
  if (barcode) return `barcode:${barcode}`;

  const name = normalizeFoodSearchText(input.name);
  if (!name) return null;

  const brand = normalizeFoodSearchText(input.brand_name);
  const servingGrams =
    input.serving_grams === null || input.serving_grams === undefined
      ? ""
      : String(input.serving_grams).trim();
  const servingSize =
    input.serving_size === null || input.serving_size === undefined
      ? ""
      : String(input.serving_size).trim();
  const servingUnit = normalizeFoodSearchText(input.serving_unit);
  const serving = servingGrams || [servingSize, servingUnit].filter(Boolean).join(" ");

  return ["catalog", brand, name, serving].filter(Boolean).join(":");
}

export function findNutritionEntryFields(
  databaseDefinition: NoteDatabaseDefinition | null | undefined,
): NutritionEntryFields {
  if (!databaseDefinition || !isDefaultNutritionDatabaseDefinition(databaseDefinition)) {
    return {
      foodField: null,
      caloriesField: null,
      carbsField: null,
      proteinField: null,
      fatField: null,
    };
  }

  const fields = databaseDefinition.fields ?? [];

  return {
    foodField: findFieldByStableIdOrLookupKey(fields, NUTRITION_FOOD_FIELD_ID, [
      "food",
      "foodname",
      "name",
    ]),
    caloriesField: findFieldByStableIdOrLookupKey(
      fields,
      "starter-health-nutrition-calories",
      ["calories", "calorie", "kcal"],
    ),
    carbsField: findFieldByStableIdOrLookupKey(
      fields,
      "starter-health-nutrition-carbs",
      ["carbs"],
    ),
    proteinField: findFieldByStableIdOrLookupKey(
      fields,
      "starter-health-nutrition-protein",
      ["protein"],
    ),
    fatField: findFieldByStableIdOrLookupKey(fields, "starter-health-nutrition-fat", [
      "fat",
    ]),
  };
}

export function mapFoodToNutritionEntryValues(
  food: FoodSearchResult,
  databaseDefinition: NoteDatabaseDefinition | null | undefined,
) {
  const { foodField, caloriesField, carbsField, proteinField, fatField } =
    findNutritionEntryFields(databaseDefinition);
  const values: Record<string, string> = {};

  if (foodField) values[foodField.id] = food.name;
  if (caloriesField) values[caloriesField.id] = String(food.calories ?? "");
  if (carbsField) values[carbsField.id] = String(food.carbs_g ?? "");
  if (proteinField) values[proteinField.id] = String(food.protein_g ?? "");
  if (fatField) values[fatField.id] = String(food.fat_g ?? "");

  return values;
}
