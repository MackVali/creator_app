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
  type MouseEvent as ReactMouseEvent,
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
  type CollisionDetection,
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
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  GripVertical,
  Grid2x2,
  Landmark,
  List,
  Moon,
  Pin,
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
  deleteManualMyListItem,
  loadManualMyListItems,
  MY_LIST_MANUAL_ITEM_CREATED_EVENT,
  MY_LIST_MANUAL_ITEM_CONSUMED_EVENT,
  replaceManualMyListItems,
  type MyListManualItemCreatedDetail,
  type MyListManualItemConsumedDetail,
} from "@/lib/my-list/myListItemsStorage";
import {
  createMyListList,
  loadMyListLists,
  MY_LIST_GROCERY_SYSTEM_KEY,
  MY_LIST_NAME_MAX_LENGTH,
  type MyListList,
} from "@/lib/my-list/myListListsStorage";
import { MatrixContent } from "@/app/(app)/schedule/matrix/MatrixContent";
import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  normalizePriority,
  type PriorityBucketId,
} from "@/app/(app)/schedule/priorities/utils";
import { normalizeGoalStatus } from "@/lib/goals/status";

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
const MY_LIST_VIEWPORT_RECOVERY_TOLERANCE = 16;
const MY_LIST_VIEWPORT_WIDTH_CHANGE_THRESHOLD = 24;
const MY_LIST_VIEWPORT_WIDTH_RATIO_CHANGE_THRESHOLD = 0.06;
const MY_LIST_EDITABLE_TARGET_SELECTOR =
  'input, textarea, [contenteditable="true"]';
const MY_LIST_NOTES_STORAGE_KEY = "creator:my-list:notes";
const MY_LIST_MANUAL_ROWS_STORAGE_KEY = "creator:my-list:manual-rows";
const MY_LIST_VIEW_MODE_STORAGE_KEY_PREFIX = "creator:my-list:view-mode";
const MY_LIST_VIEW_MODE_ANONYMOUS_ID = "anonymous";
const MY_LIST_VIEW_MODE_PREFERENCES = [
  "priority",
  "monuments",
  "day",
  "matrix",
] as const;
const MY_LIST_LEGACY_TAGS_VIEW_MODE = "tags";
const MY_LIST_NO_MONUMENT_GROUP_ID = "no-monument";
const MY_LIST_NO_MONUMENT_GROUP_LABEL = "No Monument";
const MY_LIST_CREATOR_DAY_ROLLOVER_HOUR = 4;
const MY_LIST_SCHEDULE_DRAG_LONG_PRESS_MS = 500;
const MY_LIST_SCHEDULE_DRAG_MOVE_CANCEL_PX = 14;
const MY_LIST_MANUAL_UPGRADE_LONG_PRESS_MS =
  MY_LIST_SCHEDULE_DRAG_LONG_PRESS_MS;
const MY_LIST_MANUAL_UPGRADE_MOVE_CANCEL_PX =
  MY_LIST_SCHEDULE_DRAG_MOVE_CANCEL_PX;
const MY_LIST_OPEN_QUICK_CREATE_TASK_DETAILS_EVENT =
  "schedule:open-quick-create-task-details";
const MY_LIST_DAY_DRAG_SCHEDULE_EXIT_PX = 22;
const MY_LIST_SCHEDULE_EVENT_DURATION_MIN = 30;
const MY_LIST_SCHEDULE_PRESENTATION_KIND = "project-schedule-card";
const MY_LIST_GOAL_ROW_DOUBLE_TAP_MS = 325;
const MY_LIST_COMPLETED_GOAL_ICON_CLASS =
  "shimmer-border-complete focus-pomo-start-glint relative isolate overflow-hidden border-green-900/45 bg-[linear-gradient(155deg,rgba(34,197,94,0.94)_0%,rgba(22,163,74,0.97)_48%,rgba(21,128,61,0.98)_100%)] text-white ring-1 ring-green-900/45 shadow-[0_6px_12px_rgba(3,83,45,0.22),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_4px_rgba(0,0,0,0.12)]";
const MY_LIST_COMPLETION_EXIT_TIMING = {
  confirmationPauseMs: 320,
  exitDurationMs: 220,
  cleanupBufferMs: 60,
  exitDistancePx: 16,
} as const;
const MY_LIST_CHECKBOX_TARGET_SELECTOR = "[data-my-list-checkbox]";
const MY_LIST_SCHEDULE_DRAG_BLOCKED_TARGET_SELECTOR = [
  "input",
  "textarea",
  "button",
  "select",
  "label",
  MY_LIST_CHECKBOX_TARGET_SELECTOR,
  "[role='button']",
  "[role='listbox']",
  "[contenteditable='true']",
  "[data-my-list-no-schedule-drag]",
].join(",");
const MY_LIST_MANUAL_UPGRADE_BLOCKED_TARGET_SELECTOR = [
  "button",
  "select",
  "label",
  MY_LIST_CHECKBOX_TARGET_SELECTOR,
  "[role='button']",
  "[role='listbox']",
  "[contenteditable='true']",
  "[data-my-list-no-upgrade]",
].join(",");
const MY_LIST_MANUAL_UPGRADE_NO_SELECT_STYLE = {
  WebkitTapHighlightColor: "transparent",
  WebkitTouchCallout: "none",
  WebkitUserSelect: "none",
  touchAction: "pan-y",
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

function isMyListCheckboxTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest(MY_LIST_CHECKBOX_TARGET_SELECTOR))
  );
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

function readPositiveViewportNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function readMyListViewportMetrics(): MyListViewportMetrics {
  const fallbackHeight = MY_LIST_MIN_SAFE_SHEET_HEIGHT;
  const innerWidth = readPositiveViewportNumber(window.innerWidth) ?? 1;
  const innerHeight =
    readPositiveViewportNumber(window.innerHeight) ?? fallbackHeight;
  const clientHeight =
    readPositiveViewportNumber(document.documentElement.clientHeight) ??
    innerHeight;
  const layoutBottom = Math.min(innerHeight, clientHeight);
  const visualViewport = window.visualViewport;

  if (!visualViewport) {
    return {
      innerWidth,
      innerHeight,
      clientHeight,
      layoutBottom,
      hasVisualViewport: false,
      visualWidth: null,
      visualHeight: layoutBottom,
      visualTop: 0,
      visualBottom: layoutBottom,
    };
  }

  const visualWidth = readPositiveViewportNumber(visualViewport.width);
  const visualHeight =
    readPositiveViewportNumber(visualViewport.height) ?? layoutBottom;
  const visualTop =
    typeof visualViewport.offsetTop === "number" &&
    Number.isFinite(visualViewport.offsetTop)
      ? visualViewport.offsetTop
      : 0;

  return {
    innerWidth,
    innerHeight,
    clientHeight,
    layoutBottom,
    hasVisualViewport: true,
    visualWidth,
    visualHeight,
    visualTop,
    visualBottom: visualTop + visualHeight,
  };
}

function isMyListKeyboardGeometryEqual(
  left: MyListKeyboardGeometryState,
  right: MyListKeyboardGeometryState,
) {
  return Math.abs(left.internalBottomInset - right.internalBottomInset) <= 1;
}

function isMyListKeyboardBaselineRecovered(
  metrics: MyListViewportMetrics,
  baseline: MyListKeyboardSessionBaseline,
) {
  const visualHeightRecovered =
    baseline.visualHeight === null ||
    Math.abs(metrics.visualHeight - baseline.visualHeight) <=
      MY_LIST_VIEWPORT_RECOVERY_TOLERANCE;
  const visualTopRecovered =
    baseline.visualOffsetTop === null ||
    Math.abs(metrics.visualTop - baseline.visualOffsetTop) <= 8;

  return (
    Math.abs(metrics.innerHeight - baseline.innerHeight) <=
      MY_LIST_VIEWPORT_RECOVERY_TOLERANCE &&
    Math.abs(metrics.clientHeight - baseline.clientHeight) <=
      MY_LIST_VIEWPORT_RECOVERY_TOLERANCE &&
    Math.abs(metrics.visualBottom - baseline.visualBottom) <=
      MY_LIST_VIEWPORT_RECOVERY_TOLERANCE &&
    visualHeightRecovered &&
    visualTopRecovered
  );
}

const QUICK_CREATE_UNCATEGORIZED_SKILL_GROUP_ID = "uncategorized";
const QUICK_CREATE_UNCATEGORIZED_SKILL_GROUP_LABEL = "Uncategorized";

type QuickCreateSkillGroup = {
  id: string;
  label: string;
  categoryOrder: number | null;
  skills: SkillRow[];
};

type MyListViewportMetrics = {
  innerWidth: number;
  innerHeight: number;
  clientHeight: number;
  layoutBottom: number;
  hasVisualViewport: boolean;
  visualWidth: number | null;
  visualHeight: number;
  visualTop: number;
  visualBottom: number;
};

type MyListKeyboardGeometryState = {
  internalBottomInset: number;
};

type MyListKeyboardSessionBaseline = {
  innerWidth: number;
  innerHeight: number;
  clientHeight: number;
  layoutBottom: number;
  visualWidth: number | null;
  visualHeight: number | null;
  visualOffsetTop: number | null;
  visualBottom: number;
};

function compareQuickCreateOrderThenName(
  leftOrder: number | null | undefined,
  leftName: string | null | undefined,
  rightOrder: number | null | undefined,
  rightName: string | null | undefined,
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

type MyListPinnedSourceRowKey =
  `pinnedSource:${MyListPinnableSourceType}:${string}`;
type MyListRowKey =
  | `manual:${string}`
  | `task:${string}`
  | MyListPinnedSourceRowKey;
type MyListSortableTodoRowKey = MyListRowKey;
type MyListDayBucketId = (typeof MY_LIST_DAY_BUCKETS)[number];
type MyListDayViewBucketId = (typeof MY_LIST_DAY_VIEW_BUCKETS)[number];
type MyListViewModePreference = (typeof MY_LIST_VIEW_MODE_PREFERENCES)[number];
const MY_LIST_STANDALONE_PINNED_SOURCE_ROW_KIND = "PINNED_SOURCE" as const;

export type MyListMonumentRow = {
  id: string;
  title: string;
  emoji?: string | null;
  priorityRank?: number | null;
};

type MyListMonumentGroup = {
  id: string;
  label: string;
  icon?: string | null;
  rows: MyListVisibleTodoRow[];
};

function buildPinnedSourceRowKey(
  sourceType: MyListPinnableSourceType,
  sourceId: string,
): MyListPinnedSourceRowKey {
  return `pinnedSource:${sourceType}:${sourceId}`;
}

function readPinnedSourceRowKeyParts(rowKey: string): {
  sourceType: MyListPinnableSourceType;
  sourceId: string;
} | null {
  const [, sourceType, ...sourceIdParts] = rowKey.split(":");
  const sourceId = sourceIdParts.join(":").trim();
  if (
    rowKey.startsWith("pinnedSource:") &&
    MY_LIST_PINNABLE_SOURCE_TYPES.includes(
      sourceType as MyListPinnableSourceType,
    ) &&
    sourceId
  ) {
    return {
      sourceType: sourceType as MyListPinnableSourceType,
      sourceId,
    };
  }

  return null;
}

function readTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type MyListManualRow = {
  id: string;
  listId: string | null;
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
  priorityId: PriorityBucketId,
  listId: string | null = null,
): MyListManualRow {
  return {
    id,
    listId,
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

function createManualStorageBackedRowId(fallbackCounter: number) {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `manual-${Date.now()}-${fallbackCounter}`;
}

function sanitizeMyListManualRow(
  value: unknown,
  fallbackPriorityId: PriorityBucketId,
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
    listId:
      typeof record.listId === "string" && record.listId.trim()
        ? record.listId.trim()
        : null,
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
  fallbackPriorityId: PriorityBucketId,
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
      record.sourceType as MyListPinnableSourceType,
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
    goalIcon: typeof record.goalIcon === "string" ? record.goalIcon : null,
    monumentId: readTrimmedString(record.monumentId),
    monumentIcon:
      typeof record.monumentIcon === "string" ? record.monumentIcon : null,
    monumentName:
      typeof record.monumentName === "string" ? record.monumentName : null,
    skillId: readTrimmedString(record.skillId),
    skillIds: Array.isArray(record.skillIds)
      ? record.skillIds.filter(
          (skillId): skillId is string =>
            typeof skillId === "string" && skillId.trim().length > 0,
        )
      : undefined,
    skillMonumentId: readTrimmedString(record.skillMonumentId),
    skillIcon: typeof record.skillIcon === "string" ? record.skillIcon : null,
    priority: typeof record.priority === "string" ? record.priority : null,
    priorityId:
      typeof record.priorityId === "string"
        ? normalizePriority(record.priorityId)
        : null,
    dayBucketId: readMyListDayBucketFromUnknown(record),
    energy: typeof record.energy === "string" ? record.energy : null,
    stage: typeof record.stage === "string" ? record.stage : null,
    active: typeof record.active === "boolean" ? record.active : null,
    goalId: typeof record.goalId === "string" ? record.goalId : null,
    projectId: readTrimmedString(record.projectId),
    rowKind:
      record.rowKind === MY_LIST_STANDALONE_PINNED_SOURCE_ROW_KIND
        ? MY_LIST_STANDALONE_PINNED_SOURCE_ROW_KIND
        : undefined,
    isPinned: record.isPinned !== false,
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
  fallbackPriorityId: PriorityBucketId,
): MyListManualRow[] {
  if (typeof window === "undefined") return [];

  try {
    const storedRows = window.localStorage.getItem(
      MY_LIST_MANUAL_ROWS_STORAGE_KEY,
    );
    if (storedRows === null) return [];
    return sanitizeMyListManualRows(JSON.parse(storedRows), fallbackPriorityId);
  } catch {
    return [];
  }
}

function writeStoredMyListManualRows(
  rows: MyListManualRow[],
  fallbackPriorityId: PriorityBucketId,
) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      MY_LIST_MANUAL_ROWS_STORAGE_KEY,
      JSON.stringify(sanitizeMyListManualRows(rows, fallbackPriorityId)),
    );
  } catch {
    // Ignore unavailable storage so My List row editing is never blocked.
  }
}

function normalizeMyListViewModePreference(
  value: unknown,
): MyListViewModePreference | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === MY_LIST_LEGACY_TAGS_VIEW_MODE) {
    return "monuments";
  }
  if (
    MY_LIST_VIEW_MODE_PREFERENCES.includes(
      normalized as MyListViewModePreference,
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
  userId?: string | null,
): MyListViewModePreference | null {
  if (typeof window === "undefined") return null;

  try {
    const storedPreference = normalizeMyListViewModePreference(
      window.localStorage.getItem(getMyListViewModeStorageKey(userId)),
    );
    if (storedPreference || !userId?.trim()) return storedPreference;

    return normalizeMyListViewModePreference(
      window.localStorage.getItem(getMyListViewModeStorageKey(null)),
    );
  } catch {
    return null;
  }
}

function writeStoredMyListViewModePreference(
  userId: string | null | undefined,
  preference: MyListViewModePreference,
) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      getMyListViewModeStorageKey(userId),
      preference,
    );
  } catch {
    // Ignore unavailable storage so changing views is never blocked.
  }
}

function normalizeMyListDayBucket(value: unknown): MyListDayBucketId | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (MY_LIST_DAY_BUCKETS.includes(normalized as MyListDayBucketId)) {
    return normalized as MyListDayBucketId;
  }
  return null;
}

function readMyListDayBucketFromUnknown(
  value: unknown,
): MyListDayBucketId | null {
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

function isProjectCompletionStage(stage: string | null | undefined) {
  return stage?.toString().trim().toUpperCase() === "RELEASE";
}

function isPinnedGoalCompleted(goal: MyListPinnedGoalRow) {
  return normalizeGoalStatus(goal.stage, goal.active) === "COMPLETED";
}

function isCompletedAtInCurrentLocalCreatorDay(
  completedAt: string | null | undefined,
  currentCreatorDayStart: Date,
  nextCreatorDayRollover: Date,
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
  rowKind?: typeof MY_LIST_STANDALONE_PINNED_SOURCE_ROW_KIND;
  title: string;
  icon?: string | null;
  goalIcon?: string | null;
  monumentId?: string | null;
  monumentIcon?: string | null;
  monumentName?: string | null;
  skillId?: string | null;
  skillIds?: string[];
  skillMonumentId?: string | null;
  skillIcon?: string | null;
  priority?: string | null;
  priorityId?: PriorityBucketId | null;
  dayBucketId?: MyListDayBucketId | null;
  energy?: string | null;
  stage?: string | null;
  active?: boolean | null;
  goalId?: string | null;
  projectId?: string | null;
  isPinned?: boolean;
  completedAt?: string | null;
};

export type MyListPinnedGoalRow = MyListPinnedSourceRow & {
  sourceType: "GOAL";
  projects: MyListPinnedSourceRow[];
  tasks?: MyListPinnedSourceRow[];
  habits?: MyListPinnedSourceRow[];
};

type MyListVisibleTodoRow =
  | { rowType: "task"; task: TaskLite }
  | { rowType: "manual"; row: MyListManualRow }
  | { rowType: "pinnedSource"; row: MyListPinnedSourceRow };
type MyListCompletionExitPhase = "confirming" | "exiting";
type MyListCompletionExitState = {
  phase: MyListCompletionExitPhase;
  completedAt: string;
  visibleRow: MyListVisibleTodoRow;
};
type MyListCompletionExitTimers = {
  exit: ReturnType<typeof setTimeout>;
  cleanup: ReturnType<typeof setTimeout>;
};

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
  pointerType: string | null;
  startX: number;
  startY: number;
  rowId: string;
  title: string;
  skillId: string | null;
  priorityId: PriorityBucketId;
  timer: ReturnType<typeof setTimeout>;
  triggered: boolean;
  committed: boolean;
  pendingDetail: MyListManualUpgradeOpenDetail | null;
};
type MyListManualUpgradeOpenDetail = {
  title: string;
  skillId: string | null;
  priority: PriorityBucketId;
  energy: "MEDIUM";
  origin: "manual-my-list-upgrade";
  sourceManualMyListItemId: string;
};
type MyListSortableManualTodoHandleProps = {
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
  setActivatorNodeRef: ReturnType<typeof useSortable>["setActivatorNodeRef"];
  isDragging: boolean;
};
function MyListTodoDragHandle({
  attributes,
  listeners,
  setActivatorNodeRef,
}: Pick<
  MyListSortableManualTodoHandleProps,
  "attributes" | "listeners" | "setActivatorNodeRef"
>) {
  return (
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
      className="absolute -left-3 top-1/2 z-10 flex h-10 w-6 -translate-y-1/2 touch-none select-none cursor-grab items-center justify-center rounded-sm text-zinc-500/75 opacity-80 transition hover:text-zinc-300/80 hover:opacity-100 active:cursor-grabbing [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] [-webkit-user-select:none] [user-select:none]"
    >
      <GripVertical
        className="h-3.5 w-3.5 translate-x-[5px]"
        strokeWidth={2.3}
      />
    </span>
  );
}
type MyListSortableManualTodoRowProps = {
  rowKey: MyListSortableTodoRowKey;
  rowType: MyListVisibleTodoRow["rowType"];
  disabled: boolean;
  completionExitPhase?: MyListCompletionExitPhase | null;
  prefersReducedMotion: boolean | null;
  reorderGroup: MyListManualReorderGroup | null;
  children: (props: MyListSortableManualTodoHandleProps) => ReactNode;
};
type MyListManualReorderGroup =
  | { kind: "day"; id: MyListDayViewBucketId }
  | { kind: "priority"; id: PriorityBucketId }
  | { kind: "monument"; id: string };
type MyListManualReorderOverData =
  | {
      type: "manual-row";
      rowType: MyListVisibleTodoRow["rowType"];
      group: MyListManualReorderGroup | null;
    }
  | { type: "manual-group"; group: MyListManualReorderGroup };
type MyListManualReorderDestination = {
  targetRowKey: MyListSortableTodoRowKey | null;
  group: MyListManualReorderGroup | null;
};
export type MyListTaskXpContext = {
  skillId: string | null;
  monumentId: string | null;
};

function buildManualReorderGroupDropId(group: MyListManualReorderGroup) {
  return `manualGroup:${group.kind}:${group.id}`;
}

function areManualReorderGroupsEqual(
  leftGroup: MyListManualReorderGroup | null,
  rightGroup: MyListManualReorderGroup | null,
) {
  return (
    leftGroup?.kind === rightGroup?.kind && leftGroup?.id === rightGroup?.id
  );
}

function isManualReorderDestinationAllowedForSource(
  sourceGroup: MyListManualReorderGroup | null,
  destination: MyListManualReorderDestination | null,
) {
  if (!sourceGroup || sourceGroup.kind !== "monument") return true;
  if (!destination) return false;

  return areManualReorderGroupsEqual(sourceGroup, destination.group);
}

function readManualReorderOverData(
  value: unknown,
): MyListManualReorderOverData | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const type = record.type;
  const rowType =
    record.rowType === "pinnedSource"
      ? "pinnedSource"
      : record.rowType === "task"
        ? "task"
        : "manual";
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
      ? ({
          type,
          ...(type === "manual-row" ? { rowType } : {}),
          group: parsedGroup,
        } as MyListManualReorderOverData)
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
      ? ({
          type,
          ...(type === "manual-row" ? { rowType } : {}),
          group: parsedGroup,
        } as MyListManualReorderOverData)
      : null;
  }

  if (
    groupKind === "monument" &&
    typeof groupId === "string" &&
    groupId.trim()
  ) {
    const parsedGroup = {
      kind: groupKind,
      id: groupId.trim(),
    } satisfies MyListManualReorderGroup;

    return type === "manual-group" || type === "manual-row"
      ? ({
          type,
          ...(type === "manual-row" ? { rowType } : {}),
          group: parsedGroup,
        } as MyListManualReorderOverData)
      : null;
  }

  if (type === "manual-row") {
    return { type, rowType, group: null };
  }

  return null;
}

function getSortableTodoRowKey(
  visibleRow: MyListVisibleTodoRow,
): MyListSortableTodoRowKey | null {
  if (visibleRow.rowType === "manual") {
    return visibleRow.row.id === EMPTY_DRAFT_MANUAL_ROW_ID
      ? null
      : `manual:${visibleRow.row.id}`;
  }

  if (visibleRow.rowType === "task") {
    return `task:${visibleRow.task.id}`;
  }

  if (visibleRow.rowType === "pinnedSource") {
    return buildPinnedSourceRowKey(
      visibleRow.row.sourceType,
      visibleRow.row.id,
    );
  }

  return null;
}

function readManualRowIdFromSortableKey(rowKey: string) {
  return rowKey.startsWith("manual:")
    ? rowKey.slice("manual:".length).trim()
    : null;
}

function readManualReorderActiveRowKey(
  active: DragStartEvent["active"],
  rows: MyListVisibleTodoRow[],
): MyListSortableTodoRowKey | null {
  const activeData = readManualReorderOverData(active.data.current);
  const rowKey = typeof active.id === "string" ? active.id.trim() : "";
  const manualRowId = readManualRowIdFromSortableKey(rowKey);
  const pinnedSourceKeyParts = readPinnedSourceRowKeyParts(rowKey);
  const taskRowId = rowKey.startsWith("task:")
    ? rowKey.slice("task:".length).trim()
    : null;

  if (
    !rowKey ||
    activeData?.type !== "manual-row" ||
    (activeData.rowType === "manual" &&
      (!manualRowId ||
        manualRowId === EMPTY_DRAFT_MANUAL_ROW_ID ||
        !rows.some(
          (visibleRow) =>
            visibleRow.rowType === "manual" &&
            visibleRow.row.id === manualRowId,
        ))) ||
    (activeData.rowType === "task" &&
      (!taskRowId ||
        !rows.some(
          (visibleRow) =>
            visibleRow.rowType === "task" && visibleRow.task.id === taskRowId,
        ))) ||
    (activeData.rowType === "pinnedSource" &&
      (!pinnedSourceKeyParts ||
        !rows.some(
          (visibleRow) =>
            visibleRow.rowType === "pinnedSource" &&
            visibleRow.row.sourceType === pinnedSourceKeyParts.sourceType &&
            visibleRow.row.id === pinnedSourceKeyParts.sourceId,
        )))
  ) {
    return null;
  }

  return rowKey as MyListSortableTodoRowKey;
}

