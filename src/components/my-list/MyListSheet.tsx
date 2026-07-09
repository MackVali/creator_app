"use client";

import {
  useCallback,
  type ChangeEvent as ReactChangeEvent,
  type CSSProperties as ReactCSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  AutoScrollActivator,
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import clsx from "clsx";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  GripVertical,
  Grid2x2,
  List,
  Moon,
  Plus,
  Sun,
  Sunrise,
  X,
} from "lucide-react";

import type { CatRow } from "@/lib/types/cat";
import type { SkillRow } from "@/lib/types/skill";
import type { TaskLite } from "@/lib/scheduler/weight";
import type { CreatorXpBurstRect } from "@/lib/effects/creatorXpBurstBus";
import {
  MY_LIST_PINNABLE_SOURCE_TYPES,
  type MyListPinnableSourceType,
} from "@/lib/my-list/pinnedSourceItems";
import {
  loadManualMyListItems,
  replaceManualMyListItems,
} from "@/lib/my-list/myListItemsStorage";
import { MatrixContent } from "@/app/(app)/schedule/matrix/MatrixContent";
import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  normalizePriority,
  type PriorityBucketId,
} from "@/app/(app)/schedule/priorities/utils";

const QUICK_CREATE_PRIORITY_PLACEHOLDER_SYMBOL = "◇";
const QUICK_CREATE_PRIORITY_SYMBOLS: Record<PriorityBucketId, string> = {
  "ULTRA-CRITICAL": "!!!!",
  CRITICAL: "!!!",
  HIGH: "!!",
  MEDIUM: "!",
  LOW: "~",
  NO: QUICK_CREATE_PRIORITY_PLACEHOLDER_SYMBOL,
};

const QUICK_CREATE_PRIORITY_OPTIONS = PRIORITY_ORDER.map((priority) => ({
  id: priority,
  label: PRIORITY_LABELS[priority],
  symbol: QUICK_CREATE_PRIORITY_SYMBOLS[priority],
}));
const MY_LIST_DAY_BUCKETS = ["morning", "afternoon", "evening"] as const;
const MY_LIST_DAY_VIEW_BUCKETS = [
  "anytime",
  "morning",
  "afternoon",
  "evening",
] as const;
const MY_LIST_DAY_LABELS: Record<MyListDayViewBucketId, string> = {
  anytime: "Anytime",
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};
const MY_LIST_DAY_VISUALS: Record<
  MyListDayViewBucketId,
  {
    Icon: typeof Clock;
    pillClassName: string;
  }
> = {
  anytime: {
    Icon: Clock,
    pillClassName:
      "border-zinc-300/10 bg-zinc-400/[0.11] text-zinc-200/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]",
  },
  morning: {
    Icon: Sunrise,
    pillClassName:
      "border-yellow-100/[0.13] bg-[#5a4a1f]/35 text-yellow-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]",
  },
  afternoon: {
    Icon: Sun,
    pillClassName:
      "border-[#6e1f2a]/45 bg-[#3a0f18]/88 text-rose-100/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]",
  },
  evening: {
    Icon: Moon,
    pillClassName:
      "border-[#6f3a68]/48 bg-[#3b173f]/82 text-fuchsia-100/76 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]",
  },
};
const LIST_COMPACT_HEADER_ALLOWANCE = 40;
const LIST_COMPACT_ROW_HEIGHT = 42;
const LIST_COMPACT_GROUP_HEADER_HEIGHT = 26;
const LIST_COMPACT_NOTES_ALLOWANCE = 120;
const LIST_COMPACT_BOTTOM_ALLOWANCE = 36;
const LIST_COMPACT_EXPAND_THRESHOLD_RATIO = 0.88;
const MY_LIST_MIN_SAFE_SHEET_HEIGHT = 96;
const MY_LIST_MIN_EDITABLE_SHEET_HEIGHT =
  LIST_COMPACT_HEADER_ALLOWANCE +
  LIST_COMPACT_ROW_HEIGHT +
  LIST_COMPACT_NOTES_ALLOWANCE +
  LIST_COMPACT_BOTTOM_ALLOWANCE;
const MY_LIST_KEYBOARD_RECALC_DELAYS_MS = [80, 220, 420] as const;
const MY_LIST_EDITABLE_TARGET_SELECTOR =
  'input, textarea, [contenteditable="true"]';
const MY_LIST_NOTES_STORAGE_KEY = "creator:my-list:notes";
const MY_LIST_MANUAL_ROWS_STORAGE_KEY = "creator:my-list:manual-rows";
const MY_LIST_VIEW_MODE_STORAGE_KEY_PREFIX = "creator:my-list:view-mode";
const MY_LIST_VIEW_MODE_ANONYMOUS_ID = "anonymous";
const MY_LIST_VIEW_MODE_PREFERENCES = ["priority", "day", "matrix"] as const;
const MY_LIST_CREATOR_DAY_ROLLOVER_HOUR = 4;
const MY_LIST_SCHEDULE_DRAG_LONG_PRESS_MS = 500;
const MY_LIST_SCHEDULE_DRAG_MOVE_CANCEL_PX = 14;
const MY_LIST_MANUAL_UPGRADE_LONG_PRESS_MS = MY_LIST_SCHEDULE_DRAG_LONG_PRESS_MS;
const MY_LIST_MANUAL_UPGRADE_MOVE_CANCEL_PX =
  MY_LIST_SCHEDULE_DRAG_MOVE_CANCEL_PX;
const MY_LIST_OPEN_QUICK_CREATE_TASK_DETAILS_EVENT =
  "schedule:open-quick-create-task-details";
const MY_LIST_DAY_DRAG_SCHEDULE_EXIT_PX = 22;
const MY_LIST_SCHEDULE_EVENT_DURATION_MIN = 30;
const MY_LIST_SCHEDULE_PRESENTATION_KIND = "project-schedule-card";
const MY_LIST_SCHEDULE_DRAG_BLOCKED_TARGET_SELECTOR = [
  "input",
  "textarea",
  "button",
  "select",
  "label",
  "[role='button']",
  "[role='listbox']",
  "[contenteditable='true']",
  "[data-my-list-no-schedule-drag]",
].join(",");
const MY_LIST_MANUAL_UPGRADE_BLOCKED_TARGET_SELECTOR = [
  "button",
  "select",
  "label",
  "[role='button']",
  "[role='listbox']",
  "[contenteditable='true']",
  "[data-my-list-no-upgrade]",
].join(",");
const MY_LIST_MANUAL_UPGRADE_NO_SELECT_STYLE = {
  WebkitTouchCallout: "none",
  WebkitUserSelect: "none",
  userSelect: "none",
} satisfies ReactCSSProperties;

function toCreatorXpBurstRect(rect: DOMRect): CreatorXpBurstRect {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
  };
}

function resolveQuickCreateMediumPriorityMetadata() {
  return (
    QUICK_CREATE_PRIORITY_OPTIONS.find((option) => option.id === "MEDIUM") ?? {
      id: "MEDIUM" as const,
      label: PRIORITY_LABELS.MEDIUM,
      symbol: QUICK_CREATE_PRIORITY_SYMBOLS.MEDIUM,
    }
  );
}

function clampMyListSheetHeight(height: number, minimumHeight: number) {
  const safeMinimum =
    Number.isFinite(minimumHeight) && minimumHeight > 0
      ? minimumHeight
      : MY_LIST_MIN_SAFE_SHEET_HEIGHT;

  if (!Number.isFinite(height) || height <= 0) {
    return safeMinimum;
  }

  return Math.max(height, safeMinimum);
}

const QUICK_CREATE_UNCATEGORIZED_SKILL_GROUP_ID = "uncategorized";
const QUICK_CREATE_UNCATEGORIZED_SKILL_GROUP_LABEL = "Uncategorized";

type QuickCreateSkillGroup = {
  id: string;
  label: string;
  categoryOrder: number | null;
  skills: SkillRow[];
};

function compareQuickCreateOrderThenName(
  leftOrder: number | null | undefined,
  leftName: string | null | undefined,
  rightOrder: number | null | undefined,
  rightName: string | null | undefined
) {
  const normalizedLeftOrder =
    typeof leftOrder === "number" && Number.isFinite(leftOrder)
      ? leftOrder
      : Number.POSITIVE_INFINITY;
  const normalizedRightOrder =
    typeof rightOrder === "number" && Number.isFinite(rightOrder)
      ? rightOrder
      : Number.POSITIVE_INFINITY;

  if (normalizedLeftOrder !== normalizedRightOrder) {
    return normalizedLeftOrder - normalizedRightOrder;
  }

  return (leftName ?? "").localeCompare(rightName ?? "");
}

type MyListRowKey = `manual:${string}` | `task:${string}`;
type MyListPinnedSourceRowKey = `pinnedSource:${MyListPinnableSourceType}:${string}`;
type MyListDayBucketId = (typeof MY_LIST_DAY_BUCKETS)[number];
type MyListDayViewBucketId = (typeof MY_LIST_DAY_VIEW_BUCKETS)[number];
type MyListViewModePreference = (typeof MY_LIST_VIEW_MODE_PREFERENCES)[number];

function buildPinnedSourceRowKey(
  sourceType: MyListPinnableSourceType,
  sourceId: string
): MyListPinnedSourceRowKey {
  return `pinnedSource:${sourceType}:${sourceId}`;
}

type MyListManualRow = {
  id: string;
  done: boolean;
  completedAt: string | null;
  skillId: string | null;
  skillName: string | null;
  skillIcon: string;
  priorityId: PriorityBucketId;
  dayBucketId: MyListDayBucketId | null;
  text: string;
  insertAfterRowKey: MyListRowKey | null;
};

const EMPTY_DRAFT_MANUAL_ROW_ID = "empty-draft";

function createManualRow(
  id: string,
  priorityId: PriorityBucketId
): MyListManualRow {
  return {
    id,
    done: false,
    completedAt: null,
    skillId: null,
    skillName: null,
    skillIcon: "",
    priorityId,
    dayBucketId: null,
    text: "",
    insertAfterRowKey: null,
  };
}

function sanitizeMyListManualRow(
  value: unknown,
  fallbackPriorityId: PriorityBucketId
): MyListManualRow | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!id || id === EMPTY_DRAFT_MANUAL_ROW_ID) return null;

  const done = Boolean(record.done);
  const completedAtValue = record.completedAt;
  const completedAt =
    done && typeof completedAtValue === "string" && completedAtValue.trim()
      ? completedAtValue
      : null;
  const priorityId =
    typeof record.priorityId === "string"
      ? normalizePriority(record.priorityId)
      : fallbackPriorityId;

  return {
    id,
    done,
    completedAt,
    skillId:
      typeof record.skillId === "string" && record.skillId.trim()
        ? record.skillId
        : null,
    skillName:
      typeof record.skillName === "string" && record.skillName.trim()
        ? record.skillName
        : null,
    skillIcon: typeof record.skillIcon === "string" ? record.skillIcon : "",
    priorityId,
    dayBucketId: readMyListDayBucketFromUnknown(record),
    text: typeof record.text === "string" ? record.text : "",
    insertAfterRowKey:
      typeof record.insertAfterRowKey === "string" &&
      /^(manual|task):.+/.test(record.insertAfterRowKey) &&
      record.insertAfterRowKey !== `manual:${EMPTY_DRAFT_MANUAL_ROW_ID}`
        ? (record.insertAfterRowKey as MyListRowKey)
        : null,
  };
}

function sanitizeMyListManualRows(
  rows: unknown,
  fallbackPriorityId: PriorityBucketId
): MyListManualRow[] {
  if (!Array.isArray(rows)) return [];

  const seenRowIds = new Set<string>();
  return rows.reduce<MyListManualRow[]>((sanitizedRows, row) => {
    const sanitizedRow = sanitizeMyListManualRow(row, fallbackPriorityId);
    if (!sanitizedRow || seenRowIds.has(sanitizedRow.id)) {
      return sanitizedRows;
    }

    seenRowIds.add(sanitizedRow.id);
    sanitizedRows.push(sanitizedRow);
    return sanitizedRows;
  }, []);
}

function sanitizePinnedSourceRow(value: unknown): MyListPinnedSourceRow | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const sourceType =
    typeof record.sourceType === "string" &&
    MY_LIST_PINNABLE_SOURCE_TYPES.includes(
      record.sourceType as MyListPinnableSourceType
    )
      ? (record.sourceType as MyListPinnableSourceType)
      : null;

  if (!id || !sourceType) return null;

  return {
    id,
    sourceType,
    title:
      typeof record.title === "string" && record.title.trim()
        ? record.title
        : `Untitled ${sourceType.toLowerCase()}`,
    icon: typeof record.icon === "string" ? record.icon : null,
    priority: typeof record.priority === "string" ? record.priority : null,
    energy: typeof record.energy === "string" ? record.energy : null,
    stage: typeof record.stage === "string" ? record.stage : null,
    completedAt:
      typeof record.completedAt === "string" && record.completedAt.trim()
        ? record.completedAt
        : null,
  };
}

function sanitizePinnedSourceRows(rows: unknown): MyListPinnedSourceRow[] {
  if (!Array.isArray(rows)) return [];

  const seenRowKeys = new Set<string>();
  return rows.reduce<MyListPinnedSourceRow[]>((sanitizedRows, row) => {
    const sanitizedRow = sanitizePinnedSourceRow(row);
    if (!sanitizedRow) return sanitizedRows;

    const rowKey = `${sanitizedRow.sourceType}:${sanitizedRow.id}`;
    if (seenRowKeys.has(rowKey)) return sanitizedRows;

    seenRowKeys.add(rowKey);
    sanitizedRows.push(sanitizedRow);
    return sanitizedRows;
  }, []);
}

function readStoredMyListManualRows(
  fallbackPriorityId: PriorityBucketId
): MyListManualRow[] {
  if (typeof window === "undefined") return [];

  try {
    const storedRows = window.localStorage.getItem(
      MY_LIST_MANUAL_ROWS_STORAGE_KEY
    );
    if (storedRows === null) return [];
    return sanitizeMyListManualRows(JSON.parse(storedRows), fallbackPriorityId);
  } catch {
    return [];
  }
}

function writeStoredMyListManualRows(
  rows: MyListManualRow[],
  fallbackPriorityId: PriorityBucketId
) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      MY_LIST_MANUAL_ROWS_STORAGE_KEY,
      JSON.stringify(sanitizeMyListManualRows(rows, fallbackPriorityId))
    );
  } catch {
    // Ignore unavailable storage so My List row editing is never blocked.
  }
}

function normalizeMyListViewModePreference(
  value: unknown
): MyListViewModePreference | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (
    MY_LIST_VIEW_MODE_PREFERENCES.includes(
      normalized as MyListViewModePreference
    )
  ) {
    return normalized as MyListViewModePreference;
  }
  return null;
}

function getMyListViewModeStorageKey(userId?: string | null) {
  const normalizedUserId = typeof userId === "string" ? userId.trim() : "";
  return `${MY_LIST_VIEW_MODE_STORAGE_KEY_PREFIX}:${
    normalizedUserId || MY_LIST_VIEW_MODE_ANONYMOUS_ID
  }`;
}

function readStoredMyListViewModePreference(
  userId?: string | null
): MyListViewModePreference | null {
  if (typeof window === "undefined") return null;

  try {
    const storedPreference = normalizeMyListViewModePreference(
      window.localStorage.getItem(getMyListViewModeStorageKey(userId))
    );
    if (storedPreference || !userId?.trim()) return storedPreference;

    return normalizeMyListViewModePreference(
      window.localStorage.getItem(getMyListViewModeStorageKey(null))
    );
  } catch {
    return null;
  }
}

function writeStoredMyListViewModePreference(
  userId: string | null | undefined,
  preference: MyListViewModePreference
) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      getMyListViewModeStorageKey(userId),
      preference
    );
  } catch {
    // Ignore unavailable storage so changing views is never blocked.
  }
}

function normalizeMyListDayBucket(
  value: unknown
): MyListDayBucketId | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (MY_LIST_DAY_BUCKETS.includes(normalized as MyListDayBucketId)) {
    return normalized as MyListDayBucketId;
  }
  return null;
}

function readMyListDayBucketFromUnknown(value: unknown): MyListDayBucketId | null {
  const directBucket = normalizeMyListDayBucket(value);
  if (directBucket) return directBucket;

  if (Array.isArray(value)) {
    for (const item of value) {
      const bucket = readMyListDayBucketFromUnknown(item);
      if (bucket) return bucket;
    }
    return null;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (
      readMyListDayBucketFromUnknown(record.dayBucketId) ??
      readMyListDayBucketFromUnknown(record.day_bucket_id) ??
      readMyListDayBucketFromUnknown(record.dayBucket) ??
      readMyListDayBucketFromUnknown(record.day_bucket) ??
      readMyListDayBucketFromUnknown(record.dayTag) ??
      readMyListDayBucketFromUnknown(record.day_tag) ??
      readMyListDayBucketFromUnknown(record.timeOfDay) ??
      readMyListDayBucketFromUnknown(record.time_of_day) ??
      readMyListDayBucketFromUnknown(record.tags) ??
      readMyListDayBucketFromUnknown(record.tag_list) ??
      readMyListDayBucketFromUnknown(record.metadata)
    );
  }

  return null;
}

function getCurrentLocalCreatorDayStart(now: Date = new Date()) {
  const start = new Date(now);
  start.setHours(MY_LIST_CREATOR_DAY_ROLLOVER_HOUR, 0, 0, 0);

  if (now.getTime() < start.getTime()) {
    start.setDate(start.getDate() - 1);
  }

  return start;
}

function getNextLocalCreatorDayRollover(now: Date = new Date()) {
  const nextRollover = getCurrentLocalCreatorDayStart(now);
  nextRollover.setDate(nextRollover.getDate() + 1);
  return nextRollover;
}

function readCompletedAtFromUnknown(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const completedAt = record.completedAt ?? record.completed_at;
  return typeof completedAt === "string" && completedAt.trim().length > 0
    ? completedAt
    : null;
}

function isCompletedAtInCurrentLocalCreatorDay(
  completedAt: string | null | undefined,
  currentCreatorDayStart: Date,
  nextCreatorDayRollover: Date
) {
  if (!completedAt) return false;

  const completedDate = new Date(completedAt);
  const completedTime = completedDate.getTime();
  return (
    Number.isFinite(completedTime) &&
    completedTime >= currentCreatorDayStart.getTime() &&
    completedTime < nextCreatorDayRollover.getTime()
  );
}

