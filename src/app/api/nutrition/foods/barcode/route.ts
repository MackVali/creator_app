import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  fetchOpenFoodFactsExact,
  fetchUsdaExact,
  isCompleteUserOwnedResult,
  mergeExactProviderResults,
  parseBarcodeIdentity,
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

export async function GET(request: NextRequest) {
  const identity = parseBarcodeIdentity(request.nextUrl.searchParams.get("barcode"));
  if (!identity) return NextResponse.json({ food: null, source: null, status: "invalid_barcode" } satisfies FoodBarcodeLookupResult, { status: 400 });
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase client not initialized" }, { status: 500 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const endpointLimit = await checkApiRateLimit({ userId: user.id, ...ENDPOINT_RATE_LIMIT });
  if (!endpointLimit.allowed) return NextResponse.json({ food: null, source: null, status: "rate_limited", retryAfterSeconds: endpointLimit.retryAfterSeconds } satisfies FoodBarcodeLookupResult, { status: 429 });

  const localResults: BarcodeProviderResult[] = [];
  for (const variant of identity.variants) {
    const { data, error } = await supabase.from("food_resources").select("id,name,brand_name,metadata,updated_at").eq("user_id", user.id).contains("metadata", { barcode: variant }).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return NextResponse.json({ error: "Unable to inspect saved barcode profile" }, { status: 500 });
    if (!data) continue;
    const metadata = record(data.metadata); const snapshot = record(metadata.foodSnapshot);
    const food = mapFood({ id: `resource:${data.id}`, name: data.name, brand_name: data.brand_name, source: "user_food_resource", ...snapshot, metadata: { ...snapshot, ...metadata } });
    const result = providerResult("user_food_resource", identity, food, variant, String(data.id));
    if (isCompleteUserOwnedResult(result)) {
      const resolved = mergeExactProviderResults(identity, [result]);
      return NextResponse.json({ food: resolved.food, source: "user_food_resource", status: "found", barcodeResolution: resolved.metadata } satisfies FoodBarcodeLookupResult);
    }
    localResults.push(result); break;
  }

  const { data: sharedRows, error: sharedError } = await supabase.from("foods").select(FOOD_SELECT).in("normalized_barcode", identity.variants).eq("is_active", true).limit(10);
  if (sharedError) return NextResponse.json({ error: "Unable to inspect shared barcode catalog" }, { status: 500 });
  const shared = (sharedRows ?? [])[0] as unknown as Record<string, unknown> | undefined;
  if (shared) localResults.push(providerResult("foods_catalog", identity, mapFood(shared), String(shared.normalized_barcode), String(shared.id)));

  const externalLimit = await checkApiRateLimit({ userId: user.id, ...EXTERNAL_RATE_LIMIT });
  let externalResults: BarcodeProviderResult[] = [];
  let diagnostics: ProviderDiagnostic[] = [];
  if (externalLimit.allowed) {
    const settled = await Promise.allSettled([fetchUsdaExact(identity, process.env.USDA_FDC_API_KEY), fetchOpenFoodFactsExact(identity)]);
    for (const item of settled) {
      if (item.status === "fulfilled") { diagnostics.push(item.value.diagnostic); if (item.value.result) externalResults.push(item.value.result); }
      else diagnostics.push({ provider: diagnostics.length ? "open_food_facts" : "usda_fdc", status: "unavailable", warning: "Provider request failed" });
    }
  } else diagnostics = [{ provider: "usda_fdc", status: "skipped", warning: "External lookup rate limited" }, { provider: "open_food_facts", status: "skipped", warning: "External lookup rate limited" }];

  const resolved = mergeExactProviderResults(identity, [...localResults, ...externalResults], diagnostics);
  if (!resolved.food) {
    const providerUnavailable = diagnostics.some((item) => item.status === "timeout" || item.status === "unavailable");
    return NextResponse.json({ food: null, source: null, status: providerUnavailable ? "external_error" : "not_found", barcodeResolution: resolved.metadata } satisfies FoodBarcodeLookupResult);
  }
  if (resolved.profile?.completeness !== "complete") return NextResponse.json({ food: resolved.food, source: null, status: resolved.profile?.completeness === "conflict" ? "conflict" : "incomplete", barcodeResolution: resolved.metadata } satisfies FoodBarcodeLookupResult);
  return NextResponse.json({ food: resolved.food, source: "barcode_resolver", status: "found", barcodeResolution: resolved.metadata } satisfies FoodBarcodeLookupResult);
}
