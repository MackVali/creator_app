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
export type ProviderDiagnostic = { provider: BarcodeProvider; status: "matched" | "not_found" | "skipped" | "timeout" | "unavailable" | "rejected"; warning?: string };
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
  canonicalBarcode: string;
  exactMatch: boolean;
  providersQueried: BarcodeProvider[];
  providersMatched: BarcodeProvider[];
  providersFailed: ProviderDiagnostic[];
  mergedFieldSources: Record<string, { provider: BarcodeProvider | "derived"; providerRecordId: string | null; explicit: boolean; confidence: "high" | "medium" | "low"; fetchedAt?: string }>;
  profileCompleteness: FoodPackageProfile["completeness"];
  missingFields: string[];
  conflicts: FoodPackageProfile["conflicts"];
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
function nutrientValue(value: unknown) { return number(record(value).value ?? value); }
function completeNutrition(value: unknown) {
  const item = record(value);
  return ["calories", "carbs_g", "protein_g", "fat_g"].every((key) => number(item[key]) !== null);
}

export type UsdaSearchFood = { fdcId?: unknown; gtinUpc?: unknown; publicationDate?: unknown; modifiedDate?: unknown } & Record<string, unknown>;
export function selectExactUsdaSearchResult(identity: BarcodeIdentity, foods: UsdaSearchFood[]) {
  return foods.filter((food) => barcodesAreExact(food.gtinUpc, identity.canonicalGtin)).sort((a, b) => String(b.modifiedDate ?? b.publicationDate ?? "").localeCompare(String(a.modifiedDate ?? a.publicationDate ?? "")))[0] ?? null;
}

export function normalizeUsdaFood(identity: BarcodeIdentity, food: Record<string, unknown>): BarcodeProviderResult | null {
  if (!barcodesAreExact(food.gtinUpc, identity.canonicalGtin)) return null;
  const labels = record(food.labelNutrients);
  const nutrition = {
    calories: nutrientValue(labels.calories), carbs_g: nutrientValue(labels.carbohydrates),
    protein_g: nutrientValue(labels.protein), fat_g: nutrientValue(labels.fat),
  };
  const servingSize = number(food.servingSize);
  const servingUnit = text(food.servingSizeUnit)?.toLowerCase() ?? null;
  const metadata: Record<string, unknown> = {
    barcode: identity.canonicalGtin, serving_quantity: servingSize, serving_unit: servingUnit,
    serving_grams: servingUnit === "g" ? servingSize : null,
    serving_size_text: text(food.householdServingFullText), nutrition_basis: "per_serving",
    nutrition_per_serving: nutrition,
    provider_ids: { usda_fdc: String(food.fdcId ?? "") },
  };
  const result: FoodSearchResult = {
    id: `usda:${food.fdcId ?? identity.canonicalGtin}`, name: text(food.description) ?? "", brand_name: text(food.brandName) ?? text(food.brandOwner),
    source: "usda_fdc", serving_size: servingSize, serving_unit: servingUnit, serving_grams: servingUnit === "g" ? servingSize : null,
    calories: nutrition.calories, carbs_g: nutrition.carbs_g, protein_g: nutrition.protein_g, fat_g: nutrition.fat_g, metadata: metadata as FoodSearchResult["metadata"],
  };
  return { provider: "usda_fdc", requestedBarcode: identity.canonicalGtin, matchedBarcode: String(food.gtinUpc), exactMatch: true, providerRecordId: String(food.fdcId ?? "") || null, fetchedAt: new Date().toISOString(), food: result, explicitFields: ["productName", "brandName", "servingQuantity", "servingUnit", ...(completeNutrition(nutrition) ? ["nutritionPerServing"] : [])], warnings: [] };
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
  if (!apiKey) return { result: null, diagnostic: { provider: "usda_fdc", status: "skipped", warning: "USDA_FDC_API_KEY is not configured" } };
  try {
    const searchUrl = new URL("https://api.nal.usda.gov/fdc/v1/foods/search"); searchUrl.searchParams.set("api_key", apiKey);
    const response = await fetchJson(searchUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: identity.digits, dataType: ["Branded"], pageSize: 10 }) }, fetchImpl);
    if (!response.ok) return { result: null, diagnostic: { provider: "usda_fdc", status: "unavailable", warning: `HTTP ${response.status}` } };
    const searchPayload = record(await response.json());
    const exact = selectExactUsdaSearchResult(identity, Array.isArray(searchPayload.foods) ? searchPayload.foods as UsdaSearchFood[] : []);
    if (!exact) return { result: null, diagnostic: { provider: "usda_fdc", status: "not_found" } };
    const detailsUrl = new URL(`https://api.nal.usda.gov/fdc/v1/food/${encodeURIComponent(String(exact.fdcId))}`); detailsUrl.searchParams.set("api_key", apiKey);
    const detailsResponse = await fetchJson(detailsUrl, {}, fetchImpl);
    if (!detailsResponse.ok) return { result: null, diagnostic: { provider: "usda_fdc", status: "unavailable", warning: `Details HTTP ${detailsResponse.status}` } };
    const result = normalizeUsdaFood(identity, record(await detailsResponse.json()));
    return { result, diagnostic: { provider: "usda_fdc", status: result ? "matched" : "rejected", warning: result ? undefined : "USDA details barcode was not an exact match" } };
  } catch (error) { return { result: null, diagnostic: { provider: "usda_fdc", status: error instanceof Error && error.name === "AbortError" ? "timeout" : "unavailable", warning: "USDA request failed" } }; }
}

