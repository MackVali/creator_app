"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Layers3, Play, Square, X } from "lucide-react";
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";
import {
  fetchFocusPomoQueue,
  sortFocusPomoQueue,
  type FocusPomoQueueItem,
} from "@/lib/focus/focusPomoQueue";
import { HABIT_TYPE_OPTIONS as APP_HABIT_TYPE_OPTIONS } from "@/components/habits/habit-form-fields";
import { getGoalsForUser } from "@/lib/queries/goals";
import { getMonumentsForUser } from "@/lib/queries/monuments";
import {
  listRoadmapsWithItems,
  type RoadmapWithItems,
} from "@/lib/queries/roadmaps";
import { getSkillsForUser } from "@/lib/queries/skills";
import { getSupabaseBrowser } from "@/lib/supabase";

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
  resultTone: "under" | "over" | "skipped";
};

type ScopeOption = {
  id: string;
  name: string;
  icon?: string | null;
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

const DEFAULT_ENABLED_ITEM_TYPES: FocusExecutionItemType[] = [
  "project",
  "task",
  "habit",
];

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

function formatTimerDeltaMs(totalMs: number): string {
  const sign = totalMs > 0 ? "+" : "";
  return `${sign}${formatSignedTimerMs(totalMs)}`;
}

function createLocalSessionId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function readScopeString(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
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
  icon?: string | null
): ScopeOption | null {
  const optionName = name ?? id;
  if (!optionName) return null;

  return {
    id: id ?? nameScopeId(optionName),
    name: optionName,
    icon: icon ?? null,
  };
}

function mergeScopeOption(
  options: Map<string, ScopeOption>,
  option: ScopeOption | null
) {
  if (!option) return;

  const existingById = options.get(option.id);
  if (existingById) {
    if (!existingById.icon && option.icon) {
      options.set(option.id, { ...existingById, icon: option.icon });
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
    if (!existingByName.icon && option.icon) {
      options.set(existingByName.id, { ...existingByName, icon: option.icon });
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
  const directName = directNames.find(Boolean) ?? null;

  directIds.forEach((id) => {
    mergeConstraintOption(options, makeConstraintOption(id, directName, directIcon));
  });
  directNames.forEach((name) => {
    mergeConstraintOption(options, makeConstraintOption(null, name, directIcon));
  });

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
      mergeConstraintOption(campaigns, option)
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
  goal_id?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
};

async function fetchFocusPomoProjectOrderMap(
  userId: string
): Promise<Map<string, number>> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return new Map();

  const selects = [
    "id, goal_id, created_at, completed_at",
    "id, goal_id, created_at",
  ];
  let lastError: unknown = null;

  for (const select of selects) {
    const { data, error } = await supabase
      .from("projects")
      .select(select)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      lastError = error;
      continue;
    }

    const rows = ((data ?? []) as FocusPomoProjectOrderRow[]).filter(
      (row) => !readScopeString(row.completed_at)
    );
    const orderMap = new Map<string, number>();
    const nextGoalProjectOrder = new Map<string, number>();

    rows.forEach((row, createdAtIndex) => {
      const projectId = readScopeString(row.id);
      if (!projectId) return;

      const goalId = readScopeString(row.goal_id);
      if (!goalId) {
        orderMap.set(projectId, 1_000_000 + createdAtIndex);
        return;
      }

      const projectOrder = nextGoalProjectOrder.get(goalId) ?? 0;
      orderMap.set(projectId, projectOrder);
      nextGoalProjectOrder.set(goalId, projectOrder + 1);
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

  if (hasMonumentScope) {
    const monumentIds = getItemMonumentIds(item, source);
    const monumentNames = getItemMonumentNames(item, source).map(
      normalizeScopeName
    );
    const hasMatch =
      selectedMonumentIds.some(
        (id) =>
          monumentIds.includes(id) ||
          monumentNames.includes(normalizeSelectedScopeIdName(id))
      ) || selectedMonumentNames.some((name) => monumentNames.includes(name));

    if (!hasMatch) return false;
  }

  if (hasSkillScope) {
    const skillIds = getItemSkillIds(item, source);
    const skillNames = getItemSkillNames(item, source).map(normalizeScopeName);
    const hasMatch =
      selectedSkillIds.some(
        (id) =>
          skillIds.includes(id) ||
          skillNames.includes(normalizeSelectedScopeIdName(id))
      ) || selectedSkillNames.some((name) => skillNames.includes(name));

    if (!hasMatch) return false;
  }

  return true;
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

function itemMatchesExecutionConstraints(
  item: FocusPomoQueueItem,
  options: {
    source: FocusPomoSource | null | undefined;
    selectedMonumentIds: string[];
    selectedSkillIds: string[];
    selectedMonumentNames: string[];
    selectedSkillNames: string[];
    selectedTagKeys: string[];
    selectedGoalKeys: string[];
    selectedCampaignKeys: string[];
    selectedRoutineKeys: string[];
    enabledItemTypes: FocusExecutionItemType[];
    enabledHabitTypes: string[] | null;
  }
): boolean {
  if (
    !itemMatchesScope(item, {
      source: options.source,
      selectedMonumentIds: options.selectedMonumentIds,
      selectedSkillIds: options.selectedSkillIds,
      selectedMonumentNames: options.selectedMonumentNames,
      selectedSkillNames: options.selectedSkillNames,
    })
  ) {
    return false;
  }

  if (
    !itemMatchesExecutionFilters(item, {
      enabledItemTypes: options.enabledItemTypes,
      enabledHabitTypes: options.enabledHabitTypes,
    })
  ) {
    return false;
  }

  if (
    !selectedGroupMatchesItem(
      relationOptionKeys(getItemTagOptions(item)),
      options.selectedTagKeys
    )
  ) {
    return false;
  }

  if (
    !selectedGroupMatchesItem(
      relationOptionKeys(getItemGoalOptions(item)),
      options.selectedGoalKeys
    )
  ) {
    return false;
  }

  if (
    !selectedGroupMatchesItem(
      getItemCampaignMatchKeys(item, options.source),
      options.selectedCampaignKeys
    )
  ) {
    return false;
  }

  return selectedGroupMatchesItem(
    relationOptionKeys(getItemRoutineOptions(item)),
    options.selectedRoutineKeys
  );
}

function getScopeSummary(
  groups: Array<{ count: number; singular: string; option?: ScopeOption | ConstraintOption }>,
  customWorkTypeFilters: boolean,
  customHabitTypeFilters: boolean
): string {
  const activeGroups = groups.filter((group) => group.count > 0);
  const selectedCount =
    activeGroups.reduce((total, group) => total + group.count, 0) +
    (customWorkTypeFilters ? 1 : 0) +
    (customHabitTypeFilters ? 1 : 0);

  if (selectedCount === 0) return "All scheduled work";
  if (selectedCount === 1 && activeGroups.length === 1 && activeGroups[0].option) {
    return formatScopeSummaryOption(activeGroups[0].option);
  }

  return [
    ...activeGroups.map((group) =>
      pluralizeScopeLabel(group.count, group.singular)
    ),
    customWorkTypeFilters ? "Work Type" : null,
    customHabitTypeFilters ? "Habit Type" : null,
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

async function fetchUserHabitTypeOptions(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowser>>,
  userId: string
): Promise<HabitTypeOption[]> {
  const { data, error } = await supabase
    .from("habits")
    .select("habit_type")
    .eq("user_id", userId);

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

export default function FocusPomo({ open, source, onClose }: FocusPomoProps) {
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
  const [runHistory, setRunHistory] = useState<FocusPomoRunResult[]>([]);
  const [hasRunStarted, setHasRunStarted] = useState(false);
  const [isRunLogExpanded, setIsRunLogExpanded] = useState(false);
  const previousActiveIndexRef = useRef(activeIndex);
  const previousTimerItemRef = useRef<{
    itemKey: string | null;
    durationMs: number;
  } | null>(null);
  const timerStartedAtMsRef = useRef(0);
  const timerBaseElapsedMsRef = useRef(0);
  const timerBaseRemainingMsRef = useRef(0);
  const elapsedMsRef = useRef(0);
  const remainingMsRef = useRef(0);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [isQueueExpanded, setIsQueueExpanded] = useState(false);
  const [selectedMonumentIds, setSelectedMonumentIds] = useState<string[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
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
  const queueListId = useId();

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
    }
  }, [open]);

  useEffect(() => {
    if (!scopeOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setScopeOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [scopeOpen]);

  useEffect(() => {
    if (!open) {
      setAvailableScopeOptions({ monuments: [], skills: [] });
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
            ? sortScopeOptions(
                skillsResult.value
                  .map((skill) =>
                    makeScopeOption(skill.id, skill.name, skill.icon ?? null)
                  )
                  .filter((option): option is ScopeOption => Boolean(option))
              )
            : [],
      });
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
    if (!open || !source?.sourceId) {
      setQueue([]);
      setQueueLoading(false);
      setQueueError(null);
      setScopeQueue([]);
      setScopeQueueLoading(false);
      setScopeQueueError(null);
      setActiveIndex(0);
      setSelectedMonumentIds([]);
      setSelectedSkillIds([]);
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
    setSelectedMonumentIds([]);
    setSelectedSkillIds([]);
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

    fetchFocusPomoQueue({
      sourceType: source.sourceType,
      sourceId: source.sourceId,
    })
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

    let stale = false;

    setActiveIndex(0);
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
    selectedMonumentIds,
    selectedSkillIds,
    availableScopeOptions,
  ]);

  const shouldShow = open && source !== null;
  const displaySource = shouldShow ? source : lastSource;
  const hasSelectedScope =
    selectedMonumentIds.length > 0 || selectedSkillIds.length > 0;
  const effectiveQueue = hasSelectedScope ? scopeQueue : queue;
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
      ? availableScopeOptions.monuments
      : queueDerivedScopeOptions.monuments;
  const skillOptions =
    availableScopeOptions.skills.length > 0
      ? availableScopeOptions.skills
      : queueDerivedScopeOptions.skills;
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
  const campaignOptions = mergeConstraintOptions(
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
  const scopeFilteredQueue = hasSelectedScope
    ? effectiveQueue.filter((item) =>
        itemMatchesScope(item, {
          source: displaySource,
          selectedMonumentIds,
          selectedSkillIds,
          selectedMonumentNames,
          selectedSkillNames,
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
  const sortedQueue = sortFocusPomoQueue(constrainedQueue, {
    selectedMonumentIds,
    monumentOptions,
    goalOrderMap: roadmapGoalOrderMap,
    projectOrderMap,
  });
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
  const currentItem = sortedQueue[activeIndex] ?? null;
  const pomoDurationMinutes = currentItem?.durationMinutes ?? 25;
  const currentTimerDurationMs = pomoDurationMinutes * 60 * 1000;
  const currentItemTimerKey = currentItem?.id ?? null;
  const timerDisplay = formatSignedTimerMs(
    mode === "pomo" ? remainingMs : elapsedMs
  );
  const timerLabel = mode === "pomo" ? "COUNTDOWN" : "STOPWATCH";
  const latestRunResult = runHistory[0] ?? null;
  const earlierRunResults = runHistory.slice(1);
  const visibleEarlierRunResults = [...earlierRunResults].reverse();
  const earlierRunResultsCount = earlierRunResults.length;
  const collapsedQueueLimit = 3;
  const queueCollapsedEndIndex = activeIndex + collapsedQueueLimit;
  const hasMoreQueueItems = sortedQueue.length > queueCollapsedEndIndex;
  const visibleQueueItems = sortedQueue.slice(
    activeIndex,
    isQueueExpanded ? sortedQueue.length : queueCollapsedEndIndex
  );
  const hiddenQueueCount = Math.max(
    sortedQueue.length - queueCollapsedEndIndex,
    0
  );
  const currentItemIcon = itemDisplayIcon(currentItem);
  const currentGoalDisplay = getItemGoalDisplay(currentItem);
  const currentRoutineDisplay = getItemRoutineDisplay(currentItem);
  const currentMetaDisplay =
    currentItem?.kind === "project" ? currentGoalDisplay : currentRoutineDisplay;
  const currentEnergyLevel = normalizeFlameLevel(
    currentItem?.energyCode,
    currentItem?.energyLabel
  );
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
        title: hasSelectedScope
          ? "Loading scope work..."
          : "Loading your execution queue",
        subtitle: hasSelectedScope
          ? "Pulling eligible habits and projects for this scope."
          : "Pulling habits and projects for this source.",
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
            title: "No work matches this scope.",
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
            title: "No work found here yet",
            subtitle:
              "Add habits or projects to this Monument/Skill to run them from FocusPomo.",
            tone: "empty",
          };

  useEffect(() => {
    const previousActiveIndex = previousActiveIndexRef.current;
    previousActiveIndexRef.current = activeIndex;

    if (previousActiveIndex === activeIndex) return;

    setIsRunning(false);
    setElapsedMs(0);
    setRemainingMs(currentTimerDurationMs);
  }, [activeIndex, currentTimerDurationMs]);

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

    if (isRunning) {
      setIsRunning(false);
    }
    setElapsedMs(0);
    setRemainingMs(currentTimerDurationMs);
  }, [currentItemTimerKey, currentTimerDurationMs, isRunning]);

  useEffect(() => {
    elapsedMsRef.current = elapsedMs;
  }, [elapsedMs]);

  useEffect(() => {
    remainingMsRef.current = remainingMs;
  }, [remainingMs]);

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

  if (!mounted) {
    return null;
  }

  if (!shouldShow && !displaySource) {
    return null;
  }

  const handleClose = () => {
    setIsRunning(false);
    onClose();
  };

  const handleModeChange = (nextMode: FocusPomoMode) => {
    setMode(nextMode);
    setIsRunning(false);
    setElapsedMs(0);
    setRemainingMs(currentTimerDurationMs);
  };

  const resetExecutionFilters = () => {
    setSelectedMonumentIds([]);
    setSelectedSkillIds([]);
    setSelectedTagIds([]);
    setSelectedGoalIds([]);
    setSelectedCampaignIds([]);
    setSelectedRoutineIds([]);
    setEnabledItemTypes(DEFAULT_ENABLED_ITEM_TYPES);
    setEnabledHabitTypes(null);
    setActiveIndex(0);
    setRunHistory([]);
    setHasRunStarted(false);
    setIsRunLogExpanded(false);
  };

  const toggleSelectedId = (
    setter: Dispatch<SetStateAction<string[]>>,
    id: string
  ) => {
    setter((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id]
    );
    setActiveIndex(0);
    setRunHistory([]);
    setHasRunStarted(false);
    setIsRunLogExpanded(false);
  };

  const toggleMonumentScope = (id: string) => {
    toggleSelectedId(setSelectedMonumentIds, id);
  };

  const toggleSkillScope = (id: string) => {
    toggleSelectedId(setSelectedSkillIds, id);
  };

  const toggleItemType = (type: FocusExecutionItemType) => {
    setEnabledItemTypes((current) =>
      current.includes(type)
        ? current.filter((enabledType) => enabledType !== type)
        : [...current, type]
    );
    setActiveIndex(0);
    setRunHistory([]);
    setHasRunStarted(false);
    setIsRunLogExpanded(false);
  };

  const toggleHabitType = (type: string) => {
    if (isLockedOffHabitTypeKey(type)) return;

    setEnabledHabitTypes((current) => {
      const enabledTypes =
        current ?? getDefaultEnabledHabitTypes(habitTypePillOptions);

      return enabledTypes.includes(type)
        ? enabledTypes.filter((enabledType) => enabledType !== type)
        : [...enabledTypes, type];
    });
    setActiveIndex(0);
    setRunHistory([]);
    setHasRunStarted(false);
    setIsRunLogExpanded(false);
  };

  const resetCurrentTimer = () => {
    elapsedMsRef.current = 0;
    remainingMsRef.current = currentTimerDurationMs;
    setElapsedMs(0);
    setRemainingMs(currentTimerDurationMs);
  };

  const advanceActiveItem = () => {
    setActiveIndex((current) => Math.min(current + 1, sortedQueue.length));
  };

  const handlePrimaryAction = () => {
    if (isRunning) {
      setIsRunning(false);
      resetCurrentTimer();
      setHasRunStarted(false);
      console.info("Focus pomo cancel requested", { mode, source });
      return;
    }

    setHasRunStarted(true);
    setIsRunning(true);
    console.info("Focus pomo start requested", { mode, source });
  };

  const handleSkip = () => {
    if (!currentItem) return;

    setHasRunStarted(true);
    setIsRunLogExpanded(false);
    setRunHistory((current) => [
      {
        id: createLocalSessionId(),
        itemId: currentItem.id,
        title: currentItem.title,
        ...buildRunResultDisplayMetadata(currentItem),
        action: "skipped",
        plannedMs: currentTimerDurationMs,
        actualMs: null,
        deltaMs: null,
        completedAt: new Date().toISOString(),
        resultTone: "skipped",
      },
      ...current,
    ]);

    setIsRunning(false);
    resetCurrentTimer();
    advanceActiveItem();
  };

  const handleComplete = () => {
    if (!currentItem) return;

    const plannedMs = currentTimerDurationMs;
    const actualMs =
      mode === "pomo"
        ? plannedMs - remainingMsRef.current
        : elapsedMsRef.current;
    const deltaMs = actualMs - plannedMs;

    // TODO: Wire this to the app's existing completion pathways by item kind/sourceType.
    setHasRunStarted(true);
    setIsRunLogExpanded(false);
    setRunHistory((current) => [
      {
        id: createLocalSessionId(),
        itemId: currentItem.id,
        title: currentItem.title,
        ...buildRunResultDisplayMetadata(currentItem),
        action: "completed",
        plannedMs,
        actualMs,
        deltaMs,
        completedAt: new Date().toISOString(),
        resultTone: deltaMs <= 0 ? "under" : "over",
      },
      ...current,
    ]);

    setIsRunning(false);
    resetCurrentTimer();
    advanceActiveItem();
  };

  return createPortal(
    <AnimatePresence
      initial={false}
      onExitComplete={() => {
        if (!open) {
          setLastSource(null);
        }
      }}
    >
      {shouldShow && displaySource ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed inset-0 z-[80] flex items-stretch justify-center overflow-y-auto bg-black/95 p-0 text-white backdrop-blur-xl sm:items-center sm:p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(255,255,255,0.08),transparent_32%),linear-gradient(180deg,rgba(24,24,27,0.36),rgba(0,0,0,0.82)),repeating-linear-gradient(120deg,rgba(255,255,255,0.025)_0px,rgba(255,255,255,0.025)_1px,transparent_1px,transparent_9px)]" />
          <motion.div
            className="relative flex min-h-dvh w-full flex-col overflow-visible bg-[#050707] px-3 py-3 shadow-[0_40px_110px_-70px_rgba(0,0,0,0.82)] sm:max-h-[calc(100dvh-2.5rem)] sm:max-w-4xl sm:overflow-y-auto sm:rounded-[22px] sm:border sm:border-white/10 sm:px-7 sm:py-6"
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
            <div className="pointer-events-none absolute inset-0 rounded-[inherit] border border-white/[0.035] bg-[linear-gradient(145deg,rgba(255,255,255,0.07),transparent_24%,rgba(255,255,255,0.025)_72%,rgba(0,0,0,0.38)),radial-gradient(circle_at_25%_35%,rgba(255,255,255,0.04),transparent_28%)]" />
            <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />
            <button
              type="button"
              aria-label="Close focus pomo"
              onClick={handleClose}
              className="absolute right-3 top-3 z-20 inline-flex size-10 items-center justify-center border border-white/15 bg-[#080a0d] text-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),inset_0_-10px_20px_rgba(0,0,0,0.36),0_18px_34px_-26px_rgba(0,0,0,0.95)] transition [clip-path:polygon(24%_0,76%_0,100%_24%,100%_76%,76%_100%,24%_100%,0_76%,0_24%)] hover:border-white/28 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/35 sm:right-7 sm:top-7 sm:size-12"
            >
              <X className="size-5 sm:size-6" aria-hidden="true" />
            </button>

            <div className="relative z-10 flex flex-1 flex-col gap-3 sm:gap-6">
              {!hasRunStarted ? (
                <header className="relative flex min-h-10 items-center justify-between pr-12 sm:min-h-12 sm:pr-14">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.04em] text-zinc-300/80 min-[390px]:text-[10px] min-[390px]:tracking-[0.22em] sm:text-[12px] sm:tracking-[0.32em]">
                    FOCUSPOMO
                  </p>
                  <div className="absolute left-1/2 top-1/2 grid w-[8.75rem] shrink-0 -translate-x-1/2 -translate-y-1/2 grid-cols-2 overflow-hidden rounded-lg border border-white/12 bg-[#050707] p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-16px_30px_rgba(0,0,0,0.48)] min-[390px]:w-[10rem] sm:w-[16rem] sm:rounded-xl sm:p-1">
                    {modeOptions.map((option) => {
                      const selected = mode === option.value;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleModeChange(option.value)}
                          className={
                            selected && option.value === "pomo"
                              ? "min-h-8 rounded-md border border-emerald-300/35 bg-[linear-gradient(180deg,rgba(6,78,59,0.58),rgba(5,150,105,0.16))] px-2 text-[10px] font-semibold tracking-[0.08em] text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-12px_20px_rgba(6,78,59,0.28),0_12px_28px_-24px_rgba(16,185,129,0.95)] min-[390px]:text-[11px] min-[390px]:tracking-[0.12em] sm:min-h-12 sm:rounded-lg sm:px-4 sm:text-[12px] sm:tracking-[0.22em]"
                              : selected
                                ? "min-h-8 rounded-md border border-white/12 bg-white/[0.055] px-2 text-[10px] font-semibold tracking-[0.08em] text-white/86 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-12px_20px_rgba(0,0,0,0.26),0_12px_28px_-24px_rgba(0,0,0,0.95)] min-[390px]:text-[11px] min-[390px]:tracking-[0.12em] sm:min-h-12 sm:rounded-lg sm:px-4 sm:text-[12px] sm:tracking-[0.22em]"
                                : "min-h-8 rounded-md border border-transparent px-2 text-[10px] font-semibold tracking-[0.08em] text-white/36 transition hover:border-white/10 hover:bg-white/[0.04] hover:text-white/68 min-[390px]:text-[11px] min-[390px]:tracking-[0.12em] sm:min-h-12 sm:rounded-lg sm:px-4 sm:text-[12px] sm:tracking-[0.22em]"
                          }
                          aria-pressed={selected}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </header>
              ) : null}

              <main className="flex flex-1 flex-col gap-3 sm:gap-5">
                {!hasRunStarted ? (
                  <div className="overflow-hidden rounded-[14px] border border-white/10 bg-zinc-950/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-16px_28px_rgba(0,0,0,0.36)] sm:rounded-[18px]">
                  <div className="flex min-h-12 items-center gap-2 bg-black/40 px-3 py-2 sm:min-h-14 sm:gap-3 sm:px-4 sm:py-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.045] text-base shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:size-9 sm:rounded-xl sm:text-lg">
                      {displaySource.icon ? (
                        <span aria-hidden="true">{displaySource.icon}</span>
                      ) : (
                        <Layers3
                          className="size-3.5 text-zinc-300/70 sm:size-4"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-2 sm:gap-3">
                      <div className="min-w-0">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-400/80 sm:text-[10px] sm:tracking-[0.22em]">
                          Execution Constraints
                        </p>
                        <p className="mt-0.5 min-w-0 truncate text-xs font-semibold uppercase tracking-[0.06em] text-white/86 sm:mt-1 sm:text-base sm:tracking-[0.08em]">
                          {scopeSummary}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setScopeOpen((current) => !current)}
                        aria-expanded={scopeOpen}
                        aria-controls={executionScopePanelId}
                        className="shrink-0 rounded-lg border border-white/12 bg-white/[0.055] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),inset_0_-10px_18px_rgba(0,0,0,0.24)] transition hover:border-white/24 hover:bg-white/[0.09] focus:outline-none focus:ring-2 focus:ring-white/35 sm:px-3 sm:py-2 sm:text-[11px] sm:tracking-[0.16em]"
                      >
                        {scopeOpen ? "Done" : "Adjust"}
                      </button>
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {scopeOpen ? (
                      <motion.div
                        id={executionScopePanelId}
                        className="overflow-hidden border-t border-white/10 bg-zinc-950/40 px-3 py-3 sm:px-4 sm:py-4"
                        initial={
                          prefersReducedMotion
                            ? { opacity: 0 }
                            : { opacity: 0, height: 0 }
                        }
                        animate={
                          prefersReducedMotion
                            ? { opacity: 1 }
                            : { opacity: 1, height: "auto" }
                        }
                        exit={
                          prefersReducedMotion
                            ? { opacity: 0 }
                            : { opacity: 0, height: 0 }
                        }
                        transition={{
                          duration: prefersReducedMotion ? 0.01 : 0.18,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      >
                        <div className="max-h-[min(58dvh,34rem)] space-y-3 overflow-y-auto pr-1 sm:max-h-[min(62dvh,34rem)] sm:space-y-4">
                          <div className="flex items-center justify-between gap-2 sm:gap-3">
                            <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-200/90 sm:text-[11px] sm:tracking-[0.22em]">
                              Execution Constraints
                            </h3>
                            {hasSelectedScope || hasCustomExecutionFilters ? (
                              <button
                                type="button"
                                onClick={resetExecutionFilters}
                                className="shrink-0 rounded-lg border border-white/12 bg-black/30 px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-300 transition hover:border-white/24 hover:bg-white/[0.07] hover:text-white focus:outline-none focus:ring-2 focus:ring-white/35 sm:px-3 sm:text-[10px] sm:tracking-[0.16em]"
                              >
                                Reset filters
                              </button>
                            ) : null}
                          </div>

                          <section>
                            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-400/85 sm:text-[10px] sm:tracking-[0.22em]">
                              Monuments
                            </p>
                            {monumentOptions.length > 0 ? (
                              <div className="mt-1.5 flex flex-wrap gap-1.5 sm:mt-2 sm:gap-2">
                                {monumentOptions.map((option) => {
                                  const selected = selectedMonumentIds.includes(
                                    option.id
                                  );

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
                                          ? "inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2 py-1.5 text-[11px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] transition focus:outline-none focus:ring-2 focus:ring-white/35 sm:gap-2 sm:px-2.5 sm:py-2 sm:text-xs"
                                          : "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] font-semibold text-zinc-400 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/35 sm:gap-2 sm:px-2.5 sm:py-2 sm:text-xs"
                                      }
                                    >
                                      <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[9px] font-semibold text-zinc-200 sm:size-5 sm:text-[10px]">
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
                              <p className="mt-1.5 rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-xs text-zinc-400 sm:mt-2 sm:px-3 sm:py-2 sm:text-sm">
                                No monuments available.
                              </p>
                            )}
                          </section>

                          <section>
                            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-400/85 sm:text-[10px] sm:tracking-[0.22em]">
                              Skills
                            </p>
                            {skillOptions.length > 0 ? (
                              <div className="mt-1.5 flex flex-wrap gap-1.5 sm:mt-2 sm:gap-2">
                                {skillOptions.map((option) => {
                                  const selected = selectedSkillIds.includes(
                                    option.id
                                  );

                                  return (
                                    <button
                                      key={option.id}
                                      type="button"
                                      aria-pressed={selected}
                                      onClick={() => toggleSkillScope(option.id)}
                                      className={
                                        selected
                                          ? "inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2 py-1.5 text-[11px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] transition focus:outline-none focus:ring-2 focus:ring-white/35 sm:gap-2 sm:px-2.5 sm:py-2 sm:text-xs"
                                          : "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] font-semibold text-zinc-400 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/35 sm:gap-2 sm:px-2.5 sm:py-2 sm:text-xs"
                                      }
                                    >
                                      <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[9px] font-semibold text-zinc-200 sm:size-5 sm:text-[10px]">
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
                              <p className="mt-1.5 rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-xs text-zinc-400 sm:mt-2 sm:px-3 sm:py-2 sm:text-sm">
                                No skills available.
                              </p>
                            )}
                          </section>

                          <section>
                            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-[10px] sm:tracking-[0.22em]">
                              Work Type
                            </p>
                            <div className="mt-1.5 flex flex-wrap gap-1.5 sm:mt-2 sm:gap-2">
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
                                        ? "inline-flex min-h-8 items-center rounded-full border border-white/20 bg-white/10 px-2.5 text-[11px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] transition focus:outline-none focus:ring-2 focus:ring-white/35 sm:min-h-9 sm:px-3 sm:text-xs"
                                        : "inline-flex min-h-8 items-center rounded-full border border-white/10 bg-black/30 px-2.5 text-[11px] font-semibold text-zinc-400 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/35 sm:min-h-9 sm:px-3 sm:text-xs"
                                    }
                                  >
                                    {option.label}
                                  </button>
                                );
                              })}
                            </div>
                          </section>

                          {showHabitTypeSection ? (
                            <section>
                              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-[10px] sm:tracking-[0.22em]">
                                Habit Type
                              </p>
                              <div className="mt-1.5 flex flex-wrap gap-1.5 sm:mt-2 sm:gap-2">
                                {habitTypePillOptions.map((option) => {
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
                                          ? "inline-flex min-h-8 cursor-not-allowed items-center rounded-full border border-white/10 bg-black/20 px-2.5 text-[11px] font-semibold text-zinc-600 opacity-70 sm:min-h-9 sm:px-3 sm:text-xs"
                                          : selected
                                            ? "inline-flex min-h-8 items-center rounded-full border border-white/20 bg-white/10 px-2.5 text-[11px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] transition focus:outline-none focus:ring-2 focus:ring-white/35 sm:min-h-9 sm:px-3 sm:text-xs"
                                            : "inline-flex min-h-8 items-center rounded-full border border-white/10 bg-black/30 px-2.5 text-[11px] font-semibold text-zinc-400 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/35 sm:min-h-9 sm:px-3 sm:text-xs"
                                      }
                                    >
                                      {option.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </section>
                          ) : null}

                          {showTagsSection ? (
                            <section>
                              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-[10px] sm:tracking-[0.22em]">
                                Tags
                              </p>
                              {tagOptions.length > 0 ? (
                                <div className="mt-1.5 flex flex-wrap gap-1.5 sm:mt-2 sm:gap-2">
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
                                            ? "inline-flex min-h-8 items-center rounded-full border border-white/20 bg-white/10 px-2.5 text-[11px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] transition focus:outline-none focus:ring-2 focus:ring-white/35 sm:min-h-9 sm:px-3 sm:text-xs"
                                            : "inline-flex min-h-8 items-center rounded-full border border-white/10 bg-black/30 px-2.5 text-[11px] font-semibold text-zinc-400 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/35 sm:min-h-9 sm:px-3 sm:text-xs"
                                      }
                                    >
                                      {option.name}
                                    </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="mt-1.5 rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-xs text-zinc-400 sm:mt-2 sm:px-3 sm:py-2 sm:text-sm">
                                  No tags available.
                                </p>
                              )}
                            </section>
                          ) : null}

                          {showGoalsSection ? (
                            <section>
                              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-[10px] sm:tracking-[0.22em]">
                                Goals
                              </p>
                              {goalOptions.length > 0 ? (
                                <div className="mt-1.5 space-y-2 sm:mt-2 sm:space-y-3">
                                  {groupedGoalOptions.map((group) => (
                                    <div key={group.key}>
                                      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-500 sm:gap-2 sm:text-[11px]">
                                        {group.icon ? (
                                          <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[9px] text-zinc-200 sm:size-5 sm:text-[10px]">
                                            {group.icon}
                                          </span>
                                        ) : null}
                                        <span className="min-w-0 truncate">
                                          {group.name}
                                        </span>
                                      </div>
                                      <div className="mt-1.5 overflow-x-auto overflow-y-hidden pb-1 sm:mt-2">
                                        <div className="inline-flex max-h-28 flex-col flex-wrap content-start gap-1.5 pr-3 sm:max-h-32 sm:gap-2 sm:pr-4">
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
                                                    ? "inline-flex min-h-8 max-w-[12rem] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/20 bg-white/10 px-2 py-1.5 text-[11px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] transition focus:outline-none focus:ring-2 focus:ring-white/35 sm:min-h-9 sm:max-w-[16rem] sm:gap-2 sm:px-2.5 sm:py-2 sm:text-xs"
                                                    : "inline-flex min-h-8 max-w-[12rem] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] font-semibold text-zinc-400 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/35 sm:min-h-9 sm:max-w-[16rem] sm:gap-2 sm:px-2.5 sm:py-2 sm:text-xs"
                                                }
                                              >
                                                <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[9px] font-semibold text-zinc-200 sm:size-5 sm:text-[10px]">
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
                                <p className="mt-1.5 rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-xs text-zinc-400 sm:mt-2 sm:px-3 sm:py-2 sm:text-sm">
                                  No goals available.
                                </p>
                              )}
                            </section>
                          ) : null}

                          {showCampaignsSection ? (
                            <section>
                              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-[10px] sm:tracking-[0.22em]">
                                Campaigns
                              </p>
                              {campaignOptions.length > 0 ? (
                                <div className="mt-1.5 flex flex-wrap gap-1.5 sm:mt-2 sm:gap-2">
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
                                            ? "inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2 py-1.5 text-[11px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] transition focus:outline-none focus:ring-2 focus:ring-white/35 sm:gap-2 sm:px-2.5 sm:py-2 sm:text-xs"
                                            : "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] font-semibold text-zinc-400 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/35 sm:gap-2 sm:px-2.5 sm:py-2 sm:text-xs"
                                        }
                                      >
                                        <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[9px] font-semibold text-zinc-200 sm:size-5 sm:text-[10px]">
                                          {option.icon ?? "C"}
                                        </span>
                                        <span>{option.name}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="mt-1.5 rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-xs text-zinc-400 sm:mt-2 sm:px-3 sm:py-2 sm:text-sm">
                                  No campaigns available.
                                </p>
                              )}
                            </section>
                          ) : null}

                          {showRoutinesSection ? (
                            <section>
                              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-[10px] sm:tracking-[0.22em]">
                                Routines
                              </p>
                              {routineOptions.length > 0 ? (
                                <div className="mt-1.5 flex flex-wrap gap-1.5 sm:mt-2 sm:gap-2">
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
                                            ? "inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2 py-1.5 text-[11px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] transition focus:outline-none focus:ring-2 focus:ring-white/35 sm:gap-2 sm:px-2.5 sm:py-2 sm:text-xs"
                                            : "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] font-semibold text-zinc-400 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/35 sm:gap-2 sm:px-2.5 sm:py-2 sm:text-xs"
                                        }
                                      >
                                        <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[9px] font-semibold text-zinc-200 sm:size-5 sm:text-[10px]">
                                          {option.icon ?? "R"}
                                        </span>
                                        <span>{option.name}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="mt-1.5 rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-xs text-zinc-400 sm:mt-2 sm:px-3 sm:py-2 sm:text-sm">
                                  No routines available.
                                </p>
                              )}
                            </section>
                          ) : null}
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                  </div>
                ) : null}

                {latestRunResult ? (
                  <section className="mx-auto w-full max-w-3xl rounded-xl border border-white/[0.08] bg-black/45 px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_16px_46px_-36px_rgba(0,0,0,0.95)] backdrop-blur-sm sm:rounded-2xl sm:px-3 sm:py-2.5">
                    {earlierRunResultsCount > 0 ? (
                      <div className="mb-1 sm:mb-1.5">
                        {isRunLogExpanded ? (
                          <div className="mb-1 max-h-28 space-y-1 overflow-y-auto pr-1 sm:mb-1.5 sm:max-h-32">
                            {visibleEarlierRunResults.map((session) => {
                              const completed =
                                session.action === "completed" &&
                                session.actualMs !== null &&
                                session.deltaMs !== null;
                              const over = session.resultTone === "over";
                              const hasEnergy = Boolean(
                                session.energyCode || session.energyLabel
                              );
                              const energyLevel = normalizeFlameLevel(
                                session.energyCode,
                                session.energyLabel
                              );

                              return (
                                <div
                                  key={session.id}
                                  className="flex min-w-0 items-center gap-1.5 rounded-lg border border-white/[0.055] bg-white/[0.018] px-2 py-1 text-[9px] sm:gap-2 sm:px-2.5 sm:py-1.5 sm:text-[10px]"
                                >
                                  {session.icon ? (
                                    <div className="flex size-5 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.035] text-[10px] sm:size-6 sm:text-xs">
                                      <span aria-hidden="true">
                                        {session.icon}
                                      </span>
                                    </div>
                                  ) : null}
                                  <p className="min-w-0 flex-1 truncate font-semibold uppercase tracking-normal text-zinc-400">
                                    {session.title}
                                  </p>
                                  {hasEnergy ? (
                                    <span className="flex h-6 w-4 shrink-0 items-center justify-end overflow-visible sm:h-7 sm:w-5">
                                      <FlameEmber
                                        level={energyLevel}
                                        size="sm"
                                        className="shrink-0 overflow-visible [&_svg]:overflow-visible"
                                      />
                                    </span>
                                  ) : null}
                                  {completed ? (
                                    <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
                                      <span
                                        className={
                                          over
                                            ? "font-bold uppercase tracking-[0.12em] text-red-200/70"
                                            : "font-bold uppercase tracking-[0.12em] text-emerald-200/70"
                                        }
                                      >
                                        COMPLETED
                                      </span>
                                      <span
                                        className={
                                          over
                                            ? "whitespace-nowrap font-mono font-semibold tabular-nums text-red-300/80"
                                            : "whitespace-nowrap font-mono font-semibold tabular-nums text-emerald-300/80"
                                        }
                                      >
                                        {formatSignedTimerMs(session.actualMs)}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="ml-auto shrink-0 font-bold uppercase tracking-[0.12em] text-zinc-500">
                                      SKIPPED
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}

                        <button
                          type="button"
                          onClick={() =>
                            setIsRunLogExpanded((current) => !current)
                          }
                          aria-expanded={isRunLogExpanded}
                          className="inline-flex min-h-6 items-center rounded-lg px-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-white/30 sm:min-h-7 sm:px-2 sm:text-[10px] sm:tracking-[0.12em]"
                        >
                          {earlierRunResultsCount} earlier ·{" "}
                          {isRunLogExpanded ? "See less" : "See more"}
                        </button>
                      </div>
                    ) : null}

                    {(() => {
                      const completed =
                        latestRunResult.action === "completed" &&
                        latestRunResult.actualMs !== null &&
                        latestRunResult.deltaMs !== null;
                      const over = latestRunResult.resultTone === "over";
                      const hasEnergy = Boolean(
                        latestRunResult.energyCode || latestRunResult.energyLabel
                      );
                      const energyLevel = normalizeFlameLevel(
                        latestRunResult.energyCode,
                        latestRunResult.energyLabel
                      );

                      return (
                        <div
                          className={
                            completed
                              ? over
                                ? "rounded-lg border border-red-300/15 bg-red-500/[0.045] px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)] sm:rounded-xl sm:px-3 sm:py-2"
                                : "rounded-lg border border-emerald-300/15 bg-emerald-500/[0.045] px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)] sm:rounded-xl sm:px-3 sm:py-2"
                              : "rounded-lg border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] sm:rounded-xl sm:px-3 sm:py-2"
                          }
                        >
                          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                            {latestRunResult.icon ? (
                              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.045] text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:size-8 sm:text-base">
                                <span aria-hidden="true">
                                  {latestRunResult.icon}
                                </span>
                              </div>
                            ) : null}
                            <p className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-normal text-white/86 sm:text-sm">
                              {latestRunResult.title}
                            </p>
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

                          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1 sm:mt-2 sm:gap-1.5">
                            <span className="inline-flex max-w-full items-center rounded-md border border-white/10 bg-black/35 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-zinc-300/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:px-2 sm:py-1 sm:text-[9px] sm:tracking-[0.12em]">
                              <span className="min-w-0 truncate">
                                {latestRunResult.workTypeLabel}
                              </span>
                            </span>
                            {latestRunResult.relationLabel ? (
                              <span className="inline-flex min-w-0 max-w-[11rem] items-center gap-1 rounded-md border border-white/10 bg-black/25 px-1.5 py-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:max-w-[13rem] sm:gap-1.5 sm:px-2 sm:py-1">
                                {latestRunResult.relationIcon ? (
                                  <span className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[7px] font-semibold text-zinc-200 sm:size-4 sm:text-[8px]">
                                    {latestRunResult.relationIcon}
                                  </span>
                                ) : null}
                                <span className="min-w-0 truncate text-[9px] font-semibold text-zinc-400 sm:text-[10px]">
                                  {latestRunResult.relationLabel}
                                </span>
                              </span>
                            ) : null}
                            {completed ? (
                              <div className="ml-auto flex min-w-0 flex-wrap items-baseline justify-end gap-x-1.5 gap-y-0.5 pl-1 sm:gap-x-2 sm:gap-y-1">
                                <span
                                  className={
                                    over
                                      ? "text-[9px] font-bold uppercase tracking-[0.1em] text-red-100/85 sm:text-[10px] sm:tracking-[0.12em]"
                                      : "text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-100/85 sm:text-[10px] sm:tracking-[0.12em]"
                                  }
                                >
                                  COMPLETED
                                </span>
                                <span className="whitespace-nowrap font-mono text-[10px] font-semibold tabular-nums text-zinc-300 sm:text-[11px]">
                                  {formatSignedTimerMs(
                                    latestRunResult.actualMs
                                  )}{" "}
                                  /{" "}
                                  {formatSignedTimerMs(
                                    latestRunResult.plannedMs
                                  )}
                                </span>
                                <span
                                  className={
                                    over
                                      ? "whitespace-nowrap font-mono text-[9px] font-semibold tabular-nums text-red-300 sm:text-[10px]"
                                      : "whitespace-nowrap font-mono text-[9px] font-semibold tabular-nums text-emerald-300 sm:text-[10px]"
                                  }
                                >
                                  {formatTimerDeltaMs(latestRunResult.deltaMs)}
                                </span>
                              </div>
                            ) : (
                              <span className="ml-auto whitespace-nowrap pl-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-300 sm:text-[11px] sm:tracking-[0.14em]">
                                SKIPPED
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </section>
                ) : null}

                <section className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-[20px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.14),rgba(113,113,122,0.18)_28%,rgba(39,39,42,0.42)_55%,rgba(82,82,91,0.14)_78%,rgba(255,255,255,0.08))] p-px shadow-[inset_0_1px_0_rgba(255,255,255,0.10),inset_0_0_32px_rgba(255,255,255,0.025),0_20px_70px_rgba(0,0,0,0.55)] sm:rounded-[26px]">
                  <div className="relative overflow-hidden rounded-[19px] border border-zinc-500/20 bg-zinc-950/80 px-3 pb-3 pt-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_28px_rgba(255,255,255,0.025),inset_0_-20px_36px_rgba(0,0,0,0.48)] sm:rounded-[25px] sm:px-6 sm:py-5">
                    <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(135deg,rgba(255,255,255,0.065),transparent_24%,rgba(255,255,255,0.022)_74%,rgba(0,0,0,0.32)),radial-gradient(circle_at_18%_0%,rgba(255,255,255,0.045),transparent_34%)]" />
                    <div className="pointer-events-none absolute inset-x-10 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-white/28 to-transparent" />

                  <div className="relative">
                    <div className="grid gap-3 sm:gap-4 md:grid-cols-[minmax(0,1fr)_6.5rem] md:items-start">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-start gap-2.5 sm:gap-4">
                          {currentItemIcon ? (
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.045] text-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.10),inset_0_-12px_18px_rgba(0,0,0,0.28)] sm:size-14 sm:rounded-xl sm:text-2xl">
                              <span aria-hidden="true">{currentItemIcon}</span>
                            </div>
                          ) : null}
                          <div className="flex min-w-0 flex-1 items-start gap-1.5 overflow-visible sm:gap-3">
                            <div className="min-w-0 flex-1">
                              <h2
                                id={titleId}
                                className="min-w-0 max-w-2xl break-words text-[1.35rem] font-semibold uppercase leading-tight tracking-normal text-white min-[390px]:text-[1.55rem] sm:text-4xl"
                              >
                                {cardState.title}
                              </h2>
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
                                : "inline-flex min-w-0 items-center justify-center rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 text-center text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-300/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:justify-start sm:rounded-lg sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.18em]"
                            }
                          >
                            <span className="min-w-0 truncate">
                              {currentItem?.rawTypeLabel ?? cardState.badge}
                            </span>
                          </div>
                          {currentMetaDisplay ? (
                            <div className="inline-flex min-w-0 max-w-[calc(100%-3.5rem)] items-center justify-start gap-1.5 rounded-md border border-white/10 bg-black/25 px-2 py-0.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:max-w-[13rem] sm:gap-2 sm:rounded-lg sm:px-2.5 sm:py-1">
                              <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[9px] font-semibold text-zinc-200 sm:size-5 sm:text-[10px]">
                                {currentMetaDisplay.icon}
                              </span>
                              <span className="min-w-0 truncate text-[10px] font-semibold text-zinc-400 sm:text-[11px]">
                                {currentMetaDisplay.name}
                              </span>
                            </div>
                          ) : null}
                        </div>

                        {scopeEmpty ? (
                          <button
                            type="button"
                            onClick={resetExecutionFilters}
                            className="mt-2 inline-flex min-h-9 items-center justify-center rounded-lg border border-white/12 bg-white/[0.055] px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),inset_0_-10px_18px_rgba(0,0,0,0.24)] transition hover:border-white/24 hover:bg-white/[0.09] focus:outline-none focus:ring-2 focus:ring-white/35 sm:mt-3 sm:min-h-10 sm:px-4 sm:text-[11px] sm:tracking-[0.16em]"
                          >
                            Reset filters
                          </button>
                        ) : null}
                      </div>

                      <div className="hidden justify-self-end md:block">
                        <div className="relative flex size-24 rotate-3 items-center justify-center border border-white/10 bg-[#0b0e11] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-18px_28px_rgba(0,0,0,0.44),0_18px_34px_-26px_rgba(0,0,0,0.9)] [clip-path:polygon(18%_0,88%_7%,100%_55%,74%_100%,8%_90%,0_34%)]">
                          <div className="flex size-14 -rotate-3 items-center justify-center rounded-xl border border-white/10 bg-white/[0.045] text-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-12px_18px_rgba(0,0,0,0.28)]">
                            <span aria-hidden="true">
                              {currentItemIcon ?? displaySource.icon ?? "</>"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {currentItem ? (
                      <div
                        role="group"
                        aria-label="Current item actions"
                        className="mt-3 grid w-full grid-cols-2 gap-2 border-t border-white/[0.08] pt-3 sm:mt-5 sm:max-w-sm sm:pt-4"
                      >
                        <button
                          type="button"
                          aria-label="Skip current item"
                          onClick={handleSkip}
                          className="inline-flex min-h-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.035] px-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-400 transition hover:border-white/18 hover:bg-white/[0.06] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/35 sm:min-h-10 sm:rounded-xl sm:px-3 sm:text-[11px] sm:tracking-[0.14em]"
                        >
                          Skip
                        </button>
                        <button
                          type="button"
                          aria-label="Complete current item"
                          onClick={handleComplete}
                          className="inline-flex min-h-9 items-center justify-center rounded-lg border border-emerald-300/35 bg-emerald-500/12 px-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-100 transition hover:border-emerald-300/50 hover:bg-emerald-500/18 focus:outline-none focus:ring-2 focus:ring-emerald-200/70 sm:min-h-10 sm:rounded-xl sm:px-3 sm:text-[11px] sm:tracking-[0.14em]"
                        >
                          Complete
                        </button>
                      </div>
                    ) : null}

                  </div>
                  </div>
                </section>

                {currentItem ? (
                  <div className="relative overflow-hidden rounded-[18px] border border-zinc-700/50 bg-[linear-gradient(135deg,rgba(255,255,255,0.10),rgba(113,113,122,0.14)_30%,rgba(39,39,42,0.34)_58%,rgba(255,255,255,0.055))] p-px shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_45px_rgba(0,0,0,0.45)] sm:rounded-[22px]">
                    <motion.div
                      layout
                      className="overflow-hidden rounded-[17px] border border-white/[0.06] bg-zinc-950/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),inset_0_0_22px_rgba(255,255,255,0.02),inset_0_-20px_34px_rgba(0,0,0,0.38)] sm:rounded-[21px]"
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
                        {visibleQueueItems.map((item, index) => {
                          const position = activeIndex + index + 1;
                          const selected = index === 0;
                          const previewIcon = itemDisplayIcon(item);
                          const queueEnergyLevel = normalizeFlameLevel(
                            item.energyCode,
                            item.energyLabel
                          );

                          return (
                            <div
                              key={item.id}
                              className={
                                selected
                                  ? "relative flex min-w-0 items-center gap-2 border border-white/10 bg-white/[0.035] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_18px_rgba(255,255,255,0.018),inset_0_-12px_20px_rgba(0,0,0,0.18)] sm:gap-3 sm:px-4 sm:py-4"
                                  : isQueueExpanded
                                    ? "flex min-w-0 items-center gap-2 border-t border-white/[0.10] px-3 py-2.5 opacity-60 sm:gap-3 sm:px-4 sm:py-3.5"
                                    : "flex min-w-0 items-center gap-2 border-t border-white/[0.10] px-3 py-2.5 opacity-60 sm:gap-3 sm:border-l sm:border-t-0 sm:px-4 sm:py-4"
                              }
                            >
                              <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-white/12 bg-white/[0.045] text-[11px] font-semibold text-white/78 sm:size-8 sm:rounded-lg sm:text-xs">
                                {position}
                              </div>
                              {previewIcon ? (
                                <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-sm sm:size-8 sm:rounded-lg sm:text-base">
                                  <span aria-hidden="true">{previewIcon}</span>
                                </div>
                              ) : null}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold uppercase tracking-normal text-white/82 sm:text-sm">
                                  {item.title}
                                </p>
                                <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/38 sm:mt-1 sm:text-[10px] sm:tracking-[0.18em]">
                                  {item.rawTypeLabel ?? item.kind}
                                </p>
                              </div>
                              <div className="ml-auto flex h-7 w-5 shrink-0 items-center justify-end overflow-visible sm:h-9 sm:w-7">
                                <FlameEmber
                                  level={queueEnergyLevel}
                                  size="sm"
                                  className="shrink-0 overflow-visible [&_svg]:overflow-visible"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </motion.div>

                      {hasMoreQueueItems ? (
                        <div className="border-t border-white/[0.10] bg-black/25 px-2.5 py-2 sm:px-3 sm:py-3">
                          <button
                            type="button"
                            onClick={() =>
                              setIsQueueExpanded((current) => !current)
                            }
                            aria-expanded={isQueueExpanded}
                            aria-controls={queueListId}
                            className="inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-300 transition hover:border-white/18 hover:bg-white/[0.06] hover:text-white focus:outline-none focus:ring-2 focus:ring-white/35 sm:min-h-10 sm:px-4 sm:text-[11px] sm:tracking-[0.16em]"
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

              <div className="mt-auto rounded-[18px] border border-white/12 bg-[#080a0d] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),inset_0_-18px_32px_rgba(0,0,0,0.42),0_22px_64px_-50px_rgba(0,0,0,0.85)] sm:rounded-[22px] sm:p-4">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-stretch gap-2.5 sm:grid-cols-[minmax(12rem,18rem)_1fr] sm:items-center sm:gap-4">
                  <div className="flex min-w-0 flex-col justify-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.025] px-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:border-0 sm:border-r sm:bg-transparent sm:px-0 sm:py-0 sm:pr-5">
                    <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
                      <div className="size-6 shrink-0 rounded-full border-[3px] border-white/[0.18] border-t-white/55 sm:size-11 sm:border-[6px]" />
                      <p className="min-w-0 truncate text-[8px] font-semibold uppercase tracking-[0.12em] text-zinc-300/80 sm:text-[11px] sm:tracking-[0.28em]">
                        {timerLabel}
                      </p>
                    </div>
                    <p className="shrink-0 whitespace-nowrap font-mono text-[1.35rem] font-semibold leading-none tabular-nums tracking-normal text-white min-[390px]:text-[1.48rem] sm:text-[2.15rem] sm:tracking-tight md:text-[2.5rem]">
                      {timerDisplay}
                    </p>
                  </div>

                  <div className="flex min-w-0">
                    <button
                      type="button"
                      onClick={handlePrimaryAction}
                      className={
                        isRunning
                          ? "inline-flex min-h-12 w-full flex-1 items-center justify-center gap-2 rounded-xl border border-white/12 bg-zinc-900/90 px-5 text-sm font-semibold uppercase tracking-[0.12em] text-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.09),inset_0_-4px_0_rgba(0,0,0,0.38),0_18px_34px_-28px_rgba(0,0,0,0.95)] transition hover:bg-zinc-800/90 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/35 focus:ring-offset-2 focus:ring-offset-zinc-950 sm:min-h-16 sm:gap-3 sm:rounded-[16px] sm:px-7 sm:text-base sm:tracking-[0.18em]"
                          : "inline-flex min-h-12 w-full flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-300/45 bg-[linear-gradient(180deg,rgba(16,185,129,0.74),rgba(5,150,105,0.82)_48%,rgba(6,78,59,0.98))] px-5 text-sm font-semibold uppercase tracking-[0.14em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.32),inset_0_-5px_0_rgba(4,120,87,0.88),0_20px_42px_-30px_rgba(16,185,129,0.95)] transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:ring-offset-2 focus:ring-offset-zinc-950 sm:min-h-16 sm:gap-3 sm:rounded-[16px] sm:px-7 sm:text-base sm:tracking-[0.22em]"
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