function resolveManualReorderGroupForRow(
  row: MyListManualRow,
  groupKind: Exclude<MyListManualReorderGroup, { kind: "monument" }>["kind"],
): Exclude<MyListManualReorderGroup, { kind: "monument" }> {
  if (groupKind === "day") {
    return { kind: "day", id: row.dayBucketId ?? "anytime" };
  }

  return { kind: "priority", id: row.priorityId };
}

function isManualRowInReorderGroup(
  row: MyListManualRow,
  group: MyListManualReorderGroup,
) {
  if (group.kind === "monument") return false;
  const rowGroup = resolveManualReorderGroupForRow(row, group.kind);
  return rowGroup.id === group.id;
}

function applyManualReorderGroup(
  row: MyListManualRow,
  group: MyListManualReorderGroup | null,
): MyListManualRow {
  if (!group) return row;
  if (group.kind === "monument") return row;

  if (group.kind === "day") {
    const dayBucketId = group.id === "anytime" ? null : group.id;
    return row.dayBucketId === dayBucketId ? row : { ...row, dayBucketId };
  }

  return row.priorityId === group.id ? row : { ...row, priorityId: group.id };
}

function resolvePinnedSourceReorderGroupForRow(
  row: MyListPinnedSourceRow,
  groupKind: Exclude<MyListManualReorderGroup, { kind: "monument" }>["kind"],
  fallbackPriorityId: PriorityBucketId,
): Exclude<MyListManualReorderGroup, { kind: "monument" }> {
  if (groupKind === "day") {
    return { kind: "day", id: row.dayBucketId ?? "anytime" };
  }

  return {
    kind: "priority",
    id: row.priorityId ?? normalizePriority(row.priority ?? fallbackPriorityId),
  };
}

function isPinnedSourceRowInReorderGroup(
  row: MyListPinnedSourceRow,
  group: MyListManualReorderGroup,
  fallbackPriorityId: PriorityBucketId,
) {
  if (group.kind === "monument") return false;
  const rowGroup = resolvePinnedSourceReorderGroupForRow(
    row,
    group.kind,
    fallbackPriorityId,
  );
  return rowGroup.id === group.id;
}

function applyPinnedSourceReorderGroup(
  row: MyListPinnedSourceRow,
  group: MyListManualReorderGroup | null,
): MyListPinnedSourceRow {
  if (!group) return row;
  if (group.kind === "monument") return row;

  if (group.kind === "day") {
    const dayBucketId = group.id === "anytime" ? null : group.id;
    return row.dayBucketId === dayBucketId ? row : { ...row, dayBucketId };
  }

  return row.priorityId === group.id ? row : { ...row, priorityId: group.id };
}

function areManualRowsEquivalent(
  leftRows: MyListManualRow[],
  rightRows: MyListManualRow[],
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
  draggedRowKey: MyListSortableTodoRowKey,
  destination: MyListManualReorderDestination,
) {
  const draggedRowId = readManualRowIdFromSortableKey(draggedRowKey);
  if (!draggedRowId) return currentRows;
  if (draggedRowId === EMPTY_DRAFT_MANUAL_ROW_ID) return currentRows;

  const draggedIndex = currentRows.findIndex((row) => row.id === draggedRowId);
  if (draggedIndex < 0) return currentRows;
  const targetManualRowId = destination.targetRowKey
    ? readManualRowIdFromSortableKey(destination.targetRowKey)
    : null;
  if (targetManualRowId === EMPTY_DRAFT_MANUAL_ROW_ID) return currentRows;
  if (destination.group?.kind === "monument" && !targetManualRowId) {
    return currentRows;
  }

  const draggedRow = applyManualReorderGroup(
    currentRows[draggedIndex],
    destination.group,
  );
  const rowsWithoutDragged = currentRows.filter(
    (row) => row.id !== draggedRowId,
  );
  let insertIndex = rowsWithoutDragged.length;

  if (targetManualRowId) {
    const targetIndex = rowsWithoutDragged.findIndex(
      (row) => row.id === targetManualRowId,
    );
    if (targetIndex < 0) return currentRows;
    insertIndex = targetIndex;
  } else if (destination.group) {
    let lastGroupIndex = -1;
    for (let index = rowsWithoutDragged.length - 1; index >= 0; index -= 1) {
      if (
        isManualRowInReorderGroup(rowsWithoutDragged[index], destination.group)
      ) {
        lastGroupIndex = index;
        break;
      }
    }
    insertIndex =
      lastGroupIndex >= 0 ? lastGroupIndex + 1 : rowsWithoutDragged.length;
  }

  const nextRows = [...rowsWithoutDragged];
  nextRows.splice(insertIndex, 0, draggedRow);
  const normalizedRows = nextRows.map((row) =>
    row.insertAfterRowKey ? { ...row, insertAfterRowKey: null } : row,
  );

  return areManualRowsEquivalent(currentRows, normalizedRows)
    ? currentRows
    : normalizedRows;
}

function arePinnedSourceRowsEquivalent(
  leftRows: MyListPinnedSourceRow[],
  rightRows: MyListPinnedSourceRow[],
) {
  if (leftRows === rightRows) return true;
  if (leftRows.length !== rightRows.length) return false;

  return leftRows.every((leftRow, index) => {
    const rightRow = rightRows[index];
    return (
      rightRow &&
      leftRow.sourceType === rightRow.sourceType &&
      leftRow.id === rightRow.id &&
      leftRow.priorityId === rightRow.priorityId &&
      leftRow.dayBucketId === rightRow.dayBucketId
    );
  });
}

function reorderPinnedSourceRowsForDestination(
  currentRows: MyListPinnedSourceRow[],
  draggedRowKey: MyListSortableTodoRowKey,
  destination: MyListManualReorderDestination,
  fallbackPriorityId: PriorityBucketId,
) {
  const draggedKeyParts = readPinnedSourceRowKeyParts(draggedRowKey);
  if (!draggedKeyParts) {
    return currentRows;
  }

  const draggedIndex = currentRows.findIndex(
    (row) =>
      row.sourceType === draggedKeyParts.sourceType &&
      row.id === draggedKeyParts.sourceId,
  );
  if (draggedIndex < 0) return currentRows;

  const draggedRow = applyPinnedSourceReorderGroup(
    currentRows[draggedIndex],
    destination.group,
  );
  const rowsWithoutDragged = currentRows.filter(
    (row) =>
      row.sourceType !== draggedKeyParts.sourceType ||
      row.id !== draggedKeyParts.sourceId,
  );
  let insertIndex = rowsWithoutDragged.length;
  const targetKeyParts = destination.targetRowKey
    ? readPinnedSourceRowKeyParts(destination.targetRowKey)
    : null;
  if (destination.group?.kind === "monument" && !targetKeyParts) {
    return currentRows;
  }

  if (targetKeyParts) {
    const targetIndex = rowsWithoutDragged.findIndex(
      (row) =>
        row.sourceType === targetKeyParts.sourceType &&
        row.id === targetKeyParts.sourceId,
    );
    if (targetIndex < 0) return currentRows;
    insertIndex = targetIndex;
  } else if (destination.group) {
    let lastGroupIndex = -1;
    for (let index = rowsWithoutDragged.length - 1; index >= 0; index -= 1) {
      if (
        isPinnedSourceRowInReorderGroup(
          rowsWithoutDragged[index],
          destination.group,
          fallbackPriorityId,
        )
      ) {
        lastGroupIndex = index;
        break;
      }
    }
    insertIndex =
      lastGroupIndex >= 0 ? lastGroupIndex + 1 : rowsWithoutDragged.length;
  }

  const nextRows = [...rowsWithoutDragged];
  nextRows.splice(insertIndex, 0, draggedRow);
  return arePinnedSourceRowsEquivalent(currentRows, nextRows)
    ? currentRows
    : nextRows;
}

function MyListManualTodoGroupDropZone({
  group,
  children,
  className,
  dayDropBucketId,
}: {
  group: MyListManualReorderGroup | null;
  children: ReactNode | ((isOver: boolean) => ReactNode);
  className?: string | ((isOver: boolean) => string);
  dayDropBucketId?: MyListDayViewBucketId;
}) {
  const { isOver, setNodeRef } = useDroppable({
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
      className={
        typeof className === "function" ? className(isOver) : className
      }
    >
      {typeof children === "function" ? children(isOver) : children}
    </div>
  );
}

function MyListSortableManualTodoRow({
  rowKey,
  rowType,
  disabled,
  completionExitPhase,
  prefersReducedMotion,
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
    id: rowKey,
    disabled,
    data: {
      type: "manual-row",
      rowType,
      group: reorderGroup,
    } satisfies MyListManualReorderOverData,
  });

  const isCompletionExiting = completionExitPhase === "exiting";

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 30 : undefined,
      }}
      className={clsx("relative", isDragging && "z-30")}
    >
      <motion.div
        initial={false}
        animate={
          isCompletionExiting
            ? {
                height: 0,
                opacity: 0,
                y: prefersReducedMotion
                  ? 0
                  : MY_LIST_COMPLETION_EXIT_TIMING.exitDistancePx,
              }
            : { height: "auto", opacity: 1, y: 0 }
        }
        transition={{
          duration: prefersReducedMotion
            ? 0
            : MY_LIST_COMPLETION_EXIT_TIMING.exitDurationMs / 1000,
          ease: [0.22, 1, 0.36, 1],
        }}
        className={clsx(isCompletionExiting && "overflow-hidden")}
        style={{ transformOrigin: "top" }}
      >
        {children({ attributes, listeners, setActivatorNodeRef, isDragging })}
      </motion.div>
    </div>
  );
}

