"use client";

import {
  closestCenter,
  DndContext,
  PointerSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useEffect,
  useCallback,
  useId,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { Capacitor } from "@capacitor/core";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Check,
  ChevronLeft,
  GripVertical,
  Layers3,
  Play,
  Slash,
  Square,
  X,
} from "lucide-react";
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";
import {
  fetchFocusPomoQueue,
  sortFocusPomoQueue,
  type FocusPomoQueueItem,
} from "@/lib/focus/focusPomoQueue";
import { HABIT_TYPE_OPTIONS as APP_HABIT_TYPE_OPTIONS } from "@/components/habits/habit-form-fields";
import { getGoalsForUser } from "@/lib/queries/goals";
import { getMonumentsForUser } from "@/lib/queries/monuments";
import { getCatsForUser } from "@/lib/data/cats";
import {
  listRoadmapsWithItems,
  type RoadmapWithItems,
} from "@/lib/queries/roadmaps";
import { getSkillsForUser } from "@/lib/queries/skills";
import type { CatRow } from "@/lib/types/cat";
import { completionProductivityDayKey } from "@/lib/completions/completionEvents";
import { getSupabaseBrowser } from "@/lib/supabase";
import {
  endFocusPomoLiveActivity,
  startFocusPomoLiveActivity,
} from "@/lib/liveActivities/focusPomoLiveActivity";
import {
  ackFocusPomoLiveActivityActions,
  CREATOR_FOCUS_POMO_DEEP_LINK,
  readFocusPomoLiveActivityActions,
  syncFocusPomoWidgetPayload,
} from "@/lib/widgets/scheduleWidget";
import {
  cancelFocusPomoCompletionNotification,
  scheduleFocusPomoCompletionNotification,
} from "@/lib/notifications/focusPomoLocalNotifications";
import {
  hapticComplete,
  hapticErrorPattern,
  hapticLongPress,
  hapticPress,
  hapticSnap,
  hapticSoftTick,
  hapticWarningPattern,
} from "@/lib/haptics/creatorHaptics";
import { useFabCreation } from "@/components/ui/FabCreationContext";
import type { FabEditTarget } from "@/components/ui/Fab";
import { useToastHelpers } from "@/components/ui/toast";

export type FocusPomoSourceType = "monument" | "skill";

export interface FocusPomoSource {
  sourceType: FocusPomoSourceType;
  sourceId: string;
  title: string;
  icon?: string | null;
}

export interface FocusPomoProps {
  open: boolean;
  source: FocusPomoSource | null;
  onClose(): void;
}

type FocusPomoMode = "pomo" | "stopwatch";

type FocusPomoCardState = {
  badge: string;
  title: string;
  subtitle: string;
  tone: "ready" | "loading" | "error" | "empty";
};

type FocusPomoRunResult = {
  id: string;
  item: FocusPomoQueueItem;
  itemId: string;
  itemKind: string;
  title: string;
  icon: string | null;
  energyCode: string | null;
  energyLabel: string | null;
  workTypeLabel: string;
  relationLabel: string | null;
  relationIcon: string | null;
  relationType: "goal" | "routine" | null;
  durationLabel: string | null;
  action: "completed" | "skipped";
  plannedMs: number;
  actualMs: number | null;
  deltaMs: number | null;
  completedAt: string;
  timeZone: string;
  resultTone: "under" | "over" | "skipped";
};

type ActiveFocusPomoLiveActivitySession = {
  sessionId: string;
  itemKey: string;
  title: string;
  startedAt: string;
  endsAt: string | null;
};

type ScopeOption = {
  id: string;
  name: string;
  icon?: string | null;
  monumentId?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  sortOrder?: number | null;
};

type ConstraintOption = ScopeOption & {
  color?: string | null;
  matchKeys?: string[];
  monumentId?: string | null;
  monumentName?: string | null;
  monumentIcon?: string | null;
};

type ScopeQueueSource = {
  sourceType: FocusPomoSourceType;
  sourceId: string;
  title: string;
  icon?: string | null;
};

type FocusExecutionItemType = "project" | "task" | "habit";

type HabitTypeOption = {
  key: string;
  label: string;
};

type AvailableConstraintOptions = {
  tags: ConstraintOption[];
  goals: ConstraintOption[];
  campaigns: ConstraintOption[];
  routines: ConstraintOption[];
  habitTypes: HabitTypeOption[];
};

type FocusPomoCompletionKind = "habit" | "project";

type FocusPomoProjectCompletionUpdate = {
  update(values: {
    completed_at: string | null;
    updated_at: string;
    stage: string;
  }): {
    eq(column: string, value: string): {
      eq(column: string, value: string): Promise<{ error: unknown | null }>;
    };
  };
};

const DEFAULT_ENABLED_ITEM_TYPES: FocusExecutionItemType[] = [
  "project",
  "task",
  "habit",
];
const FOCUS_QUEUE_LONG_PRESS_MS = 520;
const FOCUS_QUEUE_LONG_PRESS_MOVE_TOLERANCE = 12;
const FOCUS_QUEUE_LONG_PRESS_SUPPRESS_MS = 650;
const FOCUS_QUEUE_MOVE_SUPPRESS_MS = 250;
const FOCUS_POMO_QUEUE_NUMBER_BADGE_CLASS =
  "flex size-7 shrink-0 items-center justify-center rounded-md border border-black/60 bg-zinc-950/55 text-[11px] font-semibold text-white/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)] sm:size-8 sm:rounded-lg sm:text-xs";
const FOCUS_POMO_QUEUE_ICON_BADGE_CLASS =
  "flex size-7 shrink-0 items-center justify-center rounded-md border border-black/60 bg-zinc-950/50 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:size-8 sm:rounded-lg sm:text-base";
const INVALID_HABIT_TYPE_KEYS = new Set(["routine", "routines"]);
const LOCKED_OFF_HABIT_TYPE_KEYS = new Set([
  "temp",
  "relaxer",
  "sync",
  "memo",
]);
const PRIORITY_HABIT_TYPE_KEYS = ["habit", "chore", "practice"];
const PRIORITY_HABIT_TYPE_OPTIONS: HabitTypeOption[] = [
  { key: "habit", label: "Habit" },
  { key: "chore", label: "Chore" },
  { key: "practice", label: "Practice" },
];

const KNOWN_HABIT_TYPE_OPTIONS: HabitTypeOption[] = APP_HABIT_TYPE_OPTIONS.map(
  (option) => ({
    key: normalizeExecutionFilterValue(option.value),
    label: option.label,
  })
).filter((option) => !INVALID_HABIT_TYPE_KEYS.has(option.key));

const workTypeOptionConfig = [
  { value: "project", label: "Projects" },
  { value: "task", label: "Tasks" },
  { value: "habit", label: "Habits" },
] as const satisfies ReadonlyArray<{
  value: FocusExecutionItemType;
  label: string;
}>;

const modeOptions = [
  { value: "pomo", label: "POMO" },
  { value: "stopwatch", label: "TIMER" },
] as const satisfies ReadonlyArray<{
  value: FocusPomoMode;
  label: string;
}>;

function formatSignedTimerMs(totalMs: number): string {
  const sign = totalMs < 0 ? "-" : "";
  const totalCentiseconds = Math.floor(Math.abs(totalMs) / 10);
  const centiseconds = totalCentiseconds % 100;
  const totalSeconds = Math.floor(totalCentiseconds / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  const paddedMinutes = String(minutes).padStart(2, "0");
  const paddedSeconds = String(seconds).padStart(2, "0");
  const paddedCentiseconds = String(centiseconds).padStart(2, "0");

  return `${sign}${paddedMinutes}:${paddedSeconds}.${paddedCentiseconds}`;
}

function formatElapsedTimerMs(totalMs: number): string {
  const safeMs = Number.isFinite(totalMs) ? Math.max(totalMs, 0) : 0;
  const totalSeconds = Math.floor(safeMs / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  const paddedSeconds = String(seconds).padStart(2, "0");

  return `${minutes}:${paddedSeconds}`;
}

function clampTimerRingProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function getCountdownTimerRingProgress({
  remainingMs,
  totalDurationMs,
}: {
  remainingMs: number;
  totalDurationMs: number;
}): number {
  if (totalDurationMs <= 0) return 0;

  return clampTimerRingProgress(remainingMs / totalDurationMs);
}

function createLocalSessionId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function isNativeIosApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

function readScopeString(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readScopePositiveNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readScopeRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function uniqueScopeValues(values: Array<string | null>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value)))
  );
}

function nameScopeId(name: string): string {
  return `name:${name.trim().toLowerCase()}`;
}

function normalizeScopeName(name: string): string {
  return name.trim().toLowerCase();
}

function normalizeSelectedScopeIdName(id: string): string {
  return normalizeScopeName(id.startsWith("name:") ? id.slice(5) : id);
}

function normalizeExecutionFilterValue(value: string): string {
  return value.trim().toLowerCase();
}

function isPracticeHabitTypeKey(key: string): boolean {
  return normalizeExecutionFilterValue(key) === "practice";
}

function isLockedOffHabitTypeKey(key: string): boolean {
  return LOCKED_OFF_HABIT_TYPE_KEYS.has(normalizeExecutionFilterValue(key));
}

function isDefaultOffHabitTypeKey(key: string): boolean {
  return isPracticeHabitTypeKey(key) || isLockedOffHabitTypeKey(key);
}

function normalizeHabitTypeOption(value: string | null): HabitTypeOption | null {
  if (!value) return null;
  const key = normalizeExecutionFilterValue(value);
  if (!key || INVALID_HABIT_TYPE_KEYS.has(key)) return null;

  const knownOption = KNOWN_HABIT_TYPE_OPTIONS.find(
    (option) => option.key === key
  );

  return knownOption ?? { key, label: formatExecutionFilterLabel(value) };
}

