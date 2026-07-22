import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  extractOpenFoodFactsNutrition,
  isValidNormalizedFoodBarcode,
  mapOpenFoodFactsProductToFoodInsert,
  mergeOpenFoodFactsFoodInsertWithExisting,
  normalizeFoodBarcode,
  type FoodBarcodeLookupResult,
  type FoodSearchResult,
  type OpenFoodFactsProduct,
} from "@/lib/nutrition/foods";
import {
  checkApiRateLimit,
  type ApiRateLimitDecision,
} from "@/lib/server/rateLimit";

export const runtime = "nodejs";

const FOOD_SELECT =
  "id,name,brand_name,source,serving_size,serving_unit,serving_grams,calories,carbs_g,protein_g,fat_g,metadata";
const OPEN_FOOD_FACTS_FIELDS = [
  "code",
  "product_name",
  "product_name_en",
  "abbreviated_product_name",
  "generic_name",
  "brands",
  "serving_size",
  "serving_quantity",
  "serving_quantity_unit",
  "quantity",
  "product_quantity",
  "product_quantity_unit",
  "servings_per_container",
  "servings_per_package",
  "packaging",
  "packaging_text",
  "packaging_tags",
  "categories",
  "categories_tags",
  "nutrition_data_per",
  "nutriments",
].join(",");
const OPEN_FOOD_FACTS_TIMEOUT_MS = 4500;
const OPEN_FOOD_FACTS_CACHE_TTL_MS = 10 * 60 * 1000;
const OPEN_FOOD_FACTS_MAX_CACHE_ENTRIES = 500;
const ENDPOINT_RATE_LIMIT = {
  action: "nutrition.foods.barcode.endpoint",
  windowSeconds: 10 * 60,
  maxRequests: 60,
} as const;
const EXTERNAL_RATE_LIMIT = {
  action: "nutrition.foods.barcode.external",
  windowSeconds: 60 * 60,
  maxRequests: 20,
} as const;
const EXTERNAL_LOOKUP_WINDOW_MS = 60 * 1000;
const EXTERNAL_LOOKUP_MAX_PER_WINDOW = 30;

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type FoodRow = FoodSearchResult;
type OpenFoodFactsResponse = {
  status?: number;
  product?: OpenFoodFactsProduct;
};
type OpenFoodFactsFetchResult =
  | { status: "ok"; response: OpenFoodFactsResponse }
  | { status: "not_found" | "external_error"; response: null };

const openFoodFactsResultCache = new Map<
  string,
  { expiresAt: number; result: OpenFoodFactsFetchResult }
>();
const openFoodFactsInflight = new Map<string, Promise<OpenFoodFactsFetchResult>>();
const externalLookupAttemptsByUser = new Map<string, number[]>();

function toNullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapFoodRow(row: FoodRow): FoodSearchResult {
  return {
    id: row.id,
    name: row.name,
    brand_name: row.brand_name,
    source: row.source,
    serving_size: toNullableNumber(row.serving_size),
    serving_unit: row.serving_unit,
    serving_grams: toNullableNumber(row.serving_grams),
    calories: toNullableNumber(row.calories),
    carbs_g: toNullableNumber(row.carbs_g),
    protein_g: toNullableNumber(row.protein_g),
    fat_g: toNullableNumber(row.fat_g),
    metadata: row.metadata,
  };
}

function barcodeResponse(
  payload: FoodBarcodeLookupResult,
  init?: ResponseInit,
) {
  return NextResponse.json(payload, init);
}

function rateLimitedBarcodeResponse(limit: ApiRateLimitDecision) {
  return barcodeResponse(
    {
      food: null,
      source: null,
      status: "rate_limited",
      retryAfterSeconds: limit.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(limit.retryAfterSeconds),
      },
    },
  );
}

async function findFoodByBarcode(supabase: SupabaseClient, normalizedBarcode: string) {
  if (!supabase) return { food: null, error: null };

  const { data, error } = await supabase
    .from("foods")
    .select(FOOD_SELECT)
    .eq("normalized_barcode", normalizedBarcode)
    .eq("is_active", true)
    .maybeSingle();

  return {
    food: data ? mapFoodRow(data as FoodRow) : null,
    error,
  };
}

