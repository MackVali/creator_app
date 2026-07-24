import "server-only";

import {
  mapOpenFoodFactsProductToFoodInsert,
  reconcileFoodPackageProfile,
  type FoodPackageProfile,
  type FoodSearchResult,
  type OpenFoodFactsProduct,
} from "@/lib/nutrition/foods";

export type BarcodeProvider = "user_food_resource" | "foods_catalog" | "usda_fdc" | "open_food_facts";
export type BarcodeIdentity = { raw: string; digits: string; canonicalGtin: string; variants: string[]; checkDigitValid: boolean };
export type BarcodeDiagnosticField =
  | "productName"
  | "brand"
  | "container"
  | "packageQuantity"
  | "servingSize"
  | "servingsPerContainer"
  | "nutritionBasis"
  | "calories"
  | "carbohydrates"
  | "protein"
  | "fat";
export type ProviderDiagnosticOutcome =
  | "skipped_missing_key"
  | "matched"
  | "no_results"
  | "no_exact_match"
  | "rejected_invalid_provider_barcode"
  | "timeout"
  | "unauthorized"
  | "rate_limited"
  | "http_error"
  | "parse_error";
export type ProviderDiagnostic = {
  provider: BarcodeProvider;
  status: "matched" | "not_found" | "skipped" | "timeout" | "unavailable" | "rejected";
  attempted: boolean;
  outcome: ProviderDiagnosticOutcome;
  configured?: boolean;
  httpStatus?: number;
  queriedBarcodeVariants: string[];
  totalSearchResultCount?: number;
  canonicalExactMatchCount?: number;
  matchedProviderGtin?: string;
  matchedFdcId?: string;
  returnedProductCode?: string;
  canonicalExactMatch?: boolean;
  exactMatchFound?: boolean;
  profileComplete?: boolean | null;
  fieldsPresentOnExactResult?: BarcodeDiagnosticField[];
  contributedFields: BarcodeDiagnosticField[];
  fieldsPresentButRejected?: BarcodeDiagnosticField[];
  rejectionReason?: string;
  warning?: string;
};
export type BarcodeProviderResult = {
  provider: BarcodeProvider;
  requestedBarcode: string;
  matchedBarcode: string;
  exactMatch: boolean;
  providerRecordId: string | null;
  fetchedAt: string;
  food: FoodSearchResult;
  explicitFields: string[];
  warnings: string[];
};
export type BarcodeResolutionMetadata = {
  requestId?: string;
  canonicalBarcode: string;
  barcodeVariants: string[];
  exactMatch: boolean;
  providersQueried: BarcodeProvider[];
  providersMatched: BarcodeProvider[];
  providersFailed: ProviderDiagnostic[];
  providerDiagnostics: ProviderDiagnostic[];
  mergedFieldSources: Record<string, { provider: BarcodeProvider | "derived"; providerRecordId: string | null; explicit: boolean; confidence: "high" | "medium" | "low"; fetchedAt?: string }>;
  profileCompleteness: FoodPackageProfile["completeness"];
  missingFields: string[];
  conflicts: FoodPackageProfile["conflicts"];
  notStagedReason: string | null;
  mergedDiagnostics: {
    canonicalBarcode: string;
    providersQueried: BarcodeProvider[];
    providersMatched: BarcodeProvider[];
    providersFailed: BarcodeProvider[];
    finalMissingFields: string[];
    finalConflicts: FoodPackageProfile["conflicts"];
    completeness: FoodPackageProfile["completeness"];
    notStagedReason: string | null;
  };
};

const VALID_LENGTHS = new Set([8, 12, 13, 14]);
const TIMEOUT_MS = 4500;

export function hasValidGs1CheckDigit(digits: string) {
  if (!VALID_LENGTHS.has(digits.length) || !/^\d+$/.test(digits)) return false;
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let index = body.length - 1, position = 0; index >= 0; index -= 1, position += 1) {
    sum += Number(body[index]) * (position % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1));
}