type MyListTaskOverride = {
  skillId?: string | null;
  skillName?: string | null;
  skillIcon?: string | null;
  priorityId?: PriorityBucketId;
  dayBucketId?: MyListDayBucketId | null;
  text?: string;
  completedAt?: string | null;
};

export type MyListPinnedSourceRow = {
  id: string;
  sourceType: MyListPinnableSourceType;
  title: string;
  icon?: string | null;
  priority?: string | null;
  energy?: string | null;
  stage?: string | null;
  completedAt?: string | null;
};

type MyListVisibleTodoRow =
  | { rowType: "task"; task: TaskLite }
  | { rowType: "manual"; row: MyListManualRow }
  | { rowType: "pinnedSource"; row: MyListPinnedSourceRow };

type MyListActiveView = "list" | "matrix";
type MyListScheduleMetadata = {
  source: "my-list";
  rowType: "manual" | "task";
  rowId: string;
  presentationKind: typeof MY_LIST_SCHEDULE_PRESENTATION_KIND;
  taskId?: string;
  skillId?: string | null;
  skillName?: string | null;
  skillIcon?: string | null;
  priorityId: PriorityBucketId;
  priorityLabel: string;
  prioritySymbol: string;
};
type MyListScheduleDragRow = {
  rowType: "manual" | "task";
  rowId: string;
  title: string;
  sourceId: string | null;
  sourceType: "EVENT" | "TASK";
  energy: string | null;
  skillId: string | null;
  metadata: MyListScheduleMetadata;
};
type MyListScheduleDragPress = {
  inputType: "pointer" | "touch";
  pointerId: number;
  pointerType: string | null;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  row: MyListScheduleDragRow;
  rowWidth: number;
  timer: ReturnType<typeof setTimeout>;
  dragStarted: boolean;
  dayDragStarted: boolean;
  dayDropBucketId: MyListDayViewBucketId | null;
  restoreExpanded: boolean;
};
type MyListManualUpgradePress = {
  inputType: "pointer" | "touch";
  pointerId: number;
  startX: number;
  startY: number;
  title: string;
  skillId: string | null;
  priorityId: PriorityBucketId;
  timer: ReturnType<typeof setTimeout>;
  triggered: boolean;
};
type MyListSortableManualTodoHandleProps = {
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
  setActivatorNodeRef: ReturnType<typeof useSortable>["setActivatorNodeRef"];
  isDragging: boolean;
};
type MyListSortableManualTodoRowProps = {
  rowId: string;
  disabled: boolean;
  reorderGroup: MyListManualReorderGroup | null;
  children: (props: MyListSortableManualTodoHandleProps) => ReactNode;
};
type MyListManualReorderGroup =
  | { kind: "day"; id: MyListDayViewBucketId }
  | { kind: "priority"; id: PriorityBucketId };
type MyListManualReorderOverData =
  | { type: "manual-row"; group: MyListManualReorderGroup | null }
  | { type: "manual-group"; group: MyListManualReorderGroup };
type MyListManualReorderDestination = {
  targetRowId: string | null;
  group: MyListManualReorderGroup | null;
};
export type MyListTaskXpContext = {
  skillId: string | null;
  monumentId: string | null;
};

function buildManualReorderGroupDropId(group: MyListManualReorderGroup) {
  return `manualGroup:${group.kind}:${group.id}`;
}

function readManualReorderOverData(
  value: unknown
): MyListManualReorderOverData | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const type = record.type;
  const groupValue = record.group;
  const group =
    groupValue && typeof groupValue === "object"
      ? (groupValue as Record<string, unknown>)
      : null;
  const groupKind = group?.kind;
  const groupId = group?.id;

  if (
    groupKind === "day" &&
    typeof groupId === "string" &&
    MY_LIST_DAY_VIEW_BUCKETS.includes(groupId as MyListDayViewBucketId)
  ) {
    const parsedGroup = {
      kind: groupKind,
      id: groupId as MyListDayViewBucketId,
    } satisfies MyListManualReorderGroup;

    return type === "manual-group" || type === "manual-row"
      ? {
          type,
          group: parsedGroup,
        }
      : null;
  }

  if (
    groupKind === "priority" &&
    typeof groupId === "string" &&
    PRIORITY_ORDER.includes(groupId as PriorityBucketId)
  ) {
    const parsedGroup = {
      kind: groupKind,
      id: groupId as PriorityBucketId,
    } satisfies MyListManualReorderGroup;

    return type === "manual-group" || type === "manual-row"
      ? {
          type,
          group: parsedGroup,
        }
      : null;
  }

  if (type === "manual-row") {
    return { type, group: null };
  }

  return null;
}

function readManualReorderActiveRowId(
  active: DragStartEvent["active"],
  rows: MyListManualRow[]
) {
  const activeData = readManualReorderOverData(active.data.current);
  const rowId = typeof active.id === "string" ? active.id.trim() : "";

  if (
    !rowId ||
    rowId === EMPTY_DRAFT_MANUAL_ROW_ID ||
    activeData?.type !== "manual-row" ||
    !rows.some((row) => row.id === rowId)
  ) {
    return null;
  }

  return rowId;
}

function resolveManualReorderGroupForRow(
  row: MyListManualRow,
  groupKind: MyListManualReorderGroup["kind"]
): MyListManualReorderGroup {
  if (groupKind === "day") {
    return { kind: "day", id: row.dayBucketId ?? "anytime" };
  }

  return { kind: "priority", id: row.priorityId };
}

function isManualRowInReorderGroup(
  row: MyListManualRow,
  group: MyListManualReorderGroup
) {
  const rowGroup = resolveManualReorderGroupForRow(row, group.kind);
  return rowGroup.id === group.id;
}

function applyManualReorderGroup(
  row: MyListManualRow,
  group: MyListManualReorderGroup | null
): MyListManualRow {
  if (!group) return row;

  if (group.kind === "day") {
    const dayBucketId = group.id === "anytime" ? null : group.id;
    return row.dayBucketId === dayBucketId ? row : { ...row, dayBucketId };
  }

  return row.priorityId === group.id ? row : { ...row, priorityId: group.id };
}

function areManualRowsEquivalent(
  leftRows: MyListManualRow[],
  rightRows: MyListManualRow[]
) {
  if (leftRows === rightRows) return true;
  if (leftRows.length !== rightRows.length) return false;

  return leftRows.every((leftRow, index) => {
    const rightRow = rightRows[index];
    return (
      rightRow &&
      leftRow.id === rightRow.id &&
      leftRow.done === rightRow.done &&
      leftRow.completedAt === rightRow.completedAt &&
      leftRow.skillId === rightRow.skillId &&
      leftRow.skillName === rightRow.skillName &&
      leftRow.skillIcon === rightRow.skillIcon &&
      leftRow.priorityId === rightRow.priorityId &&
      leftRow.dayBucketId === rightRow.dayBucketId &&
      leftRow.text === rightRow.text &&
      leftRow.insertAfterRowKey === rightRow.insertAfterRowKey
    );
  });
}

function reorderManualRowsForDestination(
  currentRows: MyListManualRow[],
  draggedRowId: string,
  destination: MyListManualReorderDestination
) {
  if (draggedRowId === EMPTY_DRAFT_MANUAL_ROW_ID) return currentRows;

  const draggedIndex = currentRows.findIndex((row) => row.id === draggedRowId);
  if (draggedIndex < 0) return currentRows;
  if (destination.targetRowId === EMPTY_DRAFT_MANUAL_ROW_ID) return currentRows;

  const draggedRow = applyManualReorderGroup(
    currentRows[draggedIndex],
    destination.group
  );
  const rowsWithoutDragged = currentRows.filter((row) => row.id !== draggedRowId);
  let insertIndex = rowsWithoutDragged.length;

  if (destination.targetRowId) {
    const targetIndex = rowsWithoutDragged.findIndex(
      (row) => row.id === destination.targetRowId
    );
    if (targetIndex < 0) return currentRows;
    insertIndex = targetIndex;
  } else if (destination.group) {
    let lastGroupIndex = -1;
    for (let index = rowsWithoutDragged.length - 1; index >= 0; index -= 1) {
      if (isManualRowInReorderGroup(rowsWithoutDragged[index], destination.group)) {
        lastGroupIndex = index;
        break;
      }
    }
    insertIndex = lastGroupIndex >= 0 ? lastGroupIndex + 1 : rowsWithoutDragged.length;
  }

  const nextRows = [...rowsWithoutDragged];
  nextRows.splice(insertIndex, 0, draggedRow);
  const normalizedRows = nextRows.map((row) =>
    row.insertAfterRowKey ? { ...row, insertAfterRowKey: null } : row
  );

  return areManualRowsEquivalent(currentRows, normalizedRows)
    ? currentRows
    : normalizedRows;
}

function MyListManualTodoGroupDropZone({
  group,
  children,
  className,
  dayDropBucketId,
}: {
  group: MyListManualReorderGroup | null;
  children: ReactNode;
  className?: string;
  dayDropBucketId?: MyListDayViewBucketId;
}) {
  const { setNodeRef } = useDroppable({
    id: group ? buildManualReorderGroupDropId(group) : "manualGroup:none",
    data: group
      ? ({
          type: "manual-group",
          group,
        } satisfies MyListManualReorderOverData)
      : undefined,
    disabled: !group,
  });

  return (
    <div
      ref={setNodeRef}
      data-my-list-day-drop-zone={dayDropBucketId}
      className={className}
    >
      {children}
    </div>
  );
}

function MyListSortableManualTodoRow({
  rowId,
  disabled,
  reorderGroup,
  children,
}: MyListSortableManualTodoRowProps) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: rowId,
    disabled,
    data: {
      type: "manual-row",
      group: reorderGroup,
    } satisfies MyListManualReorderOverData,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 30 : undefined,
      }}
      className={clsx(
        "relative",
        isDragging && "z-30"
      )}
    >
      {children({ attributes, listeners, setActivatorNodeRef, isDragging })}
    </div>
  );
}