function formatExecutionFilterLabel(value: string): string {
  return value
    .trim()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function readNestedScopeRecord(
  record: Record<string, unknown>,
  key: string
): Record<string, unknown> | null {
  return readScopeRecord(record[key]);
}

function getFocusItemKind(item: FocusPomoQueueItem): FocusExecutionItemType {
  const record = item as unknown as Record<string, unknown>;
  const source = readNestedScopeRecord(record, "source");
  const raw = readNestedScopeRecord(record, "raw");
  const candidates = [
    readScopeString(record.kind),
    readScopeString(record.sourceType),
    readScopeString(record.source_type),
    readScopeString(record.itemType),
    readScopeString(record.item_type),
    readScopeString(record.type),
    readScopeString(source?.type),
    readScopeString(source?.sourceType),
    readScopeString(source?.source_type),
    readScopeString(raw?.kind),
    readScopeString(raw?.sourceType),
    readScopeString(raw?.source_type),
    readScopeString(raw?.itemType),
    readScopeString(raw?.item_type),
  ];

  for (const candidate of candidates) {
    const value = candidate ? normalizeExecutionFilterValue(candidate) : null;
    if (!value) continue;

    if (["project", "projects"].includes(value)) return "project";
    if (["task", "tasks", "todo", "to-do"].includes(value)) return "task";
    if (
      ["habit", "habits", "chore", "routine", "sync", "practice"].includes(
        value
      )
    ) {
      return "habit";
    }
  }

  return item.kind === "project" ? "project" : "habit";
}

function getFocusItemHabitType(item: FocusPomoQueueItem): string | null {
  if (getFocusItemKind(item) !== "habit") return null;

  const record = item as unknown as Record<string, unknown>;
  const source = readNestedScopeRecord(record, "source");
  const raw = readNestedScopeRecord(record, "raw");
  const candidates = [
    readScopeString(record.habitType),
    readScopeString(record.habit_type),
    readScopeString(source?.habitType),
    readScopeString(source?.habit_type),
    readScopeString(raw?.habitType),
    readScopeString(raw?.habit_type),
    readScopeString(record.kind) === "chore" ? "chore" : null,
  ];

  for (const candidate of candidates) {
    if (normalizeHabitTypeOption(candidate)) return candidate;
  }

  const labelCandidates = [
    readScopeString(record.type),
    readScopeString(record.rawTypeLabel),
    readScopeString(record.subtitle),
    readScopeString(record.title),
    readScopeString(record.name),
  ];
  const practiceLabel = labelCandidates.find((candidate) =>
    candidate ? /\bpractice\b/i.test(candidate) : false
  );

  return practiceLabel ? "practice" : null;
}

function buildHabitTypeOptions(items: FocusPomoQueueItem[]): HabitTypeOption[] {
  const options = new Map<string, HabitTypeOption>();

  for (const item of items) {
    const option = normalizeHabitTypeOption(getFocusItemHabitType(item));
    if (!option || options.has(option.key)) continue;
    options.set(option.key, option);
  }

  return sortHabitTypeOptions(Array.from(options.values()));
}

function sortHabitTypeOptions(options: HabitTypeOption[]): HabitTypeOption[] {
  return [...options].sort((a, b) => {
    const aPriority = PRIORITY_HABIT_TYPE_KEYS.indexOf(a.key);
    const bPriority = PRIORITY_HABIT_TYPE_KEYS.indexOf(b.key);

    if (aPriority !== -1 || bPriority !== -1) {
      if (aPriority === -1) return 1;
      if (bPriority === -1) return -1;
      return aPriority - bPriority;
    }

    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
}

function buildHabitTypePillOptions(
  options: HabitTypeOption[]
): HabitTypeOption[] {
  const optionsByKey = new Map(options.map((option) => [option.key, option]));
  const priorityOptions = PRIORITY_HABIT_TYPE_OPTIONS.map(
    (option) => optionsByKey.get(option.key) ?? option
  );
  const remainingOptions = sortHabitTypeOptions(
    options.filter((option) => !PRIORITY_HABIT_TYPE_KEYS.includes(option.key))
  );

  return [...priorityOptions, ...remainingOptions];
}

function getDefaultEnabledHabitTypes(
  habitTypeOptions: HabitTypeOption[]
): string[] {
  return habitTypeOptions
    .filter((option) => !isDefaultOffHabitTypeKey(option.key))
    .map((option) => option.key);
}

function isDefaultEnabledItemTypes(
  enabledItemTypes: FocusExecutionItemType[]
): boolean {
  return (
    enabledItemTypes.length === DEFAULT_ENABLED_ITEM_TYPES.length &&
    DEFAULT_ENABLED_ITEM_TYPES.every((type) => enabledItemTypes.includes(type))
  );
}

function itemMatchesExecutionFilters(
  item: FocusPomoQueueItem,
  options: {
    enabledItemTypes: FocusExecutionItemType[];
    enabledHabitTypes: string[] | null;
  }
): boolean {
  const itemKind = getFocusItemKind(item);
  if (!options.enabledItemTypes.includes(itemKind)) return false;
  if (itemKind !== "habit") return true;

  const habitType = getFocusItemHabitType(item);
  if (!habitType) return true;

  const habitTypeOption = normalizeHabitTypeOption(habitType);
  if (!habitTypeOption) return true;

  if (options.enabledHabitTypes === null) {
    return !isDefaultOffHabitTypeKey(habitTypeOption.key);
  }

  return (
    !isLockedOffHabitTypeKey(habitTypeOption.key) &&
    options.enabledHabitTypes.includes(habitTypeOption.key)
  );
}

function readScopeIconFromRecord(
  record: Record<string, unknown> | null
): string | null {
  if (!record) return null;

  for (const key of ["icon_emoji", "emoji", "icon", "symbol"]) {
    const value = readScopeString(record[key]);
    if (value) return value;
  }

  return null;
}

function readGoalMonumentMetadata(
  ...records: Array<Record<string, unknown> | null | undefined>
): Pick<ConstraintOption, "monumentId" | "monumentName" | "monumentIcon"> {
  const directRecords = records.filter(Boolean) as Array<
    Record<string, unknown>
  >;
  const monumentRecords = records
    .map((record) => readScopeRecord(record?.monument))
    .filter((record): record is Record<string, unknown> => Boolean(record));
  const monumentId =
    directRecords
      .map(
        (record) =>
          readScopeString(record.goal_monument_id) ??
          readScopeString(record.goalMonumentId) ??
          readScopeString(record.monument_id) ??
          readScopeString(record.monumentId)
      )
      .find(Boolean) ??
    monumentRecords.map((record) => readScopeString(record.id)).find(Boolean) ??
    null;
  const monumentName =
    directRecords
      .map(
        (record) =>
          readScopeString(record.goal_monument_name) ??
          readScopeString(record.goalMonumentName) ??
          readScopeString(record.monument_name) ??
          readScopeString(record.monumentName) ??
          readScopeString(record.monumentTitle)
      )
      .find(Boolean) ??
    monumentRecords
      .map(
        (record) =>
          readScopeString(record.name) ?? readScopeString(record.title)
      )
      .find(Boolean) ??
    null;
  const monumentIcon =
    directRecords
      .map(
        (record) =>
          readScopeString(record.goal_monument_icon_emoji) ??
          readScopeString(record.goalMonumentIconEmoji) ??
          readScopeString(record.goal_monument_emoji) ??
          readScopeString(record.goalMonumentEmoji) ??
          readScopeString(record.goal_monument_icon) ??
          readScopeString(record.goalMonumentIcon) ??
          readScopeString(record.monument_icon_emoji) ??
          readScopeString(record.monumentEmoji) ??
          readScopeString(record.monument_icon) ??
          readScopeString(record.monumentIcon)
      )
      .find(Boolean) ??
    monumentRecords.map(readScopeIconFromRecord).find(Boolean) ??
    null;

  return { monumentId, monumentName, monumentIcon };
}

function getGoalGroupKey(option: ConstraintOption): string {
  return option.monumentId
    ? `id:${option.monumentId}`
    : option.monumentName
      ? `name:${normalizeScopeName(option.monumentName)}`
      : "unassigned";
}

function buildGroupedGoalOptions(
  goalOptions: ConstraintOption[],
  monumentOptions: ScopeOption[],
  selectedMonumentIds: string[]
) {
  const monumentById = new Map(
    monumentOptions.map((option) => [option.id, option])
  );
  const selectedMonumentNames = monumentOptions
    .filter((option) => selectedMonumentIds.includes(option.id))
    .map((option) => normalizeScopeName(option.name));
  const groups = new Map<
    string,
    {
      key: string;
      name: string;
      icon: string | null;
      selectedScope: boolean;
      options: ConstraintOption[];
    }
  >();

  for (const option of goalOptions) {
    const matchedMonument = option.monumentId
      ? monumentById.get(option.monumentId)
      : null;
    const key = getGoalGroupKey(option);
    const name = matchedMonument?.name ?? option.monumentName ?? "Unassigned";
    const icon = matchedMonument?.icon ?? option.monumentIcon ?? null;
    const selectedScope =
      Boolean(option.monumentId && selectedMonumentIds.includes(option.monumentId)) ||
      selectedMonumentNames.includes(normalizeScopeName(name));
    const existing = groups.get(key);

    if (existing) {
      existing.options.push(option);
      if (!existing.icon && icon) existing.icon = icon;
      existing.selectedScope = existing.selectedScope || selectedScope;
      continue;
    }

    groups.set(key, {
      key,
      name,
      icon,
      selectedScope,
      options: [option],
    });
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      options: sortConstraintOptions([...group.options]),
    }))
    .sort((a, b) => {
      if (a.key === "unassigned") return 1;
      if (b.key === "unassigned") return -1;
      if (a.selectedScope !== b.selectedScope) return a.selectedScope ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
}

function makeScopeOption(
  id: string | null,
  name: string | null,
  icon?: string | null,
  monumentId?: string | null,
  categoryId?: string | null,
  categoryName?: string | null,
  sortOrder?: number | null
): ScopeOption | null {
  const optionName = name ?? id;
  if (!optionName) return null;

  return {
    id: id ?? nameScopeId(optionName),
    name: optionName,
    icon: icon ?? null,
    monumentId: monumentId ?? null,
    categoryId: categoryId ?? null,
    categoryName: categoryName ?? null,
    sortOrder: sortOrder ?? null,
  };
}

function mergeScopeOption(
  options: Map<string, ScopeOption>,
  option: ScopeOption | null
) {
  if (!option) return;

  const existingById = options.get(option.id);
  if (existingById) {
    if (
      (!existingById.icon && option.icon) ||
      (!existingById.monumentId && option.monumentId) ||
      (!existingById.categoryId && option.categoryId) ||
      (!existingById.categoryName && option.categoryName) ||
      (existingById.sortOrder == null && option.sortOrder != null)
    ) {
      options.set(option.id, {
        ...existingById,
        icon: existingById.icon ?? option.icon,
        monumentId: existingById.monumentId ?? option.monumentId ?? null,
        categoryId: existingById.categoryId ?? option.categoryId ?? null,
        categoryName: existingById.categoryName ?? option.categoryName ?? null,
        sortOrder: existingById.sortOrder ?? option.sortOrder ?? null,
      });
    }
    return;
  }

  const normalizedName = normalizeScopeName(option.name);
  const existingByName = Array.from(options.values()).find(
    (existing) =>
      normalizeScopeName(existing.name) === normalizedName &&
      (existing.id.startsWith("name:") || option.id.startsWith("name:"))
  );

  if (existingByName) {
    if (
      (!existingByName.icon && option.icon) ||
      (!existingByName.monumentId && option.monumentId) ||
      (!existingByName.categoryId && option.categoryId) ||
      (!existingByName.categoryName && option.categoryName) ||
      (existingByName.sortOrder == null && option.sortOrder != null)
    ) {
      options.set(existingByName.id, {
        ...existingByName,
        icon: existingByName.icon ?? option.icon,
        monumentId: existingByName.monumentId ?? option.monumentId ?? null,
        categoryId: existingByName.categoryId ?? option.categoryId ?? null,
        categoryName: existingByName.categoryName ?? option.categoryName ?? null,
        sortOrder: existingByName.sortOrder ?? option.sortOrder ?? null,
      });
    }
    return;
  }

  options.set(option.id, option);
}

function makeConstraintOption(
  id: string | null,
  name: string | null,
  icon?: string | null,
  color?: string | null,
  matchKeys?: string[],
  metadata?: Pick<
    ConstraintOption,
    "monumentId" | "monumentName" | "monumentIcon"
  >
): ConstraintOption | null {
  const option = makeScopeOption(id, name, icon);
  return option
    ? {
        ...option,
        color: color ?? null,
        matchKeys: uniqueScopeValues(matchKeys ?? []),
        monumentId: metadata?.monumentId ?? null,
        monumentName: metadata?.monumentName ?? null,
        monumentIcon: metadata?.monumentIcon ?? null,
      }
    : null;
}

function mergeConstraintOption(
  options: Map<string, ConstraintOption>,
  option: ConstraintOption | null
) {
  if (!option) return;

  const existingById = options.get(option.id);
  if (existingById) {
    options.set(option.id, {
      ...existingById,
      icon: existingById.icon ?? option.icon ?? null,
      color: existingById.color ?? option.color ?? null,
      monumentId: existingById.monumentId ?? option.monumentId ?? null,
      monumentName: existingById.monumentName ?? option.monumentName ?? null,
      monumentIcon: existingById.monumentIcon ?? option.monumentIcon ?? null,
      matchKeys: uniqueScopeValues([
        ...(existingById.matchKeys ?? []),
        ...(option.matchKeys ?? []),
      ]),
    });
    return;
  }

  const normalizedName = normalizeScopeName(option.name);
  const existingByName = Array.from(options.values()).find(
    (existing) =>
      normalizeScopeName(existing.name) === normalizedName &&
      (existing.id.startsWith("name:") || option.id.startsWith("name:"))
  );

  if (existingByName) {
    options.set(existingByName.id, {
      ...existingByName,
      icon: existingByName.icon ?? option.icon ?? null,
      color: existingByName.color ?? option.color ?? null,
      monumentId: existingByName.monumentId ?? option.monumentId ?? null,
      monumentName: existingByName.monumentName ?? option.monumentName ?? null,
      monumentIcon: existingByName.monumentIcon ?? option.monumentIcon ?? null,
      matchKeys: uniqueScopeValues([
        ...(existingByName.matchKeys ?? []),
        ...(option.matchKeys ?? []),
      ]),
    });
    return;
  }

  options.set(option.id, option);
}

function isNameBasedConstraintOption(option: ConstraintOption): boolean {
  return option.id.startsWith("name:");
}

function campaignOptionRelationKeys(option: ConstraintOption): string[] {
  return uniqueScopeValues([
    relationIdMatchKey("campaign", option.id),
    relationMatchKey("campaign", option.name),
    ...(option.matchKeys ?? []).filter(
      (key) =>
        key.startsWith("campaign-id:") ||
        key.startsWith("campaign:") ||
        key.startsWith("goal-id:") ||
        key.startsWith("monument-id:") ||
        key.startsWith("circle-id:") ||
        key.startsWith("roadmap-id:")
    ),
  ]);
}

function campaignOptionsShareRelation(
  first: ConstraintOption,
  second: ConstraintOption
): boolean {
  const firstKeys = new Set(
    campaignOptionRelationKeys(first).map(normalizeScopeName)
  );
  return campaignOptionRelationKeys(second).some((key) =>
    firstKeys.has(normalizeScopeName(key))
  );
}

function mergeCampaignOptionValues(
  base: ConstraintOption,
  incoming: ConstraintOption
): ConstraintOption {
  return {
    ...base,
    icon: base.icon ?? incoming.icon ?? null,
    color: base.color ?? incoming.color ?? null,
    monumentId: base.monumentId ?? incoming.monumentId ?? null,
    monumentName: base.monumentName ?? incoming.monumentName ?? null,
    monumentIcon: base.monumentIcon ?? incoming.monumentIcon ?? null,
    matchKeys: uniqueScopeValues([
      base.id,
      nameScopeId(base.name),
      relationIdMatchKey("campaign", base.id),
      relationMatchKey("campaign", base.name),
      ...(base.matchKeys ?? []),
      incoming.id,
      nameScopeId(incoming.name),
      relationIdMatchKey("campaign", incoming.id),
      relationMatchKey("campaign", incoming.name),
      ...(incoming.matchKeys ?? []),
    ]),
  };
}

function mergeCampaignConstraintOption(
  options: Map<string, ConstraintOption>,
  option: ConstraintOption | null
) {
  if (!option) return;

  const normalizedName = normalizeScopeName(option.name);
  const existing =
    options.get(option.id) ??
    Array.from(options.values()).find(
      (current) => normalizeScopeName(current.name) === normalizedName
    ) ??
    Array.from(options.values()).find((current) =>
      campaignOptionsShareRelation(current, option)
    );

  if (!existing) {
    options.set(option.id, option);
    return;
  }

  const base =
    isNameBasedConstraintOption(existing) && !isNameBasedConstraintOption(option)
      ? option
      : existing;
  const incoming = base === existing ? option : existing;
  const merged = mergeCampaignOptionValues(base, incoming);

  if (existing.id !== merged.id) options.delete(existing.id);
  options.set(merged.id, merged);
}

function sortConstraintOptions(options: ConstraintOption[]): ConstraintOption[] {
  return options.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

function mergeScopeOptionArrays(
  first: unknown,
  second: unknown
): ScopeOption[] {
  const options = new Map<string, ScopeOption>();
  const append = (value: unknown) => {
    if (!Array.isArray(value)) return;

    for (const entry of value) {
      const record = readScopeRecord(entry);
      const option = record
        ? makeScopeOption(
            readScopeString(record.id),
            readScopeString(record.name) ?? readScopeString(record.title),
            readScopeIconFromRecord(record)
          )
        : makeScopeOption(readScopeString(entry), readScopeString(entry));

      mergeScopeOption(options, option);
    }
  };

  append(first);
  append(second);

  return sortScopeOptions(Array.from(options.values()));
}

function readScopeArrayOptions(
  item: FocusPomoQueueItem,
  fieldNames: string[],
  idKeys: string[],
  nameKeys: string[],
  iconKeys: string[]
): ScopeOption[] {
  const record = item as unknown as Record<string, unknown>;
  const options: ScopeOption[] = [];

  for (const fieldName of fieldNames) {
    const fieldValue = record[fieldName];
    if (!Array.isArray(fieldValue)) continue;

    for (const entry of fieldValue) {
      const entryRecord = readScopeRecord(entry);
      if (!entryRecord) {
        const direct = readScopeString(entry);
        const option = makeScopeOption(direct, direct);
        if (option) options.push(option);
        continue;
      }

      const id =
        idKeys.map((key) => readScopeString(entryRecord[key])).find(Boolean) ??
        null;
      const name =
        nameKeys
          .map((key) => readScopeString(entryRecord[key]))
          .find(Boolean) ?? null;
      const icon =
        iconKeys
          .map((key) => readScopeString(entryRecord[key]))
          .find(Boolean) ?? readScopeIconFromRecord(entryRecord);
      const option = makeScopeOption(id, name, icon);
      if (option) options.push(option);
    }
  }

  return options;
}

function readConstraintArrayOptions(
  item: FocusPomoQueueItem,
  fieldNames: string[],
  idKeys: string[],
  nameKeys: string[],
  iconKeys: string[] = [],
  colorKeys: string[] = [],
  metadataReader?: (
    record: Record<string, unknown>
  ) => Pick<ConstraintOption, "monumentId" | "monumentName" | "monumentIcon">
): ConstraintOption[] {
  const record = item as unknown as Record<string, unknown>;
  const options: ConstraintOption[] = [];

  for (const fieldName of fieldNames) {
    const fieldValue = record[fieldName];
    const values = Array.isArray(fieldValue)
      ? fieldValue
      : fieldValue === undefined || fieldValue === null
        ? []
        : [fieldValue];

    for (const entry of values) {
      const entryRecord = readScopeRecord(entry);
      if (!entryRecord) {
        const direct = readScopeString(entry);
        const option = makeConstraintOption(direct, direct);
        if (option) options.push(option);
        continue;
      }

      const id =
        idKeys.map((key) => readScopeString(entryRecord[key])).find(Boolean) ??
        null;
      const name =
        nameKeys
          .map((key) => readScopeString(entryRecord[key]))
          .find(Boolean) ?? null;
      const icon =
        iconKeys
          .map((key) => readScopeString(entryRecord[key]))
          .find(Boolean) ?? readScopeIconFromRecord(entryRecord);
      const color =
        colorKeys
          .map((key) => readScopeString(entryRecord[key]))
          .find(Boolean) ?? null;
      const option = makeConstraintOption(
        id,
        name,
        icon,
        color,
        undefined,
        metadataReader?.(entryRecord)
      );
      if (option) options.push(option);
    }
  }

  return options;
}

function readScopeArrayValues(
  item: FocusPomoQueueItem,
  fieldNames: string[],
  valueKeys: string[]
): string[] {
  const record = item as unknown as Record<string, unknown>;
  const values: string[] = [];

  for (const fieldName of fieldNames) {
    const fieldValue = record[fieldName];
    if (!Array.isArray(fieldValue)) continue;

    for (const entry of fieldValue) {
      const entryRecord = readScopeRecord(entry);
      if (!entryRecord) {
        const direct = readScopeString(entry);
        if (direct) values.push(direct);
        continue;
      }

      for (const key of valueKeys) {
        const value = readScopeString(entryRecord[key]);
        if (value) values.push(value);
      }
    }
  }

  return values;
}

function getItemMonumentIds(
  item: FocusPomoQueueItem,
  source?: FocusPomoSource | null
): string[] {
  const itemIds = getItemMonumentOptions(item).map((option) => option.id);
  const legacyArrayIds = readScopeArrayValues(
    item,
    ["monumentIds", "monument_ids"],
    ["id"]
  );

  const sourceIds = source?.sourceType === "monument" ? [source.sourceId] : [];

  return uniqueScopeValues([...itemIds, ...legacyArrayIds, ...sourceIds]);
}

function getItemMonumentNames(
  item: FocusPomoQueueItem,
  source?: FocusPomoSource | null
): string[] {
  const itemNames = getItemMonumentOptions(item).map((option) => option.name);
  const sourceNames = source?.sourceType === "monument" ? [source.title] : [];

  return uniqueScopeValues([...itemNames, ...sourceNames]);
}

function getItemSkillIds(
  item: FocusPomoQueueItem,
  source?: FocusPomoSource | null
): string[] {
  const itemIds = getItemSkillOptions(item).map((option) => option.id);
  const legacyArrayIds = readScopeArrayValues(
    item,
    ["skillIds", "skill_ids"],
    ["id"]
  );

  const sourceIds = source?.sourceType === "skill" ? [source.sourceId] : [];

  return uniqueScopeValues([...itemIds, ...legacyArrayIds, ...sourceIds]);
}

function getItemSkillNames(
  item: FocusPomoQueueItem,
  source?: FocusPomoSource | null
): string[] {
  const itemNames = getItemSkillOptions(item).map((option) => option.name);
  const sourceNames = source?.sourceType === "skill" ? [source.title] : [];

  return uniqueScopeValues([...itemNames, ...sourceNames]);
}

function getItemMonumentOptions(item: FocusPomoQueueItem): ScopeOption[] {
  const record = item as unknown as Record<string, unknown>;
  const monument = readScopeRecord(record.monument);
  const goal = readScopeRecord(record.goal);
  const options = new Map<string, ScopeOption>();
  const directIds = [
    readScopeString(record.monument_id),
    readScopeString(record.monumentId),
    readScopeString(record.practice_context_monument_id),
    readScopeString(record.practiceContextMonumentId),
    readScopeString(record.skill_monument_id),
    readScopeString(record.skillMonumentId),
    readScopeString(monument?.id),
    readScopeString(goal?.monument_id),
    readScopeString(goal?.monumentId),
  ];
  const directNames = [
    readScopeString(record.monument_name),
    readScopeString(record.monumentName),
    readScopeString(record.monumentTitle),
    readScopeString(monument?.name),
    readScopeString(monument?.title),
    readScopeString(goal?.monument_name),
    readScopeString(goal?.monumentName),
    readScopeString(goal?.monumentTitle),
  ];
  const directIcon =
    readScopeString(record.monument_icon_emoji) ??
    readScopeString(record.monumentEmoji) ??
    readScopeString(record.monument_icon) ??
    readScopeString(record.monumentIcon) ??
    readScopeIconFromRecord(monument) ??
    readScopeString(goal?.monument_icon_emoji) ??
    readScopeString(goal?.monumentEmoji) ??
    readScopeString(goal?.monument_icon) ??
    readScopeString(goal?.monumentIcon) ??
    readScopeIconFromRecord(goal) ??
    readScopeIconFromRecord(record);
  const directName = directNames.find(Boolean) ?? null;

  directIds.forEach((id) => {
    mergeScopeOption(options, makeScopeOption(id, directName, directIcon));
  });
  directNames.forEach((name) => {
    mergeScopeOption(options, makeScopeOption(null, name, directIcon));
  });

  for (const option of readScopeArrayOptions(
    item,
    ["monuments"],
    ["id", "monument_id", "monumentId"],
    ["name", "title", "monument_name", "monumentName"],
    ["icon_emoji", "emoji", "icon", "symbol", "monument_icon", "monumentIcon"]
  )) {
    mergeScopeOption(options, option);
  }

  return Array.from(options.values());
}

function getItemSkillOptions(item: FocusPomoQueueItem): ScopeOption[] {
  const record = item as unknown as Record<string, unknown>;
  const skill = readScopeRecord(record.skill);
  const options = new Map<string, ScopeOption>();
  const directIds = [
    readScopeString(item.skillId),
    readScopeString(record.skill_id),
    readScopeString(record.skillId),
    readScopeString(skill?.id),
  ];
  const directNames = [
    readScopeString(item.skillName),
    readScopeString(record.skill_name),
    readScopeString(record.skillName),
    readScopeString(skill?.name),
    readScopeString(skill?.title),
  ];
  const directIcon =
    readScopeString(item.skillIcon) ??
    readScopeString(record.skill_icon_emoji) ??
    readScopeString(record.skillEmoji) ??
    readScopeString(record.skill_icon) ??
    readScopeString(record.skillIcon) ??
    readScopeIconFromRecord(skill) ??
    readScopeIconFromRecord(record);
  const directName = directNames.find(Boolean) ?? null;

  directIds.forEach((id) => {
    mergeScopeOption(options, makeScopeOption(id, directName, directIcon));
  });
  directNames.forEach((name) => {
    mergeScopeOption(options, makeScopeOption(null, name, directIcon));
  });

  for (const option of readScopeArrayOptions(
    item,
    [
      "skills",
      "projectSkills",
      "project_skills",
      "habitSkills",
      "habit_skills",
      "taskSkills",
      "task_skills",
    ],
    ["id", "skill_id", "skillId"],
    ["name", "title", "skill_name", "skillName"],
    ["icon_emoji", "emoji", "icon", "symbol", "skill_icon", "skillIcon"]
  )) {
    mergeScopeOption(options, option);
  }

  return Array.from(options.values());
}

function getItemTagOptions(item: FocusPomoQueueItem): ConstraintOption[] {
  const record = item as unknown as Record<string, unknown>;
  const source = readScopeRecord(record.source);
  const raw = readScopeRecord(record.raw);
  const scheduleInstance = readScopeRecord(record.schedule_instance);
  const options = new Map<string, ConstraintOption>();

  for (const option of readConstraintArrayOptions(
    item,
    ["tags", "event_tags", "tag_ids", "tagIds"],
    ["id", "tag_id", "tagId", "value", "key"],
    ["name", "label", "title", "value"],
    ["icon", "emoji", "symbol"],
    ["color", "colour"]
  )) {
    mergeConstraintOption(options, option);
  }

  for (const container of [source, raw, scheduleInstance]) {
    if (!container) continue;
    for (const fieldName of ["tags", "event_tags", "tag_ids", "tagIds"]) {
      const fieldValue = container[fieldName];
      const values = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
      for (const value of values) {
        const valueRecord = readScopeRecord(value);
        const option = valueRecord
          ? makeConstraintOption(
              readScopeString(valueRecord.id) ??
                readScopeString(valueRecord.tag_id) ??
                readScopeString(valueRecord.tagId),
              readScopeString(valueRecord.name) ??
                readScopeString(valueRecord.label) ??
                readScopeString(valueRecord.title) ??
                readScopeString(valueRecord.value),
              readScopeIconFromRecord(valueRecord),
              readScopeString(valueRecord.color) ??
                readScopeString(valueRecord.colour)
            )
          : makeConstraintOption(readScopeString(value), readScopeString(value));
        mergeConstraintOption(options, option);
      }
    }
  }

  return Array.from(options.values());
}

function getItemGoalOptions(item: FocusPomoQueueItem): ConstraintOption[] {
  const record = item as unknown as Record<string, unknown>;
  const goal = readScopeRecord(record.goal);
  const project = readScopeRecord(record.project);
  const task = readScopeRecord(record.task);
  const taskProject = readScopeRecord(task?.project);
  const habit = readScopeRecord(record.habit);
  const scheduleInstance = readScopeRecord(record.schedule_instance);
  const options = new Map<string, ConstraintOption>();

  const directIds = [
    readScopeString(item.goalId),
    readScopeString(record.goal_id),
    readScopeString(record.goalId),
    readScopeString(goal?.id),
    readScopeString(project?.goal_id),
    readScopeString(project?.goalId),
    readScopeString(taskProject?.goal_id),
    readScopeString(taskProject?.goalId),
    readScopeString(habit?.goal_id),
    readScopeString(habit?.goalId),
    readScopeString(scheduleInstance?.goal_id),
    readScopeString(scheduleInstance?.goalId),
  ];
  const directNames = [
    readScopeString(item.goalTitle),
    readScopeString(record.goal_name),
    readScopeString(record.goalName),
    readScopeString(record.goalTitle),
    readScopeString(goal?.name),
    readScopeString(goal?.title),
    readScopeString(project?.goal_name),
    readScopeString(project?.goalName),
    readScopeString(taskProject?.goal_name),
    readScopeString(taskProject?.goalName),
    readScopeString(habit?.goal_name),
    readScopeString(habit?.goalName),
    readScopeString(scheduleInstance?.goal_name),
    readScopeString(scheduleInstance?.goalName),
  ];
  const directIcon =
    readScopeString(item.goalIcon) ??
    readScopeString(record.goal_icon_emoji) ??
    readScopeString(record.goalIconEmoji) ??
    readScopeString(record.goal_emoji) ??
    readScopeString(record.goalEmoji) ??
    readScopeIconFromRecord(goal);
  const directName = directNames.find(Boolean) ?? null;
  const monumentMetadata = readGoalMonumentMetadata(
    goal,
    record,
    project,
    taskProject,
    habit,
    scheduleInstance
  );

  directIds.forEach((id) => {
    mergeConstraintOption(
      options,
      makeConstraintOption(
        id,
        directName,
        directIcon,
        undefined,
        undefined,
        monumentMetadata
      )
    );
  });
  directNames.forEach((name) => {
    mergeConstraintOption(
      options,
      makeConstraintOption(
        null,
        name,
        directIcon,
        undefined,
        undefined,
        monumentMetadata
      )
    );
  });

  for (const option of readConstraintArrayOptions(
    item,
    ["goals"],
    ["id", "goal_id", "goalId"],
    ["name", "title", "goal_name", "goalName"],
    ["icon_emoji", "emoji", "icon", "symbol"],
    [],
    readGoalMonumentMetadata
  )) {
    mergeConstraintOption(options, option);
  }

  return Array.from(options.values());
}

function getItemCampaignOptions(item: FocusPomoQueueItem): ConstraintOption[] {
  const record = item as unknown as Record<string, unknown>;
  const source = readScopeRecord(record.source);
  const raw = readScopeRecord(record.raw);
  const campaign = readScopeRecord(record.campaign);
  const habit = readScopeRecord(record.habit);
  const project = readScopeRecord(record.project);
  const task = readScopeRecord(record.task);
  const scheduleInstance = readScopeRecord(record.schedule_instance);
  const options = new Map<string, ConstraintOption>();

  const directIds = [
    readScopeString(record.campaign_id),
    readScopeString(record.campaignId),
    readScopeString(campaign?.id),
    readScopeString(habit?.campaign_id),
    readScopeString(habit?.campaignId),
    readScopeString(project?.campaign_id),
    readScopeString(project?.campaignId),
    readScopeString(task?.campaign_id),
    readScopeString(task?.campaignId),
    readScopeString(source?.campaign_id),
    readScopeString(source?.campaignId),
    readScopeString(raw?.campaign_id),
    readScopeString(raw?.campaignId),
    readScopeString(scheduleInstance?.campaign_id),
    readScopeString(scheduleInstance?.campaignId),
  ];
  const directNames = [
    readScopeString(record.campaign_name),
    readScopeString(record.campaignName),
    readScopeString(campaign?.name),
    readScopeString(campaign?.title),
    readScopeString(habit?.campaign_name),
    readScopeString(project?.campaign_name),
    readScopeString(task?.campaign_name),
    readScopeString(source?.campaign_name),
    readScopeString(raw?.campaign_name),
    readScopeString(scheduleInstance?.campaign_name),
  ];
  const directIcon =
    readScopeString(record.campaign_emoji) ??
    readScopeString(record.campaignEmoji) ??
    readScopeIconFromRecord(campaign);
  const uniqueDirectIds = uniqueScopeValues(directIds);
  const uniqueDirectNames = Array.from(
    new Map(
      directNames
        .filter((name): name is string => Boolean(name))
        .map((name) => [normalizeScopeName(name), name])
    ).values()
  );
  const directName = uniqueDirectNames[0] ?? null;

  uniqueDirectIds.forEach((id) => {
    mergeConstraintOption(options, makeConstraintOption(id, directName, directIcon));
  });
  if (uniqueDirectIds.length === 0) {
    uniqueDirectNames.forEach((name) => {
      mergeConstraintOption(options, makeConstraintOption(null, name, directIcon));
    });
  }

  for (const option of readConstraintArrayOptions(
    item,
    ["campaigns"],
    ["id", "campaign_id", "campaignId"],
    ["name", "title", "campaign_name", "campaignName"],
    ["emoji", "icon", "symbol"]
  )) {
    mergeConstraintOption(options, option);
  }

  return Array.from(options.values());
}

function getItemRoutineOptions(item: FocusPomoQueueItem): ConstraintOption[] {
  const record = item as unknown as Record<string, unknown>;
  const source = readScopeRecord(record.source);
  const raw = readScopeRecord(record.raw);
  const routine = readScopeRecord(record.routine);
  const habit = readScopeRecord(record.habit);
  const options = new Map<string, ConstraintOption>();

  const directIds = [
    readScopeString(record.routine_id),
    readScopeString(record.routineId),
    readScopeString(routine?.id),
    readScopeString(habit?.routine_id),
    readScopeString(habit?.routineId),
    readScopeString(source?.routine_id),
    readScopeString(source?.routineId),
    readScopeString(raw?.routine_id),
    readScopeString(raw?.routineId),
  ];
  const directNames = [
    readScopeString(record.routine_name),
    readScopeString(record.routineName),
    readScopeString(routine?.name),
    readScopeString(routine?.title),
    readScopeString(habit?.routine_name),
    readScopeString(source?.routine_name),
    readScopeString(raw?.routine_name),
  ];
  const directIcon =
    readScopeString(record.routine_emoji) ??
    readScopeString(record.routineEmoji) ??
    readScopeIconFromRecord(routine);
  const directName = directNames.find(Boolean) ?? null;

  directIds.forEach((id) => {
    mergeConstraintOption(options, makeConstraintOption(id, directName, directIcon));
  });
  directNames.forEach((name) => {
    mergeConstraintOption(options, makeConstraintOption(null, name, directIcon));
  });

  for (const option of readConstraintArrayOptions(
    item,
    ["routines", "habitRoutines", "habit_routines"],
    ["id", "routine_id", "routineId"],
    ["name", "title", "routine_name", "routineName"],
    ["emoji", "icon", "symbol"]
  )) {
    mergeConstraintOption(options, option);
  }

  return Array.from(options.values());
}

function getSourceScopeOption(
  source: FocusPomoSource | null | undefined,
  kind: "monument" | "skill"
): ScopeOption | null {
  if (!source || source.sourceType !== kind) return null;
  return makeScopeOption(source.sourceId, source.title, source.icon);
}

function sortScopeOptions(options: ScopeOption[]): ScopeOption[] {
  return options.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

function compareScopeOptionNames(a: ScopeOption, b: ScopeOption): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function hasScopeSortOrder(option: ScopeOption): boolean {
  return (
    typeof option.sortOrder === "number" && Number.isFinite(option.sortOrder)
  );
}

function sortSkillScopeOptions(
  options: ScopeOption[],
  categories: CatRow[]
): ScopeOption[] {
  const categoryOrder = new Map<string, number>();
  [...categories]
    .sort((a, b) => {
      const aHasOrder =
        typeof a.sort_order === "number" && Number.isFinite(a.sort_order);
      const bHasOrder =
        typeof b.sort_order === "number" && Number.isFinite(b.sort_order);

      if (aHasOrder && bHasOrder && a.sort_order !== b.sort_order) {
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      }
      if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;

      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    })
    .forEach((category, index) => {
      categoryOrder.set(category.id, index);
    });

  const originalIndex = new Map<string, number>();
  options.forEach((option, index) => {
    originalIndex.set(option.id, index);
  });

  return [...options].sort((a, b) => {
    const aCategoryOrder =
      a.categoryId != null ? categoryOrder.get(a.categoryId) : undefined;
    const bCategoryOrder =
      b.categoryId != null ? categoryOrder.get(b.categoryId) : undefined;
    const aUncategorized = aCategoryOrder == null;
    const bUncategorized = bCategoryOrder == null;

    if (aUncategorized !== bUncategorized) return aUncategorized ? 1 : -1;
    if (!aUncategorized && aCategoryOrder !== bCategoryOrder) {
      return (aCategoryOrder ?? 0) - (bCategoryOrder ?? 0);
    }

    const aHasOrder = hasScopeSortOrder(a);
    const bHasOrder = hasScopeSortOrder(b);
    if (aHasOrder && bHasOrder && a.sortOrder !== b.sortOrder) {
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    }
    if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;

    if (!aHasOrder && !bHasOrder) {
      const nameComparison = compareScopeOptionNames(a, b);
      if (nameComparison !== 0) return nameComparison;
    }

    return (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0);
  });
}

function buildScopeOptions(
  items: FocusPomoQueueItem[],
  source: FocusPomoSource | null | undefined,
  kind: "monument" | "skill"
): ScopeOption[] {
  const options = new Map<string, ScopeOption>();
  mergeScopeOption(options, getSourceScopeOption(source, kind));

  for (const item of items) {
    const itemOptions =
      kind === "monument"
        ? getItemMonumentOptions(item)
        : getItemSkillOptions(item);
    itemOptions.forEach((option) => mergeScopeOption(options, option));
  }

  return sortScopeOptions(Array.from(options.values()));
}

function deriveScopeOptions(
  baseQueue: FocusPomoQueueItem[],
  source: FocusPomoSource | null | undefined
): { monuments: ScopeOption[]; skills: ScopeOption[] } {
  return {
    monuments: buildScopeOptions(baseQueue, source, "monument"),
    skills: buildScopeOptions(baseQueue, source, "skill"),
  };
}

function withSourceScopeOption(
  options: ScopeOption[],
  source: FocusPomoSource | null | undefined,
  kind: "monument" | "skill"
): ScopeOption[] {
  const sourceOption = getSourceScopeOption(source, kind);
  if (!sourceOption) return options;

  const mergedOptions = new Map<string, ScopeOption>();
  options.forEach((option) => mergeScopeOption(mergedOptions, option));
  mergeScopeOption(mergedOptions, sourceOption);

  const mergedValues = Array.from(mergedOptions.values());
  return kind === "skill" ? mergedValues : sortScopeOptions(mergedValues);
}

function deriveConstraintOptions(
  items: FocusPomoQueueItem[]
): Pick<AvailableConstraintOptions, "tags" | "goals" | "campaigns" | "routines"> {
  const tags = new Map<string, ConstraintOption>();
  const goals = new Map<string, ConstraintOption>();
  const campaigns = new Map<string, ConstraintOption>();
  const routines = new Map<string, ConstraintOption>();

  for (const item of items) {
    getItemTagOptions(item).forEach((option) =>
      mergeConstraintOption(tags, option)
    );
    getItemGoalOptions(item).forEach((option) =>
      mergeConstraintOption(goals, option)
    );
    getItemCampaignOptions(item).forEach((option) =>
      mergeCampaignConstraintOption(campaigns, option)
    );
    getItemRoutineOptions(item).forEach((option) =>
      mergeConstraintOption(routines, option)
    );
  }

  return {
    tags: sortConstraintOptions(Array.from(tags.values())),
    goals: sortConstraintOptions(Array.from(goals.values())),
    campaigns: sortConstraintOptions(Array.from(campaigns.values())),
    routines: sortConstraintOptions(Array.from(routines.values())),
  };
}

function mergeConstraintOptions(
  primary: ConstraintOption[],
  fallback: ConstraintOption[]
): ConstraintOption[] {
  const options = new Map<string, ConstraintOption>();
  primary.forEach((option) => mergeConstraintOption(options, option));
  fallback.forEach((option) => mergeConstraintOption(options, option));
  return sortConstraintOptions(Array.from(options.values()));
}

function mergeCampaignConstraintOptions(
  primary: ConstraintOption[],
  fallback: ConstraintOption[]
): ConstraintOption[] {
  const options = new Map<string, ConstraintOption>();
  primary.forEach((option) => mergeCampaignConstraintOption(options, option));
  fallback.forEach((option) => mergeCampaignConstraintOption(options, option));
  return sortConstraintOptions(Array.from(options.values()));
}

function mergeHabitTypeOptions(
  primary: HabitTypeOption[],
  fallback: HabitTypeOption[]
): HabitTypeOption[] {
  const options = new Map<string, HabitTypeOption>();
  for (const option of [...primary, ...fallback]) {
    const normalized = normalizeHabitTypeOption(option.key);
    if (!normalized || options.has(normalized.key)) continue;
    options.set(normalized.key, {
      key: normalized.key,
      label: option.label || normalized.label,
    });
  }

  return Array.from(options.values());
}

function buildRoadmapGoalOrderMap(
  roadmaps: RoadmapWithItems[]
): Map<string, number> {
  const orderMap = new Map<string, number>();

  for (const roadmap of roadmaps) {
    const sortedItems = [...roadmap.items].sort(
      (a, b) => a.position - b.position
    );

    for (const item of sortedItems) {
      if (item.item_type === "GOAL" && item.goal?.id) {
        const order = item.position * 10000;
        orderMap.set(item.goal.id, order);
        if (roadmap.monument_id) {
          orderMap.set(`${roadmap.monument_id}:${item.goal.id}`, order);
        }
        continue;
      }

      if (item.item_type !== "CAMPAIGN" || !item.campaign) continue;

      const campaignGoals = [...item.campaign.goals].sort(
        (a, b) => a.position - b.position
      );
      for (const goal of campaignGoals) {
        const order = item.position * 10000 + goal.position;
        orderMap.set(goal.id, order);
        if (roadmap.monument_id) {
          orderMap.set(`${roadmap.monument_id}:${goal.id}`, order);
        }
      }
    }
  }

  return orderMap;
}

type FocusPomoProjectOrderRow = {
  id?: string | null;
  global_rank?: number | string | null;
  created_at?: string | null;
  completed_at?: string | null;
};

async function fetchFocusPomoProjectOrderMap(
  userId: string
): Promise<Map<string, number>> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return new Map();

  const selects = [
    "id, global_rank, created_at, completed_at",
    "id, created_at, completed_at",
  ];
  let lastError: unknown = null;

  for (const select of selects) {
    const { data, error } = await supabase
      .from("projects")
      .select(select)
      .eq("user_id", userId)
      .order(select.includes("global_rank") ? "global_rank" : "created_at", {
        ascending: true,
        nullsFirst: false,
      });

    if (error) {
      lastError = error;
      continue;
    }

    const rows = ((data ?? []) as FocusPomoProjectOrderRow[]).filter(
      (row) => !readScopeString(row.completed_at)
    );
    const orderMap = new Map<string, number>();

    rows.forEach((row, createdAtIndex) => {
      const projectId = readScopeString(row.id);
      if (!projectId) return;

      orderMap.set(
        projectId,
        readScopePositiveNumber(row.global_rank) ?? 1_000_000 + createdAtIndex
      );
    });

    return orderMap;
  }

  throw lastError;
}

function buildSelectedScopeSources(
  selectedMonumentIds: string[],
  selectedSkillIds: string[],
  availableScopeOptions: { monuments: ScopeOption[]; skills: ScopeOption[] },
  source: FocusPomoSource | null | undefined
): ScopeQueueSource[] {
  const monumentOptionsById = new Map(
    availableScopeOptions.monuments.map((option) => [option.id, option])
  );
  const skillOptionsById = new Map(
    availableScopeOptions.skills.map((option) => [option.id, option])
  );

  const sourceFallback =
    source && (selectedMonumentIds.includes(source.sourceId) ||
      selectedSkillIds.includes(source.sourceId))
      ? makeScopeOption(source.sourceId, source.title, source.icon)
      : null;

  return [
    ...selectedMonumentIds.map((id) => {
      const option =
        monumentOptionsById.get(id) ??
        (source?.sourceType === "monument" && sourceFallback?.id === id
          ? sourceFallback
          : null);

      return {
        sourceType: "monument" as const,
        sourceId: id,
        title: option?.name ?? normalizeSelectedScopeIdName(id),
        icon: option?.icon ?? null,
      };
    }),
    ...selectedSkillIds.map((id) => {
      const option =
        skillOptionsById.get(id) ??
        (source?.sourceType === "skill" && sourceFallback?.id === id
          ? sourceFallback
          : null);

      return {
        sourceType: "skill" as const,
        sourceId: id,
        title: option?.name ?? normalizeSelectedScopeIdName(id),
        icon: option?.icon ?? null,
      };
    }),
  ];
}

function annotateScopeWorkItem(
  item: FocusPomoQueueItem,
  scopeSource: ScopeQueueSource
): FocusPomoQueueItem {
  const record = item as unknown as Record<string, unknown>;
  const scopeOption = {
    id: scopeSource.sourceId,
    name: scopeSource.title,
    icon: scopeSource.icon ?? null,
  };

  if (scopeSource.sourceType === "monument") {
    return {
      ...item,
      monuments: mergeScopeOptionArrays(record.monuments, [scopeOption]),
    } as FocusPomoQueueItem;
  }

  return {
    ...item,
    skills: mergeScopeOptionArrays(record.skills, [scopeOption]),
  } as FocusPomoQueueItem;
}

function mergeScopeQueueItems(
  queueItems: FocusPomoQueueItem[]
): FocusPomoQueueItem[] {
  const itemsByKey = new Map<string, FocusPomoQueueItem>();

  for (const item of queueItems) {
    const key = `${item.sourceType}:${item.id}`;
    const existing = itemsByKey.get(key);

    if (!existing) {
      itemsByKey.set(key, item);
      continue;
    }

    const existingRecord = existing as unknown as Record<string, unknown>;
    const itemRecord = item as unknown as Record<string, unknown>;

    itemsByKey.set(key, {
      ...existing,
      ...item,
      monuments: mergeScopeOptionArrays(
        existingRecord.monuments,
        itemRecord.monuments
      ),
      skills: mergeScopeOptionArrays(existingRecord.skills, itemRecord.skills),
    } as FocusPomoQueueItem);
  }

  return Array.from(itemsByKey.values());
}

function pluralizeScopeLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function formatScopeSummaryOption(option: ScopeOption): string {
  return option.icon ? `${option.icon} ${option.name}` : option.name;
}

function itemMatchesScope(
  item: FocusPomoQueueItem,
  options: {
    source: FocusPomoSource | null | undefined;
    selectedMonumentIds: string[];
    selectedSkillIds: string[];
    selectedMonumentNames: string[];
    selectedSkillNames: string[];
  }
): boolean {
  const {
    source,
    selectedMonumentIds,
    selectedSkillIds,
    selectedMonumentNames,
    selectedSkillNames,
  } = options;
  const hasMonumentScope = selectedMonumentIds.length > 0;
  const hasSkillScope = selectedSkillIds.length > 0;

  if (!hasMonumentScope && !hasSkillScope) return true;

  let matchesMonumentScope = false;
  let matchesSkillScope = false;

  if (hasMonumentScope) {
    const monumentIds = getItemMonumentIds(item, source);
    const monumentNames = getItemMonumentNames(item, source).map(
      normalizeScopeName
    );
    matchesMonumentScope =
      selectedMonumentIds.some(
        (id) =>
          monumentIds.includes(id) ||
          monumentNames.includes(normalizeSelectedScopeIdName(id))
      ) || selectedMonumentNames.some((name) => monumentNames.includes(name));
  }

  if (hasSkillScope) {
    const skillIds = getItemSkillIds(item, source);
    const skillNames = getItemSkillNames(item, source).map(normalizeScopeName);
    matchesSkillScope =
      selectedSkillIds.some(
        (id) =>
          skillIds.includes(id) ||
          skillNames.includes(normalizeSelectedScopeIdName(id))
      ) || selectedSkillNames.some((name) => skillNames.includes(name));
  }

  return matchesMonumentScope || matchesSkillScope;
}

function optionMatchKeys(option: ScopeOption | ConstraintOption): string[] {
  const constraintOption = option as ConstraintOption;
  return uniqueScopeValues([
    option.id,
    nameScopeId(option.name),
    ...(constraintOption.matchKeys ?? []),
  ]);
}

function selectedOptionKeys(
  selectedIds: string[],
  selectedOptions: Array<ScopeOption | ConstraintOption>
): string[] {
  return uniqueScopeValues([
    ...selectedIds,
    ...selectedIds.map(normalizeSelectedScopeIdName).map(nameScopeId),
    ...selectedOptions.flatMap(optionMatchKeys),
  ]);
}

function relationOptionKeys(options: Array<ScopeOption | ConstraintOption>) {
  return uniqueScopeValues(options.flatMap(optionMatchKeys));
}

function selectedGroupMatchesItem(
  itemKeys: string[],
  selectedKeys: string[]
): boolean {
  if (selectedKeys.length === 0) return true;
  const normalizedItemKeys = itemKeys.map(normalizeScopeName);
  return selectedKeys.some((key) =>
    normalizedItemKeys.includes(normalizeScopeName(key))
  );
}

function selectedGroupHasItemMatch(
  itemKeys: string[],
  selectedKeys: string[]
): boolean {
  return (
    selectedKeys.length > 0 && selectedGroupMatchesItem(itemKeys, selectedKeys)
  );
}

function relationMatchKey(kind: string, value: string | null): string | null {
  return value ? `${kind}:${normalizeScopeName(value)}` : null;
}

function relationIdMatchKey(kind: string, value: string | null): string | null {
  return value ? `${kind}-id:${value}` : null;
}

function campaignRelationMatchKeysFromRecord(
  record: Record<string, unknown> | null
): string[] {
  if (!record) return [];
  const campaignGoalIds = record.campaign_goal_ids;
  const goalIdValues = Array.isArray(campaignGoalIds)
    ? campaignGoalIds.map(readScopeString)
    : [];

  return uniqueScopeValues([
    relationIdMatchKey("campaign", readScopeString(record.campaign_id)),
    relationIdMatchKey("campaign", readScopeString(record.campaignId)),
    relationIdMatchKey("goal", readScopeString(record.goal_id)),
    relationIdMatchKey("goal", readScopeString(record.goalId)),
    relationIdMatchKey("goal", readScopeString(record.campaign_goal_id)),
    ...goalIdValues.map((goalId) => relationIdMatchKey("goal", goalId)),
    relationIdMatchKey("monument", readScopeString(record.monument_id)),
    relationIdMatchKey("monument", readScopeString(record.monumentId)),
    relationIdMatchKey("monument", readScopeString(record.campaign_monument_id)),
    relationIdMatchKey(
      "monument",
      readScopeString(record.primary_monument_id)
    ),
    relationIdMatchKey("circle", readScopeString(record.circle_id)),
    relationIdMatchKey("circle", readScopeString(record.circleId)),
    relationIdMatchKey("circle", readScopeString(record.campaign_circle_id)),
    relationIdMatchKey("circle", readScopeString(record.primary_circle_id)),
    relationIdMatchKey("roadmap", readScopeString(record.roadmap_id)),
    relationIdMatchKey("roadmap", readScopeString(record.roadmapId)),
    relationIdMatchKey("roadmap", readScopeString(record.campaign_roadmap_id)),
    relationMatchKey("campaign", readScopeString(record.campaign_name)),
    relationMatchKey("campaign", readScopeString(record.campaignName)),
    relationMatchKey("goal", readScopeString(record.goal_name)),
    relationMatchKey("goal", readScopeString(record.goalName)),
  ]);
}

function getItemCampaignMatchKeys(
  item: FocusPomoQueueItem,
  source?: FocusPomoSource | null
): string[] {
  const record = item as unknown as Record<string, unknown>;
  const sourceRecord = readNestedScopeRecord(record, "source");
  const raw = readNestedScopeRecord(record, "raw");
  const campaign = readNestedScopeRecord(record, "campaign");
  const habit = readNestedScopeRecord(record, "habit");
  const project = readNestedScopeRecord(record, "project");
  const task = readNestedScopeRecord(record, "task");

  return uniqueScopeValues([
    ...relationOptionKeys(getItemCampaignOptions(item)),
    ...campaignRelationMatchKeysFromRecord(record),
    ...campaignRelationMatchKeysFromRecord(sourceRecord),
    ...campaignRelationMatchKeysFromRecord(raw),
    ...campaignRelationMatchKeysFromRecord(campaign),
    ...campaignRelationMatchKeysFromRecord(habit),
    ...campaignRelationMatchKeysFromRecord(project),
    ...campaignRelationMatchKeysFromRecord(task),
    ...getItemGoalOptions(item).flatMap((option) => [
      relationIdMatchKey("goal", option.id),
      relationMatchKey("goal", option.name),
    ]),
    ...getItemMonumentIds(item, source).map((id) =>
      relationIdMatchKey("monument", id)
    ),
    ...getItemMonumentNames(item, source).map((name) =>
      relationMatchKey("monument", name)
    ),
  ]);
}

type SelectedExecutionScopeOptions = {
  source: FocusPomoSource | null | undefined;
  selectedMonumentIds: string[];
  selectedSkillIds: string[];
  selectedMonumentNames: string[];
  selectedSkillNames: string[];
  selectedTagKeys: string[];
  selectedGoalKeys: string[];
  selectedCampaignKeys: string[];
  selectedRoutineKeys: string[];
};

function itemMatchesSelectedExecutionScope(
  item: FocusPomoQueueItem,
  options: SelectedExecutionScopeOptions
): boolean {
  const hasMonumentOrSkillScope =
    options.selectedMonumentIds.length > 0 ||
    options.selectedSkillIds.length > 0;
  const hasSelectedScopeSource =
    hasMonumentOrSkillScope ||
    options.selectedTagKeys.length > 0 ||
    options.selectedGoalKeys.length > 0 ||
    options.selectedCampaignKeys.length > 0 ||
    options.selectedRoutineKeys.length > 0;

  if (!hasSelectedScopeSource) return true;

  if (
    hasMonumentOrSkillScope &&
    itemMatchesScope(item, {
      source: options.source,
      selectedMonumentIds: options.selectedMonumentIds,
      selectedSkillIds: options.selectedSkillIds,
      selectedMonumentNames: options.selectedMonumentNames,
      selectedSkillNames: options.selectedSkillNames,
    })
  ) {
    return true;
  }

  if (
    selectedGroupHasItemMatch(
      relationOptionKeys(getItemTagOptions(item)),
      options.selectedTagKeys
    )
  ) {
    return true;
  }

  if (
    selectedGroupHasItemMatch(
      relationOptionKeys(getItemGoalOptions(item)),
      options.selectedGoalKeys
    )
  ) {
    return true;
  }

  if (
    selectedGroupHasItemMatch(
      getItemCampaignMatchKeys(item, options.source),
      options.selectedCampaignKeys
    )
  ) {
    return true;
  }

  return selectedGroupHasItemMatch(
    relationOptionKeys(getItemRoutineOptions(item)),
    options.selectedRoutineKeys
  );
}

function itemMatchesExecutionConstraints(
  item: FocusPomoQueueItem,
  options: SelectedExecutionScopeOptions & {
    enabledItemTypes: FocusExecutionItemType[];
    enabledHabitTypes: string[] | null;
  }
): boolean {
  if (
    !itemMatchesSelectedExecutionScope(item, {
      source: options.source,
      selectedMonumentIds: options.selectedMonumentIds,
      selectedSkillIds: options.selectedSkillIds,
      selectedMonumentNames: options.selectedMonumentNames,
      selectedSkillNames: options.selectedSkillNames,
      selectedTagKeys: options.selectedTagKeys,
      selectedGoalKeys: options.selectedGoalKeys,
      selectedCampaignKeys: options.selectedCampaignKeys,
      selectedRoutineKeys: options.selectedRoutineKeys,
    })
  ) {
    return false;
  }

  return itemMatchesExecutionFilters(item, {
    enabledItemTypes: options.enabledItemTypes,
    enabledHabitTypes: options.enabledHabitTypes,
  });
}

function getScopeSummary(
  groups: Array<{ count: number; singular: string; option?: ScopeOption | ConstraintOption }>,
  customWorkTypeFilters: boolean,
  customHabitTypeFilters: boolean
): string {
  const activeGroups = groups.filter((group) => group.count > 0);
  const customInstanceTypeFilters =
    customWorkTypeFilters || customHabitTypeFilters;
  const selectedCount =
    activeGroups.reduce((total, group) => total + group.count, 0) +
    (customInstanceTypeFilters ? 1 : 0);

  if (selectedCount === 0) return "All scheduled work";
  if (selectedCount === 1 && activeGroups.length === 1 && activeGroups[0].option) {
    return formatScopeSummaryOption(activeGroups[0].option);
  }

  return [
    ...activeGroups.map((group) =>
      pluralizeScopeLabel(group.count, group.singular)
    ),
    customInstanceTypeFilters ? "Instance Types" : null,
  ]
    .filter(Boolean)
    .join(" • ");
}

function buildMissionSummary(
  item: FocusPomoQueueItem,
  sourceTitle: string
): string {
  const durationLabel = item.durationLabel || "No duration";
  const sourceLabel = sourceTitle.trim() || "this source";

  if (item.kind === "project") {
    const context = [
      item.goalTitle ? `goal ${item.goalTitle}` : null,
      item.skillName ? `skill ${item.skillName}` : null,
    ].filter(Boolean);

    return context.length > 0
      ? `${durationLabel} project for ${context.join(" and ")}.`
      : `${durationLabel} project inside ${sourceLabel}.`;
  }

  const habitType = item.rawTypeLabel ?? item.kind;
  const skillContext = item.skillName ? ` through ${item.skillName}` : "";

  return `${durationLabel} ${habitType.toLowerCase()} inside ${sourceLabel}${skillContext}.`;
}

function itemDisplayIcon(item: FocusPomoQueueItem | null): string | null {
  if (!item) return null;
  return item.icon ?? item.skillIcon ?? null;
}

function itemSkillIcon(item: FocusPomoQueueItem | null): string | null {
  if (!item) return null;

  return (
    readScopeString(item.skillIcon) ?? getItemSkillOptions(item)[0]?.icon ?? null
  );
}

function getItemGoalDisplay(
  item: FocusPomoQueueItem | null
): { name: string; icon: string } | null {
  if (!item) return null;

  const record = item as unknown as Record<string, unknown>;
  const source = readScopeRecord(record.source);
  const raw = readScopeRecord(record.raw);
  const goal = readScopeRecord(record.goal);
  const sourceGoal = readScopeRecord(source?.goal);
  const rawGoal = readScopeRecord(raw?.goal);
  const name =
    readScopeString(item.goalTitle) ??
    readScopeString(record.goal_name) ??
    readScopeString(record.goalName) ??
    readScopeString(record.goalTitle) ??
    readScopeString(goal?.name) ??
    readScopeString(goal?.title) ??
    readScopeString(sourceGoal?.name) ??
    readScopeString(sourceGoal?.title) ??
    readScopeString(rawGoal?.name) ??
    readScopeString(rawGoal?.title);

  if (!name) return null;

  const icon =
    readScopeString(item.goalIcon) ??
    readScopeString(record.goal_icon_emoji) ??
    readScopeString(record.goalIconEmoji) ??
    readScopeString(record.goal_emoji) ??
    readScopeString(record.goalEmoji) ??
    readScopeIconFromRecord(goal) ??
    readScopeIconFromRecord(sourceGoal) ??
    readScopeIconFromRecord(rawGoal);

  return { name, icon: icon ?? initialsFallback(name, "G") };
}

function getItemRoutineDisplay(
  item: FocusPomoQueueItem | null
): { name: string; icon: string } | null {
  if (!item) return null;

  const routine = getItemRoutineOptions(item)[0];
  if (!routine?.name) return null;

  return {
    name: routine.name,
    icon: routine.icon ?? initialsFallback(routine.name, "R"),
  };
}

function scopeOptionFallback(kind: "monument" | "skill", name: string): string {
  if (kind === "skill") return "•";

  return initialsFallback(name, "M");
}

function initialsFallback(name: string, fallback: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials || fallback;
}

function normalizeFlameLevel(
  energyCode?: string | null,
  energyLabel?: string | null
): FlameLevel {
  const raw = (energyCode ?? energyLabel ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, "-");

  switch (raw) {
    case "NO":
    case "LOW":
    case "MEDIUM":
    case "HIGH":
    case "ULTRA":
    case "EXTREME":
      return raw;
    case "ULTRA-CRITICAL":
      return "ULTRA";
    default:
      return "NO";
  }
}

function buildRunResultDisplayMetadata(item: FocusPomoQueueItem): Pick<
  FocusPomoRunResult,
  | "itemKind"
  | "icon"
  | "energyCode"
  | "energyLabel"
  | "workTypeLabel"
  | "relationLabel"
  | "relationIcon"
  | "relationType"
  | "durationLabel"
> {
  const itemKind = getFocusItemKind(item);
  const relation =
    itemKind === "habit" ? getItemRoutineDisplay(item) : getItemGoalDisplay(item);

  return {
    itemKind,
    icon: itemDisplayIcon(item),
    energyCode: item.energyCode ?? null,
    energyLabel: item.energyLabel ?? null,
    workTypeLabel: item.rawTypeLabel ?? itemKind.toUpperCase(),
    relationLabel: relation?.name ?? null,
    relationIcon: relation?.icon ?? null,
    relationType: relation ? (itemKind === "habit" ? "routine" : "goal") : null,
    durationLabel: item.durationLabel || null,
  };
}

function getFocusPomoQueueItemKey(item: FocusPomoQueueItem): string {
  return `${item.sourceType}:${item.id}`;
}

function readFirstScopeString(values: unknown[]): string | null {
  for (const value of values) {
    const stringValue = readScopeString(value);
    if (stringValue) return stringValue;
  }

  return null;
}

function readFocusPomoScheduleInstanceId(item: FocusPomoQueueItem): string | null {
  const record = item as unknown as Record<string, unknown>;
  const source = readNestedScopeRecord(record, "source");
  const raw = readNestedScopeRecord(record, "raw");
  const scheduleInstance =
    readNestedScopeRecord(record, "schedule_instance") ??
    readNestedScopeRecord(record, "scheduleInstance");

  return readFirstScopeString([
    record.scheduleInstanceId,
    record.schedule_instance_id,
    record.schedule_instanceId,
    record.instanceId,
    record.instance_id,
    source?.scheduleInstanceId,
    source?.schedule_instance_id,
    raw?.scheduleInstanceId,
    raw?.schedule_instance_id,
    scheduleInstance?.id,
    scheduleInstance?.scheduleInstanceId,
    scheduleInstance?.schedule_instance_id,
  ]);
}

function getFocusPomoCompletionKind(
  item: FocusPomoQueueItem
): FocusPomoCompletionKind | null {
  if (item.sourceType === "PROJECT") return "project";
  if (item.sourceType === "HABIT") return "habit";

  const itemKind = getFocusItemKind(item);
  if (itemKind === "project" || itemKind === "habit") return itemKind;
  return null;
}

function readFocusPomoCompletionSourceType(
  kind: FocusPomoCompletionKind
): "PROJECT" | "HABIT" {
  return kind === "project" ? "PROJECT" : "HABIT";
}

function normalizeFocusPomoDurationMinutes(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric) : null;
}

function getBrowserTimeZone(): string {
  return (
    Intl.DateTimeFormat().resolvedOptions().timeZone?.trim() || "UTC"
  );
}

function getFocusPomoCompletionSkillIds(item: FocusPomoQueueItem): string[] {
  const record = item as unknown as Record<string, unknown>;
  return uniqueScopeValues([
    item.skillId ?? null,
    readScopeString(record.skill_id),
  ]);
}

function getFocusPomoCompletionMonumentIds(item: FocusPomoQueueItem): string[] {
  const record = item as unknown as Record<string, unknown>;
  const source = readNestedScopeRecord(record, "source");
  const raw = readNestedScopeRecord(record, "raw");
  const goalMetadata = readGoalMonumentMetadata(record, source, raw);

  return uniqueScopeValues([
    item.goalMonumentId ?? null,
    item.goal_monument_id ?? null,
    goalMetadata.monumentId ?? null,
    ...getItemMonumentOptions(item)
      .map((option) => option.id)
      .filter((id) => !id.startsWith("name:")),
  ]);
}

function buildFocusPomoAwardKeyBase({
  item,
  kind,
  scheduleInstanceId,
  dateKey,
}: {
  item: FocusPomoQueueItem;
  kind: FocusPomoCompletionKind;
  scheduleInstanceId: string | null;
  dateKey: string;
}) {
  if (scheduleInstanceId) return `sched:${scheduleInstanceId}:${kind}`;
  return `focuspomo:${item.sourceType}:${item.id}:${dateKey}:${kind}`;
}

async function awardFocusPomoCompletionXp({
  item,
  kind,
  completedAt,
  timeZone,
  durationMin,
  scheduleInstanceId,
  productivityDayKey,
}: {
  item: FocusPomoQueueItem;
  kind: FocusPomoCompletionKind;
  completedAt: string;
  timeZone: string;
  durationMin: number | null;
  scheduleInstanceId: string | null;
  productivityDayKey: string;
}) {
  const sourceType = readFocusPomoCompletionSourceType(kind);
  const skillIds = getFocusPomoCompletionSkillIds(item);
  const monumentIds = getFocusPomoCompletionMonumentIds(item);
  const body: Record<string, unknown> = {
    kind,
    amount: kind === "project" ? 3 : 1,
    awardKeyBase: buildFocusPomoAwardKeyBase({
      item,
      kind,
      scheduleInstanceId,
      dateKey: productivityDayKey,
    }),
    completion: {
      action: "complete",
      sourceType,
      sourceId: item.id,
      completedAt,
      wasScheduled: Boolean(scheduleInstanceId),
      scheduleInstanceId: scheduleInstanceId ?? undefined,
      durationMin,
      timeZone,
      productivityDayKey,
    },
  };

  if (scheduleInstanceId) {
    body.scheduleInstanceId = scheduleInstanceId;
  }
  if (skillIds.length > 0) {
    body.skillIds = skillIds;
  }
  if (monumentIds.length > 0) {
    body.monumentIds = monumentIds;
  }

  try {
    const response = await fetch("/api/xp/award", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error(
        "FocusPomo failed to award completion XP",
        await response.text()
      );
    }
  } catch (error) {
    console.error("FocusPomo failed to award completion XP", error);
  }
}

async function awardFocusPomoCompletionUndoXp({
  item,
  kind,
  completedAt,
  timeZone,
  durationMin,
  scheduleInstanceId,
  productivityDayKey,
}: {
  item: FocusPomoQueueItem;
  kind: FocusPomoCompletionKind;
  completedAt: string;
  timeZone: string;
  durationMin: number | null;
  scheduleInstanceId: string | null;
  productivityDayKey: string;
}) {
  const sourceType = readFocusPomoCompletionSourceType(kind);
  const skillIds = getFocusPomoCompletionSkillIds(item);
  const monumentIds = getFocusPomoCompletionMonumentIds(item);
  const body: Record<string, unknown> = {
    kind,
    amount: kind === "project" ? -3 : -1,
    awardKeyBase: `${buildFocusPomoAwardKeyBase({
      item,
      kind,
      scheduleInstanceId,
      dateKey: productivityDayKey,
    })}:undo`,
    completion: {
      action: "undo",
      sourceType,
      sourceId: item.id,
      completedAt,
      wasScheduled: Boolean(scheduleInstanceId),
      scheduleInstanceId: scheduleInstanceId ?? undefined,
      durationMin,
      timeZone,
      productivityDayKey,
    },
  };

  if (scheduleInstanceId) {
    body.scheduleInstanceId = scheduleInstanceId;
  }
  if (skillIds.length > 0) {
    body.skillIds = skillIds;
  }
  if (monumentIds.length > 0) {
    body.monumentIds = monumentIds;
  }

  try {
    const response = await fetch("/api/xp/award", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error(
        "FocusPomo failed to reverse completion XP",
        await response.text()
      );
    }
  } catch (error) {
    console.error("FocusPomo failed to reverse completion XP", error);
  }
}

async function completeFocusPomoScheduleInstance(
  scheduleInstanceId: string | null,
  completedAt: string
): Promise<boolean> {
  if (!scheduleInstanceId) return true;

  try {
    const response = await fetch("/api/schedule/instances/batchStatus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updates: [
          {
            id: scheduleInstanceId,
            status: "completed",
            completed_at: completedAt,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error(
        "FocusPomo failed to complete schedule instance",
        await response.text()
      );
      void hapticErrorPattern();
      return false;
    }
  } catch (error) {
    console.error("FocusPomo failed to complete schedule instance", error);
    void hapticErrorPattern();
    return false;
  }

  return true;
}

async function undoFocusPomoScheduleInstance(scheduleInstanceId: string | null) {
  if (!scheduleInstanceId) return;

  try {
    const response = await fetch("/api/schedule/instances/batchStatus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updates: [
          {
            id: scheduleInstanceId,
            status: "scheduled",
            completed_at: null,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error(
        "FocusPomo failed to undo schedule instance completion",
        await response.text()
      );
    }
  } catch (error) {
    console.error(
      "FocusPomo failed to undo schedule instance completion",
      error
    );
  }
}

async function completeFocusPomoItem({
  item,
  completedAt,
  timeZone,
}: {
  item: FocusPomoQueueItem;
  completedAt: string;
  timeZone: string;
}): Promise<boolean> {
  const kind = getFocusPomoCompletionKind(item);
  if (!kind) return true;

  const scheduleInstanceId = readFocusPomoScheduleInstanceId(item);
  const durationMin = normalizeFocusPomoDurationMinutes(item.durationMinutes);
  const productivityDayKey = completionProductivityDayKey(
    new Date(completedAt),
    timeZone
  );

  const scheduleCompleted = await completeFocusPomoScheduleInstance(
    scheduleInstanceId,
    completedAt
  );
  if (!scheduleCompleted) return false;

  if (kind === "project") {
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      console.warn("FocusPomo could not complete project: Supabase unavailable");
      void hapticErrorPattern();
      return false;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("FocusPomo could not complete project: user unavailable", userError);
      void hapticErrorPattern();
      return false;
    }

    const projectsTable = supabase.from(
      "projects"
    ) as unknown as FocusPomoProjectCompletionUpdate;
    const { error } = await projectsTable
      .update({
        completed_at: completedAt,
        updated_at: new Date().toISOString(),
        stage: "RELEASE",
      })
      .eq("id", item.id)
      .eq("user_id", user.id);

    if (error) {
      console.error("FocusPomo failed to complete project", error);
      void hapticErrorPattern();
      return false;
    }
  } else {
    try {
      const response = await fetch("/api/habits/completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          habitId: item.id,
          completedAt,
          timeZone,
          action: "complete",
          scheduleInstanceId: scheduleInstanceId ?? undefined,
          durationMin,
        }),
      });

      if (!response.ok) {
        console.error(
          "FocusPomo failed to record habit completion",
          await response.text()
        );
        void hapticErrorPattern();
        return false;
      }
    } catch (error) {
      console.error("FocusPomo failed to record habit completion", error);
      void hapticErrorPattern();
      return false;
    }
  }

  try {
    await awardFocusPomoCompletionXp({
      item,
      kind,
      completedAt,
      timeZone,
      durationMin,
      scheduleInstanceId,
      productivityDayKey,
    });
  } catch {
    return false;
  }

  return true;
}

async function undoFocusPomoItem({
  item,
  completedAt,
  timeZone,
}: {
  item: FocusPomoQueueItem;
  completedAt: string;
  timeZone: string;
}) {
  const kind = getFocusPomoCompletionKind(item);
  if (!kind) return;

  const scheduleInstanceId = readFocusPomoScheduleInstanceId(item);
  const durationMin = normalizeFocusPomoDurationMinutes(item.durationMinutes);
  const productivityDayKey = completionProductivityDayKey(
    new Date(completedAt),
    timeZone
  );

  await undoFocusPomoScheduleInstance(scheduleInstanceId);

  if (kind === "project") {
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      console.warn(
        "FocusPomo could not undo project completion: Supabase unavailable"
      );
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error(
        "FocusPomo could not undo project completion: user unavailable",
        userError
      );
      return;
    }

    const projectsTable = supabase.from(
      "projects"
    ) as unknown as FocusPomoProjectCompletionUpdate;
    const { error } = await projectsTable
      .update({
        completed_at: null,
        updated_at: new Date().toISOString(),
        stage: "BUILD",
      })
      .eq("id", item.id)
      .eq("user_id", user.id);

    if (error) {
      console.error("FocusPomo failed to undo project completion", error);
      return;
    }
  } else {
    try {
      const response = await fetch("/api/habits/completion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          habitId: item.id,
          completedAt,
          timeZone,
          action: "undo",
          scheduleInstanceId: scheduleInstanceId ?? undefined,
          durationMin,
        }),
      });

      if (!response.ok) {
        console.error(
          "FocusPomo failed to undo habit completion",
          await response.text()
        );
        return;
      }
    } catch (error) {
      console.error("FocusPomo failed to undo habit completion", error);
      return;
    }
  }

  await awardFocusPomoCompletionUndoXp({
    item,
    kind,
    completedAt,
    timeZone,
    durationMin,
    scheduleInstanceId,
    productivityDayKey,
  });
}

