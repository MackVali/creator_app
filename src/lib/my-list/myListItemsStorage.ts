import { getSupabaseBrowser } from "../../../lib/supabase";

export const MY_LIST_ITEMS_MIGRATION_STORAGE_PREFIX =
  "creator:my-list:items-migrated-to-supabase";

const MY_LIST_SOURCE_TYPES = ["GOAL", "PROJECT", "TASK", "HABIT"] as const;
const MY_LIST_VALID_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MyListItemKind = "MANUAL" | "PINNED_SOURCE";
export type MyListSourceType = (typeof MY_LIST_SOURCE_TYPES)[number];
export type MyListStorageDayBucketId = "morning" | "afternoon" | "evening";

export type MyListManualStorageItem = {
  id: string;
  done: boolean;
  completedAt: string | null;
  skillId: string | null;
  skillName: string | null;
  skillIcon: string;
  priorityId: string;
  dayBucketId: MyListStorageDayBucketId | null;
  text: string;
  insertAfterRowKey: string | null;
};

export type MyListPinnedSourceStorageItem = {
  sourceType: MyListSourceType;
  sourceId: string;
  done: boolean;
  completedAt: string | null;
  priorityId: string | null;
  dayBucketId: MyListStorageDayBucketId | null;
  sortOrder: number;
};

type MyListItemMetadata = {
  local_row_id?: unknown;
};

type MyListItemRow = {
  id: string;
  user_id: string;
  item_kind: MyListItemKind;
  source_type: MyListSourceType | null;
  source_id: string | null;
  text: string | null;
  done: boolean | null;
  completed_at: string | null;
  priority_id: string | null;
  day_bucket_id: string | null;
  skill_id: string | null;
  skill_name: string | null;
  skill_icon: string | null;
  icon: string | null;
  insert_after_row_key: string | null;
  sort_order: number | null;
  metadata: MyListItemMetadata | null;
};

type MyListItemWrite = Partial<MyListItemRow> & {
  user_id: string;
  item_kind: MyListItemKind;
};

type QueryResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

type QueryBuilder<T> = PromiseLike<QueryResult<T>> & {
  select(columns?: string): QueryBuilder<T>;
  eq(column: string, value: unknown): QueryBuilder<T>;
  in(column: string, values: readonly unknown[]): QueryBuilder<T>;
  order(column: string, options?: Record<string, unknown>): QueryBuilder<T>;
  insert(values: MyListItemWrite | MyListItemWrite[]): QueryBuilder<T>;
  upsert(
    values: MyListItemWrite | MyListItemWrite[],
    options?: Record<string, unknown>
  ): QueryBuilder<T>;
  update(values: Partial<MyListItemRow>): QueryBuilder<T>;
  delete(): QueryBuilder<T>;
};

type MyListItemsClient = {
  from(table: "my_list_items"): QueryBuilder<MyListItemRow[]>;
};

function getClient(): MyListItemsClient | null {
  const supabase = getSupabaseBrowser();
  return supabase ? (supabase as unknown as MyListItemsClient) : null;
}

export function isValidMyListUuid(value: string) {
  return MY_LIST_VALID_UUID_PATTERN.test(value);
}

function createUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) =>
    (
      Number(char) ^
      (Math.random() * 16) >>
        (Number(char) / 4)
    ).toString(16)
  );
}

function migrationStorageKey(userId: string) {
  return `${MY_LIST_ITEMS_MIGRATION_STORAGE_PREFIX}:${userId}`;
}

function markMigrationCompleted(userId: string) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(migrationStorageKey(userId), "1");
  } catch {
    // Migration success does not depend on writing the local marker.
  }
}

function readMetadata(value: unknown): MyListItemMetadata {
  return value && typeof value === "object"
    ? (value as MyListItemMetadata)
    : {};
}

function hasMatchingManualRow(
  existingRows: MyListItemRow[],
  localRow: MyListManualStorageItem
) {
  return existingRows.some((row) => {
    if (row.id === localRow.id) return true;

    const metadata = readMetadata(row.metadata);
    if (metadata.local_row_id === localRow.id) return true;

    return (
      row.text === localRow.text &&
      Boolean(row.done) === localRow.done &&
      (row.day_bucket_id ?? null) === localRow.dayBucketId &&
      (row.priority_id ?? "") === localRow.priorityId
    );
  });
}

