import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  fetchOpenFoodFactsExact,
  fetchUsdaExact,
  isCompleteUserOwnedResult,
  mergeExactProviderResults,
  parseBarcodeIdentity,
  providerDiagnostic,
  providerResultDiagnosticFields,
  type BarcodeResolutionMetadata,
  type BarcodeProviderResult,
  type ProviderDiagnostic,
} from "@/lib/nutrition/barcodeResolver";
import { reconcileFoodPackageProfile, type FoodBarcodeLookupResult, type FoodSearchResult } from "@/lib/nutrition/foods";
import { checkApiRateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
const FOOD_SELECT = "id,name,brand_name,source,serving_size,serving_unit,serving_grams,calories,carbs_g,protein_g,fat_g,metadata,normalized_barcode";
const ENDPOINT_RATE_LIMIT = { action: "nutrition.foods.barcode.endpoint", windowSeconds: 600, maxRequests: 60 } as const;
const EXTERNAL_RATE_LIMIT = { action: "nutrition.foods.barcode.external", windowSeconds: 3600, maxRequests: 20 } as const;

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function finite(value: unknown) { const parsed = Number(value); return value !== null && value !== "" && Number.isFinite(parsed) ? parsed : null; }
function mapFood(row: Record<string, unknown>): FoodSearchResult {
  return { id: String(row.id), name: String(row.name ?? ""), brand_name: typeof row.brand_name === "string" ? row.brand_name : null, source: String(row.source ?? "foods"), serving_size: finite(row.serving_size), serving_unit: typeof row.serving_unit === "string" ? row.serving_unit : null, serving_grams: finite(row.serving_grams), calories: finite(row.calories), carbs_g: finite(row.carbs_g), protein_g: finite(row.protein_g), fat_g: finite(row.fat_g), metadata: row.metadata as FoodSearchResult["metadata"] };
}
function providerResult(provider: "user_food_resource" | "foods_catalog", identity: NonNullable<ReturnType<typeof parseBarcodeIdentity>>, food: FoodSearchResult, matchedBarcode: string, id: string): BarcodeProviderResult {
  const profile = reconcileFoodPackageProfile({ ...food, barcode: identity.canonicalGtin, containersAdded: 1 });
  food.metadata = { ...record(food.metadata), barcode: identity.canonicalGtin, barcode_variants: identity.variants, package_profile: { ...profile, containersAdded: 1 } } as FoodSearchResult["metadata"];
  return { provider, requestedBarcode: identity.canonicalGtin, matchedBarcode, exactMatch: true, providerRecordId: id, fetchedAt: new Date().toISOString(), food, explicitFields: ["productName", "brandName", ...(profile.netQuantityPerContainer ? ["netQuantityPerContainer", "netQuantityUnit"] : []), ...(profile.servingQuantity ? ["servingQuantity", "servingUnit"] : []), ...(profile.servingsPerContainer ? ["servingsPerContainer"] : []), ...(profile.nutritionPerServing ? ["nutritionPerServing"] : []), ...(profile.nutritionPer100g ? ["nutritionPer100g"] : [])], warnings: [] };
}

function withRequestId(metadata: BarcodeResolutionMetadata, requestId: string): BarcodeResolutionMetadata {
  return { ...metadata, requestId };
}

function logIncompleteBarcodeLookup(metadata: BarcodeResolutionMetadata) {
  console.info("nutrition_barcode_incomplete_lookup", {
    requestId: metadata.requestId,
    canonicalBarcode: metadata.canonicalBarcode,
    providerOutcomes: Object.fromEntries(metadata.providerDiagnostics.map((item) => [item.provider, item.outcome])),
    exactMatchCounts: Object.fromEntries(metadata.providerDiagnostics.map((item) => [item.provider, item.canonicalExactMatchCount ?? (item.exactMatchFound ? 1 : 0)])),
    contributedFieldNames: Object.fromEntries(metadata.providerDiagnostics.map((item) => [item.provider, item.contributedFields])),
    finalMissingFields: metadata.missingFields,
  });
}

export async function GET(request: NextRequest) {
  const requestId = randomUUID();
  const identity = parseBarcodeIdentity(request.nextUrl.searchParams.get("barcode"));
  if (!identity) return NextResponse.json({ food: null, source: null, status: "invalid_barcode" } satisfies FoodBarcodeLookupResult, { status: 400 });
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase client not initialized" }, { status: 500 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const endpointLimit = await checkApiRateLimit({ userId: user.id, ...ENDPOINT_RATE_LIMIT });
  if (!endpointLimit.allowed) return NextResponse.json({ food: null, source: null, status: "rate_limited", retryAfterSeconds: endpointLimit.retryAfterSeconds } satisfies FoodBarcodeLookupResult, { status: 429 });

  const localResults: BarcodeProviderResult[] = [];
  const localDiagnostics: ProviderDiagnostic[] = [];
  const userQueriedVariants: string[] = [];
  let userOwnedExactMatchFound = false;
  for (const variant of identity.variants) {
    userQueriedVariants.push(variant);
    const { data, error } = await supabase.from("food_resources").select("id,name,brand_name,metadata,updated_at").eq("user_id", user.id).contains("metadata", { barcode: variant }).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return NextResponse.json({ error: "Unable to inspect saved barcode profile" }, { status: 500 });
    if (!data) continue;
    const metadata = record(data.metadata); const snapshot = record(metadata.foodSnapshot);
    const food = mapFood({ id: `resource:${data.id}`, name: data.name, brand_name: data.brand_name, source: "user_food_resource", ...snapshot, metadata: { ...snapshot, ...metadata } });
    const result = providerResult("user_food_resource", identity, food, variant, String(data.id));
    userOwnedExactMatchFound = true;
    localDiagnostics.push(providerDiagnostic({ provider: "user_food_resource", attempted: true, outcome: "matched", queriedBarcodeVariants: userQueriedVariants, exactMatchFound: true, profileComplete: reconcileFoodPackageProfile(result.food).completeness === "complete", fieldsPresentOnExactResult: providerResultDiagnosticFields(result) }));
    if (isCompleteUserOwnedResult(result)) {
      const resolved = mergeExactProviderResults(identity, [result], localDiagnostics);
      return NextResponse.json({ food: resolved.food, source: "user_food_resource", status: "found", barcodeResolution: withRequestId(resolved.metadata, requestId) } satisfies FoodBarcodeLookupResult);
    }
    localResults.push(result); break;
  }
  if (!userOwnedExactMatchFound) localDiagnostics.push(providerDiagnostic({ provider: "user_food_resource", attempted: true, outcome: "no_results", queriedBarcodeVariants: userQueriedVariants, exactMatchFound: false, profileComplete: null, rejectionReason: "No user-owned exact barcode match found" }));

  const { data: sharedRows, error: sharedError } = await supabase.from("foods").select(FOOD_SELECT).in("normalized_barcode", identity.variants).eq("is_active", true).limit(10);
  if (sharedError) return NextResponse.json({ error: "Unable to inspect shared barcode catalog" }, { status: 500 });
  const shared = (sharedRows ?? [])[0] as unknown as Record<string, unknown> | undefined;
  if (shared) {
    const result = providerResult("foods_catalog", identity, mapFood(shared), String(shared.normalized_barcode), String(shared.id));
    localResults.push(result);
    localDiagnostics.push(providerDiagnostic({ provider: "foods_catalog", attempted: true, outcome: "matched", queriedBarcodeVariants: identity.variants, exactMatchFound: true, profileComplete: reconcileFoodPackageProfile(result.food).completeness === "complete", fieldsPresentOnExactResult: providerResultDiagnosticFields(result) }));
  } else {
    localDiagnostics.push(providerDiagnostic({ provider: "foods_catalog", attempted: true, outcome: "no_results", queriedBarcodeVariants: identity.variants, exactMatchFound: false, profileComplete: null, rejectionReason: "No shared foods exact barcode match found" }));
  }

  const externalLimit = await checkApiRateLimit({ userId: user.id, ...EXTERNAL_RATE_LIMIT });
  const externalResults: BarcodeProviderResult[] = [];
  let diagnostics: ProviderDiagnostic[] = [];
  if (externalLimit.allowed) {
    const settled = await Promise.allSettled([fetchUsdaExact(identity, process.env.USDA_FDC_API_KEY), fetchOpenFoodFactsExact(identity)]);
    for (const [index, item] of settled.entries()) {
      if (item.status === "fulfilled") { diagnostics.push(item.value.diagnostic); if (item.value.result) externalResults.push(item.value.result); }
      else diagnostics.push(providerDiagnostic({ provider: index === 0 ? "usda_fdc" : "open_food_facts", configured: index === 0 ? Boolean(process.env.USDA_FDC_API_KEY) : undefined, attempted: true, outcome: "http_error", queriedBarcodeVariants: [], warning: "Provider request failed" }));
    }
  } else diagnostics = [
    providerDiagnostic({ provider: "usda_fdc", configured: Boolean(process.env.USDA_FDC_API_KEY), attempted: false, outcome: "rate_limited", queriedBarcodeVariants: [], warning: "External lookup rate limited" }),
    providerDiagnostic({ provider: "open_food_facts", attempted: false, outcome: "rate_limited", queriedBarcodeVariants: [], warning: "External lookup rate limited" }),
  ];

  const resolved = mergeExactProviderResults(identity, [...localResults, ...externalResults], [...localDiagnostics, ...diagnostics]);
  const barcodeResolution = withRequestId(resolved.metadata, requestId);
  if (!resolved.food) {
    const providerUnavailable = diagnostics.some((item) => item.status === "timeout" || (item.status === "unavailable" && item.attempted));
    return NextResponse.json({ food: null, source: null, status: providerUnavailable ? "external_error" : "not_found", barcodeResolution } satisfies FoodBarcodeLookupResult);
  }
  if (resolved.profile?.completeness !== "complete") {
    const status = resolved.profile?.completeness === "conflict" ? "conflict" : "incomplete";
    if (status === "incomplete") logIncompleteBarcodeLookup(barcodeResolution);
    return NextResponse.json({ food: resolved.food, source: null, status, barcodeResolution } satisfies FoodBarcodeLookupResult);
  }
  return NextResponse.json({ food: resolved.food, source: "barcode_resolver", status: "found", barcodeResolution } satisfies FoodBarcodeLookupResult);
}