function isRecordType(
  record: Record<string, unknown> | null,
  expectedType: FocusExecutionItemType
): boolean {
  if (!record) return false;

  const candidates = [
    readScopeString(record.type),
    readScopeString(record.kind),
    readScopeString(record.sourceType),
    readScopeString(record.source_type),
    readScopeString(record.itemType),
    readScopeString(record.item_type),
  ];

  return candidates.some(
    (candidate) =>
      candidate &&
      normalizeExecutionFilterValue(candidate) === expectedType
  );
}

function getFocusQueueFabOriginRect(element: HTMLElement) {
  const rect = element.getBoundingClientRect();

  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function getFocusPomoQueueEditTarget(
  item: FocusPomoQueueItem,
  originElement: HTMLElement
): FabEditTarget | null {
  const itemKind = getFocusItemKind(item);
  const record = item as unknown as Record<string, unknown>;
  const source = readNestedScopeRecord(record, "source");
  const raw = readNestedScopeRecord(record, "raw");
  const taskSourceId = readFirstScopeString([
    item.taskId,
    item.task_id,
    record.taskId,
    record.task_id,
    isRecordType(source, "task") ? source?.id : null,
    isRecordType(raw, "task") ? raw?.id : null,
    itemKind === "task" ? item.id : null,
  ]);
  const projectSourceId = readFirstScopeString([
    item.projectId,
    item.project_id,
    record.projectId,
    record.project_id,
    isRecordType(source, "project") ? source?.id : null,
    isRecordType(raw, "project") ? raw?.id : null,
    item.sourceType === "PROJECT" ? item.id : null,
    itemKind === "project" ? item.id : null,
  ]);
  const habitSourceId = readFirstScopeString([
    record.habitId,
    record.habit_id,
    isRecordType(source, "habit") ? source?.id : null,
    isRecordType(raw, "habit") ? raw?.id : null,
    item.sourceType === "HABIT" ? item.id : null,
    itemKind === "habit" ? item.id : null,
  ]);
  const originRect = getFocusQueueFabOriginRect(originElement);
  const taskStage = readFirstScopeString([
    record.stage,
    record.status,
    isRecordType(source, "task") ? source?.stage : null,
    isRecordType(raw, "task") ? raw?.stage : null,
  ]);
  const taskCompletedAt = readFirstScopeString([
    record.completedAt,
    record.completed_at,
    isRecordType(source, "task") ? source?.completedAt : null,
    isRecordType(source, "task") ? source?.completed_at : null,
    isRecordType(raw, "task") ? raw?.completedAt : null,
    isRecordType(raw, "task") ? raw?.completed_at : null,
  ]);
  const projectStage = readFirstScopeString([
    record.stage,
    isRecordType(source, "project") ? source?.stage : null,
    isRecordType(raw, "project") ? raw?.stage : null,
  ]);
  const projectStatus = readFirstScopeString([
    record.status,
    isRecordType(source, "project") ? source?.status : null,
    isRecordType(raw, "project") ? raw?.status : null,
  ]);
  const projectCompletedAt = readFirstScopeString([
    record.completedAt,
    record.completed_at,
    isRecordType(source, "project") ? source?.completedAt : null,
    isRecordType(source, "project") ? source?.completed_at : null,
    isRecordType(raw, "project") ? raw?.completedAt : null,
    isRecordType(raw, "project") ? raw?.completed_at : null,
  ]);

  if (itemKind === "task" && taskSourceId) {
    return {
      entityType: "TASK",
      entityId: taskSourceId,
      title: item.title,
      originRect,
      stage: taskStage,
      completedAt: taskCompletedAt,
    };
  }

  if (itemKind === "project" && projectSourceId) {
    return {
      entityType: "PROJECT",
      entityId: projectSourceId,
      title: item.title,
      originRect,
      stage: projectStage,
      status: projectStatus,
      completedAt: projectCompletedAt,
    };
  }

  if (itemKind === "habit" && habitSourceId) {
    return {
      entityType: "HABIT",
      entityId: habitSourceId,
      title: item.title,
      originRect,
      habitSnapshot: {
        name: item.title,
        habitType: getFocusItemHabitType(item),
        recurrence: readScopeString(item.recurrence),
        durationMinutes: item.durationMinutes,
        energy: item.energyCode ?? item.energyLabel,
        goalId: item.goalId ?? item.goal_id ?? null,
        skillId: item.skillId ?? null,
        routineId: item.routineId ?? item.routine_id ?? null,
      },
    };
  }

  return null;
}

function applyFocusPomoQueueOrder(
  queueItems: FocusPomoQueueItem[],
  customOrder: string[] | null
): FocusPomoQueueItem[] {
  if (!customOrder) return queueItems;

  const itemsByKey = new Map(
    queueItems.map((item) => [getFocusPomoQueueItemKey(item), item])
  );
  const orderedItems: FocusPomoQueueItem[] = [];
  const usedKeys = new Set<string>();

  for (const key of customOrder) {
    const item = itemsByKey.get(key);
    if (!item) continue;

    orderedItems.push(item);
    usedKeys.add(key);
  }

  for (const item of queueItems) {
    const key = getFocusPomoQueueItemKey(item);
    if (!usedKeys.has(key)) {
      orderedItems.push(item);
    }
  }

  return orderedItems;
}

type SortableFocusQueueItemProps = {
  item: FocusPomoQueueItem;
  position: number;
  selected: boolean;
  isQueueExpanded: boolean;
  onSelect(): void;
  onLongPressEdit(originElement: HTMLElement): void;
};

function SortableFocusQueueItem({
  item,
  position,
  selected,
  isQueueExpanded,
  onSelect,
  onLongPressEdit,
}: SortableFocusQueueItemProps) {
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{
    x: number;
    y: number;
    pointerId: number;
  } | null>(null);
  const longPressOriginRef = useRef<HTMLButtonElement | null>(null);
  const longPressTriggeredRef = useRef(false);
  const suppressClickUntilRef = useRef(0);
  const itemKey = getFocusPomoQueueItemKey(item);
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: itemKey });
  const transformStyle = transform
    ? CSS.Translate.toString(transform)
    : undefined;
  const previewIcon = itemDisplayIcon(item);
  const queueEnergyLevel = normalizeFlameLevel(
    item.energyCode,
    item.energyLabel
  );
  const containerClassName = [
    selected
      ? "relative grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] items-stretch border border-white/10 bg-white/[0.055] text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.10),inset_0_0_18px_rgba(255,255,255,0.022),inset_0_-12px_20px_rgba(0,0,0,0.18)] transition"
      : isQueueExpanded
        ? "grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] items-stretch border-t border-black/40 text-left opacity-60 transition hover:bg-white/[0.035] hover:opacity-90"
        : "grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] items-stretch border-t border-black/40 text-left opacity-60 transition hover:bg-white/[0.035] hover:opacity-90 sm:border-l sm:border-t-0",
    isDragging
      ? "z-20 bg-white/[0.075] opacity-95 shadow-[0_20px_45px_-28px_rgba(0,0,0,0.98),inset_0_1px_0_rgba(255,255,255,0.12)] ring-1 ring-white/15"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    longPressStartRef.current = null;
    longPressOriginRef.current = null;
  }, []);

  const cancelLongPress = useCallback(
    (options?: { suppressClick?: boolean }) => {
      if (options?.suppressClick) {
        suppressClickUntilRef.current = Date.now() + FOCUS_QUEUE_MOVE_SUPPRESS_MS;
      }

      clearLongPress();
    },
    [clearLongPress]
  );

  useEffect(() => {
    const handleScroll = () => {
      if (!longPressStartRef.current) return;

      suppressClickUntilRef.current = Date.now() + FOCUS_QUEUE_MOVE_SUPPRESS_MS;
      clearLongPress();
    };

    window.addEventListener("scroll", handleScroll, true);

    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      clearLongPress();
    };
  }, [clearLongPress]);

  const handlePressPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const element = event.currentTarget;
    const pointerId = event.pointerId;

    clearLongPress();
    longPressTriggeredRef.current = false;
    longPressStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId,
    };
    longPressOriginRef.current = element;

    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      longPressTriggeredRef.current = true;
      suppressClickUntilRef.current =
        Date.now() + FOCUS_QUEUE_LONG_PRESS_SUPPRESS_MS;
      longPressStartRef.current = null;
      longPressOriginRef.current = null;

      void hapticLongPress();
      onLongPressEdit(element);
    }, FOCUS_QUEUE_LONG_PRESS_MS);
  };

  const handlePressPointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    const start = longPressStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;

    const deltaX = Math.abs(event.clientX - start.x);
    const deltaY = Math.abs(event.clientY - start.y);

    if (
      deltaX > FOCUS_QUEUE_LONG_PRESS_MOVE_TOLERANCE ||
      deltaY > FOCUS_QUEUE_LONG_PRESS_MOVE_TOLERANCE
    ) {
      cancelLongPress({ suppressClick: true });
    }
  };

  const handlePressPointerUp = (
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    const longPressTriggered = longPressTriggeredRef.current;

    clearLongPress();

    if (longPressTriggered) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handlePressPointerCancel = () => {
    cancelLongPress({ suppressClick: true });
  };

  const handlePressPointerLeave = () => {
    cancelLongPress({ suppressClick: true });
  };

  const handlePressClickCapture = (
    event: ReactMouseEvent<HTMLButtonElement>
  ) => {
    if (
      longPressTriggeredRef.current ||
      Date.now() < suppressClickUntilRef.current
    ) {
      event.preventDefault();
      event.stopPropagation();
      longPressTriggeredRef.current = false;
    }
  };

  const handlePressContextMenu = (
    event: ReactMouseEvent<HTMLButtonElement>
  ) => {
    if (
      longPressTriggeredRef.current ||
      longPressTimerRef.current !== null ||
      Date.now() < suppressClickUntilRef.current
    ) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transformStyle,
        transition,
      }}
      className={containerClassName}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${item.title}`}
        className="flex min-h-full cursor-grab touch-none select-none items-center justify-center text-white/20 outline-none transition hover:bg-white/[0.045] hover:text-white/62 active:cursor-grabbing active:bg-white/[0.07] active:text-white/72 focus-visible:bg-white/[0.075] focus-visible:text-white/72 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/18"
      >
        <GripVertical className="size-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onPointerDown={handlePressPointerDown}
        onPointerMove={handlePressPointerMove}
        onPointerUp={handlePressPointerUp}
        onPointerCancel={handlePressPointerCancel}
        onPointerLeave={handlePressPointerLeave}
        onClickCapture={handlePressClickCapture}
        onClick={onSelect}
        onContextMenu={handlePressContextMenu}
        aria-current={selected ? "true" : undefined}
        aria-pressed={selected}
        aria-label={
          selected
            ? `Current event: ${item.title}`
            : `Make current event: ${item.title}`
        }
        className="flex min-w-0 touch-pan-y select-none items-center gap-2 py-2.5 pr-3 text-left outline-none focus:ring-2 focus:ring-inset focus:ring-white/35 sm:gap-3 sm:py-4 sm:pr-4"
      >
        <span className={FOCUS_POMO_QUEUE_NUMBER_BADGE_CLASS}>
          {position}
        </span>
        {previewIcon ? (
          <span className={FOCUS_POMO_QUEUE_ICON_BADGE_CLASS}>
            <span aria-hidden="true">{previewIcon}</span>
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold uppercase tracking-normal text-white/82 sm:text-sm">
            {item.title}
          </span>
          <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-[0.14em] text-white/38 sm:mt-1 sm:text-[10px] sm:tracking-[0.18em]">
            {item.rawTypeLabel ?? item.kind}
          </span>
        </span>
        <span className="ml-auto flex h-7 w-5 shrink-0 items-center justify-end overflow-visible sm:h-9 sm:w-7">
          <FlameEmber
            level={queueEnergyLevel}
            size="sm"
            className="shrink-0 overflow-visible [&_svg]:overflow-visible"
          />
        </span>
      </button>
    </div>
  );
}

async function fetchUserHabitTypeOptions(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowser>>,
  userId: string
): Promise<HabitTypeOption[]> {
  const { data, error } = await supabase
    .from("habits")
    .select("habit_type")
    .eq("user_id", userId)
    .is("circle_id", null);

  if (error) throw error;

  return (data ?? [])
    .map((row) => readScopeString((row as { habit_type?: unknown }).habit_type))
    .map(normalizeHabitTypeOption)
    .filter((option): option is HabitTypeOption => Boolean(option));
}

async function fetchUserTagOptions(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowser>>,
  userId: string
): Promise<ConstraintOption[]> {
  const selects = ["id, name, color", "id, name"];
  let lastError: unknown = null;

  for (const select of selects) {
    const { data, error } = await supabase
      .from("tags")
      .select(select)
      .eq("user_id", userId)
      .order("name", { ascending: true });

    if (!error) {
      return sortConstraintOptions(
        (data ?? [])
          .map((row) => {
            const record = row as Record<string, unknown>;
            return makeConstraintOption(
              readScopeString(record.id),
              readScopeString(record.name),
              null,
              readScopeString(record.color)
            );
          })
          .filter((option): option is ConstraintOption => Boolean(option))
      );
    }

    lastError = error;
  }

  throw lastError;
}

type CampaignConstraintRow = {
  id?: string | null;
  name?: string | null;
  title?: string | null;
  emoji?: string | null;
  icon_emoji?: string | null;
  icon?: string | null;
  symbol?: string | null;
  goal_id?: string | null;
  monument_id?: string | null;
  primary_monument_id?: string | null;
  circle_id?: string | null;
  primary_circle_id?: string | null;
  roadmap_id?: string | null;
};

async function fetchCampaignGoalMatchKeys(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowser>>,
  userId: string,
  campaignIds: string[]
): Promise<Map<string, string[]>> {
  const ids = Array.from(new Set(campaignIds.filter(Boolean)));
  if (ids.length === 0) return new Map();

  const queries = [
    () =>
      supabase
        .from("campaign_goals")
        .select("campaign_id, goal_id")
        .eq("user_id", userId)
        .in("campaign_id", ids),
    () =>
      supabase
        .from("campaign_goals")
        .select("campaign_id, goal_id")
        .in("campaign_id", ids),
  ];

  for (const runQuery of queries) {
    const { data, error } = await runQuery();
    if (error) continue;

    const map = new Map<string, string[]>();
    for (const row of data ?? []) {
      const record = row as Record<string, unknown>;
      const campaignId = readScopeString(record.campaign_id);
      const goalId = readScopeString(record.goal_id);
      if (!campaignId || !goalId) continue;
      map.set(campaignId, [
        ...(map.get(campaignId) ?? []),
        relationIdMatchKey("goal", goalId) ?? "",
      ]);
    }

    return map;
  }

  return new Map();
}

async function fetchUserCampaignOptions(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowser>>,
  userId: string
): Promise<ConstraintOption[]> {
  const selects = [
    "id, name, title, emoji, icon_emoji, icon, symbol, goal_id, monument_id, primary_monument_id, circle_id, primary_circle_id, roadmap_id",
    "id, name, title, emoji, primary_monument_id, primary_circle_id, roadmap_id",
    "id, name, emoji, primary_monument_id, primary_circle_id, roadmap_id",
    "id, name, emoji",
    "id, name",
  ];
  let lastError: unknown = null;

  for (const select of selects) {
    const { data, error } = await supabase
      .from("campaigns")
      .select(select)
      .eq("user_id", userId)
      .order("name", { ascending: true });

    if (error) {
      lastError = error;
      continue;
    }

    const rows = (data ?? []) as CampaignConstraintRow[];
    const goalMatchKeysByCampaignId = await fetchCampaignGoalMatchKeys(
      supabase,
      userId,
      rows
        .map((row) => readScopeString(row.id))
        .filter((id): id is string => Boolean(id))
    );

    return sortConstraintOptions(
      rows
        .map((row) => {
          const campaignId = readScopeString(row.id);
          return makeConstraintOption(
            campaignId,
            readScopeString(row.name) ?? readScopeString(row.title),
            readScopeIconFromRecord(row as Record<string, unknown>),
            null,
            [
              relationIdMatchKey("campaign", campaignId),
              relationMatchKey("campaign", readScopeString(row.name)),
              relationMatchKey("campaign", readScopeString(row.title)),
              relationIdMatchKey("goal", readScopeString(row.goal_id)),
              relationIdMatchKey("monument", readScopeString(row.monument_id)),
              relationIdMatchKey(
                "monument",
                readScopeString(row.primary_monument_id)
              ),
              relationIdMatchKey("circle", readScopeString(row.circle_id)),
              relationIdMatchKey(
                "circle",
                readScopeString(row.primary_circle_id)
              ),
              relationIdMatchKey("roadmap", readScopeString(row.roadmap_id)),
              ...(campaignId
                ? (goalMatchKeysByCampaignId.get(campaignId) ?? [])
                : []),
            ].filter((key): key is string => Boolean(key))
          );
        })
        .filter((option): option is ConstraintOption => Boolean(option))
    );
  }

  throw lastError;
}

async function fetchUserRoutineOptions(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowser>>,
  userId: string
): Promise<ConstraintOption[]> {
  const { data, error } = await supabase
    .from("habit_routines")
    .select("id, name")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (error) throw error;

  return sortConstraintOptions(
    (data ?? [])
      .map((row) => {
        const record = row as Record<string, unknown>;
        return makeConstraintOption(
          readScopeString(record.id),
          readScopeString(record.name)
        );
      })
      .filter((option): option is ConstraintOption => Boolean(option))
  );
}

function FocusPomoFilterSection({
  label,
  hasSelectedFilters,
  onClear,
  children,
}: {
  label: string;
  hasSelectedFilters: boolean;
  onClear: () => void;
  children: ReactNode;
}) {
  const sectionId = useId();
  const [expanded, setExpanded] = useState(hasSelectedFilters);

  useEffect(() => {
    if (hasSelectedFilters) {
      setExpanded(true);
    }
  }, [hasSelectedFilters]);

  const handleAllClick = () => {
    if (hasSelectedFilters) {
      void hapticSoftTick();
      onClear();
      setExpanded(false);
      return;
    }

    void hapticSnap();
    setExpanded((current) => !current);
  };

  return (
    <section>
      <div className="flex items-center gap-2">
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-400/85 sm:text-[10px] sm:tracking-[0.22em]">
          {label}
        </p>
        <button
          type="button"
          aria-controls={sectionId}
          aria-expanded={expanded}
          aria-pressed={!hasSelectedFilters}
          onClick={handleAllClick}
          className={
            hasSelectedFilters
              ? "ml-auto inline-flex min-h-7 items-center justify-center rounded-full border border-black/60 bg-black/30 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 transition hover:border-black/40 hover:bg-white/[0.06] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/35 sm:min-h-8 sm:px-3.5 sm:text-[11px]"
              : "ml-auto inline-flex min-h-7 items-center justify-center rounded-full border border-black/50 bg-white/10 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] transition focus:outline-none focus:ring-2 focus:ring-white/35 sm:min-h-8 sm:px-3.5 sm:text-[11px]"
          }
        >
          ALL
        </button>
      </div>
      <div
        id={sectionId}
        className={
          expanded
            ? "grid translate-y-0 grid-rows-[1fr] overflow-hidden opacity-100 transition-[grid-template-rows,opacity,transform] duration-300 ease-out mt-1.5 sm:mt-2"
            : "grid -translate-y-1 grid-rows-[0fr] overflow-hidden opacity-0 transition-[grid-template-rows,opacity,transform] duration-300 ease-out mt-0"
        }
      >
        <div className="min-h-0 overflow-hidden">
          {children}
        </div>
      </div>
    </section>
  );
}

export default function FocusPomo({ open, source, onClose }: FocusPomoProps) {
  const fabCreation = useFabCreation();
  const toast = useToastHelpers();
  const [mounted, setMounted] = useState(false);
  const [lastSource, setLastSource] = useState<FocusPomoSource | null>(null);
  const [mode, setMode] = useState<FocusPomoMode>("pomo");
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [remainingMs, setRemainingMs] = useState(0);
  const [queue, setQueue] = useState<FocusPomoQueueItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [scopeQueue, setScopeQueue] = useState<FocusPomoQueueItem[]>([]);
  const [scopeQueueLoading, setScopeQueueLoading] = useState(false);
  const [scopeQueueError, setScopeQueueError] = useState<string | null>(null);
  const [availableScopeOptions, setAvailableScopeOptions] = useState<{
    monuments: ScopeOption[];
    skills: ScopeOption[];
  }>({ monuments: [], skills: [] });
  const [availableSkillCategories, setAvailableSkillCategories] = useState<
    CatRow[]
  >([]);
  const [availableConstraintOptions, setAvailableConstraintOptions] =
    useState<AvailableConstraintOptions>({
      tags: [],
      goals: [],
      campaigns: [],
      routines: [],
      habitTypes: KNOWN_HABIT_TYPE_OPTIONS,
    });
  const [roadmapGoalOrderMap, setRoadmapGoalOrderMap] = useState<
    Map<string, number>
  >(new Map());
  const [projectOrderMap, setProjectOrderMap] = useState<Map<string, number>>(
    new Map()
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [customQueueOrder, setCustomQueueOrder] = useState<string[] | null>(
    null
  );
  const [dismissedQueueItemKeys, setDismissedQueueItemKeys] = useState<
    Set<string>
  >(new Set());
  const [runHistory, setRunHistory] = useState<FocusPomoRunResult[]>([]);
  const [hasRunStarted, setHasRunStarted] = useState(false);
  const [isRunLogExpanded, setIsRunLogExpanded] = useState(false);
  const completionRequestsRef = useRef(new Map<string, Promise<void>>());
  const focusPomoLiveActivityRef =
    useRef<ActiveFocusPomoLiveActivitySession | null>(null);
  const focusPomoLiveActivityActionHandlerRef = useRef({
    complete: () => undefined,
    skip: () => undefined,
  });
  const processedLiveActivityActionIdsRef = useRef(new Set<string>());
  const previousActiveIndexRef = useRef(activeIndex);
  const queueSourceSignatureRef = useRef("");
  const suppressQueueClickRef = useRef(false);
  const initializedSourceScopeRef = useRef<string | null>(null);
  const previousTimerItemRef = useRef<{
    itemKey: string | null;
    durationMs: number;
  } | null>(null);
  const focusWidgetPayloadSignatureRef = useRef<string | null>(null);
  const preserveRunningTimerItemRef = useRef<{
    itemKey: string | null;
    durationMs: number;
  } | null>(null);
  const timerStartedAtMsRef = useRef(0);
  const timerBaseElapsedMsRef = useRef(0);
  const timerBaseRemainingMsRef = useRef(0);
  const elapsedMsRef = useRef(0);
  const remainingMsRef = useRef(0);
  const previousStopwatchSecondInMinuteRef = useRef<number | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [isQueueExpanded, setIsQueueExpanded] = useState(false);
  const [selectedMonumentIds, setSelectedMonumentIds] = useState<string[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [draftSelectedMonumentIds, setDraftSelectedMonumentIds] = useState<
    string[]
  >([]);
  const [draftSelectedSkillIds, setDraftSelectedSkillIds] = useState<string[]>(
    []
  );
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([]);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [selectedRoutineIds, setSelectedRoutineIds] = useState<string[]>([]);
  const [enabledItemTypes, setEnabledItemTypes] =
    useState<FocusExecutionItemType[]>(DEFAULT_ENABLED_ITEM_TYPES);
  const [enabledHabitTypes, setEnabledHabitTypes] = useState<string[] | null>(
    null
  );
  const habitsEnabled = enabledItemTypes.includes("habit");
  const projectsEnabled = enabledItemTypes.includes("project");
  const tasksEnabled = enabledItemTypes.includes("task");
  const showHabitTypeSection = habitsEnabled;
  const showRoutinesSection = habitsEnabled;
  const showGoalsSection = projectsEnabled || tasksEnabled;
  const showCampaignsSection = projectsEnabled || tasksEnabled;
  const showTagsSection = projectsEnabled || tasksEnabled || habitsEnabled;
  const prefersReducedMotion = useReducedMotion();
  const titleId = useId();
  const executionScopePanelId = useId();
  const mobileExecutionScopePanelId = useId();
  const queueListId = useId();
  const activeSourceId = source?.sourceId;
  const activeSourceType = source?.sourceType;
  const queueDragSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 180,
        tolerance: 8,
      },
    })
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open && source) {
      setLastSource(source);
    }
  }, [open, source]);

  useEffect(() => {
    if (!open) {
      setIsRunning(false);
      setScopeOpen(false);
      setIsQueueExpanded(false);
      setHasRunStarted(false);
      setIsRunLogExpanded(false);
      setCustomQueueOrder(null);
    }
  }, [open]);

  useEffect(() => {
    if (!scopeOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDraftSelectedMonumentIds(selectedMonumentIds);
        setDraftSelectedSkillIds(selectedSkillIds);
        setScopeOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [scopeOpen, selectedMonumentIds, selectedSkillIds]);

  useEffect(() => {
    if (!open) {
      setAvailableScopeOptions({ monuments: [], skills: [] });
      setAvailableSkillCategories([]);
      setAvailableConstraintOptions({
        tags: [],
        goals: [],
        campaigns: [],
        routines: [],
        habitTypes: KNOWN_HABIT_TYPE_OPTIONS,
      });
      setRoadmapGoalOrderMap(new Map());
      setProjectOrderMap(new Map());
      return;
    }

    let stale = false;

    async function loadAvailableScopeOptions() {
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        setAvailableScopeOptions({ monuments: [], skills: [] });
        setAvailableSkillCategories([]);
        setAvailableConstraintOptions({
          tags: [],
          goals: [],
          campaigns: [],
          routines: [],
          habitTypes: KNOWN_HABIT_TYPE_OPTIONS,
        });
        setRoadmapGoalOrderMap(new Map());
        setProjectOrderMap(new Map());
        return;
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (stale) return;

      if (userError || !user) {
        if (userError) {
          console.error("Failed to load FocusPomo scope user", userError);
        }
        setAvailableScopeOptions({ monuments: [], skills: [] });
        setAvailableSkillCategories([]);
        setAvailableConstraintOptions({
          tags: [],
          goals: [],
          campaigns: [],
          routines: [],
          habitTypes: KNOWN_HABIT_TYPE_OPTIONS,
        });
        setRoadmapGoalOrderMap(new Map());
        setProjectOrderMap(new Map());
        return;
      }

      const [
        monumentsResult,
        skillsResult,
        categoriesResult,
        goalsResult,
        roadmapsResult,
        tagsResult,
        campaignsResult,
        routinesResult,
        habitTypesResult,
        projectOrderMapResult,
      ] = await Promise.allSettled([
        getMonumentsForUser(user.id),
        getSkillsForUser(user.id),
        getCatsForUser(user.id),
        getGoalsForUser(user.id),
        listRoadmapsWithItems(user.id),
        fetchUserTagOptions(supabase, user.id),
        fetchUserCampaignOptions(supabase, user.id),
        fetchUserRoutineOptions(supabase, user.id),
        fetchUserHabitTypeOptions(supabase, user.id),
        fetchFocusPomoProjectOrderMap(user.id),
      ]);

      if (stale) return;

      if (monumentsResult.status === "rejected") {
        console.error(
          "Failed to load FocusPomo monument scope options",
          monumentsResult.reason
        );
      }
      if (skillsResult.status === "rejected") {
        console.error(
          "Failed to load FocusPomo skill scope options",
          skillsResult.reason
        );
      }
      if (categoriesResult.status === "rejected") {
        console.error(
          "Failed to load FocusPomo skill categories",
          categoriesResult.reason
        );
      }
      if (goalsResult.status === "rejected") {
        console.error(
          "Failed to load FocusPomo goal constraint options",
          goalsResult.reason
        );
      }
      if (roadmapsResult.status === "rejected") {
        console.error(
          "Failed to load FocusPomo roadmap order",
          roadmapsResult.reason
        );
      }
      if (tagsResult.status === "rejected") {
        console.error(
          "Failed to load FocusPomo tag constraint options",
          tagsResult.reason
        );
      }
      if (campaignsResult.status === "rejected") {
        console.error(
          "Failed to load FocusPomo campaign constraint options",
          campaignsResult.reason
        );
      }
      if (routinesResult.status === "rejected") {
        console.error(
          "Failed to load FocusPomo routine constraint options",
          routinesResult.reason
        );
      }
      if (habitTypesResult.status === "rejected") {
        console.error(
          "Failed to load FocusPomo habit type options",
          habitTypesResult.reason
        );
      }
      if (projectOrderMapResult.status === "rejected") {
        console.error(
          "Failed to load FocusPomo project order",
          projectOrderMapResult.reason
        );
      }

      setAvailableScopeOptions({
        monuments:
          monumentsResult.status === "fulfilled"
            ? sortScopeOptions(
                monumentsResult.value
                  .map((monument) =>
                    makeScopeOption(monument.id, monument.title, monument.emoji)
                  )
                  .filter((option): option is ScopeOption => Boolean(option))
              )
            : [],
        skills:
          skillsResult.status === "fulfilled"
            ? skillsResult.value
                .map((skill) =>
                  makeScopeOption(
                    skill.id,
                    skill.name,
                    skill.icon ?? null,
                    skill.monument_id ?? null,
                    skill.cat_id ?? null,
                    null,
                    skill.sort_order ?? null
                  )
                )
                .filter((option): option is ScopeOption => Boolean(option))
            : [],
      });
      setAvailableSkillCategories(
        categoriesResult.status === "fulfilled" ? categoriesResult.value : []
      );
      setAvailableConstraintOptions({
        tags: tagsResult.status === "fulfilled" ? tagsResult.value : [],
        goals:
          goalsResult.status === "fulfilled"
            ? sortConstraintOptions(
                goalsResult.value
                  .map((goal) => {
                    const goalRecord = goal as unknown as Record<
                      string,
                      unknown
                    >;

                    return makeConstraintOption(
                      goal.id,
                      goal.name,
                      goal.emoji ?? readScopeIconFromRecord(goalRecord),
                      undefined,
                      undefined,
                      readGoalMonumentMetadata(goalRecord)
                    );
                  })
                  .filter((option): option is ConstraintOption =>
                    Boolean(option)
                  )
              )
            : [],
        campaigns:
          campaignsResult.status === "fulfilled" ? campaignsResult.value : [],
        routines: routinesResult.status === "fulfilled" ? routinesResult.value : [],
        habitTypes: mergeHabitTypeOptions(
          KNOWN_HABIT_TYPE_OPTIONS,
          habitTypesResult.status === "fulfilled" ? habitTypesResult.value : []
        ),
      });
      setRoadmapGoalOrderMap(
        roadmapsResult.status === "fulfilled"
          ? buildRoadmapGoalOrderMap(roadmapsResult.value)
          : new Map()
      );
      setProjectOrderMap(
        projectOrderMapResult.status === "fulfilled"
          ? projectOrderMapResult.value
          : new Map()
      );
    }

    loadAvailableScopeOptions();

    return () => {
      stale = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQueue([]);
      setQueueLoading(false);
      setQueueError(null);
      setScopeQueue([]);
      setScopeQueueLoading(false);
      setScopeQueueError(null);
      setActiveIndex(0);
      setCustomQueueOrder(null);
      setDismissedQueueItemKeys(new Set());
      setSelectedMonumentIds([]);
      setSelectedSkillIds([]);
      setDraftSelectedMonumentIds([]);
      setDraftSelectedSkillIds([]);
      setSelectedTagIds([]);
      setSelectedGoalIds([]);
      setSelectedCampaignIds([]);
      setSelectedRoutineIds([]);
      setEnabledItemTypes(DEFAULT_ENABLED_ITEM_TYPES);
      setEnabledHabitTypes(null);
      setRunHistory([]);
      setHasRunStarted(false);
      setIsRunLogExpanded(false);
      setScopeOpen(false);
      setIsQueueExpanded(false);
      return;
    }

    let stale = false;

    setActiveIndex(0);
    setCustomQueueOrder(null);
    setDismissedQueueItemKeys(new Set());
    setSelectedMonumentIds([]);
    setSelectedSkillIds([]);
    setDraftSelectedMonumentIds([]);
    setDraftSelectedSkillIds([]);
    setSelectedTagIds([]);
    setSelectedGoalIds([]);
    setSelectedCampaignIds([]);
    setSelectedRoutineIds([]);
    setEnabledItemTypes(DEFAULT_ENABLED_ITEM_TYPES);
    setEnabledHabitTypes(null);
    setRunHistory([]);
    setHasRunStarted(false);
    setIsRunLogExpanded(false);
    setScopeOpen(false);
    setIsQueueExpanded(false);
    setQueueLoading(true);
    setQueueError(null);

    fetchFocusPomoQueue(
      activeSourceType && activeSourceId
        ? {
            sourceType: activeSourceType,
            sourceId: activeSourceId,
          }
        : {}
    )
      .then((items) => {
        if (stale) return;
        setQueue(items);
      })
      .catch((error: unknown) => {
        if (stale) return;
        console.error("Failed to load FocusPomo queue", error);
        setQueue([]);
        setQueueError(
          error instanceof Error
            ? error.message
            : "Failed to load execution queue."
        );
      })
      .finally(() => {
        if (stale) return;
        setQueueLoading(false);
      });

    return () => {
      stale = true;
    };
  }, [open, activeSourceId, activeSourceType]);

  useEffect(() => {
    if (!open || !source?.sourceId) {
      initializedSourceScopeRef.current = null;
      return;
    }

    const sourceScopeKey = `${source.sourceType}:${source.sourceId}`;
    if (initializedSourceScopeRef.current === sourceScopeKey) return;

    initializedSourceScopeRef.current = sourceScopeKey;

    if (source.sourceType === "monument") {
      setSelectedMonumentIds([source.sourceId]);
      setSelectedSkillIds([]);
      setDraftSelectedMonumentIds([source.sourceId]);
      setDraftSelectedSkillIds([]);
      return;
    }

    setSelectedSkillIds([source.sourceId]);
    setSelectedMonumentIds([]);
    setDraftSelectedSkillIds([source.sourceId]);
    setDraftSelectedMonumentIds([]);
  }, [open, source?.sourceId, source?.sourceType]);

  useEffect(() => {
    const shouldResetActiveIndex =
      (!showRoutinesSection && selectedRoutineIds.length > 0) ||
      (!showGoalsSection && selectedGoalIds.length > 0) ||
      (!showCampaignsSection && selectedCampaignIds.length > 0) ||
      (!showTagsSection && selectedTagIds.length > 0) ||
      (!showHabitTypeSection && enabledHabitTypes !== null);

    if (shouldResetActiveIndex) {
      setActiveIndex(0);
      setDismissedQueueItemKeys(new Set());
      setRunHistory([]);
      setHasRunStarted(false);
      setIsRunLogExpanded(false);
    }

    if (!showRoutinesSection) {
      setSelectedRoutineIds((current) =>
        current.length > 0 ? [] : current
      );
    }
    if (!showGoalsSection) {
      setSelectedGoalIds((current) => (current.length > 0 ? [] : current));
    }
    if (!showCampaignsSection) {
      setSelectedCampaignIds((current) =>
        current.length > 0 ? [] : current
      );
    }
    if (!showTagsSection) {
      setSelectedTagIds((current) => (current.length > 0 ? [] : current));
    }
    if (!showHabitTypeSection) {
      setEnabledHabitTypes((current) => (current === null ? current : null));
    }
  }, [
    enabledHabitTypes,
    selectedCampaignIds.length,
    selectedGoalIds.length,
    selectedRoutineIds.length,
    selectedTagIds.length,
    showCampaignsSection,
    showGoalsSection,
    showHabitTypeSection,
    showRoutinesSection,
    showTagsSection,
  ]);

  useEffect(() => {
    const hasManualScope =
      selectedMonumentIds.length > 0 || selectedSkillIds.length > 0;

    if (!open || !hasManualScope) {
      setScopeQueue([]);
      setScopeQueueLoading(false);
      setScopeQueueError(null);
      return;
    }

    const scopeSources = buildSelectedScopeSources(
      selectedMonumentIds,
      selectedSkillIds,
      availableScopeOptions,
      source
    );

    if (scopeSources.length === 0) {
      setScopeQueue([]);
      setScopeQueueLoading(false);
      setScopeQueueError(null);
      return;
    }

    const selectedSourceScope =
      source && scopeSources.length === 1
        ? scopeSources.find(
            (scopeSource) =>
              scopeSource.sourceType === source.sourceType &&
              scopeSource.sourceId === source.sourceId
          )
        : null;

    if (selectedSourceScope) {
      setActiveIndex(0);
      setCustomQueueOrder(null);
      setDismissedQueueItemKeys(new Set());

      if (queueLoading) {
        setScopeQueueLoading(true);
        setScopeQueueError(null);
        return;
      }

      if (!queueError) {
        setScopeQueue(
          mergeScopeQueueItems(
            queue.map((item) => annotateScopeWorkItem(item, selectedSourceScope))
          )
        );
        setScopeQueueLoading(false);
        setScopeQueueError(null);
        return;
      }
    }

    let stale = false;

    setActiveIndex(0);
    setCustomQueueOrder(null);
    setDismissedQueueItemKeys(new Set());
    setScopeQueueLoading(true);
    setScopeQueueError(null);

    Promise.all(
      scopeSources.map(async (scopeSource) => {
        const items = await fetchFocusPomoQueue({
          sourceType: scopeSource.sourceType,
          sourceId: scopeSource.sourceId,
        });

        return items.map((item) => annotateScopeWorkItem(item, scopeSource));
      })
    )
      .then((itemGroups) => {
        if (stale) return;
        setScopeQueue(mergeScopeQueueItems(itemGroups.flat()));
      })
      .catch((error: unknown) => {
        if (stale) return;
        console.error("Failed to load FocusPomo scope queue", error);
        setScopeQueue([]);
        setScopeQueueError(
          error instanceof Error
            ? error.message
            : "Failed to load scope work."
        );
      })
      .finally(() => {
        if (stale) return;
        setScopeQueueLoading(false);
      });

    return () => {
      stale = true;
    };
  }, [
    open,
    source,
    queue,
    queueError,
    queueLoading,
    selectedMonumentIds,
    selectedSkillIds,
    availableScopeOptions,
  ]);

  const shouldShow = open;
  const displaySource = shouldShow ? source : lastSource;
  const hasSelectedScope =
    selectedMonumentIds.length > 0 || selectedSkillIds.length > 0;
  const hasDraftSelectedScope =
    draftSelectedMonumentIds.length > 0 || draftSelectedSkillIds.length > 0;
  const effectiveQueue = hasSelectedScope
    ? mergeScopeQueueItems([...queue, ...scopeQueue])
    : queue;
  const effectiveQueueLoading = hasSelectedScope
    ? scopeQueueLoading
    : queueLoading;
  const effectiveQueueError = hasSelectedScope ? scopeQueueError : queueError;
  const queueDerivedScopeOptions = deriveScopeOptions(
    [...queue, ...scopeQueue],
    displaySource
  );
  const monumentOptions =
    availableScopeOptions.monuments.length > 0
      ? withSourceScopeOption(
          availableScopeOptions.monuments,
          displaySource,
          "monument"
        )
      : queueDerivedScopeOptions.monuments;
  const skillOptions =
    availableScopeOptions.skills.length > 0
      ? withSourceScopeOption(availableScopeOptions.skills, displaySource, "skill")
      : queueDerivedScopeOptions.skills;
  const sortedSkillOptions = sortSkillScopeOptions(
    skillOptions,
    availableSkillCategories
  );
  const queueDerivedConstraintOptions = deriveConstraintOptions([
    ...queue,
    ...scopeQueue,
  ]);
  const tagOptions = mergeConstraintOptions(
    availableConstraintOptions.tags,
    queueDerivedConstraintOptions.tags
  );
  const goalOptions = mergeConstraintOptions(
    availableConstraintOptions.goals,
    queueDerivedConstraintOptions.goals
  );
  const groupedGoalOptions = buildGroupedGoalOptions(
    goalOptions,
    monumentOptions,
    selectedMonumentIds
  );
  const campaignOptions = mergeCampaignConstraintOptions(
    availableConstraintOptions.campaigns,
    queueDerivedConstraintOptions.campaigns
  );
  const routineOptions = mergeConstraintOptions(
    availableConstraintOptions.routines,
    queueDerivedConstraintOptions.routines
  );
  const habitTypeOptions = mergeHabitTypeOptions(
    availableConstraintOptions.habitTypes,
    buildHabitTypeOptions([...queue, ...scopeQueue])
  );
  const habitTypePillOptions = buildHabitTypePillOptions(habitTypeOptions);
  const selectedMonumentOptions = monumentOptions.filter((option) =>
    selectedMonumentIds.includes(option.id)
  );
  const selectedSkillOptions = skillOptions.filter((option) =>
    selectedSkillIds.includes(option.id)
  );
  const effectiveSelectedTagIds = showTagsSection ? selectedTagIds : [];
  const effectiveSelectedGoalIds = showGoalsSection ? selectedGoalIds : [];
  const effectiveSelectedCampaignIds = showCampaignsSection
    ? selectedCampaignIds
    : [];
  const effectiveSelectedRoutineIds = showRoutinesSection
    ? selectedRoutineIds
    : [];
  const selectedTagOptions = tagOptions.filter((option) =>
    effectiveSelectedTagIds.includes(option.id)
  );
  const selectedGoalOptions = goalOptions.filter((option) =>
    effectiveSelectedGoalIds.includes(option.id)
  );
  const selectedCampaignOptions = campaignOptions.filter((option) =>
    effectiveSelectedCampaignIds.includes(option.id)
  );
  const selectedRoutineOptions = routineOptions.filter((option) =>
    effectiveSelectedRoutineIds.includes(option.id)
  );
  const selectedMonumentNames = uniqueScopeValues([
    ...selectedMonumentOptions.map((option) => option.name),
    displaySource?.sourceType === "monument" &&
    selectedMonumentIds.includes(displaySource.sourceId)
      ? displaySource.title
      : null,
  ]).map(normalizeScopeName);
  const selectedSkillNames = uniqueScopeValues([
    ...selectedSkillOptions.map((option) => option.name),
    displaySource?.sourceType === "skill" &&
    selectedSkillIds.includes(displaySource.sourceId)
      ? displaySource.title
      : null,
  ]).map(normalizeScopeName);
  const selectedTagKeys = selectedOptionKeys(
    effectiveSelectedTagIds,
    selectedTagOptions
  );
  const selectedGoalKeys = selectedOptionKeys(
    effectiveSelectedGoalIds,
    selectedGoalOptions
  );
  const selectedCampaignKeys = selectedOptionKeys(
    effectiveSelectedCampaignIds,
    selectedCampaignOptions
  );
  const selectedRoutineKeys = selectedOptionKeys(
    effectiveSelectedRoutineIds,
    selectedRoutineOptions
  );
  const hasSelectedExecutionScope =
    hasSelectedScope ||
    selectedTagKeys.length > 0 ||
    selectedGoalKeys.length > 0 ||
    selectedCampaignKeys.length > 0 ||
    selectedRoutineKeys.length > 0;
  const scopeFilteredQueue = hasSelectedExecutionScope
    ? effectiveQueue.filter((item) =>
        itemMatchesSelectedExecutionScope(item, {
          source: displaySource,
          selectedMonumentIds,
          selectedSkillIds,
          selectedMonumentNames,
          selectedSkillNames,
          selectedTagKeys,
          selectedGoalKeys,
          selectedCampaignKeys,
          selectedRoutineKeys,
        })
      )
    : effectiveQueue;
  const hasTaskQueueItems = scopeFilteredQueue.some(
    (item) => getFocusItemKind(item) === "task"
  );
  const workTypeOptions = workTypeOptionConfig.filter(
    (option) => option.value !== "task" || hasTaskQueueItems
  );
  const selectedHabitTypeKeys =
    enabledHabitTypes ?? getDefaultEnabledHabitTypes(habitTypePillOptions);
  const effectiveEnabledHabitTypes = showHabitTypeSection
    ? enabledHabitTypes
    : null;
  const constrainedQueue = effectiveQueue.filter((item) =>
    itemMatchesExecutionConstraints(item, {
      source: displaySource,
      selectedMonumentIds,
      selectedSkillIds,
      selectedMonumentNames,
      selectedSkillNames,
      selectedTagKeys,
      selectedGoalKeys,
      selectedCampaignKeys,
      selectedRoutineKeys,
      enabledItemTypes,
      enabledHabitTypes: effectiveEnabledHabitTypes,
    })
  );
  const sourceSortedQueue = sortFocusPomoQueue(constrainedQueue, {
    selectedMonumentIds,
    monumentOptions,
    goalOrderMap: roadmapGoalOrderMap,
    projectOrderMap,
  });
  const sourceQueueSignature = sourceSortedQueue
    .map(getFocusPomoQueueItemKey)
    .join("\u001F");
  const sortedQueue = applyFocusPomoQueueOrder(
    sourceSortedQueue,
    customQueueOrder
  );
  const sortedQueueIndexByKey = new Map(
    sortedQueue.map((item, index) => [getFocusPomoQueueItemKey(item), index])
  );
  const pendingQueueItems = sortedQueue.filter(
    (item) => !dismissedQueueItemKeys.has(getFocusPomoQueueItemKey(item))
  );
  const hasCustomWorkTypeFilters = !isDefaultEnabledItemTypes(enabledItemTypes);
  const hasCustomHabitTypeFilters =
    showHabitTypeSection && enabledHabitTypes !== null;
  const hasCustomExecutionFilters =
    hasCustomWorkTypeFilters ||
    hasCustomHabitTypeFilters ||
    effectiveSelectedTagIds.length > 0 ||
    effectiveSelectedGoalIds.length > 0 ||
    effectiveSelectedCampaignIds.length > 0 ||
    effectiveSelectedRoutineIds.length > 0;
  const selectedQueueItem = sortedQueue[activeIndex] ?? null;
  const currentItem =
    selectedQueueItem &&
    !dismissedQueueItemKeys.has(getFocusPomoQueueItemKey(selectedQueueItem))
      ? selectedQueueItem
      : (pendingQueueItems[0] ?? null);
  const currentItemKey = currentItem ? getFocusPomoQueueItemKey(currentItem) : null;
  const pomoDurationMinutes = currentItem?.durationMinutes ?? 25;
  const currentTimerDurationMs = pomoDurationMinutes * 60 * 1000;
  const currentItemTimerKey = currentItem?.id ?? null;
  const timerMatchesCurrentItem =
    previousTimerItemRef.current?.itemKey === currentItemTimerKey &&
    previousTimerItemRef.current.durationMs === currentTimerDurationMs;
  const canCompleteCurrentRun = Boolean(
    currentItem &&
      hasRunStarted &&
      (isRunning ||
        elapsedMs > 0 ||
        (mode === "pomo" &&
          timerMatchesCurrentItem &&
          remainingMs !== currentTimerDurationMs))
  );
  const timerDisplay = formatSignedTimerMs(
    mode === "pomo" ? remainingMs : elapsedMs
  );
  const timerLabel = mode === "pomo" ? "COUNTDOWN" : "STOPWATCH";
  const timerRingRadius = 18;
  const timerRingCircumference = 2 * Math.PI * timerRingRadius;
  const countdownRingProgress = getCountdownTimerRingProgress({
    remainingMs,
    totalDurationMs: currentTimerDurationMs,
  });
  const elapsedSeconds = Math.floor(Math.max(elapsedMs, 0) / 1000);
  const stopwatchSecondInMinute = elapsedSeconds % 60;
  const stopwatchRingProgress = stopwatchSecondInMinute / 60;
  const timerRingProgress =
    mode === "stopwatch" ? stopwatchRingProgress : countdownRingProgress;
  const timerRingDashOffset =
    timerRingCircumference * (1 - timerRingProgress);
  const previousStopwatchSecondInMinute =
    previousStopwatchSecondInMinuteRef.current;
  const isStopwatchRingReset =
    mode === "stopwatch" &&
    previousStopwatchSecondInMinute !== null &&
    previousStopwatchSecondInMinute >= 59 &&
    stopwatchSecondInMinute === 0;
  const shouldAnimateTimerRing =
    !prefersReducedMotion && !isStopwatchRingReset;
  const timerRingTransition =
    shouldAnimateTimerRing ? "stroke-dashoffset 950ms linear" : "none";
  const latestRunResult = runHistory[0] ?? null;
  const earlierRunResults = runHistory.slice(1);
  const visibleEarlierRunResults = [...earlierRunResults].reverse();
  const earlierRunResultsCount = earlierRunResults.length;
  const collapsedQueueLimit = 3;
  const visibleQueueItems = isQueueExpanded
    ? pendingQueueItems
    : pendingQueueItems.slice(0, collapsedQueueLimit);
  const hasMoreQueueItems = pendingQueueItems.length > collapsedQueueLimit;
  const visibleQueueItemIds = visibleQueueItems.map(getFocusPomoQueueItemKey);
  const hiddenQueueCount = Math.max(
    pendingQueueItems.length - collapsedQueueLimit,
    0
  );
  const currentItemIcon = itemDisplayIcon(currentItem);
  const currentGoalDisplay = getItemGoalDisplay(currentItem);
  const currentRoutineDisplay = getItemRoutineDisplay(currentItem);
  const currentMetaDisplay =
    currentItem?.kind === "project" ? currentGoalDisplay : currentRoutineDisplay;
  const focusWidgetActiveSession = focusPomoLiveActivityRef.current;
  const focusWidgetTitle = currentItem?.title ?? focusWidgetActiveSession?.title ?? null;
  const focusWidgetSkillIcon = itemSkillIcon(currentItem);
  const focusWidgetSourceTitle = displaySource?.title ?? lastSource?.title ?? null;
  const focusWidgetSourceIcon = displaySource?.icon ?? lastSource?.icon ?? null;
  useEffect(() => {
    if (!mounted) return;

    const payloadInput = {
      isActive: isRunning,
      mode,
      title: isRunning ? focusWidgetTitle : null,
      sourceTitle: focusWidgetSourceTitle,
      skillIcon: isRunning ? focusWidgetSkillIcon : null,
      sourceIcon: focusWidgetSourceIcon,
      startedAt: isRunning ? focusWidgetActiveSession?.startedAt : null,
      endsAt:
        isRunning && mode === "pomo" ? focusWidgetActiveSession?.endsAt : null,
      statusLabel: isRunning
        ? mode === "pomo"
          ? "Focus running"
          : "Stopwatch running"
        : "Ready",
      deepLink: CREATOR_FOCUS_POMO_DEEP_LINK,
    };
    const signature = JSON.stringify(payloadInput);
    if (focusWidgetPayloadSignatureRef.current === signature) return;

    focusWidgetPayloadSignatureRef.current = signature;
    void syncFocusPomoWidgetPayload(payloadInput).catch(() => undefined);
  }, [
    focusWidgetActiveSession?.endsAt,
    focusWidgetActiveSession?.startedAt,
    focusWidgetSkillIcon,
    focusWidgetSourceIcon,
    focusWidgetSourceTitle,
    focusWidgetTitle,
    isRunning,
    mode,
    mounted,
  ]);
  const resetTimerToDuration = useCallback(
    (durationMs: number, options?: { rebaseRunningTimer?: boolean }) => {
      elapsedMsRef.current = 0;
      remainingMsRef.current = durationMs;
      if (options?.rebaseRunningTimer) {
        timerStartedAtMsRef.current = Date.now();
        timerBaseElapsedMsRef.current = 0;
        timerBaseRemainingMsRef.current = durationMs;
      }
      setElapsedMs(0);
      setRemainingMs(durationMs);
    },
    []
  );
  const handleUndoRunHistorySession = (session: FocusPomoRunResult) => {
    const restoredItemKey = getFocusPomoQueueItemKey(session.item);
    const nextRunHistory = runHistory.filter((result) => result.id !== session.id);
    const restoredIndex = sortedQueueIndexByKey.get(restoredItemKey);

    setRunHistory(nextRunHistory);
    setHasRunStarted(nextRunHistory.length > 0);
    setDismissedQueueItemKeys((current) => {
      if (!current.has(restoredItemKey)) return current;

      const next = new Set(current);
      next.delete(restoredItemKey);
      return next;
    });

    if (typeof restoredIndex === "number") {
      const restoredItem = sortedQueue[restoredIndex] ?? session.item;
      const restoredDurationMs = (restoredItem.durationMinutes ?? 25) * 60 * 1000;

      setActiveIndex(restoredIndex);
      setIsRunning(false);
      resetTimerToDuration(restoredDurationMs);
    }

    if (session.action === "completed") {
      const undoCompletedSession = async () => {
        const completionRequest = completionRequestsRef.current.get(session.id);

        if (completionRequest) {
          try {
            await completionRequest;
          } catch (error) {
            console.error(
              "FocusPomo completion request failed before undo",
              error
            );
          }
        }

        await undoFocusPomoItem({
          item: session.item,
          completedAt: session.completedAt,
          timeZone: session.timeZone,
        });
      };

      void undoCompletedSession();
    }
  };
  const activeCardLoading = effectiveQueueLoading && !currentItem;
  const currentEnergyLevel = normalizeFlameLevel(
    currentItem?.energyCode,
    currentItem?.energyLabel
  );
  const renderRunHistoryRow = (
    session: FocusPomoRunResult,
    variant: "latest" | "earlier"
  ) => {
    const isCompleted = session.action === "completed";
    const hasEnergy = Boolean(session.energyCode || session.energyLabel);
    const energyLevel = normalizeFlameLevel(
      session.energyCode,
      session.energyLabel
    );
    const elapsedLabel =
      session.actualMs !== null ? formatElapsedTimerMs(session.actualMs) : null;
    const elapsedClassName =
      session.resultTone === "under"
        ? "ml-auto inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-green-900/45 bg-green-950/25 px-2 font-mono text-[10px] font-semibold tabular-nums tracking-normal text-emerald-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:h-8 sm:rounded-lg sm:px-2.5 sm:text-[11px]"
        : "ml-auto inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-orange-900/40 bg-orange-950/18 px-2 font-mono text-[10px] font-semibold tabular-nums tracking-normal text-orange-200/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:h-8 sm:rounded-lg sm:px-2.5 sm:text-[11px]";
    const rowClassName =
      variant === "latest"
        ? "relative flex min-w-0 items-center gap-2 border border-black/60 bg-white/[0.03] px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_18px_rgba(255,255,255,0.014),inset_0_-12px_20px_rgba(0,0,0,0.16)] sm:px-3 sm:py-2.5"
        : "flex min-w-0 items-center gap-2 border-t border-black/40 px-2.5 py-1.5 opacity-70 sm:px-3 sm:py-2";
    const metadataLine = [
      isCompleted ? "COMPLETED" : "SKIPPED",
      session.workTypeLabel,
      session.relationLabel,
    ]
      .filter(Boolean)
      .join(" · ");

    return (
      <div key={session.id} className={rowClassName}>
        <button
          type="button"
          aria-label={`Restore ${session.title} to Next Up`}
          onClick={() => handleUndoRunHistorySession(session)}
          className="flex h-7 w-4 shrink-0 items-center justify-center text-white/24 outline-none transition hover:text-white/62 active:text-white/72 focus-visible:text-white/72 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/18 sm:h-8 sm:w-5"
        >
          <ChevronLeft
            className="size-3.5"
            strokeWidth={2.5}
            aria-hidden="true"
          />
        </button>
        <span className={FOCUS_POMO_QUEUE_NUMBER_BADGE_CLASS}>
          {isCompleted ? (
            <Check
              className="size-3.5 text-emerald-400 sm:size-4"
              strokeWidth={2.4}
              aria-hidden="true"
            />
          ) : (
            <Slash
              className="size-3.5 text-orange-400 sm:size-4"
              strokeWidth={2.4}
              aria-hidden="true"
            />
          )}
        </span>
        <div className={FOCUS_POMO_QUEUE_ICON_BADGE_CLASS}>
          <span aria-hidden="true">
            {session.icon ?? initialsFallback(session.title, "•")}
          </span>
        </div>

        <span className="min-w-0 flex-1">
          <span
            className={
              variant === "latest"
                ? "block truncate text-xs font-semibold uppercase tracking-normal text-white/82 sm:text-sm"
                : "block truncate text-xs font-semibold uppercase tracking-normal text-white/68 sm:text-sm"
            }
          >
            {session.title}
          </span>
          <span
            className="mt-0.5 block truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-white/38 sm:mt-1 sm:text-[10px] sm:tracking-[0.18em]"
          >
            {metadataLine}
          </span>
        </span>
        {elapsedLabel ? (
          <span
            className={elapsedClassName}
            title={`Elapsed ${elapsedLabel}`}
            aria-label={`Elapsed ${elapsedLabel}`}
          >
            {elapsedLabel}
          </span>
        ) : null}
        {hasEnergy ? (
          <span className="flex h-7 w-5 shrink-0 items-center justify-end overflow-visible sm:h-9 sm:w-7">
            <FlameEmber
              level={energyLevel}
              size="sm"
              className="shrink-0 overflow-visible [&_svg]:overflow-visible"
            />
          </span>
        ) : null}
      </div>
    );
  };
  const scopeEmpty =
    !effectiveQueueLoading &&
    !effectiveQueueError &&
    sortedQueue.length === 0 &&
    (hasSelectedScope || hasCustomExecutionFilters || effectiveQueue.length > 0);
  const scopeSummary = getScopeSummary(
    [
      {
        count: selectedMonumentOptions.length,
        singular: "Monument",
        option: selectedMonumentOptions[0],
      },
      {
        count: selectedSkillOptions.length,
        singular: "Skill",
        option: selectedSkillOptions[0],
      },
      {
        count: selectedTagOptions.length,
        singular: "Tag",
        option: selectedTagOptions[0],
      },
      {
        count: selectedGoalOptions.length,
        singular: "Goal",
        option: selectedGoalOptions[0],
      },
      {
        count: selectedCampaignOptions.length,
        singular: "Campaign",
        option: selectedCampaignOptions[0],
      },
      {
        count: selectedRoutineOptions.length,
        singular: "Routine",
        option: selectedRoutineOptions[0],
      },
    ],
    hasCustomWorkTypeFilters,
    hasCustomHabitTypeFilters
  );
  const cardState: FocusPomoCardState = effectiveQueueLoading
    ? {
        badge: "QUEUE",
        title: "Loading focus item",
        subtitle: hasSelectedScope
          ? "Pulling eligible habits and projects for this scope."
          : displaySource
            ? "Pulling habits and projects for this source."
            : "Pulling all scheduled work.",
        tone: "loading",
      }
    : effectiveQueueError
      ? {
          badge: "QUEUE",
          title: "Could not load queue",
          subtitle: effectiveQueueError,
          tone: "error",
        }
      : scopeEmpty
        ? {
            badge: "SCOPE",
            title: "No focus items in this scope",
            subtitle: "Clear filters or choose different constraints.",
            tone: "empty",
          }
      : currentItem
        ? {
            badge: currentItem.kind.toUpperCase(),
            title: currentItem.title,
            subtitle: buildMissionSummary(
              currentItem,
              hasSelectedScope ? scopeSummary : (displaySource?.title ?? "")
            ),
            tone: "ready",
          }
        : {
            badge: "QUEUE",
            title: "No focus items in this scope",
            subtitle:
              displaySource
                ? "Add habits or projects to this Monument/Skill to run them from FocusPomo."
                : "Add scheduled work to run it from FocusPomo.",
            tone: "empty",
          };

  const endActiveFocusPomoLiveActivity = (
    status: "completed" | "canceled",
    title?: string
  ): Promise<void> => {
    const activeSession = focusPomoLiveActivityRef.current;
    focusPomoLiveActivityRef.current = null;

    return Promise.all([
      cancelFocusPomoCompletionNotification(),
      endFocusPomoLiveActivity({
        status,
        title: title ?? activeSession?.title,
        sessionId: activeSession?.sessionId,
      }),
    ]).then(() => undefined);
  };

  const startLiveActivityForItem = (
    item: FocusPomoQueueItem,
    durationMs: number,
    options: {
      remainingMsSnapshot?: number;
      elapsedMsSnapshot?: number;
    } = {}
  ) => {
    const sessionId = createLocalSessionId();
    const itemKey = getFocusPomoQueueItemKey(item);
    const title = item.title.trim() || "Focus Pomo";
    const startedAtDate = new Date();
    const safeRemainingMs = Math.max(
      0,
      options.remainingMsSnapshot ?? durationMs
    );
    const safeElapsedMs = Math.max(0, options.elapsedMsSnapshot ?? 0);
    const targetEndAtDate =
      mode === "pomo"
        ? new Date(startedAtDate.getTime() + safeRemainingMs)
        : null;

    focusPomoLiveActivityRef.current = {
      sessionId,
      itemKey,
      title,
      startedAt: startedAtDate.toISOString(),
      endsAt: targetEndAtDate?.toISOString() ?? null,
    };

    if (isNativeIosApp()) {
      console.info("Focus Pomo Live Activity start bridge called", {
        mode,
        itemKey,
        sessionId,
      });
    }

    void startFocusPomoLiveActivity({
      sessionId,
      title,
      skillIcon: itemSkillIcon(item),
      sourceLabel: displaySource?.title ?? null,
      sourceType: displaySource?.sourceType ?? null,
      sourceId: displaySource?.sourceId ?? null,
      mode,
      status: "running",
      startedAt: startedAtDate.toISOString(),
      endsAt: targetEndAtDate?.toISOString() ?? null,
      targetEndAt: targetEndAtDate?.toISOString() ?? null,
      plannedDurationSeconds: Math.max(0, Math.round(durationMs / 1000)),
      scheduleInstanceId: readFocusPomoScheduleInstanceId(item),
      remainingSeconds:
        mode === "pomo"
          ? Math.max(0, Math.ceil(safeRemainingMs / 1000))
          : undefined,
      elapsedSeconds:
        mode === "stopwatch"
          ? Math.max(0, Math.floor(safeElapsedMs / 1000))
          : undefined,
    }).then((result) => {
      if (!result.ok && (result.attemptedNativeIos || isNativeIosApp())) {
        toast.error(`Live Activity failed: ${result.reason}`);
      }
    });

    if (mode === "pomo" && targetEndAtDate) {
      void scheduleFocusPomoCompletionNotification({
        sessionId,
        title,
        targetEndAt: targetEndAtDate.toISOString(),
      });
    } else {
      void cancelFocusPomoCompletionNotification();
    }
  };

  const transitionLiveActivityToNextItem = (
    status: "completed" | "canceled",
    completedTitle: string,
    nextItem: FocusPomoQueueItem,
    nextDurationMs: number
  ) => {
    void endActiveFocusPomoLiveActivity(status, completedTitle).then(() => {
      startLiveActivityForItem(nextItem, nextDurationMs);
    });
  };

  useEffect(() => {
    if (queueSourceSignatureRef.current === sourceQueueSignature) return;

    queueSourceSignatureRef.current = sourceQueueSignature;
    setCustomQueueOrder(null);
  }, [sourceQueueSignature]);

  useEffect(() => {
    const previousActiveIndex = previousActiveIndexRef.current;
    previousActiveIndexRef.current = activeIndex;

    if (previousActiveIndex === activeIndex) return;

    const shouldPreserveRunning =
      isRunning &&
      preserveRunningTimerItemRef.current?.itemKey === currentItemTimerKey &&
      preserveRunningTimerItemRef.current.durationMs === currentTimerDurationMs;

    if (!shouldPreserveRunning) {
      setIsRunning(false);
    }
    resetTimerToDuration(currentTimerDurationMs, {
      rebaseRunningTimer: shouldPreserveRunning,
    });
  }, [
    activeIndex,
    currentItemTimerKey,
    currentTimerDurationMs,
    isRunning,
    resetTimerToDuration,
  ]);

  useEffect(() => {
    const previousTimerItem = previousTimerItemRef.current;
    const timerItemChanged =
      !previousTimerItem ||
      previousTimerItem.itemKey !== currentItemTimerKey ||
      previousTimerItem.durationMs !== currentTimerDurationMs;

    previousTimerItemRef.current = {
      itemKey: currentItemTimerKey,
      durationMs: currentTimerDurationMs,
    };

    if (!timerItemChanged) return;

    const shouldPreserveRunning =
      isRunning &&
      preserveRunningTimerItemRef.current?.itemKey === currentItemTimerKey &&
      preserveRunningTimerItemRef.current.durationMs === currentTimerDurationMs;

    if (isRunning && !shouldPreserveRunning) {
      setIsRunning(false);
    }
    resetTimerToDuration(currentTimerDurationMs, {
      rebaseRunningTimer: shouldPreserveRunning,
    });

    if (shouldPreserveRunning) {
      preserveRunningTimerItemRef.current = null;
    }
  }, [
    currentItemTimerKey,
    currentTimerDurationMs,
    isRunning,
    resetTimerToDuration,
  ]);

  useEffect(() => {
    elapsedMsRef.current = elapsedMs;
  }, [elapsedMs]);

  useEffect(() => {
    remainingMsRef.current = remainingMs;
  }, [remainingMs]);

  useEffect(() => {
    previousStopwatchSecondInMinuteRef.current =
      mode === "stopwatch" ? stopwatchSecondInMinute : null;
  }, [mode, stopwatchSecondInMinute]);

  useEffect(() => {
    if (isRunning || !focusPomoLiveActivityRef.current) return;

    void endActiveFocusPomoLiveActivity("canceled");
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning) return;

    timerStartedAtMsRef.current = Date.now();
    timerBaseElapsedMsRef.current = elapsedMsRef.current;
    timerBaseRemainingMsRef.current = remainingMsRef.current;

    const intervalId = window.setInterval(() => {
      const elapsedSinceStartMs = Date.now() - timerStartedAtMsRef.current;

      if (mode === "stopwatch") {
        const nextElapsedMs =
          timerBaseElapsedMsRef.current + elapsedSinceStartMs;
        elapsedMsRef.current = nextElapsedMs;
        setElapsedMs(nextElapsedMs);
        return;
      }

      const nextRemainingMs =
        timerBaseRemainingMsRef.current - elapsedSinceStartMs;
      remainingMsRef.current = nextRemainingMs;
      setRemainingMs(nextRemainingMs);
    }, 50);

    return () => window.clearInterval(intervalId);
  }, [isRunning, mode]);

  useEffect(() => {
    if (!isRunning) return;

    let canceled = false;
    let draining = false;

    const drainPendingLiveActivityActions = async () => {
      if (draining) return;
      draining = true;

      try {
        const activeSession = focusPomoLiveActivityRef.current;
        if (!activeSession || !currentItem) return;

        const currentScheduleInstanceId =
          readFocusPomoScheduleInstanceId(currentItem);
        const actions = await readFocusPomoLiveActivityActions();
        if (canceled || actions.length === 0) return;

        const handledIds: string[] = [];
        for (const action of actions) {
          if (processedLiveActivityActionIdsRef.current.has(action.id)) {
            handledIds.push(action.id);
            continue;
          }
          if (action.sessionId !== activeSession.sessionId) continue;
          if (
            action.scheduleInstanceId &&
            currentScheduleInstanceId &&
            action.scheduleInstanceId !== currentScheduleInstanceId
          ) {
            continue;
          }

          processedLiveActivityActionIdsRef.current.add(action.id);
          handledIds.push(action.id);

          if (action.action === "complete") {
            focusPomoLiveActivityActionHandlerRef.current.complete();
            break;
          }

          focusPomoLiveActivityActionHandlerRef.current.skip();
          break;
        }

        if (handledIds.length > 0) {
          await ackFocusPomoLiveActivityActions(handledIds);
        }
      } catch (error) {
        console.warn("Unable to drain Focus Pomo Live Activity action.", error);
      } finally {
        draining = false;
      }
    };

    void drainPendingLiveActivityActions();
    const intervalId = window.setInterval(() => {
      void drainPendingLiveActivityActions();
    }, 1500);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void drainPendingLiveActivityActions();
      }
    };
    window.addEventListener("focus", drainPendingLiveActivityActions);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      canceled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", drainPendingLiveActivityActions);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [currentItem, isRunning]);

  if (!mounted) {
    return null;
  }

  if (!shouldShow && !displaySource) {
    return null;
  }

  const handleClose = () => {
    void hapticPress();
    setIsRunning(false);
    onClose();
  };

  const handleModeChange = (nextMode: FocusPomoMode) => {
    if (nextMode !== mode) {
      void hapticSoftTick();
    }
    setMode(nextMode);
    setIsRunning(false);
    setElapsedMs(0);
    setRemainingMs(currentTimerDurationMs);
  };

  const resetExecutionFilters = () => {
    if (hasSelectedScope || hasCustomExecutionFilters) {
      void hapticSoftTick();
    }

    setSelectedMonumentIds([]);
    setSelectedSkillIds([]);
    setDraftSelectedMonumentIds([]);
    setDraftSelectedSkillIds([]);
    setSelectedTagIds([]);
    setSelectedGoalIds([]);
    setSelectedCampaignIds([]);
    setSelectedRoutineIds([]);
    setEnabledItemTypes(DEFAULT_ENABLED_ITEM_TYPES);
    setEnabledHabitTypes(null);
    setActiveIndex(0);
    setCustomQueueOrder(null);
    setDismissedQueueItemKeys(new Set());
    setRunHistory([]);
    setHasRunStarted(false);
    setIsRunLogExpanded(false);
  };

  const resetScopeEditorFilters = () => {
    if (hasDraftSelectedScope || hasCustomExecutionFilters) {
      void hapticSoftTick();
    }

    setDraftSelectedMonumentIds([]);
    setDraftSelectedSkillIds([]);
    setSelectedTagIds([]);
    setSelectedGoalIds([]);
    setSelectedCampaignIds([]);
    setSelectedRoutineIds([]);
    setEnabledItemTypes(DEFAULT_ENABLED_ITEM_TYPES);
    setEnabledHabitTypes(null);
    setActiveIndex(0);
    setCustomQueueOrder(null);
    setDismissedQueueItemKeys(new Set());
    setRunHistory([]);
    setHasRunStarted(false);
    setIsRunLogExpanded(false);
  };

  const sameSelectedIds = (left: string[], right: string[]) => {
    if (left.length !== right.length) return false;

    const rightIds = new Set(right);
    return left.every((id) => rightIds.has(id));
  };

  const openScopeEditor = () => {
    setDraftSelectedMonumentIds(selectedMonumentIds);
    setDraftSelectedSkillIds(selectedSkillIds);
    setScopeOpen(true);
  };

  const toggleScopeEditor = () => {
    void hapticSnap();
    if (scopeOpen) {
      setDraftSelectedMonumentIds(selectedMonumentIds);
      setDraftSelectedSkillIds(selectedSkillIds);
      setScopeOpen(false);
      return;
    }

    openScopeEditor();
  };

  const commitScopeEditor = () => {
    const scopeChanged =
      !sameSelectedIds(selectedMonumentIds, draftSelectedMonumentIds) ||
      !sameSelectedIds(selectedSkillIds, draftSelectedSkillIds);

    void hapticSnap();
    setSelectedMonumentIds(draftSelectedMonumentIds);
    setSelectedSkillIds(draftSelectedSkillIds);
    setScopeOpen(false);

    if (scopeChanged) {
      resetScopeRunState();
    }
  };

  const toggleSelectedId = (
    setter: Dispatch<SetStateAction<string[]>>,
    id: string
  ) => {
    void hapticSoftTick();
    setter((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id]
    );
    setActiveIndex(0);
    setCustomQueueOrder(null);
    setDismissedQueueItemKeys(new Set());
    setRunHistory([]);
    setHasRunStarted(false);
    setIsRunLogExpanded(false);
  };

  const resetScopeRunState = () => {
    setActiveIndex(0);
    setCustomQueueOrder(null);
    setDismissedQueueItemKeys(new Set());
    setRunHistory([]);
    setHasRunStarted(false);
    setIsRunLogExpanded(false);
  };

  const clearDraftMonumentScope = () => {
    setDraftSelectedMonumentIds([]);
  };

  const clearDraftSkillScope = () => {
    setDraftSelectedSkillIds([]);
  };

  const clearInstanceTypeFilters = () => {
    setEnabledItemTypes(DEFAULT_ENABLED_ITEM_TYPES);
    setEnabledHabitTypes(null);
    resetScopeRunState();
  };

  const clearTagFilters = () => {
    setSelectedTagIds([]);
    resetScopeRunState();
  };

  const clearGoalFilters = () => {
    setSelectedGoalIds([]);
    resetScopeRunState();
  };

  const clearCampaignFilters = () => {
    setSelectedCampaignIds([]);
    resetScopeRunState();
  };

  const clearRoutineFilters = () => {
    setSelectedRoutineIds([]);
    resetScopeRunState();
  };

  const getSkillIdsForMonument = (monumentId: string) =>
    availableScopeOptions.skills
      .filter((option) => option.monumentId === monumentId)
      .map((option) => option.id);

  const reconcileMonumentScopesForSkills = (
    currentMonumentIds: string[],
    nextSkillIds: string[]
  ) => {
    const selectedSkillSet = new Set(nextSkillIds);
    const monumentIdsWithSkills = uniqueScopeValues(
      availableScopeOptions.skills.map((option) => option.monumentId ?? null)
    );
    const nextMonumentIds = currentMonumentIds.filter((monumentId) => {
      if (!monumentIdsWithSkills.includes(monumentId)) return true;

      const skillIds = getSkillIdsForMonument(monumentId);
      return (
        skillIds.length > 0 &&
        skillIds.every((skillId) => selectedSkillSet.has(skillId))
      );
    });

    for (const monumentId of monumentIdsWithSkills) {
      const skillIds = getSkillIdsForMonument(monumentId);
      if (
        skillIds.length > 0 &&
        skillIds.every((skillId) => selectedSkillSet.has(skillId)) &&
        !nextMonumentIds.includes(monumentId)
      ) {
        nextMonumentIds.push(monumentId);
      }
    }

    return nextMonumentIds;
  };

  const toggleMonumentScope = (id: string) => {
    const selected = draftSelectedMonumentIds.includes(id);
    const skillIds = getSkillIdsForMonument(id);

    void hapticSoftTick();
    setDraftSelectedMonumentIds((current) =>
      selected
        ? current.filter((selectedId) => selectedId !== id)
        : current.includes(id)
          ? current
          : [...current, id]
    );
    setDraftSelectedSkillIds((current) =>
      selected
        ? current.filter((selectedId) => !skillIds.includes(selectedId))
        : uniqueScopeValues([...current, ...skillIds])
    );
  };

  const toggleSkillScope = (id: string) => {
    const nextSkillIds = draftSelectedSkillIds.includes(id)
      ? draftSelectedSkillIds.filter((selectedId) => selectedId !== id)
      : [...draftSelectedSkillIds, id];

    void hapticSoftTick();
    setDraftSelectedSkillIds(nextSkillIds);
    setDraftSelectedMonumentIds((current) =>
      reconcileMonumentScopesForSkills(current, nextSkillIds)
    );
  };

  const toggleItemType = (type: FocusExecutionItemType) => {
    void hapticSoftTick();
    setEnabledItemTypes((current) =>
      current.includes(type)
        ? current.filter((enabledType) => enabledType !== type)
        : [...current, type]
    );
    setActiveIndex(0);
    setCustomQueueOrder(null);
    setDismissedQueueItemKeys(new Set());
    setRunHistory([]);
    setHasRunStarted(false);
    setIsRunLogExpanded(false);
  };

  const toggleHabitType = (type: string) => {
    if (isLockedOffHabitTypeKey(type)) {
      void hapticWarningPattern();
      return;
    }

    void hapticSoftTick();
    setEnabledHabitTypes((current) => {
      const enabledTypes =
        current ?? getDefaultEnabledHabitTypes(habitTypePillOptions);

      return enabledTypes.includes(type)
        ? enabledTypes.filter((enabledType) => enabledType !== type)
        : [...enabledTypes, type];
    });
    setActiveIndex(0);
    setCustomQueueOrder(null);
    setDismissedQueueItemKeys(new Set());
    setRunHistory([]);
    setHasRunStarted(false);
    setIsRunLogExpanded(false);
  };

  const resetCurrentTimer = () => {
    resetTimerToDuration(currentTimerDurationMs);
  };

  const getCurrentElapsedMsSnapshot = () => {
    if (!isRunning) {
      if (mode === "stopwatch") return elapsedMsRef.current;

      const effectiveRemainingMs = timerMatchesCurrentItem
        ? remainingMsRef.current
        : currentTimerDurationMs;

      return currentTimerDurationMs - effectiveRemainingMs;
    }

    const elapsedSinceStartMs = Date.now() - timerStartedAtMsRef.current;

    if (mode === "stopwatch") {
      return timerBaseElapsedMsRef.current + elapsedSinceStartMs;
    }

    return (
      currentTimerDurationMs -
      (timerBaseRemainingMsRef.current - elapsedSinceStartMs)
    );
  };

  const getNextPendingItem = (dismissedItemKey: string) => {
    const dismissedItemIndex =
      sortedQueueIndexByKey.get(dismissedItemKey) ?? activeIndex;
    const isPendingCandidate = (item: FocusPomoQueueItem) => {
      const itemKey = getFocusPomoQueueItemKey(item);

      return itemKey !== dismissedItemKey && !dismissedQueueItemKeys.has(itemKey);
    };
    const nextItem =
      sortedQueue.find(
        (item, index) => index > dismissedItemIndex && isPendingCandidate(item)
      ) ?? sortedQueue.find(isPendingCandidate);

    if (!nextItem) return null;

    return {
      item: nextItem,
      index: sortedQueueIndexByKey.get(getFocusPomoQueueItemKey(nextItem)) ?? 0,
    };
  };

  const getNextPendingItemIndex = (dismissedItemKey: string) => {
    return getNextPendingItem(dismissedItemKey)?.index ?? 0;
  };

  const dismissCurrentQueueItem = (item: FocusPomoQueueItem) => {
    const itemKey = getFocusPomoQueueItemKey(item);

    setDismissedQueueItemKeys((current) => {
      const next = new Set(current);
      next.add(itemKey);
      return next;
    });
    setActiveIndex(getNextPendingItemIndex(itemKey));
  };

  const handleSelectQueueItem = (nextIndex: number) => {
    const nextItem = sortedQueue[nextIndex] ?? null;
    const nextItemKey = nextItem ? getFocusPomoQueueItemKey(nextItem) : null;

    if (nextItemKey === currentItemKey) return;

    void hapticSoftTick();
    setActiveIndex(nextIndex);
  };

  const releaseQueueClickSuppression = () => {
    window.setTimeout(() => {
      suppressQueueClickRef.current = false;
    }, 0);
  };

  const handleQueueRowSelect = (nextIndex: number) => {
    if (suppressQueueClickRef.current) return;

    handleSelectQueueItem(nextIndex);
  };

  const handleQueueItemLongPressEdit = (
    item: FocusPomoQueueItem,
    originElement: HTMLElement
  ) => {
    const editTarget = getFocusPomoQueueEditTarget(item, originElement);
    if (!editTarget) return;

    fabCreation?.requestEntityEdit(editTarget);
  };

  const handleQueueDragStart = () => {
    suppressQueueClickRef.current = true;
  };

  const handleQueueDragCancel = () => {
    releaseQueueClickSuppression();
  };

  const handleQueueDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    const currentOrder = sortedQueue.map(getFocusPomoQueueItemKey);
    const previousActiveItemKey =
      currentItem ? getFocusPomoQueueItemKey(currentItem) : null;
    const fromIndex = currentOrder.indexOf(activeId);
    const toIndex = overId ? currentOrder.indexOf(overId) : -1;

    if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
      const nextOrder = arrayMove(currentOrder, fromIndex, toIndex);
      const nextActiveIndex = previousActiveItemKey
        ? nextOrder.indexOf(previousActiveItemKey)
        : -1;

      setCustomQueueOrder(nextOrder);
      void hapticSnap();
      if (nextActiveIndex !== -1) {
        setActiveIndex(nextActiveIndex);
      }
    }

    releaseQueueClickSuppression();
  };

  const handlePrimaryAction = () => {
    if (isRunning) {
      void endActiveFocusPomoLiveActivity("canceled", currentItem?.title);
      void hapticSnap();
      setIsRunning(false);
      resetCurrentTimer();
      setHasRunStarted(false);
      console.info("Focus pomo cancel requested", { mode, source });
      return;
    }

    if (!currentItem) return;

    void hapticPress();
    setHasRunStarted(true);
    startLiveActivityForItem(currentItem, currentTimerDurationMs, {
      remainingMsSnapshot:
        mode === "pomo"
          ? remainingMsRef.current || currentTimerDurationMs
          : undefined,
      elapsedMsSnapshot: mode === "stopwatch" ? elapsedMsRef.current : undefined,
    });
    setIsRunning(true);
    console.info("Focus pomo start requested", { mode, source });
  };

  const handleSkip = () => {
    if (!currentItem) {
      void hapticWarningPattern();
      return;
    }

    const itemKey = getFocusPomoQueueItemKey(currentItem);
    const plannedMs = currentTimerDurationMs;
    const actualMs = Math.max(0, getCurrentElapsedMsSnapshot());
    const deltaMs = actualMs - plannedMs;
    const nextPendingItem = getNextPendingItem(itemKey);
    const shouldKeepRunning = Boolean(isRunning && nextPendingItem);
    const completedAt = new Date().toISOString();
    const timeZone = getBrowserTimeZone();

    setHasRunStarted(true);
    setIsRunLogExpanded(false);
    setRunHistory((current) => [
      {
        id: createLocalSessionId(),
        item: currentItem,
        itemId: currentItem.id,
        title: currentItem.title,
        ...buildRunResultDisplayMetadata(currentItem),
        action: "skipped",
        plannedMs,
        actualMs,
        deltaMs,
        completedAt,
        timeZone,
        resultTone: deltaMs <= 0 ? "under" : "over",
      },
      ...current,
    ]);

    if (shouldKeepRunning && nextPendingItem) {
      const nextDurationMs =
        (nextPendingItem.item.durationMinutes ?? 25) * 60 * 1000;
      preserveRunningTimerItemRef.current = {
        itemKey: nextPendingItem.item.id,
        durationMs: nextDurationMs,
      };
      transitionLiveActivityToNextItem(
        "canceled",
        currentItem.title,
        nextPendingItem.item,
        nextDurationMs
      );
    } else {
      void endActiveFocusPomoLiveActivity("canceled", currentItem.title);
      setIsRunning(false);
      resetCurrentTimer();
    }

    dismissCurrentQueueItem(currentItem);
    void hapticSnap();
  };

  const handleComplete = () => {
    if (!canCompleteCurrentRun || !currentItem) {
      void hapticWarningPattern();
      return;
    }

    const itemKey = getFocusPomoQueueItemKey(currentItem);
    const plannedMs = currentTimerDurationMs;
    const actualMs = Math.max(0, getCurrentElapsedMsSnapshot());
    const deltaMs = actualMs - plannedMs;
    const nextPendingItem = getNextPendingItem(itemKey);
    const shouldKeepRunning = Boolean(isRunning && nextPendingItem);
    const completedAt = new Date().toISOString();
    const timeZone = getBrowserTimeZone();
    const sessionId = createLocalSessionId();

    setHasRunStarted(true);
    setIsRunLogExpanded(false);
    setRunHistory((current) => [
      {
        id: sessionId,
        item: currentItem,
        itemId: currentItem.id,
        title: currentItem.title,
        ...buildRunResultDisplayMetadata(currentItem),
        action: "completed",
        plannedMs,
        actualMs,
        deltaMs,
        completedAt,
        timeZone,
        resultTone: deltaMs <= 0 ? "under" : "over",
      },
      ...current,
    ]);

    if (shouldKeepRunning && nextPendingItem) {
      const nextDurationMs =
        (nextPendingItem.item.durationMinutes ?? 25) * 60 * 1000;
      preserveRunningTimerItemRef.current = {
        itemKey: nextPendingItem.item.id,
        durationMs: nextDurationMs,
      };
      transitionLiveActivityToNextItem(
        "completed",
        currentItem.title,
        nextPendingItem.item,
        nextDurationMs
      );
    } else {
      void endActiveFocusPomoLiveActivity("completed", currentItem.title);
      setIsRunning(false);
      resetCurrentTimer();
    }

    dismissCurrentQueueItem(currentItem);

    const completionRequest = completeFocusPomoItem({
      item: currentItem,
      completedAt,
      timeZone,
    });
    completionRequestsRef.current.set(sessionId, completionRequest);
    void completionRequest
      .then((completed) => {
        if (completed) {
          void hapticComplete();
        }
      })
      .catch((error) => {
        console.error("FocusPomo failed to complete run-history session", error);
        void hapticErrorPattern();
      })
      .finally(() => {
        completionRequestsRef.current.delete(sessionId);
      });
  };

  focusPomoLiveActivityActionHandlerRef.current = {
    complete: handleComplete,
    skip: handleSkip,
  };

  const scopeEditorBody = (
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 pb-5 pr-2 pt-3 [-webkit-overflow-scrolling:touch] sm:space-y-4 sm:px-0 sm:pb-0 sm:pr-1">
    <div className="flex items-center justify-between gap-2 sm:gap-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-200/90 sm:text-[11px] sm:tracking-[0.22em]">
        Focus Scope
      </h3>
      {hasDraftSelectedScope || hasCustomExecutionFilters ? (
        <button
          type="button"
          onClick={resetScopeEditorFilters}
          className="shrink-0 rounded-lg border border-black/60 bg-black/30 px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-300 transition hover:border-black/40 hover:bg-white/[0.07] hover:text-white focus:outline-none focus:ring-2 focus:ring-white/35 sm:px-3 sm:text-[10px] sm:tracking-[0.16em]"
        >
          Reset filters
        </button>
      ) : null}
    </div>

                              <FocusPomoFilterSection
    label="Monuments"
    hasSelectedFilters={
      draftSelectedMonumentIds.length > 0
    }
    onClear={clearDraftMonumentScope}
                              >
    {monumentOptions.length > 0 ? (
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {monumentOptions.map((option) => {
          const selected =
            draftSelectedMonumentIds.includes(option.id);

          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                toggleMonumentScope(option.id)
              }
              className={
                selected
                  ? "inline-flex items-center gap-1.5 rounded-full border border-black/50 bg-white/10 px-2 py-1.5 text-[11px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] transition focus:outline-none focus:ring-2 focus:ring-white/35 sm:gap-2 sm:px-2.5 sm:py-2 sm:text-xs"
                  : "inline-flex items-center gap-1.5 rounded-full border border-black/60 bg-black/30 px-2 py-1.5 text-[11px] font-semibold text-zinc-400 transition hover:border-black/40 hover:bg-white/[0.06] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/35 sm:gap-2 sm:px-2.5 sm:py-2 sm:text-xs"
              }
            >
              <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-black/60 bg-white/5 text-[9px] font-semibold text-zinc-200 sm:size-5 sm:text-[10px]">
                {option.icon ??
                  scopeOptionFallback(
                    "monument",
                    option.name
                  )}
              </span>
              <span>{option.name}</span>
            </button>
          );
        })}
      </div>
    ) : (
      <p className="rounded-lg border border-black/60 bg-black/25 px-2.5 py-1.5 text-xs text-zinc-400 sm:px-3 sm:py-2 sm:text-sm">
        No monuments available.
      </p>
    )}
                              </FocusPomoFilterSection>

                              <FocusPomoFilterSection
    label="Skills"
    hasSelectedFilters={draftSelectedSkillIds.length > 0}
    onClear={clearDraftSkillScope}
                              >
    {skillOptions.length > 0 ? (
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {sortedSkillOptions.map((option) => {
          const selected =
            draftSelectedSkillIds.includes(option.id);

          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() => toggleSkillScope(option.id)}
              className={
                selected
                  ? "inline-flex items-center gap-1.5 rounded-full border border-black/50 bg-white/10 px-2 py-1.5 text-[11px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] transition focus:outline-none focus:ring-2 focus:ring-white/35 sm:gap-2 sm:px-2.5 sm:py-2 sm:text-xs"
                  : "inline-flex items-center gap-1.5 rounded-full border border-black/60 bg-black/30 px-2 py-1.5 text-[11px] font-semibold text-zinc-400 transition hover:border-black/40 hover:bg-white/[0.06] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/35 sm:gap-2 sm:px-2.5 sm:py-2 sm:text-xs"
              }
            >
              <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-black/60 bg-white/5 text-[9px] font-semibold text-zinc-200 sm:size-5 sm:text-[10px]">
                {option.icon ??
                  scopeOptionFallback(
                    "skill",
                    option.name
                  )}
              </span>
              <span>{option.name}</span>
            </button>
          );
        })}
      </div>
    ) : (
      <p className="rounded-lg border border-black/60 bg-black/25 px-2.5 py-1.5 text-xs text-zinc-400 sm:px-3 sm:py-2 sm:text-sm">
        No skills available.
      </p>
    )}
                              </FocusPomoFilterSection>

                              <FocusPomoFilterSection
    label="INSTANCE TYPES"
    hasSelectedFilters={
      hasCustomWorkTypeFilters ||
      hasCustomHabitTypeFilters
    }
    onClear={clearInstanceTypeFilters}
                              >
    <div className="flex flex-wrap gap-1.5 sm:gap-2">
      {workTypeOptions.map((option) => {
        const selected = enabledItemTypes.includes(
          option.value
        );

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => toggleItemType(option.value)}
            className={
              selected
                ? "inline-flex min-h-8 items-center rounded-full border border-black/50 bg-white/10 px-2.5 text-[11px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] transition focus:outline-none focus:ring-2 focus:ring-white/35 sm:min-h-9 sm:px-3 sm:text-xs"
                : "inline-flex min-h-8 items-center rounded-full border border-black/60 bg-black/30 px-2.5 text-[11px] font-semibold text-zinc-400 transition hover:border-black/40 hover:bg-white/[0.06] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/35 sm:min-h-9 sm:px-3 sm:text-xs"
            }
          >
            {option.label}
          </button>
        );
      })}

      {showHabitTypeSection
        ? habitTypePillOptions.map((option) => {
            const lockedOff = isLockedOffHabitTypeKey(
              option.key
            );
            const selected =
              !lockedOff &&
              selectedHabitTypeKeys.includes(option.key);

            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={selected}
                aria-disabled={lockedOff}
                disabled={lockedOff}
                onClick={() =>
                  toggleHabitType(option.key)
                }
                className={
                  lockedOff
                    ? "inline-flex min-h-8 cursor-not-allowed items-center rounded-full border border-black/50 bg-black/20 px-2.5 text-[11px] font-semibold text-zinc-600 opacity-70 sm:min-h-9 sm:px-3 sm:text-xs"
                    : selected
                      ? "inline-flex min-h-8 items-center rounded-full border border-black/50 bg-white/10 px-2.5 text-[11px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] transition focus:outline-none focus:ring-2 focus:ring-white/35 sm:min-h-9 sm:px-3 sm:text-xs"
                      : "inline-flex min-h-8 items-center rounded-full border border-black/60 bg-black/30 px-2.5 text-[11px] font-semibold text-zinc-400 transition hover:border-black/40 hover:bg-white/[0.06] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/35 sm:min-h-9 sm:px-3 sm:text-xs"
                }
              >
                {option.label}
              </button>
            );
          })
        : null}
    </div>
                              </FocusPomoFilterSection>

                              {showTagsSection ? (
    <FocusPomoFilterSection
      label="Tags"
      hasSelectedFilters={selectedTagIds.length > 0}
      onClear={clearTagFilters}
    >
      {tagOptions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {tagOptions.map((option) => {
            const selected = selectedTagIds.includes(
              option.id
            );

            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  toggleSelectedId(
                    setSelectedTagIds,
                    option.id
                  )
                }
                className={
                  selected
                    ? "inline-flex min-h-8 items-center rounded-full border border-black/50 bg-white/10 px-2.5 text-[11px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] transition focus:outline-none focus:ring-2 focus:ring-white/35 sm:min-h-9 sm:px-3 sm:text-xs"
                    : "inline-flex min-h-8 items-center rounded-full border border-black/60 bg-black/30 px-2.5 text-[11px] font-semibold text-zinc-400 transition hover:border-black/40 hover:bg-white/[0.06] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/35 sm:min-h-9 sm:px-3 sm:text-xs"
              }
            >
              {option.name}
            </button>
            );
          })}
        </div>
      ) : (
        <p className="rounded-lg border border-black/60 bg-black/25 px-2.5 py-1.5 text-xs text-zinc-400 sm:px-3 sm:py-2 sm:text-sm">
          No tags available.
        </p>
      )}
    </FocusPomoFilterSection>
                              ) : null}

                              {showGoalsSection ? (
    <FocusPomoFilterSection
      label="Goals"
      hasSelectedFilters={selectedGoalIds.length > 0}
      onClear={clearGoalFilters}
    >
      {goalOptions.length > 0 ? (
        <div className="space-y-2 sm:space-y-3">
          {groupedGoalOptions.map((group) => (
            <div key={group.key}>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-500 sm:gap-2 sm:text-[11px]">
                {group.icon ? (
                  <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-black/60 bg-white/5 text-[9px] text-zinc-200 sm:size-5 sm:text-[10px]">
                    {group.icon}
                  </span>
                ) : null}
                <span className="min-w-0 truncate">
                  {group.name}
                </span>
              </div>
              <div className="mt-1.5 pb-1 sm:mt-2 sm:overflow-x-auto sm:overflow-y-hidden">
                <div className="flex flex-wrap gap-1.5 sm:inline-flex sm:max-h-32 sm:flex-col sm:content-start sm:gap-2 sm:pr-4">
                  {group.options.map((option) => {
                    const selected =
                      selectedGoalIds.includes(
                        option.id
                      );

                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          toggleSelectedId(
                            setSelectedGoalIds,
                            option.id
                          )
                        }
                        className={
                          selected
                            ? "inline-flex min-h-8 max-w-[12rem] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-black/50 bg-white/10 px-2 py-1.5 text-[11px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] transition focus:outline-none focus:ring-2 focus:ring-white/35 sm:min-h-9 sm:max-w-[16rem] sm:gap-2 sm:px-2.5 sm:py-2 sm:text-xs"
                            : "inline-flex min-h-8 max-w-[12rem] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-black/60 bg-black/30 px-2 py-1.5 text-[11px] font-semibold text-zinc-400 transition hover:border-black/40 hover:bg-white/[0.06] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/35 sm:min-h-9 sm:max-w-[16rem] sm:gap-2 sm:px-2.5 sm:py-2 sm:text-xs"
                        }
                      >
                        <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-black/60 bg-white/5 text-[9px] font-semibold text-zinc-200 sm:size-5 sm:text-[10px]">
                          {option.icon ??
                            initialsFallback(
                              option.name,
                              "G"
                            )}
                        </span>
                        <span className="min-w-0 truncate">
                          {option.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-black/60 bg-black/25 px-2.5 py-1.5 text-xs text-zinc-400 sm:px-3 sm:py-2 sm:text-sm">
          No goals available.
        </p>
      )}
    </FocusPomoFilterSection>
                              ) : null}

                              {showCampaignsSection ? (
    <FocusPomoFilterSection
      label="Campaigns"
      hasSelectedFilters={
        selectedCampaignIds.length > 0
      }
      onClear={clearCampaignFilters}
    >
      {campaignOptions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {campaignOptions.map((option) => {
            const selected =
              selectedCampaignIds.includes(option.id);

            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  toggleSelectedId(
                    setSelectedCampaignIds,
                    option.id
                  )
                }
                className={
                  selected
                    ? "inline-flex items-center gap-1.5 rounded-full border border-black/50 bg-white/10 px-2 py-1.5 text-[11px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] transition focus:outline-none focus:ring-2 focus:ring-white/35 sm:gap-2 sm:px-2.5 sm:py-2 sm:text-xs"
                    : "inline-flex items-center gap-1.5 rounded-full border border-black/60 bg-black/30 px-2 py-1.5 text-[11px] font-semibold text-zinc-400 transition hover:border-black/40 hover:bg-white/[0.06] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/35 sm:gap-2 sm:px-2.5 sm:py-2 sm:text-xs"
                }
              >
                <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-black/60 bg-white/5 text-[9px] font-semibold text-zinc-200 sm:size-5 sm:text-[10px]">
                  {option.icon ?? "C"}
                </span>
                <span>{option.name}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="rounded-lg border border-black/60 bg-black/25 px-2.5 py-1.5 text-xs text-zinc-400 sm:px-3 sm:py-2 sm:text-sm">
          No campaigns available.
        </p>
      )}
    </FocusPomoFilterSection>
                              ) : null}

                              {showRoutinesSection ? (
    <FocusPomoFilterSection
      label="Routines"
      hasSelectedFilters={selectedRoutineIds.length > 0}
      onClear={clearRoutineFilters}
    >
      {routineOptions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {routineOptions.map((option) => {
            const selected =
              selectedRoutineIds.includes(option.id);

            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  toggleSelectedId(
                    setSelectedRoutineIds,
                    option.id
                  )
                }
                className={
                  selected
                    ? "inline-flex items-center gap-1.5 rounded-full border border-black/50 bg-white/10 px-2 py-1.5 text-[11px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] transition focus:outline-none focus:ring-2 focus:ring-white/35 sm:gap-2 sm:px-2.5 sm:py-2 sm:text-xs"
                    : "inline-flex items-center gap-1.5 rounded-full border border-black/60 bg-black/30 px-2 py-1.5 text-[11px] font-semibold text-zinc-400 transition hover:border-black/40 hover:bg-white/[0.06] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/35 sm:gap-2 sm:px-2.5 sm:py-2 sm:text-xs"
                }
              >
                <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-black/60 bg-white/5 text-[9px] font-semibold text-zinc-200 sm:size-5 sm:text-[10px]">
                  {option.icon ?? "R"}
                </span>
                <span>{option.name}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="rounded-lg border border-black/60 bg-black/25 px-2.5 py-1.5 text-xs text-zinc-400 sm:px-3 sm:py-2 sm:text-sm">
          No routines available.
        </p>
      )}
    </FocusPomoFilterSection>
                              ) : null}
                            </div>
  );

  const scopeEditorFooter = (
    <div className="shrink-0 border-t border-black/40 bg-black/90 px-3 pb-2 pt-2 shadow-[0_-18px_28px_rgba(0,0,0,0.32)] backdrop-blur-md sm:bg-black/35 sm:px-0 sm:py-3 sm:shadow-none sm:backdrop-blur-0">
                              <button
    type="button"
    onClick={commitScopeEditor}
    aria-controls={executionScopePanelId}
    className="inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-black/60 bg-white/[0.055] px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),inset_0_-10px_18px_rgba(0,0,0,0.24)] transition hover:border-black/40 hover:bg-white/[0.09] focus:outline-none focus:ring-2 focus:ring-white/35 sm:min-h-10 sm:px-4 sm:text-[11px] sm:tracking-[0.16em]"
                              >
    Done
                              </button>
      </div>
  );

  const scopeEditorContent = (
    <>
      {scopeEditorBody}
      {scopeEditorFooter}
    </>
  );

  return createPortal(
    <AnimatePresence
      initial={false}
      onExitComplete={() => {
        if (!open) {
          setLastSource(null);
        }
      }}
    >
      {shouldShow ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed inset-0 z-[80] flex items-stretch justify-center overflow-hidden bg-black/95 p-0 text-white backdrop-blur-xl sm:items-center sm:p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(255,255,255,0.08),transparent_32%),linear-gradient(180deg,rgba(24,24,27,0.36),rgba(0,0,0,0.82)),repeating-linear-gradient(120deg,rgba(255,255,255,0.025)_0px,rgba(255,255,255,0.025)_1px,transparent_1px,transparent_9px)]" />
          <motion.div
            className="relative flex h-dvh w-full flex-col overflow-hidden bg-[#050707] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] shadow-[0_40px_110px_-70px_rgba(0,0,0,0.82)] sm:h-auto sm:max-h-[calc(100dvh-2.5rem)] sm:max-w-4xl sm:rounded-[22px] sm:border sm:border-black/70 sm:px-7 sm:pb-6 sm:pt-6"
            initial={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.97, y: 14 }
            }
            animate={
              prefersReducedMotion
                ? { opacity: 1 }
                : { opacity: 1, scale: 1, y: 0 }
            }
            exit={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.985, y: 8 }
            }
            transition={{
              duration: prefersReducedMotion ? 0.01 : 0.24,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <div className="pointer-events-none absolute inset-0 rounded-[inherit] border border-black/50 bg-[linear-gradient(145deg,rgba(255,255,255,0.07),transparent_24%,rgba(255,255,255,0.025)_72%,rgba(0,0,0,0.38)),radial-gradient(circle_at_25%_35%,rgba(255,255,255,0.04),transparent_28%)]" />
            <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />
            <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 sm:gap-6">
              <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-4">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-600 sm:text-sm sm:tracking-[0.28em]">
                    FOCUSPOMO
                  </p>
                </div>
                <div
                  role="group"
                  aria-label="Focus pomo mode"
                  className="grid h-7 w-[7rem] shrink-0 grid-cols-2 overflow-hidden rounded-lg border border-black/60 bg-black/35 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] sm:h-8 sm:w-[8.75rem]"
                >
                  {modeOptions.map((option) => {
                    const selected = mode === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleModeChange(option.value)}
                        disabled={isRunning}
                        className={
                          selected
                            ? "rounded-md border border-zinc-500/35 bg-white/[0.075] px-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(0,0,0,0.32),0_8px_18px_rgba(0,0,0,0.18)] backdrop-blur-md transition disabled:cursor-not-allowed disabled:opacity-70 sm:text-[9px] sm:tracking-[0.14em]"
                            : "rounded-md border border-transparent px-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-zinc-500 transition hover:border-black/50 hover:bg-white/[0.04] hover:text-zinc-200 disabled:cursor-not-allowed disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:text-zinc-500 sm:text-[9px] sm:tracking-[0.14em]"
                        }
                        aria-pressed={selected}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    aria-label="Close focus pomo"
                    onClick={handleClose}
                    className="inline-flex size-10 items-center justify-center bg-[#080a0d] text-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),inset_0_-10px_20px_rgba(0,0,0,0.36),0_18px_34px_-26px_rgba(0,0,0,0.95)] transition [clip-path:polygon(24%_0,76%_0,100%_24%,100%_76%,76%_100%,24%_100%,0_76%,0_24%)] hover:text-white focus:outline-none focus:ring-2 focus:ring-white/35 sm:size-12"
                  >
                    <X className="size-5 sm:size-6" aria-hidden="true" />
                  </button>
                </div>
              </header>

              <main
                className={
                  scopeOpen && !hasRunStarted
                    ? "flex min-h-0 flex-1 flex-col gap-3 overflow-hidden pb-0 sm:gap-5 sm:overflow-y-auto sm:pb-0"
                    : "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-1 sm:gap-5 sm:pb-0"
                }
              >
                {!hasRunStarted && scopeOpen ? (
                  <section
                    id={mobileExecutionScopePanelId}
                    className="flex min-h-0 flex-1 flex-col overflow-hidden sm:hidden"
                  >
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-black/70 bg-zinc-950/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_0_22px_rgba(255,255,255,0.02),inset_0_-20px_34px_rgba(0,0,0,0.38)]">
                      {scopeEditorBody}
                      {scopeEditorFooter}
                    </div>
                  </section>
                ) : null}

                {!hasRunStarted ? (
                  <section
                    className={
                      scopeOpen
                        ? "relative mx-auto hidden min-h-0 w-full max-w-3xl overflow-clip rounded-[18px] border border-black/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.10),rgba(113,113,122,0.14)_30%,rgba(39,39,42,0.34)_58%,rgba(255,255,255,0.055))] p-px shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_45px_rgba(0,0,0,0.45)] sm:block sm:rounded-[22px]"
                        : "relative mx-auto min-h-0 w-full max-w-3xl overflow-clip rounded-[18px] border border-black/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.10),rgba(113,113,122,0.14)_30%,rgba(39,39,42,0.34)_58%,rgba(255,255,255,0.055))] p-px shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_45px_rgba(0,0,0,0.45)] sm:rounded-[22px]"
                    }
                  >
                    <div className="min-h-0 overflow-clip rounded-[17px] border border-black/60 bg-zinc-950/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_0_22px_rgba(255,255,255,0.02),inset_0_-20px_34px_rgba(0,0,0,0.38)] sm:rounded-[21px]">
                      <div className="border-b border-black/40 bg-black/20 px-2.5 py-1.5 sm:px-3 sm:py-2">
                        <button
                          type="button"
                          onClick={toggleScopeEditor}
                          aria-expanded={scopeOpen}
                          aria-controls={`${executionScopePanelId} ${mobileExecutionScopePanelId}`}
                          className="inline-flex min-h-7 w-full items-center justify-center rounded-lg border border-black/60 bg-white/[0.025] px-3 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400 transition hover:border-black/40 hover:bg-white/[0.055] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/30 sm:min-h-8 sm:text-[10px] sm:tracking-[0.14em]"
                        >
                          Adjust
                        </button>
                      </div>
                  <AnimatePresence initial={false}>
                    {scopeOpen
                      ? (() => {
                          return (
                            <motion.div
                              id={executionScopePanelId}
                              className="flex max-h-[calc(100dvh_-_9.5rem_-_env(safe-area-inset-top,0px)_-_env(safe-area-inset-bottom,0px))] min-h-0 flex-col overflow-hidden border-b border-black/40 bg-black/25 sm:max-h-none"
                              initial={
                                prefersReducedMotion
                                  ? { opacity: 0 }
                                  : { height: 0, opacity: 0, y: -6 }
                              }
                              animate={
                                prefersReducedMotion
                                  ? { opacity: 1 }
                                  : { height: "auto", opacity: 1, y: 0 }
                              }
                              exit={
                                prefersReducedMotion
                                  ? { opacity: 0 }
                                  : { height: 0, opacity: 0, y: -6 }
                              }
                              transition={{
                                height: {
                                  duration: prefersReducedMotion ? 0.01 : 0.24,
                                  ease: [0.22, 1, 0.36, 1],
                                },
                                opacity: {
                                  duration: prefersReducedMotion ? 0.01 : 0.18,
                                  ease: "easeOut",
                                },
                                y: {
                                  duration: prefersReducedMotion ? 0.01 : 0.24,
                                  ease: [0.22, 1, 0.36, 1],
                                },
                              }}
                            >
                              <div className="flex h-[calc(100dvh_-_9.5rem_-_env(safe-area-inset-top,0px)_-_env(safe-area-inset-bottom,0px))] max-h-[inherit] min-h-0 flex-col overflow-hidden sm:h-auto sm:max-h-[min(68dvh,42rem)] sm:px-4 sm:py-4">
                                {scopeEditorContent}
                              </div>
                            </motion.div>
                          );
                        })()
                      : null}
                  </AnimatePresence>
                      <div className="relative flex min-w-0 items-center gap-2 border border-black/60 bg-white/[0.035] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_18px_rgba(255,255,255,0.018),inset_0_-12px_20px_rgba(0,0,0,0.18)] sm:gap-3 sm:px-4 sm:py-3">
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-black/60 bg-white/[0.04] text-sm sm:size-8 sm:rounded-lg sm:text-base">
                          {displaySource?.icon ? (
                            <span aria-hidden="true">{displaySource.icon}</span>
                          ) : (
                            <Layers3
                              className="size-3.5 text-zinc-300/70 sm:size-4"
                              aria-hidden="true"
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="min-w-0 truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-white/38 sm:text-[10px] sm:tracking-[0.18em]">
                              Focus Scope
                            </p>
                          </div>
                          <p className="mt-0.5 min-w-0 truncate text-xs font-semibold uppercase tracking-normal text-white/82 sm:text-sm">
                            {scopeSummary}
                          </p>
                        </div>
                      </div>
                    </div>
                  </section>
                ) : null}

                {hasRunStarted ? (
                  <section className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-[18px] border border-black/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(113,113,122,0.12)_32%,rgba(39,39,42,0.26)_60%,rgba(255,255,255,0.04))] p-px shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_14px_36px_rgba(0,0,0,0.34)] sm:rounded-[22px]">
                    <div className="overflow-hidden rounded-[17px] border border-black/60 bg-zinc-950/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_-18px_30px_rgba(0,0,0,0.32)] sm:rounded-[21px]">
                      {latestRunResult ? (
                        <>
                          {isRunLogExpanded && earlierRunResultsCount > 0 ? (
                            <div className="grid max-h-32 overflow-y-auto sm:max-h-40">
                              {visibleEarlierRunResults.map((session) =>
                                renderRunHistoryRow(session, "earlier")
                              )}
                            </div>
                          ) : null}

                          <div className="border-t border-black/40 bg-black/20 px-2.5 py-1.5 sm:px-3 sm:py-2">
                            {earlierRunResultsCount > 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  void hapticSnap();
                                  setIsRunLogExpanded((current) => !current);
                                }}
                                aria-expanded={isRunLogExpanded}
                                className="inline-flex min-h-7 w-full items-center justify-center rounded-lg border border-black/60 bg-white/[0.025] px-3 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400 transition hover:border-black/40 hover:bg-white/[0.055] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/30 sm:min-h-8 sm:text-[10px] sm:tracking-[0.14em]"
                              >
                                {isRunLogExpanded ? "See less" : "See more"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled
                                className="inline-flex min-h-7 w-full cursor-default items-center justify-center rounded-lg border border-black/50 bg-white/[0.012] px-3 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600 sm:min-h-8 sm:text-[10px] sm:tracking-[0.14em]"
                              >
                                See more
                              </button>
                            )}
                          </div>

                          {renderRunHistoryRow(latestRunResult, "latest")}
                        </>
                      ) : (
                        <>
                          <div className="border-t border-black/40 bg-black/20 px-2.5 py-1.5 sm:px-3 sm:py-2">
                            <button
                              type="button"
                              disabled
                              className="inline-flex min-h-7 w-full cursor-default items-center justify-center rounded-lg border border-black/50 bg-white/[0.012] px-3 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-600 sm:min-h-8 sm:text-[10px] sm:tracking-[0.14em]"
                            >
                              See more
                            </button>
                          </div>

                          <div className="relative flex min-w-0 items-center gap-2 border border-black/60 bg-white/[0.03] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_18px_rgba(255,255,255,0.014),inset_0_-12px_20px_rgba(0,0,0,0.16)] sm:gap-3 sm:px-4 sm:py-3">
                            <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-black/60 bg-white/[0.04] text-zinc-400 sm:size-8 sm:rounded-lg">
                              <Play
                                className="size-3 fill-current sm:size-3.5"
                                aria-hidden="true"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                                <p className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-normal text-white/82 sm:text-sm">
                                  Complete your first event
                                </p>
                                <span className="ml-auto whitespace-nowrap pl-1 text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-400 sm:text-[10px]">
                                  RUN STARTED
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-white/38 sm:mt-1 sm:text-[10px]">
                                Your run history will appear here.
                              </p>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </section>
                ) : null}

                <section className="relative mx-auto w-full max-w-3xl overflow-visible rounded-[20px] border border-black/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.14),rgba(113,113,122,0.18)_28%,rgba(39,39,42,0.42)_55%,rgba(82,82,91,0.14)_78%,rgba(255,255,255,0.08))] p-px shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_0_32px_rgba(255,255,255,0.025),0_20px_70px_rgba(0,0,0,0.55)] sm:rounded-[26px]">
                  <div className="relative overflow-hidden rounded-[19px] border border-black/60 bg-zinc-950/80 px-3 pb-3 pt-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_0_28px_rgba(255,255,255,0.025),inset_0_-20px_36px_rgba(0,0,0,0.48)] sm:rounded-[25px] sm:px-6 sm:py-5">
                    <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(135deg,rgba(255,255,255,0.065),transparent_24%,rgba(255,255,255,0.022)_74%,rgba(0,0,0,0.32)),radial-gradient(circle_at_18%_0%,rgba(255,255,255,0.045),transparent_34%)]" />
                    <div className="pointer-events-none absolute inset-x-10 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-white/28 to-transparent" />

                  <div className="relative">
                    <div className="grid gap-3 sm:gap-4 md:grid-cols-[minmax(0,1fr)_6.5rem] md:items-start">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-start gap-2.5 sm:gap-4">
                          {activeCardLoading ? (
                            <div className="flex size-10 shrink-0 animate-pulse items-center justify-center rounded-lg border border-black/60 bg-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,0.10),inset_0_-12px_18px_rgba(0,0,0,0.28)] sm:size-14 sm:rounded-xl" />
                          ) : currentItemIcon ? (
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-black/60 bg-white/[0.045] text-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.10),inset_0_-12px_18px_rgba(0,0,0,0.28)] sm:size-14 sm:rounded-xl sm:text-2xl">
                              <span aria-hidden="true">{currentItemIcon}</span>
                            </div>
                          ) : null}
                          <div className="flex min-w-0 flex-1 items-start gap-1.5 overflow-visible sm:gap-3">
                            <div className="min-w-0 flex-1">
                              {activeCardLoading ? (
                                <>
                                  <h2 id={titleId} className="sr-only">
                                    {cardState.title}
                                  </h2>
                                  <div
                                    className="max-w-2xl space-y-2 py-1.5 sm:space-y-3 sm:py-2"
                                    aria-hidden="true"
                                  >
                                    <div className="h-7 w-11/12 animate-pulse rounded-lg bg-white/10 min-[390px]:h-8 sm:h-10" />
                                    <div className="h-7 w-7/12 animate-pulse rounded-lg bg-white/[0.07] min-[390px]:h-8 sm:h-10" />
                                  </div>
                                </>
                              ) : (
                                <h2
                                  id={titleId}
                                  className="min-w-0 max-w-2xl break-words text-[1.35rem] font-semibold uppercase leading-tight tracking-normal text-white min-[390px]:text-[1.55rem] sm:text-4xl"
                                >
                                  {cardState.title}
                                </h2>
                              )}
                            </div>
                            {currentItem ? (
                              <span className="relative flex h-11 w-8 shrink-0 items-start justify-center overflow-visible sm:h-16 sm:w-12">
                                <FlameEmber
                                  level={currentEnergyLevel}
                                  size="md"
                                  className="shrink-0 overflow-visible [&_svg]:overflow-visible"
                                />
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {activeCardLoading ? (
                          <div
                            className="mt-2 flex w-full flex-wrap items-center gap-1.5 sm:mt-3 sm:w-fit sm:gap-2"
                            aria-hidden="true"
                          >
                            <div className="h-5 w-20 animate-pulse rounded-md border border-black/60 bg-white/[0.07] sm:h-7 sm:w-24 sm:rounded-lg" />
                            <div className="h-5 w-36 animate-pulse rounded-md border border-black/60 bg-white/[0.045] sm:h-7 sm:w-44 sm:rounded-lg" />
                          </div>
                        ) : (
                          <div
                            className={
                              currentMetaDisplay
                                ? "mt-2 flex w-full flex-wrap items-center gap-1.5 sm:mt-3 sm:w-fit sm:gap-2"
                                : "mt-2 flex w-full flex-wrap items-center gap-1.5 sm:mt-3 sm:w-fit sm:gap-2"
                            }
                          >
                            <div
                              className={
                                cardState.tone === "error"
                                  ? "inline-flex min-w-0 items-center justify-center rounded-md border border-red-300/25 bg-red-950/25 px-1.5 py-0.5 text-center text-[9px] font-semibold uppercase tracking-[0.1em] text-red-100/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:justify-start sm:rounded-lg sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.18em]"
                                  : "inline-flex min-w-0 items-center justify-center rounded-md border border-black/60 bg-black/40 px-1.5 py-0.5 text-center text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-300/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:justify-start sm:rounded-lg sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.18em]"
                              }
                            >
                              <span className="min-w-0 truncate">
                                {currentItem?.rawTypeLabel ?? cardState.badge}
                              </span>
                            </div>
                            {currentMetaDisplay ? (
                              <div className="inline-flex min-w-0 max-w-[calc(100%-3.5rem)] items-center justify-start gap-1.5 rounded-md border border-black/60 bg-black/25 px-2 py-0.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:max-w-[13rem] sm:gap-2 sm:rounded-lg sm:px-2.5 sm:py-1">
                                <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-black/60 bg-white/5 text-[9px] font-semibold text-zinc-200 sm:size-5 sm:text-[10px]">
                                  {currentMetaDisplay.icon}
                                </span>
                                <span className="min-w-0 truncate text-[10px] font-semibold text-zinc-400 sm:text-[11px]">
                                  {currentMetaDisplay.name}
                                </span>
                              </div>
                            ) : null}
                          </div>
                        )}

                        {scopeEmpty ? (
                          <button
                            type="button"
                            onClick={resetExecutionFilters}
                            className="mt-2 inline-flex min-h-9 items-center justify-center rounded-lg border border-black/60 bg-white/[0.055] px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),inset_0_-10px_18px_rgba(0,0,0,0.24)] transition hover:border-black/40 hover:bg-white/[0.09] focus:outline-none focus:ring-2 focus:ring-white/35 sm:mt-3 sm:min-h-10 sm:px-4 sm:text-[11px] sm:tracking-[0.16em]"
                          >
                            Reset filters
                          </button>
                        ) : null}
                      </div>

                      <div className="hidden justify-self-end md:block">
                        <div className="relative flex size-24 rotate-3 items-center justify-center border border-black/60 bg-[#0b0e11] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-18px_28px_rgba(0,0,0,0.44),0_18px_34px_-26px_rgba(0,0,0,0.9)] [clip-path:polygon(18%_0,88%_7%,100%_55%,74%_100%,8%_90%,0_34%)]">
                          <div className="flex size-14 -rotate-3 items-center justify-center rounded-xl border border-black/60 bg-white/[0.045] text-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-12px_18px_rgba(0,0,0,0.28)]">
                            {activeCardLoading ? (
                              <span className="size-8 animate-pulse rounded-lg bg-white/10" />
                            ) : (
                              <span aria-hidden="true">
                                {currentItemIcon ?? displaySource?.icon ?? "</>"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {currentItem || activeCardLoading ? (
                      <div
                        role="group"
                        aria-label="Current item actions"
                        className="mt-3 grid w-full grid-cols-2 gap-2 border-t border-black/40 pt-3 sm:mt-5 sm:max-w-sm sm:pt-4"
                      >
                        {activeCardLoading ? (
                          <>
                            <div className="min-h-9 animate-pulse rounded-lg border border-black/60 bg-white/[0.035] sm:min-h-10 sm:rounded-xl" />
                            <div className="min-h-9 animate-pulse rounded-lg border border-black/60 bg-white/[0.05] sm:min-h-10 sm:rounded-xl" />
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              aria-label="Skip current item"
                              onClick={handleSkip}
                              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-black/60 bg-white/[0.035] px-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-400 transition hover:border-black/40 hover:bg-white/[0.06] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/35 sm:min-h-10 sm:rounded-xl sm:px-3 sm:text-[11px] sm:tracking-[0.14em]"
                            >
                              Skip
                            </button>
                            <button
                              type="button"
                              aria-label="Complete current item"
                              onClick={handleComplete}
                              aria-disabled={!canCompleteCurrentRun}
                              disabled={!canCompleteCurrentRun}
                              className={
                                canCompleteCurrentRun
                                  ? "inline-flex min-h-9 items-center justify-center rounded-lg border border-green-900/45 bg-[linear-gradient(155deg,rgba(34,197,94,0.94)_0%,rgba(22,163,74,0.97)_48%,rgba(21,128,61,0.98)_100%)] px-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white shadow-[0_22px_38px_rgba(0,0,0,0.34),0_9px_18px_rgba(3,83,45,0.22),inset_0_1px_0_rgba(255,255,255,0.045),inset_0_-2px_8px_rgba(0,0,0,0.11),inset_0_0_0_1px_rgba(0,0,0,0.08)] transition hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-green-500/45 focus:ring-offset-2 focus:ring-offset-zinc-950 sm:min-h-10 sm:rounded-xl sm:px-3 sm:text-[11px] sm:tracking-[0.14em]"
                                  : "inline-flex min-h-9 cursor-not-allowed items-center justify-center rounded-lg border border-black/60 bg-zinc-900/90 px-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.09),inset_0_-4px_0_rgba(0,0,0,0.38),0_18px_34px_-28px_rgba(0,0,0,0.95)] transition focus:outline-none focus:ring-2 focus:ring-white/35 focus:ring-offset-2 focus:ring-offset-zinc-950 sm:min-h-10 sm:rounded-xl sm:px-3 sm:text-[11px] sm:tracking-[0.14em]"
                              }
                            >
                              Complete
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}

                  </div>
                  </div>
                </section>

                {currentItem || activeCardLoading ? (
                  <div
                    className={
                      scopeOpen
                        ? "relative hidden overflow-visible rounded-[18px] border border-black/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.10),rgba(113,113,122,0.14)_30%,rgba(39,39,42,0.34)_58%,rgba(255,255,255,0.055))] p-px shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_45px_rgba(0,0,0,0.45)] sm:block sm:rounded-[22px]"
                        : "relative overflow-visible rounded-[18px] border border-black/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.10),rgba(113,113,122,0.14)_30%,rgba(39,39,42,0.34)_58%,rgba(255,255,255,0.055))] p-px shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_45px_rgba(0,0,0,0.45)] sm:rounded-[22px]"
                    }
                  >
                    <motion.div
                      layout
                      className="overflow-hidden rounded-[17px] border border-black/60 bg-zinc-950/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_0_22px_rgba(255,255,255,0.02),inset_0_-20px_34px_rgba(0,0,0,0.38)] sm:rounded-[21px]"
                      transition={{
                        duration: prefersReducedMotion ? 0.01 : 0.18,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    >
                      <motion.div
                        id={queueListId}
                        layout
                        className={
                          isQueueExpanded
                            ? "grid max-h-[min(42dvh,22rem)] overflow-y-auto"
                            : "grid sm:grid-cols-3"
                        }
                        transition={{
                          duration: prefersReducedMotion ? 0.01 : 0.18,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      >
                        {activeCardLoading ? (
                          Array.from({ length: 3 }).map((_, index) => (
                            <div
                              key={`queue-skeleton-${index}`}
                              className={
                                index === 0
                                  ? "relative flex min-w-0 items-center gap-2 border border-black/60 bg-white/[0.035] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_18px_rgba(255,255,255,0.018),inset_0_-12px_20px_rgba(0,0,0,0.18)] sm:gap-3 sm:px-4 sm:py-4"
                                  : "flex min-w-0 items-center gap-2 border-t border-black/40 px-3 py-2.5 opacity-60 sm:gap-3 sm:border-l sm:border-t-0 sm:px-4 sm:py-4"
                              }
                            >
                              <div className="size-7 shrink-0 animate-pulse rounded-md border border-black/60 bg-white/[0.045] sm:size-8 sm:rounded-lg" />
                              <div className="size-7 shrink-0 animate-pulse rounded-md border border-black/60 bg-white/[0.04] sm:size-8 sm:rounded-lg" />
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <div className="h-3.5 w-10/12 animate-pulse rounded-full bg-white/10 sm:h-4" />
                                <div className="h-2.5 w-20 animate-pulse rounded-full bg-white/[0.06] sm:h-3" />
                              </div>
                              <div className="ml-auto h-7 w-5 shrink-0 animate-pulse rounded-full bg-white/[0.05] sm:h-9 sm:w-7" />
                            </div>
                          ))
                        ) : (
                          <DndContext
                            sensors={queueDragSensors}
                            collisionDetection={closestCenter}
                            onDragStart={handleQueueDragStart}
                            onDragCancel={handleQueueDragCancel}
                            onDragEnd={handleQueueDragEnd}
                          >
                            <SortableContext
                              items={visibleQueueItemIds}
                              strategy={rectSortingStrategy}
                            >
                              {visibleQueueItems.map((item, index) => {
                                const itemKey = getFocusPomoQueueItemKey(item);
                                const itemIndex =
                                  sortedQueueIndexByKey.get(itemKey) ?? index;

                                return (
                                  <SortableFocusQueueItem
                                    key={itemKey}
                                    item={item}
                                    position={itemIndex + 1}
                                    selected={itemKey === currentItemKey}
                                    isQueueExpanded={isQueueExpanded}
                                    onSelect={() =>
                                      handleQueueRowSelect(itemIndex)
                                    }
                                    onLongPressEdit={(originElement) =>
                                      handleQueueItemLongPressEdit(
                                        item,
                                        originElement
                                      )
                                    }
                                  />
                                );
                              })}
                            </SortableContext>
                          </DndContext>
                        )}
                      </motion.div>

                      {hasMoreQueueItems ? (
                        <div className="border-t border-black/40 bg-black/25 px-2.5 py-2 sm:px-3 sm:py-3">
                          <button
                            type="button"
                            onClick={() => {
                              void hapticSnap();
                              setIsQueueExpanded((current) => !current);
                            }}
                            aria-expanded={isQueueExpanded}
                            aria-controls={queueListId}
                            className="inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-black/60 bg-white/[0.03] px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-300 transition hover:border-black/40 hover:bg-white/[0.06] hover:text-white focus:outline-none focus:ring-2 focus:ring-white/35 sm:min-h-10 sm:px-4 sm:text-[11px] sm:tracking-[0.16em]"
                          >
                            {isQueueExpanded
                              ? "See less"
                              : `See more (${hiddenQueueCount})`}
                          </button>
                        </div>
                      ) : null}
                    </motion.div>
                  </div>
                ) : null}

              </main>

              <div className="shrink-0 rounded-[18px] border border-black/70 bg-[#080a0d] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_-18px_32px_rgba(0,0,0,0.42),0_22px_64px_-50px_rgba(0,0,0,0.85)] sm:rounded-[22px] sm:p-4">
                <div className="grid grid-cols-[minmax(6rem,1fr)_minmax(0,2fr)] items-stretch gap-2.5 sm:grid-cols-[minmax(12rem,18rem)_1fr] sm:items-center sm:gap-4">
                  <div className="flex min-w-0 overflow-hidden flex-col justify-center gap-1 rounded-xl border border-black/50 bg-white/[0.025] px-1.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:border-0 sm:border-r sm:bg-transparent sm:px-0 sm:py-0 sm:pr-5">
                    <div className="flex min-w-0 items-center gap-1 sm:gap-3">
                      <svg
                        aria-hidden="true"
                        className="size-5 shrink-0 -rotate-90 overflow-visible sm:size-11"
                        viewBox="0 0 44 44"
                      >
                        <circle
                          cx="22"
                          cy="22"
                          fill="none"
                          r={timerRingRadius}
                          stroke="rgba(16, 185, 129, 0.18)"
                          strokeWidth="6"
                        />
                        <circle
                          cx="22"
                          cy="22"
                          fill="none"
                          r={timerRingRadius}
                          stroke={
                            mode === "pomo"
                              ? "rgba(209, 250, 229, 0.92)"
                              : "rgba(255, 255, 255, 0.78)"
                          }
                          strokeDasharray={timerRingCircumference}
                          strokeDashoffset={timerRingDashOffset}
                          strokeLinecap="round"
                          strokeWidth="6"
                          style={{
                            transition: timerRingTransition,
                          }}
                        />
                      </svg>
                      <p className="min-w-0 truncate text-[7px] font-semibold uppercase tracking-[0.08em] text-zinc-300/80 sm:text-[10px] sm:tracking-[0.22em]">
                        {timerLabel}
                      </p>
                    </div>
                    <p className="min-w-0 max-w-full shrink whitespace-nowrap font-mono text-[1.05rem] font-semibold leading-none tabular-nums tracking-normal text-white min-[390px]:text-[1.15rem] sm:text-[1.65rem] md:text-[2rem]">
                      {timerDisplay}
                    </p>
                  </div>

                  <div className="flex min-w-0">
                    <button
                      type="button"
                      onClick={handlePrimaryAction}
                      disabled={!isRunning && !currentItem}
                      aria-disabled={!isRunning && !currentItem}
                      className={
                        isRunning
                          ? "inline-flex min-h-12 w-full flex-1 items-center justify-center gap-2 rounded-xl border border-black/60 bg-zinc-900/90 px-5 text-sm font-semibold uppercase tracking-[0.12em] text-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.09),inset_0_-4px_0_rgba(0,0,0,0.38),0_18px_34px_-28px_rgba(0,0,0,0.95)] transition hover:bg-zinc-800/90 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/35 focus:ring-offset-2 focus:ring-offset-zinc-950 sm:min-h-16 sm:gap-3 sm:rounded-[16px] sm:px-7 sm:text-base sm:tracking-[0.18em]"
                          : currentItem
                            ? "shimmer-border-complete focus-pomo-start-glint relative z-0 inline-flex min-h-12 w-full flex-1 items-center justify-center gap-2 rounded-xl border border-green-900/45 bg-[linear-gradient(155deg,rgba(34,197,94,0.94)_0%,rgba(22,163,74,0.97)_48%,rgba(21,128,61,0.98)_100%)] px-5 text-sm font-semibold uppercase tracking-[0.14em] text-white shadow-[0_22px_38px_rgba(0,0,0,0.34),0_9px_18px_rgba(3,83,45,0.22),inset_0_1px_0_rgba(255,255,255,0.045),inset_0_-2px_8px_rgba(0,0,0,0.11),inset_0_0_0_1px_rgba(0,0,0,0.08)] transition hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-green-500/45 focus:ring-offset-2 focus:ring-offset-zinc-950 sm:min-h-16 sm:gap-3 sm:rounded-[16px] sm:px-7 sm:text-base sm:tracking-[0.22em]"
                            : "inline-flex min-h-12 w-full flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-black/60 bg-zinc-900/90 px-5 text-sm font-semibold uppercase tracking-[0.14em] text-white/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.09),inset_0_-4px_0_rgba(0,0,0,0.38),0_18px_34px_-28px_rgba(0,0,0,0.95)] transition focus:outline-none focus:ring-2 focus:ring-white/35 focus:ring-offset-2 focus:ring-offset-zinc-950 sm:min-h-16 sm:gap-3 sm:rounded-[16px] sm:px-7 sm:text-base sm:tracking-[0.22em]"
                      }
                    >
                      {isRunning ? (
                        <Square className="size-4 sm:size-5" aria-hidden="true" />
                      ) : (
                        <Play
                          className="size-4 fill-current sm:size-5"
                          aria-hidden="true"
                        />
                      )}
                      {isRunning ? "Cancel" : "Start"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
