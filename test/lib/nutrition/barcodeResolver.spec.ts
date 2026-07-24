import { describe, expect, it, vi } from "vitest";
import {
  barcodesAreExact,
  fetchOpenFoodFactsExact,
  fetchUsdaExact,
  isCompleteUserOwnedResult,
  mergeExactProviderResults,
  normalizeOpenFoodFactsFood,
  normalizeUsdaFood,
  parseBarcodeIdentity,
  selectExactUsdaSearchResult,
  type BarcodeProviderResult,
} from "@/lib/nutrition/barcodeResolver";

const upc = "036000291452";
const identity = parseBarcodeIdentity(upc)!;
const runtimeBarcode = "0009300113083";
const runtimeIdentity = parseBarcodeIdentity(runtimeBarcode)!;

describe("barcode canonicalization", () => {
  it("compares UPC-12, EAN-13, and GTIN-14 leading-zero forms exactly", () => {
    expect(barcodesAreExact(upc, `0${upc}`)).toBe(true);
    expect(barcodesAreExact(upc, `00${upc}`)).toBe(true);
    expect(identity.canonicalGtin).toBe(`00${upc}`);
  });

  it("rejects an invalid GS1 check digit", () => {
    expect(parseBarcodeIdentity("036000291453")).toBeNull();
  });

  it("keeps equivalent runtime barcode variants visible for diagnostics", () => {
    const runtimeIdentity = parseBarcodeIdentity("0009300113083")!;
    expect(runtimeIdentity.canonicalGtin).toBe("00009300113083");
    expect(runtimeIdentity.variants).toEqual([
      "0009300113083",
      "009300113083",
      "00009300113083",
    ]);
  });
});

describe("exact provider adapters", () => {
  it("rejects a non-exact USDA search result", () => {
    expect(selectExactUsdaSearchResult(identity, [{ fdcId: 1, gtinUpc: "012345678905" }])).toBeNull();
  });

  it("normalizes an exact USDA branded record", () => {
    const result = normalizeUsdaFood(identity, { fdcId: 10, gtinUpc: `0${upc}`, description: "Alfredo Sauce", brandOwner: "Example", servingSize: 61, servingSizeUnit: "g", householdServingFullText: "1/4 cup (61g)", labelNutrients: { calories: { value: 90 }, carbohydrates: { value: 4 }, protein: { value: 1 }, fat: { value: 8 } } });
    expect(result?.food).toMatchObject({ name: "Alfredo Sauce", serving_size: 61, serving_grams: 61, calories: 90 });
    expect(result?.exactMatch).toBe(true);
  });

  it("maps explicit USDA packageWeight into the existing package profile", () => {
    const result = normalizeUsdaFood(runtimeIdentity, { fdcId: 20, gtinUpc: "009300113083", description: "Exact", packageWeight: "64 oz", servingSize: 56.699, servingSizeUnit: "g", labelNutrients: { calories: { value: 90 }, carbohydrates: { value: 4 }, protein: { value: 1 }, fat: { value: 8 } } });
    const resolved = mergeExactProviderResults(runtimeIdentity, [result!]);
    expect(resolved.profile).toMatchObject({ netQuantityPerContainer: 64, netQuantityUnit: "oz" });
    expect(resolved.profile?.netGramsPerContainer).toBeCloseTo(1814.368, 3);
    expect(resolved.profile?.servingsPerContainer).toBeCloseTo(32, 2);
    expect(resolved.metadata.mergedFieldSources.packageQuantity).toMatchObject({ provider: "usda_fdc", providerRecordId: "20", explicit: true });
  });

  it("normalizes only an exact Open Food Facts record", () => {
    const result = normalizeOpenFoodFactsFood(identity, { code: `00${upc}`, product_name: "Sliced Jalapeños", brands: "Great Value", quantity: "960 g", serving_size: "30 g", nutriments: { "energy-kcal_serving": 5, carbohydrates_serving: 1, proteins_serving: 0, fat_serving: 0 } });
    expect(result?.food.name).toBe("Sliced Jalapeños");
    expect(result?.explicitFields).toContain("netQuantityPerContainer");
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(payload), { status }));
}

function usdaFetchMock(searches: Record<string, unknown>, details: Record<string, unknown> = {}) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/foods/search")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { query?: string };
      return jsonResponse(searches[String(body.query)] ?? { totalHits: 0, foods: [] });
    }
    const fdcId = decodeURIComponent(url.match(/\/food\/([^?]+)/)?.[1] ?? "");
    return jsonResponse(details[fdcId] ?? {});
  });
}