export function parseBarcodeIdentity(rawValue: unknown): BarcodeIdentity | null {
  const raw = typeof rawValue === "string" ? rawValue.trim() : "";
  const digits = raw.replace(/\D/g, "");
  if (!raw || !VALID_LENGTHS.has(digits.length) || !hasValidGs1CheckDigit(digits)) return null;
  const canonicalGtin = digits.padStart(14, "0");
  const variants = [8, 12, 13, 14]
    .filter((length) => length >= digits.length || canonicalGtin.slice(0, 14 - length).split("").every((digit) => digit === "0"))
    .map((length) => canonicalGtin.slice(14 - length))
    .filter((value) => VALID_LENGTHS.has(value.length) && hasValidGs1CheckDigit(value));
  return { raw, digits, canonicalGtin, variants: [...new Set([digits, ...variants])], checkDigitValid: true };
}

export function canonicalizeBarcode(value: unknown) {
  return parseBarcodeIdentity(value)?.canonicalGtin ?? null;
}

export function barcodesAreExact(left: unknown, right: unknown) {
  const leftKey = canonicalizeBarcode(left);
  return Boolean(leftKey && leftKey === canonicalizeBarcode(right));
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function number(value: unknown) { const parsed = Number(value); return value !== null && value !== "" && Number.isFinite(parsed) ? parsed : null; }
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function identifier(value: unknown) { return value === null || value === undefined || value === "" ? null : String(value); }
function nutrientValue(value: unknown) { return number(record(value).value ?? value); }
function completeNutrition(value: unknown) {
  const item = record(value);
  return ["calories", "carbs_g", "protein_g", "fat_g"].every((key) => number(item[key]) !== null);
}
function usdaNutrientValue(food: Record<string, unknown>, labelKey: string, nutrientIds: number[], nutrientNames: RegExp[]) {
  const labels = record(food.labelNutrients);
  const labelValue = nutrientValue(labels[labelKey]);
  if (labelValue !== null) return labelValue;
  const nutrients = Array.isArray(food.foodNutrients) ? food.foodNutrients : [];
  for (const item of nutrients) {
    const nutrient = record(record(item).nutrient);
    const id = number(nutrient.id ?? record(item).nutrientId ?? record(item).nutrientNumber);
    const name = text(nutrient.name ?? record(item).nutrientName);
    if ((id !== null && nutrientIds.includes(id)) || (name && nutrientNames.some((pattern) => pattern.test(name)))) {
      const value = nutrientValue(record(item).amount ?? record(item).value);
      if (value !== null) return value;
    }
  }
  return null;
}

function providerDiagnosticStatus(outcome: ProviderDiagnosticOutcome): ProviderDiagnostic["status"] {
  if (outcome === "matched") return "matched";
  if (outcome === "no_results" || outcome === "no_exact_match") return "not_found";
  if (outcome === "skipped_missing_key") return "skipped";
  if (outcome === "timeout") return "timeout";
  if (outcome === "rejected_invalid_provider_barcode") return "rejected";
  return "unavailable";
}

export function providerDiagnostic(input: Omit<ProviderDiagnostic, "status" | "contributedFields"> & { contributedFields?: BarcodeDiagnosticField[] }): ProviderDiagnostic {
  return {
    ...input,
    status: providerDiagnosticStatus(input.outcome),
    contributedFields: input.contributedFields ?? [],
  };
}

function classifyHttpOutcome(status: number): Extract<ProviderDiagnosticOutcome, "unauthorized" | "rate_limited" | "http_error"> {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 429) return "rate_limited";
  return "http_error";
}

function uniqueDiagnosticFields(fields: Array<BarcodeDiagnosticField | null | undefined>) {
  return [...new Set(fields.filter((field): field is BarcodeDiagnosticField => Boolean(field)))];
}

export function providerResultDiagnosticFields(result: BarcodeProviderResult | null): BarcodeDiagnosticField[] {
  if (!result) return [];
  const profile = reconcileFoodPackageProfile(result.food);
  const fields: Array<BarcodeDiagnosticField | null> = [
    result.food.name ? "productName" : null,
    result.food.brand_name ? "brand" : null,
    result.explicitFields.includes("netQuantityPerContainer") ? "container" : null,
    result.explicitFields.includes("netQuantityPerContainer") ? "packageQuantity" : null,
    result.explicitFields.includes("servingQuantity") || result.explicitFields.includes("servingUnit") ? "servingSize" : null,
    result.explicitFields.includes("servingsPerContainer") ? "servingsPerContainer" : null,
    profile.nutritionBasis ? "nutritionBasis" : null,
    number(result.food.calories) !== null ? "calories" : null,
    number(result.food.carbs_g) !== null ? "carbohydrates" : null,
    number(result.food.protein_g) !== null ? "protein" : null,
    number(result.food.fat_g) !== null ? "fat" : null,
  ];
  return uniqueDiagnosticFields(fields);
}