async function findUserFoodResourceByBarcode(
  supabase: SupabaseClient,
  userId: string,
  normalizedBarcode: string,
) {
  const { data, error } = await supabase
    .from("food_resources")
    .select("id,name,brand_name,metadata,updated_at")
    .eq("user_id", userId)
    .contains("metadata", { barcode: normalizedBarcode })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return { food: null, error };

  const metadata = data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
    ? data.metadata as Record<string, unknown>
    : {};
  const snapshot = metadata.foodSnapshot && typeof metadata.foodSnapshot === "object" && !Array.isArray(metadata.foodSnapshot)
    ? metadata.foodSnapshot as Record<string, unknown>
    : {};
  const numberValue = (value: unknown) => {
    const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    food: {
      id: `resource:${data.id}`,
      name: data.name,
      brand_name: data.brand_name,
      source: "user_food_resource",
      serving_size: numberValue(snapshot.serving_size ?? metadata.serving_size),
      serving_unit: typeof (snapshot.serving_unit ?? metadata.serving_unit) === "string"
        ? String(snapshot.serving_unit ?? metadata.serving_unit)
        : null,
      serving_grams: numberValue(snapshot.serving_grams ?? metadata.serving_grams),
      calories: numberValue(snapshot.calories ?? metadata.calories),
      carbs_g: numberValue(snapshot.carbs_g ?? metadata.carbs_g),
      protein_g: numberValue(snapshot.protein_g ?? metadata.protein_g),
      fat_g: numberValue(snapshot.fat_g ?? metadata.fat_g),
      metadata: { ...snapshot, ...metadata, barcode: normalizedBarcode },
    } satisfies FoodSearchResult,
    error: null,
  };
}

function rememberOpenFoodFactsResult(
  normalizedBarcode: string,
  result: OpenFoodFactsFetchResult,
) {
  if (openFoodFactsResultCache.size >= OPEN_FOOD_FACTS_MAX_CACHE_ENTRIES) {
    const firstKey = openFoodFactsResultCache.keys().next().value as string | undefined;
    if (firstKey) openFoodFactsResultCache.delete(firstKey);
  }

  openFoodFactsResultCache.set(normalizedBarcode, {
    expiresAt: Date.now() + OPEN_FOOD_FACTS_CACHE_TTL_MS,
    result,
  });
}

function getCachedOpenFoodFactsResult(normalizedBarcode: string) {
  const cached = openFoodFactsResultCache.get(normalizedBarcode);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    openFoodFactsResultCache.delete(normalizedBarcode);
    return null;
  }

  return cached.result;
}

function canFetchExternalForUser(userId: string) {
  const now = Date.now();
  const recentAttempts = (externalLookupAttemptsByUser.get(userId) ?? []).filter(
    (attemptedAt) => now - attemptedAt < EXTERNAL_LOOKUP_WINDOW_MS,
  );

  if (recentAttempts.length >= EXTERNAL_LOOKUP_MAX_PER_WINDOW) {
    externalLookupAttemptsByUser.set(userId, recentAttempts);
    return false;
  }

  recentAttempts.push(now);
  externalLookupAttemptsByUser.set(userId, recentAttempts);
  return true;
}