export function MyListSheet({
  open,
  onOpenChange,
  userId,
  tasks,
  pinnedSourceRows,
  pinnedGoalRows,
  monuments,
  goalMonumentIdsById,
  projectGoalIdsById,
  skills,
  skillCategories,
  pendingTaskIds,
  useFullExpandedHeight,
  enableScheduleTimelineDrag = false,
  onRemovePinnedSource,
  onRemoveTask,
  onTogglePinnedSourceCompletion,
  onTogglePinnedGoalProjectCompletion,
  onCompletePinnedGoal,
  onUpdatePinnedSourceMetadata,
  onReorderPinnedSourceRows,
  onToggleTask,
  onTaskSkillSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId?: string | null;
  tasks: TaskLite[];
  pinnedSourceRows?: MyListPinnedSourceRow[];
  pinnedGoalRows?: MyListPinnedGoalRow[];
  monuments?: MyListMonumentRow[];
  goalMonumentIdsById?: Record<string, string | null>;
  projectGoalIdsById?: Record<string, string | null>;
  skills: SkillRow[];
  skillCategories: CatRow[];
  pendingTaskIds: Set<string>;
  useFullExpandedHeight: boolean;
  enableScheduleTimelineDrag?: boolean;
  onRemovePinnedSource?: (row: MyListPinnedSourceRow) => void;
  onRemoveTask?: (taskId: string) => Promise<boolean> | boolean;
  onTogglePinnedSourceCompletion?: (
    row: MyListPinnedSourceRow,
    completedAt: string | null,
  ) => Promise<boolean> | boolean;
  onTogglePinnedGoalProjectCompletion?: (
    row: MyListPinnedSourceRow,
    checked: boolean,
    sourceRect: CreatorXpBurstRect | null,
  ) => Promise<boolean> | boolean;
  onCompletePinnedGoal?: (
    goal: MyListPinnedGoalRow,
  ) => Promise<boolean> | boolean;
  onUpdatePinnedSourceMetadata?: (
    row: MyListPinnedSourceRow,
    updates: {
      priorityId?: PriorityBucketId | null;
      dayBucketId?: MyListDayBucketId | null;
    },
  ) => void;
  onReorderPinnedSourceRows?: (rows: MyListPinnedSourceRow[]) => void;
  onToggleTask: (
    taskId: string,
    sourceRect: CreatorXpBurstRect | null,
    xpContext: MyListTaskXpContext,
  ) => Promise<boolean> | boolean;
  onTaskSkillSelect: (taskId: string, skill: SkillRow) => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [note, setNote] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeView, setActiveView] = useState<MyListActiveView>(() =>
    readStoredMyListViewModePreference(userId) === "matrix" ? "matrix" : "list",
  );
  const [shouldInitializeMatrixTodo, setShouldInitializeMatrixTodo] =
    useState(false);
  const [matrixSettingsTriggerTarget, setMatrixSettingsTriggerTarget] =
    useState<HTMLDivElement | null>(null);
  const [isDayLensActive, setIsDayLensActive] = useState(
    () => readStoredMyListViewModePreference(userId) === "day",
  );
  const [isMonumentLensActive, setIsMonumentLensActive] = useState(
    () => readStoredMyListViewModePreference(userId) === "monuments",
  );
  const [areCompletedTodosVisible, setAreCompletedTodosVisible] =
    useState(false);
  const [expandedPinnedGoalIds, setExpandedPinnedGoalIds] = useState<
    Set<string>
  >(() => new Set());
  const [creatorDayBoundaryNow, setCreatorDayBoundaryNow] = useState(
    () => new Date(),
  );
  const [manualRows, setManualRows] = useState<MyListManualRow[]>([]);
  const [customLists, setCustomLists] = useState<MyListList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [isListSelectorOpen, setIsListSelectorOpen] = useState(false);
  const [isCreateListOpen, setIsCreateListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [isCreatingList, setIsCreatingList] = useState(false);
  const createListInputRef = useRef<HTMLInputElement | null>(null);
  const [activeSkillPickerRowKey, setActiveSkillPickerRowKey] =
    useState<MyListRowKey | null>(null);
  const [activePriorityPickerRowKey, setActivePriorityPickerRowKey] =
    useState<MyListRowKey | null>(null);
  const [activeDayPickerRowKey, setActiveDayPickerRowKey] =
    useState<MyListRowKey | null>(null);
  const [activeTodoRowKey, setActiveTodoRowKey] = useState<MyListRowKey | null>(
    null,
  );
  const [manualSkillSearch, setManualSkillSearch] = useState("");
  const [pendingDeleteRowId, setPendingDeleteRowId] = useState<string | null>(
    null,
  );
  const [deletingManualRowIds, setDeletingManualRowIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [deletingTaskRowIds, setDeletingTaskRowIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [taskOverrides, setTaskOverrides] = useState<
    Record<string, MyListTaskOverride>
  >({});
  const [pinnedSourceCompletions, setPinnedSourceCompletions] = useState<
    Record<string, string | null>
  >({});
  const pinnedGoalTapStateRef = useRef<
    Record<string, { time: number; wasExpanded: boolean } | null>
  >({});
  const [
    pendingPinnedGoalProjectCompletionIds,
    setPendingPinnedGoalProjectCompletionIds,
  ] = useState<Set<string>>(() => new Set());
  const [completionExitRows, setCompletionExitRows] = useState<
    Partial<Record<MyListSortableTodoRowKey, MyListCompletionExitState>>
  >({});
  const [isScheduleDragActive, setIsScheduleDragActive] = useState(false);
  const [activeManualReorderRowId, setActiveManualReorderRowId] =
    useState<MyListSortableTodoRowKey | null>(null);
  const [activeManualReorderSourceGroup, setActiveManualReorderSourceGroup] =
    useState<MyListManualReorderGroup | null>(null);
  const [dayDragDropBucketId, setDayDragDropBucketId] =
    useState<MyListDayViewBucketId | null>(null);
  const [collapsedDayGroups, setCollapsedDayGroups] = useState<
    Partial<Record<MyListDayViewBucketId, boolean>>
  >({});
  const [collapsedMonumentGroups, setCollapsedMonumentGroups] = useState<
    Record<string, boolean>
  >({});
  const manualReorderCompactDayGroupIdsRef = useRef<Set<MyListDayViewBucketId>>(
    new Set(),
  );
  const [pendingTitleFocusRowId, setPendingTitleFocusRowId] = useState<
    string | null
  >(null);

  const areTodoRowControlsRevealed = useCallback(
    (rowKey: MyListRowKey, isDragging = false) =>
      activeTodoRowKey === rowKey ||
      activeSkillPickerRowKey === rowKey ||
      activePriorityPickerRowKey === rowKey ||
      activeDayPickerRowKey === rowKey ||
      pendingDeleteRowId === rowKey ||
      isDragging,
    [
      activeDayPickerRowKey,
      activePriorityPickerRowKey,
      activeSkillPickerRowKey,
      activeTodoRowKey,
      pendingDeleteRowId,
    ],
  );
  const [keyboardGeometry, setKeyboardGeometry] =
    useState<MyListKeyboardGeometryState>({
      internalBottomInset: 0,
    });
  const [myListSheetHeights, setMyListSheetHeights] = useState(() => ({
    compact: 448,
    expanded: 720,
  }));
  const sheetRootRef = useRef<HTMLElement | null>(null);
  const sheetScrollRef = useRef<HTMLDivElement | null>(null);
  const manualTitleInputRefs = useRef(new Map<string, HTMLInputElement>());
  const manualRowIdCounterRef = useRef(0);
  const manualRowsPersistenceRef = useRef<Promise<void>>(Promise.resolve());
  const deletingManualRowIdsRef = useRef<Set<string>>(new Set());
  const completionExitTimersRef = useRef(
    new Map<MyListSortableTodoRowKey, MyListCompletionExitTimers>(),
  );
  const sheetTouchStartYRef = useRef<number | null>(null);
  const scheduleDragPressRef = useRef<MyListScheduleDragPress | null>(null);
  const manualUpgradePressRef = useRef<MyListManualUpgradePress | null>(null);
  const manualReorderOriginRowsRef = useRef<MyListManualRow[] | null>(null);
  const manualReorderSourceGroupRef = useRef<MyListManualReorderGroup | null>(
    null,
  );
  const manualReorderLastValidDestinationRef =
    useRef<MyListManualReorderDestination | null>(null);
  const editableFocusInsideSheetRef = useRef(false);
  const keyboardSessionBaselineRef =
    useRef<MyListKeyboardSessionBaseline | null>(null);
  const normalViewportMetricsRef = useRef<MyListViewportMetrics | null>(null);
  const keyboardSessionClosingRef = useRef(false);
  const viewportMeasurementFrameRef = useRef<number | null>(null);
  const keyboardCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const orientationSettlementTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const focusVisibilityFrameRef = useRef<number | null>(null);
  const focusVisibilityTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const defaultPriority = resolveQuickCreateMediumPriorityMetadata();
  useEffect(() => {
    setSelectedListId(null);
    setCustomLists([]);
    setIsListSelectorOpen(false);
    setIsCreateListOpen(false);
    if (!userId) return;
    let cancelled = false;
    void loadMyListLists(userId)
      .then((lists) => {
        if (!cancelled) setCustomLists(lists);
      })
      .catch((error) => {
        if (!cancelled) console.error("Failed to load My List lists", error);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  useEffect(() => {
    if (
      selectedListId &&
      !customLists.some((list) => list.id === selectedListId)
    ) {
      setSelectedListId(null);
    }
  }, [customLists, selectedListId]);
  useEffect(() => {
    if (isCreateListOpen) createListInputRef.current?.focus();
  }, [isCreateListOpen]);
  useEffect(() => {
    if (!isListSelectorOpen && !isCreateListOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsListSelectorOpen(false);
      setIsCreateListOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isCreateListOpen, isListSelectorOpen]);
  const manualReorderSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );
  const manualReorderAutoScroll = useMemo(
    () => ({
      enabled: true,
      activator: AutoScrollActivator.Pointer,
      acceleration: 8,
      threshold: { x: 0, y: 0.16 },
      canScroll: (element: Element) => element === sheetScrollRef.current,
    }),
    [],
  );
  const clearCompletionExitTimers = useCallback(
    (rowKey: MyListSortableTodoRowKey) => {
      const timers = completionExitTimersRef.current.get(rowKey);
      if (!timers) return;

      clearTimeout(timers.exit);
      clearTimeout(timers.cleanup);
      completionExitTimersRef.current.delete(rowKey);
    },
    [],
  );
  const cancelCompletionExit = useCallback(
    (rowKey: MyListSortableTodoRowKey) => {
      clearCompletionExitTimers(rowKey);
      setCompletionExitRows((currentRows) => {
        if (!currentRows[rowKey]) return currentRows;

        const nextRows = { ...currentRows };
        delete nextRows[rowKey];
        return nextRows;
      });
    },
    [clearCompletionExitTimers],
  );
  const beginCompletionExit = useCallback(
    (
      rowKey: MyListSortableTodoRowKey,
      completedAt: string,
      visibleRow: MyListVisibleTodoRow,
    ) => {
      clearCompletionExitTimers(rowKey);
      setCompletionExitRows((currentRows) => ({
        ...currentRows,
        [rowKey]: {
          phase: "confirming",
          completedAt,
          visibleRow,
        },
      }));

      const exit = setTimeout(() => {
        setCompletionExitRows((currentRows) => {
          const currentRow = currentRows[rowKey];
          if (!currentRow || currentRow.completedAt !== completedAt) {
            return currentRows;
          }

          return {
            ...currentRows,
            [rowKey]: {
              ...currentRow,
              phase: "exiting",
            },
          };
        });
      }, MY_LIST_COMPLETION_EXIT_TIMING.confirmationPauseMs);

      const cleanupDelay =
        MY_LIST_COMPLETION_EXIT_TIMING.confirmationPauseMs +
        MY_LIST_COMPLETION_EXIT_TIMING.exitDurationMs +
        MY_LIST_COMPLETION_EXIT_TIMING.cleanupBufferMs;
      const cleanup = setTimeout(() => {
        setCompletionExitRows((currentRows) => {
          const currentRow = currentRows[rowKey];
          if (!currentRow || currentRow.completedAt !== completedAt) {
            return currentRows;
          }

          const nextRows = { ...currentRows };
          delete nextRows[rowKey];
          return nextRows;
        });
        completionExitTimersRef.current.delete(rowKey);
      }, cleanupDelay);

      completionExitTimersRef.current.set(rowKey, { exit, cleanup });
    },
    [clearCompletionExitTimers],
  );
  useEffect(() => {
    const completionExitTimers = completionExitTimersRef.current;
    return () => {
      completionExitTimers.forEach((timers) => {
        clearTimeout(timers.exit);
        clearTimeout(timers.cleanup);
      });
      completionExitTimers.clear();
    };
  }, []);
  const manualReorderCollisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const activeData = readManualReorderOverData(args.active.data.current);
      const activeGroup =
        activeData?.type === "manual-row" ? activeData.group : null;

      if (!isMonumentLensActive || activeGroup?.kind !== "monument") {
        return closestCenter(args);
      }

      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((container) => {
          const containerData = readManualReorderOverData(
            container.data.current,
          );
          return (
            containerData?.type === "manual-row" &&
            areManualReorderGroupsEqual(activeGroup, containerData.group)
          );
        }),
      });
    },
    [isMonumentLensActive],
  );
  const applyMyListViewModePreference = useCallback(
    (preference: MyListViewModePreference) => {
      if (preference === "matrix") {
        setActiveView("matrix");
        return;
      }

      setActiveView("list");
      setIsDayLensActive(preference === "day");
      setIsMonumentLensActive(preference === "monuments");
    },
    [],
  );
  const selectMyListViewModePreference = useCallback(
    (preference: MyListViewModePreference) => {
      writeStoredMyListViewModePreference(userId, preference);
      applyMyListViewModePreference(preference);
    },
    [applyMyListViewModePreference, userId],
  );
  const creatorDayBoundary = useMemo(() => {
    return {
      currentStart: getCurrentLocalCreatorDayStart(creatorDayBoundaryNow),
      nextRollover: getNextLocalCreatorDayRollover(creatorDayBoundaryNow),
    };
  }, [creatorDayBoundaryNow]);
  const selectedList = customLists.find((list) => list.id === selectedListId);
  const isDefaultMyList = selectedListId === null;
  const selectedListName = selectedList?.name ?? "My List";
  const isSelectedGroceryList =
    selectedList?.systemKey === MY_LIST_GROCERY_SYSTEM_KEY;
  const manualRowInputPlaceholder = isSelectedGroceryList
    ? "Add item"
    : "To-do";
  const manualRowInputAriaLabel = isSelectedGroceryList
    ? "Grocery item"
    : "To-do text";
  const visibleTasks = useMemo(
    () => (isDefaultMyList ? tasks : []),
    [isDefaultMyList, tasks],
  );
  const activeVisibleTasks = useMemo(
    () =>
      visibleTasks.filter(
        (task) =>
          task.stage?.toString().toUpperCase() !== "PERFECT" ||
          Boolean(completionExitRows[`task:${task.id}`]),
      ),
    [completionExitRows, visibleTasks],
  );
  const visiblePinnedSourceRows = useMemo(
    () => (isDefaultMyList ? sanitizePinnedSourceRows(pinnedSourceRows) : []),
    [isDefaultMyList, pinnedSourceRows],
  );
  const visiblePinnedGoalRows = useMemo(
    () =>
      isDefaultMyList
        ? (pinnedGoalRows ?? []).filter(
            (row) => row.sourceType === "GOAL" && row.id && row.title,
          )
        : [],
    [isDefaultMyList, pinnedGoalRows],
  );
  const groupablePinnedSourceRows = useMemo(
    () => visiblePinnedSourceRows,
    [visiblePinnedSourceRows],
  );
  const activeManualRows = useMemo(
    () =>
      manualRows.filter((row) => row.listId === selectedListId && !row.done),
    [manualRows, selectedListId],
  );
  const hasListRows =
    activeVisibleTasks.length > 0 ||
    groupablePinnedSourceRows.length > 0 ||
    activeManualRows.length > 0 ||
    (isMonumentLensActive &&
      (monuments?.some((monument) => monument.id.trim()) ?? false)) ||
    open;
  const visibleListRowCount =
    activeVisibleTasks.length +
    groupablePinnedSourceRows.length +
    activeManualRows.length +
    (open ? 1 : 0);
  const visibleManualRows = useMemo(
    () =>
      open
        ? [
            ...manualRows.filter((row) => row.listId === selectedListId),
            createManualRow(
              EMPTY_DRAFT_MANUAL_ROW_ID,
              defaultPriority.id,
              selectedListId,
            ),
          ]
        : manualRows.filter((row) => row.listId === selectedListId),
    [defaultPriority.id, manualRows, open, selectedListId],
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
    [visibleManualRows],
  );
  const visibleTodoRows = useMemo<MyListVisibleTodoRow[]>(() => {
    const rows: MyListVisibleTodoRow[] = [];
    const renderedManualRowIds = new Set<string>();
    const renderedRowKeys = new Set<MyListSortableTodoRowKey>();
    const pushRow = (visibleRow: MyListVisibleTodoRow) => {
      rows.push(visibleRow);
      const rowKey = getSortableTodoRowKey(visibleRow);
      if (rowKey) {
        renderedRowKeys.add(rowKey);
      }
    };

    const appendAnchoredManualRows = (anchorKey: MyListRowKey) => {
      const anchoredRows = visibleManualRowsByAnchor.get(anchorKey) ?? [];

      anchoredRows.forEach((row) => {
        if (renderedManualRowIds.has(row.id)) return;

        renderedManualRowIds.add(row.id);
        pushRow({ rowType: "manual", row });
        appendAnchoredManualRows(`manual:${row.id}`);
      });
    };

    visibleTasks.forEach((task) => {
      pushRow({ rowType: "task", task });
      appendAnchoredManualRows(`task:${task.id}`);
    });

    groupablePinnedSourceRows.forEach((row) => {
      pushRow({ rowType: "pinnedSource", row });
    });

    unanchoredVisibleManualRows.forEach((row) => {
      if (renderedManualRowIds.has(row.id)) return;

      renderedManualRowIds.add(row.id);
      pushRow({ rowType: "manual", row });
      appendAnchoredManualRows(`manual:${row.id}`);
    });

    visibleManualRows.forEach((row) => {
      if (renderedManualRowIds.has(row.id)) return;

      renderedManualRowIds.add(row.id);
      pushRow({ rowType: "manual", row });
    });

    Object.entries(completionExitRows).forEach(([rowKey, exitState]) => {
      if (
        !exitState ||
        renderedRowKeys.has(rowKey as MyListSortableTodoRowKey)
      ) {
        return;
      }
      if (!isDefaultMyList) {
        if (
          exitState.visibleRow.rowType !== "manual" ||
          exitState.visibleRow.row.listId !== selectedListId
        )
          return;
      }

      pushRow(exitState.visibleRow);
    });

    return rows;
  }, [
    completionExitRows,
    isDefaultMyList,
    selectedListId,
    unanchoredVisibleManualRows,
    visibleManualRows,
    visibleManualRowsByAnchor,
    groupablePinnedSourceRows,
    visibleTasks,
  ]);
  useEffect(() => {
    setPinnedSourceCompletions((currentCompletions) => {
      const nextCompletions = { ...currentCompletions };
      let changed = false;

      groupablePinnedSourceRows.forEach((row) => {
        const completionKey = `${row.sourceType}:${row.id}`;
        const nextCompletedAt = row.completedAt ?? null;
        if (nextCompletions[completionKey] !== nextCompletedAt) {
          nextCompletions[completionKey] = nextCompletedAt;
          changed = true;
        }
      });

      return changed ? nextCompletions : currentCompletions;
    });
  }, [groupablePinnedSourceRows]);

  const activeTodoRows = useMemo(
    () =>
      visibleTodoRows.filter((visibleRow) => {
        const rowKey = getSortableTodoRowKey(visibleRow);
        if (rowKey && completionExitRows[rowKey]) {
          return true;
        }

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
          override && "completedAt" in override,
        );
        const done = hasCompletionOverride
          ? Boolean(override?.completedAt)
          : visibleRow.task.stage?.toString().toUpperCase() === "PERFECT";
        return !done;
      }),
    [
      completionExitRows,
      pinnedSourceCompletions,
      taskOverrides,
      visibleTodoRows,
    ],
  );
  const completedTodoRows = useMemo(
    () =>
      visibleTodoRows.filter((visibleRow) => {
        const rowKey = getSortableTodoRowKey(visibleRow);
        if (rowKey && completionExitRows[rowKey]) {
          return false;
        }

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
            override && "completedAt" in override,
          );
          done = hasCompletionOverride
            ? Boolean(override?.completedAt)
            : visibleRow.task.stage?.toString().toUpperCase() === "PERFECT";
          completedAt = hasCompletionOverride
            ? (override?.completedAt ?? null)
            : readCompletedAtFromUnknown(visibleRow.task);
        }

        return (
          done &&
          isCompletedAtInCurrentLocalCreatorDay(
            completedAt,
            creatorDayBoundary.currentStart,
            creatorDayBoundary.nextRollover,
          )
        );
      }),
    [
      creatorDayBoundary.currentStart,
      creatorDayBoundary.nextRollover,
      completionExitRows,
      pinnedSourceCompletions,
      taskOverrides,
      visibleTodoRows,
    ],
  );
  const completedTodoCount = completedTodoRows.length;
  const completedRevealRowCount = areCompletedTodosVisible
    ? completedTodoCount
    : 0;
  const skillLookup = useMemo(
    () => new Map(skills.map((skill) => [skill.id, skill])),
    [skills],
  );
  const monumentRows = useMemo(
    () =>
      (monuments ?? [])
        .filter((monument) => monument.id.trim())
        .map((monument) => ({
          ...monument,
          id: monument.id.trim(),
          title: monument.title.trim() || "Untitled Monument",
          emoji: monument.emoji?.trim() || null,
          priorityRank:
            typeof monument.priorityRank === "number" &&
            Number.isFinite(monument.priorityRank)
              ? monument.priorityRank
              : null,
        })),
    [monuments],
  );
  const monumentById = useMemo(
    () => new Map(monumentRows.map((monument) => [monument.id, monument])),
    [monumentRows],
  );
  const goalMonumentIdLookup = useMemo(
    () => new Map(Object.entries(goalMonumentIdsById ?? {})),
    [goalMonumentIdsById],
  );
  const projectGoalIdLookup = useMemo(
    () => new Map(Object.entries(projectGoalIdsById ?? {})),
    [projectGoalIdsById],
  );
  const persistManualRows = useCallback(
    (rows: MyListManualRow[]) => {
      writeStoredMyListManualRows(rows, defaultPriority.id);
      if (userId) {
        const nextPersistence = manualRowsPersistenceRef.current
          .catch(() => undefined)
          .then(() => {
            const rowsToPersist = rows.filter(
              (row) => !deletingManualRowIdsRef.current.has(row.id),
            );
            return replaceManualMyListItems({
              userId,
              rows: rowsToPersist,
            });
          });
        manualRowsPersistenceRef.current = nextPersistence;
        void nextPersistence.catch((error) => {
          console.error("Failed to persist My List manual rows", error);
        });
        return nextPersistence;
      }
      return Promise.resolve();
    },
    [defaultPriority.id, userId],
  );
  const updateManualRowsWithPersistence = useCallback(
    (updater: (currentRows: MyListManualRow[]) => MyListManualRow[]) => {
      setManualRows((currentRows) => {
        const nextRows = updater(currentRows);
        persistManualRows(nextRows);
        return nextRows;
      });
    },
    [persistManualRows],
  );
  const removePersistedManualRowFromLocalState = useCallback(
    (rowId: string) => {
      const normalizedRowId = rowId.trim();
      if (!normalizedRowId) return;

      setManualRows((currentRows) => {
        if (!currentRows.some((row) => row.id === normalizedRowId)) {
          return currentRows;
        }

        const nextRows = currentRows.filter(
          (row) => row.id !== normalizedRowId,
        );
        persistManualRows(nextRows);
        return nextRows;
      });
      setActiveSkillPickerRowKey((currentRowKey) =>
        currentRowKey === `manual:${normalizedRowId}` ? null : currentRowKey,
      );
      setActivePriorityPickerRowKey((currentRowKey) =>
        currentRowKey === `manual:${normalizedRowId}` ? null : currentRowKey,
      );
      setActiveDayPickerRowKey((currentRowKey) =>
        currentRowKey === `manual:${normalizedRowId}` ? null : currentRowKey,
      );
      setPendingDeleteRowId((currentRowKey) =>
        currentRowKey === `manual:${normalizedRowId}` ? null : currentRowKey,
      );
    },
    [persistManualRows],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleManualItemConsumed = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as Partial<MyListManualItemConsumedDetail>;
      if (detail.origin !== "manual-my-list-upgrade") return;
      const consumedUserId =
        typeof detail.userId === "string" ? detail.userId.trim() : "";
      if (userId && consumedUserId && consumedUserId !== userId) return;
      const itemId =
        typeof detail.itemId === "string" ? detail.itemId.trim() : "";
      if (!itemId) return;

      removePersistedManualRowFromLocalState(itemId);
    };

    window.addEventListener(
      MY_LIST_MANUAL_ITEM_CONSUMED_EVENT,
      handleManualItemConsumed,
    );
    return () => {
      window.removeEventListener(
        MY_LIST_MANUAL_ITEM_CONSUMED_EVENT,
        handleManualItemConsumed,
      );
    };
  }, [removePersistedManualRowFromLocalState, userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleManualItemCreated = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as Partial<MyListManualItemCreatedDetail>;
      if (detail.origin !== "manual-my-list-create") return;
      const createdUserId =
        typeof detail.userId === "string" ? detail.userId.trim() : "";
      if (userId && createdUserId && createdUserId !== userId) return;

      const nextRow = sanitizeMyListManualRow(detail.item, defaultPriority.id);
      if (!nextRow) return;

      setManualRows((currentRows) => {
        if (currentRows.some((row) => row.id === nextRow.id)) {
          return currentRows;
        }
        const nextRows = [...currentRows, nextRow];
        persistManualRows(nextRows);
        return nextRows;
      });
    };

    window.addEventListener(
      MY_LIST_MANUAL_ITEM_CREATED_EVENT,
      handleManualItemCreated,
    );
    return () => {
      window.removeEventListener(
        MY_LIST_MANUAL_ITEM_CREATED_EVENT,
        handleManualItemCreated,
      );
    };
  }, [defaultPriority.id, persistManualRows, userId]);

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
        const sanitizedRows = sanitizeMyListManualRows(
          rows,
          defaultPriority.id,
        );
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
      getNextLocalCreatorDayRollover(now).getTime() - now.getTime(),
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
    [],
  );

  const resolveTaskPriorityId = useCallback(
    (task: TaskLite): PriorityBucketId => {
      const overridePriority = taskOverrides[task.id]?.priorityId;
      if (overridePriority) return overridePriority;
      if (task.priority?.trim()) return normalizePriority(task.priority);
      return defaultPriority.id;
    },
    [defaultPriority.id, taskOverrides],
  );

  const resolveTaskPriorityGroupId = useCallback(
    (task: TaskLite): PriorityBucketId => {
      const overridePriority = taskOverrides[task.id]?.priorityId;
      if (overridePriority) return overridePriority;
      if (task.priority?.trim()) return normalizePriority(task.priority);
      return "NO";
    },
    [taskOverrides],
  );

  const resolveTaskDayBucketId = useCallback(
    (task: TaskLite): MyListDayBucketId | null => {
      const override = taskOverrides[task.id];
      if (override && "dayBucketId" in override) {
        return override.dayBucketId ?? null;
      }

      return readMyListDayBucketFromUnknown(task);
    },
    [taskOverrides],
  );

  const resolveVisibleRowDayBucketId = useCallback(
    (visibleRow: MyListVisibleTodoRow): MyListDayBucketId | null =>
      visibleRow.rowType === "manual"
        ? visibleRow.row.dayBucketId
        : visibleRow.rowType === "pinnedSource"
          ? (visibleRow.row.dayBucketId ?? null)
          : resolveTaskDayBucketId(visibleRow.task),
    [resolveTaskDayBucketId],
  );

  const resolveVisibleRowPriorityGroupId = useCallback(
    (visibleRow: MyListVisibleTodoRow): PriorityBucketId =>
      visibleRow.rowType === "manual"
        ? visibleRow.row.priorityId
        : visibleRow.rowType === "pinnedSource"
          ? (visibleRow.row.priorityId ??
            normalizePriority(visibleRow.row.priority ?? defaultPriority.id))
          : resolveTaskPriorityGroupId(visibleRow.task),
    [defaultPriority.id, resolveTaskPriorityGroupId],
  );

  const resolveTaskSkillMetadata = useCallback(
    (task: TaskLite) => {
      const override = taskOverrides[task.id];
      const overrideSkillId = override?.skillId;
      const sourceSkillId =
        overrideSkillId !== undefined
          ? overrideSkillId
          : (task.skill_id ?? null);
      const skill = sourceSkillId
        ? (skillLookup.get(sourceSkillId) ?? null)
        : null;
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
    [skillLookup, taskOverrides],
  );

  const resolveProjectMonumentId = useCallback(
    (projectId?: string | null): string | null => {
      const goalId = projectId ? projectGoalIdLookup.get(projectId) : null;
      return goalId ? (goalMonumentIdLookup.get(goalId) ?? null) : null;
    },
    [goalMonumentIdLookup, projectGoalIdLookup],
  );

  const resolveVisibleRowMonumentMetadata = useCallback(
    (
      visibleRow: MyListVisibleTodoRow,
    ): {
      monumentId: string | null;
      label?: string | null;
      icon?: string | null;
    } => {
      if (visibleRow.rowType === "manual") {
        const skill = visibleRow.row.skillId
          ? (skillLookup.get(visibleRow.row.skillId) ?? null)
          : null;
        return { monumentId: skill?.monument_id ?? null };
      }

      if (visibleRow.rowType === "task") {
        const taskRecord = visibleRow.task as TaskLite & {
          monument_id?: string | null;
          monumentId?: string | null;
        };
        const directMonumentId =
          readTrimmedString(taskRecord.monumentId) ??
          readTrimmedString(taskRecord.monument_id);
        const goalMonumentId = visibleRow.task.goal_id
          ? (goalMonumentIdLookup.get(visibleRow.task.goal_id) ?? null)
          : null;
        const projectMonumentId = resolveProjectMonumentId(
          visibleRow.task.project_id,
        );
        const skill = visibleRow.task.skill_id
          ? (skillLookup.get(visibleRow.task.skill_id) ?? null)
          : null;

        return {
          monumentId:
            directMonumentId ??
            goalMonumentId ??
            projectMonumentId ??
            skill?.monument_id ??
            visibleRow.task.skill_monument_id ??
            null,
        };
      }

      const row = visibleRow.row;
      const directMonumentId = row.monumentId ?? null;
      const goalMonumentId = row.goalId
        ? (goalMonumentIdLookup.get(row.goalId) ?? null)
        : null;
      const projectMonumentId =
        row.projectId || row.sourceType === "PROJECT"
          ? resolveProjectMonumentId(row.projectId ?? row.id)
          : null;
      const skill = row.skillId ? (skillLookup.get(row.skillId) ?? null) : null;

      return {
        monumentId:
          directMonumentId ??
          (row.sourceType === "GOAL"
            ? (goalMonumentIdLookup.get(row.id) ?? null)
            : null) ??
          goalMonumentId ??
          projectMonumentId ??
          row.skillMonumentId ??
          skill?.monument_id ??
          null,
        label: row.monumentName ?? null,
        icon: row.monumentIcon ?? null,
      };
    },
    [goalMonumentIdLookup, resolveProjectMonumentId, skillLookup],
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
    [defaultPriority],
  );

  const visibleTodoGroups = useMemo(() => {
    if (isMonumentLensActive) {
      const groupsByMonumentId = new Map<string, MyListMonumentGroup>();
      const fallbackGroup: MyListMonumentGroup = {
        id: MY_LIST_NO_MONUMENT_GROUP_ID,
        label: MY_LIST_NO_MONUMENT_GROUP_LABEL,
        rows: [],
      };

      monumentRows.forEach((monument) => {
        groupsByMonumentId.set(monument.id, {
          id: monument.id,
          label: monument.title,
          icon: monument.emoji,
          rows: [],
        });
      });

      activeTodoRows.forEach((visibleRow) => {
        const metadata = resolveVisibleRowMonumentMetadata(visibleRow);
        const monumentId = metadata.monumentId;
        if (!monumentId) {
          fallbackGroup.rows.push(visibleRow);
          return;
        }

        const monument = monumentById.get(monumentId);
        const group = groupsByMonumentId.get(monumentId) ?? {
          id: monumentId,
          label:
            monument?.title ?? metadata.label?.trim() ?? "Untitled Monument",
          icon: monument?.emoji ?? metadata.icon?.trim() ?? null,
          rows: [],
        };

        group.rows.push(visibleRow);
        groupsByMonumentId.set(monumentId, group);
      });

      return [
        ...Array.from(groupsByMonumentId.values()),
        ...(fallbackGroup.rows.length > 0 ? [fallbackGroup] : []),
      ];
    }

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
          resolveVisibleRowPriorityGroupId(visibleRow) === priorityId,
      ),
    })).filter((group) => group.rows.length > 0);
  }, [
    activeTodoRows,
    isDayLensActive,
    isMonumentLensActive,
    monumentById,
    monumentRows,
    resolveVisibleRowMonumentMetadata,
    resolveVisibleRowDayBucketId,
    resolveVisibleRowPriorityGroupId,
  ]);
  const lensGroupLayoutSections = useMemo(() => {
    if (!isDayLensActive && !isMonumentLensActive) {
      return visibleTodoGroups.map((group) => ({
        sectionType: "group" as const,
        group,
      }));
    }

    const sections: Array<
      | {
          sectionType: "group";
          group: (typeof visibleTodoGroups)[number];
        }
      | {
          sectionType: "compact-day-groups";
          groups: (typeof visibleTodoGroups)[number][];
        }
      | {
          sectionType: "compact-empty-monument-groups";
          groups: (typeof visibleTodoGroups)[number][];
        }
    > = [];

    if (isMonumentLensActive) {
      const emptyMonumentGroups: (typeof visibleTodoGroups)[number][] = [];

      visibleTodoGroups.forEach((group) => {
        if (
          group.id !== MY_LIST_NO_MONUMENT_GROUP_ID &&
          group.rows.length === 0
        ) {
          emptyMonumentGroups.push(group);
          return;
        }

        const collapsedPreference = collapsedMonumentGroups[group.id];
        const isExpanded =
          collapsedPreference === false ||
          (collapsedPreference === undefined && group.rows.length > 0);

        if (isExpanded) {
          sections.push({ sectionType: "group", group });
          return;
        }

        const previousSection = sections.at(-1);
        if (previousSection?.sectionType === "compact-day-groups") {
          previousSection.groups.push(group);
        } else {
          sections.push({ sectionType: "compact-day-groups", groups: [group] });
        }
      });

      if (emptyMonumentGroups.length > 0) {
        sections.push({
          sectionType: "compact-empty-monument-groups",
          groups: emptyMonumentGroups,
        });
      }

      return sections;
    }

    visibleTodoGroups.forEach((group) => {
      const bucketId = group.id as MyListDayViewBucketId;
      const collapsedPreference = collapsedDayGroups[bucketId];
      const wasCompactWhenManualDragStarted =
        isDayLensActive &&
        activeManualReorderRowId !== null &&
        manualReorderCompactDayGroupIdsRef.current.has(bucketId);
      const isExpanded =
        !wasCompactWhenManualDragStarted &&
        (collapsedPreference === false ||
          (collapsedPreference === undefined && group.rows.length > 0));

      if (isExpanded) {
        sections.push({ sectionType: "group", group });
        return;
      }

      const previousSection = sections.at(-1);
      if (previousSection?.sectionType === "compact-day-groups") {
        previousSection.groups.push(group);
      } else {
        sections.push({ sectionType: "compact-day-groups", groups: [group] });
      }
    });

    return sections;
  }, [
    activeManualReorderRowId,
    collapsedDayGroups,
    collapsedMonumentGroups,
    isMonumentLensActive,
    isDayLensActive,
    visibleTodoGroups,
  ]);
  const todoListSections = useMemo(
    () => [
      ...lensGroupLayoutSections,
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
    [completedTodoCount, completedTodoRows, lensGroupLayoutSections],
  );
  const manualReorderItemIds = useMemo(() => {
    if (
      isMonumentLensActive &&
      activeManualReorderSourceGroup?.kind === "monument"
    ) {
      const sourceGroup = visibleTodoGroups.find(
        (group) => group.id === activeManualReorderSourceGroup.id,
      );
      const sourceGroupRowIds =
        sourceGroup?.rows
          .map(getSortableTodoRowKey)
          .filter((rowKey): rowKey is MyListSortableTodoRowKey =>
            Boolean(rowKey),
          ) ?? [];

      return sourceGroupRowIds.length > 0
        ? sourceGroupRowIds
        : activeManualReorderRowId
          ? [activeManualReorderRowId]
          : [];
    }

    return visibleTodoRows
      .map(getSortableTodoRowKey)
      .filter((rowKey): rowKey is MyListSortableTodoRowKey => Boolean(rowKey));
  }, [
    activeManualReorderRowId,
    activeManualReorderSourceGroup,
    isMonumentLensActive,
    visibleTodoGroups,
    visibleTodoRows,
  ]);
  const listContentHeight =
    LIST_COMPACT_HEADER_ALLOWANCE +
    (visibleListRowCount +
      (completedTodoCount > 0 ? 1 : 0) +
      completedRevealRowCount) *
      LIST_COMPACT_ROW_HEIGHT +
    (isDayLensActive
      ? MY_LIST_DAY_VIEW_BUCKETS.length
      : isMonumentLensActive
        ? (monuments?.length ?? 0) + 1
        : PRIORITY_ORDER.length) *
      LIST_COMPACT_GROUP_HEADER_HEIGHT +
    LIST_COMPACT_NOTES_ALLOWANCE +
    LIST_COMPACT_BOTTOM_ALLOWANCE;
  const listCompactHeight = Math.min(
    Math.max(myListSheetHeights.compact, listContentHeight),
    myListSheetHeights.expanded,
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
  const intendedCurrentSheetHeight = clampMyListSheetHeight(
    rawCurrentSheetHeight,
    editableFocusInsideSheetRef.current
      ? MY_LIST_MIN_EDITABLE_SHEET_HEIGHT
      : MY_LIST_MIN_SAFE_SHEET_HEIGHT,
  );
  const currentSheetHeight = intendedCurrentSheetHeight;

  const canStartScheduleTimelineDrag =
    open && activeView === "list" && enableScheduleTimelineDrag;
  const canStartTodoRowLongPress =
    open &&
    activeView === "list" &&
    (enableScheduleTimelineDrag || isDayLensActive);

  const assignDayBucketToRow = useCallback(
    (
      rowId: string,
      rowType: "manual" | "task" | "pinnedSource",
      dayBucketId: MyListDayViewBucketId,
      pinnedSourceRow?: MyListPinnedSourceRow,
    ) => {
      const nextDayBucketId = dayBucketId === "anytime" ? null : dayBucketId;
      const currentRowKey =
        rowType === "pinnedSource" && pinnedSourceRow
          ? buildPinnedSourceRowKey(pinnedSourceRow.sourceType, rowId)
          : `${rowType}:${rowId}`;

      setPendingDeleteRowId((currentRowId) =>
        currentRowId === currentRowKey ? null : currentRowId,
      );

      if (rowType === "pinnedSource" && pinnedSourceRow) {
        onUpdatePinnedSourceMetadata?.(pinnedSourceRow, {
          dayBucketId: nextDayBucketId,
        });
      } else if (rowType === "manual") {
        updateManualRowsWithPersistence((currentRows) =>
          currentRows.map((row) =>
            row.id === rowId ? { ...row, dayBucketId: nextDayBucketId } : row,
          ),
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
    [onUpdatePinnedSourceMetadata, updateManualRowsWithPersistence],
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
    return Boolean(
      target instanceof HTMLElement &&
      target.closest(MY_LIST_SCHEDULE_DRAG_BLOCKED_TARGET_SELECTOR),
    );
  }, []);

  const shouldIgnoreManualUpgradeTarget = useCallback((target: EventTarget) => {
    return Boolean(
      target instanceof HTMLElement &&
      target.closest(MY_LIST_MANUAL_UPGRADE_BLOCKED_TARGET_SELECTOR),
    );
  }, []);

  const removeManualUpgradeDomSelectionRanges = useCallback(() => {
    if (typeof window === "undefined") return;
    const windowSelection = window.getSelection?.() ?? null;
    const documentSelection = document.getSelection?.() ?? null;

    windowSelection?.removeAllRanges();
    if (documentSelection && documentSelection !== windowSelection) {
      documentSelection.removeAllRanges();
    }
  }, []);

  const collapseManualUpgradeInputSelection = useCallback(
    (input: HTMLInputElement) => {
      const textLength = input.value.length;
      try {
        input.setSelectionRange(textLength, textLength);
      } catch {
        // Some input types may reject selection APIs.
      }
    },
    [],
  );

  const suppressManualUpgradeSelection = useCallback(() => {
    if (typeof window === "undefined") return;
    removeManualUpgradeDomSelectionRanges();
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLInputElement &&
      sheetRootRef.current?.contains(activeElement)
    ) {
      collapseManualUpgradeInputSelection(activeElement);
    }
  }, [
    collapseManualUpgradeInputSelection,
    removeManualUpgradeDomSelectionRanges,
  ]);

  const clearManualUpgradeNativeSelection = useCallback(
    (press: MyListManualUpgradePress) => {
      if (typeof document === "undefined") return;

      const sourceInput = manualTitleInputRefs.current.get(press.rowId) ?? null;
      const activeElement = document.activeElement;
      const activeManualInput =
        activeElement instanceof HTMLInputElement &&
        activeElement.closest("[data-my-list-manual-upgrade-row]")
          ? activeElement
          : null;
      const inputToRelease = sourceInput ?? activeManualInput;

      removeManualUpgradeDomSelectionRanges();
      if (inputToRelease) {
        collapseManualUpgradeInputSelection(inputToRelease);
        inputToRelease.blur();
      }
      removeManualUpgradeDomSelectionRanges();
    },
    [
      collapseManualUpgradeInputSelection,
      removeManualUpgradeDomSelectionRanges,
    ],
  );

  const clearManualUpgradePress = useCallback(() => {
    const press = manualUpgradePressRef.current;
    if (press) {
      clearTimeout(press.timer);
    }
    manualUpgradePressRef.current = null;
  }, []);

  const cancelTodoRowPressesForCheckbox = useCallback(() => {
    clearScheduleDragPress();
    clearManualUpgradePress();
  }, [clearManualUpgradePress, clearScheduleDragPress]);

  const stopMyListCheckboxInteraction = useCallback(
    (
      event:
        | ReactPointerEvent<HTMLElement>
        | ReactTouchEvent<HTMLElement>
        | ReactMouseEvent<HTMLElement>,
    ) => {
      cancelTodoRowPressesForCheckbox();
      event.stopPropagation();
    },
    [cancelTodoRowPressesForCheckbox],
  );

  const togglePinnedGoalExpanded = useCallback((goalId: string) => {
    setExpandedPinnedGoalIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(goalId)) nextIds.delete(goalId);
      else nextIds.add(goalId);
      return nextIds;
    });
  }, []);

  const handlePinnedGoalRowClick = useCallback(
    (
      event: ReactMouseEvent<HTMLButtonElement>,
      goal: MyListPinnedGoalRow,
      expanded: boolean,
    ) => {
      if (isPinnedGoalCompleted(goal) || !onCompletePinnedGoal) {
        togglePinnedGoalExpanded(goal.id);
        return;
      }

      const now = Date.now();
      const lastTap = pinnedGoalTapStateRef.current[goal.id] ?? null;
      const isDoubleTap =
        event.detail > 1 ||
        (lastTap !== null &&
          now - lastTap.time <= MY_LIST_GOAL_ROW_DOUBLE_TAP_MS);

      if (isDoubleTap) {
        pinnedGoalTapStateRef.current[goal.id] = null;
        event.preventDefault();
        event.stopPropagation();
        setExpandedPinnedGoalIds((currentIds) => {
          const nextIds = new Set(currentIds);
          if (lastTap?.wasExpanded) nextIds.add(goal.id);
          else nextIds.delete(goal.id);
          return nextIds;
        });
        void onCompletePinnedGoal(goal);
        return;
      }

      pinnedGoalTapStateRef.current[goal.id] = {
        time: now,
        wasExpanded: expanded,
      };
      window.setTimeout(() => {
        if (pinnedGoalTapStateRef.current[goal.id]?.time === now) {
          pinnedGoalTapStateRef.current[goal.id] = null;
        }
      }, MY_LIST_GOAL_ROW_DOUBLE_TAP_MS);
      togglePinnedGoalExpanded(goal.id);
    },
    [onCompletePinnedGoal, togglePinnedGoalExpanded],
  );

  const activateTodoRowFromPointer = useCallback(
    (event: ReactPointerEvent<HTMLElement>, rowKey: MyListRowKey) => {
      if (isMyListCheckboxTarget(event.target)) {
        cancelTodoRowPressesForCheckbox();
        return;
      }

      setActiveTodoRowKey(rowKey);
    },
    [cancelTodoRowPressesForCheckbox],
  );

  const activateTodoRowFromFocus = useCallback(
    (event: ReactFocusEvent<HTMLElement>, rowKey: MyListRowKey) => {
      if (isMyListCheckboxTarget(event.target)) return;
      setActiveTodoRowKey(rowKey);
    },
    [],
  );

  const commitManualUpgradePress = useCallback(
    (press: MyListManualUpgradePress) => {
      if (
        manualUpgradePressRef.current !== press ||
        !press.triggered ||
        press.committed ||
        !press.pendingDetail ||
        typeof window === "undefined"
      ) {
        return;
      }

      press.committed = true;
      clearManualUpgradeNativeSelection(press);

      setActiveSkillPickerRowKey(null);
      setActivePriorityPickerRowKey(null);
      setActiveDayPickerRowKey(null);
      setPendingDeleteRowId(null);
      onOpenChange(false);

      window.dispatchEvent(
        new CustomEvent(MY_LIST_OPEN_QUICK_CREATE_TASK_DETAILS_EVENT, {
          detail: press.pendingDetail,
        }),
      );
      clearManualUpgradePress();
    },
    [clearManualUpgradeNativeSelection, clearManualUpgradePress, onOpenChange],
  );

  const recognizeManualUpgradePress = useCallback(
    (press: MyListManualUpgradePress) => {
      if (manualUpgradePressRef.current !== press) return;
      const title = press.title.trim();
      if (!title || typeof window === "undefined") {
        clearManualUpgradePress();
        return;
      }

      press.triggered = true;
      press.pendingDetail = {
        title,
        skillId: press.skillId,
        priority: press.priorityId,
        energy: "MEDIUM",
        origin: "manual-my-list-upgrade",
        sourceManualMyListItemId: press.rowId,
      };
      clearManualUpgradeNativeSelection(press);
      if (press.inputType === "pointer" && press.pointerType === "mouse") {
        commitManualUpgradePress(press);
      }
    },
    [
      clearManualUpgradeNativeSelection,
      clearManualUpgradePress,
      commitManualUpgradePress,
    ],
  );

  const startManualUpgradePointerPress = useCallback(
    (event: ReactPointerEvent<HTMLElement>, row: MyListManualRow) => {
      if (!open || activeView !== "list") return;
      if (event.button !== 0) return;
      if (shouldIgnoreManualUpgradeTarget(event.target)) return;
      const title = row.text.trim();
      if (!title) return;

      if (event.pointerType !== "mouse") {
        event.preventDefault();
      }
      suppressManualUpgradeSelection();
      clearManualUpgradePress();
      const press: MyListManualUpgradePress = {
        inputType: "pointer",
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        startX: event.clientX,
        startY: event.clientY,
        rowId: row.id,
        title,
        skillId: row.skillId,
        priorityId: row.priorityId,
        timer: setTimeout(() => {
          recognizeManualUpgradePress(press);
        }, MY_LIST_MANUAL_UPGRADE_LONG_PRESS_MS),
        triggered: false,
        committed: false,
        pendingDetail: null,
      };
      manualUpgradePressRef.current = press;
    },
    [
      activeView,
      clearManualUpgradePress,
      open,
      recognizeManualUpgradePress,
      shouldIgnoreManualUpgradeTarget,
      suppressManualUpgradeSelection,
    ],
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
        event.clientY - press.startY,
      );
      if (moved > MY_LIST_MANUAL_UPGRADE_MOVE_CANCEL_PX) {
        clearManualUpgradePress();
      }
    },
    [clearManualUpgradePress],
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
      if (event.type === "pointercancel") {
        clearManualUpgradePress();
        return;
      }
      if (press.triggered) {
        event.preventDefault();
        commitManualUpgradePress(press);
        return;
      }
      clearManualUpgradePress();
    },
    [clearManualUpgradePress, commitManualUpgradePress],
  );

  const startManualUpgradeTouchPress = useCallback(
    (event: ReactTouchEvent<HTMLElement>, row: MyListManualRow) => {
      if (!open || activeView !== "list") return;
      if (typeof window !== "undefined" && "PointerEvent" in window) {
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
        pointerType: null,
        startX: touch.clientX,
        startY: touch.clientY,
        rowId: row.id,
        title,
        skillId: row.skillId,
        priorityId: row.priorityId,
        timer: setTimeout(() => {
          recognizeManualUpgradePress(press);
        }, MY_LIST_MANUAL_UPGRADE_LONG_PRESS_MS),
        triggered: false,
        committed: false,
        pendingDetail: null,
      };
      manualUpgradePressRef.current = press;
    },
    [
      activeView,
      clearManualUpgradePress,
      open,
      recognizeManualUpgradePress,
      shouldIgnoreManualUpgradeTarget,
      suppressManualUpgradeSelection,
    ],
  );

  const resolveDayDropBucketAtPoint = useCallback(
    (clientX: number, clientY: number): MyListDayViewBucketId | null => {
      if (!isDayLensActive || typeof document === "undefined") return null;

      for (const bucketId of MY_LIST_DAY_VIEW_BUCKETS) {
        const element = document.querySelector<HTMLElement>(
          `[data-my-list-day-drop-zone="${bucketId}"]`,
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
    [isDayLensActive],
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
    [canStartScheduleTimelineDrag, isExpanded],
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
        }),
      );
    },
    [onOpenChange],
  );

  const beginScheduleDragLongPress = useCallback(
    (press: MyListScheduleDragPress) => {
      if (scheduleDragPressRef.current !== press) return;
      if (!canStartTodoRowLongPress) {
        clearScheduleDragPress();
        return;
      }
      if (isDayLensActive) {
        suppressManualUpgradeSelection();
        press.dayDragStarted = true;
        press.dayDropBucketId = resolveDayDropBucketAtPoint(
          press.lastX,
          press.lastY,
        );
        setDayDragDropBucketId(press.dayDropBucketId);
        return;
      }
      press.dragStarted = true;
      suppressManualUpgradeSelection();
      setIsScheduleDragActive(true);
      dispatchScheduleTimelineDrag(press);
    },
    [
      canStartTodoRowLongPress,
      clearScheduleDragPress,
      dispatchScheduleTimelineDrag,
      isDayLensActive,
      resolveDayDropBucketAtPoint,
      suppressManualUpgradeSelection,
    ],
  );

  const startScheduleDragPress = useCallback(
    (event: ReactPointerEvent<HTMLElement>, row: MyListScheduleDragRow) => {
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
    ],
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
          event.clientY,
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
        event.clientY - press.startY,
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
    ],
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
            press.dayDropBucketId,
          );
        }
      }
      clearScheduleDragPress();
    },
    [assignDayBucketToRow, clearScheduleDragPress],
  );

  const startScheduleDragTouchPress = useCallback(
    (event: ReactTouchEvent<HTMLElement>, row: MyListScheduleDragRow) => {
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
    ],
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
    [],
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
        touch.clientY - press.startY,
      );
      if (moved > MY_LIST_MANUAL_UPGRADE_MOVE_CANCEL_PX) {
        clearManualUpgradePress();
      }
    },
    [clearManualUpgradePress, getTrackedScheduleDragTouch],
  );

  const handleManualUpgradeTouchEnd = useCallback(
    (event: ReactTouchEvent<HTMLElement>) => {
      const press = manualUpgradePressRef.current;
      if (!press || press.inputType !== "touch") return;
      if (!getTrackedScheduleDragTouch(event, press.pointerId)) return;
      if (event.type === "touchcancel") {
        clearManualUpgradePress();
        return;
      }
      if (press.triggered) {
        event.preventDefault();
        commitManualUpgradePress(press);
        return;
      }
      clearManualUpgradePress();
    },
    [
      clearManualUpgradePress,
      commitManualUpgradePress,
      getTrackedScheduleDragTouch,
    ],
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
          touch.clientY,
        );
        setDayDragDropBucketId(press.dayDropBucketId);
        return;
      }
      if (press.dragStarted) {
        return;
      }

      const moved = Math.hypot(
        touch.clientX - press.startX,
        touch.clientY - press.startY,
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
    ],
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
          press.dayDropBucketId,
        );
      }
      clearScheduleDragPress();
    },
    [assignDayBucketToRow, clearScheduleDragPress, getTrackedScheduleDragTouch],
  );

  const createManualRowId = useCallback(() => {
    manualRowIdCounterRef.current += 1;
    return createManualStorageBackedRowId(manualRowIdCounterRef.current);
  }, []);

  const insertManualRowAfterAnchor = useCallback(
    (
      currentRows: MyListManualRow[],
      anchorKey: MyListRowKey,
      newRow: MyListManualRow,
    ) => {
      const anchorManualId = anchorKey.startsWith("manual:")
        ? anchorKey.slice("manual:".length)
        : null;

      if (anchorManualId) {
        const anchorIndex = currentRows.findIndex(
          (row) => row.id === anchorManualId,
        );

        if (anchorIndex >= 0) {
          const nextRows = [...currentRows];
          nextRows.splice(anchorIndex + 1, 0, newRow);
          return nextRows;
        }
      }

      const firstSameAnchorIndex = currentRows.findIndex(
        (row) => row.insertAfterRowKey === anchorKey,
      );

      if (firstSameAnchorIndex >= 0) {
        const nextRows = [...currentRows];
        nextRows.splice(firstSameAnchorIndex, 0, newRow);
        return nextRows;
      }

      return [...currentRows, newRow];
    },
    [],
  );

  const resolveManualReorderDestination = useCallback(
    (
      event: DragOverEvent | DragEndEvent,
      rows: MyListVisibleTodoRow[],
    ): MyListManualReorderDestination | null => {
      const over = event.over;
      if (!over) return null;

      const overData = readManualReorderOverData(over.data.current);
      if (!overData) return null;

      const targetRowKey =
        overData.type === "manual-row" && typeof over.id === "string"
          ? (over.id.trim() as MyListSortableTodoRowKey)
          : null;
      if (
        targetRowKey &&
        !rows.some((row) => getSortableTodoRowKey(row) === targetRowKey)
      ) {
        return null;
      }

      return {
        targetRowKey,
        group: overData.group,
      };
    },
    [],
  );

  const persistManualRowForReorder = useCallback(
    (
      draggedRowKey: MyListSortableTodoRowKey,
      destination: MyListManualReorderDestination | null,
    ) => {
      setManualRows((currentRows) => {
        const nextRows = destination
          ? reorderManualRowsForDestination(
              currentRows,
              draggedRowKey,
              destination,
            )
          : currentRows;
        persistManualRows(nextRows);
        return nextRows;
      });
    },
    [persistManualRows],
  );

  const persistPinnedSourceRowsForReorder = useCallback(
    (
      draggedRowKey: MyListSortableTodoRowKey,
      destination: MyListManualReorderDestination | null,
    ) => {
      if (!destination) return;

      const nextRows = reorderPinnedSourceRowsForDestination(
        visiblePinnedSourceRows,
        draggedRowKey,
        destination,
        defaultPriority.id,
      );
      if (nextRows === visiblePinnedSourceRows) return;

      const draggedKeyParts = readPinnedSourceRowKeyParts(draggedRowKey);
      const originalDraggedRow = draggedKeyParts
        ? (visiblePinnedSourceRows.find(
            (row) =>
              row.sourceType === draggedKeyParts.sourceType &&
              row.id === draggedKeyParts.sourceId,
          ) ?? null)
        : null;
      const nextDraggedRow = draggedKeyParts
        ? (nextRows.find(
            (row) =>
              row.sourceType === draggedKeyParts.sourceType &&
              row.id === draggedKeyParts.sourceId,
          ) ?? null)
        : null;

      onReorderPinnedSourceRows?.(nextRows);
      if (originalDraggedRow && nextDraggedRow) {
        const updates: {
          priorityId?: PriorityBucketId | null;
          dayBucketId?: MyListDayBucketId | null;
        } = {};
        if (originalDraggedRow.priorityId !== nextDraggedRow.priorityId) {
          updates.priorityId = nextDraggedRow.priorityId ?? null;
        }
        if (originalDraggedRow.dayBucketId !== nextDraggedRow.dayBucketId) {
          updates.dayBucketId = nextDraggedRow.dayBucketId ?? null;
        }
        if ("priorityId" in updates || "dayBucketId" in updates) {
          onUpdatePinnedSourceMetadata?.(originalDraggedRow, updates);
        }
      }
    },
    [
      defaultPriority.id,
      onReorderPinnedSourceRows,
      onUpdatePinnedSourceMetadata,
      visiblePinnedSourceRows,
    ],
  );

  const restoreManualReorderOrigin = useCallback(() => {
    const originRows = manualReorderOriginRowsRef.current;
    if (originRows) {
      setManualRows(originRows);
    }
    manualReorderOriginRowsRef.current = null;
    manualReorderSourceGroupRef.current = null;
    manualReorderLastValidDestinationRef.current = null;
    manualReorderCompactDayGroupIdsRef.current.clear();
    setActiveManualReorderRowId(null);
    setActiveManualReorderSourceGroup(null);
  }, []);

  const resetManualReorderAfterError = useCallback(
    (error: unknown) => {
      console.warn("My List manual reorder cancelled", error);
      restoreManualReorderOrigin();
    },
    [restoreManualReorderOrigin],
  );

  const handleManualReorderDragStart = useCallback(
    (event: DragStartEvent) => {
      try {
        const rowKey = readManualReorderActiveRowKey(
          event.active,
          visibleTodoRows,
        );
        if (!open || activeView !== "list" || !rowKey) {
          return;
        }
        const activeData = readManualReorderOverData(event.active.data.current);
        const sourceGroup =
          activeData?.type === "manual-row" ? activeData.group : null;

        clearManualUpgradePress();
        setPendingDeleteRowId(null);
        setActiveSkillPickerRowKey(null);
        setActivePriorityPickerRowKey(null);
        setActiveDayPickerRowKey(null);
        setManualSkillSearch("");
        manualReorderOriginRowsRef.current = manualRows;
        manualReorderCompactDayGroupIdsRef.current = new Set(
          visibleTodoGroups
            .filter((group) => {
              const bucketId = group.id as MyListDayViewBucketId;
              const collapsedPreference = collapsedDayGroups[bucketId];
              return (
                isDayLensActive &&
                collapsedPreference !== false &&
                (collapsedPreference === true || group.rows.length === 0)
              );
            })
            .map((group) => group.id as MyListDayViewBucketId),
        );
        manualReorderSourceGroupRef.current = sourceGroup;
        manualReorderLastValidDestinationRef.current = null;
        setActiveManualReorderRowId(rowKey);
        setActiveManualReorderSourceGroup(sourceGroup);
      } catch (error) {
        resetManualReorderAfterError(error);
      }
    },
    [
      activeView,
      clearManualUpgradePress,
      collapsedDayGroups,
      isDayLensActive,
      manualRows,
      open,
      resetManualReorderAfterError,
      visibleTodoGroups,
      visibleTodoRows,
    ],
  );

  const handleManualReorderDragOver = useCallback(
    (event: DragOverEvent) => {
      try {
        setManualRows((currentRows) => {
          const rowKey = readManualReorderActiveRowKey(
            event.active,
            visibleTodoRows,
          );
          const destination = resolveManualReorderDestination(
            event,
            visibleTodoRows,
          );
          if (
            !rowKey ||
            !destination ||
            !isManualReorderDestinationAllowedForSource(
              manualReorderSourceGroupRef.current,
              destination,
            )
          ) {
            return currentRows;
          }
          manualReorderLastValidDestinationRef.current = destination;
          if (!rowKey.startsWith("manual:")) {
            return currentRows;
          }
          return reorderManualRowsForDestination(
            currentRows,
            rowKey,
            destination,
          );
        });
      } catch (error) {
        resetManualReorderAfterError(error);
      }
    },
    [
      resetManualReorderAfterError,
      resolveManualReorderDestination,
      visibleTodoRows,
    ],
  );

  const handleManualReorderDragEnd = useCallback(
    (event: DragEndEvent) => {
      try {
        const rowKey = readManualReorderActiveRowKey(
          event.active,
          visibleTodoRows,
        );
        const destination = resolveManualReorderDestination(
          event,
          visibleTodoRows,
        );
        const sourceGroup = manualReorderSourceGroupRef.current;
        const resolvedDestination =
          destination &&
          isManualReorderDestinationAllowedForSource(sourceGroup, destination)
            ? destination
            : sourceGroup?.kind === "monument"
              ? manualReorderLastValidDestinationRef.current
              : null;

        if (
          !rowKey ||
          !resolvedDestination ||
          !isManualReorderDestinationAllowedForSource(
            sourceGroup,
            resolvedDestination,
          )
        ) {
          restoreManualReorderOrigin();
          return;
        }

        if (rowKey.startsWith("manual:")) {
          persistManualRowForReorder(rowKey, resolvedDestination);
        } else if (rowKey.startsWith("pinnedSource:")) {
          persistPinnedSourceRowsForReorder(rowKey, resolvedDestination);
        } else {
          restoreManualReorderOrigin();
          return;
        }
        if (
          resolvedDestination.group?.kind === "day" &&
          manualReorderCompactDayGroupIdsRef.current.has(
            resolvedDestination.group.id,
          )
        ) {
          setCollapsedDayGroups((current) => ({
            ...current,
            [resolvedDestination.group!.id]: true,
          }));
        }
        manualReorderOriginRowsRef.current = null;
        manualReorderSourceGroupRef.current = null;
        manualReorderLastValidDestinationRef.current = null;
        manualReorderCompactDayGroupIdsRef.current.clear();
        setActiveManualReorderRowId(null);
        setActiveManualReorderSourceGroup(null);
      } catch (error) {
        resetManualReorderAfterError(error);
      }
    },
    [
      persistManualRowForReorder,
      persistPinnedSourceRowsForReorder,
      resetManualReorderAfterError,
      resolveManualReorderDestination,
      restoreManualReorderOrigin,
      visibleTodoRows,
    ],
  );

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
        currentRowId === `manual:${rowId}` ? null : currentRowId,
      );
      updateManualRowsWithPersistence((currentRows) => {
        if (rowId === EMPTY_DRAFT_MANUAL_ROW_ID) {
          return [
            ...currentRows,
            {
              ...createManualRow(
                realDraftRowId ?? rowId,
                defaultPriority.id,
                selectedListId,
              ),
              ...updates,
            },
          ];
        }

        return currentRows.map((row) =>
          row.id === rowId ? { ...row, ...updates } : row,
        );
      });
    },
    [
      createManualRowId,
      defaultPriority.id,
      selectedListId,
      updateManualRowsWithPersistence,
    ],
  );

  const handleTodoTitleKeyDown = useCallback(
    (
      event: ReactKeyboardEvent<HTMLInputElement>,
      rowType: "manual" | "task",
      rowId: string,
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
          ...createManualRow(blankRowId, defaultPriority.id, selectedListId),
          insertAfterRowKey: `manual:${realDraftRowId}` as const,
        };

        setPendingTitleFocusRowId(blankRowId);
        updateManualRowsWithPersistence((currentRows) => {
          const draftRow =
            currentRows.find((row) => row.id === EMPTY_DRAFT_MANUAL_ROW_ID) ??
            createManualRow(realDraftRowId, defaultPriority.id, selectedListId);
          const realDraftRow = {
            ...draftRow,
            id: realDraftRowId,
            text: draftText,
            insertAfterRowKey: draftRow.insertAfterRowKey ?? null,
          };

          const draftIndex = currentRows.findIndex(
            (row) => row.id === EMPTY_DRAFT_MANUAL_ROW_ID,
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
        ...createManualRow(
          createManualRowId(),
          defaultPriority.id,
          selectedListId,
        ),
        insertAfterRowKey: anchorKey,
      };

      setPendingTitleFocusRowId(blankRow.id);
      updateManualRowsWithPersistence((currentRows) =>
        insertManualRowAfterAnchor(currentRows, anchorKey, blankRow),
      );
    },
    [
      activeView,
      createManualRowId,
      defaultPriority.id,
      insertManualRowAfterAnchor,
      selectedListId,
      updateManualRowsWithPersistence,
    ],
  );

  const manualSkillGroups = useMemo<QuickCreateSkillGroup[]>(() => {
    const term = manualSkillSearch.trim().toLowerCase();
    const categoryLookup = new Map(
      skillCategories.map((category) => [category.id, category]),
    );
    const originalIndex = new Map(
      skills.map((skill, index) => [skill.id, index]),
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
        right.label,
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
          right.name,
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
    [updateManualRow],
  );

  const handleTaskSkillSelect = useCallback(
    (taskId: string, skill: SkillRow) => {
      setPendingDeleteRowId((currentRowId) =>
        currentRowId === `task:${taskId}` ? null : currentRowId,
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
    [onTaskSkillSelect],
  );

  const handleManualCompletionToggle = useCallback(
    (rowId: string, checked: boolean) => {
      updateManualRow(rowId, {
        done: checked,
        completedAt: checked ? new Date().toISOString() : null,
      });
    },
    [updateManualRow],
  );

  const handlePrioritySelect = useCallback(
    (
      rowId: string,
      rowType: "manual" | "task" | "pinnedSource",
      priorityId: PriorityBucketId,
      pinnedSourceRow?: MyListPinnedSourceRow,
    ) => {
      const currentRowKey =
        rowType === "pinnedSource" && pinnedSourceRow
          ? buildPinnedSourceRowKey(pinnedSourceRow.sourceType, rowId)
          : `${rowType}:${rowId}`;

      setPendingDeleteRowId((currentRowId) =>
        currentRowId === currentRowKey ? null : currentRowId,
      );

      if (rowType === "pinnedSource" && pinnedSourceRow) {
        onUpdatePinnedSourceMetadata?.(pinnedSourceRow, { priorityId });
      } else if (rowType === "manual") {
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
    [onUpdatePinnedSourceMetadata, updateManualRow],
  );

  const handleDaySelect = useCallback(
    (
      rowId: string,
      rowType: "manual" | "task" | "pinnedSource",
      dayBucketId: MyListDayViewBucketId,
      pinnedSourceRow?: MyListPinnedSourceRow,
    ) => {
      assignDayBucketToRow(rowId, rowType, dayBucketId, pinnedSourceRow);
    },
    [assignDayBucketToRow],
  );

  const handleDeleteRowAction = useCallback(
    async (
      rowId: string,
      rowType: "manual" | "task" | "pinnedSource",
      pinnedSourceRow?: MyListPinnedSourceRow,
    ) => {
      const deleteRowId =
        rowType === "pinnedSource" && pinnedSourceRow
          ? buildPinnedSourceRowKey(pinnedSourceRow.sourceType, rowId)
          : `${rowType}:${rowId}`;

      if (pendingDeleteRowId !== deleteRowId) {
        setPendingDeleteRowId(deleteRowId);
        return;
      }

      if (rowType === "pinnedSource" && pinnedSourceRow) {
        setPendingDeleteRowId(null);
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
        if (deletingManualRowIds.has(rowId)) return;

        deletingManualRowIdsRef.current.add(rowId);
        setDeletingManualRowIds((currentIds) => {
          const nextIds = new Set(currentIds);
          nextIds.add(rowId);
          return nextIds;
        });

        try {
          if (userId) {
            const nextPersistence = manualRowsPersistenceRef.current
              .catch((error) => {
                console.error(
                  "Previous My List manual row persistence failed before delete",
                  error,
                );
              })
              .then(() => deleteManualMyListItem({ userId, itemId: rowId }));
            manualRowsPersistenceRef.current = nextPersistence;
            await nextPersistence;
          }

          setManualRows((currentRows) => {
            const nextRows = currentRows.filter((row) => row.id !== rowId);
            writeStoredMyListManualRows(nextRows, defaultPriority.id);
            return nextRows;
          });
          setActiveSkillPickerRowKey((currentRowKey) =>
            currentRowKey === `manual:${rowId}` ? null : currentRowKey,
          );
          setActivePriorityPickerRowKey((currentRowKey) =>
            currentRowKey === `manual:${rowId}` ? null : currentRowKey,
          );
          setActiveDayPickerRowKey((currentRowKey) =>
            currentRowKey === `manual:${rowId}` ? null : currentRowKey,
          );
        } catch (error) {
          console.error("Failed to delete My List manual todo", error);
        } finally {
          setPendingDeleteRowId((currentRowKey) =>
            currentRowKey === deleteRowId ? null : currentRowKey,
          );
          setDeletingManualRowIds((currentIds) => {
            if (!currentIds.has(rowId)) return currentIds;
            const nextIds = new Set(currentIds);
            nextIds.delete(rowId);
            return nextIds;
          });
          deletingManualRowIdsRef.current.delete(rowId);
        }
        return;
      }

      if (deletingTaskRowIds.has(rowId)) return;

      setDeletingTaskRowIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.add(rowId);
        return nextIds;
      });

      try {
        const removed = await onRemoveTask?.(rowId);
        if (removed) {
          setActiveSkillPickerRowKey((currentRowKey) =>
            currentRowKey === `task:${rowId}` ? null : currentRowKey,
          );
          setActivePriorityPickerRowKey((currentRowKey) =>
            currentRowKey === `task:${rowId}` ? null : currentRowKey,
          );
          setActiveDayPickerRowKey((currentRowKey) =>
            currentRowKey === `task:${rowId}` ? null : currentRowKey,
          );
          setTaskOverrides((currentOverrides) => {
            if (!(rowId in currentOverrides)) return currentOverrides;
            const nextOverrides = { ...currentOverrides };
            delete nextOverrides[rowId];
            return nextOverrides;
          });
        }
      } catch (error) {
        console.error("Failed to remove My List Task", error);
      } finally {
        setPendingDeleteRowId((currentRowKey) =>
          currentRowKey === deleteRowId ? null : currentRowKey,
        );
        setDeletingTaskRowIds((currentIds) => {
          if (!currentIds.has(rowId)) return currentIds;
          const nextIds = new Set(currentIds);
          nextIds.delete(rowId);
          return nextIds;
        });
      }
    },
    [
      defaultPriority.id,
      deletingManualRowIds,
      deletingTaskRowIds,
      onRemovePinnedSource,
      onRemoveTask,
      pendingDeleteRowId,
      userId,
    ],
  );

  const renderDeleteRowButton = useCallback(
    (
      rowId: string,
      rowType: "manual" | "task" | "pinnedSource",
      pinnedSourceRow?: MyListPinnedSourceRow,
    ) => {
      const deleteRowId =
        rowType === "pinnedSource" && pinnedSourceRow
          ? buildPinnedSourceRowKey(pinnedSourceRow.sourceType, rowId)
          : `${rowType}:${rowId}`;
      const confirming = pendingDeleteRowId === deleteRowId;
      const isDeleting =
        (rowType === "manual" && deletingManualRowIds.has(rowId)) ||
        (rowType === "task" && deletingTaskRowIds.has(rowId));

      return (
        <button
          type="button"
          disabled={isDeleting}
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
              : "text-white/24 hover:text-white/48",
            isDeleting && "cursor-wait",
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={
                confirming ? "check" : rowType === "pinnedSource" ? "pin" : "x"
              }
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
              ) : rowType === "pinnedSource" ? (
                <Pin className="h-3 w-3 fill-current" strokeWidth={1.9} />
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
      deletingManualRowIds,
      deletingTaskRowIds,
      open,
      pendingDeleteRowId,
      prefersReducedMotion,
    ],
  );

  const renderSkillPicker = useCallback(
    (
      rowKey: MyListRowKey,
      selectedSkillId: string | null,
      onSelect: (skill: SkillRow) => void,
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
                              : "text-white/75 hover:bg-white/10 hover:text-white",
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
    [activeSkillPickerRowKey, manualSkillGroups, manualSkillSearch, open],
  );

  const renderPriorityPicker = useCallback(
    (
      rowKey: MyListRowKey,
      selectedPriorityId: PriorityBucketId,
      onSelect: (priorityId: PriorityBucketId) => void,
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
                      : "border-transparent bg-transparent text-white/68 hover:bg-white/[0.08] hover:text-white",
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
    [activePriorityPickerRowKey, open],
  );

  const renderDayPicker = useCallback(
    (
      rowKey: MyListRowKey,
      selectedDayBucketId: MyListDayBucketId | null,
      onSelect: (dayBucketId: MyListDayViewBucketId) => void,
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
                      : "opacity-75 hover:opacity-95",
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
    [activeDayPickerRowKey, open],
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
    [activeManualReorderRowId],
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
    [
      activeManualReorderRowId,
      expandSheet,
      isExpanded,
      isScheduleDragActive,
      open,
    ],
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
    [activeManualReorderRowId, expandSheet, isExpanded, open],
  );

  const isEditableElementInsideSheet = useCallback(
    (element: Element | null) => {
      if (!(element instanceof HTMLElement)) return false;
      if (!sheetRootRef.current?.contains(element)) return false;

      return element.matches(MY_LIST_EDITABLE_TARGET_SELECTOR);
    },
    [],
  );

  const isEditableElementFocusedInsideSheet = useCallback(() => {
    if (typeof document === "undefined") return false;

    return isEditableElementInsideSheet(document.activeElement);
  }, [isEditableElementInsideSheet]);

  const scrollActiveEditableIntoSheetView = useCallback(() => {
    if (typeof document === "undefined") return;

    const activeElement = document.activeElement;
    const scrollElement = sheetScrollRef.current;
    if (!(activeElement instanceof HTMLElement) || !scrollElement) return;
    if (!isEditableElementInsideSheet(activeElement)) return;

    const elementRect = activeElement.getBoundingClientRect();
    const scrollRect = scrollElement.getBoundingClientRect();
    const metrics =
      typeof window !== "undefined" ? readMyListViewportMetrics() : null;
    const visibleTop = Math.max(
      scrollRect.top,
      metrics?.visualTop ?? scrollRect.top,
    );
    const visibleBottom = Math.min(
      scrollRect.bottom,
      metrics?.visualBottom ?? scrollRect.bottom,
    );
    const visibleHeight = visibleBottom - visibleTop;

    if (visibleHeight <= 0) return;

    const revealMargin = 12;
    let desiredScrollTop = scrollElement.scrollTop;

    if (elementRect.top < visibleTop + revealMargin) {
      desiredScrollTop += elementRect.top - visibleTop - revealMargin;
    } else if (elementRect.bottom > visibleBottom - revealMargin) {
      desiredScrollTop += elementRect.bottom - visibleBottom + revealMargin;
    } else {
      return;
    }

    const maxScrollTop =
      scrollElement.scrollHeight - scrollElement.clientHeight;
    const keyboardSessionActive = keyboardSessionBaselineRef.current !== null;

    scrollElement.scrollTo({
      top: Math.min(Math.max(desiredScrollTop, 0), Math.max(maxScrollTop, 0)),
      behavior: keyboardSessionActive ? "auto" : "smooth",
    });
  }, [isEditableElementInsideSheet]);

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

    if (keyboardSessionBaselineRef.current === null) {
      focusVisibilityTimeoutRef.current = setTimeout(() => {
        focusVisibilityTimeoutRef.current = null;
        scrollActiveEditableIntoSheetView();
      }, 180);
    }
  }, [scrollActiveEditableIntoSheetView]);

  const clearKeyboardCloseTimeout = useCallback(() => {
    if (keyboardCloseTimeoutRef.current !== null) {
      clearTimeout(keyboardCloseTimeoutRef.current);
      keyboardCloseTimeoutRef.current = null;
    }
  }, []);

  const clearKeyboardSession = useCallback(() => {
    keyboardSessionBaselineRef.current = null;
    keyboardSessionClosingRef.current = false;
    clearKeyboardCloseTimeout();
    setKeyboardGeometry((currentGeometry) => {
      const nextGeometry: MyListKeyboardGeometryState = {
        internalBottomInset: 0,
      };

      return isMyListKeyboardGeometryEqual(currentGeometry, nextGeometry)
        ? currentGeometry
        : nextGeometry;
    });
  }, [clearKeyboardCloseTimeout]);

  const measureSafeAreaTop = useCallback(() => {
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
  }, []);

  const readRouteTopReserve = useCallback(() => {
    const rootFontSize =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const safeAreaTop = measureSafeAreaTop();
    const scheduleTopReserve = Math.max(
      4.75 * rootFontSize,
      safeAreaTop + 3.75 * rootFontSize,
    );
    const fullTopReserve = Math.max(
      2.5 * rootFontSize,
      safeAreaTop + 1.5 * rootFontSize,
    );

    return useFullExpandedHeight ? fullTopReserve : scheduleTopReserve;
  }, [measureSafeAreaTop, useFullExpandedHeight]);

  const calculateNormalSheetHeights = useCallback(
    (layoutBottom: number) => {
      const rootFontSize =
        parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const editableFocusedInsideSheet =
        editableFocusInsideSheetRef.current ||
        isEditableElementFocusedInsideSheet();
      const minimumSheetHeight = editableFocusedInsideSheet
        ? MY_LIST_MIN_EDITABLE_SHEET_HEIGHT
        : MY_LIST_MIN_SAFE_SHEET_HEIGHT;
      const compact = clampMyListSheetHeight(
        Math.min(layoutBottom * 0.58, 28 * rootFontSize),
        minimumSheetHeight,
      );
      const expanded = clampMyListSheetHeight(
        Math.max(compact, layoutBottom - readRouteTopReserve()),
        minimumSheetHeight,
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
    },
    [isEditableElementFocusedInsideSheet, readRouteTopReserve],
  );

  const beginKeyboardSession = useCallback(() => {
    if (typeof window === "undefined" || typeof document === "undefined")
      return;
    if (keyboardSessionBaselineRef.current) {
      keyboardSessionClosingRef.current = false;
      clearKeyboardCloseTimeout();
      return;
    }

    const metrics = readMyListViewportMetrics();

    keyboardSessionBaselineRef.current = {
      innerWidth: metrics.innerWidth,
      innerHeight: metrics.innerHeight,
      clientHeight: metrics.clientHeight,
      layoutBottom: metrics.layoutBottom,
      visualWidth: metrics.visualWidth,
      visualHeight: metrics.hasVisualViewport ? metrics.visualHeight : null,
      visualOffsetTop: metrics.hasVisualViewport ? metrics.visualTop : null,
      visualBottom: metrics.visualBottom,
    };
    keyboardSessionClosingRef.current = false;
    clearKeyboardCloseTimeout();
  }, [clearKeyboardCloseTimeout]);

  const measureViewportGeometry = useCallback(() => {
    if (typeof window === "undefined" || typeof document === "undefined")
      return;

    const metrics = readMyListViewportMetrics();
    const baseline = keyboardSessionBaselineRef.current;
    const editableSessionActive =
      editableFocusInsideSheetRef.current ||
      keyboardSessionClosingRef.current ||
      isEditableElementFocusedInsideSheet();

    if (!baseline) {
      if (editableSessionActive) {
        beginKeyboardSession();
      } else {
        const previousMetrics = normalViewportMetricsRef.current;
        const previousWidth =
          previousMetrics?.visualWidth ?? previousMetrics?.innerWidth ?? null;
        const currentWidth = metrics.visualWidth ?? metrics.innerWidth;
        const widthDelta =
          previousWidth === null
            ? Number.POSITIVE_INFINITY
            : Math.abs(currentWidth - previousWidth);
        const widthRatioDelta =
          previousWidth && previousWidth > 0 ? widthDelta / previousWidth : 0;

        if (
          previousMetrics === null ||
          widthDelta >= MY_LIST_VIEWPORT_WIDTH_CHANGE_THRESHOLD ||
          widthRatioDelta >= MY_LIST_VIEWPORT_WIDTH_RATIO_CHANGE_THRESHOLD
        ) {
          normalViewportMetricsRef.current = metrics;
          calculateNormalSheetHeights(metrics.layoutBottom);
        }
      }
      return;
    }

    const baselineWidth = baseline.visualWidth ?? baseline.innerWidth;
    const currentWidth = metrics.visualWidth ?? metrics.innerWidth;
    const widthDelta = Math.abs(currentWidth - baselineWidth);
    const widthRatioDelta = baselineWidth > 0 ? widthDelta / baselineWidth : 0;

    if (
      widthDelta >= MY_LIST_VIEWPORT_WIDTH_CHANGE_THRESHOLD ||
      widthRatioDelta >= MY_LIST_VIEWPORT_WIDTH_RATIO_CHANGE_THRESHOLD
    ) {
      clearKeyboardSession();
      if (orientationSettlementTimeoutRef.current !== null) {
        clearTimeout(orientationSettlementTimeoutRef.current);
      }
      orientationSettlementTimeoutRef.current = setTimeout(() => {
        orientationSettlementTimeoutRef.current = null;
        const settledMetrics = readMyListViewportMetrics();
        normalViewportMetricsRef.current = settledMetrics;
        calculateNormalSheetHeights(settledMetrics.layoutBottom);
      }, 180);
      return;
    }

    if (
      keyboardSessionClosingRef.current &&
      isMyListKeyboardBaselineRecovered(metrics, baseline)
    ) {
      clearKeyboardSession();
      normalViewportMetricsRef.current = metrics;
      calculateNormalSheetHeights(metrics.layoutBottom);
      return;
    }

    const scrollRect = sheetScrollRef.current?.getBoundingClientRect() ?? null;
    const internalBottomInset =
      editableSessionActive && metrics.hasVisualViewport && scrollRect
        ? Math.max(0, Math.ceil(scrollRect.bottom - metrics.visualBottom))
        : 0;
    const nextGeometry: MyListKeyboardGeometryState = {
      internalBottomInset,
    };

    setKeyboardGeometry((currentGeometry) =>
      isMyListKeyboardGeometryEqual(currentGeometry, nextGeometry)
        ? currentGeometry
        : nextGeometry,
    );
    if (editableSessionActive) {
      scheduleActiveEditableVisibility();
    }
  }, [
    beginKeyboardSession,
    calculateNormalSheetHeights,
    clearKeyboardSession,
    isEditableElementFocusedInsideSheet,
    scheduleActiveEditableVisibility,
  ]);

  const scheduleViewportMeasurement = useCallback(() => {
    if (typeof window === "undefined") return;
    if (viewportMeasurementFrameRef.current !== null) return;

    viewportMeasurementFrameRef.current = window.requestAnimationFrame(() => {
      viewportMeasurementFrameRef.current = null;
      measureViewportGeometry();
    });
  }, [measureViewportGeometry]);

  const markKeyboardSessionClosing = useCallback(() => {
    editableFocusInsideSheetRef.current = false;
    keyboardSessionClosingRef.current =
      keyboardSessionBaselineRef.current !== null;
    scheduleViewportMeasurement();

    clearKeyboardCloseTimeout();
    if (keyboardSessionBaselineRef.current) {
      keyboardCloseTimeoutRef.current = setTimeout(() => {
        keyboardCloseTimeoutRef.current = null;
        clearKeyboardSession();
      }, 900);
    } else {
      clearKeyboardSession();
    }
  }, [
    clearKeyboardCloseTimeout,
    clearKeyboardSession,
    scheduleViewportMeasurement,
  ]);

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
      beginKeyboardSession();
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
    focusTimeout = setTimeout(focusPendingTitleInput, 60);

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
    beginKeyboardSession,
    open,
    pendingTitleFocusRowId,
    scheduleActiveEditableVisibility,
  ]);

  const handleSheetFocusCapture = useCallback(
    (event: ReactFocusEvent<HTMLElement>) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!sheetRootRef.current?.contains(target)) return;
      if (!target.matches(MY_LIST_EDITABLE_TARGET_SELECTOR)) return;

      editableFocusInsideSheetRef.current = true;
      beginKeyboardSession();
      scheduleActiveEditableVisibility();
      scheduleViewportMeasurement();

      if (!open || activeView !== "list") return;

      onOpenChange(true);
      if (!isExpanded) setIsExpanded(true);
    },
    [
      activeView,
      beginKeyboardSession,
      isExpanded,
      onOpenChange,
      open,
      scheduleActiveEditableVisibility,
      scheduleViewportMeasurement,
    ],
  );

  const handleSheetBlurCapture = useCallback(
    (event: ReactFocusEvent<HTMLElement>) => {
      const nextFocusedElement = event.relatedTarget;
      if (isEditableElementInsideSheet(nextFocusedElement)) {
        return;
      }

      if (typeof window === "undefined") {
        editableFocusInsideSheetRef.current = false;
        return;
      }

      setTimeout(() => {
        const editableStillFocused = isEditableElementFocusedInsideSheet();
        editableFocusInsideSheetRef.current = editableStillFocused;
        if (!editableStillFocused) {
          markKeyboardSessionClosing();
        }
      }, 60);
    },
    [
      isEditableElementFocusedInsideSheet,
      isEditableElementInsideSheet,
      markKeyboardSessionClosing,
    ],
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined")
      return;

    measureViewportGeometry();
    window.addEventListener("resize", scheduleViewportMeasurement);
    window.visualViewport?.addEventListener(
      "resize",
      scheduleViewportMeasurement,
    );
    window.visualViewport?.addEventListener(
      "scroll",
      scheduleViewportMeasurement,
    );

    return () => {
      window.removeEventListener("resize", scheduleViewportMeasurement);
      window.visualViewport?.removeEventListener(
        "resize",
        scheduleViewportMeasurement,
      );
      window.visualViewport?.removeEventListener(
        "scroll",
        scheduleViewportMeasurement,
      );
    };
  }, [measureViewportGeometry, scheduleViewportMeasurement]);

  useEffect(() => {
    return () => {
      clearScheduleDragPress();
      keyboardSessionBaselineRef.current = null;
      keyboardSessionClosingRef.current = false;
      clearKeyboardCloseTimeout();
      if (
        typeof window !== "undefined" &&
        focusVisibilityFrameRef.current !== null
      ) {
        window.cancelAnimationFrame(focusVisibilityFrameRef.current);
      }
      if (
        typeof window !== "undefined" &&
        viewportMeasurementFrameRef.current !== null
      ) {
        window.cancelAnimationFrame(viewportMeasurementFrameRef.current);
      }
      if (focusVisibilityTimeoutRef.current !== null) {
        clearTimeout(focusVisibilityTimeoutRef.current);
      }
      if (orientationSettlementTimeoutRef.current !== null) {
        clearTimeout(orientationSettlementTimeoutRef.current);
      }
    };
  }, [clearKeyboardCloseTimeout, clearScheduleDragPress]);

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
      clearKeyboardSession();
      setIsExpanded(false);
      setActiveSkillPickerRowKey(null);
      setActivePriorityPickerRowKey(null);
      setActiveDayPickerRowKey(null);
      setManualSkillSearch("");
      setPendingDeleteRowId(null);
      setPendingTitleFocusRowId(null);
    }
  }, [clearKeyboardSession, open]);

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

        const taskDone = task.stage?.toString().toUpperCase() === "PERFECT";
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
    Object.keys(completionExitRows).forEach((rowKey) => {
      const typedRowKey = rowKey as MyListSortableTodoRowKey;
      const exitState = completionExitRows[typedRowKey];
      if (!exitState) return;

      if (typedRowKey.startsWith("task:")) {
        const taskId = typedRowKey.slice("task:".length);
        if (pendingTaskIds.has(taskId)) return;

        const task = tasks.find((item) => item.id === taskId);
        const override = taskOverrides[taskId];
        const hasCompletionOverride = Boolean(
          override && "completedAt" in override,
        );
        const isDone = hasCompletionOverride
          ? Boolean(override?.completedAt)
          : task?.stage?.toString().toUpperCase() === "PERFECT";

        if (!isDone) {
          cancelCompletionExit(typedRowKey);
        }
        return;
      }

      if (typedRowKey.startsWith("pinnedSource:")) {
        const pinnedSourceParts = readPinnedSourceRowKeyParts(typedRowKey);
        if (!pinnedSourceParts) return;

        const completionKey = `${pinnedSourceParts.sourceType}:${pinnedSourceParts.sourceId}`;
        if (!pinnedSourceCompletions[completionKey]) {
          cancelCompletionExit(typedRowKey);
        }
      }
    });
  }, [
    cancelCompletionExit,
    completionExitRows,
    pendingTaskIds,
    pinnedSourceCompletions,
    taskOverrides,
    tasks,
  ]);

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

  const handleCreateList = useCallback(async () => {
    const name = newListName.trim();
    if (
      !userId ||
      !name ||
      name.length > MY_LIST_NAME_MAX_LENGTH ||
      isCreatingList
    )
      return;
    setIsCreatingList(true);
    try {
      const list = await createMyListList({ userId, name });
      setCustomLists((lists) => [...lists, list]);
      setSelectedListId(list.id);
      setActiveView("list");
      setIsDayLensActive(false);
      setIsMonumentLensActive(false);
      setNewListName("");
      setIsCreateListOpen(false);
      setIsListSelectorOpen(false);
    } catch (error) {
      console.error("Failed to create My List list", error);
    } finally {
      setIsCreatingList(false);
    }
  }, [isCreatingList, newListName, userId]);

  return (
    <motion.aside
      ref={sheetRootRef}
      aria-label="My List"
      data-no-tab-swipe
      data-my-list-sheet
      className={clsx(
        "fixed inset-x-0 bottom-0 z-[150] w-full sm:mx-auto sm:max-w-[34rem] sm:px-4",
        open ? "pointer-events-auto" : "pointer-events-none",
        isScheduleDragActive && "pointer-events-none",
      )}
      initial={false}
      animate={{ y: open ? 0 : "calc(100% - 2px)" }}
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
          className="pointer-events-auto absolute left-1/2 top-0 flex h-[1.95rem] w-[4.75rem] -translate-x-1/2 -translate-y-[calc(1.35rem+0.375rem)] flex-col items-center justify-center gap-0.5 rounded-t-[1.25rem] border-x border-t border-white/14 bg-[#050507] pb-1 pt-0.5 text-white/72 shadow-[0_-8px_28px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.12)] outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white/35"
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
          className="pointer-events-auto absolute left-1/2 top-0 flex h-6 w-16 -translate-x-1/2 -translate-y-[1.35rem] items-center justify-center rounded-t-[1.25rem] border-x border-t border-white/14 bg-[#050507] text-white/72 shadow-[0_-8px_28px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.12)] outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white/35"
        >
          <ChevronDown
            className="h-4 w-4"
            strokeWidth={2.2}
            aria-hidden="true"
          />
        </button>
      ) : (
        <div
          role="group"
          aria-label="My List size controls"
          onPointerDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          className="pointer-events-auto absolute left-1/2 top-0 flex h-6 w-16 -translate-x-1/2 -translate-y-[1.35rem] items-center justify-center overflow-hidden rounded-t-[1.25rem] border-x border-t border-white/14 bg-[#050507] text-white/64 shadow-[0_-8px_28px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.12)]"
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
            <ChevronUp
              className="h-3.5 w-3.5"
              strokeWidth={2.2}
              aria-hidden="true"
            />
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
            <ChevronDown
              className="h-3.5 w-3.5"
              strokeWidth={2.2}
              aria-hidden="true"
            />
          </button>
        </div>
      )}
      <motion.div
        aria-hidden={!open}
        className={clsx(
          "flex flex-col overflow-hidden rounded-t-[1.65rem] border border-b-0 border-white/[0.095] bg-[#070708] text-white shadow-[0_-24px_70px_-18px_rgba(0,0,0,0.95),0_-8px_28px_rgba(0,0,0,0.46),inset_0_1px_0_rgba(255,255,255,0.075)]",
        )}
        initial={false}
        animate={{
          height: currentSheetHeight,
          maxHeight: currentSheetHeight,
        }}
        transition={
          prefersReducedMotion
            ? { duration: 0 }
            : keyboardGeometry.internalBottomInset > 0
              ? { duration: 0 }
              : { type: "spring", stiffness: 220, damping: 34, mass: 0.9 }
        }
        style={{
          paddingBottom: "calc(0.8rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div className="relative border-b border-white/[0.07] bg-black/[0.18] px-4 pb-1.5 pt-1.5 shadow-[inset_0_-1px_0_rgba(255,255,255,0.025)] sm:px-5">
          <div className="absolute left-4 top-1/2 flex -translate-y-1/2 items-center gap-1 sm:left-5">
            {isDefaultMyList ? (
              <button
                type="button"
                aria-label={
                  activeView === "list"
                    ? "Show Matrix view"
                    : "Show My List view"
                }
                onPointerDown={(event) => event.stopPropagation()}
                onTouchStart={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
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
                    setShouldInitializeMatrixTodo(true);
                    selectMyListViewModePreference("matrix");
                    return;
                  }

                  setShouldInitializeMatrixTodo(false);
                  selectMyListViewModePreference(
                    isMonumentLensActive
                      ? "monuments"
                      : isDayLensActive
                        ? "day"
                        : "priority",
                  );
                }}
                tabIndex={open ? 0 : -1}
                className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/[0.08] bg-black/24 p-0 text-white/54 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)] outline-none transition hover:border-white/[0.14] hover:bg-white/[0.055] hover:text-white/84 focus-visible:ring-2 focus-visible:ring-white/35"
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
            ) : null}
            <div ref={setMatrixSettingsTriggerTarget} className="flex" />
          </div>
          <h2 className="text-center text-[0.72rem] font-semibold leading-none tracking-[0.08em] text-white/90">
            {activeView === "list" ? (
              <button
                type="button"
                aria-label="Select list"
                aria-expanded={isListSelectorOpen}
                onClick={(event) => {
                  event.stopPropagation();
                  setIsCreateListOpen(false);
                  setIsListSelectorOpen((value) => !value);
                }}
                className="inline-flex h-7 items-center gap-1 rounded-lg px-2 outline-none hover:bg-white/[0.055] focus-visible:ring-2 focus-visible:ring-white/35"
              >
                <span className="max-w-[10rem] truncate">
                  {selectedListName}
                </span>
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
              </button>
            ) : (
              "MATRIX"
            )}
          </h2>
          {activeView === "list" ? (
            <div className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-1 sm:right-5">
              {isDefaultMyList ? (
                <button
                  type="button"
                  aria-label={
                    isMonumentLensActive
                      ? "Hide Monument grouping"
                      : "Show Monument grouping"
                  }
                  aria-pressed={isMonumentLensActive}
                  onClick={(event) => {
                    event.stopPropagation();
                    setActiveSkillPickerRowKey(null);
                    setActivePriorityPickerRowKey(null);
                    setActiveDayPickerRowKey(null);
                    setPendingDeleteRowId(null);
                    selectMyListViewModePreference(
                      isMonumentLensActive ? "priority" : "monuments",
                    );
                  }}
                  tabIndex={open ? 0 : -1}
                  className={clsx(
                    "flex h-6 w-6 items-center justify-center rounded-lg border bg-black/24 p-0 text-white/54 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)] outline-none transition hover:border-white/[0.14] hover:bg-white/[0.055] hover:text-white/84 focus-visible:ring-2 focus-visible:ring-white/35",
                    isMonumentLensActive
                      ? "border-white/[0.08] text-white"
                      : "border-white/[0.08]",
                  )}
                >
                  <Landmark
                    className="h-3.5 w-3.5"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                </button>
              ) : null}
              {isDefaultMyList ? (
                <button
                  type="button"
                  aria-label={
                    isDayLensActive ? "Hide Day grouping" : "Show Day grouping"
                  }
                  aria-pressed={isDayLensActive}
                  onClick={(event) => {
                    event.stopPropagation();
                    setActiveSkillPickerRowKey(null);
                    setActivePriorityPickerRowKey(null);
                    setActiveDayPickerRowKey(null);
                    setPendingDeleteRowId(null);
                    selectMyListViewModePreference(
                      isDayLensActive ? "priority" : "day",
                    );
                  }}
                  tabIndex={open ? 0 : -1}
                  className={clsx(
                    "flex h-6 w-6 items-center justify-center rounded-lg border bg-black/24 p-0 text-white/54 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)] outline-none transition hover:border-white/[0.14] hover:bg-white/[0.055] hover:text-white/84 focus-visible:ring-2 focus-visible:ring-white/35",
                    isDayLensActive
                      ? "border-white/[0.08] text-white"
                      : "border-white/[0.08]",
                  )}
                >
                  <Sun
                    className="h-3.5 w-3.5"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                </button>
              ) : null}
              <button
                type="button"
                aria-label="Create list"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsListSelectorOpen(false);
                  setIsCreateListOpen(true);
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
          {activeView === "list" && (isListSelectorOpen || isCreateListOpen) ? (
            <div
              className="absolute left-1/2 top-[calc(100%+0.35rem)] z-50 w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-white/12 bg-[#111113]/95 p-1.5 shadow-2xl backdrop-blur-xl"
              onClick={(event) => event.stopPropagation()}
            >
              {isCreateListOpen ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleCreateList();
                  }}
                  className="space-y-2 p-1.5"
                >
                  <label
                    htmlFor="my-list-name"
                    className="block text-[0.68rem] font-medium text-white/70"
                  >
                    List name
                  </label>
                  <input
                    ref={createListInputRef}
                    id="my-list-name"
                    value={newListName}
                    maxLength={MY_LIST_NAME_MAX_LENGTH}
                    onChange={(event) => setNewListName(event.target.value)}
                    className="h-9 w-full rounded-lg border border-white/12 bg-black/35 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/30"
                    placeholder="Groceries"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreateListOpen(false);
                        setNewListName("");
                      }}
                      className="h-8 rounded-lg px-3 text-xs text-white/60 hover:bg-white/[0.06]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!newListName.trim() || isCreatingList}
                      className="h-8 rounded-lg bg-white px-3 text-xs font-semibold text-black disabled:opacity-40"
                    >
                      {isCreatingList ? "Creating…" : "Create"}
                    </button>
                  </div>
                </form>
              ) : (
                <div
                  role="menu"
                  aria-label="My List lists"
                  className="max-h-64 overflow-y-auto"
                >
                  {[{ id: null, name: "My List" }, ...customLists].map(
                    (list) => (
                      <button
                        key={list.id ?? "default"}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selectedListId === list.id}
                        onClick={() => {
                          setSelectedListId(list.id);
                          setActiveView("list");
                          if (list.id) {
                            setIsDayLensActive(false);
                            setIsMonumentLensActive(false);
                          }
                          setIsListSelectorOpen(false);
                        }}
                        className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm text-white/85 hover:bg-white/[0.07]"
                      >
                        <span className="flex w-4 justify-center">
                          {selectedListId === list.id ? (
                            <Check className="h-4 w-4" aria-hidden="true" />
                          ) : null}
                        </span>
                        <span className="truncate">{list.name}</span>
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
        <div
          ref={sheetScrollRef}
          className={clsx(
            "min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5",
            activeManualReorderRowId
              ? "touch-none [-webkit-overflow-scrolling:auto]"
              : "[-webkit-overflow-scrolling:touch]",
          )}
          onTouchStart={handleSheetTouchStart}
          onTouchMove={handleSheetTouchMove}
          onTouchEnd={handleSheetTouchEnd}
          onTouchCancel={handleSheetTouchEnd}
          onWheel={handleSheetWheel}
          style={{
            paddingBottom:
              keyboardGeometry.internalBottomInset > 0
                ? `calc(0.75rem + ${keyboardGeometry.internalBottomInset}px)`
                : undefined,
            scrollPaddingBottom:
              keyboardGeometry.internalBottomInset > 0
                ? `${keyboardGeometry.internalBottomInset + 12}px`
                : undefined,
          }}
        >
          {activeView === "list" ? (
            <>
              {visiblePinnedGoalRows.length > 0 ? (
                <div className="border-b border-white/[0.055] pb-2">
                  {visiblePinnedGoalRows.map((goal) => {
                    const expanded = expandedPinnedGoalIds.has(goal.id);
                    const goalCompleted = isPinnedGoalCompleted(goal);
                    const descendantRows = [
                      ...goal.projects,
                      ...(goal.tasks ?? []),
                      ...(goal.habits ?? []),
                    ];
                    return (
                      <div key={`pinned-goal:${goal.id}`} className="min-w-0">
                        <div className="flex h-8 items-center pr-1.5">
                          <button
                            type="button"
                            aria-expanded={expanded}
                            aria-controls={`pinned-goal-projects:${goal.id}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              handlePinnedGoalRowClick(event, goal, expanded);
                            }}
                            tabIndex={open ? 0 : -1}
                            className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md pl-3 pr-1 text-left outline-none transition hover:bg-white/[0.035] focus-visible:ring-2 focus-visible:ring-white/30"
                          >
                            <span
                              className={clsx(
                                "flex h-5 w-5 shrink-0 items-center justify-center text-[0.8rem] text-white/62",
                                goalCompleted &&
                                  `rounded-md ${MY_LIST_COMPLETED_GOAL_ICON_CLASS}`,
                              )}
                              aria-hidden="true"
                            >
                              {resolvePinnedSourceIcon(goal)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[0.78rem] font-medium text-white/86">
                              {goal.title}
                            </span>
                            <ChevronDown
                              className={clsx(
                                "h-3.5 w-3.5 shrink-0 text-white/36 transition-transform",
                                expanded && "rotate-180",
                              )}
                              strokeWidth={1.8}
                              aria-hidden="true"
                            />
                          </button>
                          {renderDeleteRowButton(goal.id, "pinnedSource", goal)}
                        </div>
                        {expanded ? (
                          <div
                            id={`pinned-goal-projects:${goal.id}`}
                            className="pb-1"
                          >
                            {descendantRows.length > 0 ? (
                              descendantRows.map((descendant) => {
                                const completionKey = `${descendant.sourceType}:${descendant.id}`;
                                const isNestedProject =
                                  descendant.sourceType === "PROJECT";
                                const completedAt = isNestedProject
                                  ? (descendant.completedAt ?? null)
                                  : (pinnedSourceCompletions[completionKey] ??
                                    null);
                                const done = isNestedProject
                                  ? Boolean(completedAt) ||
                                    isProjectCompletionStage(descendant.stage)
                                  : Boolean(completedAt);
                                const isProjectCompletionPending =
                                  isNestedProject &&
                                  pendingPinnedGoalProjectCompletionIds.has(
                                    descendant.id,
                                  );
                                const canToggleCompletion = isNestedProject
                                  ? Boolean(
                                      onTogglePinnedGoalProjectCompletion,
                                    ) && !isProjectCompletionPending
                                  : descendant.isPinned === true;
                                const checkboxId = `my-list-goal-${descendant.sourceType.toLowerCase()}-${descendant.id}`;

                                return (
                                  <div
                                    key={`${descendant.sourceType}:${descendant.id}`}
                                    className="flex min-h-8 min-w-0 items-center gap-2 rounded-lg py-1 pl-5 pr-2 text-sm transition-colors hover:bg-white/[0.025]"
                                  >
                                    <span
                                      data-my-list-checkbox
                                      onPointerDown={
                                        stopMyListCheckboxInteraction
                                      }
                                      onTouchStart={
                                        stopMyListCheckboxInteraction
                                      }
                                      onMouseDown={
                                        stopMyListCheckboxInteraction
                                      }
                                      onClick={stopMyListCheckboxInteraction}
                                      className="-m-1.5 flex h-7 w-7 shrink-0 items-center justify-center"
                                    >
                                      <input
                                        id={checkboxId}
                                        type="checkbox"
                                        checked={done}
                                        disabled={!canToggleCompletion}
                                        onChange={(event) => {
                                          if (!canToggleCompletion) return;
                                          const checked = event.target.checked;

                                          if (isNestedProject) {
                                            const sourceElement =
                                              event.currentTarget.closest(
                                                "[data-my-list-checkbox]",
                                              );
                                            const sourceRect =
                                              sourceElement instanceof
                                              HTMLElement
                                                ? toCreatorXpBurstRect(
                                                    sourceElement.getBoundingClientRect(),
                                                  )
                                                : null;
                                            setPendingPinnedGoalProjectCompletionIds(
                                              (currentIds) => {
                                                const nextIds = new Set(
                                                  currentIds,
                                                );
                                                nextIds.add(descendant.id);
                                                return nextIds;
                                              },
                                            );
                                            void Promise.resolve(
                                              onTogglePinnedGoalProjectCompletion?.(
                                                descendant,
                                                checked,
                                                sourceRect,
                                              ),
                                            )
                                              .catch((error) => {
                                                console.error(
                                                  "Pinned Goal Project completion failed",
                                                  error,
                                                );
                                              })
                                              .finally(() => {
                                                setPendingPinnedGoalProjectCompletionIds(
                                                  (currentIds) => {
                                                    const nextIds = new Set(
                                                      currentIds,
                                                    );
                                                    nextIds.delete(
                                                      descendant.id,
                                                    );
                                                    return nextIds;
                                                  },
                                                );
                                              });
                                            return;
                                          }

                                          const nextCompletedAt = checked
                                            ? new Date().toISOString()
                                            : null;
                                          setPinnedSourceCompletions(
                                            (current) => ({
                                              ...current,
                                              [completionKey]: nextCompletedAt,
                                            }),
                                          );
                                          onTogglePinnedSourceCompletion?.(
                                            descendant,
                                            nextCompletedAt,
                                          );
                                        }}
                                        tabIndex={
                                          open && canToggleCompletion ? 0 : -1
                                        }
                                        className="peer sr-only"
                                      />
                                      <label
                                        htmlFor={checkboxId}
                                        aria-label={
                                          canToggleCompletion
                                            ? done
                                              ? `Mark ${descendant.sourceType.toLowerCase()} incomplete`
                                              : `Mark ${descendant.sourceType.toLowerCase()} complete`
                                            : `${descendant.sourceType.toLowerCase()} completion is unavailable`
                                        }
                                        className={clsx(
                                          "relative flex h-4 w-4 shrink-0 items-center justify-center rounded-[0.32rem] border transition peer-focus-visible:ring-2 peer-focus-visible:ring-white/35 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-zinc-950",
                                          done
                                            ? "shimmer-border-complete focus-pomo-start-glint isolate z-0 overflow-hidden border-green-900/45 bg-[linear-gradient(155deg,rgba(34,197,94,0.94)_0%,rgba(22,163,74,0.97)_48%,rgba(21,128,61,0.98)_100%)] text-white ring-1 ring-green-900/45"
                                            : "border-white/16 bg-black/24 text-transparent",
                                          canToggleCompletion
                                            ? "cursor-pointer"
                                            : "cursor-default opacity-55",
                                        )}
                                      >
                                        <span
                                          className={clsx(
                                            "h-2 w-1.5 rotate-45 border-b-2 border-r-2 border-current transition-opacity",
                                            done ? "opacity-100" : "opacity-0",
                                          )}
                                        />
                                      </label>
                                    </span>
                                    <span
                                      className="flex h-4 w-4 shrink-0 items-center justify-center text-[0.72rem] text-white/56"
                                      aria-hidden="true"
                                    >
                                      {resolvePinnedSourceIcon(descendant)}
                                    </span>
                                    <span
                                      className={clsx(
                                        "truncate text-[0.74rem] text-white/68",
                                        done && "text-white/38 line-through",
                                      )}
                                    >
                                      {descendant.title}
                                    </span>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="py-1.5 pl-11 text-[0.68rem] text-white/34">
                                No linked items.
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <DndContext
                sensors={manualReorderSensors}
                collisionDetection={manualReorderCollisionDetection}
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
                          if (
                            section.sectionType ===
                            "compact-empty-monument-groups"
                          ) {
                            return (
                              <div
                                key={`compact-empty-monuments:${section.groups
                                  .map((group) => group.id)
                                  .join(":")}`}
                                className="flex flex-wrap items-center gap-1.5 px-3 py-1"
                              >
                                {section.groups.map((group) => {
                                  const monumentIcon =
                                    "icon" in group ? group.icon : null;

                                  return (
                                    <span
                                      key={group.id}
                                      className="inline-flex h-6 items-center gap-1.5 rounded-full border border-white/[0.1] bg-zinc-400/[0.09] px-2 text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-white/62"
                                    >
                                      {monumentIcon ? (
                                        <span
                                          className="text-[0.72rem] leading-none"
                                          aria-hidden="true"
                                        >
                                          {monumentIcon}
                                        </span>
                                      ) : (
                                        <Landmark
                                          className="h-3 w-3"
                                          strokeWidth={1.9}
                                          aria-hidden="true"
                                        />
                                      )}
                                      <span>{group.label}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            );
                          }

                          if (section.sectionType === "compact-day-groups") {
                            return (
                              <div
                                key={`compact-day-groups:${section.groups
                                  .map((group) => group.id)
                                  .join(":")}`}
                                className="flex flex-wrap items-center gap-1.5 px-3 py-1"
                              >
                                {section.groups.map((group) => {
                                  if (isMonumentLensActive) {
                                    const monumentIcon =
                                      "icon" in group ? group.icon : null;
                                    return (
                                      <button
                                        key={group.id}
                                        type="button"
                                        aria-expanded={false}
                                        aria-label={`Expand ${group.label} group`}
                                        data-my-list-no-schedule-drag
                                        data-my-list-no-upgrade
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setCollapsedMonumentGroups(
                                            (current) => ({
                                              ...current,
                                              [group.id]: false,
                                            }),
                                          );
                                        }}
                                        tabIndex={open ? 0 : -1}
                                        className="inline-flex h-6 items-center gap-1.5 rounded-full border border-white/[0.1] bg-zinc-400/[0.09] px-2 text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-white/62 outline-none transition hover:bg-white/[0.08] hover:text-white/82 focus-visible:ring-2 focus-visible:ring-white/35"
                                      >
                                        {monumentIcon ? (
                                          <span
                                            className="text-[0.72rem] leading-none"
                                            aria-hidden="true"
                                          >
                                            {monumentIcon}
                                          </span>
                                        ) : (
                                          <Landmark
                                            className="h-3 w-3"
                                            strokeWidth={1.9}
                                            aria-hidden="true"
                                          />
                                        )}
                                        <span>{group.label}</span>
                                      </button>
                                    );
                                  }

                                  const bucketId =
                                    group.id as MyListDayViewBucketId;
                                  const dayVisual =
                                    MY_LIST_DAY_VISUALS[bucketId];
                                  const DayIcon = dayVisual.Icon;
                                  const manualReorderGroup = {
                                    kind: "day",
                                    id: bucketId,
                                  } satisfies MyListManualReorderGroup;

                                  return (
                                    <MyListManualTodoGroupDropZone
                                      key={bucketId}
                                      group={manualReorderGroup}
                                      dayDropBucketId={bucketId}
                                      className="inline-flex"
                                    >
                                      {(isOver) => {
                                        const isManualTodoOver =
                                          isOver &&
                                          activeManualReorderRowId !== null;

                                        return (
                                          <button
                                            type="button"
                                            aria-expanded={false}
                                            aria-label={`Expand ${group.label} group`}
                                            data-my-list-no-schedule-drag
                                            data-my-list-no-upgrade
                                            onPointerDown={(event) =>
                                              event.stopPropagation()
                                            }
                                            onTouchStart={(event) =>
                                              event.stopPropagation()
                                            }
                                            onMouseDown={(event) =>
                                              event.stopPropagation()
                                            }
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              setCollapsedDayGroups(
                                                (current) => ({
                                                  ...current,
                                                  [bucketId]: false,
                                                }),
                                              );
                                            }}
                                            tabIndex={open ? 0 : -1}
                                            className={clsx(
                                              "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-[0.62rem] font-semibold uppercase tracking-[0.08em] outline-none transition duration-150 hover:opacity-95 focus-visible:ring-2 focus-visible:ring-white/35",
                                              dayVisual.pillClassName,
                                              isManualTodoOver &&
                                                "scale-[1.04] border-white/45 bg-white/[0.16] text-white shadow-[0_0_12px_rgba(255,255,255,0.14)] ring-1 ring-white/30",
                                            )}
                                          >
                                            <DayIcon
                                              className="h-3 w-3"
                                              strokeWidth={1.9}
                                              aria-hidden="true"
                                            />
                                            <span>{group.label}</span>
                                          </button>
                                        );
                                      }}
                                    </MyListManualTodoGroupDropZone>
                                  );
                                })}
                              </div>
                            );
                          }

                          const { group } = section;
                          const isCompletedSection =
                            section.sectionType === "completed";
                          const dayDropBucketId =
                            !isCompletedSection &&
                            isDayLensActive &&
                            MY_LIST_DAY_VIEW_BUCKETS.includes(
                              group.id as MyListDayViewBucketId,
                            )
                              ? (group.id as MyListDayViewBucketId)
                              : null;
                          const isActiveDayDropTarget =
                            dayDropBucketId !== null &&
                            dayDragDropBucketId === dayDropBucketId;
                          const manualReorderGroup: MyListManualReorderGroup | null =
                            !isCompletedSection &&
                            isDayLensActive &&
                            dayDropBucketId
                              ? { kind: "day", id: dayDropBucketId }
                              : !isCompletedSection && isMonumentLensActive
                                ? { kind: "monument", id: group.id }
                                : !isCompletedSection &&
                                    PRIORITY_ORDER.includes(
                                      group.id as PriorityBucketId,
                                    )
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
                                  : "border-transparent bg-transparent",
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
                                        <button
                                          type="button"
                                          aria-expanded={true}
                                          aria-label={`Collapse ${group.label} group`}
                                          data-my-list-no-schedule-drag
                                          data-my-list-no-upgrade
                                          onPointerDown={(event) =>
                                            event.stopPropagation()
                                          }
                                          onTouchStart={(event) =>
                                            event.stopPropagation()
                                          }
                                          onMouseDown={(event) =>
                                            event.stopPropagation()
                                          }
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            setCollapsedDayGroups(
                                              (current) => ({
                                                ...current,
                                                [dayDropBucketId]: true,
                                              }),
                                            );
                                          }}
                                          tabIndex={open ? 0 : -1}
                                          className={clsx(
                                            "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-[0.62rem] font-semibold uppercase tracking-[0.08em] outline-none transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-white/35",
                                            dayVisual.pillClassName,
                                          )}
                                        >
                                          <DayIcon
                                            className="h-3 w-3"
                                            strokeWidth={1.9}
                                            aria-hidden="true"
                                          />
                                          <span>{group.label}</span>
                                        </button>
                                      );
                                    })()}
                                  </div>
                                ) : isMonumentLensActive &&
                                  !isCompletedSection ? (
                                  <div className="px-2 pt-1">
                                    {(() => {
                                      const monumentIcon =
                                        "icon" in group ? group.icon : null;

                                      return (
                                        <button
                                          type="button"
                                          aria-expanded={true}
                                          aria-label={`Collapse ${group.label} group`}
                                          data-my-list-no-schedule-drag
                                          data-my-list-no-upgrade
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            setCollapsedMonumentGroups(
                                              (current) => ({
                                                ...current,
                                                [group.id]: true,
                                              }),
                                            );
                                          }}
                                          tabIndex={open ? 0 : -1}
                                          className="inline-flex h-6 items-center gap-1.5 rounded-full border border-white/[0.1] bg-zinc-400/[0.09] px-2 text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-white/62 outline-none transition hover:bg-white/[0.08] hover:text-white/82 focus-visible:ring-2 focus-visible:ring-white/35"
                                        >
                                          {monumentIcon ? (
                                            <span
                                              className="text-[0.72rem] leading-none"
                                              aria-hidden="true"
                                            >
                                              {monumentIcon}
                                            </span>
                                          ) : (
                                            <Landmark
                                              className="h-3 w-3"
                                              strokeWidth={1.9}
                                              aria-hidden="true"
                                            />
                                          )}
                                          <span>{group.label}</span>
                                        </button>
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
                                const sortableRowKey =
                                  getSortableTodoRowKey(visibleRow);
                                const renderTopLevelTodoRow = (
                                  sortableProps?: MyListSortableManualTodoHandleProps,
                                ) => {
                                  const isDragging =
                                    sortableProps?.isDragging ?? false;

                                  if (visibleRow.rowType === "task") {
                                    const task = visibleRow.task;
                                    const rowKey = `task:${task.id}` as const;
                                    const completionExitState =
                                      completionExitRows[rowKey];
                                    const taskCompletionOverride =
                                      taskOverrides[task.id];
                                    const hasTaskCompletionOverride = Boolean(
                                      taskCompletionOverride &&
                                      "completedAt" in taskCompletionOverride,
                                    );
                                    const done =
                                      Boolean(
                                        completionExitState?.completedAt,
                                      ) ||
                                      (hasTaskCompletionOverride
                                        ? Boolean(
                                            taskCompletionOverride?.completedAt,
                                          )
                                        : task.stage
                                            ?.toString()
                                            .toUpperCase() === "PERFECT");
                                    const pending = pendingTaskIds.has(task.id);
                                    const taskSkill =
                                      resolveTaskSkillMetadata(task);
                                    const priorityId =
                                      resolveTaskPriorityId(task);
                                    const dayBucketId =
                                      resolveTaskDayBucketId(task);
                                    const dayViewBucketId =
                                      dayBucketId ?? "anytime";
                                    const dayVisual =
                                      MY_LIST_DAY_VISUALS[dayViewBucketId];
                                    const DayIcon = dayVisual.Icon;
                                    const priorityOption =
                                      QUICK_CREATE_PRIORITY_OPTIONS.find(
                                        (option) => option.id === priorityId,
                                      ) ?? defaultPriority;
                                    const prioritySymbol =
                                      priorityOption.symbol ||
                                      QUICK_CREATE_PRIORITY_PLACEHOLDER_SYMBOL;
                                    const taskText =
                                      taskOverrides[task.id]?.text ?? task.name;
                                    const taskTitle =
                                      taskText.trim() || task.name.trim();
                                    const checkboxId = `my-list-task-${task.id}`;
                                    const priorityMetadata =
                                      resolvePriorityScheduleMetadata(
                                        priorityId,
                                      );
                                    const taskScheduleDragRow: MyListScheduleDragRow =
                                      {
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
                                          presentationKind:
                                            MY_LIST_SCHEDULE_PRESENTATION_KIND,
                                          taskId: task.id,
                                          skillId: taskSkill.skillId ?? null,
                                          skillName:
                                            taskSkill.skillName ?? null,
                                          skillIcon:
                                            taskSkill.skillIcon ?? null,
                                          ...priorityMetadata,
                                        },
                                      };

                                    return (
                                      <div
                                        key={rowKey}
                                        data-creator-xp-source="my-list-todo"
                                        data-creator-xp-kind="todo"
                                        data-my-list-schedule-drag-row={
                                          canStartTodoRowLongPress
                                            ? "true"
                                            : undefined
                                        }
                                        onPointerDownCapture={(event) =>
                                          activateTodoRowFromPointer(
                                            event,
                                            rowKey,
                                          )
                                        }
                                        onFocusCapture={(event) =>
                                          activateTodoRowFromFocus(
                                            event,
                                            rowKey,
                                          )
                                        }
                                        onPointerDown={(event) =>
                                          startScheduleDragPress(
                                            event,
                                            taskScheduleDragRow,
                                          )
                                        }
                                        onPointerMove={
                                          handleScheduleDragPointerMove
                                        }
                                        onPointerUp={
                                          handleScheduleDragPointerEnd
                                        }
                                        onPointerCancel={
                                          handleScheduleDragPointerEnd
                                        }
                                        onTouchStart={(event) =>
                                          startScheduleDragTouchPress(
                                            event,
                                            taskScheduleDragRow,
                                          )
                                        }
                                        onTouchMove={
                                          handleScheduleDragTouchMove
                                        }
                                        onTouchEnd={handleScheduleDragTouchEnd}
                                        onTouchCancel={
                                          handleScheduleDragTouchEnd
                                        }
                                        onSelectCapture={(event) => {
                                          if (scheduleDragPressRef.current) {
                                            event.preventDefault();
                                          }
                                        }}
                                        onContextMenu={(event) => {
                                          if (
                                            !shouldIgnoreScheduleDragTarget(
                                              event.target,
                                            )
                                          ) {
                                            event.preventDefault();
                                          }
                                        }}
                                        className={clsx(
                                          "group/todo-row flex min-h-8 select-none items-center gap-2 rounded-lg bg-transparent py-1 pl-3 pr-1.5 text-sm text-white/84 transition-colors hover:bg-white/[0.035] [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] [-webkit-user-select:none] [user-select:none]",
                                          canStartTodoRowLongPress &&
                                            (isScheduleDragActive
                                              ? "cursor-grabbing"
                                              : "cursor-grab"),
                                          pending && "opacity-60",
                                        )}
                                        style={
                                          MY_LIST_MANUAL_UPGRADE_NO_SELECT_STYLE
                                        }
                                      >
                                        <span
                                          data-my-list-checkbox
                                          onPointerDown={
                                            stopMyListCheckboxInteraction
                                          }
                                          onTouchStart={
                                            stopMyListCheckboxInteraction
                                          }
                                          onMouseDown={
                                            stopMyListCheckboxInteraction
                                          }
                                          onClick={
                                            stopMyListCheckboxInteraction
                                          }
                                          className="-m-1.5 flex h-7 w-7 shrink-0 items-center justify-center"
                                        >
                                          <input
                                            id={checkboxId}
                                            type="checkbox"
                                            checked={done}
                                            disabled={
                                              pending ||
                                              Boolean(completionExitState)
                                            }
                                            onChange={(event) => {
                                              setPendingDeleteRowId(null);
                                              const checked =
                                                event.target.checked;
                                              const completedAt = checked
                                                ? new Date().toISOString()
                                                : null;
                                              const previousCompletedAt =
                                                hasTaskCompletionOverride
                                                  ? (taskCompletionOverride?.completedAt ??
                                                    null)
                                                  : readCompletedAtFromUnknown(
                                                      task,
                                                    );

                                              setTaskOverrides(
                                                (currentOverrides) => ({
                                                  ...currentOverrides,
                                                  [task.id]: {
                                                    ...currentOverrides[
                                                      task.id
                                                    ],
                                                    completedAt,
                                                  },
                                                }),
                                              );

                                              if (completedAt) {
                                                beginCompletionExit(
                                                  rowKey,
                                                  completedAt,
                                                  visibleRow,
                                                );
                                              } else {
                                                cancelCompletionExit(rowKey);
                                              }

                                              const sourceElement =
                                                event.currentTarget.closest(
                                                  '[data-creator-xp-source="my-list-todo"]',
                                                );
                                              const sourceRect =
                                                sourceElement instanceof
                                                HTMLElement
                                                  ? toCreatorXpBurstRect(
                                                      sourceElement.getBoundingClientRect(),
                                                    )
                                                  : null;
                                              void Promise.resolve(
                                                onToggleTask(
                                                  task.id,
                                                  sourceRect,
                                                  {
                                                    skillId: taskSkill.skillId,
                                                    monumentId:
                                                      taskSkill.monumentId,
                                                  },
                                                ),
                                              )
                                                .then((success) => {
                                                  if (success === false) {
                                                    setTaskOverrides(
                                                      (currentOverrides) => ({
                                                        ...currentOverrides,
                                                        [task.id]: {
                                                          ...currentOverrides[
                                                            task.id
                                                          ],
                                                          completedAt:
                                                            previousCompletedAt,
                                                        },
                                                      }),
                                                    );
                                                    cancelCompletionExit(
                                                      rowKey,
                                                    );
                                                  }
                                                })
                                                .catch((error) => {
                                                  console.error(
                                                    "My List task completion handler failed",
                                                    error,
                                                  );
                                                  setTaskOverrides(
                                                    (currentOverrides) => ({
                                                      ...currentOverrides,
                                                      [task.id]: {
                                                        ...currentOverrides[
                                                          task.id
                                                        ],
                                                        completedAt:
                                                          previousCompletedAt,
                                                      },
                                                    }),
                                                  );
                                                  cancelCompletionExit(rowKey);
                                                });
                                            }}
                                            tabIndex={open ? 0 : -1}
                                            className="peer sr-only disabled:cursor-wait"
                                          />
                                          <label
                                            htmlFor={checkboxId}
                                            aria-label={
                                              done
                                                ? "Mark to-do incomplete"
                                                : "Mark to-do complete"
                                            }
                                            className={clsx(
                                              "relative flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-[0.32rem] border transition peer-focus-visible:ring-2 peer-focus-visible:ring-white/35 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-zinc-950",
                                              done
                                                ? "shimmer-border-complete focus-pomo-start-glint isolate z-0 overflow-hidden border-green-900/45 bg-[linear-gradient(155deg,rgba(34,197,94,0.94)_0%,rgba(22,163,74,0.97)_48%,rgba(21,128,61,0.98)_100%)] text-white shadow-[0_8px_16px_rgba(3,83,45,0.24),inset_0_1px_0_rgba(255,255,255,0.045),inset_0_-2px_8px_rgba(0,0,0,0.11),inset_0_0_0_1px_rgba(0,0,0,0.08)] ring-1 ring-green-900/45"
                                                : "border-white/16 bg-black/24 text-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
                                            )}
                                          >
                                            <span
                                              className={clsx(
                                                "h-2 w-1.5 rotate-45 border-b-2 border-r-2 border-current transition-opacity",
                                                done
                                                  ? "opacity-100"
                                                  : "opacity-0",
                                              )}
                                            />
                                          </label>
                                        </span>
                                        <div className="relative h-4 w-4 shrink-0">
                                          <button
                                            type="button"
                                            aria-label={
                                              taskSkill.skillName
                                                ? `Change Skill: ${taskSkill.skillName}`
                                                : "Choose Skill"
                                            }
                                            aria-haspopup="listbox"
                                            aria-expanded={
                                              activeSkillPickerRowKey === rowKey
                                            }
                                            title={
                                              taskSkill.skillName ??
                                              "Choose Skill"
                                            }
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              setActivePriorityPickerRowKey(
                                                null,
                                              );
                                              setActiveDayPickerRowKey(null);
                                              setManualSkillSearch("");
                                              setActiveSkillPickerRowKey(
                                                (currentRowKey) =>
                                                  currentRowKey === rowKey
                                                    ? null
                                                    : rowKey,
                                              );
                                            }}
                                            tabIndex={open ? 0 : -1}
                                            className={clsx(
                                              "flex h-4 w-4 items-center justify-center bg-transparent p-0 text-center text-[0.78rem] leading-none text-white/70 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white/35",
                                              done && "text-white/42",
                                            )}
                                          >
                                            {taskSkill.skillIcon}
                                          </button>
                                          {renderSkillPicker(
                                            rowKey,
                                            taskSkill.skillId,
                                            (skill) =>
                                              handleTaskSkillSelect(
                                                task.id,
                                                skill,
                                              ),
                                          )}
                                        </div>
                                        <input
                                          type="text"
                                          value={taskText}
                                          onPointerDown={(event) =>
                                            event.stopPropagation()
                                          }
                                          onTouchStart={(event) =>
                                            event.stopPropagation()
                                          }
                                          onMouseDown={(event) =>
                                            event.stopPropagation()
                                          }
                                          onClick={(event) =>
                                            event.stopPropagation()
                                          }
                                          onKeyDown={(event) =>
                                            handleTodoTitleKeyDown(
                                              event,
                                              "task",
                                              task.id,
                                            )
                                          }
                                          onChange={(event) => {
                                            const nextText = event.target.value;
                                            setTaskOverrides(
                                              (currentOverrides) => ({
                                                ...currentOverrides,
                                                [task.id]: {
                                                  ...currentOverrides[task.id],
                                                  text: nextText,
                                                },
                                              }),
                                            );
                                          }}
                                          placeholder={manualRowInputPlaceholder}
                                          aria-label={manualRowInputAriaLabel}
                                          tabIndex={open ? 0 : -1}
                                          className={clsx(
                                            "min-w-0 flex-1 select-text bg-transparent p-0 leading-snug text-white/84 outline-none placeholder:text-white/30 [-webkit-touch-callout:default] [-webkit-user-select:text] [user-select:text]",
                                            done &&
                                              "text-white/42 line-through",
                                          )}
                                        />
                                        <div
                                          className={clsx(
                                            "-mr-1 ml-auto flex shrink-0 items-center justify-end gap-0 transition-opacity duration-150 group-hover/todo-row:pointer-events-auto group-hover/todo-row:w-auto group-hover/todo-row:overflow-visible group-hover/todo-row:opacity-100 group-focus-within/todo-row:pointer-events-auto group-focus-within/todo-row:w-auto group-focus-within/todo-row:overflow-visible group-focus-within/todo-row:opacity-100",
                                            areTodoRowControlsRevealed(rowKey)
                                              ? "w-auto overflow-visible opacity-100 pointer-events-auto"
                                              : "w-0 overflow-hidden opacity-0 pointer-events-none",
                                          )}
                                        >
                                          <div className="relative shrink-0">
                                            <button
                                              type="button"
                                              aria-label={`Choose priority: ${priorityOption.label}`}
                                              aria-haspopup="listbox"
                                              aria-expanded={
                                                activePriorityPickerRowKey ===
                                                rowKey
                                              }
                                              title={priorityOption.label}
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                setActiveSkillPickerRowKey(
                                                  null,
                                                );
                                                setActiveDayPickerRowKey(null);
                                                setActivePriorityPickerRowKey(
                                                  (currentRowKey) =>
                                                    currentRowKey === rowKey
                                                      ? null
                                                      : rowKey,
                                                );
                                              }}
                                              tabIndex={open ? 0 : -1}
                                              className={clsx(
                                                "flex h-7 min-w-7 items-center justify-center rounded-full bg-black/10 px-1 text-[10px] font-black leading-none text-white/46 outline-none transition hover:bg-white/[0.045] hover:text-white/72 focus-visible:ring-2 focus-visible:ring-white/35",
                                                done && "text-white/42",
                                              )}
                                            >
                                              <span className="max-w-8 truncate">
                                                {prioritySymbol}
                                              </span>
                                            </button>
                                            {renderPriorityPicker(
                                              rowKey,
                                              priorityId,
                                              (nextId) =>
                                                handlePrioritySelect(
                                                  task.id,
                                                  "task",
                                                  nextId,
                                                ),
                                            )}
                                          </div>
                                          <div className="relative shrink-0">
                                            <button
                                              type="button"
                                              aria-label={`Choose day: ${MY_LIST_DAY_LABELS[dayViewBucketId]}`}
                                              aria-haspopup="listbox"
                                              aria-expanded={
                                                activeDayPickerRowKey === rowKey
                                              }
                                              title={
                                                MY_LIST_DAY_LABELS[
                                                  dayViewBucketId
                                                ]
                                              }
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                setActiveSkillPickerRowKey(
                                                  null,
                                                );
                                                setActivePriorityPickerRowKey(
                                                  null,
                                                );
                                                setActiveDayPickerRowKey(
                                                  (currentRowKey) =>
                                                    currentRowKey === rowKey
                                                      ? null
                                                      : rowKey,
                                                );
                                              }}
                                              tabIndex={open ? 0 : -1}
                                              className={clsx(
                                                "flex h-7 min-w-7 items-center justify-center rounded-full border px-1.5 outline-none transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-white/35",
                                                dayVisual.pillClassName,
                                                done && "text-white/42",
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
                                              dayBucketId,
                                              (nextId) =>
                                                handleDaySelect(
                                                  task.id,
                                                  "task",
                                                  nextId,
                                                ),
                                            )}
                                          </div>
                                          {renderDeleteRowButton(
                                            task.id,
                                            "task",
                                          )}
                                        </div>
                                      </div>
                                    );
                                  }

                                  if (visibleRow.rowType === "pinnedSource") {
                                    const row = visibleRow.row;
                                    const completionKey = `${row.sourceType}:${row.id}`;
                                    const rowKey = buildPinnedSourceRowKey(
                                      row.sourceType,
                                      row.id,
                                    );
                                    const completionExitState =
                                      completionExitRows[rowKey];
                                    const completedAt =
                                      completionExitState?.completedAt ??
                                      pinnedSourceCompletions[completionKey] ??
                                      null;
                                    const done = Boolean(completedAt);
                                    const checkboxId = `my-list-pinned-${row.sourceType.toLowerCase()}-${row.id}`;
                                    const priorityId =
                                      row.priorityId ??
                                      normalizePriority(
                                        row.priority ?? defaultPriority.id,
                                      );
                                    const priorityOption =
                                      QUICK_CREATE_PRIORITY_OPTIONS.find(
                                        (option) => option.id === priorityId,
                                      ) ?? defaultPriority;
                                    const prioritySymbol =
                                      priorityOption.symbol ||
                                      QUICK_CREATE_PRIORITY_PLACEHOLDER_SYMBOL;
                                    const dayBucketId = row.dayBucketId ?? null;
                                    const dayViewBucketId =
                                      dayBucketId ?? "anytime";
                                    const dayVisual =
                                      MY_LIST_DAY_VISUALS[dayViewBucketId];
                                    const DayIcon = dayVisual.Icon;
                                    const title =
                                      row.title.trim() ||
                                      `Untitled ${row.sourceType.toLowerCase()}`;
                                    const sourceIcon =
                                      resolvePinnedSourceIcon(row);
                                    const isGoalRow = row.sourceType === "GOAL";

                                    return (
                                      <div
                                        data-creator-xp-source="my-list-todo"
                                        data-creator-xp-kind="todo"
                                        onPointerDownCapture={(event) =>
                                          activateTodoRowFromPointer(
                                            event,
                                            rowKey,
                                          )
                                        }
                                        onFocusCapture={(event) =>
                                          activateTodoRowFromFocus(
                                            event,
                                            rowKey,
                                          )
                                        }
                                        className={clsx(
                                          "group/todo-row relative flex min-h-8 select-none items-center gap-2 rounded-lg bg-transparent py-1 pl-3 pr-1.5 text-sm text-white/84 transition-[background-color,box-shadow,opacity,transform] hover:bg-white/[0.035] [-webkit-touch-callout:none] [-webkit-user-select:none] [user-select:none]",
                                          open &&
                                            activeView === "list" &&
                                            "cursor-pointer",
                                          (isDragging ||
                                            activeManualReorderRowId ===
                                              rowKey) &&
                                            "z-30 scale-[1.012] cursor-grabbing bg-white/[0.075] opacity-95 shadow-[0_12px_34px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-white/[0.13]",
                                        )}
                                        style={
                                          MY_LIST_MANUAL_UPGRADE_NO_SELECT_STYLE
                                        }
                                      >
                                        <span
                                          data-my-list-checkbox
                                          onPointerDown={
                                            stopMyListCheckboxInteraction
                                          }
                                          onTouchStart={
                                            stopMyListCheckboxInteraction
                                          }
                                          onMouseDown={
                                            stopMyListCheckboxInteraction
                                          }
                                          onClick={
                                            stopMyListCheckboxInteraction
                                          }
                                          className="-m-1.5 flex h-7 w-7 shrink-0 items-center justify-center"
                                        >
                                          <input
                                            id={checkboxId}
                                            type="checkbox"
                                            checked={done}
                                            disabled={Boolean(
                                              completionExitState,
                                            )}
                                            onChange={(event) => {
                                              const nextCompletedAt = event
                                                .target.checked
                                                ? new Date().toISOString()
                                                : null;
                                              const previousCompletedAt =
                                                pinnedSourceCompletions[
                                                  completionKey
                                                ] ?? null;
                                              setPendingDeleteRowId(null);
                                              setPinnedSourceCompletions(
                                                (current) => ({
                                                  ...current,
                                                  [completionKey]:
                                                    nextCompletedAt,
                                                }),
                                              );
                                              if (nextCompletedAt) {
                                                beginCompletionExit(
                                                  rowKey,
                                                  nextCompletedAt,
                                                  visibleRow,
                                                );
                                              } else {
                                                cancelCompletionExit(rowKey);
                                              }
                                              void Promise.resolve(
                                                onTogglePinnedSourceCompletion?.(
                                                  row,
                                                  nextCompletedAt,
                                                ),
                                              )
                                                .then((success) => {
                                                  if (success !== false) return;

                                                  setPinnedSourceCompletions(
                                                    (current) => ({
                                                      ...current,
                                                      [completionKey]:
                                                        previousCompletedAt,
                                                    }),
                                                  );
                                                  cancelCompletionExit(rowKey);
                                                })
                                                .catch((error) => {
                                                  console.error(
                                                    "My List pinned completion handler failed",
                                                    error,
                                                  );
                                                  setPinnedSourceCompletions(
                                                    (current) => ({
                                                      ...current,
                                                      [completionKey]:
                                                        previousCompletedAt,
                                                    }),
                                                  );
                                                  cancelCompletionExit(rowKey);
                                                });
                                            }}
                                            tabIndex={open ? 0 : -1}
                                            className="peer sr-only disabled:cursor-wait"
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
                                                : "border-white/16 bg-black/24 text-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
                                            )}
                                          >
                                            <span
                                              className={clsx(
                                                "h-2 w-1.5 rotate-45 border-b-2 border-r-2 border-current transition-opacity",
                                                done
                                                  ? "opacity-100"
                                                  : "opacity-0",
                                              )}
                                            />
                                          </label>
                                        </span>
                                        <span
                                          className={clsx(
                                            "flex h-4 w-4 shrink-0 items-center justify-center text-center text-[0.78rem] leading-none text-white/70",
                                            !row.icon?.trim() &&
                                              "text-white/36",
                                            done && "text-white/42",
                                          )}
                                          title={row.sourceType.toLowerCase()}
                                          aria-hidden="true"
                                        >
                                          {sourceIcon}
                                        </span>
                                        <span
                                          className={clsx(
                                            "min-w-0 flex-1 truncate leading-snug text-white/84",
                                            done &&
                                              "text-white/42 line-through",
                                          )}
                                        >
                                          {title}
                                        </span>
                                        <div
                                          className={clsx(
                                            "-mr-1 ml-auto flex shrink-0 items-center justify-end gap-0 transition-opacity duration-150 group-hover/todo-row:pointer-events-auto group-hover/todo-row:w-auto group-hover/todo-row:overflow-visible group-hover/todo-row:opacity-100 group-focus-within/todo-row:pointer-events-auto group-focus-within/todo-row:w-auto group-focus-within/todo-row:overflow-visible group-focus-within/todo-row:opacity-100",
                                            areTodoRowControlsRevealed(
                                              rowKey,
                                              isDragging ||
                                                activeManualReorderRowId ===
                                                  rowKey,
                                            )
                                              ? "w-auto overflow-visible opacity-100 pointer-events-auto"
                                              : "w-0 overflow-hidden opacity-0 pointer-events-none",
                                          )}
                                        >
                                          <div className="relative shrink-0">
                                            <button
                                              type="button"
                                              aria-label={`Choose priority: ${priorityOption.label}`}
                                              aria-haspopup="listbox"
                                              aria-expanded={
                                                activePriorityPickerRowKey ===
                                                rowKey
                                              }
                                              title={priorityOption.label}
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                setActiveSkillPickerRowKey(
                                                  null,
                                                );
                                                setActiveDayPickerRowKey(null);
                                                setActivePriorityPickerRowKey(
                                                  (currentRowKey) =>
                                                    currentRowKey === rowKey
                                                      ? null
                                                      : rowKey,
                                                );
                                              }}
                                              tabIndex={open ? 0 : -1}
                                              className={clsx(
                                                "flex h-7 min-w-7 items-center justify-center rounded-full bg-black/10 px-1 text-[10px] font-black leading-none text-white/46 outline-none transition hover:bg-white/[0.045] hover:text-white/72 focus-visible:ring-2 focus-visible:ring-white/35",
                                                done && "text-white/42",
                                              )}
                                            >
                                              <span className="max-w-8 truncate">
                                                {prioritySymbol}
                                              </span>
                                            </button>
                                            {renderPriorityPicker(
                                              rowKey,
                                              priorityId,
                                              (nextId) =>
                                                handlePrioritySelect(
                                                  row.id,
                                                  "pinnedSource",
                                                  nextId,
                                                  row,
                                                ),
                                            )}
                                          </div>
                                          {!isGoalRow ? (
                                            <div className="relative shrink-0">
                                              <button
                                                type="button"
                                                aria-label={`Choose day: ${MY_LIST_DAY_LABELS[dayViewBucketId]}`}
                                                aria-haspopup="listbox"
                                                aria-expanded={
                                                  activeDayPickerRowKey ===
                                                  rowKey
                                                }
                                                title={
                                                  MY_LIST_DAY_LABELS[
                                                    dayViewBucketId
                                                  ]
                                                }
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  setActiveSkillPickerRowKey(
                                                    null,
                                                  );
                                                  setActivePriorityPickerRowKey(
                                                    null,
                                                  );
                                                  setActiveDayPickerRowKey(
                                                    (currentRowKey) =>
                                                      currentRowKey === rowKey
                                                        ? null
                                                        : rowKey,
                                                  );
                                                }}
                                                tabIndex={open ? 0 : -1}
                                                className={clsx(
                                                  "flex h-7 min-w-7 items-center justify-center rounded-full border px-1.5 outline-none transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-white/35",
                                                  dayVisual.pillClassName,
                                                  done && "text-white/42",
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
                                                dayBucketId,
                                                (nextId) =>
                                                  handleDaySelect(
                                                    row.id,
                                                    "pinnedSource",
                                                    nextId,
                                                    row,
                                                  ),
                                              )}
                                            </div>
                                          ) : null}
                                          {renderDeleteRowButton(
                                            row.id,
                                            "pinnedSource",
                                            row,
                                          )}
                                        </div>
                                      </div>
                                    );
                                  }

                                  const row = visibleRow.row;
                                  const rowKey = `manual:${row.id}` as const;
                                  return (
                                    <div
                                      key={rowKey}
                                      data-creator-xp-source="my-list-todo"
                                      data-creator-xp-kind="todo"
                                      data-my-list-manual-upgrade-row="true"
                                      draggable={false}
                                      onPointerDownCapture={(event) =>
                                        activateTodoRowFromPointer(
                                          event,
                                          rowKey,
                                        )
                                      }
                                      onFocusCapture={(event) =>
                                        activateTodoRowFromFocus(event, rowKey)
                                      }
                                      onPointerDown={(event) =>
                                        startManualUpgradePointerPress(
                                          event,
                                          row,
                                        )
                                      }
                                      onPointerMove={
                                        handleManualUpgradePointerMove
                                      }
                                      onPointerUp={
                                        handleManualUpgradePointerEnd
                                      }
                                      onPointerCancel={
                                        handleManualUpgradePointerEnd
                                      }
                                      onTouchStart={(event) =>
                                        startManualUpgradeTouchPress(event, row)
                                      }
                                      onTouchMove={handleManualUpgradeTouchMove}
                                      onTouchEnd={handleManualUpgradeTouchEnd}
                                      onTouchCancel={
                                        handleManualUpgradeTouchEnd
                                      }
                                      onSelectCapture={(event) => {
                                        if (manualUpgradePressRef.current) {
                                          event.preventDefault();
                                        }
                                      }}
                                      onDragStart={(event) => {
                                        if (
                                          !shouldIgnoreManualUpgradeTarget(
                                            event.target,
                                          )
                                        ) {
                                          event.preventDefault();
                                        }
                                      }}
                                      onContextMenu={(event) => {
                                        if (
                                          !shouldIgnoreManualUpgradeTarget(
                                            event.target,
                                          )
                                        ) {
                                          event.preventDefault();
                                        }
                                      }}
                                      className={clsx(
                                        "group/todo-row relative flex min-h-8 select-none items-center gap-2 rounded-lg bg-transparent py-1 pl-3 pr-1.5 text-sm text-white/84 transition-[background-color,box-shadow,opacity,transform] hover:bg-white/[0.035] [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] [-webkit-user-select:none] [touch-action:pan-y] [user-select:none]",
                                        open &&
                                          activeView === "list" &&
                                          "cursor-pointer",
                                        (isDragging ||
                                          activeManualReorderRowId ===
                                            rowKey) &&
                                          "z-30 scale-[1.012] cursor-grabbing bg-white/[0.075] opacity-95 shadow-[0_12px_34px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-white/[0.13]",
                                      )}
                                      style={
                                        MY_LIST_MANUAL_UPGRADE_NO_SELECT_STYLE
                                      }
                                    >
                                      <span
                                        data-my-list-checkbox
                                        onPointerDown={
                                          stopMyListCheckboxInteraction
                                        }
                                        onTouchStart={
                                          stopMyListCheckboxInteraction
                                        }
                                        onMouseDown={
                                          stopMyListCheckboxInteraction
                                        }
                                        onClick={stopMyListCheckboxInteraction}
                                        className="-m-1.5 flex h-7 w-7 shrink-0 items-center justify-center"
                                      >
                                        <input
                                          id={`my-list-${row.id}`}
                                          type="checkbox"
                                          checked={row.done}
                                          onChange={(event) =>
                                            handleManualCompletionToggle(
                                              row.id,
                                              event.target.checked,
                                            )
                                          }
                                          tabIndex={open ? 0 : -1}
                                          className="peer sr-only"
                                        />
                                        <label
                                          htmlFor={`my-list-${row.id}`}
                                          aria-label={
                                            row.done
                                              ? "Mark to-do incomplete"
                                              : "Mark to-do complete"
                                          }
                                          className={clsx(
                                            "relative flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-[0.32rem] border transition peer-focus-visible:ring-2 peer-focus-visible:ring-white/35 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-zinc-950",
                                            row.done
                                              ? "shimmer-border-complete focus-pomo-start-glint isolate z-0 overflow-hidden border-green-900/45 bg-[linear-gradient(155deg,rgba(34,197,94,0.94)_0%,rgba(22,163,74,0.97)_48%,rgba(21,128,61,0.98)_100%)] text-white shadow-[0_8px_16px_rgba(3,83,45,0.24),inset_0_1px_0_rgba(255,255,255,0.045),inset_0_-2px_8px_rgba(0,0,0,0.11),inset_0_0_0_1px_rgba(0,0,0,0.08)] ring-1 ring-green-900/45"
                                              : "border-white/16 bg-black/24 text-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
                                          )}
                                        >
                                          <span
                                            className={clsx(
                                              "h-2 w-1.5 rotate-45 border-b-2 border-r-2 border-current transition-opacity",
                                              row.done
                                                ? "opacity-100"
                                                : "opacity-0",
                                            )}
                                          />
                                        </label>
                                      </span>
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
                                            activeSkillPickerRowKey ===
                                            `manual:${row.id}`
                                          }
                                          title={
                                            row.skillName ?? "Choose Skill"
                                          }
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            setActivePriorityPickerRowKey(null);
                                            setActiveDayPickerRowKey(null);
                                            setManualSkillSearch("");
                                            setActiveSkillPickerRowKey(
                                              (currentRowKey) =>
                                                currentRowKey ===
                                                `manual:${row.id}`
                                                  ? null
                                                  : `manual:${row.id}`,
                                            );
                                          }}
                                          tabIndex={open ? 0 : -1}
                                          className={clsx(
                                            "flex h-4 w-4 items-center justify-center bg-transparent p-0 text-center text-[0.78rem] leading-none text-white/70 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white/35",
                                            !row.skillIcon.trim() &&
                                              "text-white/36",
                                            row.done && "text-white/42",
                                          )}
                                        >
                                          {row.skillIcon.trim() || "✦"}
                                        </button>
                                        {renderSkillPicker(
                                          `manual:${row.id}`,
                                          row.skillId,
                                          (skill) =>
                                            handleManualSkillSelect(
                                              row.id,
                                              skill,
                                            ),
                                        )}
                                      </div>
                                      <input
                                        ref={(input) => {
                                          if (input) {
                                            manualTitleInputRefs.current.set(
                                              row.id,
                                              input,
                                            );
                                          } else {
                                            manualTitleInputRefs.current.delete(
                                              row.id,
                                            );
                                          }
                                        }}
                                        type="text"
                                        draggable={false}
                                        value={row.text}
                                        onTouchStart={() => {
                                          suppressManualUpgradeSelection();
                                        }}
                                        onClick={(event) =>
                                          event.stopPropagation()
                                        }
                                        onSelect={(event) => {
                                          if (manualUpgradePressRef.current) {
                                            event.preventDefault();
                                            event.currentTarget.setSelectionRange(
                                              event.currentTarget.value.length,
                                              event.currentTarget.value.length,
                                            );
                                          }
                                        }}
                                        onContextMenu={(event) => {
                                          event.preventDefault();
                                        }}
                                        onDragStart={(event) => {
                                          event.preventDefault();
                                        }}
                                        onKeyDown={(event) =>
                                          handleTodoTitleKeyDown(
                                            event,
                                            "manual",
                                            row.id,
                                          )
                                        }
                                        onChange={(event) =>
                                          updateManualRow(row.id, {
                                            text: event.target.value,
                                          })
                                        }
                                        placeholder={manualRowInputPlaceholder}
                                        aria-label={manualRowInputAriaLabel}
                                        tabIndex={open ? 0 : -1}
                                        className={clsx(
                                          "min-w-0 flex-1 select-none bg-transparent p-0 leading-snug text-white/84 outline-none placeholder:text-white/30 [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] [-webkit-user-select:none] [touch-action:pan-y] [user-select:none]",
                                          row.done &&
                                            "text-white/42 line-through",
                                        )}
                                        style={
                                          MY_LIST_MANUAL_UPGRADE_NO_SELECT_STYLE
                                        }
                                      />
                                      <div
                                        className={clsx(
                                          "-mr-1 ml-auto flex shrink-0 items-center justify-end gap-0 transition-opacity duration-150 group-hover/todo-row:pointer-events-auto group-hover/todo-row:w-auto group-hover/todo-row:overflow-visible group-hover/todo-row:opacity-100 group-focus-within/todo-row:pointer-events-auto group-focus-within/todo-row:w-auto group-focus-within/todo-row:overflow-visible group-focus-within/todo-row:opacity-100",
                                          areTodoRowControlsRevealed(
                                            rowKey,
                                            isDragging ||
                                              activeManualReorderRowId ===
                                                rowKey,
                                          )
                                            ? "w-auto overflow-visible opacity-100 pointer-events-auto"
                                            : "w-0 overflow-hidden opacity-0 pointer-events-none",
                                        )}
                                      >
                                        {(() => {
                                          const priorityOption =
                                            QUICK_CREATE_PRIORITY_OPTIONS.find(
                                              (option) =>
                                                option.id === row.priorityId,
                                            ) ?? defaultPriority;
                                          const prioritySymbol =
                                            priorityOption.symbol ||
                                            QUICK_CREATE_PRIORITY_PLACEHOLDER_SYMBOL;
                                          const dayViewBucketId =
                                            row.dayBucketId ?? "anytime";
                                          const dayVisual =
                                            MY_LIST_DAY_VISUALS[
                                              dayViewBucketId
                                            ];
                                          const DayIcon = dayVisual.Icon;
                                          return (
                                            <>
                                              <div className="relative shrink-0">
                                                <button
                                                  type="button"
                                                  aria-label={`Choose priority: ${priorityOption.label}`}
                                                  aria-haspopup="listbox"
                                                  aria-expanded={
                                                    activePriorityPickerRowKey ===
                                                    rowKey
                                                  }
                                                  title={priorityOption.label}
                                                  onClick={(event) => {
                                                    event.stopPropagation();
                                                    setActiveSkillPickerRowKey(
                                                      null,
                                                    );
                                                    setActiveDayPickerRowKey(
                                                      null,
                                                    );
                                                    setActivePriorityPickerRowKey(
                                                      (currentRowKey) =>
                                                        currentRowKey === rowKey
                                                          ? null
                                                          : rowKey,
                                                    );
                                                  }}
                                                  tabIndex={open ? 0 : -1}
                                                  className={clsx(
                                                    "flex h-7 min-w-7 items-center justify-center rounded-full bg-black/10 px-1 text-[10px] font-black leading-none text-white/46 outline-none transition hover:bg-white/[0.045] hover:text-white/72 focus-visible:ring-2 focus-visible:ring-white/35",
                                                    row.done && "text-white/42",
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
                                                    handlePrioritySelect(
                                                      row.id,
                                                      "manual",
                                                      nextId,
                                                    ),
                                                )}
                                              </div>
                                              <div className="relative shrink-0">
                                                <button
                                                  type="button"
                                                  aria-label={`Choose day: ${MY_LIST_DAY_LABELS[dayViewBucketId]}`}
                                                  aria-haspopup="listbox"
                                                  aria-expanded={
                                                    activeDayPickerRowKey ===
                                                    rowKey
                                                  }
                                                  title={
                                                    MY_LIST_DAY_LABELS[
                                                      dayViewBucketId
                                                    ]
                                                  }
                                                  onClick={(event) => {
                                                    event.stopPropagation();
                                                    setActiveSkillPickerRowKey(
                                                      null,
                                                    );
                                                    setActivePriorityPickerRowKey(
                                                      null,
                                                    );
                                                    setActiveDayPickerRowKey(
                                                      (currentRowKey) =>
                                                        currentRowKey === rowKey
                                                          ? null
                                                          : rowKey,
                                                    );
                                                  }}
                                                  tabIndex={open ? 0 : -1}
                                                  className={clsx(
                                                    "flex h-7 min-w-7 items-center justify-center rounded-full border px-1.5 outline-none transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-white/35",
                                                    dayVisual.pillClassName,
                                                    row.done && "text-white/42",
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
                                                    handleDaySelect(
                                                      row.id,
                                                      "manual",
                                                      nextId,
                                                    ),
                                                )}
                                              </div>
                                              {renderDeleteRowButton(
                                                row.id,
                                                "manual",
                                              )}
                                            </>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                  );
                                };

                                if (!sortableRowKey) {
                                  return renderTopLevelTodoRow();
                                }

                                return (
                                  <MyListSortableManualTodoRow
                                    key={sortableRowKey}
                                    rowKey={sortableRowKey}
                                    rowType={visibleRow.rowType}
                                    reorderGroup={manualReorderGroup}
                                    disabled={!open || activeView !== "list"}
                                    completionExitPhase={
                                      completionExitRows[sortableRowKey]
                                        ?.phase ?? null
                                    }
                                    prefersReducedMotion={prefersReducedMotion}
                                  >
                                    {({
                                      attributes,
                                      listeners,
                                      setActivatorNodeRef,
                                      isDragging,
                                    }) => (
                                      <>
                                        <MyListTodoDragHandle
                                          attributes={attributes}
                                          listeners={listeners}
                                          setActivatorNodeRef={
                                            setActivatorNodeRef
                                          }
                                        />
                                        {renderTopLevelTodoRow({
                                          attributes,
                                          listeners,
                                          setActivatorNodeRef,
                                          isDragging,
                                        })}
                                      </>
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
                                    setAreCompletedTodosVisible(
                                      (current) => !current,
                                    );
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
                                        duration: prefersReducedMotion
                                          ? 0
                                          : 0.22,
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

                          return <div key={group.id}>{groupRows}</div>;
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
            <MatrixContent
              variant="sheet"
              settingsTriggerTarget={matrixSettingsTriggerTarget}
              initialCardDensity={
                shouldInitializeMatrixTodo ? "todo" : undefined
              }
              todoRowDensity="compact"
              presentationMode="checkbox-only"
            />
          )}
        </div>
      </motion.div>
    </motion.aside>
  );
}

function resolvePinnedSourceIcon(row: MyListPinnedSourceRow) {
  if (row.sourceType === "GOAL") {
    const goalIcon = row.goalIcon?.trim() || row.icon?.trim();
    if (goalIcon) return goalIcon;

    const monumentIcon = row.monumentIcon?.trim();
    if (monumentIcon) return monumentIcon;

    return "✦";
  }

  const explicitIcon = row.icon?.trim();
  if (explicitIcon) return explicitIcon;

  return "•";
}