function usdaExactResultDiagnosticFields(food: Record<string, unknown>) {
  return uniqueDiagnosticFields([
    text(food.description) ? "productName" : null,
    text(food.brandName) || text(food.brandOwner) ? "brand" : null,
    text(food.packageWeight) ? "container" : null,
    text(food.packageWeight) ? "packageQuantity" : null,
    number(food.servingSize) !== null ? "servingSize" : null,
    text(food.servingSizeUnit) || number(food.servingSize) !== null ? "nutritionBasis" : null,
    usdaNutrientValue(food, "calories", [1008, 2047, 2048], /\benergy\b|\bcalories\b/i) !== null ? "calories" : null,
    usdaNutrientValue(food, "carbohydrates", [1005], /\bcarbohydrate\b/i) !== null ? "carbohydrates" : null,
    usdaNutrientValue(food, "protein", [1003], /\bprotein\b/i) !== null ? "protein" : null,
    usdaNutrientValue(food, "fat", [1004], /\btotal lipid\b|\bfat\b/i) !== null ? "fat" : null,
  ]);
}

function openFoodFactsExactResultDiagnosticFields(result: BarcodeProviderResult | null) {
  return providerResultDiagnosticFields(result);
}

export type UsdaSearchFood = { fdcId?: unknown; gtinUpc?: unknown; publicationDate?: unknown; modifiedDate?: unknown } & Record<string, unknown>;
type UsdaSearchPayload = {
  status: number;
  foods: UsdaSearchFood[];
  totalSearchResultCount: number;
  outcome?: ProviderDiagnosticOutcome;
  warning?: string;
  rejectionReason?: string;
};
function usdaBarcodeSearchVariants(identity: BarcodeIdentity) {
  return [...identity.variants].sort((left, right) => {
    const leftRank = left.length === 12 ? 0 : identity.variants.indexOf(left) + 1;
    const rightRank = right.length === 12 ? 0 : identity.variants.indexOf(right) + 1;
    return leftRank - rightRank;
  });
}
function usdaRevisionDate(food: UsdaSearchFood) {
  return String(food.modifiedDate ?? food.publicationDate ?? "");
}
function isUsdaBrandedFood(food: UsdaSearchFood) {
  const dataType = text(food.dataType);
  return !dataType || dataType.toLowerCase() === "branded";
}
export function collectExactUsdaSearchResults(identity: BarcodeIdentity, foods: UsdaSearchFood[]) {
  const byFdcId = new Map<string, UsdaSearchFood>();
  for (const food of foods) {
    const fdcId = identifier(food.fdcId);
    if (!fdcId || !isUsdaBrandedFood(food) || !barcodesAreExact(food.gtinUpc, identity.canonicalGtin)) continue;
    const current = byFdcId.get(fdcId);
    if (!current || usdaRevisionDate(food).localeCompare(usdaRevisionDate(current)) > 0) byFdcId.set(fdcId, food);
  }
  return [...byFdcId.values()].sort((a, b) => usdaRevisionDate(b).localeCompare(usdaRevisionDate(a)));
}
export function selectExactUsdaSearchResult(identity: BarcodeIdentity, foods: UsdaSearchFood[]) {
  return collectExactUsdaSearchResults(identity, foods)[0] ?? null;
}

