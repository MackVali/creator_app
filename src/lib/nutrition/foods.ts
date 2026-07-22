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
  normalized_name?: string | null;
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
  catalog_metadata?: Json | null;
  metadata?: Json | null;
};

export type FoodInventoryMeasurementProfile = {
  preferredKind: "count" | "package" | "weight" | "serving";
  allowedKinds: readonly ("count" | "package" | "weight" | "serving")[];
  countUnitKey: string;
  singularLabel: string;
  pluralLabel: string;
  gramsPerItem?: number;
  packageItemCount?: number;
  servingsPerContainer?: number;
  netGramsPerContainer?: number;
  source: "catalog" | "barcode" | "name_fallback";
  confidence: "high" | "medium";
};

type InventoryProfileFood = Pick<FoodSearchResult, "name" | "serving_unit" | "serving_grams" | "metadata">;

const COUNTABLE_FOOD_RULES: readonly {
  pattern: RegExp;
  countUnitKey: string;
  singularLabel: string;
  pluralLabel: string;
}[] = [
  { pattern: /\b(?:flour|corn)?\s*tortillas?\b/i, countUnitKey: "tortilla", singularLabel: "tortilla", pluralLabel: "tortillas" },
  { pattern: /\b(?:white|wheat|sandwich)?\s*bread\b|\btoast\b/i, countUnitKey: "bread-slice", singularLabel: "slice", pluralLabel: "slices" },
  { pattern: /\bhamburger buns?\b/i, countUnitKey: "hamburger-bun", singularLabel: "bun", pluralLabel: "buns" },
  { pattern: /\bhot dog buns?\b/i, countUnitKey: "hot-dog-bun", singularLabel: "bun", pluralLabel: "buns" },
  { pattern: /^eggs?$/i, countUnitKey: "egg", singularLabel: "egg", pluralLabel: "eggs" },
  { pattern: /\bcanned tuna\b/i, countUnitKey: "tuna-can", singularLabel: "can", pluralLabel: "cans" },
  { pattern: /\bcanned (?:black |pinto |kidney |white |baked )?beans?\b/i, countUnitKey: "bean-can", singularLabel: "can", pluralLabel: "cans" },
  { pattern: /\byogurt\b/i, countUnitKey: "yogurt-container", singularLabel: "container", pluralLabel: "containers" },
  { pattern: /\bprotein bars?\b/i, countUnitKey: "protein-bar", singularLabel: "bar", pluralLabel: "bars" },
  { pattern: /\bcheese slices?\b/i, countUnitKey: "cheese-slice", singularLabel: "slice", pluralLabel: "slices" },
  { pattern: /\b(?:frozen )?(?:burger|hamburger) patt(?:y|ies)\b/i, countUnitKey: "burger-patty", singularLabel: "patty", pluralLabel: "patties" },
];

function inventoryMetadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function getFoodInventoryMeasurementProfile(
  food: InventoryProfileFood,
): FoodInventoryMeasurementProfile | null {
  const metadata = inventoryMetadataRecord(food.metadata);
  const stored = inventoryMetadataRecord(metadata.inventory_measurement_profile);
  if (
    stored.preferredKind === "count" &&
    typeof stored.countUnitKey === "string" &&
    typeof stored.singularLabel === "string" &&
    typeof stored.pluralLabel === "string"
  ) {
    return {
      preferredKind: "count",
      allowedKinds: ["count", "package", "weight", "serving"],
      countUnitKey: stored.countUnitKey,
      singularLabel: stored.singularLabel,
      pluralLabel: stored.pluralLabel,
      ...(typeof stored.gramsPerItem === "number" && stored.gramsPerItem > 0 ? { gramsPerItem: stored.gramsPerItem } : {}),
      ...(typeof stored.packageItemCount === "number" && stored.packageItemCount > 0 ? { packageItemCount: stored.packageItemCount } : {}),
      ...(typeof stored.servingsPerContainer === "number" && stored.servingsPerContainer > 0 ? { servingsPerContainer: stored.servingsPerContainer } : {}),
      ...(typeof stored.netGramsPerContainer === "number" && stored.netGramsPerContainer > 0 ? { netGramsPerContainer: stored.netGramsPerContainer } : {}),
      source: stored.source === "barcode" || stored.source === "catalog" ? stored.source : "name_fallback",
      confidence: stored.confidence === "high" ? "high" : "medium",
    };
  }

  // Older barcode rows may contain the detected container fields without the
  // newer inventory_measurement_profile. Rehydrate the natural count profile
  // so nutrition servings never become the Grocery inventory fallback.
  const sourceSummary = inventoryMetadataRecord(metadata.source_summary);
  const containerKey = [metadata.container_type, sourceSummary.container_type]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0)
    ?.trim()
    .toLowerCase();
  const naturalContainer = containerKey
    ? NATURAL_CONTAINER_RULES.find((candidate) => candidate.key === containerKey)
    : null;
  if (naturalContainer) {
    const sourceValue = metadata.container_source ?? sourceSummary.container_source;
    const confidenceValue = metadata.container_confidence ?? sourceSummary.container_confidence;
    return {
      preferredKind: "count",
      allowedKinds: ["count", "package", "weight", "serving"],
      countUnitKey: naturalContainer.key,
      singularLabel: naturalContainer.singular,
      pluralLabel: naturalContainer.plural,
      source: sourceValue === "barcode" ? "barcode" : "name_fallback",
      confidence: confidenceValue === "high" ? "high" : "medium",
    };
  }

  const rule = COUNTABLE_FOOD_RULES.find((candidate) => candidate.pattern.test(food.name));
  if (!rule) return null;
  const servingUnit = (food.serving_unit ?? "").toLowerCase();
  const discreteServing = new RegExp(`\\b(?:${rule.singularLabel}|${rule.pluralLabel}|each|item)s?\\b`, "i").test(servingUnit);
  return {
    preferredKind: "count",
    allowedKinds: ["count", "package", "weight", "serving"],
    countUnitKey: rule.countUnitKey,
    singularLabel: rule.singularLabel,
    pluralLabel: rule.pluralLabel,
    ...(discreteServing && typeof food.serving_grams === "number" && food.serving_grams > 0
      ? { gramsPerItem: food.serving_grams }
      : {}),
    source: "name_fallback",
    confidence: "medium",
  };
}