export function MyListSheet({
  open,
  onOpenChange,
  userId,
  tasks,
  pinnedSourceRows,
  skills,
  skillCategories,
  pendingTaskIds,
  useFullExpandedHeight,
  enableScheduleTimelineDrag = false,
  onRemovePinnedSource,
  onTogglePinnedSourceCompletion,
  onToggleTask,
  onTaskSkillSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId?: string | null;
  tasks: TaskLite[];
  pinnedSourceRows?: MyListPinnedSourceRow[];
  skills: SkillRow[];
  skillCategories: CatRow[];
  pendingTaskIds: Set<string>;
  useFullExpandedHeight: boolean;
  enableScheduleTimelineDrag?: boolean;
  onRemovePinnedSource?: (row: MyListPinnedSourceRow) => void;
  onTogglePinnedSourceCompletion?: (
    row: MyListPinnedSourceRow,
    completedAt: string | null
  ) => void;
  onToggleTask: (
    taskId: string,
    sourceRect: CreatorXpBurstRect | null,
    xpContext: MyListTaskXpContext
  ) => void;
  onTaskSkillSelect: (taskId: string, skill: SkillRow) => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [note, setNote] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeView, setActiveView] = useState<MyListActiveView>(() =>
    readStoredMyListViewModePreference(userId) === "matrix" ? "matrix" : "list"
  );
  const [isDayLensActive, setIsDayLensActive] = useState(
    () => readStoredMyListViewModePreference(userId) === "day"
  );
  const [areCompletedTodosVisible, setAreCompletedTodosVisible] =
    useState(false);
  const [creatorDayBoundaryNow, setCreatorDayBoundaryNow] = useState(
    () => new Date()
  );
  const [manualRows, setManualRows] = useState<MyListManualRow[]>([]);
  const [activeSkillPickerRowKey, setActiveSkillPickerRowKey] =
    useState<MyListRowKey | null>(null);
  const [activePriorityPickerRowKey, setActivePriorityPickerRowKey] =
    useState<MyListRowKey | null>(null);
  const [activeDayPickerRowKey, setActiveDayPickerRowKey] =
    useState<MyListRowKey | null>(null);
  const [manualSkillSearch, setManualSkillSearch] = useState("");
  const [pendingDeleteRowId, setPendingDeleteRowId] = useState<string | null>(
    null
  );
  const [taskOverrides, setTaskOverrides] = useState<
    Record<string, MyListTaskOverride>
  >({});
  const [pinnedSourceCompletions, setPinnedSourceCompletions] = useState<
    Record<string, string | null>
  >({});
  const [hiddenTaskRowIds, setHiddenTaskRowIds] = useState<Set<string>>(
    () => new Set()
  );
  const [isScheduleDragActive, setIsScheduleDragActive] = useState(false);
  const [activeManualReorderRowId, setActiveManualReorderRowId] = useState<
    string | null
  >(null);
  const [dayDragDropBucketId, setDayDragDropBucketId] =
    useState<MyListDayViewBucketId | null>(null);
  const [pendingTitleFocusRowId, setPendingTitleFocusRowId] = useState<
    string | null
  >(null);
  const [keyboardBottomInset, setKeyboardBottomInset] = useState(0);
  const keyboardBottomOffset = useMotionValue(0);
  const smoothedKeyboardBottomOffset = useSpring(keyboardBottomOffset, {
    stiffness: 520,
    damping: 58,
    mass: 0.9,
    restDelta: 0.5,
  });
  const [myListSheetHeights, setMyListSheetHeights] = useState(() => ({
    compact: 448,
    expanded: 720,
  }));
  const sheetRootRef = useRef<HTMLElement | null>(null);
  const sheetScrollRef = useRef<HTMLDivElement | null>(null);
  const manualTitleInputRefs = useRef(new Map<string, HTMLInputElement>());
  const manualRowIdCounterRef = useRef(0);
  const sheetTouchStartYRef = useRef<number | null>(null);
  const scheduleDragPressRef = useRef<MyListScheduleDragPress | null>(null);
  const manualUpgradePressRef = useRef<MyListManualUpgradePress | null>(null);
  const manualReorderOriginRowsRef = useRef<MyListManualRow[] | null>(null);
  const editableFocusInsideSheetRef = useRef(false);
  const recalculateSheetHeightsRef = useRef<(() => void) | null>(null);
  const keyboardRecalculationTimeoutsRef = useRef<
    ReturnType<typeof setTimeout>[]
  >([]);
  const keyboardBaselineHeightRef = useRef<number | null>(null);
  const focusVisibilityFrameRef = useRef<number | null>(null);
  const focusVisibilityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const lastMeasuredViewportRef = useRef<{ width: number; height: number } | null>(
    null
  );
  const defaultPriority = resolveQuickCreateMediumPriorityMetadata();
  const manualReorderSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    })
  );
  const manualReorderAutoScroll = useMemo(
    () => ({
      enabled: true,
      activator: AutoScrollActivator.Pointer,
      acceleration: 8,
      threshold: { x: 0, y: 0.16 },
      canScroll: (element: Element) => element === sheetScrollRef.current,
    }),
    []
  );
  const applyMyListViewModePreference = useCallback(
    (preference: MyListViewModePreference) => {
      if (preference === "matrix") {
        setActiveView("matrix");
        return;
      }

      setActiveView("list");
      setIsDayLensActive(preference === "day");
    },
    []
  );
  const selectMyListViewModePreference = useCallback(
    (preference: MyListViewModePreference) => {
      writeStoredMyListViewModePreference(userId, preference);
      applyMyListViewModePreference(preference);
    },
    [applyMyListViewModePreference, userId]
  );
  const creatorDayBoundary = useMemo(() => {
    return {
      currentStart: getCurrentLocalCreatorDayStart(creatorDayBoundaryNow),
      nextRollover: getNextLocalCreatorDayRollover(creatorDayBoundaryNow),
    };
  }, [creatorDayBoundaryNow]);
  const visibleTasks = useMemo(
    () => tasks.filter((task) => !hiddenTaskRowIds.has(task.id)),
    [hiddenTaskRowIds, tasks]
  );
  const activeVisibleTasks = useMemo(
    () =>
      visibleTasks.filter(
        (task) => task.stage?.toString().toUpperCase() !== "PERFECT"
      ),
    [visibleTasks]
  );
  const visiblePinnedSourceRows = useMemo(
    () => sanitizePinnedSourceRows(pinnedSourceRows),
    [pinnedSourceRows]
  );
  const activeManualRows = useMemo(
    () => manualRows.filter((row) => !row.done),
    [manualRows]
  );
  const hasListRows =
    activeVisibleTasks.length > 0 ||
    visiblePinnedSourceRows.length > 0 ||
    activeManualRows.length > 0 ||
    open;
  const visibleListRowCount =
    activeVisibleTasks.length +
    visiblePinnedSourceRows.length +
    activeManualRows.length +
    (open ? 1 : 0);
  const visibleManualRows = useMemo(
    () =>
      open
        ? [
            ...manualRows,
            createManualRow(EMPTY_DRAFT_MANUAL_ROW_ID, defaultPriority.id),
          ]
        : manualRows,
    [defaultPriority.id, manualRows, open]
  );
  const visibleManualRowsByAnchor = useMemo(() => {
    const rowsByAnchor = new Map<MyListRowKey, MyListManualRow[]>();

    visibleManualRows.forEach((row) => {
      if (!row.insertAfterRowKey) return;

      const currentRows = rowsByAnchor.get(row.insertAfterRowKey) ?? [];
      currentRows.push(row);
      rowsByAnchor.set(row.insertAfterRowKey, currentRows);
    });

    return rowsByAnchor;
  }, [visibleManualRows]);
  const unanchoredVisibleManualRows = useMemo(
    () => visibleManualRows.filter((row) => !row.insertAfterRowKey),
    [visibleManualRows]
  );
  const visibleTodoRows = useMemo<MyListVisibleTodoRow[]>(() => {
    const rows: MyListVisibleTodoRow[] = [];
    const renderedManualRowIds = new Set<string>();

    const appendAnchoredManualRows = (anchorKey: MyListRowKey) => {
      const anchoredRows = visibleManualRowsByAnchor.get(anchorKey) ?? [];

      anchoredRows.forEach((row) => {
        if (renderedManualRowIds.has(row.id)) return;

        renderedManualRowIds.add(row.id);
        rows.push({ rowType: "manual", row });
        appendAnchoredManualRows(`manual:${row.id}`);
      });
    };

    visibleTasks.forEach((task) => {
      rows.push({ rowType: "task", task });
      appendAnchoredManualRows(`task:${task.id}`);
    });

    visiblePinnedSourceRows.forEach((row) => {
      rows.push({ rowType: "pinnedSource", row });
    });

    unanchoredVisibleManualRows.forEach((row) => {
      if (renderedManualRowIds.has(row.id)) return;

      renderedManualRowIds.add(row.id);
      rows.push({ rowType: "manual", row });
      appendAnchoredManualRows(`manual:${row.id}`);
    });

    visibleManualRows.forEach((row) => {
      if (renderedManualRowIds.has(row.id)) return;

      renderedManualRowIds.add(row.id);
      rows.push({ rowType: "manual", row });
    });

    return rows;
  }, [
    unanchoredVisibleManualRows,
    visibleManualRows,
    visibleManualRowsByAnchor,
    visiblePinnedSourceRows,
    visibleTasks,
  ]);
  const manualReorderItemIds = useMemo(
    () =>
      visibleTodoRows
        .filter(
          (
            visibleRow
          ): visibleRow is Extract<MyListVisibleTodoRow, { rowType: "manual" }> =>
            visibleRow.rowType === "manual" &&
            visibleRow.row.id !== EMPTY_DRAFT_MANUAL_ROW_ID
        )
        .map((visibleRow) => visibleRow.row.id),
    [visibleTodoRows]
  );

  useEffect(() => {
    setPinnedSourceCompletions((currentCompletions) => {
      const nextCompletions = { ...currentCompletions };
      let changed = false;

      visiblePinnedSourceRows.forEach((row) => {
        const completionKey = `${row.sourceType}:${row.id}`;
        const nextCompletedAt = row.completedAt ?? null;
        if (nextCompletions[completionKey] !== nextCompletedAt) {
          nextCompletions[completionKey] = nextCompletedAt;
          changed = true;
        }
      });

      return changed ? nextCompletions : currentCompletions;
    });
  }, [visiblePinnedSourceRows]);

  const activeTodoRows = useMemo(
    () =>
      visibleTodoRows.filter((visibleRow) => {
        if (visibleRow.rowType === "manual") {
          return !visibleRow.row.done;
        }

        if (visibleRow.rowType === "pinnedSource") {
          return !pinnedSourceCompletions[
            `${visibleRow.row.sourceType}:${visibleRow.row.id}`
          ];
        }

        const override = taskOverrides[visibleRow.task.id];
        const hasCompletionOverride = Boolean(
          override && "completedAt" in override
        );
        const done = hasCompletionOverride
          ? Boolean(override?.completedAt)
          : visibleRow.task.stage?.toString().toUpperCase() === "PERFECT";
        return !done;
      }),
    [pinnedSourceCompletions, taskOverrides, visibleTodoRows]
  );
  const completedTodoRows = useMemo(
    () =>
      visibleTodoRows.filter((visibleRow) => {
        let done: boolean;
        let completedAt: string | null;

        if (visibleRow.rowType === "manual") {
          done = visibleRow.row.done;
          completedAt = visibleRow.row.completedAt;
        } else if (visibleRow.rowType === "pinnedSource") {
          completedAt =
            pinnedSourceCompletions[
              `${visibleRow.row.sourceType}:${visibleRow.row.id}`
            ] ?? null;
          done = Boolean(completedAt);
        } else {
          const override = taskOverrides[visibleRow.task.id];
          const hasCompletionOverride = Boolean(
            override && "completedAt" in override
          );
          done = hasCompletionOverride
            ? Boolean(override?.completedAt)
            : visibleRow.task.stage?.toString().toUpperCase() === "PERFECT";
          completedAt = hasCompletionOverride
            ? override?.completedAt ?? null
            : readCompletedAtFromUnknown(visibleRow.task);
        }

        return (
          done &&
          isCompletedAtInCurrentLocalCreatorDay(
            completedAt,
            creatorDayBoundary.currentStart,
            creatorDayBoundary.nextRollover
          )
        );
      }),
    [
      creatorDayBoundary.currentStart,
      creatorDayBoundary.nextRollover,
      pinnedSourceCompletions,
      taskOverrides,
      visibleTodoRows,
    ]
  );
  const completedTodoCount = completedTodoRows.length;
  const completedRevealRowCount = areCompletedTodosVisible
    ? completedTodoCount
    : 0;
  const listContentHeight =
    LIST_COMPACT_HEADER_ALLOWANCE +
    (visibleListRowCount +
      (completedTodoCount > 0 ? 1 : 0) +
      completedRevealRowCount) *
      LIST_COMPACT_ROW_HEIGHT +
    (isDayLensActive ? MY_LIST_DAY_VIEW_BUCKETS.length : PRIORITY_ORDER.length) *
      LIST_COMPACT_GROUP_HEADER_HEIGHT +
    LIST_COMPACT_NOTES_ALLOWANCE +
    LIST_COMPACT_BOTTOM_ALLOWANCE;
  const listCompactHeight = Math.min(
    Math.max(myListSheetHeights.compact, listContentHeight),
    myListSheetHeights.expanded
  );
  const shouldExpandListOnOpen =
    listContentHeight >= myListSheetHeights.expanded ||
    listContentHeight >=
      myListSheetHeights.expanded * LIST_COMPACT_EXPAND_THRESHOLD_RATIO;
  const shouldExpandOnOpen = shouldExpandListOnOpen;
  const compactSheetHeight =
    activeView === "list" ? listCompactHeight : myListSheetHeights.compact;
  const rawCurrentSheetHeight = isExpanded
    ? myListSheetHeights.expanded
    : compactSheetHeight;
  const currentSheetHeight = clampMyListSheetHeight(
    rawCurrentSheetHeight,
    editableFocusInsideSheetRef.current
      ? MY_LIST_MIN_EDITABLE_SHEET_HEIGHT
      : MY_LIST_MIN_SAFE_SHEET_HEIGHT
  );
  const skillLookup = useMemo(
    () => new Map(skills.map((skill) => [skill.id, skill])),
    [skills]
  );
  const persistManualRows = useCallback(
    (rows: MyListManualRow[]) => {
      writeStoredMyListManualRows(rows, defaultPriority.id);
      if (userId) {
        void replaceManualMyListItems({
          userId,
          rows,
        }).catch((error) => {
          console.error("Failed to persist My List manual rows", error);
        });
      }
    },
    [defaultPriority.id, userId]
  );
  const updateManualRowsWithPersistence = useCallback(
    (updater: (currentRows: MyListManualRow[]) => MyListManualRow[]) => {
      setManualRows((currentRows) => {
        const nextRows = updater(currentRows);
        persistManualRows(nextRows);
        return nextRows;
      });
    },
    [persistManualRows]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const storedNote = window.localStorage.getItem(MY_LIST_NOTES_STORAGE_KEY);
      if (storedNote !== null) {
        setNote(storedNote);
      }
    } catch {
      // Ignore unavailable storage so the sheet remains usable.
    }
  }, []);

  useEffect(() => {
    const storedPreference = readStoredMyListViewModePreference(userId);
    if (!storedPreference) return;

    applyMyListViewModePreference(storedPreference);
  }, [applyMyListViewModePreference, userId]);

  useEffect(() => {
    let active = true;
    const localRows = readStoredMyListManualRows(defaultPriority.id);

    if (!userId) {
      setManualRows(localRows);
      return () => {
        active = false;
      };
    }

    void loadManualMyListItems({
      userId,
      localRows,
      fallbackPriorityId: defaultPriority.id,
    })
      .then((rows) => {
        if (!active) return;
        const sanitizedRows = sanitizeMyListManualRows(rows, defaultPriority.id);
        setManualRows(sanitizedRows);
        writeStoredMyListManualRows(sanitizedRows, defaultPriority.id);
      })
      .catch((error) => {
        console.error("Failed to load Supabase My List manual rows", error);
        if (!active) return;
        setManualRows(localRows);
      });

    return () => {
      active = false;
    };
  }, [defaultPriority.id, userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const now = new Date();
    const delay = Math.max(
      0,
      getNextLocalCreatorDayRollover(now).getTime() - now.getTime()
    );
    const timeout = setTimeout(() => {
      setCreatorDayBoundaryNow(new Date());
    }, delay);

    return () => {
      clearTimeout(timeout);
    };
  }, [creatorDayBoundaryNow]);

  const handleNoteChange = useCallback(
    (event: ReactChangeEvent<HTMLTextAreaElement>) => {
      const nextNote = event.target.value;
      setNote(nextNote);

      if (typeof window === "undefined") return;

      try {
        window.localStorage.setItem(MY_LIST_NOTES_STORAGE_KEY, nextNote);
      } catch {
        // Ignore unavailable storage so typing notes is never blocked.
      }
    },
    []
  );

  const resolveTaskPriorityId = useCallback(
    (task: TaskLite): PriorityBucketId => {
      const overridePriority = taskOverrides[task.id]?.priorityId;
      if (overridePriority) return overridePriority;
      if (task.priority?.trim()) return normalizePriority(task.priority);
      return defaultPriority.id;
    },
    [defaultPriority.id, taskOverrides]
  );

  const resolveTaskPriorityGroupId = useCallback(
    (task: TaskLite): PriorityBucketId => {
      const overridePriority = taskOverrides[task.id]?.priorityId;
      if (overridePriority) return overridePriority;
      if (task.priority?.trim()) return normalizePriority(task.priority);
      return "NO";
    },
    [taskOverrides]
  );

  const resolveTaskDayBucketId = useCallback(
    (task: TaskLite): MyListDayBucketId | null => {
      const override = taskOverrides[task.id];
      if (override && "dayBucketId" in override) {
        return override.dayBucketId ?? null;
      }

      return readMyListDayBucketFromUnknown(task);
    },
    [taskOverrides]
  );

  const resolveVisibleRowDayBucketId = useCallback(
    (visibleRow: MyListVisibleTodoRow): MyListDayBucketId | null =>
      visibleRow.rowType === "manual"
        ? visibleRow.row.dayBucketId
        : visibleRow.rowType === "pinnedSource"
          ? null
          : resolveTaskDayBucketId(visibleRow.task),
    [resolveTaskDayBucketId]
  );

  const resolveVisibleRowPriorityGroupId = useCallback(
    (visibleRow: MyListVisibleTodoRow): PriorityBucketId =>
      visibleRow.rowType === "manual"
        ? visibleRow.row.priorityId
        : visibleRow.rowType === "pinnedSource"
          ? normalizePriority(visibleRow.row.priority ?? defaultPriority.id)
          : resolveTaskPriorityGroupId(visibleRow.task),
    [defaultPriority.id, resolveTaskPriorityGroupId]
  );

  const resolveTaskSkillMetadata = useCallback(
    (task: TaskLite) => {
      const override = taskOverrides[task.id];
      const overrideSkillId = override?.skillId;
      const sourceSkillId =
        overrideSkillId !== undefined ? overrideSkillId : task.skill_id ?? null;
      const skill = sourceSkillId ? skillLookup.get(sourceSkillId) ?? null : null;
      const skillName =
        override?.skillName ??
        skill?.name?.trim() ??
        (sourceSkillId ? "Untitled skill" : null);
      const skillIcon =
        override?.skillIcon?.trim() ||
        task.skill_icon?.trim() ||
        skill?.icon?.trim() ||
        "✦";

      return {
        skillId: sourceSkillId,
        skillName,
        skillIcon,
        monumentId: skill?.monument_id ?? task.skill_monument_id ?? null,
      };
    },
    [skillLookup, taskOverrides]
  );

  const resolvePriorityScheduleMetadata = useCallback(
    (priorityId: PriorityBucketId) => {
      const option =
        QUICK_CREATE_PRIORITY_OPTIONS.find((item) => item.id === priorityId) ??
        defaultPriority;
      return {
        priorityId,
        priorityLabel: option.label,
        prioritySymbol:
          option.symbol || QUICK_CREATE_PRIORITY_PLACEHOLDER_SYMBOL,
      };
    },
    [defaultPriority]
  );

  const visibleTodoGroups = useMemo(() => {
    if (isDayLensActive) {
      return MY_LIST_DAY_VIEW_BUCKETS.map((bucketId) => ({
        id: bucketId,
        label: MY_LIST_DAY_LABELS[bucketId],
        rows: activeTodoRows.filter((visibleRow) => {
          const rowBucketId = resolveVisibleRowDayBucketId(visibleRow);
          return bucketId === "anytime"
            ? rowBucketId === null
            : rowBucketId === bucketId;
        }),
      }));
    }

    return PRIORITY_ORDER.map((priorityId) => ({
      id: priorityId,
      label: PRIORITY_LABELS[priorityId],
      rows: activeTodoRows.filter(
        (visibleRow) =>
          resolveVisibleRowPriorityGroupId(visibleRow) === priorityId
      ),
    })).filter((group) => group.rows.length > 0);
  }, [
    activeTodoRows,
    isDayLensActive,
    resolveVisibleRowDayBucketId,
    resolveVisibleRowPriorityGroupId,
  ]);
  const todoListSections = useMemo(
    () => [
      ...visibleTodoGroups.map((group) => ({
        sectionType: "group" as const,
        group,
      })),
      ...(completedTodoCount > 0
        ? [
            {
              sectionType: "completed" as const,
              group: {
                id: "completed",
                label: "",
                rows: completedTodoRows,
              },
            },
          ]
        : []),
    ],
    [completedTodoCount, completedTodoRows, visibleTodoGroups]
  );

  const canStartScheduleTimelineDrag =
    open && activeView === "list" && enableScheduleTimelineDrag;
  const canStartTodoRowLongPress =
    open &&
    activeView === "list" &&
    (enableScheduleTimelineDrag || isDayLensActive);

  const assignDayBucketToRow = useCallback(
    (
      rowId: string,
      rowType: "manual" | "task",
      dayBucketId: MyListDayViewBucketId
    ) => {
      const nextDayBucketId =
        dayBucketId === "anytime" ? null : dayBucketId;

      setPendingDeleteRowId((currentRowId) =>
        currentRowId === `${rowType}:${rowId}` ? null : currentRowId
      );

      if (rowType === "manual") {
        updateManualRowsWithPersistence((currentRows) =>
          currentRows.map((row) =>
            row.id === rowId ? { ...row, dayBucketId: nextDayBucketId } : row
          )
        );
      } else {
        setTaskOverrides((currentOverrides) => ({
          ...currentOverrides,
          [rowId]: {
            ...currentOverrides[rowId],
            dayBucketId: nextDayBucketId,
          },
        }));
      }

      setActiveDayPickerRowKey(null);
    },
    [updateManualRowsWithPersistence]
  );

  const clearScheduleDragPress = useCallback(() => {
    const press = scheduleDragPressRef.current;
    if (press) {
      clearTimeout(press.timer);
    }
    setIsScheduleDragActive(false);
    setDayDragDropBucketId(null);
    scheduleDragPressRef.current = null;
  }, []);

  const shouldIgnoreScheduleDragTarget = useCallback((target: EventTarget) => {
    return (
      target instanceof HTMLElement &&
      Boolean(target.closest(MY_LIST_SCHEDULE_DRAG_BLOCKED_TARGET_SELECTOR))
    );
  }, []);

  const shouldIgnoreManualUpgradeTarget = useCallback((target: EventTarget) => {
    return (
      target instanceof HTMLElement &&
      Boolean(target.closest(MY_LIST_MANUAL_UPGRADE_BLOCKED_TARGET_SELECTOR))
    );
  }, []);

  const suppressManualUpgradeSelection = useCallback(() => {
    if (typeof window === "undefined") return;
    window.getSelection()?.removeAllRanges();
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLInputElement &&
      sheetRootRef.current?.contains(activeElement)
    ) {
      const textLength = activeElement.value.length;
      activeElement.setSelectionRange(textLength, textLength);
    }
  }, []);

  const clearManualUpgradePress = useCallback(() => {
    const press = manualUpgradePressRef.current;
    if (press) {
      clearTimeout(press.timer);
    }
    manualUpgradePressRef.current = null;
  }, []);

  const openManualUpgradeCreateSheet = useCallback(
    (press: MyListManualUpgradePress) => {
      if (manualUpgradePressRef.current !== press) return;
      const title = press.title.trim();
      if (!title || typeof window === "undefined") {
        clearManualUpgradePress();
        return;
      }

      press.triggered = true;
      suppressManualUpgradeSelection();
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        sheetRootRef.current?.contains(activeElement) &&
        activeElement.matches(MY_LIST_EDITABLE_TARGET_SELECTOR)
      ) {
        activeElement.blur();
      }

      setActiveSkillPickerRowKey(null);
      setActivePriorityPickerRowKey(null);
      setActiveDayPickerRowKey(null);
      setPendingDeleteRowId(null);
      onOpenChange(false);

      window.dispatchEvent(
        new CustomEvent(MY_LIST_OPEN_QUICK_CREATE_TASK_DETAILS_EVENT, {
          detail: {
            title,
            skillId: press.skillId,
            priority: press.priorityId,
            energy: "MEDIUM",
            origin: "my-list-upgrade",
          },
        })
      );
      clearManualUpgradePress();
    },
    [clearManualUpgradePress, onOpenChange, suppressManualUpgradeSelection]
  );

  const startManualUpgradePointerPress = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      row: MyListManualRow
    ) => {
      if (!open || activeView !== "list") return;
      if (event.button !== 0) return;
      if (shouldIgnoreManualUpgradeTarget(event.target)) return;
      const title = row.text.trim();
      if (!title) return;

      suppressManualUpgradeSelection();
      clearManualUpgradePress();
      const press: MyListManualUpgradePress = {
        inputType: "pointer",
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        title,
        skillId: row.skillId,
        priorityId: row.priorityId,
        timer: setTimeout(() => {
          openManualUpgradeCreateSheet(press);
        }, MY_LIST_MANUAL_UPGRADE_LONG_PRESS_MS),
        triggered: false,
      };
      manualUpgradePressRef.current = press;
    },
    [
      activeView,
      clearManualUpgradePress,
      open,
      openManualUpgradeCreateSheet,
      shouldIgnoreManualUpgradeTarget,
      suppressManualUpgradeSelection,
    ]
  );

  const handleManualUpgradePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const press = manualUpgradePressRef.current;
      if (
        !press ||
        press.inputType !== "pointer" ||
        press.pointerId !== event.pointerId
      ) {
        return;
      }
      if (press.triggered) {
        event.preventDefault();
        return;
      }

      const moved = Math.hypot(
        event.clientX - press.startX,
        event.clientY - press.startY
      );
      if (moved > MY_LIST_MANUAL_UPGRADE_MOVE_CANCEL_PX) {
        clearManualUpgradePress();
      }
    },
    [clearManualUpgradePress]
  );

  const handleManualUpgradePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const press = manualUpgradePressRef.current;
      if (
        !press ||
        press.inputType !== "pointer" ||
        press.pointerId !== event.pointerId
      ) {
        return;
      }
      clearManualUpgradePress();
    },
    [clearManualUpgradePress]
  );

  const startManualUpgradeTouchPress = useCallback(
    (event: ReactTouchEvent<HTMLElement>, row: MyListManualRow) => {
      if (!open || activeView !== "list") return;
      if (
        typeof window !== "undefined" &&
        "PointerEvent" in window
      ) {
        return;
      }
      if (shouldIgnoreManualUpgradeTarget(event.target)) return;
      const title = row.text.trim();
      if (!title) return;
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (!touch) return;

      suppressManualUpgradeSelection();
      clearManualUpgradePress();
      const press: MyListManualUpgradePress = {
        inputType: "touch",
        pointerId: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        title,
        skillId: row.skillId,
        priorityId: row.priorityId,
        timer: setTimeout(() => {
          openManualUpgradeCreateSheet(press);
        }, MY_LIST_MANUAL_UPGRADE_LONG_PRESS_MS),
        triggered: false,
      };
      manualUpgradePressRef.current = press;
    },
    [
      activeView,
      clearManualUpgradePress,
      open,
      openManualUpgradeCreateSheet,
      shouldIgnoreManualUpgradeTarget,
      suppressManualUpgradeSelection,
    ]
  );

  const resolveDayDropBucketAtPoint = useCallback(
    (clientX: number, clientY: number): MyListDayViewBucketId | null => {
      if (!isDayLensActive || typeof document === "undefined") return null;

      for (const bucketId of MY_LIST_DAY_VIEW_BUCKETS) {
        const element = document.querySelector<HTMLElement>(
          `[data-my-list-day-drop-zone="${bucketId}"]`
        );
        if (!element) continue;

        const rect = element.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          return bucketId;
        }
      }

      return null;
    },
    [isDayLensActive]
  );

  const shouldEscalateDayDragToSchedule = useCallback(
    (clientX: number, clientY: number) => {
      if (!canStartScheduleTimelineDrag) return false;

      const sheetRect = sheetRootRef.current?.getBoundingClientRect();
      const listRect = sheetScrollRef.current?.getBoundingClientRect();
      const exitPadding = MY_LIST_DAY_DRAG_SCHEDULE_EXIT_PX;

      if (!sheetRect || !listRect) return false;

      if (!isExpanded) {
        return clientY < listRect.top - exitPadding;
      }

      return (
        clientX < sheetRect.left - exitPadding ||
        clientX > sheetRect.right + exitPadding ||
        clientY < sheetRect.top - exitPadding ||
        clientY > sheetRect.bottom + exitPadding
      );
    },
    [canStartScheduleTimelineDrag, isExpanded]
  );

  const dispatchScheduleTimelineDrag = useCallback(
    (press: MyListScheduleDragPress) => {
      if (typeof window === "undefined") return;

      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        sheetRootRef.current?.contains(activeElement) &&
        activeElement.matches(MY_LIST_EDITABLE_TARGET_SELECTOR)
      ) {
        activeElement.blur();
      }

      setActiveSkillPickerRowKey(null);
      setActivePriorityPickerRowKey(null);
      setActiveDayPickerRowKey(null);
      setPendingDeleteRowId(null);

      onOpenChange(false);

      if (press.restoreExpanded) {
        setIsExpanded(false);
      }

      window.dispatchEvent(
        new CustomEvent("schedule:manual-placement-requested", {
          detail: {
            result: {
              id: press.row.sourceId ?? undefined,
              name: press.row.title,
              type: press.row.sourceType,
              durationMinutes: MY_LIST_SCHEDULE_EVENT_DURATION_MIN,
              energy: press.row.energy ?? undefined,
              skillId: press.row.skillId,
              priority: press.row.metadata.priorityId,
              metadata: press.row.metadata,
            },
            source: "my-list",
            requireTimelineHit: true,
            pointer: {
              clientX: press.lastX,
              clientY: press.lastY,
              pointerId: press.pointerId,
              pointerType: press.pointerType,
              width: press.rowWidth,
            },
          },
        })
      );
    },
    [onOpenChange]
  );

  const beginScheduleDragLongPress = useCallback(
    (press: MyListScheduleDragPress) => {
      if (scheduleDragPressRef.current !== press) return;
      if (!canStartTodoRowLongPress) {
        clearScheduleDragPress();
        return;
      }
      if (isDayLensActive) {
        press.dayDragStarted = true;
        press.dayDropBucketId = resolveDayDropBucketAtPoint(
          press.lastX,
          press.lastY
        );
        setDayDragDropBucketId(press.dayDropBucketId);
        return;
      }
      press.dragStarted = true;
      setIsScheduleDragActive(true);
      dispatchScheduleTimelineDrag(press);
    },
    [
      canStartTodoRowLongPress,
      clearScheduleDragPress,
      dispatchScheduleTimelineDrag,
      isDayLensActive,
      resolveDayDropBucketAtPoint,
    ]
  );

  const startScheduleDragPress = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      row: MyListScheduleDragRow
    ) => {
      if (!canStartTodoRowLongPress) return;
      if (event.button !== 0) return;
      if (shouldIgnoreScheduleDragTarget(event.target)) return;
      if (!row.title.trim()) return;

      clearScheduleDragPress();

      const rowRect = event.currentTarget.getBoundingClientRect();
      const press: MyListScheduleDragPress = {
        inputType: "pointer",
        pointerId: event.pointerId,
        pointerType: event.pointerType ?? null,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        row,
        rowWidth: rowRect.width,
        timer: setTimeout(() => {
          beginScheduleDragLongPress(press);
        }, MY_LIST_SCHEDULE_DRAG_LONG_PRESS_MS),
        dragStarted: false,
        dayDragStarted: false,
        dayDropBucketId: null,
        restoreExpanded: isExpanded,
      };

      scheduleDragPressRef.current = press;
    },
    [
      beginScheduleDragLongPress,
      canStartTodoRowLongPress,
      clearScheduleDragPress,
      isExpanded,
      shouldIgnoreScheduleDragTarget,
    ]
  );

  const handleScheduleDragPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const press = scheduleDragPressRef.current;
      if (
        !press ||
        press.inputType !== "pointer" ||
        press.pointerId !== event.pointerId
      ) {
        return;
      }
      press.lastX = event.clientX;
      press.lastY = event.clientY;
      if (press.dayDragStarted) {
        event.preventDefault();

        if (shouldEscalateDayDragToSchedule(event.clientX, event.clientY)) {
          press.dayDragStarted = false;
          press.dayDropBucketId = null;
          setDayDragDropBucketId(null);
          press.dragStarted = true;
          setIsScheduleDragActive(true);
          dispatchScheduleTimelineDrag(press);
          return;
        }

        press.dayDropBucketId = resolveDayDropBucketAtPoint(
          event.clientX,
          event.clientY
        );
        setDayDragDropBucketId(press.dayDropBucketId);
        return;
      }
      if (press.dragStarted) {
        event.preventDefault();
        return;
      }

      const moved = Math.hypot(
        event.clientX - press.startX,
        event.clientY - press.startY
      );
      if (moved > MY_LIST_SCHEDULE_DRAG_MOVE_CANCEL_PX) {
        clearScheduleDragPress();
      }
    },
    [
      clearScheduleDragPress,
      dispatchScheduleTimelineDrag,
      resolveDayDropBucketAtPoint,
      shouldEscalateDayDragToSchedule,
    ]
  );

  const handleScheduleDragPointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const press = scheduleDragPressRef.current;
      if (
        !press ||
        press.inputType !== "pointer" ||
        press.pointerId !== event.pointerId
      ) {
        return;
      }
      if (press.dayDragStarted) {
        if (press.dayDropBucketId) {
          assignDayBucketToRow(
            press.row.rowId,
            press.row.rowType,
            press.dayDropBucketId
          );
        }
      }
      clearScheduleDragPress();
    },
    [assignDayBucketToRow, clearScheduleDragPress]
  );

  const startScheduleDragTouchPress = useCallback(
    (
      event: ReactTouchEvent<HTMLElement>,
      row: MyListScheduleDragRow
    ) => {
      if (!canStartTodoRowLongPress) return;
      if (shouldIgnoreScheduleDragTarget(event.target)) return;
      if (!row.title.trim()) return;
      if (event.touches.length !== 1) return;

      const touch = event.touches[0];
      if (!touch) return;
      clearScheduleDragPress();

      const rowRect = event.currentTarget.getBoundingClientRect();
      const press: MyListScheduleDragPress = {
        inputType: "touch",
        pointerId: touch.identifier,
        pointerType: "touch",
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
        row,
        rowWidth: rowRect.width,
        timer: setTimeout(() => {
          beginScheduleDragLongPress(press);
        }, MY_LIST_SCHEDULE_DRAG_LONG_PRESS_MS),
        dragStarted: false,
        dayDragStarted: false,
        dayDropBucketId: null,
        restoreExpanded: isExpanded,
      };

      scheduleDragPressRef.current = press;
    },
    [
      beginScheduleDragLongPress,
      canStartTodoRowLongPress,
      clearScheduleDragPress,
      isExpanded,
      shouldIgnoreScheduleDragTarget,
    ]
  );

  const getTrackedScheduleDragTouch = useCallback(
    (event: ReactTouchEvent<HTMLElement>, pointerId: number) => {
      const touches = Array.from(event.touches);
      const changedTouches = Array.from(event.changedTouches);
      return (
        touches.find((touch) => touch.identifier === pointerId) ??
        changedTouches.find((touch) => touch.identifier === pointerId) ??
        null
      );
    },
    []
  );

  const handleManualUpgradeTouchMove = useCallback(
    (event: ReactTouchEvent<HTMLElement>) => {
      const press = manualUpgradePressRef.current;
      if (!press || press.inputType !== "touch") return;
      const touch = getTrackedScheduleDragTouch(event, press.pointerId);
      if (!touch) return;
      if (press.triggered) {
        event.preventDefault();
        return;
      }

      const moved = Math.hypot(
        touch.clientX - press.startX,
        touch.clientY - press.startY
      );
      if (moved > MY_LIST_MANUAL_UPGRADE_MOVE_CANCEL_PX) {
        clearManualUpgradePress();
      }
    },
    [clearManualUpgradePress, getTrackedScheduleDragTouch]
  );

  const handleManualUpgradeTouchEnd = useCallback(
    (event: ReactTouchEvent<HTMLElement>) => {
      const press = manualUpgradePressRef.current;
      if (!press || press.inputType !== "touch") return;
      if (!getTrackedScheduleDragTouch(event, press.pointerId)) return;
      clearManualUpgradePress();
    },
    [clearManualUpgradePress, getTrackedScheduleDragTouch]
  );

  const handleScheduleDragTouchMove = useCallback(
    (event: ReactTouchEvent<HTMLElement>) => {
      const press = scheduleDragPressRef.current;
      if (!press || press.inputType !== "touch") return;
      const touch = getTrackedScheduleDragTouch(event, press.pointerId);
      if (!touch) return;

      press.lastX = touch.clientX;
      press.lastY = touch.clientY;
      if (press.dayDragStarted) {
        event.preventDefault();
        event.stopPropagation();

        if (shouldEscalateDayDragToSchedule(touch.clientX, touch.clientY)) {
          press.dayDragStarted = false;
          press.dayDropBucketId = null;
          setDayDragDropBucketId(null);
          press.dragStarted = true;
          setIsScheduleDragActive(true);
          dispatchScheduleTimelineDrag(press);
          return;
        }

        press.dayDropBucketId = resolveDayDropBucketAtPoint(
          touch.clientX,
          touch.clientY
        );
        setDayDragDropBucketId(press.dayDropBucketId);
        return;
      }
      if (press.dragStarted) {
        return;
      }

      const moved = Math.hypot(
        touch.clientX - press.startX,
        touch.clientY - press.startY
      );
      if (moved > MY_LIST_SCHEDULE_DRAG_MOVE_CANCEL_PX) {
        clearScheduleDragPress();
      }
    },
    [
      clearScheduleDragPress,
      dispatchScheduleTimelineDrag,
      getTrackedScheduleDragTouch,
      resolveDayDropBucketAtPoint,
      shouldEscalateDayDragToSchedule,
    ]
  );

  const handleScheduleDragTouchEnd = useCallback(
    (event: ReactTouchEvent<HTMLElement>) => {
      const press = scheduleDragPressRef.current;
      if (!press || press.inputType !== "touch") return;
      if (!getTrackedScheduleDragTouch(event, press.pointerId)) return;
      if (press.dayDragStarted && press.dayDropBucketId) {
        assignDayBucketToRow(
          press.row.rowId,
          press.row.rowType,
          press.dayDropBucketId
        );
      }
      clearScheduleDragPress();
    },
    [assignDayBucketToRow, clearScheduleDragPress, getTrackedScheduleDragTouch]
  );

  const createManualRowId = useCallback(() => {
    manualRowIdCounterRef.current += 1;
    return `manual-${Date.now()}-${manualRowIdCounterRef.current}`;
  }, []);

  const insertManualRowAfterAnchor = useCallback(
    (
      currentRows: MyListManualRow[],
      anchorKey: MyListRowKey,
      newRow: MyListManualRow
    ) => {
      const anchorManualId = anchorKey.startsWith("manual:")
        ? anchorKey.slice("manual:".length)
        : null;

      if (anchorManualId) {
        const anchorIndex = currentRows.findIndex(
          (row) => row.id === anchorManualId
        );

        if (anchorIndex >= 0) {
          const nextRows = [...currentRows];
          nextRows.splice(anchorIndex + 1, 0, newRow);
          return nextRows;
        }
      }

      const firstSameAnchorIndex = currentRows.findIndex(
        (row) => row.insertAfterRowKey === anchorKey
      );

      if (firstSameAnchorIndex >= 0) {
        const nextRows = [...currentRows];
        nextRows.splice(firstSameAnchorIndex, 0, newRow);
        return nextRows;
      }

      return [...currentRows, newRow];
    },
    []
  );

  const addManualRow = useCallback(() => {
    setPendingDeleteRowId(null);
    setActivePriorityPickerRowKey(null);
    setActiveDayPickerRowKey(null);
    updateManualRowsWithPersistence((currentRows) => [
      ...currentRows,
      createManualRow(createManualRowId(), defaultPriority.id),
    ]);
  }, [createManualRowId, defaultPriority.id, updateManualRowsWithPersistence]);

  const resolveManualReorderDestination = useCallback(
    (
      event: DragOverEvent | DragEndEvent,
      rows: MyListManualRow[]
    ): MyListManualReorderDestination | null => {
      const over = event.over;
      if (!over) return null;

      const overData = readManualReorderOverData(over.data.current);
      if (!overData) return null;

      const targetRowId =
        overData.type === "manual-row" && typeof over.id === "string"
          ? over.id.trim()
          : null;
      if (
        targetRowId &&
        (targetRowId === EMPTY_DRAFT_MANUAL_ROW_ID ||
          !rows.some((row) => row.id === targetRowId))
      ) {
        return null;
      }

      return {
        targetRowId,
        group: overData.group,
      };
    },
    []
  );

  const persistManualRowForReorder = useCallback(
    (
      draggedRowId: string,
      destination: MyListManualReorderDestination | null
    ) => {
      setManualRows((currentRows) => {
        const nextRows = destination
          ? reorderManualRowsForDestination(currentRows, draggedRowId, destination)
          : currentRows;
        persistManualRows(nextRows);
        return nextRows;
      });
    },
    [persistManualRows]
  );

  const restoreManualReorderOrigin = useCallback(() => {
    const originRows = manualReorderOriginRowsRef.current;
    if (originRows) {
      setManualRows(originRows);
    }
    manualReorderOriginRowsRef.current = null;
    setActiveManualReorderRowId(null);
  }, []);

  const resetManualReorderAfterError = useCallback(
    (error: unknown) => {
      console.warn("My List manual reorder cancelled", error);
      restoreManualReorderOrigin();
    },
    [restoreManualReorderOrigin]
  );

  const handleManualReorderDragStart = useCallback(
    (event: DragStartEvent) => {
      try {
        const rowId = readManualReorderActiveRowId(event.active, manualRows);
        if (!open || activeView !== "list" || !rowId) {
          return;
        }

        clearManualUpgradePress();
        setPendingDeleteRowId(null);
        setActiveSkillPickerRowKey(null);
        setActivePriorityPickerRowKey(null);
        setActiveDayPickerRowKey(null);
        setManualSkillSearch("");
        manualReorderOriginRowsRef.current = manualRows;
        setActiveManualReorderRowId(rowId);
      } catch (error) {
        resetManualReorderAfterError(error);
      }
    },
    [
      activeView,
      clearManualUpgradePress,
      manualRows,
      open,
      resetManualReorderAfterError,
    ]
  );

  const handleManualReorderDragOver = useCallback(
    (event: DragOverEvent) => {
      try {
        setManualRows((currentRows) => {
          const rowId = readManualReorderActiveRowId(event.active, currentRows);
          const destination = resolveManualReorderDestination(event, currentRows);
          if (!rowId || !destination) return currentRows;
          return reorderManualRowsForDestination(currentRows, rowId, destination);
        });
      } catch (error) {
        resetManualReorderAfterError(error);
      }
    },
    [resetManualReorderAfterError, resolveManualReorderDestination]
  );

  const handleManualReorderDragEnd = useCallback((event: DragEndEvent) => {
    try {
      const rowId = readManualReorderActiveRowId(event.active, manualRows);
      const destination = resolveManualReorderDestination(event, manualRows);
      if (!rowId || !destination) {
        restoreManualReorderOrigin();
        return;
      }

      persistManualRowForReorder(rowId, destination);
      manualReorderOriginRowsRef.current = null;
      setActiveManualReorderRowId(null);
    } catch (error) {
      resetManualReorderAfterError(error);
    }
  }, [
    manualRows,
    persistManualRowForReorder,
    resetManualReorderAfterError,
    resolveManualReorderDestination,
    restoreManualReorderOrigin,
  ]);

  const handleManualReorderDragCancel = useCallback(() => {
    restoreManualReorderOrigin();
  }, [restoreManualReorderOrigin]);

  const updateManualRow = useCallback(
    (rowId: string, updates: Partial<Omit<MyListManualRow, "id">>) => {
      const realDraftRowId =
        rowId === EMPTY_DRAFT_MANUAL_ROW_ID ? createManualRowId() : null;

      if (realDraftRowId) {
        setPendingTitleFocusRowId(realDraftRowId);
      }

      setPendingDeleteRowId((currentRowId) =>
        currentRowId === `manual:${rowId}` ? null : currentRowId
      );
      updateManualRowsWithPersistence((currentRows) => {
        if (rowId === EMPTY_DRAFT_MANUAL_ROW_ID) {
          return [
            ...currentRows,
            {
              ...createManualRow(realDraftRowId ?? rowId, defaultPriority.id),
              ...updates,
            },
          ];
        }

        return currentRows.map((row) =>
          row.id === rowId ? { ...row, ...updates } : row
        );
      });
    },
    [createManualRowId, defaultPriority.id, updateManualRowsWithPersistence]
  );

  const handleTodoTitleKeyDown = useCallback(
    (
      event: ReactKeyboardEvent<HTMLInputElement>,
      rowType: "manual" | "task",
      rowId: string
    ) => {
      event.stopPropagation();

      const nativeEvent = event.nativeEvent;
      if (nativeEvent.isComposing) return;
      if (event.key !== "Enter" && event.key !== "Return") return;

      event.preventDefault();
      if (activeView !== "list") return;

      setPendingDeleteRowId(null);
      setActiveSkillPickerRowKey(null);
      setActivePriorityPickerRowKey(null);
      setActiveDayPickerRowKey(null);
      setManualSkillSearch("");

      if (rowType === "manual" && rowId === EMPTY_DRAFT_MANUAL_ROW_ID) {
        const realDraftRowId = createManualRowId();
        const blankRowId = createManualRowId();
        const draftText = event.currentTarget.value;
        const blankRow = {
          ...createManualRow(blankRowId, defaultPriority.id),
          insertAfterRowKey: `manual:${realDraftRowId}` as const,
        };

        setPendingTitleFocusRowId(blankRowId);
        updateManualRowsWithPersistence((currentRows) => {
          const draftRow =
            currentRows.find((row) => row.id === EMPTY_DRAFT_MANUAL_ROW_ID) ??
            createManualRow(realDraftRowId, defaultPriority.id);
          const realDraftRow = {
            ...draftRow,
            id: realDraftRowId,
            text: draftText,
            insertAfterRowKey: draftRow.insertAfterRowKey ?? null,
          };

          const draftIndex = currentRows.findIndex(
            (row) => row.id === EMPTY_DRAFT_MANUAL_ROW_ID
          );

          if (draftIndex < 0) {
            return [...currentRows, realDraftRow, blankRow];
          }

          const nextRows = [...currentRows];
          nextRows.splice(draftIndex, 1, realDraftRow, blankRow);
          return nextRows;
        });
        return;
      }

      const anchorKey = `${rowType}:${rowId}` as MyListRowKey;
      const blankRow = {
        ...createManualRow(createManualRowId(), defaultPriority.id),
        insertAfterRowKey: anchorKey,
      };

      setPendingTitleFocusRowId(blankRow.id);
      updateManualRowsWithPersistence((currentRows) =>
        insertManualRowAfterAnchor(currentRows, anchorKey, blankRow)
      );
    },
    [
      activeView,
      createManualRowId,
      defaultPriority.id,
      insertManualRowAfterAnchor,
      updateManualRowsWithPersistence,
    ]
  );

  const manualSkillGroups = useMemo<QuickCreateSkillGroup[]>(() => {
    const term = manualSkillSearch.trim().toLowerCase();
    const categoryLookup = new Map(
      skillCategories.map((category) => [category.id, category])
    );
    const originalIndex = new Map(
      skills.map((skill, index) => [skill.id, index])
    );
    const groups = new Map<string, QuickCreateSkillGroup>();

    const filteredSkills = skills.filter((skill) => {
      if (!term) return true;
      return (
        (skill.name ?? "").toLowerCase().includes(term) ||
        (skill.icon ?? "").toLowerCase().includes(term)
      );
    });

    filteredSkills.forEach((skill) => {
      const groupId =
        skill.cat_id?.trim() || QUICK_CREATE_UNCATEGORIZED_SKILL_GROUP_ID;
      const category = categoryLookup.get(groupId);
      const label =
        groupId === QUICK_CREATE_UNCATEGORIZED_SKILL_GROUP_ID
          ? QUICK_CREATE_UNCATEGORIZED_SKILL_GROUP_LABEL
          : category?.name?.trim() || `Category ${groupId.slice(0, 8)}`;
      const existing = groups.get(groupId);

      if (existing) {
        existing.skills.push(skill);
      } else {
        groups.set(groupId, {
          id: groupId,
          label,
          categoryOrder: category?.sort_order ?? null,
          skills: [skill],
        });
      }
    });

    const orderedGroups = Array.from(groups.values()).sort((left, right) => {
      const leftUncategorized =
        left.id === QUICK_CREATE_UNCATEGORIZED_SKILL_GROUP_ID;
      const rightUncategorized =
        right.id === QUICK_CREATE_UNCATEGORIZED_SKILL_GROUP_ID;

      if (leftUncategorized !== rightUncategorized) {
        return leftUncategorized ? 1 : -1;
      }

      const orderComparison = compareQuickCreateOrderThenName(
        left.categoryOrder,
        left.label,
        right.categoryOrder,
        right.label
      );

      return orderComparison !== 0
        ? orderComparison
        : left.id.localeCompare(right.id);
    });

    return orderedGroups.map((group) => ({
      ...group,
      skills: [...group.skills].sort((left, right) => {
        const orderComparison = compareQuickCreateOrderThenName(
          left.sort_order,
          left.name,
          right.sort_order,
          right.name
        );

        return orderComparison !== 0
          ? orderComparison
          : (originalIndex.get(left.id) ?? 0) -
              (originalIndex.get(right.id) ?? 0);
      }),
    }));
  }, [manualSkillSearch, skillCategories, skills]);

  const handleManualSkillSelect = useCallback(
    (rowId: string, skill: SkillRow) => {
      updateManualRow(rowId, {
        skillId: skill.id,
        skillName: skill.name?.trim() || "Untitled skill",
        skillIcon: (skill.icon ?? "").trim() || "✦",
      });
      setActiveSkillPickerRowKey(null);
      setActiveDayPickerRowKey(null);
      setManualSkillSearch("");
    },
    [updateManualRow]
  );

  const handleTaskSkillSelect = useCallback(
    (taskId: string, skill: SkillRow) => {
      setPendingDeleteRowId((currentRowId) =>
        currentRowId === `task:${taskId}` ? null : currentRowId
      );
      setTaskOverrides((currentOverrides) => ({
        ...currentOverrides,
        [taskId]: {
          ...currentOverrides[taskId],
          skillId: skill.id,
          skillName: skill.name?.trim() || "Untitled skill",
          skillIcon: (skill.icon ?? "").trim() || "✦",
        },
      }));
      onTaskSkillSelect(taskId, skill);
      setActiveSkillPickerRowKey(null);
      setActiveDayPickerRowKey(null);
      setManualSkillSearch("");
    },
    [onTaskSkillSelect]
  );

  const handleManualCompletionToggle = useCallback(
    (rowId: string, checked: boolean) => {
      updateManualRow(rowId, {
        done: checked,
        completedAt: checked ? new Date().toISOString() : null,
      });
    },
    [updateManualRow]
  );

  const handlePrioritySelect = useCallback(
    (
      rowId: string,
      rowType: "manual" | "task",
      priorityId: PriorityBucketId
    ) => {
      setPendingDeleteRowId((currentRowId) =>
        currentRowId === `${rowType}:${rowId}` ? null : currentRowId
      );

      if (rowType === "manual") {
        updateManualRow(rowId, { priorityId });
      } else {
        setTaskOverrides((currentOverrides) => ({
          ...currentOverrides,
          [rowId]: {
            ...currentOverrides[rowId],
            priorityId,
          },
        }));
      }

      setActivePriorityPickerRowKey(null);
      setActiveDayPickerRowKey(null);
    },
    [updateManualRow]
  );

  const handleDaySelect = useCallback(
    (
      rowId: string,
      rowType: "manual" | "task",
      dayBucketId: MyListDayViewBucketId
    ) => {
      assignDayBucketToRow(rowId, rowType, dayBucketId);
    },
    [assignDayBucketToRow]
  );

  const handleDeleteRowAction = useCallback(
    (
      rowId: string,
      rowType: "manual" | "task" | "pinnedSource",
      pinnedSourceRow?: MyListPinnedSourceRow
    ) => {
      const deleteRowId =
        rowType === "pinnedSource" && pinnedSourceRow
          ? buildPinnedSourceRowKey(pinnedSourceRow.sourceType, rowId)
          : `${rowType}:${rowId}`;

      if (pendingDeleteRowId !== deleteRowId) {
        setPendingDeleteRowId(deleteRowId);
        return;
      }

      setPendingDeleteRowId(null);
      if (rowType === "pinnedSource" && pinnedSourceRow) {
        setPinnedSourceCompletions((currentCompletions) => {
          const completionKey = `${pinnedSourceRow.sourceType}:${rowId}`;
          if (!(completionKey in currentCompletions)) return currentCompletions;

          const nextCompletions = { ...currentCompletions };
          delete nextCompletions[completionKey];
          return nextCompletions;
        });
        onRemovePinnedSource?.(pinnedSourceRow);
        return;
      }

      if (rowType === "manual") {
        updateManualRowsWithPersistence((currentRows) =>
          currentRows.filter((row) => row.id !== rowId)
        );
        setActiveSkillPickerRowKey((currentRowKey) =>
          currentRowKey === `manual:${rowId}` ? null : currentRowKey
        );
        setActivePriorityPickerRowKey((currentRowKey) =>
          currentRowKey === `manual:${rowId}` ? null : currentRowKey
        );
        setActiveDayPickerRowKey((currentRowKey) =>
          currentRowKey === `manual:${rowId}` ? null : currentRowKey
        );
        return;
      }

      setActiveSkillPickerRowKey((currentRowKey) =>
        currentRowKey === `task:${rowId}` ? null : currentRowKey
      );
      setActivePriorityPickerRowKey((currentRowKey) =>
        currentRowKey === `task:${rowId}` ? null : currentRowKey
      );
      setActiveDayPickerRowKey((currentRowKey) =>
        currentRowKey === `task:${rowId}` ? null : currentRowKey
      );
      setHiddenTaskRowIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.add(rowId);
        return nextIds;
      });
    },
    [onRemovePinnedSource, pendingDeleteRowId, updateManualRowsWithPersistence]
  );

  const renderDeleteRowButton = useCallback(
    (
      rowId: string,
      rowType: "manual" | "task" | "pinnedSource",
      pinnedSourceRow?: MyListPinnedSourceRow
    ) => {
      const deleteRowId =
        rowType === "pinnedSource" && pinnedSourceRow
          ? buildPinnedSourceRowKey(pinnedSourceRow.sourceType, rowId)
          : `${rowType}:${rowId}`;
      const confirming = pendingDeleteRowId === deleteRowId;

      return (
        <button
          type="button"
          aria-label={
            confirming
              ? rowType === "pinnedSource"
                ? "Confirm unpin item"
                : "Confirm remove to-do"
              : rowType === "pinnedSource"
                ? "Unpin item"
                : "Remove to-do"
          }
          onClick={(event) => {
            event.stopPropagation();
            handleDeleteRowAction(rowId, rowType, pinnedSourceRow);
          }}
          tabIndex={open ? 0 : -1}
          className={clsx(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-transparent p-0 outline-none transition focus-visible:ring-2 focus-visible:ring-white/30",
            confirming
              ? "text-red-300/78 hover:text-red-200"
              : "text-white/24 hover:text-white/48"
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={confirming ? "check" : "x"}
              initial={
                prefersReducedMotion ? false : { opacity: 0, scale: 0.72 }
              }
              animate={{ opacity: 1, scale: 1 }}
              exit={
                prefersReducedMotion ? undefined : { opacity: 0, scale: 0.72 }
              }
              transition={{ duration: prefersReducedMotion ? 0 : 0.14 }}
              className="flex h-3.5 w-3.5 items-center justify-center"
            >
              {confirming ? (
                <Check className="h-3.5 w-3.5" strokeWidth={2.2} />
              ) : (
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              )}
            </motion.span>
          </AnimatePresence>
        </button>
      );
    },
    [
      handleDeleteRowAction,
      open,
      pendingDeleteRowId,
      prefersReducedMotion,
    ]
  );

  const renderSkillPicker = useCallback(
    (
      rowKey: MyListRowKey,
      selectedSkillId: string | null,
      onSelect: (skill: SkillRow) => void
    ) =>
      activeSkillPickerRowKey === rowKey ? (
        <div
          role="listbox"
          aria-label="Choose Skill"
          className="absolute left-0 top-[calc(100%+0.5rem)] z-30 w-64 max-w-[calc(100vw-3rem)] rounded-[1.1rem] border border-white/10 bg-zinc-950/94 p-2 text-white shadow-[0_18px_40px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl"
          onPointerDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <input
            value={manualSkillSearch}
            onPointerDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setManualSkillSearch(event.target.value)}
            placeholder="Search skills"
            className="h-8 w-full rounded-full border border-white/10 bg-black/35 px-3 text-xs text-white placeholder:text-white/35 outline-none focus:border-white/25"
            aria-label="Search skills"
            tabIndex={open ? 0 : -1}
          />
          <div className="mt-2 max-h-[min(16rem,calc(100vh-14rem))] touch-pan-y overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]">
            {manualSkillGroups.length === 0 ? (
              <div className="px-2 py-3 text-xs text-white/40">
                No skills found.
              </div>
            ) : (
              <div className="grid gap-2">
                {manualSkillGroups.map((group) => (
                  <div key={group.id} className="grid gap-1">
                    <div className="px-2.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/35">
                      {group.label}
                    </div>
                    {group.skills.map((skill) => {
                      const selected = selectedSkillId === skill.id;
                      const icon = (skill.icon ?? "").trim() || "✦";
                      const name = skill.name?.trim() || "Untitled skill";
                      return (
                        <button
                          key={skill.id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelect(skill);
                          }}
                          tabIndex={open ? 0 : -1}
                          className={clsx(
                            "flex h-9 w-full items-center gap-2 rounded-full px-2.5 text-left text-xs transition",
                            selected
                              ? "bg-white/[0.16] text-white"
                              : "text-white/75 hover:bg-white/10 hover:text-white"
                          )}
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/30 text-sm leading-none">
                            {icon}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null,
    [
      activeSkillPickerRowKey,
      manualSkillGroups,
      manualSkillSearch,
      open,
    ]
  );

  const renderPriorityPicker = useCallback(
    (
      rowKey: MyListRowKey,
      selectedPriorityId: PriorityBucketId,
      onSelect: (priorityId: PriorityBucketId) => void
    ) =>
      activePriorityPickerRowKey === rowKey ? (
        <div
          role="listbox"
          aria-label="Choose priority"
          className="absolute right-0 top-[calc(100%+0.45rem)] z-30 w-44 rounded-[1.05rem] border border-white/10 bg-zinc-950/94 p-1.5 text-white shadow-[0_18px_40px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl"
          onPointerDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="grid gap-1">
            {QUICK_CREATE_PRIORITY_OPTIONS.map((option) => {
              const selected = selectedPriorityId === option.id;
              const symbol =
                option.symbol || QUICK_CREATE_PRIORITY_PLACEHOLDER_SYMBOL;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(option.id);
                  }}
                  tabIndex={open ? 0 : -1}
                  className={clsx(
                    "flex h-8 w-full items-center gap-2 rounded-full border px-2 text-left text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35",
                    selected
                      ? "border-white/22 bg-white/[0.12] text-white"
                      : "border-transparent bg-transparent text-white/68 hover:bg-white/[0.08] hover:text-white"
                  )}
                >
                  <span className="flex h-5 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/30 text-[10px] font-black leading-none text-white/72">
                    {symbol}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null,
    [activePriorityPickerRowKey, open]
  );

  const renderDayPicker = useCallback(
    (
      rowKey: MyListRowKey,
      selectedDayBucketId: MyListDayBucketId | null,
      onSelect: (dayBucketId: MyListDayViewBucketId) => void
    ) =>
      activeDayPickerRowKey === rowKey ? (
        <div
          role="listbox"
          aria-label="Choose day"
          className="absolute right-0 top-[calc(100%+0.45rem)] z-30 w-36 rounded-[1.05rem] border border-white/10 bg-zinc-950/94 p-1.5 text-white shadow-[0_18px_40px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl"
          onPointerDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="grid gap-1">
            {MY_LIST_DAY_VIEW_BUCKETS.map((dayBucketId) => {
              const selected =
                dayBucketId === "anytime"
                  ? selectedDayBucketId === null
                  : selectedDayBucketId === dayBucketId;
              const dayVisual = MY_LIST_DAY_VISUALS[dayBucketId];
              const DayIcon = dayVisual.Icon;

              return (
                <button
                  key={dayBucketId}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(dayBucketId);
                  }}
                  tabIndex={open ? 0 : -1}
                  className={clsx(
                    "flex h-8 w-full items-center gap-2 rounded-full border px-2 text-left text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35",
                    dayVisual.pillClassName,
                    selected
                      ? "ring-1 ring-white/18"
                      : "opacity-75 hover:opacity-95"
                  )}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/18 text-current">
                    <DayIcon
                      className="h-3.5 w-3.5"
                      strokeWidth={1.9}
                      aria-hidden="true"
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {MY_LIST_DAY_LABELS[dayBucketId]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null,
    [activeDayPickerRowKey, open]
  );

  const expandSheet = useCallback(() => {
    if (open) setIsExpanded(true);
  }, [open]);

  const handleSheetTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (activeManualReorderRowId) {
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
        sheetTouchStartYRef.current = null;
        return;
      }

      event.stopPropagation();
      sheetTouchStartYRef.current = event.touches[0]?.clientY ?? null;
    },
    [activeManualReorderRowId]
  );

  const handleSheetTouchMove = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (activeManualReorderRowId) {
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (isScheduleDragActive) return;
      event.stopPropagation();
      if (!open || isExpanded) return;

      const startY = sheetTouchStartYRef.current;
      const currentY = event.touches[0]?.clientY;
      if (startY === null || currentY === undefined) return;

      const upwardDragDistance = startY - currentY;
      if (upwardDragDistance > 18) {
        expandSheet();
      }
    },
    [activeManualReorderRowId, expandSheet, isExpanded, isScheduleDragActive, open]
  );

  const handleSheetTouchEnd = useCallback(() => {
    sheetTouchStartYRef.current = null;
  }, []);

  const handleSheetWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (activeManualReorderRowId) return;
      if (!open || isExpanded) return;

      const scrollElement = sheetScrollRef.current;
      const nearTop = !scrollElement || scrollElement.scrollTop <= 8;
      if (event.deltaY > 8 && nearTop) {
        event.preventDefault();
        if (scrollElement) scrollElement.scrollTop = 0;
        expandSheet();
      }
    },
    [activeManualReorderRowId, expandSheet, isExpanded, open]
  );

  const scrollActiveEditableIntoSheetView = useCallback(() => {
    if (typeof document === "undefined") return;

    const activeElement = document.activeElement;
    const scrollElement = sheetScrollRef.current;
    if (!(activeElement instanceof HTMLElement) || !scrollElement) return;
    if (!sheetRootRef.current?.contains(activeElement)) return;
    if (!activeElement.matches(MY_LIST_EDITABLE_TARGET_SELECTOR)) return;

    const elementRect = activeElement.getBoundingClientRect();
    const scrollRect = scrollElement.getBoundingClientRect();
    const desiredScrollTop =
      scrollElement.scrollTop +
      elementRect.top -
      scrollRect.top -
      (scrollRect.height - elementRect.height) / 2;
    const maxScrollTop = scrollElement.scrollHeight - scrollElement.clientHeight;

    scrollElement.scrollTo({
      top: Math.min(Math.max(desiredScrollTop, 0), Math.max(maxScrollTop, 0)),
      behavior: "smooth",
    });
  }, []);

  const scheduleActiveEditableVisibility = useCallback(() => {
    if (typeof window === "undefined") return;

    if (focusVisibilityFrameRef.current !== null) {
      window.cancelAnimationFrame(focusVisibilityFrameRef.current);
    }
    if (focusVisibilityTimeoutRef.current !== null) {
      clearTimeout(focusVisibilityTimeoutRef.current);
    }

    focusVisibilityFrameRef.current = window.requestAnimationFrame(() => {
      focusVisibilityFrameRef.current = null;
      scrollActiveEditableIntoSheetView();
    });
    focusVisibilityTimeoutRef.current = setTimeout(() => {
      focusVisibilityTimeoutRef.current = null;
      scrollActiveEditableIntoSheetView();
    }, 180);
  }, [scrollActiveEditableIntoSheetView]);

  const clearKeyboardRecalculationTimeouts = useCallback(() => {
    keyboardRecalculationTimeoutsRef.current.forEach((timeout) => {
      clearTimeout(timeout);
    });
    keyboardRecalculationTimeoutsRef.current = [];
  }, []);

  const scheduleKeyboardSettledRecalculation = useCallback(() => {
    if (typeof window === "undefined") return;

    clearKeyboardRecalculationTimeouts();
    recalculateSheetHeightsRef.current?.();
    scheduleActiveEditableVisibility();

    MY_LIST_KEYBOARD_RECALC_DELAYS_MS.forEach((delay) => {
      const timeout = setTimeout(() => {
        keyboardRecalculationTimeoutsRef.current =
          keyboardRecalculationTimeoutsRef.current.filter(
            (currentTimeout) => currentTimeout !== timeout
          );
        recalculateSheetHeightsRef.current?.();
        scheduleActiveEditableVisibility();
      }, delay);

      keyboardRecalculationTimeoutsRef.current.push(timeout);
    });
  }, [clearKeyboardRecalculationTimeouts, scheduleActiveEditableVisibility]);

  useEffect(() => {
    if (!pendingTitleFocusRowId || !open || activeView !== "list") return;
    if (typeof window === "undefined") return;

    let focused = false;
    let focusFrame: number | null = null;
    let focusTimeout: ReturnType<typeof setTimeout> | null = null;

    const focusPendingTitleInput = () => {
      if (focused) return;

      const input = manualTitleInputRefs.current.get(pendingTitleFocusRowId);
      if (!input) return;

      focused = true;
      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }

      const caretPosition = input.value.length;
      input.setSelectionRange(caretPosition, caretPosition);
      scheduleActiveEditableVisibility();
      setPendingTitleFocusRowId(null);
    };

    focusFrame = window.requestAnimationFrame(focusPendingTitleInput);
    focusTimeout = setTimeout(focusPendingTitleInput, 80);

    return () => {
      focused = true;
      if (focusFrame !== null) {
        window.cancelAnimationFrame(focusFrame);
      }
      if (focusTimeout !== null) {
        clearTimeout(focusTimeout);
      }
    };
  }, [
    activeView,
    open,
    pendingTitleFocusRowId,
    scheduleActiveEditableVisibility,
  ]);

  const isEditableElementFocusedInsideSheet = useCallback(() => {
    if (typeof document === "undefined") return false;

    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) return false;
    if (!sheetRootRef.current?.contains(activeElement)) return false;

    return activeElement.matches(MY_LIST_EDITABLE_TARGET_SELECTOR);
  }, []);

  const updateKeyboardBottomInset = useCallback(() => {
    if (typeof window === "undefined") return;

    const rawInnerHeight = window.innerHeight;
    const innerHeight =
      typeof rawInnerHeight === "number" &&
      Number.isFinite(rawInnerHeight) &&
      rawInnerHeight > 0
        ? rawInnerHeight
        : 0;

    if (innerHeight > 0) {
      keyboardBaselineHeightRef.current = Math.max(
        keyboardBaselineHeightRef.current ?? innerHeight,
        innerHeight
      );
    }

    const shouldOffsetSheet =
      open && activeView === "list" && isEditableElementFocusedInsideSheet();

    if (!shouldOffsetSheet) {
      setKeyboardBottomInset((currentInset) =>
        currentInset === 0 ? currentInset : 0
      );
      return;
    }

    const visualViewport = window.visualViewport;
    if (!visualViewport) {
      setKeyboardBottomInset((currentInset) =>
        currentInset === 0 ? currentInset : 0
      );
      return;
    }

    const baselineHeight = keyboardBaselineHeightRef.current ?? innerHeight;
    const viewportHeight = visualViewport.height;
    const viewportOffsetTop = visualViewport.offsetTop;
    const rawInset =
      baselineHeight - (viewportHeight + viewportOffsetTop);
    const nextInset =
      Number.isFinite(rawInset) && rawInset > 0 ? Math.round(rawInset) : 0;

    setKeyboardBottomInset((currentInset) =>
      Math.abs(currentInset - nextInset) <= 1 ? currentInset : nextInset
    );
  }, [activeView, isEditableElementFocusedInsideSheet, open]);

  useEffect(() => {
    keyboardBottomOffset.set(keyboardBottomInset);
  }, [keyboardBottomInset, keyboardBottomOffset]);

  const handleSheetFocusCapture = useCallback(
    (event: ReactFocusEvent<HTMLElement>) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!sheetRootRef.current?.contains(target)) return;
      if (!target.matches(MY_LIST_EDITABLE_TARGET_SELECTOR)) return;

      editableFocusInsideSheetRef.current = true;
      updateKeyboardBottomInset();
      scheduleActiveEditableVisibility();

      if (!open || activeView !== "list") return;

      onOpenChange(true);
      if (!isExpanded) setIsExpanded(true);
      scheduleKeyboardSettledRecalculation();
    },
    [
      activeView,
      isExpanded,
      onOpenChange,
      open,
      scheduleActiveEditableVisibility,
      scheduleKeyboardSettledRecalculation,
      updateKeyboardBottomInset,
    ]
  );

  const handleSheetBlurCapture = useCallback(
    (event: ReactFocusEvent<HTMLElement>) => {
      const nextFocusedElement = event.relatedTarget;
      if (
        nextFocusedElement instanceof HTMLElement &&
        sheetRootRef.current?.contains(nextFocusedElement)
      ) {
        return;
      }

      if (typeof window === "undefined") {
        editableFocusInsideSheetRef.current = false;
        return;
      }

      setTimeout(() => {
        editableFocusInsideSheetRef.current =
          isEditableElementFocusedInsideSheet();
        updateKeyboardBottomInset();
      }, 120);
    },
    [isEditableElementFocusedInsideSheet, updateKeyboardBottomInset]
  );

  useEffect(() => {
    const measureSafeAreaTop = () => {
      if (typeof document === "undefined") return 0;

      const probe = document.createElement("div");
      probe.style.position = "fixed";
      probe.style.visibility = "hidden";
      probe.style.pointerEvents = "none";
      probe.style.height = "env(safe-area-inset-top, 0px)";
      probe.style.width = "0";
      document.body.appendChild(probe);
      const safeAreaTop = probe.getBoundingClientRect().height;
      probe.remove();

      return Number.isFinite(safeAreaTop) ? safeAreaTop : 0;
    };

    const calculateSheetHeights = () => {
      const fallbackViewportWidth =
        window.innerWidth > 0 ? window.innerWidth : 1;
      const fallbackViewportHeight =
        window.innerHeight > 0
          ? window.innerHeight
          : MY_LIST_MIN_SAFE_SHEET_HEIGHT;
      const rawViewportWidth = window.visualViewport?.width;
      const rawViewportHeight = window.visualViewport?.height;
      const viewportWidth =
        typeof rawViewportWidth === "number" &&
        Number.isFinite(rawViewportWidth) &&
        rawViewportWidth > 0
          ? rawViewportWidth
          : fallbackViewportWidth;
      const viewportHeight =
        typeof rawViewportHeight === "number" &&
        Number.isFinite(rawViewportHeight) &&
        rawViewportHeight > 0
          ? rawViewportHeight
          : fallbackViewportHeight;
      const lastMeasuredViewport = lastMeasuredViewportRef.current;
      const widthChanged =
        !lastMeasuredViewport ||
        Math.abs(lastMeasuredViewport.width - viewportWidth) >= 0.5;
      const heightChanged =
        !lastMeasuredViewport ||
        Math.abs(lastMeasuredViewport.height - viewportHeight) >= 0.5;
      const editableFocusedInsideSheet =
        editableFocusInsideSheetRef.current ||
        isEditableElementFocusedInsideSheet();
      const isKeyboardResizeInsideSheet =
        heightChanged && !widthChanged && editableFocusedInsideSheet;

      lastMeasuredViewportRef.current = {
        width: viewportWidth,
        height: viewportHeight,
      };

      const rootFontSize =
        parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const minimumSheetHeight = editableFocusedInsideSheet
        ? MY_LIST_MIN_EDITABLE_SHEET_HEIGHT
        : MY_LIST_MIN_SAFE_SHEET_HEIGHT;
      const compact = clampMyListSheetHeight(
        Math.min(viewportHeight * 0.58, 28 * rootFontSize),
        minimumSheetHeight
      );
      const scheduleTopReserve = Math.max(
        4.75 * rootFontSize,
        measureSafeAreaTop() + 3.75 * rootFontSize
      );
      const fullTopReserve = Math.max(
        2.5 * rootFontSize,
        measureSafeAreaTop() + 1.5 * rootFontSize
      );
      const topReserve = useFullExpandedHeight
        ? fullTopReserve
        : scheduleTopReserve;
      const expanded = clampMyListSheetHeight(
        Math.max(compact, viewportHeight - topReserve),
        minimumSheetHeight
      );

      setMyListSheetHeights((currentHeights) => {
        if (
          Math.abs(currentHeights.compact - compact) < 0.5 &&
          Math.abs(currentHeights.expanded - expanded) < 0.5
        ) {
          return currentHeights;
        }

        return { compact, expanded };
      });

      if (isKeyboardResizeInsideSheet) {
        scheduleActiveEditableVisibility();
      }

      updateKeyboardBottomInset();
    };

    recalculateSheetHeightsRef.current = calculateSheetHeights;
    calculateSheetHeights();
    window.addEventListener("resize", calculateSheetHeights);
    window.visualViewport?.addEventListener("resize", calculateSheetHeights);
    window.visualViewport?.addEventListener("scroll", calculateSheetHeights);

    return () => {
      if (recalculateSheetHeightsRef.current === calculateSheetHeights) {
        recalculateSheetHeightsRef.current = null;
      }
      window.removeEventListener("resize", calculateSheetHeights);
      window.visualViewport?.removeEventListener(
        "resize",
        calculateSheetHeights
      );
      window.visualViewport?.removeEventListener(
        "scroll",
        calculateSheetHeights
      );
    };
  }, [
    isEditableElementFocusedInsideSheet,
    scheduleActiveEditableVisibility,
    updateKeyboardBottomInset,
    useFullExpandedHeight,
  ]);

  useEffect(() => {
    return () => {
      clearScheduleDragPress();
      clearKeyboardRecalculationTimeouts();
      if (
        typeof window !== "undefined" &&
        focusVisibilityFrameRef.current !== null
      ) {
        window.cancelAnimationFrame(focusVisibilityFrameRef.current);
      }
      if (focusVisibilityTimeoutRef.current !== null) {
        clearTimeout(focusVisibilityTimeoutRef.current);
      }
    };
  }, [clearKeyboardRecalculationTimeouts, clearScheduleDragPress]);

  useEffect(() => {
    if (!open || !isExpanded || typeof document === "undefined") return;

    const scrollY = window.scrollY;
    const bodyStyle = document.body.style;
    const previousPosition = bodyStyle.position;
    const previousTop = bodyStyle.top;
    const previousLeft = bodyStyle.left;
    const previousRight = bodyStyle.right;
    const previousWidth = bodyStyle.width;
    const previousOverflow = bodyStyle.overflow;

    bodyStyle.position = "fixed";
    bodyStyle.top = `-${scrollY}px`;
    bodyStyle.left = "0";
    bodyStyle.right = "0";
    bodyStyle.width = "100%";
    bodyStyle.overflow = "hidden";

    return () => {
      bodyStyle.position = previousPosition;
      bodyStyle.top = previousTop;
      bodyStyle.left = previousLeft;
      bodyStyle.right = previousRight;
      bodyStyle.width = previousWidth;
      bodyStyle.overflow = previousOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [isExpanded, open]);

  useEffect(() => {
    if (!open) {
      editableFocusInsideSheetRef.current = false;
      setKeyboardBottomInset(0);
      clearKeyboardRecalculationTimeouts();
      setIsExpanded(false);
      setActiveSkillPickerRowKey(null);
      setActivePriorityPickerRowKey(null);
      setActiveDayPickerRowKey(null);
      setManualSkillSearch("");
      setPendingDeleteRowId(null);
      setPendingTitleFocusRowId(null);
    }
  }, [clearKeyboardRecalculationTimeouts, open]);

  useEffect(() => {
    if (completedTodoCount === 0) {
      setAreCompletedTodosVisible(false);
    }
  }, [completedTodoCount]);

  useEffect(() => {
    setTaskOverrides((currentOverrides) => {
      let changed = false;
      const nextOverrides = { ...currentOverrides };

      tasks.forEach((task) => {
        const override = nextOverrides[task.id];
        if (!override || !("completedAt" in override)) return;
        if (pendingTaskIds.has(task.id)) return;

        const taskDone =
          task.stage?.toString().toUpperCase() === "PERFECT";
        if (taskDone && override.completedAt) return;

        const nextOverride = { ...override };
        delete nextOverride.completedAt;
        nextOverrides[task.id] = nextOverride;
        changed = true;
      });

      return changed ? nextOverrides : currentOverrides;
    });
  }, [pendingTaskIds, tasks]);

  useEffect(() => {
    if (!canStartTodoRowLongPress) {
      clearScheduleDragPress();
    }
  }, [canStartTodoRowLongPress, clearScheduleDragPress]);

  useEffect(() => {
    if (!open || activeView !== "list") {
      clearManualUpgradePress();
    }
  }, [activeView, clearManualUpgradePress, open]);

  useEffect(() => {
    if (!isScheduleDragActive || typeof window === "undefined") return;
    const clearActiveDrag = () => {
      clearScheduleDragPress();
    };
    window.addEventListener("pointerup", clearActiveDrag);
    window.addEventListener("pointercancel", clearActiveDrag);
    window.addEventListener("touchend", clearActiveDrag);
    window.addEventListener("touchcancel", clearActiveDrag);
    return () => {
      window.removeEventListener("pointerup", clearActiveDrag);
      window.removeEventListener("pointercancel", clearActiveDrag);
      window.removeEventListener("touchend", clearActiveDrag);
      window.removeEventListener("touchcancel", clearActiveDrag);
    };
  }, [clearScheduleDragPress, isScheduleDragActive]);

  useEffect(() => {
    if (open && activeView === "list" && shouldExpandListOnOpen) {
      setIsExpanded(true);
    }
  }, [activeView, open, shouldExpandListOnOpen]);

  return (
    <motion.aside
      ref={sheetRootRef}
      aria-label="My List"
      data-no-tab-swipe
      data-my-list-sheet
      className={clsx(
        "fixed inset-x-0 bottom-0 z-[150] w-full sm:mx-auto sm:max-w-[34rem] sm:px-4",
        open ? "pointer-events-auto" : "pointer-events-none",
        isScheduleDragActive && "pointer-events-none"
      )}
      initial={false}
      animate={{ y: open ? 0 : "calc(100% - 2px)" }}
      style={{
        bottom: prefersReducedMotion
          ? keyboardBottomOffset
          : smoothedKeyboardBottomOffset,
      }}
      transition={
        prefersReducedMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 245, damping: 30, mass: 0.9 }
      }
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onTouchStart={(event) => {
        event.stopPropagation();
      }}
      onTouchMove={(event) => {
        if (isScheduleDragActive) return;
        if (open) event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onFocusCapture={handleSheetFocusCapture}
      onBlurCapture={handleSheetBlurCapture}
    >
      {!open ? (
        <button
          type="button"
          aria-label="Open My List"
          aria-expanded={open}
          onPointerDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            if (shouldExpandOnOpen) setIsExpanded(true);
            onOpenChange(true);
          }}
          className="pointer-events-auto absolute left-1/2 top-0 flex h-[1.95rem] w-[4.75rem] -translate-x-1/2 -translate-y-[calc(1.35rem+0.375rem)] flex-col items-center justify-center gap-0.5 rounded-t-[1.25rem] border-x border-t border-white/14 bg-[#050507]/94 pb-1 pt-0.5 text-white/72 shadow-[0_-8px_28px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.12)] outline-none backdrop-blur-2xl transition hover:text-white focus-visible:ring-2 focus-visible:ring-white/35"
        >
          <ChevronUp
            className="h-3.5 w-3.5 transition-transform duration-200"
            strokeWidth={2.2}
            aria-hidden="true"
          />
          <span className="text-[0.55rem] font-semibold leading-none tracking-[0.08em] text-white/58">
            My List
          </span>
        </button>
      ) : isExpanded ? (
        <button
          type="button"
          aria-label="Close My List"
          aria-expanded={open}
          onPointerDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setIsExpanded(false);
            onOpenChange(false);
          }}
          className="pointer-events-auto absolute left-1/2 top-0 flex h-6 w-16 -translate-x-1/2 -translate-y-[1.35rem] items-center justify-center rounded-t-[1.25rem] border-x border-t border-white/14 bg-[#050507]/94 text-white/72 shadow-[0_-8px_28px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.12)] outline-none backdrop-blur-2xl transition hover:text-white focus-visible:ring-2 focus-visible:ring-white/35"
        >
          <ChevronDown className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
        </button>
      ) : (
        <div
          role="group"
          aria-label="My List size controls"
          onPointerDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          className="pointer-events-auto absolute left-1/2 top-0 flex h-6 w-16 -translate-x-1/2 -translate-y-[1.35rem] items-center justify-center overflow-hidden rounded-t-[1.25rem] border-x border-t border-white/14 bg-[#050507]/94 text-white/64 shadow-[0_-8px_28px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl"
        >
          <button
            type="button"
            aria-label="Expand My List"
            aria-expanded={isExpanded}
            onPointerDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsExpanded(true);
            }}
            className="pointer-events-auto flex h-full flex-1 items-center justify-center bg-transparent p-0 text-white/72 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white/35"
          >
            <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Close My List"
            aria-expanded={open}
            onClick={(event) => {
              event.stopPropagation();
              onOpenChange(false);
            }}
            className="flex h-full flex-1 items-center justify-center bg-transparent p-0 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white/35"
          >
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
      )}
      <motion.div
        aria-hidden={!open}
        className={clsx(
          "flex flex-col overflow-hidden rounded-t-[1.65rem] border border-b-0 border-white/[0.095] bg-[#070708]/90 text-white shadow-[0_-24px_70px_-18px_rgba(0,0,0,0.95),0_-8px_28px_rgba(0,0,0,0.46),inset_0_1px_0_rgba(255,255,255,0.075)] backdrop-blur-2xl",
          isScheduleDragActive && "opacity-[0.82]"
        )}
        initial={false}
        animate={{
          height: currentSheetHeight,
          maxHeight: currentSheetHeight,
        }}
        transition={
          prefersReducedMotion
            ? { duration: 0 }
            : { type: "spring", stiffness: 220, damping: 34, mass: 0.9 }
        }
        style={{
          paddingBottom: "calc(0.8rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div className="relative border-b border-white/[0.07] bg-black/[0.18] px-4 pb-1.5 pt-1.5 shadow-[inset_0_-1px_0_rgba(255,255,255,0.025)] sm:px-5">
          <button
            type="button"
            aria-label={
              activeView === "list" ? "Show Matrix view" : "Show My List view"
            }
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onTouchStart={(event) => {
              event.stopPropagation();
            }}
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setActiveSkillPickerRowKey(null);
              setActivePriorityPickerRowKey(null);
              setActiveDayPickerRowKey(null);
              setPendingDeleteRowId(null);
              setPendingTitleFocusRowId(null);
              if (activeView === "list") {
                onOpenChange(true);
                setIsExpanded(true);
                selectMyListViewModePreference("matrix");
                return;
              }

              selectMyListViewModePreference(
                isDayLensActive ? "day" : "priority"
              );
            }}
            tabIndex={open ? 0 : -1}
            className="absolute left-4 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg border border-white/[0.08] bg-black/24 p-0 text-white/54 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)] outline-none transition hover:border-white/[0.14] hover:bg-white/[0.055] hover:text-white/84 focus-visible:ring-2 focus-visible:ring-white/35 sm:left-5"
          >
            {activeView === "list" ? (
              <Grid2x2
                className="h-3.5 w-3.5"
                strokeWidth={1.8}
                aria-hidden="true"
              />
            ) : (
              <List
                className="h-3.5 w-3.5"
                strokeWidth={1.8}
                aria-hidden="true"
              />
            )}
          </button>
          <h2 className="text-center text-[0.72rem] font-semibold leading-none tracking-[0.08em] text-white/90">
            {activeView === "list" ? "My List" : "MATRIX"}
          </h2>
          {activeView === "list" ? (
            <div className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-1 sm:right-5">
              <button
                type="button"
                aria-label={
                  isDayLensActive
                    ? "Hide Day grouping"
                    : "Show Day grouping"
                }
                aria-pressed={isDayLensActive}
                onClick={(event) => {
                  event.stopPropagation();
                  setActiveSkillPickerRowKey(null);
                  setActivePriorityPickerRowKey(null);
                  setActiveDayPickerRowKey(null);
                  setPendingDeleteRowId(null);
                  selectMyListViewModePreference(
                    isDayLensActive ? "priority" : "day"
                  );
                }}
                tabIndex={open ? 0 : -1}
                className={clsx(
                  "flex h-6 w-6 items-center justify-center rounded-lg border bg-black/24 p-0 text-white/54 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)] outline-none transition hover:border-white/[0.14] hover:bg-white/[0.055] hover:text-white/84 focus-visible:ring-2 focus-visible:ring-white/35",
                  isDayLensActive
                    ? "border-white/[0.08] text-white"
                    : "border-white/[0.08]"
                )}
              >
                <Sun
                  className="h-3.5 w-3.5"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                aria-label="Add My List to-do"
                onClick={(event) => {
                  event.stopPropagation();
                  addManualRow();
                }}
                tabIndex={open ? 0 : -1}
                className="flex h-6 w-6 items-center justify-center bg-transparent p-0 text-white/58 outline-none transition hover:text-white/90 focus-visible:ring-2 focus-visible:ring-white/35"
              >
                <Plus
                  className="h-3.5 w-3.5"
                  strokeWidth={2.2}
                  aria-hidden="true"
                />
              </button>
            </div>
          ) : null}
        </div>
        <div
          ref={sheetScrollRef}
          className={clsx(
            "min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5",
            activeManualReorderRowId
              ? "touch-none [-webkit-overflow-scrolling:auto]"
              : "[-webkit-overflow-scrolling:touch]"
          )}
          onTouchStart={handleSheetTouchStart}
          onTouchMove={handleSheetTouchMove}
          onTouchEnd={handleSheetTouchEnd}
          onTouchCancel={handleSheetTouchEnd}
          onWheel={handleSheetWheel}
        >
          {activeView === "list" ? (
            <>
          <DndContext
            sensors={manualReorderSensors}
            collisionDetection={closestCenter}
            autoScroll={manualReorderAutoScroll}
            onDragStart={handleManualReorderDragStart}
            onDragOver={handleManualReorderDragOver}
            onDragEnd={handleManualReorderDragEnd}
            onDragCancel={handleManualReorderDragCancel}
          >
            <SortableContext
              items={manualReorderItemIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1.5">
            {hasListRows ? (
              <>
                {todoListSections.map((section) => {
                  const { group } = section;
                  const isCompletedSection =
                    section.sectionType === "completed";
                  const dayDropBucketId =
                    !isCompletedSection &&
                    isDayLensActive &&
                    MY_LIST_DAY_VIEW_BUCKETS.includes(
                      group.id as MyListDayViewBucketId
                    )
                      ? (group.id as MyListDayViewBucketId)
                      : null;
                  const isActiveDayDropTarget =
                    dayDropBucketId !== null &&
                    dayDragDropBucketId === dayDropBucketId;
                  const manualReorderGroup: MyListManualReorderGroup | null =
                    !isCompletedSection && isDayLensActive && dayDropBucketId
                      ? { kind: "day", id: dayDropBucketId }
                      : !isCompletedSection &&
                          PRIORITY_ORDER.includes(group.id as PriorityBucketId)
                        ? {
                            kind: "priority",
                            id: group.id as PriorityBucketId,
                          }
                        : null;

                  const groupRows = (
                    <MyListManualTodoGroupDropZone
                      group={manualReorderGroup}
                      dayDropBucketId={dayDropBucketId ?? undefined}
                      className={clsx(
                        "space-y-0.5 rounded-lg border px-1 pb-0.5 transition-colors",
                        dayDropBucketId && "min-h-8",
                        dayDropBucketId
                          ? isActiveDayDropTarget
                            ? "border-white/[0.16] bg-white/[0.055]"
                            : "border-transparent bg-transparent"
                          : "border-transparent bg-transparent"
                      )}
                    >
                    {group.label ? (
                      dayDropBucketId ? (
                        <div className="px-2 pt-1">
                          {(() => {
                            const dayVisual =
                              MY_LIST_DAY_VISUALS[dayDropBucketId];
                            const DayIcon = dayVisual.Icon;

                            return (
                              <div
                                className={clsx(
                                  "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-[0.62rem] font-semibold uppercase tracking-[0.08em]",
                                  dayVisual.pillClassName
                                )}
                              >
                                <DayIcon
                                  className="h-3 w-3"
                                  strokeWidth={1.9}
                                  aria-hidden="true"
                                />
                                <span>{group.label}</span>
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <div className="px-3 pt-1 text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-white/38">
                          {group.label}
                        </div>
                      )
                    ) : null}
                    {group.rows.map((visibleRow) => {
                  if (visibleRow.rowType === "task") {
                    const task = visibleRow.task;
                    const taskCompletionOverride = taskOverrides[task.id];
                    const hasTaskCompletionOverride = Boolean(
                      taskCompletionOverride &&
                        "completedAt" in taskCompletionOverride
                    );
                    const done = hasTaskCompletionOverride
                      ? Boolean(taskCompletionOverride?.completedAt)
                      : task.stage?.toString().toUpperCase() === "PERFECT";
                    const pending = pendingTaskIds.has(task.id);
                    const taskSkill = resolveTaskSkillMetadata(task);
                    const priorityId = resolveTaskPriorityId(task);
                    const dayBucketId = resolveTaskDayBucketId(task);
                    const dayViewBucketId = dayBucketId ?? "anytime";
                    const dayVisual = MY_LIST_DAY_VISUALS[dayViewBucketId];
                    const DayIcon = dayVisual.Icon;
                    const priorityOption =
                      QUICK_CREATE_PRIORITY_OPTIONS.find(
                        (option) => option.id === priorityId
                      ) ?? defaultPriority;
                    const prioritySymbol =
                      priorityOption.symbol ||
                      QUICK_CREATE_PRIORITY_PLACEHOLDER_SYMBOL;
                    const taskText = taskOverrides[task.id]?.text ?? task.name;
                    const taskTitle = taskText.trim() || task.name.trim();
                    const checkboxId = `my-list-task-${task.id}`;
                    const rowKey = `task:${task.id}` as const;
                    const priorityMetadata =
                      resolvePriorityScheduleMetadata(priorityId);
                    const taskScheduleDragRow: MyListScheduleDragRow = {
                      rowType: "task",
                      rowId: task.id,
                      title: taskTitle,
                      sourceId: task.id,
                      sourceType: "TASK",
                      energy: task.energy ?? "MEDIUM",
                      skillId: taskSkill.skillId ?? null,
                      metadata: {
                        source: "my-list",
                        rowType: "task",
                        rowId: task.id,
                        presentationKind: MY_LIST_SCHEDULE_PRESENTATION_KIND,
                        taskId: task.id,
                        skillId: taskSkill.skillId ?? null,
                        skillName: taskSkill.skillName ?? null,
                        skillIcon: taskSkill.skillIcon ?? null,
                        ...priorityMetadata,
                      },
                    };

                  return (
                    <div
                      key={rowKey}
                      data-creator-xp-source="my-list-todo"
                      data-creator-xp-kind="todo"
                      data-my-list-schedule-drag-row={
                        canStartTodoRowLongPress ? "true" : undefined
                      }
                      onPointerDown={(event) =>
                        startScheduleDragPress(event, taskScheduleDragRow)
                      }
                      onPointerMove={handleScheduleDragPointerMove}
                      onPointerUp={handleScheduleDragPointerEnd}
                      onPointerCancel={handleScheduleDragPointerEnd}
                      onTouchStart={(event) =>
                        startScheduleDragTouchPress(event, taskScheduleDragRow)
                      }
                      onTouchMove={handleScheduleDragTouchMove}
                      onTouchEnd={handleScheduleDragTouchEnd}
                      onTouchCancel={handleScheduleDragTouchEnd}
                      className={clsx(
                        "flex min-h-8 items-center gap-2 rounded-lg bg-transparent py-1 pl-3 pr-1.5 text-sm text-white/84 transition-colors hover:bg-white/[0.035]",
                        canStartTodoRowLongPress &&
                          (isScheduleDragActive
                            ? "cursor-grabbing"
                            : "cursor-grab"),
                        pending && "opacity-60"
                      )}
                    >
                      <input
                        id={checkboxId}
                        type="checkbox"
                        checked={done}
                        disabled={pending}
                        onChange={(event) => {
                          setPendingDeleteRowId(null);
                          const checked = event.target.checked;

                          setTaskOverrides((currentOverrides) => ({
                            ...currentOverrides,
                            [task.id]: {
                              ...currentOverrides[task.id],
                              completedAt: checked
                                ? new Date().toISOString()
                                : null,
                            },
                          }));

                          const sourceElement = event.currentTarget.closest(
                            '[data-creator-xp-source="my-list-todo"]'
                          );
                          const sourceRect =
                            sourceElement instanceof HTMLElement
                              ? toCreatorXpBurstRect(
                                  sourceElement.getBoundingClientRect()
                                )
                              : null;
                          onToggleTask(task.id, sourceRect, {
                            skillId: taskSkill.skillId,
                            monumentId: taskSkill.monumentId,
                          });
                        }}
                        tabIndex={open ? 0 : -1}
                        className="peer sr-only disabled:cursor-wait"
                      />
                      <label
                        htmlFor={checkboxId}
                        aria-label={
                          done ? "Mark to-do incomplete" : "Mark to-do complete"
                        }
                        className={clsx(
                          "relative flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-[0.32rem] border transition peer-focus-visible:ring-2 peer-focus-visible:ring-white/35 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-zinc-950",
                          done
                            ? "shimmer-border-complete focus-pomo-start-glint isolate z-0 overflow-hidden border-green-900/45 bg-[linear-gradient(155deg,rgba(34,197,94,0.94)_0%,rgba(22,163,74,0.97)_48%,rgba(21,128,61,0.98)_100%)] text-white shadow-[0_8px_16px_rgba(3,83,45,0.24),inset_0_1px_0_rgba(255,255,255,0.045),inset_0_-2px_8px_rgba(0,0,0,0.11),inset_0_0_0_1px_rgba(0,0,0,0.08)] ring-1 ring-green-900/45"
                            : "border-white/16 bg-black/24 text-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                        )}
                      >
                        <span
                          className={clsx(
                            "h-2 w-1.5 rotate-45 border-b-2 border-r-2 border-current transition-opacity",
                            done ? "opacity-100" : "opacity-0"
                          )}
                        />
                      </label>
                      <div className="relative h-4 w-4 shrink-0">
                        <button
                          type="button"
                          aria-label={
                            taskSkill.skillName
                              ? `Change Skill: ${taskSkill.skillName}`
                              : "Choose Skill"
                          }
                          aria-haspopup="listbox"
                          aria-expanded={activeSkillPickerRowKey === rowKey}
                          title={taskSkill.skillName ?? "Choose Skill"}
                          onClick={(event) => {
                            event.stopPropagation();
                            setActivePriorityPickerRowKey(null);
                            setActiveDayPickerRowKey(null);
                            setManualSkillSearch("");
                            setActiveSkillPickerRowKey((currentRowKey) =>
                              currentRowKey === rowKey ? null : rowKey
                            );
                          }}
                          tabIndex={open ? 0 : -1}
                          className={clsx(
                            "flex h-4 w-4 items-center justify-center bg-transparent p-0 text-center text-[0.78rem] leading-none text-white/70 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white/35",
                            done && "text-white/42"
                          )}
                        >
                          {taskSkill.skillIcon}
                        </button>
                        {renderSkillPicker(rowKey, taskSkill.skillId, (skill) =>
                          handleTaskSkillSelect(task.id, skill)
                        )}
                      </div>
                      <input
                        type="text"
                        value={taskText}
                        onPointerDown={(event) => event.stopPropagation()}
                        onTouchStart={(event) => event.stopPropagation()}
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) =>
                          handleTodoTitleKeyDown(event, "task", task.id)
                        }
                        onChange={(event) => {
                          const nextText = event.target.value;
                          setTaskOverrides((currentOverrides) => ({
                            ...currentOverrides,
                            [task.id]: {
                              ...currentOverrides[task.id],
                              text: nextText,
                            },
                          }));
                        }}
                        placeholder="To-do"
                        aria-label="To-do text"
                        tabIndex={open ? 0 : -1}
                        className={clsx(
                          "min-w-0 flex-1 bg-transparent p-0 leading-snug text-white/84 outline-none placeholder:text-white/30",
                          done && "text-white/42 line-through"
                        )}
                      />
                      <div className="-mr-0.5 flex shrink-0 items-center gap-px">
                        <div className="relative shrink-0">
                          <button
                            type="button"
                            aria-label={`Choose day: ${MY_LIST_DAY_LABELS[dayViewBucketId]}`}
                            aria-haspopup="listbox"
                            aria-expanded={activeDayPickerRowKey === rowKey}
                            title={MY_LIST_DAY_LABELS[dayViewBucketId]}
                            onClick={(event) => {
                              event.stopPropagation();
                              setActiveSkillPickerRowKey(null);
                              setActivePriorityPickerRowKey(null);
                              setActiveDayPickerRowKey((currentRowKey) =>
                                currentRowKey === rowKey ? null : rowKey
                              );
                            }}
                            tabIndex={open ? 0 : -1}
                            className={clsx(
                              "flex h-7 min-w-7 items-center justify-center rounded-full border px-1.5 outline-none transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-white/35",
                              dayVisual.pillClassName,
                              done && "text-white/42"
                            )}
                          >
                            <DayIcon
                              className="h-3.5 w-3.5"
                              strokeWidth={1.9}
                              aria-hidden="true"
                            />
                          </button>
                          {renderDayPicker(rowKey, dayBucketId, (nextId) =>
                            handleDaySelect(task.id, "task", nextId)
                          )}
                        </div>
                        <div className="relative shrink-0">
                          <button
                            type="button"
                            aria-label={`Choose priority: ${priorityOption.label}`}
                            aria-haspopup="listbox"
                            aria-expanded={activePriorityPickerRowKey === rowKey}
                            title={priorityOption.label}
                            onClick={(event) => {
                              event.stopPropagation();
                              setActiveSkillPickerRowKey(null);
                              setActiveDayPickerRowKey(null);
                              setActivePriorityPickerRowKey((currentRowKey) =>
                                currentRowKey === rowKey ? null : rowKey
                              );
                            }}
                            tabIndex={open ? 0 : -1}
                            className={clsx(
                              "flex h-7 min-w-7 items-center justify-center rounded-full bg-black/10 px-1 text-[10px] font-black leading-none text-white/46 outline-none transition hover:bg-white/[0.045] hover:text-white/72 focus-visible:ring-2 focus-visible:ring-white/35",
                              done && "text-white/42"
                            )}
                          >
                            <span className="max-w-8 truncate">
                              {prioritySymbol}
                            </span>
                          </button>
                          {renderPriorityPicker(rowKey, priorityId, (nextId) =>
                            handlePrioritySelect(task.id, "task", nextId)
                          )}
                        </div>
                        {renderDeleteRowButton(task.id, "task")}
                      </div>
                    </div>
                  );
                  }

                  if (visibleRow.rowType === "pinnedSource") {
                    const row = visibleRow.row;
                    const completionKey = `${row.sourceType}:${row.id}`;
                    const completedAt =
                      pinnedSourceCompletions[completionKey] ?? null;
                    const done = Boolean(completedAt);
                    const checkboxId = `my-list-pinned-${row.sourceType.toLowerCase()}-${row.id}`;
                    const priorityId = normalizePriority(
                      row.priority ?? defaultPriority.id
                    );
                    const priorityOption =
                      QUICK_CREATE_PRIORITY_OPTIONS.find(
                        (option) => option.id === priorityId
                      ) ?? defaultPriority;
                    const prioritySymbol =
                      priorityOption.symbol ||
                      QUICK_CREATE_PRIORITY_PLACEHOLDER_SYMBOL;
                    const title = row.title.trim() || `Untitled ${row.sourceType.toLowerCase()}`;
                    const sourceIcon = resolvePinnedSourceIcon(row);

                    return (
                      <div
                        key={`pinned-source:${row.sourceType}:${row.id}`}
                        data-creator-xp-source="my-list-todo"
                        data-creator-xp-kind="todo"
                        className="flex min-h-8 items-center gap-2 rounded-lg bg-transparent py-1 pl-3 pr-1.5 text-sm text-white/84 transition-colors hover:bg-white/[0.035]"
                      >
                        <input
                          id={checkboxId}
                          type="checkbox"
                          checked={done}
                          onChange={(event) => {
                            const nextCompletedAt = event.target.checked
                              ? new Date().toISOString()
                              : null;
                            setPendingDeleteRowId(null);
                            setPinnedSourceCompletions((current) => ({
                              ...current,
                              [completionKey]: nextCompletedAt,
                            }));
                            onTogglePinnedSourceCompletion?.(row, nextCompletedAt);
                          }}
                          tabIndex={open ? 0 : -1}
                          className="peer sr-only"
                        />
                        <label
                          htmlFor={checkboxId}
                          aria-label={
                            done
                              ? "Mark pinned item incomplete"
                              : "Mark pinned item complete"
                          }
                          className={clsx(
                            "relative flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-[0.32rem] border transition peer-focus-visible:ring-2 peer-focus-visible:ring-white/35 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-zinc-950",
                            done
                              ? "shimmer-border-complete focus-pomo-start-glint isolate z-0 overflow-hidden border-green-900/45 bg-[linear-gradient(155deg,rgba(34,197,94,0.94)_0%,rgba(22,163,74,0.97)_48%,rgba(21,128,61,0.98)_100%)] text-white shadow-[0_8px_16px_rgba(3,83,45,0.24),inset_0_1px_0_rgba(255,255,255,0.045),inset_0_-2px_8px_rgba(0,0,0,0.11),inset_0_0_0_1px_rgba(0,0,0,0.08)] ring-1 ring-green-900/45"
                              : "border-white/16 bg-black/24 text-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                          )}
                        >
                          <span
                            className={clsx(
                              "h-2 w-1.5 rotate-45 border-b-2 border-r-2 border-current transition-opacity",
                              done ? "opacity-100" : "opacity-0"
                            )}
                          />
                        </label>
                        <span
                          className={clsx(
                            "flex h-4 w-4 shrink-0 items-center justify-center text-center text-[0.78rem] leading-none text-white/70",
                            !row.icon?.trim() && "text-white/36",
                            done && "text-white/42"
                          )}
                          title={row.sourceType.toLowerCase()}
                          aria-hidden="true"
                        >
                          {sourceIcon}
                        </span>
                        <span
                          className={clsx(
                            "min-w-0 flex-1 truncate leading-snug text-white/84",
                            done && "text-white/42 line-through"
                          )}
                        >
                          {title}
                        </span>
                        <div className="-mr-0.5 flex shrink-0 items-center gap-0.5">
                          <span
                            title={priorityOption.label}
                            className={clsx(
                              "flex h-7 min-w-7 items-center justify-center rounded-full border border-white/8 bg-black/20 px-1 text-[10px] font-black leading-none text-white/46",
                              done && "text-white/32"
                            )}
                          >
                            <span className="max-w-8 truncate">
                              {prioritySymbol}
                            </span>
                          </span>
                        </div>
                        {renderDeleteRowButton(row.id, "pinnedSource", row)}
                      </div>
                    );
                  }

                  const row = visibleRow.row;
                  return (
                    <MyListSortableManualTodoRow
                      key={`manual:${row.id}`}
                      rowId={row.id}
                      reorderGroup={manualReorderGroup}
                      disabled={
                        !open ||
                        activeView !== "list" ||
                        row.id === EMPTY_DRAFT_MANUAL_ROW_ID
                      }
                    >
                      {({
                        attributes,
                        listeners,
                        setActivatorNodeRef,
                        isDragging,
                      }) => (
                    <div
                      data-creator-xp-source="my-list-todo"
                      data-creator-xp-kind="todo"
                      data-my-list-manual-upgrade-row="true"
                      onPointerDown={(event) =>
                        startManualUpgradePointerPress(event, row)
                      }
                      onPointerMove={handleManualUpgradePointerMove}
                      onPointerUp={handleManualUpgradePointerEnd}
                      onPointerCancel={handleManualUpgradePointerEnd}
                      onTouchStart={(event) =>
                        startManualUpgradeTouchPress(event, row)
                      }
                      onTouchMove={handleManualUpgradeTouchMove}
                      onTouchEnd={handleManualUpgradeTouchEnd}
                      onTouchCancel={handleManualUpgradeTouchEnd}
                      onSelectCapture={(event) => {
                        if (manualUpgradePressRef.current) {
                          event.preventDefault();
                        }
                      }}
                      onContextMenu={(event) => {
                        if (!shouldIgnoreManualUpgradeTarget(event.target)) {
                          event.preventDefault();
                        }
                      }}
                      className={clsx(
                        "relative flex min-h-8 select-none items-center gap-2 rounded-lg bg-transparent py-1 pl-3 pr-1.5 text-sm text-white/84 transition-[background-color,box-shadow,opacity,transform] hover:bg-white/[0.035] [-webkit-touch-callout:none] [-webkit-user-select:none] [user-select:none]",
                        open && activeView === "list" && "cursor-pointer",
                        (isDragging || activeManualReorderRowId === row.id) &&
                          "z-30 scale-[1.012] cursor-grabbing bg-white/[0.075] opacity-95 shadow-[0_12px_34px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-white/[0.13]"
                      )}
                      style={MY_LIST_MANUAL_UPGRADE_NO_SELECT_STYLE}
                    >
                      <span
                        aria-label="Reorder to-do"
                        title="Reorder to-do"
                        ref={setActivatorNodeRef}
                        data-my-list-no-upgrade
                        {...attributes}
                        {...listeners}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          listeners?.onPointerDown?.(event);
                        }}
                        onTouchStart={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onMouseDown={(event) => {
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        className="absolute left-0 top-1/2 z-10 flex h-5 w-2.5 -translate-y-1/2 touch-none cursor-grab items-center justify-center rounded-sm text-zinc-500/75 opacity-80 transition hover:text-zinc-300/80 hover:opacity-100 active:cursor-grabbing"
                      >
                        <GripVertical
                          className="h-3.5 w-3.5"
                          strokeWidth={2.3}
                        />
                      </span>
                    <input
                      id={`my-list-${row.id}`}
                      type="checkbox"
                      checked={row.done}
                      onChange={(event) =>
                        handleManualCompletionToggle(
                          row.id,
                          event.target.checked
                        )
                      }
                      tabIndex={open ? 0 : -1}
                      className="peer sr-only"
                    />
                    <label
                      htmlFor={`my-list-${row.id}`}
                      aria-label={
                        row.done ? "Mark to-do incomplete" : "Mark to-do complete"
                      }
                      className={clsx(
                        "relative flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-[0.32rem] border transition peer-focus-visible:ring-2 peer-focus-visible:ring-white/35 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-zinc-950",
                        row.done
                          ? "shimmer-border-complete focus-pomo-start-glint isolate z-0 overflow-hidden border-green-900/45 bg-[linear-gradient(155deg,rgba(34,197,94,0.94)_0%,rgba(22,163,74,0.97)_48%,rgba(21,128,61,0.98)_100%)] text-white shadow-[0_8px_16px_rgba(3,83,45,0.24),inset_0_1px_0_rgba(255,255,255,0.045),inset_0_-2px_8px_rgba(0,0,0,0.11),inset_0_0_0_1px_rgba(0,0,0,0.08)] ring-1 ring-green-900/45"
                          : "border-white/16 bg-black/24 text-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                      )}
                    >
                      <span
                        className={clsx(
                          "h-2 w-1.5 rotate-45 border-b-2 border-r-2 border-current transition-opacity",
                          row.done ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </label>
                    <div className="relative h-4 w-4 shrink-0">
                      <button
                        type="button"
                        aria-label={
                          row.skillName
                            ? `Change Skill: ${row.skillName}`
                            : "Choose Skill"
                        }
                        aria-haspopup="listbox"
                        aria-expanded={
                          activeSkillPickerRowKey === `manual:${row.id}`
                        }
                        title={row.skillName ?? "Choose Skill"}
                        onClick={(event) => {
                          event.stopPropagation();
                          setActivePriorityPickerRowKey(null);
                          setActiveDayPickerRowKey(null);
                          setManualSkillSearch("");
                          setActiveSkillPickerRowKey((currentRowKey) =>
                            currentRowKey === `manual:${row.id}`
                              ? null
                              : `manual:${row.id}`
                          );
                        }}
                        tabIndex={open ? 0 : -1}
                        className={clsx(
                          "flex h-4 w-4 items-center justify-center bg-transparent p-0 text-center text-[0.78rem] leading-none text-white/70 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white/35",
                          !row.skillIcon.trim() && "text-white/36",
                          row.done && "text-white/42"
                        )}
                      >
                        {row.skillIcon.trim() || "✦"}
                      </button>
                      {renderSkillPicker(
                        `manual:${row.id}`,
                        row.skillId,
                        (skill) => handleManualSkillSelect(row.id, skill)
                      )}
                    </div>
                    <input
                      ref={(input) => {
                        if (input) {
                          manualTitleInputRefs.current.set(row.id, input);
                        } else {
                          manualTitleInputRefs.current.delete(row.id);
                        }
                      }}
                      type="text"
                      value={row.text}
                      onClick={(event) => event.stopPropagation()}
                      onSelect={(event) => {
                        if (manualUpgradePressRef.current) {
                          event.currentTarget.setSelectionRange(
                            event.currentTarget.value.length,
                            event.currentTarget.value.length
                          );
                        }
                      }}
                      onContextMenu={(event) => {
                        if (manualUpgradePressRef.current) {
                          event.preventDefault();
                        }
                      }}
                      onKeyDown={(event) =>
                        handleTodoTitleKeyDown(event, "manual", row.id)
                      }
                      onChange={(event) =>
                        updateManualRow(row.id, { text: event.target.value })
                      }
                      placeholder="To-do"
                      aria-label="To-do text"
                      tabIndex={open ? 0 : -1}
                      className={clsx(
                        "min-w-0 flex-1 select-none bg-transparent p-0 leading-snug text-white/84 outline-none placeholder:text-white/30 [-webkit-touch-callout:none] [-webkit-user-select:none] [user-select:none]",
                        row.done && "text-white/42 line-through"
                      )}
                      style={MY_LIST_MANUAL_UPGRADE_NO_SELECT_STYLE}
                    />
                    <div className="-mr-0.5 flex shrink-0 items-center gap-px">
                      {(() => {
                        const priorityOption =
                          QUICK_CREATE_PRIORITY_OPTIONS.find(
                            (option) => option.id === row.priorityId
                          ) ?? defaultPriority;
                        const prioritySymbol =
                          priorityOption.symbol ||
                          QUICK_CREATE_PRIORITY_PLACEHOLDER_SYMBOL;
                        const dayViewBucketId =
                          row.dayBucketId ?? "anytime";
                        const dayVisual = MY_LIST_DAY_VISUALS[dayViewBucketId];
                        const DayIcon = dayVisual.Icon;
                        const rowKey = `manual:${row.id}` as const;

                        return (
                          <>
                            <div className="relative shrink-0">
                              <button
                                type="button"
                                aria-label={`Choose day: ${MY_LIST_DAY_LABELS[dayViewBucketId]}`}
                                aria-haspopup="listbox"
                                aria-expanded={activeDayPickerRowKey === rowKey}
                                title={MY_LIST_DAY_LABELS[dayViewBucketId]}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setActiveSkillPickerRowKey(null);
                                  setActivePriorityPickerRowKey(null);
                                  setActiveDayPickerRowKey((currentRowKey) =>
                                    currentRowKey === rowKey ? null : rowKey
                                  );
                                }}
                                tabIndex={open ? 0 : -1}
                                className={clsx(
                                  "flex h-7 min-w-7 items-center justify-center rounded-full border px-1.5 outline-none transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-white/35",
                                  dayVisual.pillClassName,
                                  row.done && "text-white/42"
                                )}
                              >
                                <DayIcon
                                  className="h-3.5 w-3.5"
                                  strokeWidth={1.9}
                                  aria-hidden="true"
                                />
                              </button>
                              {renderDayPicker(
                                rowKey,
                                row.dayBucketId,
                                (nextId) =>
                                  handleDaySelect(row.id, "manual", nextId)
                              )}
                            </div>
                            <div className="relative shrink-0">
                              <button
                                type="button"
                                aria-label={`Choose priority: ${priorityOption.label}`}
                                aria-haspopup="listbox"
                                aria-expanded={
                                  activePriorityPickerRowKey === rowKey
                                }
                                title={priorityOption.label}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setActiveSkillPickerRowKey(null);
                                  setActiveDayPickerRowKey(null);
                                  setActivePriorityPickerRowKey(
                                    (currentRowKey) =>
                                      currentRowKey === rowKey ? null : rowKey
                                  );
                                }}
                                tabIndex={open ? 0 : -1}
                                className={clsx(
                                  "flex h-7 min-w-7 items-center justify-center rounded-full bg-black/10 px-1 text-[10px] font-black leading-none text-white/46 outline-none transition hover:bg-white/[0.045] hover:text-white/72 focus-visible:ring-2 focus-visible:ring-white/35",
                                  row.done && "text-white/42"
                                )}
                              >
                                <span className="max-w-8 truncate">
                                  {prioritySymbol}
                                </span>
                              </button>
                              {renderPriorityPicker(
                                rowKey,
                                row.priorityId,
                                (nextId) =>
                                  handlePrioritySelect(row.id, "manual", nextId)
                              )}
                            </div>
                            {renderDeleteRowButton(row.id, "manual")}
                          </>
                        );
                      })()}
                    </div>
                    </div>
                      )}
                    </MyListSortableManualTodoRow>
                  );
                    })}
                    </MyListManualTodoGroupDropZone>
                  );

                  if (isCompletedSection) {
                    return (
                      <div key="completed-todos" className="pt-1">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setAreCompletedTodosVisible((current) => !current);
                          }}
                          tabIndex={open ? 0 : -1}
                          className="mx-auto block px-3 py-1 text-center text-xs font-medium text-white/38 outline-none transition hover:text-white/58 focus-visible:ring-2 focus-visible:ring-white/30"
                        >
                          {areCompletedTodosVisible
                            ? "Hide completed"
                            : "Show completed"}
                        </button>
                        <AnimatePresence initial={false}>
                          {areCompletedTodosVisible ? (
                            <motion.div
                              key="completed-todos-rows"
                              initial={
                                prefersReducedMotion
                                  ? false
                                  : { height: 0, opacity: 0 }
                              }
                              animate={{ height: "auto", opacity: 1 }}
                              exit={
                                prefersReducedMotion
                                  ? undefined
                                  : { height: 0, opacity: 0 }
                              }
                              transition={{
                                duration: prefersReducedMotion ? 0 : 0.22,
                                ease: [0.22, 1, 0.36, 1],
                              }}
                              className="overflow-hidden"
                            >
                              <div className="pt-1">{groupRows}</div>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </div>
                    );
                  }

                  return (
                    <div key={group.id}>
                      {groupRows}
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="rounded-lg bg-transparent px-3 py-2.5 text-sm text-white/42">
                No To-Dos yet.
              </div>
            )}
          </div>
            </SortableContext>
          </DndContext>
          <div className="border-t border-white/[0.055] pt-2">
            <textarea
              value={note}
              onPointerDown={(event) => event.stopPropagation()}
              onTouchStart={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onChange={handleNoteChange}
              placeholder="Notes..."
              tabIndex={open ? 0 : -1}
              className="min-h-24 w-full resize-none rounded-lg bg-transparent px-3 py-2 text-sm leading-relaxed text-white/86 outline-none placeholder:text-white/30 focus:bg-white/[0.025]"
            />
          </div>
            </>
          ) : (
            <MatrixContent variant="sheet" />
          )}
        </div>
      </motion.div>
    </motion.aside>
  );
}

function resolvePinnedSourceIcon(row: MyListPinnedSourceRow) {
  const explicitIcon = row.icon?.trim();
  if (explicitIcon) return explicitIcon;

  if (row.sourceType === "GOAL") return "✦";
  return "•";
}