export function normalizeUsdaFood(identity: BarcodeIdentity, food: Record<string, unknown>): BarcodeProviderResult | null {
  if (!barcodesAreExact(food.gtinUpc, identity.canonicalGtin)) return null;
  const nutrition = {
    calories: usdaNutrientValue(food, "calories", [1008, 2047, 2048], /\benergy\b|\bcalories\b/i),
    carbs_g: usdaNutrientValue(food, "carbohydrates", [1005], /\bcarbohydrate\b/i),
    protein_g: usdaNutrientValue(food, "protein", [1003], /\bprotein\b/i),
    fat_g: usdaNutrientValue(food, "fat", [1004], /\btotal lipid\b|\bfat\b/i),
  };
  const servingSize = number(food.servingSize);
  const servingUnit = text(food.servingSizeUnit)?.toLowerCase() ?? null;
  const packageWeight = text(food.packageWeight);
  const metadata: Record<string, unknown> = {
    barcode: identity.canonicalGtin, serving_quantity: servingSize, serving_unit: servingUnit,
    serving_grams: servingUnit === "g" ? servingSize : null,
    serving_size_text: text(food.householdServingFullText), nutrition_basis: "per_serving",
    nutrition_per_serving: nutrition,
    original_package_text: packageWeight,
    net_weight: packageWeight,
    quantity: packageWeight,
    provider_ids: { usda_fdc: String(food.fdcId ?? "") },
  };
  const result: FoodSearchResult = {
    id: `usda:${food.fdcId ?? identity.canonicalGtin}`, name: text(food.description) ?? "", brand_name: text(food.brandName) ?? text(food.brandOwner),
    source: "usda_fdc", serving_size: servingSize, serving_unit: servingUnit, serving_grams: servingUnit === "g" ? servingSize : null,
    calories: nutrition.calories, carbs_g: nutrition.carbs_g, protein_g: nutrition.protein_g, fat_g: nutrition.fat_g, metadata: metadata as FoodSearchResult["metadata"],
  };
  const profile = reconcileFoodPackageProfile({ ...result, barcode: identity.canonicalGtin });
  return { provider: "usda_fdc", requestedBarcode: identity.canonicalGtin, matchedBarcode: String(food.gtinUpc), exactMatch: true, providerRecordId: String(food.fdcId ?? "") || null, fetchedAt: new Date().toISOString(), food: result, explicitFields: ["productName", "brandName", ...(profile.netQuantityPerContainer ? ["netQuantityPerContainer", "netQuantityUnit"] : []), ...(profile.servingQuantity ? ["servingQuantity", "servingUnit"] : []), ...(profile.servingsPerContainer ? ["servingsPerContainer"] : []), ...(completeNutrition(nutrition) ? ["nutritionPerServing"] : [])], warnings: [] };
}

export function normalizeOpenFoodFactsFood(identity: BarcodeIdentity, product: OpenFoodFactsProduct): BarcodeProviderResult | null {
  if (!barcodesAreExact(product.code, identity.canonicalGtin)) return null;
  const insert = mapOpenFoodFactsProductToFoodInsert(product, { barcode: String(product.code), allowIncompleteNutrition: true });
  if (!insert) return null;
  const food: FoodSearchResult = { id: `off:${String(product.code)}`, name: insert.name, brand_name: insert.brand_name ?? null, source: "open_food_facts", serving_size: number(insert.serving_size), serving_unit: insert.serving_unit ?? null, serving_grams: number(insert.serving_grams), calories: number(insert.calories), carbs_g: number(insert.carbs_g), protein_g: number(insert.protein_g), fat_g: number(insert.fat_g), metadata: insert.metadata };
  const profile = reconcileFoodPackageProfile({ ...food, barcode: identity.canonicalGtin });
  return { provider: "open_food_facts", requestedBarcode: identity.canonicalGtin, matchedBarcode: String(product.code), exactMatch: true, providerRecordId: String(product.code), fetchedAt: new Date().toISOString(), food, explicitFields: ["productName", "brandName", ...(profile.netQuantityPerContainer ? ["netQuantityPerContainer", "netQuantityUnit"] : []), ...(profile.servingQuantity ? ["servingQuantity", "servingUnit"] : []), ...(profile.servingsPerContainer ? ["servingsPerContainer"] : []), ...(completeNutrition(profile.nutritionPerServing) ? ["nutritionPerServing"] : []), ...(completeNutrition(profile.nutritionPer100g) ? ["nutritionPer100g"] : [])], warnings: [] };
}

async function fetchJson(url: URL, init: RequestInit, fetchImpl: typeof fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try { const response = await fetchImpl(url, { ...init, signal: controller.signal, redirect: "error" }); return response; }
  finally { clearTimeout(timer); }
}

