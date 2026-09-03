import { getSupabaseBrowser } from "../../../lib/supabase";
import { AREAS, getAreaById, isAreaId, type AreaId } from "@/config/areas";

export const MY_LIST_NAME_MAX_LENGTH = 80;
export const MY_LIST_GROCERY_SYSTEM_KEY = "grocery";
export const MY_LIST_GROCERY_NAME = "Grocery List";
const MY_LIST_AREA_SYSTEM_KEY_PREFIX = "area:";
const MY_LIST_MONUMENT_SYSTEM_KEY_PREFIX = "monument:";

export type MyListSystemListIdentity =
  | { kind: "grocery" }
  | { kind: "area"; areaId: AreaId }
  | { kind: "monument"; monumentId: string }
  | { kind: "unknown"; systemKey: string };

export type MyListSystemMonumentSource = {
  id: string;
  title: string;
  emoji?: string | null;
};

export type MyListList = {
  id: string;
  userId: string;
  name: string;
  systemKey: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type MyListListRow = {
  id: string;
  user_id: string;
  name: string;
  system_key: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type Result = {
  data: MyListListRow[] | null;
  error: { code?: string; message?: string } | null;
};
type Query = PromiseLike<Result> & {
  select(columns?: string): Query;
  eq(column: string, value: unknown): Query;
  order(column: string, options?: Record<string, unknown>): Query;
  insert(value: Partial<MyListListRow>): Query;
  update(value: Partial<MyListListRow>): Query;
};
type Client = { from(table: "my_list_lists"): Query };

function client(): Client {
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error("Supabase client not available");
  return supabase as unknown as Client;
}

function fromRow(row: MyListListRow): MyListList {
  const systemIdentity = parseMyListSystemKey(row.system_key);
  const area =
    systemIdentity.kind === "area" ? getAreaById(systemIdentity.areaId) : null;

  return {
    id: row.id,
    userId: row.user_id,
    name: area
      ? area.label
      : row.system_key === MY_LIST_GROCERY_SYSTEM_KEY
        ? MY_LIST_GROCERY_NAME
        : row.name,
    systemKey: row.system_key ?? null,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getMyListAreaSystemKey(areaId: AreaId) {
  return `${MY_LIST_AREA_SYSTEM_KEY_PREFIX}${areaId.trim().toLowerCase()}`;
}

export function getMyListMonumentSystemKey(monumentId: string) {
  return `${MY_LIST_MONUMENT_SYSTEM_KEY_PREFIX}${monumentId.trim().toLowerCase()}`;
}

export function parseMyListSystemKey(
  systemKey: string | null | undefined,
): MyListSystemListIdentity {
  const normalized = systemKey?.trim().toLowerCase();
  if (!normalized) return { kind: "unknown", systemKey: "" };
  if (normalized === MY_LIST_GROCERY_SYSTEM_KEY) return { kind: "grocery" };

  if (normalized.startsWith(MY_LIST_AREA_SYSTEM_KEY_PREFIX)) {
    const areaId = normalized.slice(MY_LIST_AREA_SYSTEM_KEY_PREFIX.length);
    if (isAreaId(areaId)) return { kind: "area", areaId };
  }

  if (normalized.startsWith(MY_LIST_MONUMENT_SYSTEM_KEY_PREFIX)) {
    const monumentId = normalized.slice(MY_LIST_MONUMENT_SYSTEM_KEY_PREFIX.length);
    if (monumentId) return { kind: "monument", monumentId };
  }

  return { kind: "unknown", systemKey: normalized };
}

function sortMyListLists(lists: MyListList[]) {
  return [...lists].sort((left, right) => {
    const leftSystemRank =
      left.systemKey === MY_LIST_GROCERY_SYSTEM_KEY ? 0 : 1;
    const rightSystemRank =
      right.systemKey === MY_LIST_GROCERY_SYSTEM_KEY ? 0 : 1;
    if (leftSystemRank !== rightSystemRank) {
      return leftSystemRank - rightSystemRank;
    }

    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
    if (createdAtComparison !== 0) return createdAtComparison;

    return left.name.localeCompare(right.name);
  });
}

function normalizeListName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isUniqueViolation(error: { code?: string; message?: string } | null) {
  return error?.code === "23505";
}

async function fetchMyListLists(userId: string): Promise<MyListList[]> {
  const { data, error } = await client()
    .from("my_list_lists")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return sortMyListLists((data ?? []).map(fromRow));
}

async function provisionGroceryList(
  userId: string,
  lists: MyListList[],
): Promise<boolean> {
  if (
    lists.some((list) => list.systemKey === MY_LIST_GROCERY_SYSTEM_KEY)
  ) {
    return false;
  }

  const adoptableList = lists.find(
    (list) =>
      list.systemKey === null &&
      normalizeListName(list.name) === normalizeListName(MY_LIST_GROCERY_NAME),
  );

  if (adoptableList) {
    const { error } = await client()
      .from("my_list_lists")
      .update({
        name: MY_LIST_GROCERY_NAME,
        system_key: MY_LIST_GROCERY_SYSTEM_KEY,
      })
      .eq("user_id", userId)
      .eq("id", adoptableList.id)
      .select("*");
    if (error && !isUniqueViolation(error)) throw error;
    return true;
  }

  const { error } = await client()
    .from("my_list_lists")
    .insert({
      user_id: userId,
      name: MY_LIST_GROCERY_NAME,
      system_key: MY_LIST_GROCERY_SYSTEM_KEY,
    })
    .select("*");
  if (error && !isUniqueViolation(error)) throw error;
  return true;
}

async function provisionSystemList({
  userId,
  lists,
  name,
  systemKey,
  sortOrder,
}: {
  userId: string;
  lists: MyListList[];
  name: string;
  systemKey: string;
  sortOrder?: number;
}): Promise<boolean> {
  if (lists.some((list) => list.systemKey === systemKey)) {
    return false;
  }

  const insertValue: Partial<MyListListRow> = {
    user_id: userId,
    name,
    system_key: systemKey,
  };
  if (typeof sortOrder === "number") {
    insertValue.sort_order = sortOrder;
  }

  const { error } = await client()
    .from("my_list_lists")
    .insert(insertValue)
    .select("*");
  if (error && !isUniqueViolation(error)) throw error;
  return true;
}

async function provisionAreaLists(
  userId: string,
  lists: MyListList[],
): Promise<boolean> {
  let didProvision = false;
  for (const area of AREAS) {
    didProvision =
      (await provisionSystemList({
        userId,
        lists,
        name: area.label,
        systemKey: getMyListAreaSystemKey(area.id),
        sortOrder: area.sortOrder,
      })) || didProvision;
  }
  return didProvision;
}

function normalizeMonumentSource(
  monument: MyListSystemMonumentSource,
): MyListSystemMonumentSource | null {
  const id = monument.id.trim();
  if (!id) return null;
  return {
    id,
    title: monument.title.trim() || "Untitled Monument",
    emoji: monument.emoji?.trim() || null,
  };
}

async function provisionMonumentLists(
  userId: string,
  lists: MyListList[],
  monuments: readonly MyListSystemMonumentSource[],
): Promise<boolean> {
  let didProvision = false;
  for (const monument of monuments) {
    const normalizedMonument = normalizeMonumentSource(monument);
    if (!normalizedMonument) continue;
    didProvision =
      (await provisionSystemList({
        userId,
        lists,
        name: normalizedMonument.title,
        systemKey: getMyListMonumentSystemKey(normalizedMonument.id),
      })) || didProvision;
  }
  return didProvision;
}

export async function loadMyListLists(
  userId: string,
  options?: { monuments?: readonly MyListSystemMonumentSource[] },
): Promise<MyListList[]> {
  const lists = await fetchMyListLists(userId);
  const didProvisionGrocery = await provisionGroceryList(userId, lists);
  const didProvisionAreas = await provisionAreaLists(userId, lists);
  const didProvisionMonuments = await provisionMonumentLists(
    userId,
    lists,
    options?.monuments ?? [],
  );
  const didProvision =
    didProvisionGrocery || didProvisionAreas || didProvisionMonuments;
  return didProvision ? fetchMyListLists(userId) : lists;
}

export async function createMyListList({
  userId,
  name,
}: {
  userId: string;
  name: string;
}): Promise<MyListList> {
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error("List name cannot be empty.");
  if (normalizedName.length > MY_LIST_NAME_MAX_LENGTH) {
    throw new Error(
      `List name cannot exceed ${MY_LIST_NAME_MAX_LENGTH} characters.`,
    );
  }

  const { data, error } = await client()
    .from("my_list_lists")
    .insert({ user_id: userId, name: normalizedName })
    .select("*");
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error("List creation returned no row.");
  return fromRow(row);
}