describe("USDA exact barcode fetching", () => {
  it("keeps searching when raw EAN has no results and UPC-A has the exact branded result", async () => {
    const fetchMock = usdaFetchMock({
      "009300113083": { totalHits: 1, foods: [{ fdcId: 100, gtinUpc: "009300113083", dataType: "Branded", description: "Exact", modifiedDate: "2026-02-01", packageWeight: "64 oz" }] },
      "0009300113083": { totalHits: 0, foods: [] },
      "00009300113083": { totalHits: 0, foods: [] },
    }, {
      "100": { fdcId: 100, gtinUpc: "009300113083", description: "Exact", brandOwner: "Example", servingSize: 56.699, servingSizeUnit: "g", labelNutrients: { calories: { value: 90 }, carbohydrates: { value: 4 }, protein: { value: 1 }, fat: { value: 8 } } },
    });

    const usdaResult = await fetchUsdaExact(runtimeIdentity, "secret", fetchMock as typeof fetch);

    expect(usdaResult.diagnostic).toMatchObject({
      provider: "usda_fdc",
      configured: true,
      attempted: true,
      outcome: "matched",
      queriedBarcodeVariants: ["009300113083", "0009300113083", "00009300113083"],
      totalSearchResultCount: 1,
      canonicalExactMatchCount: 1,
      matchedProviderGtin: "009300113083",
      matchedFdcId: "100",
      canonicalExactMatch: true,
    });
    expect(usdaResult.result?.matchedBarcode).toBe("009300113083");
    expect(barcodesAreExact(usdaResult.result?.matchedBarcode, runtimeIdentity.canonicalGtin)).toBe(true);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/foods/search")).map(([, init]) => JSON.parse(String(init?.body)).query)).toEqual(["009300113083", "0009300113083", "00009300113083"]);
    const resolved = mergeExactProviderResults(runtimeIdentity, [usdaResult.result!], [usdaResult.diagnostic]);
    expect(resolved.profile).toMatchObject({ netQuantityPerContainer: 64, netQuantityUnit: "oz" });
    expect(resolved.profile?.servingsPerContainer).toBeCloseTo(32, 2);
  });

  it("rejects USDA results from other GTINs and reports no_exact_match", async () => {
    const fetchMock = usdaFetchMock({
      "009300113083": { totalHits: 1, foods: [{ fdcId: 101, gtinUpc: "012345678905", dataType: "Branded", description: "Other" }] },
      "0009300113083": { totalHits: 0, foods: [] },
      "00009300113083": { totalHits: 0, foods: [] },
    });
    const usdaResult = await fetchUsdaExact(runtimeIdentity, "secret", fetchMock as typeof fetch);
    expect(usdaResult.result).toBeNull();
    expect(usdaResult.diagnostic).toMatchObject({ outcome: "no_exact_match", totalSearchResultCount: 1, canonicalExactMatchCount: 0 });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/food/"))).toBe(false);
  });

  it("reports no_results only when all requested USDA variants are empty", async () => {
    const fetchMock = usdaFetchMock({
      "009300113083": { totalHits: 0, foods: [] },
      "0009300113083": { totalHits: 0, foods: [] },
      "00009300113083": { totalHits: 0, foods: [] },
    });
    const usdaResult = await fetchUsdaExact(runtimeIdentity, "secret", fetchMock as typeof fetch);
    expect(usdaResult.diagnostic).toMatchObject({
      outcome: "no_results",
      queriedBarcodeVariants: ["009300113083", "0009300113083", "00009300113083"],
      totalSearchResultCount: 0,
      canonicalExactMatchCount: 0,
    });
  });

  it("deduplicates exact USDA revisions by fdcId and fetches the newest suitable record", async () => {
    const fetchMock = usdaFetchMock({
      "009300113083": { totalHits: 3, foods: [
        { fdcId: 100, gtinUpc: "009300113083", dataType: "Branded", modifiedDate: "2025-01-01", description: "Old duplicate" },
        { fdcId: 100, gtinUpc: "009300113083", dataType: "Branded", modifiedDate: "2026-01-01", description: "New duplicate" },
        { fdcId: 200, gtinUpc: "009300113083", dataType: "Branded", publicationDate: "2026-03-01", description: "Newest" },
      ] },
      "0009300113083": { totalHits: 0, foods: [] },
      "00009300113083": { totalHits: 0, foods: [] },
    }, {
      "200": { fdcId: 200, gtinUpc: "009300113083", description: "Newest", servingSize: 30, servingSizeUnit: "g" },
    });
    const usdaResult = await fetchUsdaExact(runtimeIdentity, "secret", fetchMock as typeof fetch);
    expect(usdaResult.diagnostic).toMatchObject({ outcome: "matched", canonicalExactMatchCount: 2, matchedFdcId: "200" });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/food/200"))).toBe(true);
  });
});