export async function fetchUsdaExact(identity: BarcodeIdentity, apiKey: string | undefined, fetchImpl: typeof fetch = fetch): Promise<{ result: BarcodeProviderResult | null; diagnostic: ProviderDiagnostic }> {
  const queriedBarcodeVariants: string[] = [];
  if (!apiKey) return { result: null, diagnostic: providerDiagnostic({ provider: "usda_fdc", configured: false, attempted: false, outcome: "skipped_missing_key", queriedBarcodeVariants, warning: "USDA key is not configured" }) };
  try {
    const searchVariants = usdaBarcodeSearchVariants(identity);
    queriedBarcodeVariants.push(...searchVariants);
    const searchPayloads: UsdaSearchPayload[] = await Promise.all(searchVariants.map(async (variant) => {
      const searchUrl = new URL("https://api.nal.usda.gov/fdc/v1/foods/search"); searchUrl.searchParams.set("api_key", apiKey);
      const response = await fetchJson(searchUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: variant, dataType: ["Branded"], pageSize: 10 }) }, fetchImpl);
      if (!response.ok) return { status: response.status, foods: [] as UsdaSearchFood[], totalSearchResultCount: 0, outcome: classifyHttpOutcome(response.status), warning: `USDA search HTTP ${response.status}` };
      let searchPayload: Record<string, unknown>;
      try {
        searchPayload = record(await response.json());
      } catch {
        return { status: response.status, foods: [] as UsdaSearchFood[], totalSearchResultCount: 0, outcome: "parse_error" as const, rejectionReason: "USDA search response could not be parsed" };
      }
      const foods = Array.isArray(searchPayload.foods) ? searchPayload.foods as UsdaSearchFood[] : [];
      return { status: response.status, foods, totalSearchResultCount: number(searchPayload.totalHits) ?? foods.length };
    }));
    const failedSearch = searchPayloads.find((payload) => payload.outcome);
    if (failedSearch?.outcome) return { result: null, diagnostic: providerDiagnostic({ provider: "usda_fdc", configured: true, attempted: true, outcome: failedSearch.outcome, httpStatus: failedSearch.status, queriedBarcodeVariants, warning: failedSearch.warning, rejectionReason: failedSearch.rejectionReason }) };
    const allFoods = searchPayloads.flatMap((payload) => payload.foods);
    const totalSearchResultCount = searchPayloads.reduce((total, payload) => total + payload.totalSearchResultCount, 0);
    const exactResults = collectExactUsdaSearchResults(identity, allFoods);
    const canonicalExactMatchCount = exactResults.length;
    const exact = exactResults[0] ?? null;
    const httpStatus = searchPayloads.at(-1)?.status;
    if (!exact) return { result: null, diagnostic: providerDiagnostic({ provider: "usda_fdc", configured: true, attempted: true, outcome: totalSearchResultCount ? "no_exact_match" : "no_results", httpStatus, queriedBarcodeVariants, totalSearchResultCount, canonicalExactMatchCount, rejectionReason: totalSearchResultCount ? "USDA returned branded results, but none matched the canonical barcode exactly" : "USDA returned no branded barcode search results" }) };
    const detailsUrl = new URL(`https://api.nal.usda.gov/fdc/v1/food/${encodeURIComponent(String(exact.fdcId))}`); detailsUrl.searchParams.set("api_key", apiKey);
    const detailsResponse = await fetchJson(detailsUrl, {}, fetchImpl);
    if (!detailsResponse.ok) return { result: null, diagnostic: providerDiagnostic({ provider: "usda_fdc", configured: true, attempted: true, outcome: classifyHttpOutcome(detailsResponse.status), httpStatus: detailsResponse.status, queriedBarcodeVariants, totalSearchResultCount, canonicalExactMatchCount, matchedProviderGtin: identifier(exact.gtinUpc) ?? undefined, matchedFdcId: identifier(exact.fdcId) ?? undefined, warning: `USDA details HTTP ${detailsResponse.status}` }) };
    let detailsPayload: Record<string, unknown>;
    try {
      detailsPayload = record(await detailsResponse.json());
    } catch {
      return { result: null, diagnostic: providerDiagnostic({ provider: "usda_fdc", configured: true, attempted: true, outcome: "parse_error", httpStatus: detailsResponse.status, queriedBarcodeVariants, totalSearchResultCount, canonicalExactMatchCount, matchedProviderGtin: identifier(exact.gtinUpc) ?? undefined, matchedFdcId: identifier(exact.fdcId) ?? undefined, rejectionReason: "USDA detail response could not be parsed" }) };
    }
    const selectedFood = { ...exact, ...detailsPayload, packageWeight: detailsPayload.packageWeight ?? exact.packageWeight };
    const result = normalizeUsdaFood(identity, selectedFood);
    const fieldsPresentOnExactResult = result ? providerResultDiagnosticFields(result) : usdaExactResultDiagnosticFields(selectedFood);
    return {
      result,
      diagnostic: providerDiagnostic({
        provider: "usda_fdc",
        configured: true,
        attempted: true,
        outcome: result ? "matched" : "rejected_invalid_provider_barcode",
        httpStatus: detailsResponse.status,
        queriedBarcodeVariants,
        totalSearchResultCount,
        canonicalExactMatchCount,
        matchedProviderGtin: identifier(selectedFood.gtinUpc) ?? undefined,
        matchedFdcId: identifier(selectedFood.fdcId) ?? undefined,
        canonicalExactMatch: result ? true : false,
        fieldsPresentOnExactResult,
        rejectionReason: result ? undefined : "USDA detail barcode was not an exact canonical match",
      }),
    };
  } catch (error) { return { result: null, diagnostic: providerDiagnostic({ provider: "usda_fdc", configured: true, attempted: true, outcome: error instanceof Error && error.name === "AbortError" ? "timeout" : "http_error", queriedBarcodeVariants, warning: "USDA request failed" }) }; }
}