async function fetchOpenFoodFactsProductUncached(
  normalizedBarcode: string,
): Promise<OpenFoodFactsFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPEN_FOOD_FACTS_TIMEOUT_MS);
  const endpoint = new URL(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
      normalizedBarcode,
    )}.json`,
  );
  endpoint.searchParams.set("fields", OPEN_FOOD_FACTS_FIELDS);

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      "User-Agent": "CREATOR Nutrition barcode lookup - https://creator.app",
    },
    signal: controller.signal,
    next: { revalidate: 60 * 60 * 24 },
  }).catch((error: unknown) => {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("Open Food Facts barcode lookup timed out");
      return null;
    }

    console.warn("Open Food Facts barcode lookup failed", { error });
    return null;
  });

  clearTimeout(timeout);

  if (!response) return { status: "external_error", response: null };

  if (response.status === 404) return { status: "not_found", response: null };
  if (!response.ok) {
    console.warn("Open Food Facts barcode lookup returned non-200", {
      status: response.status,
    });
    return { status: "external_error", response: null };
  }

  try {
    const payload = (await response.json()) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { status: "external_error", response: null };
    }

    return { status: "ok", response: payload as OpenFoodFactsResponse };
  } catch (error) {
    console.warn("Open Food Facts barcode lookup returned invalid JSON", { error });
    return { status: "external_error", response: null };
  }
}

async function fetchOpenFoodFactsProduct(
  normalizedBarcode: string,
): Promise<OpenFoodFactsFetchResult> {
  const cached = getCachedOpenFoodFactsResult(normalizedBarcode);
  if (cached) return cached;

  const inflight = openFoodFactsInflight.get(normalizedBarcode);
  if (inflight) return inflight;

  const lookupPromise = fetchOpenFoodFactsProductUncached(normalizedBarcode).then((result) => {
    rememberOpenFoodFactsResult(normalizedBarcode, result);
    return result;
  });

  openFoodFactsInflight.set(normalizedBarcode, lookupPromise);
  try {
    return await lookupPromise;
  } finally {
    openFoodFactsInflight.delete(normalizedBarcode);
  }
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
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const normalizedBarcode = normalizeFoodBarcode(request.nextUrl.searchParams.get("barcode"));
  const lookupContext = request.nextUrl.searchParams.get("context");
  const shouldPreferExternalProduct = lookupContext === "grocery";

  if (!isValidNormalizedFoodBarcode(normalizedBarcode)) {
    return barcodeResponse({
      food: null,
      source: null,
      status: "invalid_barcode",
    });
  }

  let endpointLimit: ApiRateLimitDecision;
  try {
    endpointLimit = await checkApiRateLimit({
      userId: user.id,
      ...ENDPOINT_RATE_LIMIT,
    });
  } catch (error) {
    console.error("Failed to check nutrition barcode endpoint rate limit", { error });
    return NextResponse.json({ error: "Unable to check rate limit" }, { status: 500 });
  }

  if (!endpointLimit.allowed) {
    return rateLimitedBarcodeResponse(endpointLimit);
  }

  const userResource = await findUserFoodResourceByBarcode(supabase, user.id, normalizedBarcode);
  if (userResource.error) {
    console.error("Failed to look up user-owned food resource by barcode", { error: userResource.error });
    return NextResponse.json({ error: "Unable to look up food" }, { status: 500 });
  }
  if (userResource.food) {
    return barcodeResponse({
      food: userResource.food,
      source: "user_food_resource",
      status: "found",
    });
  }

  const sharedFood = await findFoodByBarcode(supabase, normalizedBarcode);
  if (sharedFood.error) {
    console.error("Failed to look up nutrition food by barcode", {
      error: sharedFood.error,
    });
    return NextResponse.json({ error: "Unable to look up food" }, { status: 500 });
  }

  if (sharedFood.food) {
    return barcodeResponse({
      food: sharedFood.food,
      source: "foods",
      status: "found",
    });
  }

  let externalLimit: ApiRateLimitDecision;
  try {
    externalLimit = await checkApiRateLimit({
      userId: user.id,
      ...EXTERNAL_RATE_LIMIT,
    });
  } catch (error) {
    console.error("Failed to check nutrition barcode external rate limit", { error });
    return NextResponse.json({ error: "Unable to check rate limit" }, { status: 500 });
  }

  if (!externalLimit.allowed) {
    return rateLimitedBarcodeResponse(externalLimit);
  }

  if (!canFetchExternalForUser(user.id)) {
    return rateLimitedBarcodeResponse({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + EXTERNAL_LOOKUP_WINDOW_MS),
      retryAfterSeconds: Math.ceil(EXTERNAL_LOOKUP_WINDOW_MS / 1000),
      requestCount: EXTERNAL_LOOKUP_MAX_PER_WINDOW,
    });
  }

  const openFoodFactsFetch = await fetchOpenFoodFactsProduct(normalizedBarcode);
  if (openFoodFactsFetch.status === "external_error") {
    if (shouldPreferExternalProduct) {
      const existingFood = await findFoodByBarcode(supabase, normalizedBarcode);
      if (existingFood.error) {
        console.error("Failed to look up fallback nutrition food by barcode", {
          error: existingFood.error,
        });
        return NextResponse.json({ error: "Unable to look up food" }, { status: 500 });
      }

      if (existingFood.food) {
        return barcodeResponse({
          food: existingFood.food,
          source: "foods",
          status: "found",
        });
      }
    }

    return barcodeResponse(
      {
        food: null,
        source: "open_food_facts",
        status: "external_error",
      },
      { status: 502 },
    );
  }

  const openFoodFactsResponse = openFoodFactsFetch.response;
  const product =
    openFoodFactsResponse?.status === 1 ? openFoodFactsResponse.product ?? null : null;

  if (!product) {
    if (shouldPreferExternalProduct) {
      const existingFood = await findFoodByBarcode(supabase, normalizedBarcode);
      if (existingFood.error) {
        console.error("Failed to look up fallback nutrition food by barcode", {
          error: existingFood.error,
        });
        return NextResponse.json({ error: "Unable to look up food" }, { status: 500 });
      }

      if (existingFood.food) {
        return barcodeResponse({
          food: existingFood.food,
          source: "foods",
          status: "found",
        });
      }
    }

    return barcodeResponse({
      food: null,
      source: null,
      status: "not_found",
    });
  }

  if (!extractOpenFoodFactsNutrition(product) && !shouldPreferExternalProduct) {
    return barcodeResponse({
      food: null,
      source: "open_food_facts",
      status: "invalid_nutrition",
    });
  }

  const foodInsert = mapOpenFoodFactsProductToFoodInsert(product, {
    barcode: normalizedBarcode,
    createdByUserId: user.id,
    allowIncompleteNutrition: shouldPreferExternalProduct,
  });

  if (!foodInsert) {
    return barcodeResponse({
      food: null,
      source: "open_food_facts",
      status: "invalid_nutrition",
    });
  }

  const existingFood = await findFoodByBarcode(supabase, normalizedBarcode);
  if (existingFood.error) {
    console.error("Failed to protect existing nutrition food during barcode refresh", {
      error: existingFood.error,
    });
    return NextResponse.json({ error: "Unable to look up food" }, { status: 500 });
  }
  const mergedFoodInsert = mergeOpenFoodFactsFoodInsertWithExisting(foodInsert, existingFood.food);

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Admin client not initialized" }, { status: 500 });
  }

  const { data: upsertedRows, error: upsertError } = await admin
    .from("foods")
    .upsert(mergedFoodInsert, {
      onConflict: "normalized_barcode",
    })
    .select(FOOD_SELECT);

  if (upsertError) {
    console.error("Failed to upsert Open Food Facts food", { error: upsertError });
    return NextResponse.json({ error: "Unable to save food" }, { status: 500 });
  }

  const upsertedFood = Array.isArray(upsertedRows) ? upsertedRows[0] : null;
  if (upsertedFood) {
    return barcodeResponse({
      food: mapFoodRow(upsertedFood as FoodRow),
      source: "open_food_facts",
      status: "created",
    });
  }

  const racedFood = await findFoodByBarcode(supabase, normalizedBarcode);
  if (racedFood.error) {
    console.error("Failed to reload raced nutrition food by barcode", {
      error: racedFood.error,
    });
    return NextResponse.json({ error: "Unable to look up saved food" }, { status: 500 });
  }

  return barcodeResponse({
    food: racedFood.food,
    source: racedFood.food ? "foods" : null,
    status: racedFood.food ? "found" : "not_found",
  });
}
