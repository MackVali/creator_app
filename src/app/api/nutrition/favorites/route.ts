import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { Database } from "@/types/supabase";

export const runtime = "nodejs";

const NUTRITION_FAVORITE_ITEM_TYPES = [
  "food",
  "recipe",
  "meal_template",
] as const;

type NutritionFavoriteItemType = (typeof NUTRITION_FAVORITE_ITEM_TYPES)[number];
type NutritionFavoriteRow =
  Database["public"]["Tables"]["nutrition_favorites"]["Row"];
type NutritionFavoriteInsert =
  Database["public"]["Tables"]["nutrition_favorites"]["Insert"];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FavoriteWriteTable = {
  upsert: (
    value: NutritionFavoriteInsert,
    options: { onConflict: string },
  ) => Promise<{ error: unknown }>;
  delete: () => {
    eq: (column: "user_id", value: string) => {
      eq: (column: "item_type", value: NutritionFavoriteItemType) => {
        eq: (column: "item_id", value: string) => Promise<{ error: unknown }>;
      };
    };
  };
};

function databaseErrorResponse(message: string, error: unknown) {
  console.error(message, { error });
  return NextResponse.json({ error: message }, { status: 500 });
}

function parseItemType(value: unknown): NutritionFavoriteItemType | null {
  if (typeof value !== "string") return null;
  return NUTRITION_FAVORITE_ITEM_TYPES.find((type) => type === value) ?? null;
}

function parseItemId(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

function mapFavoriteForClient(row: NutritionFavoriteRow) {
  return {
    id: row.id,
    itemType: row.item_type,
    itemId: row.item_id,
    createdAt: row.created_at,
  };
}

async function getAuthenticatedSupabase() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      response: NextResponse.json(
        { error: "Supabase client not initialized" },
        { status: 500 },
      ),
    };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }

  return { supabase, user };
}

async function readFavoritePayload(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return { error: "Invalid JSON body" };
  }

  if (!payload || typeof payload !== "object") {
    return { error: "Invalid JSON body" };
  }

  const itemType = parseItemType((payload as { itemType?: unknown }).itemType);
  const itemId = parseItemId((payload as { itemId?: unknown }).itemId);

  if (!itemType) return { error: "itemType is invalid" };
  if (!itemId) return { error: "itemId must be a valid UUID" };

  return { itemType, itemId };
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedSupabase();
  if ("response" in auth) return auth.response;

  const itemType = parseItemType(request.nextUrl.searchParams.get("itemType"));
  const rawItemIds = request.nextUrl.searchParams.getAll("itemId");
  const itemIds = rawItemIds.map(parseItemId).filter((id): id is string => Boolean(id));

  let query = auth.supabase
    .from("nutrition_favorites")
    .select("id,user_id,item_type,item_id,created_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (itemType) {
    query = query.eq("item_type", itemType);
  }

  if (itemIds.length > 0) {
    query = query.in("item_id", itemIds);
  }

  const { data, error } = await query;

  if (error) {
    return databaseErrorResponse("Unable to load favorites", error);
  }

  return NextResponse.json({
    favorites: ((data ?? []) as NutritionFavoriteRow[]).map(mapFavoriteForClient),
  });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedSupabase();
  if ("response" in auth) return auth.response;

  const payload = await readFavoritePayload(request);
  if ("error" in payload) {
    return NextResponse.json({ error: payload.error }, { status: 400 });
  }

  const favoritesTable = (
    auth.supabase as unknown as {
      from: (table: "nutrition_favorites") => FavoriteWriteTable;
    }
  ).from("nutrition_favorites");
  const { error } = await favoritesTable.upsert(
    {
      user_id: auth.user.id,
      item_type: payload.itemType,
      item_id: payload.itemId,
    },
    { onConflict: "user_id,item_type,item_id" },
  );

  if (error) {
    return databaseErrorResponse("Unable to save favorite", error);
  }

  return NextResponse.json({
    favorite: {
      itemType: payload.itemType,
      itemId: payload.itemId,
    },
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthenticatedSupabase();
  if ("response" in auth) return auth.response;

  const queryItemType = parseItemType(request.nextUrl.searchParams.get("itemType"));
  const queryItemId = parseItemId(request.nextUrl.searchParams.get("itemId"));
  const payload =
    queryItemType && queryItemId
      ? { itemType: queryItemType, itemId: queryItemId }
      : await readFavoritePayload(request);

  if ("error" in payload) {
    return NextResponse.json({ error: payload.error }, { status: 400 });
  }

  const favoritesTable = (
    auth.supabase as unknown as {
      from: (table: "nutrition_favorites") => FavoriteWriteTable;
    }
  ).from("nutrition_favorites");
  const { error } = await favoritesTable
    .delete()
    .eq("user_id", auth.user.id)
    .eq("item_type", payload.itemType)
    .eq("item_id", payload.itemId);

  if (error) {
    return databaseErrorResponse("Unable to remove favorite", error);
  }

  return NextResponse.json({ ok: true });
}