function manualRowToWrite(
  userId: string,
  row: MyListManualStorageItem,
  sortOrder: number,
  options?: {
    storageId?: string;
    localIdToStorageId?: Map<string, string>;
  }
): MyListItemWrite {
  const canPreserveId = isValidMyListUuid(row.id);
  const storageId = options?.storageId ?? (canPreserveId ? row.id : createUuid());
  const insertAfterRowKey =
    row.insertAfterRowKey?.startsWith("manual:")
      ? (() => {
          const localAnchorId = row.insertAfterRowKey.slice("manual:".length);
          const storageAnchorId = options?.localIdToStorageId?.get(localAnchorId);
          return storageAnchorId ? `manual:${storageAnchorId}` : row.insertAfterRowKey;
        })()
      : row.insertAfterRowKey;

  return {
    id: storageId,
    user_id: userId,
    item_kind: "MANUAL",
    source_type: null,
    source_id: null,
    text: row.text,
    done: row.done,
    completed_at: row.done ? row.completedAt : null,
    priority_id: row.priorityId,
    day_bucket_id: row.dayBucketId,
    skill_id: row.skillId,
    skill_name: row.skillName,
    skill_icon: row.skillIcon,
    insert_after_row_key: insertAfterRowKey,
    sort_order: sortOrder,
    metadata: canPreserveId ? {} : { local_row_id: row.id },
  };
}

function rowToManualItem(
  row: MyListItemRow,
  fallbackPriorityId: string
): MyListManualStorageItem | null {
  if (!row.id || row.item_kind !== "MANUAL") return null;

  const dayBucketId =
    row.day_bucket_id === "morning" ||
    row.day_bucket_id === "afternoon" ||
    row.day_bucket_id === "evening"
      ? row.day_bucket_id
      : null;
  const done = Boolean(row.done);

  return {
    id: row.id,
    done,
    completedAt: done && row.completed_at ? row.completed_at : null,
    skillId: row.skill_id ?? null,
    skillName: row.skill_name ?? null,
    skillIcon: row.skill_icon ?? "",
    priorityId: row.priority_id ?? fallbackPriorityId,
    dayBucketId,
    text: row.text ?? "",
    insertAfterRowKey: row.insert_after_row_key ?? null,
  };
}