function provider(provider: BarcodeProviderResult["provider"], food: BarcodeProviderResult["food"], explicitFields: string[]): BarcodeProviderResult {
  return { provider, requestedBarcode: identity.canonicalGtin, matchedBarcode: upc, exactMatch: true, providerRecordId: provider, fetchedAt: "2026-01-01T00:00:00.000Z", food, explicitFields, warnings: [] };
}

describe("field-level exact merging", () => {
  const usda = normalizeUsdaFood(identity, { fdcId: 10, gtinUpc: upc, description: "Sliced Jalapeños", servingSize: 30, servingSizeUnit: "g", labelNutrients: { calories: { value: 5 }, carbohydrates: { value: 1 }, protein: { value: 0 }, fat: { value: 0 } } })!;
  const off = normalizeOpenFoodFactsFood(identity, { code: upc, product_name: "Sliced Jalapeños", quantity: "960 g", serving_size: "30 g" })!;

  it("combines USDA nutrition with an OFF package quantity and derives servings", () => {
    const resolved = mergeExactProviderResults(identity, [usda, off]);
    expect(resolved.profile).toMatchObject({ netGramsPerContainer: 960, servingGrams: 30, servingsPerContainer: 32, completeness: "complete" });
    expect(resolved.metadata.mergedFieldSources.packageQuantity.provider).toBe("open_food_facts");
    expect(resolved.metadata.mergedFieldSources.nutrition.provider).toBe("usda_fdc");
  });

  it("does not mix incomplete nutrients from conflicting bases", () => {
    const partialServing = provider("usda_fdc", { ...usda.food, calories: 5, carbs_g: null, protein_g: null, fat_g: null, metadata: { barcode: upc, nutrition_basis: "per_serving", nutrition_per_serving: { calories: 5, carbs_g: null, protein_g: null, fat_g: null } } }, ["productName", "nutritionPerServing"]);
    const per100 = provider("open_food_facts", { ...off.food, calories: 20, carbs_g: 4, protein_g: 0, fat_g: 0, metadata: { ...off.food.metadata as object, nutrition_basis: "per_100g", nutrition_per_100g: { calories: 20, carbs_g: 4, protein_g: 0, fat_g: 0 } } }, ["nutritionPer100g"]);
    const resolved = mergeExactProviderResults(identity, [partialServing, per100]);
    expect(resolved.food?.carbs_g).toBeNull();
  });

  it("keeps another exact provider when USDA times out", async () => {
    const timeoutFetch = vi.fn().mockRejectedValue(Object.assign(new Error("timeout"), { name: "AbortError" }));
    const usdaResult = await fetchUsdaExact(identity, "secret", timeoutFetch as typeof fetch);
    const resolved = mergeExactProviderResults(identity, [off], [usdaResult.diagnostic]);
    expect(usdaResult.diagnostic.status).toBe("timeout");
    expect(usdaResult.diagnostic.outcome).toBe("timeout");
    expect(resolved.food?.name).toBe("Sliced Jalapeños");
    expect(JSON.stringify(resolved.metadata)).not.toContain("secret");
  });

  it("reports USDA missing-key diagnostics without exposing the key", async () => {
    const usdaResult = await fetchUsdaExact(identity, undefined, vi.fn() as typeof fetch);
    expect(usdaResult.diagnostic).toMatchObject({
      provider: "usda_fdc",
      configured: false,
      attempted: false,
      outcome: "skipped_missing_key",
      queriedBarcodeVariants: [],
    });
    expect(JSON.stringify(usdaResult.diagnostic)).not.toContain("USDA_FDC_API_KEY");
  });

  it("classifies USDA unauthorized responses and keeps the existing search query first", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
    const usdaResult = await fetchUsdaExact(identity, "secret", fetchMock as typeof fetch);
    expect(usdaResult.diagnostic).toMatchObject({
      provider: "usda_fdc",
      configured: true,
      attempted: true,
      outcome: "unauthorized",
      httpStatus: 401,
      queriedBarcodeVariants: identity.variants,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ query: identity.digits });
    expect(JSON.stringify(usdaResult.diagnostic)).not.toContain("secret");
  });

  it("classifies USDA rate-limit responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 429 }));
    const usdaResult = await fetchUsdaExact(identity, "secret", fetchMock as typeof fetch);
    expect(usdaResult.diagnostic).toMatchObject({
      provider: "usda_fdc",
      configured: true,
      attempted: true,
      outcome: "rate_limited",
      httpStatus: 429,
      queriedBarcodeVariants: identity.variants,
    });
  });

  it("adds final provider diagnostics without changing incomplete merge results", () => {
    const resolved = mergeExactProviderResults(identity, [off, usda], []);
    expect(resolved.profile?.completeness).toBe("complete");
    expect(resolved.metadata.providerDiagnostics.find((item) => item.provider === "usda_fdc")?.contributedFields).toEqual(expect.arrayContaining(["servingSize", "calories", "carbohydrates", "protein", "fat"]));
    expect(resolved.metadata.providerDiagnostics.find((item) => item.provider === "open_food_facts")?.contributedFields).toEqual(expect.arrayContaining(["packageQuantity"]));
    expect(resolved.metadata.notStagedReason).toBeNull();
  });

  it("supplements an incomplete single-provider product", () => {
    expect(mergeExactProviderResults(identity, [off]).profile?.completeness).toBe("incomplete");
    expect(mergeExactProviderResults(identity, [off, usda]).profile?.completeness).toBe("complete");
  });

  it("accepts an exact OFF response through the bounded adapter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 1, product: { code: upc, product_name: "Exact", quantity: "300 g", serving_size: "30 g" } }), { status: 200 }));
    expect((await fetchOpenFoodFactsExact(identity, fetchMock as typeof fetch)).result?.food.name).toBe("Exact");
  });

  it("identifies a complete user-owned profile for external bypass and resets acquisition to one container", () => {
    const complete = mergeExactProviderResults(identity, [usda, off]);
    const cached = provider("user_food_resource", { ...complete.food!, metadata: { ...(complete.food!.metadata as object), package_profile: { ...complete.profile!, containersAdded: 1 } } }, ["productName", "netQuantityPerContainer", "servingQuantity", "servingsPerContainer", "nutritionPerServing"]);
    expect(isCompleteUserOwnedResult(cached)).toBe(true);
    expect((cached.food.metadata as { package_profile: { containersAdded: number } }).package_profile.containersAdded).toBe(1);
  });
});