export async function fetchOpenFoodFactsExact(identity: BarcodeIdentity, fetchImpl: typeof fetch = fetch): Promise<{ result: BarcodeProviderResult | null; diagnostic: ProviderDiagnostic }> {
  try {
    const fields = "code,product_name,product_name_en,abbreviated_product_name,generic_name,brands,quantity,product_quantity,product_quantity_unit,serving_size,serving_quantity,serving_quantity_unit,servings_per_container,servings_per_package,packaging,packaging_text,packaging_tags,categories,categories_tags,nutrition_data_per,nutriments";
    for (const variant of identity.variants) {
      const url = new URL(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(variant)}.json`); url.searchParams.set("fields", fields);
      const response = await fetchJson(url, { headers: { Accept: "application/json", "User-Agent": "CREATOR Grocery barcode resolver/1.0 (https://creator.app)" } }, fetchImpl);
      if (response.status === 404) continue;
      if (!response.ok) return { result: null, diagnostic: { provider: "open_food_facts", status: "unavailable", warning: `HTTP ${response.status}` } };
      const payload = record(await response.json());
      const result = payload.status === 1 ? normalizeOpenFoodFactsFood(identity, record(payload.product) as OpenFoodFactsProduct) : null;
      if (result) return { result, diagnostic: { provider: "open_food_facts", status: "matched" } };
      if (payload.status === 1) return { result: null, diagnostic: { provider: "open_food_facts", status: "rejected", warning: "Returned barcode was not an exact canonical match" } };
    }
    return { result: null, diagnostic: { provider: "open_food_facts", status: "not_found" } };
  } catch (error) { return { result: null, diagnostic: { provider: "open_food_facts", status: error instanceof Error && error.name === "AbortError" ? "timeout" : "unavailable", warning: error instanceof Error ? error.message : "Request failed" } }; }
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
  const metadata: BarcodeResolutionMetadata = { canonicalBarcode: identity.canonicalGtin, exactMatch: sorted.length > 0, providersQueried: [...new Set([...sorted.map((item) => item.provider), ...diagnostics.map((item) => item.provider)])], providersMatched: sorted.map((item) => item.provider), providersFailed: diagnostics.filter((item) => item.status !== "matched" && item.status !== "not_found"), mergedFieldSources, profileCompleteness: profile?.completeness ?? "incomplete", missingFields: profile?.missingFields ?? ["productName"], conflicts: profile?.conflicts ?? [] };
  return { food: mergedFood, profile, metadata };
}

export function isCompleteUserOwnedResult(result: BarcodeProviderResult) {
  return result.provider === "user_food_resource" && reconcileFoodPackageProfile(result.food).completeness === "complete";
}