export async function fetchOpenFoodFactsExact(identity: BarcodeIdentity, fetchImpl: typeof fetch = fetch): Promise<{ result: BarcodeProviderResult | null; diagnostic: ProviderDiagnostic }> {
  const queriedBarcodeVariants: string[] = [];
  try {
    const fields = "code,product_name,product_name_en,abbreviated_product_name,generic_name,brands,quantity,product_quantity,product_quantity_unit,serving_size,serving_quantity,serving_quantity_unit,servings_per_container,servings_per_package,packaging,packaging_text,packaging_tags,categories,categories_tags,nutrition_data_per,nutriments";
    for (const variant of identity.variants) {
      queriedBarcodeVariants.push(variant);
      const url = new URL(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(variant)}.json`); url.searchParams.set("fields", fields);
      const response = await fetchJson(url, { headers: { Accept: "application/json", "User-Agent": "CREATOR Grocery barcode resolver/1.0 (https://creator.app)" } }, fetchImpl);
      if (response.status === 404) continue;
      if (!response.ok) return { result: null, diagnostic: providerDiagnostic({ provider: "open_food_facts", attempted: true, outcome: classifyHttpOutcome(response.status), httpStatus: response.status, queriedBarcodeVariants, warning: `Open Food Facts HTTP ${response.status}` }) };
      let payload: Record<string, unknown>;
      try {
        payload = record(await response.json());
      } catch {
        return { result: null, diagnostic: providerDiagnostic({ provider: "open_food_facts", attempted: true, outcome: "parse_error", httpStatus: response.status, queriedBarcodeVariants, rejectionReason: "Open Food Facts response could not be parsed" }) };
      }
      const result = payload.status === 1 ? normalizeOpenFoodFactsFood(identity, record(payload.product) as OpenFoodFactsProduct) : null;
      const returnedProductCode = identifier(record(payload.product).code) ?? undefined;
      if (result) return { result, diagnostic: providerDiagnostic({ provider: "open_food_facts", attempted: true, outcome: "matched", httpStatus: response.status, queriedBarcodeVariants, returnedProductCode, canonicalExactMatch: true, fieldsPresentOnExactResult: openFoodFactsExactResultDiagnosticFields(result) }) };
      if (payload.status === 1) return { result: null, diagnostic: providerDiagnostic({ provider: "open_food_facts", attempted: true, outcome: "rejected_invalid_provider_barcode", httpStatus: response.status, queriedBarcodeVariants, returnedProductCode, canonicalExactMatch: false, rejectionReason: "Open Food Facts returned barcode was not an exact canonical match" }) };
    }
    return { result: null, diagnostic: providerDiagnostic({ provider: "open_food_facts", attempted: queriedBarcodeVariants.length > 0, outcome: "no_results", queriedBarcodeVariants, canonicalExactMatch: false, rejectionReason: "Open Food Facts returned no product for the queried variants" }) };
  } catch (error) { return { result: null, diagnostic: providerDiagnostic({ provider: "open_food_facts", attempted: true, outcome: error instanceof Error && error.name === "AbortError" ? "timeout" : "http_error", queriedBarcodeVariants, warning: error instanceof Error ? error.message : "Open Food Facts request failed" }) }; }
}

export function mergeExactProviderResults(identity: BarcodeIdentity, results: BarcodeProviderResult[], diagnostics: ProviderDiagnostic[] = []) {
  const precedence: BarcodeProvider[] = ["user_food_resource", "foods_catalog", "usda_fdc", "open_food_facts"];
  const sorted = [...results].filter((item) => item.exactMatch && barcodesAreExact(item.matchedBarcode, identity.canonicalGtin)).sort((a, b) => precedence.indexOf(a.provider) - precedence.indexOf(b.provider));
  const find = (field: string) => sorted.find((result) => result.explicitFields.includes(field));
  const identitySource = find("productName") ?? sorted[0];
  const servingSource = find("servingQuantity");
  const packageSource = find("netQuantityPerContainer");
  const servingsSource = find("servingsPerContainer");
  const nutritionSource = find("nutritionPerServing") ?? find("nutritionPer100g");
  const sourceMetadata = (source?: BarcodeProviderResult) => {
    const metadata = { ...record(source?.food.metadata) };
    // Provider-local reconciliations must not override the field-level merge.
    delete metadata.package_profile;
    return metadata;
  };
  const profileSeed = {
    ...sourceMetadata(packageSource), ...sourceMetadata(servingSource),
    ...(servingsSource ? { servings_per_container: reconcileFoodPackageProfile(servingsSource.food).servingsPerContainer } : {}),
    ...(nutritionSource ? sourceMetadata(nutritionSource) : {}),
  };
  const mergedFood: FoodSearchResult | null = identitySource ? {
    ...identitySource.food, id: `barcode:${identity.canonicalGtin}`, source: "barcode_resolver",
    serving_size: servingSource?.food.serving_size ?? null, serving_unit: servingSource?.food.serving_unit ?? null, serving_grams: servingSource?.food.serving_grams ?? null,
    calories: nutritionSource?.food.calories ?? null, carbs_g: nutritionSource?.food.carbs_g ?? null, protein_g: nutritionSource?.food.protein_g ?? null, fat_g: nutritionSource?.food.fat_g ?? null,
    metadata: { ...profileSeed, barcode: identity.canonicalGtin, barcode_variants: identity.variants, provider_ids: Object.fromEntries(sorted.map((item) => [item.provider, item.providerRecordId])), source_product_name: identitySource.food.name, source_brand_name: identitySource.food.brand_name } as FoodSearchResult["metadata"],
  } : null;
  const profile = mergedFood ? reconcileFoodPackageProfile({ ...mergedFood, barcode: identity.canonicalGtin }) : null;
  if (mergedFood && profile) mergedFood.metadata = { ...record(mergedFood.metadata), package_profile: profile } as FoodSearchResult["metadata"];
  const mergedFieldSources: BarcodeResolutionMetadata["mergedFieldSources"] = {};
  for (const [field, source] of [["productName", identitySource], ["packageQuantity", packageSource], ["servingMeasurement", servingSource], ["servingsPerContainer", servingsSource], ["nutrition", nutritionSource]] as const) if (source) mergedFieldSources[field] = { provider: source.provider, providerRecordId: source.providerRecordId, explicit: true, confidence: source.provider === "user_food_resource" || source.provider === "foods_catalog" ? "high" : "medium", fetchedAt: source.fetchedAt };
  if (profile?.fieldStatus.servingsPerContainer === "derived") mergedFieldSources.servingsPerContainer = { provider: "derived", providerRecordId: null, explicit: false, confidence: "high" };
  const fieldContributions = new Map<BarcodeProvider, Set<BarcodeDiagnosticField>>();
  const addContribution = (source: BarcodeProviderResult | undefined, fields: BarcodeDiagnosticField[]) => {
    if (!source) return;
    const current = fieldContributions.get(source.provider) ?? new Set<BarcodeDiagnosticField>();
    fields.forEach((field) => current.add(field));
    fieldContributions.set(source.provider, current);
  };
  addContribution(identitySource, ["productName", ...(identitySource?.food.brand_name ? ["brand" as const] : [])]);
  addContribution(packageSource, ["container", "packageQuantity"]);
  addContribution(servingSource, ["servingSize"]);
  addContribution(servingsSource, ["servingsPerContainer"]);
  addContribution(nutritionSource, ["nutritionBasis", "calories", "carbohydrates", "protein", "fat"]);
  const sortedDiagnostics = sorted.map((result) => diagnostics.find((item) => item.provider === result.provider) ?? providerDiagnostic({ provider: result.provider, attempted: true, outcome: "matched", queriedBarcodeVariants: [result.requestedBarcode], exactMatchFound: true, profileComplete: reconcileFoodPackageProfile(result.food).completeness === "complete", fieldsPresentOnExactResult: providerResultDiagnosticFields(result) }));
  const diagnosticsByProvider = new Map<BarcodeProvider, ProviderDiagnostic>();
  for (const item of [...diagnostics, ...sortedDiagnostics]) diagnosticsByProvider.set(item.provider, item);
  const providerDiagnostics = precedence.flatMap((provider) => {
    const item = diagnosticsByProvider.get(provider);
    if (!item) return [];
    const contributedFields = [...(fieldContributions.get(provider) ?? new Set<BarcodeDiagnosticField>())];
    const presentFields = item.fieldsPresentOnExactResult ?? providerResultDiagnosticFields(sorted.find((result) => result.provider === provider) ?? null);
    return [{
      ...item,
      contributedFields,
      fieldsPresentOnExactResult: presentFields,
      fieldsPresentButRejected: presentFields.filter((field) => !contributedFields.includes(field)),
    }];
  });
  const providersQueried = [...new Set([...sorted.map((item) => item.provider), ...providerDiagnostics.map((item) => item.provider)])];
  const providersMatched = sorted.map((item) => item.provider);
  const providerFailed = (item: ProviderDiagnostic) => !["matched", "no_results", "no_exact_match", "skipped_missing_key"].includes(item.outcome);
  const providersFailed = providerDiagnostics.filter(providerFailed);
  const missingFields = profile?.missingFields ?? ["productName"];
  const conflicts = profile?.conflicts ?? [];
  const profileCompleteness = profile?.completeness ?? "incomplete";
  const notStagedReason = !mergedFood
    ? "No exact barcode match was found from connected sources"
    : profileCompleteness === "conflict"
      ? "Conflicting exact barcode data prevented staging"
      : profileCompleteness === "incomplete"
        ? `Missing required package fields: ${missingFields.join(", ")}`
        : null;
  const metadata: BarcodeResolutionMetadata = {
    canonicalBarcode: identity.canonicalGtin,
    barcodeVariants: identity.variants,
    exactMatch: sorted.length > 0,
    providersQueried,
    providersMatched,
    providersFailed,
    providerDiagnostics,
    mergedFieldSources,
    profileCompleteness,
    missingFields,
    conflicts,
    notStagedReason,
    mergedDiagnostics: {
      canonicalBarcode: identity.canonicalGtin,
      providersQueried,
      providersMatched,
      providersFailed: providersFailed.map((item) => item.provider),
      finalMissingFields: missingFields,
      finalConflicts: conflicts,
      completeness: profileCompleteness,
      notStagedReason,
    },
  };
  return { food: mergedFood, profile, metadata };
}

export function isCompleteUserOwnedResult(result: BarcodeProviderResult) {
  return result.provider === "user_food_resource" && reconcileFoodPackageProfile(result.food).completeness === "complete";
}
