export const MY_LIST_PINNED_SOURCE_ITEMS_STORAGE_PREFIX =
  "creator:my-list:pinned-source-items";
export const MY_LIST_PINNED_SOURCE_ITEMS_CHANGED_EVENT =
  "creator:my-list:pinned-source-items-changed";

export const MY_LIST_PINNABLE_SOURCE_TYPES = [
  "GOAL",
  "PROJECT",
  "TASK",
  "HABIT",
] as const;

export type MyListPinnableSourceType =
  (typeof MY_LIST_PINNABLE_SOURCE_TYPES)[number];

export type MyListPinnedSourceIds = Record<MyListPinnableSourceType, string[]>;

const EMPTY_PINNED_SOURCE_IDS: MyListPinnedSourceIds = {
  GOAL: [],
  PROJECT: [],
  TASK: [],
  HABIT: [],
};

function storageKey(userId: string) {
  return `${MY_LIST_PINNED_SOURCE_ITEMS_STORAGE_PREFIX}:${userId}`;
}

function sanitizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  );
}

export function readPinnedSourceItemIds(
  userId: string | null | undefined,
): MyListPinnedSourceIds {
  if (!userId || typeof window === "undefined") {
    return { ...EMPTY_PINNED_SOURCE_IDS };
  }

  try {
    const stored = window.localStorage.getItem(storageKey(userId));
    if (!stored) return { ...EMPTY_PINNED_SOURCE_IDS };

    const parsed = JSON.parse(stored) as Partial<
      Record<MyListPinnableSourceType, unknown>
    >;
    return {
      GOAL: sanitizeIdList(parsed.GOAL),
      PROJECT: sanitizeIdList(parsed.PROJECT),
      TASK: sanitizeIdList(parsed.TASK),
      HABIT: sanitizeIdList(parsed.HABIT),
    };
  } catch {
    return { ...EMPTY_PINNED_SOURCE_IDS };
  }
}

export function isSourceItemPinned({
  userId,
  sourceType,
  sourceId,
}: {
  userId: string | null | undefined;
  sourceType: MyListPinnableSourceType;
  sourceId: string | null | undefined;
}) {
  if (!sourceId) return false;
  return readPinnedSourceItemIds(userId)[sourceType].includes(sourceId);
}

export function writePinnedSourceItemIds(
  userId: string | null | undefined,
  pinnedIds: MyListPinnedSourceIds,
) {
  if (!userId || typeof window === "undefined") return;

  const sanitized: MyListPinnedSourceIds = {
    GOAL: sanitizeIdList(pinnedIds.GOAL),
    PROJECT: sanitizeIdList(pinnedIds.PROJECT),
    TASK: sanitizeIdList(pinnedIds.TASK),
    HABIT: sanitizeIdList(pinnedIds.HABIT),
  };

  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(sanitized));
    window.dispatchEvent(
      new CustomEvent(MY_LIST_PINNED_SOURCE_ITEMS_CHANGED_EVENT, {
        detail: sanitized,
      }),
    );
  } catch {
    // Ignore unavailable storage so item saves are never blocked by pin state.
  }
}

export function setSourceItemPinned({
  userId,
  sourceType,
  sourceId,
  pinned,
}: {
  userId: string | null | undefined;
  sourceType: MyListPinnableSourceType;
  sourceId: string | null | undefined;
  pinned: boolean;
}) {
  if (!userId || !sourceId) return;

  const current = readPinnedSourceItemIds(userId);
  const currentIds = current[sourceType];
  const nextIds = pinned
    ? Array.from(new Set([...currentIds, sourceId]))
    : currentIds.filter((id) => id !== sourceId);

  writePinnedSourceItemIds(userId, {
    ...current,
    [sourceType]: nextIds,
  });
}