async function fetchManualRows(userId: string) {
  const client = getClient();
  if (!client) throw new Error("Supabase client not available");

  const { data, error } = await client
    .from("my_list_items")
    .select("*")
    .eq("user_id", userId)
    .eq("item_kind", "MANUAL")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function loadManualMyListItems({
  userId,
  localRows,
  fallbackPriorityId,
}: {
  userId: string;
  localRows: MyListManualStorageItem[];
  fallbackPriorityId: string;
}) {
  const existingRows = await fetchManualRows(userId);
  const localIdToStorageId = new Map<string, string>();
  existingRows.forEach((row) => {
    const metadata = readMetadata(row.metadata);
    if (typeof metadata.local_row_id === "string" && metadata.local_row_id) {
      localIdToStorageId.set(metadata.local_row_id, row.id);
    }
    localIdToStorageId.set(row.id, row.id);
  });
  localRows.forEach((row) => {
    if (!localIdToStorageId.has(row.id)) {
      localIdToStorageId.set(row.id, isValidMyListUuid(row.id) ? row.id : createUuid());
    }
  });
  const rowsToMigrate = localRows
    .filter((row) => !hasMatchingManualRow(existingRows, row))
    .map((row, index) =>
      manualRowToWrite(userId, row, existingRows.length + index, {
        storageId: localIdToStorageId.get(row.id),
        localIdToStorageId,
      })
    );

  if (rowsToMigrate.length > 0) {
    const client = getClient();
    if (!client) throw new Error("Supabase client not available");

    const { error } = await client
      .from("my_list_items")
      .upsert(rowsToMigrate, { onConflict: "id" })
      .select("*");
    if (error) throw error;
    markMigrationCompleted(userId);
  } else if (localRows.length > 0) {
    markMigrationCompleted(userId);
  }

  const rows = rowsToMigrate.length > 0 ? await fetchManualRows(userId) : existingRows;
  return rows
    .map((row) => rowToManualItem(row, fallbackPriorityId))
    .filter((row): row is MyListManualStorageItem => Boolean(row));
}

export async function replaceManualMyListItems({
  userId,
  rows,
}: {
  userId: string;
  rows: MyListManualStorageItem[];
}) {
  const client = getClient();
  if (!client) throw new Error("Supabase client not available");

  const rowsToWrite = rows.map((row, index) => manualRowToWrite(userId, row, index));
  const idsToKeep = rowsToWrite
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string" && isValidMyListUuid(id));

  if (rowsToWrite.length > 0) {
    const { error } = await client
      .from("my_list_items")
      .upsert(rowsToWrite, { onConflict: "id" })
      .select("*");
    if (error) throw error;
  }

  const existingRows = await fetchManualRows(userId);
  const staleIds = existingRows
    .map((row) => row.id)
    .filter((id) => !idsToKeep.includes(id));

  if (staleIds.length > 0) {
    const { error } = await client
      .from("my_list_items")
      .delete()
      .eq("user_id", userId)
      .eq("item_kind", "MANUAL")
      .in("id", staleIds);
    if (error) throw error;
  }
}

function pinnedRowToWrite({
  userId,
  sourceType,
  sourceId,
  sortOrder,
}: {
  userId: string;
  sourceType: MyListSourceType;
  sourceId: string;
  sortOrder: number;
}): MyListItemWrite {
  return {
    user_id: userId,
    item_kind: "PINNED_SOURCE",
    source_type: sourceType,
    source_id: sourceId,
    done: false,
    completed_at: null,
    sort_order: sortOrder,
    metadata: {},
  };
}

async function fetchPinnedRows(userId: string) {
  const client = getClient();
  if (!client) throw new Error("Supabase client not available");

  const { data, error } = await client
    .from("my_list_items")
    .select("*")
    .eq("user_id", userId)
    .eq("item_kind", "PINNED_SOURCE")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function loadPinnedSourceMyListItems({
  userId,
  localPinnedIds,
}: {
  userId: string;
  localPinnedIds: Record<MyListSourceType, string[]>;
}): Promise<MyListPinnedSourceStorageItem[]> {
  const existingRows = await fetchPinnedRows(userId);
  const existingKeys = new Set(
    existingRows.map((row) => `${row.source_type ?? ""}:${row.source_id ?? ""}`)
  );
  const rowsToMigrate = MY_LIST_SOURCE_TYPES.flatMap((sourceType) =>
    localPinnedIds[sourceType]
      .filter((sourceId) => sourceId && !existingKeys.has(`${sourceType}:${sourceId}`))
      .map((sourceId, index) =>
        pinnedRowToWrite({
          userId,
          sourceType,
          sourceId,
          sortOrder: existingRows.length + index,
        })
      )
  );

  if (rowsToMigrate.length > 0) {
    const client = getClient();
    if (!client) throw new Error("Supabase client not available");

    const { error } = await client
      .from("my_list_items")
      .upsert(rowsToMigrate, {
        onConflict: "user_id,source_type,source_id",
      })
      .select("*");
    if (error) throw error;
    markMigrationCompleted(userId);
  } else {
    markMigrationCompleted(userId);
  }

  const rows = rowsToMigrate.length > 0 ? await fetchPinnedRows(userId) : existingRows;
  return rows
    .map((row) => {
      if (!row.source_type || !row.source_id) return null;
      return {
        sourceType: row.source_type,
        sourceId: row.source_id,
        done: Boolean(row.done),
        completedAt: row.done && row.completed_at ? row.completed_at : null,
        priorityId: row.priority_id ?? null,
        dayBucketId:
          row.day_bucket_id === "morning" ||
          row.day_bucket_id === "afternoon" ||
          row.day_bucket_id === "evening"
            ? row.day_bucket_id
            : null,
        sortOrder: row.sort_order ?? 0,
      };
    })
    .filter((row): row is MyListPinnedSourceStorageItem => Boolean(row));
}

export async function setPinnedSourceMyListItem({
  userId,
  sourceType,
  sourceId,
  pinned,
}: {
  userId: string;
  sourceType: MyListSourceType;
  sourceId: string;
  pinned: boolean;
}) {
  const client = getClient();
  if (!client) throw new Error("Supabase client not available");

  if (!pinned) {
    const { error } = await client
      .from("my_list_items")
      .delete()
      .eq("user_id", userId)
      .eq("item_kind", "PINNED_SOURCE")
      .eq("source_type", sourceType)
      .eq("source_id", sourceId);
    if (error) throw error;
    return;
  }

  const { error } = await client
    .from("my_list_items")
    .upsert(pinnedRowToWrite({ userId, sourceType, sourceId, sortOrder: 0 }), {
      onConflict: "user_id,source_type,source_id",
    })
    .select("*");
  if (error) throw error;
}

export async function updatePinnedSourceMyListItemCompletion({
  userId,
  sourceType,
  sourceId,
  done,
  completedAt,
}: {
  userId: string;
  sourceType: MyListSourceType;
  sourceId: string;
  done: boolean;
  completedAt: string | null;
}) {
  const client = getClient();
  if (!client) throw new Error("Supabase client not available");

  const { error } = await client
    .from("my_list_items")
    .update({
      done,
      completed_at: done ? completedAt : null,
    })
    .eq("user_id", userId)
    .eq("item_kind", "PINNED_SOURCE")
    .eq("source_type", sourceType)
    .eq("source_id", sourceId);

  if (error) throw error;
}

export async function updatePinnedSourceMyListItemMetadata({
  userId,
  sourceType,
  sourceId,
  priorityId,
  dayBucketId,
}: {
  userId: string;
  sourceType: MyListSourceType;
  sourceId: string;
  priorityId?: string;
  dayBucketId?: MyListStorageDayBucketId | null;
}) {
  const client = getClient();
  if (!client) throw new Error("Supabase client not available");

  const values: Partial<MyListItemRow> = {};
  if (priorityId !== undefined) values.priority_id = priorityId;
  if (dayBucketId !== undefined) values.day_bucket_id = dayBucketId;

  const { error } = await client
    .from("my_list_items")
    .update(values)
    .eq("user_id", userId)
    .eq("item_kind", "PINNED_SOURCE")
    .eq("source_type", sourceType)
    .eq("source_id", sourceId);

  if (error) throw error;
}