export function formatInventoryCountLabel(
  quantity: number,
  profile: Pick<FoodInventoryMeasurementProfile, "singularLabel" | "pluralLabel">,
) {
  return quantity === 1 ? profile.singularLabel : profile.pluralLabel;
}

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
  browse_department?: string | null;
  browse_aisle?: string | null;
  catalog_metadata?: Json | null;
  metadata?: Json | null;
};

export type FoodBarcodeLookupResult = {
  food: FoodSearchResult | null;
  source: "foods" | "open_food_facts" | "user_food_resource" | "barcode_resolver" | null;
  status:
    | "found"
    | "created"
    | "not_found"
    | "invalid_barcode"
    | "missing_nutrition"
    | "invalid_nutrition"
    | "external_error"
    | "incomplete"
    | "conflict"
    | "rate_limited";
  retryAfterSeconds?: number;
  barcodeResolution?: import("@/lib/nutrition/barcodeResolver").BarcodeResolutionMetadata;
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
  serving_quantity_unit?: unknown;
  quantity?: unknown;
  product_quantity?: unknown;
  product_quantity_unit?: unknown;
  servings_per_container?: unknown;
  servings_per_package?: unknown;
  packaging?: unknown;
  packaging_text?: unknown;
  packaging_tags?: unknown;
  categories?: unknown;
  categories_tags?: unknown;
  nutrition_data_per?: unknown;
  nutriments?: unknown;
};

export type FoodPackageProfileSource =
  | "user_food_resource"
  | "foods_catalog"
  | "external_barcode"
  | "name_inference"
  | "derived"
  | "user_confirmation";
export type FoodPackageProfileConfidence = "high" | "medium" | "low";
export type FoodPackageNutritionBasis = "per_serving" | "per_container" | "per_100g";
export type FoodPackageNutritionSnapshot = {
  calories: number | null;
  carbs_g: number | null;
  protein_g: number | null;
  fat_g: number | null;
  [key: string]: number | null;
};
export type FoodPackageProfileConflict = {
  field: string;
  message: string;
  facts: [string, string];
};
export type FoodPackageProfile = {
  version: 1;
  barcode: string | null;
  productName: string;
  brandName: string | null;
  containerKey: string | null;
  containerSingularLabel: string | null;
  containerPluralLabel: string | null;
  containersAdded: number | null;
  netQuantityPerContainer: number | null;
  netQuantityUnit: string | null;
  netGramsPerContainer: number | null;
  netMillilitersPerContainer: number | null;
  servingQuantity: number | null;
  servingUnit: string | null;
  servingGrams: number | null;
  servingMilliliters: number | null;
  servingsPerContainer: number | null;
  nutritionBasis: FoodPackageNutritionBasis | null;
  nutritionPerServing: FoodPackageNutritionSnapshot | null;
  nutritionPerContainer: FoodPackageNutritionSnapshot | null;
  nutritionPer100g: FoodPackageNutritionSnapshot | null;
  fieldSources: Record<string, FoodPackageProfileSource>;
  fieldConfidence: Record<string, FoodPackageProfileConfidence>;
  fieldStatus: Record<string, "explicit" | "derived" | "inferred" | "confirmed">;
  originalPackageText: string | null;
  originalServingText: string | null;
  userConfirmedFields: string[];
  completeness: "complete" | "incomplete" | "conflict";
  missingFields: string[];
  conflicts: FoodPackageProfileConflict[];
};

export type FoodPackageProfileInput = Partial<Omit<FoodSearchResult, "metadata" | "source">> & {
  barcode?: unknown;
  containersAdded?: unknown;
  metadata?: unknown;
  source?: string | null;
};

const NATURAL_CONTAINER_RULES: readonly {
  key: string;
  singular: string;
  plural: string;
  pattern: RegExp;
}[] = [
  { key: "can", singular: "can", plural: "cans", pattern: /\b(?:can|canned|tin|tinned)\b/i },
  { key: "bottle", singular: "bottle", plural: "bottles", pattern: /\b(?:bottle|bottled)\b/i },
  { key: "jar", singular: "jar", plural: "jars", pattern: /\bjar(?:red)?\b/i },
  { key: "pouch", singular: "pouch", plural: "pouches", pattern: /\bpouch(?:es)?\b/i },
  { key: "packet", singular: "packet", plural: "packets", pattern: /\bpacket(?:s)?\b/i },
  { key: "carton", singular: "carton", plural: "cartons", pattern: /\bcarton(?:s)?\b/i },
  { key: "box", singular: "box", plural: "boxes", pattern: /\bbox(?:es)?\b/i },
  { key: "bag", singular: "bag", plural: "bags", pattern: /\bbag(?:ged|s)?\b/i },
  { key: "tub", singular: "tub", plural: "tubs", pattern: /\btub(?:s)?\b/i },
  { key: "tray", singular: "tray", plural: "trays", pattern: /\btray(?:s)?\b/i },
];

const PACKAGE_WEIGHT_GRAMS: Record<string, number> = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };
const PACKAGE_VOLUME_ML: Record<string, number> = { ml: 1, l: 1000, "fl oz": 29.5735 };
const PACKAGE_PROFILE_TOLERANCE = 0.1;

function packageProfileRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function packageProfileNumber(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function packageProfileText(...values: unknown[]) {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function normalizePackageUnit(value: unknown) {
  const unit = packageProfileText(value)?.toLowerCase().replace(/\s+/g, " ") ?? null;
  if (!unit) return null;
  const aliases: Record<string, string> = { gram: "g", grams: "g", kilogram: "kg", kilograms: "kg", ounce: "oz", ounces: "oz", pound: "lb", pounds: "lb", lbs: "lb", milliliter: "ml", milliliters: "ml", liter: "l", liters: "l", litre: "l", litres: "l", "fluid ounce": "fl oz", "fluid ounces": "fl oz", floz: "fl oz" };
  return (aliases[unit] ?? unit).slice(0, SERVING_UNIT_MAX_LENGTH);
}

function parsePackageQuantityText(value: unknown) {
  const match = packageProfileText(value)?.match(/(\d+(?:[.,]\d+)?)\s*(fl\s*oz|ml|l|kg|g|oz|lb)\b/i);
  if (!match) return null;
  const quantity = Number(match[1].replace(",", "."));
  const unit = normalizePackageUnit(match[2]);
  return quantity > 0 && unit ? { quantity, unit } : null;
}

function normalizePackageNutrition(value: unknown): FoodPackageNutritionSnapshot | null {
  const record = packageProfileRecord(value);
  const read = (...keys: string[]) => {
    for (const key of keys) {
      const raw = record[key];
      if (raw === null || raw === undefined || raw === "") continue;
      const parsed = typeof raw === "number" ? raw : Number(raw);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    return null;
  };
  const result: FoodPackageNutritionSnapshot = { calories: read("calories"), carbs_g: read("carbs_g", "carbohydrates"), protein_g: read("protein_g", "protein"), fat_g: read("fat_g", "fat") };
  for (const [key, raw] of Object.entries(record)) {
    if (raw === null || raw === undefined || raw === "") continue;
    const parsed = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) result[key] = parsed;
  }
  return Object.values(result).some((value) => value !== null) ? result : null;
}

function scalePackageNutrition(value: FoodPackageNutritionSnapshot | null, multiplier: number) {
  if (!value || !Number.isFinite(multiplier) || multiplier <= 0) return null;
  return Object.fromEntries(Object.entries(value).map(([key, amount]) => [key, typeof amount === "number" ? Math.round(amount * multiplier * 1000) / 1000 : null])) as FoodPackageNutritionSnapshot;
}

function completePackageNutrition(value: FoodPackageNutritionSnapshot | null) {
  return Boolean(value && [value.calories, value.carbs_g, value.protein_g, value.fat_g].every((amount) => typeof amount === "number" && Number.isFinite(amount) && amount >= 0));
}

/** Reconciles package facts without mutating the barcode/catalog response. */
export function reconcileFoodPackageProfile(input: FoodPackageProfileInput): FoodPackageProfile {
  const metadata = packageProfileRecord(input.metadata);
  const stored = packageProfileRecord(metadata.package_profile);
  const summary = packageProfileRecord(metadata.source_summary);
  const inventory = packageProfileRecord(metadata.inventory_measurement_profile);
  const records = [stored, metadata, summary];
  const firstNumber = (...keys: string[]) => { for (const record of records) { const value = packageProfileNumber(...keys.map((key) => record[key])); if (value !== null) return value; } return null; };
  const firstText = (...keys: string[]) => { for (const record of records) { const value = packageProfileText(...keys.map((key) => record[key])); if (value) return value; } return null; };
  const materialSource: FoodPackageProfileSource = input.source === "user_food_resource" ? "user_food_resource" : input.source === "open_food_facts" ? "external_barcode" : "foods_catalog";
  const fieldSources = { ...packageProfileRecord(stored.fieldSources) } as Record<string, FoodPackageProfileSource>;
  const fieldConfidence = { ...packageProfileRecord(stored.fieldConfidence) } as Record<string, FoodPackageProfileConfidence>;
  const fieldStatus = { ...packageProfileRecord(stored.fieldStatus) } as Record<string, "explicit" | "derived" | "inferred" | "confirmed">;
  const mark = (field: string, source: FoodPackageProfileSource = materialSource, confidence: FoodPackageProfileConfidence = "high", status: "explicit" | "derived" | "inferred" | "confirmed" = "explicit") => { fieldSources[field] ??= source; fieldConfidence[field] ??= confidence; fieldStatus[field] ??= status; };
  const packageText = firstText("originalPackageText", "original_package_text", "net_weight", "quantity");
  const parsedPackage = parsePackageQuantityText(packageText);
  let netQuantityPerContainer = firstNumber("netQuantityPerContainer", "product_quantity", "package_quantity") ?? parsedPackage?.quantity ?? null;
  let netQuantityUnit = normalizePackageUnit(firstText("netQuantityUnit", "product_quantity_unit", "package_quantity_unit") ?? parsedPackage?.unit);
  let netGramsPerContainer = firstNumber("netGramsPerContainer", "normalized_package_grams", "net_package_grams");
  let netMillilitersPerContainer = firstNumber("netMillilitersPerContainer", "normalized_package_ml", "net_package_ml");
  if (netQuantityPerContainer && netQuantityUnit && PACKAGE_WEIGHT_GRAMS[netQuantityUnit]) netGramsPerContainer ??= netQuantityPerContainer * PACKAGE_WEIGHT_GRAMS[netQuantityUnit];
  if (netQuantityPerContainer && netQuantityUnit && PACKAGE_VOLUME_ML[netQuantityUnit]) netMillilitersPerContainer ??= netQuantityPerContainer * PACKAGE_VOLUME_ML[netQuantityUnit];
  let servingQuantity = firstNumber("servingQuantity", "serving_quantity", "serving_size");
  let servingUnit = normalizePackageUnit(firstText("servingUnit", "serving_unit"));
  let servingGrams = firstNumber("servingGrams", "serving_grams");
  let servingMilliliters = firstNumber("servingMilliliters", "serving_milliliters", "serving_ml");
  if (servingQuantity && servingUnit && PACKAGE_WEIGHT_GRAMS[servingUnit]) servingGrams ??= servingQuantity * PACKAGE_WEIGHT_GRAMS[servingUnit];
  if (servingQuantity && servingUnit && PACKAGE_VOLUME_ML[servingUnit]) servingMilliliters ??= servingQuantity * PACKAGE_VOLUME_ML[servingUnit];
  let servingsPerContainer = firstNumber("servingsPerContainer", "servings_per_container", "servings_per_package");
  const explicitContainer = firstText("containerKey", "container_type", "countUnitKey") ?? packageProfileText(inventory.countUnitKey);
  const containerRule = NATURAL_CONTAINER_RULES.find((rule) => rule.key === explicitContainer?.toLowerCase()) ?? NATURAL_CONTAINER_RULES.find((rule) => rule.pattern.test(`${input.name ?? ""} ${packageText ?? ""}`));
  const containerKey = containerRule?.key ?? explicitContainer?.toLowerCase() ?? "package";
  const containerSingularLabel = firstText("containerSingularLabel", "container_singular_label") ?? packageProfileText(inventory.singularLabel) ?? containerRule?.singular ?? "package";
  const containerPluralLabel = firstText("containerPluralLabel", "container_plural_label") ?? packageProfileText(inventory.pluralLabel) ?? containerRule?.plural ?? "packages";
  const containersAdded = packageProfileNumber(input.containersAdded, stored.containersAdded, metadata.container_count) ?? 1;
  const basis = firstText("nutritionBasis", "nutrition_basis")?.toLowerCase();
  const nutritionBasis: FoodPackageNutritionBasis | null = basis === "serving" || basis === "per_serving" || basis === "computed_serving" ? "per_serving" : basis === "container" || basis === "per_container" ? "per_container" : basis === "100g" || basis === "per_100g" ? "per_100g" : null;
  let nutritionPerServing = normalizePackageNutrition(stored.nutritionPerServing ?? metadata.nutrition_per_serving);
  let nutritionPerContainer = normalizePackageNutrition(stored.nutritionPerContainer ?? metadata.nutrition_per_container);
  let nutritionPer100g = normalizePackageNutrition(stored.nutritionPer100g ?? metadata.nutrition_per_100g);
  const rowNutrition = normalizePackageNutrition(input);
  if (nutritionBasis === "per_serving") nutritionPerServing ??= rowNutrition;
  if (nutritionBasis === "per_container") nutritionPerContainer ??= rowNutrition;
  if (nutritionBasis === "per_100g") nutritionPer100g ??= rowNutrition;
  if (!servingsPerContainer && netGramsPerContainer && servingGrams) { servingsPerContainer = netGramsPerContainer / servingGrams; mark("servingsPerContainer", "derived", "high", "derived"); }
  else if (!servingsPerContainer && netMillilitersPerContainer && servingMilliliters) { servingsPerContainer = netMillilitersPerContainer / servingMilliliters; mark("servingsPerContainer", "derived", "high", "derived"); }
  else if (!netGramsPerContainer && !netMillilitersPerContainer && servingGrams && servingsPerContainer) { netGramsPerContainer = servingGrams * servingsPerContainer; netQuantityPerContainer ??= netGramsPerContainer; netQuantityUnit ??= "g"; mark("netGramsPerContainer", "derived", "high", "derived"); }
  else if (!netGramsPerContainer && !netMillilitersPerContainer && servingMilliliters && servingsPerContainer) { netMillilitersPerContainer = servingMilliliters * servingsPerContainer; netQuantityPerContainer ??= netMillilitersPerContainer; netQuantityUnit ??= "ml"; mark("netMillilitersPerContainer", "derived", "high", "derived"); }
  else if (!servingGrams && !servingMilliliters && netGramsPerContainer && servingsPerContainer) { servingGrams = netGramsPerContainer / servingsPerContainer; servingQuantity ??= servingGrams; servingUnit ??= "g"; mark("servingGrams", "derived", "high", "derived"); }
  else if (!servingGrams && !servingMilliliters && netMillilitersPerContainer && servingsPerContainer) { servingMilliliters = netMillilitersPerContainer / servingsPerContainer; servingQuantity ??= servingMilliliters; servingUnit ??= "ml"; mark("servingMilliliters", "derived", "high", "derived"); }
  if (!nutritionPerContainer && nutritionPerServing && servingsPerContainer) { nutritionPerContainer = scalePackageNutrition(nutritionPerServing, servingsPerContainer); mark("nutritionPerContainer", "derived", "high", "derived"); }
  if (!nutritionPerContainer && nutritionPer100g && netGramsPerContainer) { nutritionPerContainer = scalePackageNutrition(nutritionPer100g, netGramsPerContainer / 100); mark("nutritionPerContainer", "derived", "high", "derived"); }
  if (!nutritionPerServing && nutritionPerContainer && servingsPerContainer) { nutritionPerServing = scalePackageNutrition(nutritionPerContainer, 1 / servingsPerContainer); mark("nutritionPerServing", "derived", "high", "derived"); }
  const conflicts: FoodPackageProfileConflict[] = [];
  if (netGramsPerContainer && servingGrams && servingsPerContainer) { const implied = servingGrams * servingsPerContainer; if (Math.abs(implied - netGramsPerContainer) / Math.max(implied, netGramsPerContainer) > PACKAGE_PROFILE_TOLERANCE) conflicts.push({ field: "packageServingRelationship", message: "Package details conflict", facts: [`Package says ${Math.round(netGramsPerContainer * 10) / 10}g`, `Serving facts imply ${Math.round(implied * 10) / 10}g`] }); }
  if (netMillilitersPerContainer && servingMilliliters && servingsPerContainer) { const implied = servingMilliliters * servingsPerContainer; if (Math.abs(implied - netMillilitersPerContainer) / Math.max(implied, netMillilitersPerContainer) > PACKAGE_PROFILE_TOLERANCE) conflicts.push({ field: "packageServingVolumeRelationship", message: "Package details conflict", facts: [`Package says ${Math.round(netMillilitersPerContainer * 10) / 10}ml`, `Serving facts imply ${Math.round(implied * 10) / 10}ml`] }); }
  const productName = packageProfileText(input.name, stored.productName, metadata.source_product_name) ?? "";
  const missingFields: string[] = [];
  if (!productName) missingFields.push("productName");
  if (!containerKey || !containerSingularLabel || !containerPluralLabel) missingFields.push("containerType");
  if (!containersAdded) missingFields.push("containersAdded");
  if (!netQuantityPerContainer) missingFields.push("netQuantityPerContainer");
  if (!netQuantityUnit) missingFields.push("netQuantityUnit");
  if (!servingQuantity) missingFields.push("servingQuantity");
  if (!servingUnit) missingFields.push("servingUnit");
  if (!servingsPerContainer) missingFields.push("servingsPerContainer");
  if (!nutritionBasis) missingFields.push("nutritionBasis");
  const basisNutrition = nutritionBasis === "per_container" ? nutritionPerContainer : nutritionBasis === "per_100g" ? nutritionPer100g : nutritionPerServing;
  for (const [key, label] of [["calories", "calories"], ["carbs_g", "carbs"], ["protein_g", "protein"], ["fat_g", "fat"]] as const) if (!basisNutrition || typeof basisNutrition[key] !== "number" || !Number.isFinite(basisNutrition[key])) missingFields.push(label);
  const connected = nutritionBasis === "per_container" ? completePackageNutrition(nutritionPerContainer) : nutritionBasis === "per_serving" ? Boolean(servingsPerContainer && completePackageNutrition(nutritionPerServing)) : nutritionBasis === "per_100g" ? Boolean(netGramsPerContainer && completePackageNutrition(nutritionPer100g)) : false;
  if (nutritionBasis && !connected) missingFields.push("nutritionConversion");
  ["barcode", "productName", "containerKey", "containersAdded", "netQuantityPerContainer", "netQuantityUnit", "servingQuantity", "servingUnit", "servingsPerContainer", "nutritionBasis"].forEach((field) => mark(field));
  const userConfirmedFields = Array.isArray(stored.userConfirmedFields) ? stored.userConfirmedFields.filter((item): item is string => typeof item === "string") : [];
  return { version: 1, barcode: normalizeFoodBarcode(packageProfileText(input.barcode, stored.barcode, metadata.barcode) ?? "") || null, productName, brandName: packageProfileText(input.brand_name, stored.brandName, metadata.source_brand_name), containerKey, containerSingularLabel, containerPluralLabel, containersAdded, netQuantityPerContainer, netQuantityUnit, netGramsPerContainer, netMillilitersPerContainer, servingQuantity, servingUnit, servingGrams, servingMilliliters, servingsPerContainer, nutritionBasis, nutritionPerServing, nutritionPerContainer, nutritionPer100g, fieldSources, fieldConfidence, fieldStatus, originalPackageText: packageText, originalServingText: firstText("originalServingText", "serving_size_text", "serving_size"), userConfirmedFields, completeness: conflicts.length ? "conflict" : missingFields.length ? "incomplete" : "complete", missingFields: [...new Set(missingFields)], conflicts };
}

function detectOpenFoodFactsContainer(product: OpenFoodFactsProduct, productName: string) {
  const explicitPackaging = [product.packaging, product.packaging_text, product.packaging_tags]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map(coerceOpenFoodFactsString)
    .filter((value): value is string => Boolean(value))
    .join(" ");
  const explicitMatch = NATURAL_CONTAINER_RULES.find((rule) => rule.pattern.test(explicitPackaging));
  if (explicitMatch) return { ...explicitMatch, source: "barcode" as const, confidence: "high" as const, originalText: explicitPackaging };

  const categoryText = [product.categories, product.categories_tags]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map(coerceOpenFoodFactsString)
    .filter((value): value is string => Boolean(value))
    .join(" ");
  const strongText = `${productName} ${categoryText}`;
  const nameMatch = NATURAL_CONTAINER_RULES.find((rule) => rule.pattern.test(strongText));
  if (nameMatch) return { ...nameMatch, source: "name_fallback" as const, confidence: "medium" as const, originalText: strongText.trim() };

  return { key: "package", singular: "package", plural: "packages", source: "name_fallback" as const, confidence: "medium" as const, originalText: explicitPackaging || null };
}

const FOOD_NAME_MAX_LENGTH = 160;
const FOOD_BRAND_MAX_LENGTH = 120;
const SERVING_UNIT_MAX_LENGTH = 24;
const MAX_SERVING_SIZE = 10000;
const MAX_SERVING_GRAMS = 5000;
const VALID_NORMALIZED_BARCODE_PATTERN = /^(\d{8}|\d{12}|\d{13}|\d{14})$/;
const FOOD_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
  cereal: [
    { department: "Pantry", aisle: "Rice & grains" },
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

export function getFoodBrowsePlacement(
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

const OPEN_FOOD_FACTS_BROWSE_RULES: readonly {
  categories: readonly string[];
  placement: FoodBrowsePlacement;
}[] = [
  { categories: ["frozen pizzas", "frozen pizza"], placement: { department: "Frozen", aisle: "Frozen meals" } },
  { categories: ["frozen meals", "frozen ready meals"], placement: { department: "Frozen", aisle: "Frozen meals" } },
  { categories: ["frozen vegetables"], placement: { department: "Frozen", aisle: "Frozen vegetables" } },
  { categories: ["frozen fruits"], placement: { department: "Frozen", aisle: "Frozen fruit" } },
  { categories: ["frozen fish", "frozen seafood", "frozen meats"], placement: { department: "Frozen", aisle: "Frozen protein" } },
  { categories: ["refrigerated meals", "refrigerated ready meals", "prepared meals", "ready meals"], placement: { department: "Prepared", aisle: "Ready meals" } },
  { categories: ["meal kits"], placement: { department: "Prepared", aisle: "Meal kits" } },
  { categories: ["canned tuna", "tunas", "tuna"], placement: { department: "Meat & Seafood", aisle: "Fish" } },
  { categories: ["fish"], placement: { department: "Meat & Seafood", aisle: "Fish" } },
  { categories: ["seafood"], placement: { department: "Meat & Seafood", aisle: "Seafood" } },
  { categories: ["chicken"], placement: { department: "Meat & Seafood", aisle: "Chicken" } },
  { categories: ["beef"], placement: { department: "Meat & Seafood", aisle: "Beef" } },
  { categories: ["pork"], placement: { department: "Meat & Seafood", aisle: "Pork" } },
  { categories: ["turkey"], placement: { department: "Meat & Seafood", aisle: "Turkey" } },
  { categories: ["yogurts", "yogurt"], placement: { department: "Dairy & Eggs", aisle: "Yogurt" } },
  { categories: ["milks", "milk"], placement: { department: "Dairy & Eggs", aisle: "Milk" } },
  { categories: ["cheeses", "cheese"], placement: { department: "Dairy & Eggs", aisle: "Cheese" } },
  { categories: ["eggs"], placement: { department: "Dairy & Eggs", aisle: "Eggs" } },
  { categories: ["butters", "creams", "butter", "cream"], placement: { department: "Dairy & Eggs", aisle: "Butter / Cream" } },
  { categories: ["breakfast cereals", "cereals"], placement: { department: "Pantry", aisle: "Rice & grains" } },
  { categories: ["pastas", "pasta"], placement: { department: "Pantry", aisle: "Pasta" } },
  { categories: ["breads", "tortillas"], placement: { department: "Pantry", aisle: "Bread & tortillas" } },
  { categories: ["legumes", "beans"], placement: { department: "Pantry", aisle: "Beans & legumes" } },
  { categories: ["canned foods"], placement: { department: "Pantry", aisle: "Canned foods" } },
  { categories: ["nut butters"], placement: { department: "Pantry", aisle: "Nut butters" } },
  { categories: ["cooking oils", "oils"], placement: { department: "Pantry", aisle: "Oils" } },
  { categories: ["potato chips", "chips"], placement: { department: "Snacks", aisle: "Chips" } },
  { categories: ["crackers"], placement: { department: "Snacks", aisle: "Crackers" } },
  { categories: ["nuts", "trail mixes"], placement: { department: "Snacks", aisle: "Nuts & trail mix" } },
  { categories: ["snack bars", "cereal bars"], placement: { department: "Snacks", aisle: "Bars" } },
  { categories: ["candies", "chocolates", "sweet snacks"], placement: { department: "Snacks", aisle: "Sweet snacks" } },
  { categories: ["sodas", "soda"], placement: { department: "Drinks", aisle: "Soda" } },
  { categories: ["waters", "water"], placement: { department: "Drinks", aisle: "Water" } },
  { categories: ["fruit juices", "juices"], placement: { department: "Drinks", aisle: "Juice" } },
  { categories: ["coffees", "teas", "coffee", "tea"], placement: { department: "Drinks", aisle: "Coffee / tea" } },
  { categories: ["energy drinks", "sports drinks"], placement: { department: "Drinks", aisle: "Sports / energy drinks" } },
  { categories: ["protein drinks"], placement: { department: "Drinks", aisle: "Protein drinks" } },
  { categories: ["ketchups", "ketchup"], placement: { department: "Condiments & Sauces", aisle: "Sauces" } },
  { categories: ["salad dressings", "dressings"], placement: { department: "Condiments & Sauces", aisle: "Dressings" } },
  { categories: ["spreads"], placement: { department: "Condiments & Sauces", aisle: "Spreads" } },
  { categories: ["seasonings", "spices"], placement: { department: "Condiments & Sauces", aisle: "Seasonings" } },
  { categories: ["sweeteners"], placement: { department: "Condiments & Sauces", aisle: "Sweeteners" } },
  { categories: ["fruits", "fruit"], placement: { department: "Produce", aisle: "Fruit" } },
  { categories: ["vegetables", "vegetable"], placement: { department: "Produce", aisle: "Vegetables" } },
  { categories: ["herbs", "fresh herbs"], placement: { department: "Produce", aisle: "Herbs" } },
];

function normalizeOpenFoodFactsCategories(value: unknown, tags: boolean) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return new Set(values.flatMap((item) => {
    if (typeof item !== "string") return [];
    const withoutLanguage = tags ? item.replace(/^[a-z]{2,3}:/i, "") : item;
    const normalized = normalizeFoodSearchText(withoutLanguage);
    return normalized ? [normalized] : [];
  }));
}

export function mapOpenFoodFactsCategoriesToBrowsePlacement(
  product: Pick<OpenFoodFactsProduct, "categories_tags" | "categories">,
): FoodBrowsePlacement | null {
  const tagCategories = normalizeOpenFoodFactsCategories(product.categories_tags, true);
  const namedCategories = normalizeOpenFoodFactsCategories(product.categories, false);

  for (const categories of [tagCategories, namedCategories]) {
    for (const rule of OPEN_FOOD_FACTS_BROWSE_RULES) {
      if (!rule.categories.some((category) => categories.has(category))) continue;
      return getFoodBrowsePlacement(rule.placement.department, rule.placement.aisle);
    }
  }
  return null;
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

  for (const placement of collectFoodMetadataPlacements(food.catalog_metadata)) {
    addFoodBrowsePlacement(placements, placement);
  }
  for (const placement of collectFoodMetadataPlacements(food.metadata)) {
    addFoodBrowsePlacement(placements, placement);
  }
  addFoodBrowsePlacement(
    placements,
    getFoodBrowsePlacement(food.browse_department, food.browse_aisle),
  );
  const normalizedName = normalizeFoodSearchText(food.normalized_name || food.name);
  for (const placement of FOOD_BROWSE_KNOWN_NAME_PLACEMENTS[normalizedName] ?? []) {
    addFoodBrowsePlacement(placements, placement);
  }

  return [...placements.values()];
}

export function getFoodBrowsePlacementForSection(
  food: FoodBrowsePlacementInput,
  department: FoodBrowseDepartmentLabel,
  aisle?: FoodBrowseAisleLabel,
): FoodBrowsePlacement | null {
  return (
    getFoodBrowsePlacements(food).find(
      (placement) =>
        placement.department === department &&
        (aisle === undefined || placement.aisle === aisle),
    ) ?? null
  );
}

export function getFoodPrimaryBrowseDepartment(
  food: FoodBrowsePlacementInput,
): FoodBrowseDepartmentLabel | null {
  return getFoodBrowsePlacements(food)[0]?.department ?? null;
}

export function getFoodPrimaryGroceryDepartment(
  food: FoodBrowsePlacementInput,
): FoodBrowseDepartmentLabel | null {
  return (
    getFoodBrowsePlacements(food).find(
      (placement) => placement.department !== "Everyday",
    )?.department ?? null
  );
}

export function normalizeFoodBarcode(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/[\s-]+/g, "");
  if (!/^\d+$/.test(normalized)) return null;

  return normalized.length > 0 ? normalized : null;
}

export function getAttachableFoodResourceId(
  existingFoodId: string | null,
  requestedFoodId: unknown,
) {
  if (existingFoodId !== null || typeof requestedFoodId !== "string") return null;
  const normalizedRequestedFoodId = requestedFoodId.trim();
  return FOOD_UUID_PATTERN.test(normalizedRequestedFoodId)
    ? normalizedRequestedFoodId
    : null;
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
    calories: number | null;
    carbs_g: number | null;
    protein_g: number | null;
    fat_g: number | null;
  } | null,
) {
  if (!nutrition) return false;

  return (
    (nutrition.calories ?? 0) > 0 ||
    (nutrition.carbs_g ?? 0) > 0 ||
    (nutrition.protein_g ?? 0) > 0 ||
    (nutrition.fat_g ?? 0) > 0
  );
}

export function extractOpenFoodFactsNutrition(product: OpenFoodFactsProduct) {
  if (!isOpenFoodFactsRecord(product.nutriments)) return null;

  const nutriments = product.nutriments;
  const serving = parseOpenFoodFactsServing(product);
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

  const servingNutrition = getNutritionForBasis("serving");
  const per100gNutrition = getNutritionForBasis("100g");

  if (servingNutrition) {
    return {
      ...servingNutrition,
      per_serving: {
        calories: servingNutrition.calories,
        carbs_g: servingNutrition.carbs_g,
        protein_g: servingNutrition.protein_g,
        fat_g: servingNutrition.fat_g,
      },
      per_100g: per100gNutrition
        ? {
            calories: per100gNutrition.calories,
            carbs_g: per100gNutrition.carbs_g,
            protein_g: per100gNutrition.protein_g,
            fat_g: per100gNutrition.fat_g,
          }
        : null,
      computed_from_100g: false,
      needs_review: false,
    };
  }

  if (!per100gNutrition) return null;

  const servingGrams = serving.serving_grams;
  if (servingGrams) {
    const multiplier = servingGrams / 100;
    const computedServingNutrition = {
      calories: roundFoodNutritionNumber(per100gNutrition.calories * multiplier),
      carbs_g: roundFoodNutritionNumber(per100gNutrition.carbs_g * multiplier),
      protein_g: roundFoodNutritionNumber(per100gNutrition.protein_g * multiplier),
      fat_g: roundFoodNutritionNumber(per100gNutrition.fat_g * multiplier),
    };

    return {
      basis: "computed_serving" as const,
      ...computedServingNutrition,
      per_serving: computedServingNutrition,
      per_100g: {
        calories: per100gNutrition.calories,
        carbs_g: per100gNutrition.carbs_g,
        protein_g: per100gNutrition.protein_g,
        fat_g: per100gNutrition.fat_g,
      },
      computed_from_100g: true,
      needs_review: false,
    };
  }

  return {
    ...per100gNutrition,
    per_serving: {
      calories: per100gNutrition.calories,
      carbs_g: per100gNutrition.carbs_g,
      protein_g: per100gNutrition.protein_g,
      fat_g: per100gNutrition.fat_g,
    },
    per_100g: {
      calories: per100gNutrition.calories,
      carbs_g: per100gNutrition.carbs_g,
      protein_g: per100gNutrition.protein_g,
      fat_g: per100gNutrition.fat_g,
    },
    computed_from_100g: false,
    needs_review: true,
  };
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
      : null;

  return {
    serving_size: sanitizePositiveNumber(servingSize, MAX_SERVING_SIZE),
    serving_unit: servingUnit,
    serving_grams: sanitizePositiveNumber(servingGrams, MAX_SERVING_GRAMS),
  };
}

function parseOpenFoodFactsPackage(product: OpenFoodFactsProduct, servingGrams: number | null) {
  const quantityText = coerceOpenFoodFactsString(product.quantity);
  const productQuantity = parseOpenFoodFactsNumber(product.product_quantity);
  const productQuantityUnit =
    parseServingUnit(coerceOpenFoodFactsString(product.product_quantity_unit)) ??
    (quantityText?.match(/\b(g|gram|grams|ml|milliliter|milliliters)\b/i)?.[1]
      ? parseServingUnit(quantityText.match(/\b(g|gram|grams|ml|milliliter|milliliters)\b/i)?.[1] ?? null)
      : null);
  const servingsPerContainer =
    parseOpenFoodFactsNumber(product.servings_per_container) ??
    parseOpenFoodFactsNumber(product.servings_per_package);
  const computedServingsPerContainer =
    servingsPerContainer === null &&
    productQuantity !== null &&
    productQuantityUnit === "g" &&
    servingGrams
      ? roundFoodNutritionNumber(productQuantity / servingGrams)
      : null;

  return {
    quantity: quantityText,
    product_quantity: sanitizePositiveNumber(productQuantity, MAX_SERVING_SIZE * 100),
    product_quantity_unit: productQuantityUnit,
    net_weight:
      productQuantity !== null && productQuantityUnit
        ? `${roundFoodNutritionNumber(productQuantity)}${productQuantityUnit}`
        : quantityText,
    explicit_servings_per_container: sanitizePositiveNumber(servingsPerContainer, MAX_SERVING_SIZE),
    inferred_servings_per_container: sanitizePositiveNumber(
      computedServingsPerContainer,
      MAX_SERVING_SIZE,
    ),
    servings_per_container:
      sanitizePositiveNumber(servingsPerContainer, MAX_SERVING_SIZE) ??
      sanitizePositiveNumber(computedServingsPerContainer, MAX_SERVING_SIZE),
    servings_per_container_source:
      servingsPerContainer !== null
        ? "explicit"
        : computedServingsPerContainer !== null
          ? "inferred"
          : null,
  };
}

export function mapOpenFoodFactsProductToFoodInsert(
  product: OpenFoodFactsProduct,
  input: {
    barcode: string;
    createdByUserId?: string | null;
    allowIncompleteNutrition?: boolean;
  },
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
  const foodName = name as string;

  const brandName = compactOpenFoodFactsString(product.brands, FOOD_BRAND_MAX_LENGTH);
  const normalizedName = normalizeFoodSearchText(name);
  if (!normalizedName) return null;

  const normalizedBrandName = brandName ? normalizeFoodSearchText(brandName) : null;
  const parsedServing = parseOpenFoodFactsServing(product);
  const nutrition = extractOpenFoodFactsNutrition(product);
  if (!hasUsefulOpenFoodFactsNutrition(nutrition) && !input.allowIncompleteNutrition) {
    return null;
  }

  // A 100g nutrition basis is not a label serving. Keep it unresolved unless
  // the provider supplied an actual serving measurement.
  const serving = parsedServing;
  const packageInfo = parseOpenFoodFactsPackage(product, serving.serving_grams);
  const container = detectOpenFoodFactsContainer(product, foodName);
  const normalizedServingUnit = serving.serving_unit?.trim().toLowerCase() ?? null;
  const hasContainerNutritionBasis = Boolean(
    nutrition &&
      normalizedServingUnit &&
      [
        "container",
        "package",
        "pack",
        "pkg",
        container.key,
        container.singular,
        container.plural,
      ].includes(normalizedServingUnit),
  );
  const externalId = normalizedBarcode;
  const nutritionPerServing = nutrition?.per_serving ?? {
    calories: null,
    carbs_g: null,
    protein_g: null,
    fat_g: null,
  };
  const nutritionPer100g = nutrition?.per_100g ?? null;
  const needsReview = nutrition?.needs_review ?? true;
  const mappedBrowsePlacement = mapOpenFoodFactsCategoriesToBrowsePlacement(product);
  const exactNameBrowsePlacement = getFoodBrowsePlacements({ name: foodName }).find(
    (placement) => placement.department !== "Everyday",
  );
  const browsePlacement = mappedBrowsePlacement ?? exactNameBrowsePlacement ?? null;
  const metadata: Json = {
    source: "open_food_facts",
    source_summary: {
      source: "open_food_facts",
      code: externalId,
      barcode,
      product_name: foodName,
      brands: brandName,
      quantity: packageInfo.quantity,
      product_quantity: packageInfo.product_quantity,
      product_quantity_unit: packageInfo.product_quantity_unit,
      net_weight: packageInfo.net_weight,
      explicit_servings_per_container: packageInfo.explicit_servings_per_container,
      inferred_servings_per_container: packageInfo.inferred_servings_per_container,
      servings_per_container: packageInfo.servings_per_container,
      servings_per_container_source: packageInfo.servings_per_container_source,
      serving_size: coerceOpenFoodFactsString(product.serving_size),
      serving_quantity: parseOpenFoodFactsNumber(product.serving_quantity),
      serving_quantity_unit: coerceOpenFoodFactsString(product.serving_quantity_unit),
      serving_unit: serving.serving_unit,
      serving_grams: serving.serving_grams,
      nutrition_basis: hasContainerNutritionBasis ? "per_container" : nutrition?.basis ?? null,
      nutrition_per_container: hasContainerNutritionBasis ? nutritionPerServing : null,
      nutrition_per_serving: nutritionPerServing,
      nutrition_per_100g: nutritionPer100g,
      nutrition_computed_from_100g: nutrition?.computed_from_100g ?? false,
      nutrition_needs_review: needsReview,
      nutrition_data_per: coerceOpenFoodFactsString(product.nutrition_data_per),
      container_type: container.key,
      container_source: container.source,
      container_confidence: container.confidence,
      original_package_text: container.originalText,
    },
    barcode,
    source_product_name: foodName,
    source_brand_name: brandName,
    serving_size_text: coerceOpenFoodFactsString(product.serving_size),
    serving_quantity: parseOpenFoodFactsNumber(product.serving_quantity),
    serving_unit: serving.serving_unit,
    serving_grams: serving.serving_grams,
    explicit_servings_per_container: packageInfo.explicit_servings_per_container,
    inferred_servings_per_container: packageInfo.inferred_servings_per_container,
    servings_per_container: packageInfo.servings_per_container,
    servings_per_container_source: packageInfo.servings_per_container_source,
    product_quantity: packageInfo.product_quantity,
    product_quantity_unit: packageInfo.product_quantity_unit,
    net_weight: packageInfo.net_weight,
    nutrition_per_serving: nutritionPerServing,
    nutrition_basis: hasContainerNutritionBasis ? "per_container" : nutrition?.basis ?? null,
    nutrition_per_container: hasContainerNutritionBasis ? nutritionPerServing : null,
    nutrition_per_100g: nutritionPer100g,
    nutrition_computed_from_100g: nutrition?.computed_from_100g ?? false,
    nutrition_needs_review: needsReview,
    container_type: container.key,
    container_singular_label: container.singular,
    container_plural_label: container.plural,
    container_source: container.source,
    container_confidence: container.confidence,
    original_package_text: container.originalText,
    inventory_measurement_profile: {
      preferredKind: "count",
      allowedKinds: ["count", "package", "weight", "serving"],
      countUnitKey: container.key,
      singularLabel: container.singular,
      pluralLabel: container.plural,
      ...(packageInfo.product_quantity && packageInfo.product_quantity_unit === "g"
        ? { gramsPerItem: packageInfo.product_quantity, netGramsPerContainer: packageInfo.product_quantity }
        : {}),
      ...(packageInfo.servings_per_container
        ? { servingsPerContainer: packageInfo.servings_per_container }
        : {}),
      source: container.source,
      confidence: container.confidence,
    },
    ...(browsePlacement ? { browse: [browsePlacement] } : {}),
  };
  (metadata as Record<string, unknown>).package_profile = reconcileFoodPackageProfile({
    barcode,
    name: foodName,
    brand_name: brandName,
    source: "open_food_facts",
    serving_size: serving.serving_size,
    serving_unit: serving.serving_unit,
    serving_grams: serving.serving_grams,
    calories: nutrition?.calories ?? null,
    carbs_g: nutrition?.carbs_g ?? null,
    protein_g: nutrition?.protein_g ?? null,
    fat_g: nutrition?.fat_g ?? null,
    metadata,
  });

  return {
    name: foodName,
    normalized_name: normalizedName,
    brand_name: brandName,
    normalized_brand_name: normalizedBrandName,
    barcode,
    normalized_barcode: normalizedBarcode,
    serving_size: serving.serving_size,
    serving_unit: serving.serving_unit,
    serving_grams: serving.serving_grams,
    calories: nutrition?.calories ?? null,
    carbs_g: nutrition?.carbs_g ?? null,
    protein_g: nutrition?.protein_g ?? null,
    fat_g: nutrition?.fat_g ?? null,
    source: "open_food_facts",
    external_source: "open_food_facts",
    external_id: externalId,
    dedupe_key: buildFoodDedupeKey({ barcode }),
    created_by_user_id: input.createdByUserId ?? null,
    is_active: true,
    metadata,
  };
}

export function mergeOpenFoodFactsFoodInsertWithExisting(
  foodInsert: FoodInsert,
  existingFood: Pick<FoodSearchResult, "id" | "metadata"> | null,
): FoodInsert {
  if (!existingFood) return foodInsert;

  const existingMetadata = existingFood.metadata && typeof existingFood.metadata === "object" && !Array.isArray(existingFood.metadata)
    ? existingFood.metadata as Record<string, Json | undefined>
    : {};
  const incomingMetadata = foodInsert.metadata && typeof foodInsert.metadata === "object" && !Array.isArray(foodInsert.metadata)
    ? foodInsert.metadata as Record<string, Json | undefined>
    : {};
  const existingPlacements = collectFoodMetadataPlacements(existingFood.metadata);
  const existingPhysicalPlacement = existingPlacements.find(
    (placement) => placement.department !== "Everyday",
  );
  const incomingPlacements = collectFoodMetadataPlacements(foodInsert.metadata);
  const selectedPlacements = existingPhysicalPlacement
    ? existingPlacements
    : [...existingPlacements, ...incomingPlacements];

  return {
    ...foodInsert,
    id: existingFood.id,
    metadata: {
      ...existingMetadata,
      ...incomingMetadata,
      ...(selectedPlacements.length > 0 ? { browse: selectedPlacements } : {}),
    },
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
