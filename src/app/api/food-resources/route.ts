import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getAttachableFoodResourceId } from "@/lib/nutrition/foods";
import type { Database, Json } from "@/types/supabase";

export const runtime = "nodejs";

type FoodResourceRow = Database["public"]["Tables"]["food_resources"]["Row"];
type FoodResourceInsert = Database["public"]["Tables"]["food_resources"]["Insert"];
type FoodResourceUpdate = Database["public"]["Tables"]["food_resources"]["Update"];

const VALID_STATUSES = new Set(["active", "used", "discarded", "archived"]);
const VALID_UNITS = new Set([
  "servings",
  "package",
  "g",
  "kg",
  "oz",
  "lb",
  "ml",
  "l",
  "item",
]);
const NATURAL_CONTAINER_LABELS: Record<string, { singularLabel: string; pluralLabel: string }> = {
  can: { singularLabel: "can", pluralLabel: "cans" },
  jar: { singularLabel: "jar", pluralLabel: "jars" },
  bottle: { singularLabel: "bottle", pluralLabel: "bottles" },
  box: { singularLabel: "box", pluralLabel: "boxes" },
  bag: { singularLabel: "bag", pluralLabel: "bags" },
  pouch: { singularLabel: "pouch", pluralLabel: "pouches" },
  carton: { singularLabel: "carton", pluralLabel: "cartons" },
  tub: { singularLabel: "tub", pluralLabel: "tubs" },
  tray: { singularLabel: "tray", pluralLabel: "trays" },
  packet: { singularLabel: "packet", pluralLabel: "packets" },
};
const LOCATIONS = new Set(["pantry", "fridge", "freezer", "counter", "other"]);
const MAX_LIMIT = 200;
const MAX_QUANTITY = 1_000_000_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function normalizeQuantity(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_QUANTITY) return undefined;
  return parsed;
}

function normalizeDepletedQuantity(value: unknown) {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_QUANTITY) return undefined;
  return parsed;
}

function normalizeLocation(value: unknown) {
  if (value === null || value === undefined || value === "") return "other";
  const normalized = normalizeText(value, 32)?.toLowerCase() ?? null;
  if (!normalized || !LOCATIONS.has(normalized)) return undefined;
  return normalized;
}

function normalizeDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const text = normalizeText(value, 32);
  if (!text) return undefined;

  const dateOnly = text.match(/^\d{4}-\d{2}-\d{2}$/)?.[0] ?? null;
  if (!dateOnly) return undefined;

  const parsed = new Date(`${dateOnly}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;

  const [year, month, day] = dateOnly.split("-").map(Number);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return undefined;
  }

  return dateOnly;
}

function normalizeFoodId(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  if (!value.trim()) return null;
  const normalized = normalizeText(value, 80);
  if (!normalized) return null;
  return UUID_PATTERN.test(normalized) ? normalized : undefined;
}

function normalizeStatus(value: unknown) {
  if (value === null || value === undefined || value === "") return "active";
  if (typeof value !== "string") return undefined;
  const normalized = normalizeText(value, 32)?.toLowerCase() ?? null;
  if (!normalized) return "active";
  return VALID_STATUSES.has(normalized) ? normalized : undefined;
}

function normalizeUnit(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = normalizeText(value, 32)?.toLowerCase() ?? null;
  if (!normalized) return undefined;
  return VALID_UNITS.has(normalized) ? normalized : undefined;
}

function normalizeMetadata(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const metadata = { ...(value as Record<string, unknown>) };
  const sourceSummary =
    metadata.source_summary &&
    typeof metadata.source_summary === "object" &&
    !Array.isArray(metadata.source_summary)
      ? (metadata.source_summary as Record<string, unknown>)
      : {};
  const containerType = normalizeText(
    metadata.container_type ?? sourceSummary.container_type,
    64,
  )?.toLowerCase();
  const containerLabels = containerType ? NATURAL_CONTAINER_LABELS[containerType] : undefined;
  const profile = metadata.inventory_measurement_profile ??
    (containerType && containerLabels
      ? {
          preferredKind: "count",
          countUnitKey: containerType,
          ...containerLabels,
          source:
            metadata.container_source === "barcode" || sourceSummary.container_source === "barcode"
              ? "barcode"
              : "name_fallback",
          confidence:
            metadata.container_confidence === "high" || sourceSummary.container_confidence === "high"
              ? "high"
              : "medium",
        }
      : null);
  if (profile && typeof profile === "object" && !Array.isArray(profile)) {
    const candidate = profile as Record<string, unknown>;
    const countUnitKey = normalizeText(candidate.countUnitKey, 64);
    const singularLabel = normalizeText(candidate.singularLabel, 32);
    const pluralLabel = normalizeText(candidate.pluralLabel, 32);
    if (candidate.preferredKind === "count" && countUnitKey && singularLabel && pluralLabel) {
      metadata.inventory_measurement_profile = {
        preferredKind: "count",
        allowedKinds: ["count", "package", "weight", "serving"],
        countUnitKey,
        singularLabel,
        pluralLabel,
        ...(typeof candidate.gramsPerItem === "number" && candidate.gramsPerItem > 0
          ? { gramsPerItem: candidate.gramsPerItem }
          : {}),
        ...(typeof candidate.packageItemCount === "number" && candidate.packageItemCount > 0
          ? { packageItemCount: candidate.packageItemCount }
          : {}),
        ...(typeof candidate.servingsPerContainer === "number" && candidate.servingsPerContainer > 0
          ? { servingsPerContainer: candidate.servingsPerContainer }
          : {}),
        ...(typeof candidate.netGramsPerContainer === "number" && candidate.netGramsPerContainer > 0
          ? { netGramsPerContainer: candidate.netGramsPerContainer }
          : {}),
        source: candidate.source === "catalog" || candidate.source === "barcode" ? candidate.source : "name_fallback",
        confidence: candidate.confidence === "high" ? "high" : "medium",
      };
    } else {
      delete metadata.inventory_measurement_profile;
    }
  }
  return metadata as Json;
}

type FoodResourceWithCatalog = FoodResourceRow & {
  catalog_food?: {
    name: string;
    brand_name: string | null;
    normalized_name: string;
    normalized_brand_name: string | null;
    source: string | null;
    metadata: Json;
  } | null;
};

function mapFoodResource(row: FoodResourceWithCatalog) {
  return {
    id: row.id,
    food_id: row.food_id,
    name: row.name,
    brand_name: row.brand_name,
    quantity: row.quantity,
    unit: row.unit,
    location: row.location,
    expires_on: row.expires_on,
    notes: row.notes,
    status: row.status,
    metadata: normalizeMetadata(row.metadata),
    created_at: row.created_at,
    updated_at: row.updated_at,
    catalog_food: row.catalog_food ?? null,
  };
}

function parseFoodResourcePayload(payload: Record<string, unknown>) {
  const name = normalizeText(payload.name, 160);
  if (!name) {
    return { ok: false as const, error: "Name is required." };
  }

  const foodId = normalizeFoodId(payload.food_id);
  if (foodId === undefined) {
    return { ok: false as const, error: "Food id must be a valid UUID." };
  }

  const quantity = normalizeQuantity(payload.quantity);
  if (quantity === undefined) {
    return { ok: false as const, error: "Quantity must be greater than zero." };
  }

  const location = normalizeLocation(payload.location);
  if (location === undefined) {
    return { ok: false as const, error: "Location is invalid." };
  }

  const expiresOn = normalizeDate(payload.expires_on);
  if (expiresOn === undefined) {
    return { ok: false as const, error: "Expires on must be a valid YYYY-MM-DD date." };
  }

  const unit = normalizeUnit(payload.unit);
  if (unit === undefined) {
    return { ok: false as const, error: "Unit is invalid." };
  }

  return {
    ok: true as const,
    value: {
      food_id: foodId,
      name,
      brand_name: normalizeText(payload.brand_name, 120),
      quantity,
      unit,
      location,
      expires_on: expiresOn,
      notes: normalizeText(payload.notes, 2000),
      metadata: normalizeMetadata(payload.metadata),
    },
  };
}

function databaseErrorResponse(message: string, error: unknown) {
  console.error(message, { error });
  return NextResponse.json({ error: message }, { status: 500 });
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
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const status = request.nextUrl.searchParams.get("status") ?? "active";
  if (status !== "all" && !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Status is invalid." }, { status: 400 });
  }

  const limitValue = Number(request.nextUrl.searchParams.get("limit") ?? 100);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.isFinite(limitValue) ? Math.floor(limitValue) : 100),
  );

  let query = supabase
    .from("food_resources")
    .select(
      "id,user_id,food_id,name,brand_name,quantity,unit,location,expires_on,notes,status,metadata,created_at,updated_at,catalog_food:foods!food_resources_food_id_fkey(name,brand_name,normalized_name,normalized_brand_name,source,metadata)",
    )
    .eq("user_id", user.id)
    .order("expires_on", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return databaseErrorResponse("Unable to load food resources", error);
  }

  return NextResponse.json({
    foodResources: ((data ?? []) as FoodResourceWithCatalog[]).map(mapFoodResource),
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client not initialized" },
      { status: 500 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!payload) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = parseFoodResourcePayload(payload);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const insertPayload: FoodResourceInsert = {
    ...parsed.value,
    user_id: user.id,
    status: "active",
  };

  const { data, error } = await supabase
    .from("food_resources")
    .insert(insertPayload as never)
    .select(
      "id,user_id,food_id,name,brand_name,quantity,unit,location,expires_on,notes,status,metadata,created_at,updated_at",
    )
    .single();

  if (error) {
    return databaseErrorResponse("Unable to create food resource", error);
  }

  return NextResponse.json({ foodResource: mapFoodResource(data as FoodResourceRow) });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client not initialized" },
      { status: 500 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = normalizeFoodId(payload?.id);

  if (!payload || !id) {
    return NextResponse.json({ error: "Food resource id is required." }, { status: 400 });
  }

  const action = normalizeText(payload.action, 32);
  let updatePayload: FoodResourceUpdate;

  if (action === "archive") {
    updatePayload = {
      status: "archived",
      updated_at: new Date().toISOString(),
    };
  } else if (action === "setQuantity") {
    const quantity = normalizeDepletedQuantity(payload.quantity);
    const unit = normalizeUnit(payload.unit);

    if (quantity === undefined) {
      return NextResponse.json(
        { error: "Quantity must be greater than or equal to zero." },
        { status: 400 },
      );
    }
    if (unit === undefined) {
      return NextResponse.json({ error: "Unit is invalid." }, { status: 400 });
    }

    const requestedFoodId = normalizeFoodId(payload.food_id);
    if (requestedFoodId === undefined) {
      return NextResponse.json({ error: "Food id must be a valid UUID." }, { status: 400 });
    }
    let attachFoodId: string | null = null;
    if (requestedFoodId) {
      const { data: existingResource, error: existingResourceError } = await supabase
        .from("food_resources")
        .select("food_id")
        .eq("user_id", user.id)
        .eq("id", id)
        .maybeSingle();
      if (existingResourceError) {
        return databaseErrorResponse("Unable to inspect food resource", existingResourceError);
      }
      attachFoodId = getAttachableFoodResourceId(
        (existingResource as { food_id: string | null } | null)?.food_id ?? null,
        requestedFoodId,
      );
    }

    updatePayload = {
      quantity,
      unit,
      ...(attachFoodId ? { food_id: attachFoodId } : {}),
      ...(payload.metadata === undefined
        ? {}
        : { metadata: normalizeMetadata(payload.metadata) }),
      updated_at: new Date().toISOString(),
    };
  } else if (action === "setStatus") {
    const status = normalizeStatus(payload.status);

    if (status === undefined) {
      return NextResponse.json({ error: "Status is invalid." }, { status: 400 });
    }

    updatePayload = {
      status,
      metadata: normalizeMetadata(payload.metadata),
      updated_at: new Date().toISOString(),
    };
  } else {
    const parsed = parseFoodResourcePayload(payload);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const status = normalizeStatus(payload.status);
    if (status === undefined) {
      return NextResponse.json({ error: "Status is invalid." }, { status: 400 });
    }

    updatePayload = {
      ...parsed.value,
      status,
      updated_at: new Date().toISOString(),
    };
  }

  const { data, error } = await supabase
    .from("food_resources")
    .update(updatePayload as never)
    .eq("user_id", user.id)
    .eq("id", id)
    .select(
      "id,user_id,food_id,name,brand_name,quantity,unit,location,expires_on,notes,status,metadata,created_at,updated_at",
    )
    .maybeSingle();

  if (error) {
    return databaseErrorResponse("Unable to update food resource", error);
  }

  if (!data) {
    return NextResponse.json({ error: "Food resource not found." }, { status: 404 });
  }

  return NextResponse.json({ foodResource: mapFoodResource(data as FoodResourceRow) });
}
