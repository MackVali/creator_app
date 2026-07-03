import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "../../../lib/supabase";
import type { Database } from "../../../types/supabase";
import {
  addDaysInTimeZone,
  formatDateKeyInTimeZone,
  GLOBAL_DAY_START_HOUR,
  normalizeTimeZone,
  setTimeInTimeZone,
  startOfDayInTimeZone,
  weekdayInTimeZone,
} from "./timezone";
import { ENERGY, type Energy } from "./config";
import type { TaskLite, ProjectLite } from "./weight";
import {
  normalizeGoalStatus,
  type GoalStatus,
} from "../goals/status";
import { log } from "@/lib/utils/logGate";
import { findRedundantStandaloneRoadmapItemIds } from "@/lib/queries/roadmap-reconciliation";

const PRIORITY_VALUES = [
  "NO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
  "ULTRA-CRITICAL",
] as const;

type PriorityCode = (typeof PRIORITY_VALUES)[number];

const PRIORITY_SET = new Set<string>(PRIORITY_VALUES);
const ENERGY_SET = new Set<Energy>(ENERGY.LIST);
const DIGIT_PATTERN = /^\d+$/;

type PriorityEnergyLookups = {
  priority: Record<string, string>;
  energy: Record<string, string>;
};

type LookupCacheState = {
  expiresAt: number;
  data: PriorityEnergyLookups;
};

const LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;
let lookupCache: LookupCacheState | null = null;

const USE_DAY_TYPES_FLAG = process.env.SCHEDULER_USE_DAY_TYPES === "true";
const WINDOWS_DEBUG_LOGGING = process.env.SCHEDULER_DEBUG_WINDOWS === "true";

export async function fetchPriorityEnergyLookups(
  client: Client
): Promise<PriorityEnergyLookups> {
  const now = Date.now();
  if (lookupCache && lookupCache.expiresAt > now) {
    return lookupCache.data;
  }

  const [priorityRes, energyRes] = await Promise.all([
    client.from("priority").select("id, name"),
    client.from("energy").select("id, name"),
  ]);

  const priority: Record<string, string> = {};
  if (priorityRes.error) {
    log("warn", "Failed to load priority lookup values", priorityRes.error);
  } else {
    for (const row of (priorityRes.data ?? []) as {
      id?: number | null;
      name?: string | null;
    }[]) {
      if (row?.id == null || typeof row.name !== "string") continue;
      priority[String(row.id)] = row.name.toUpperCase();
    }
  }

  const energy: Record<string, string> = {};
  if (energyRes.error) {
    log("warn", "Failed to load energy lookup values", energyRes.error);
  } else {
    for (const row of (energyRes.data ?? []) as {
      id?: number | null;
      name?: string | null;
    }[]) {
      if (row?.id == null || typeof row.name !== "string") continue;
      energy[String(row.id)] = row.name.toUpperCase();
    }
  }

  lookupCache = {
    expiresAt: now + LOOKUP_CACHE_TTL_MS,
    data: { priority, energy },
  };
  return lookupCache.data;
}

function normalizePriorityValue(value?: string | null): PriorityCode {
  if (typeof value !== "string") return "NO";
  const normalized = value.trim().toUpperCase();
  return PRIORITY_SET.has(normalized) ? (normalized as PriorityCode) : "NO";
}

function normalizeEnergyValue(value?: string | null): Energy {
  if (typeof value !== "string") return "NO";
  const normalized = value.trim().toUpperCase();
  return ENERGY_SET.has(normalized as Energy) ? (normalized as Energy) : "NO";
}

function resolveEnergyLabel(
  value: string | number | null | undefined,
  lookup: Record<string, string>
): Energy {
  if (typeof value === "number" && Number.isFinite(value)) {
    const direct = lookup[String(value)];
    if (direct) return normalizeEnergyValue(direct);
    const fallback = energyLabelFromIndex(value);
    return fallback ?? "NO";
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "NO";
    const lookupDirect = lookup[trimmed];
    if (lookupDirect) return normalizeEnergyValue(lookupDirect);
    if (DIGIT_PATTERN.test(trimmed)) {
      const fallback = energyLabelFromIndex(Number.parseInt(trimmed, 10));
      return fallback ?? "NO";
    }
    return normalizeEnergyValue(trimmed);
  }
  return "NO";
}

function resolvePriorityLabel(
  value: string | number | null | undefined,
  lookup: Record<string, string>
): PriorityCode {
  if (typeof value === "number" && Number.isFinite(value)) {
    const direct = lookup[String(value)];
    if (direct) return normalizePriorityValue(direct);
    const fallback = priorityLabelFromIndex(value);
    return fallback ?? "NO";
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "NO";
    const lookupDirect = lookup[trimmed];
    if (lookupDirect) return normalizePriorityValue(lookupDirect);
    if (DIGIT_PATTERN.test(trimmed)) {
      const fallback = priorityLabelFromIndex(Number.parseInt(trimmed, 10));
      return fallback ?? "NO";
    }
    return normalizePriorityValue(trimmed);
  }
  return "NO";
}

function energyLabelFromIndex(value: number | string): Energy | null {
  const numeric =
    typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) return null;
  const label = ENERGY.LIST[numeric - 1];
  return label ?? null;
}

function priorityLabelFromIndex(value: number | string): PriorityCode | null {
  const numeric =
    typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) return null;
  const label = PRIORITY_VALUES[numeric - 1];
  return label ?? null;
}

function normalizeStageValue(
  value?: string | null,
  fallback: string = "BUILD"
): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toUpperCase() : fallback;
}

export type WindowKind = "DEFAULT" | "BREAK" | "PRACTICE" | "MEAL";

const WINDOW_KIND_SET = new Set<WindowKind>([
  "DEFAULT",
  "BREAK",
  "PRACTICE",
  "MEAL",
]);

export type WindowSkillDisplay = {
  id: string;
  icon: string | null;
  monumentId?: string | null;
  monument_id?: string | null;
  name?: string | null;
};

export type WindowMonumentDisplay = {
  id: string;
  emoji: string | null;
  title?: string | null;
};

export type WindowLite = {
  id: string;
  label: string;
  energy: string;
  start_local: string;
  end_local: string;
  days: number[] | null;
  location_context_id: string | null;
  location_context_value: string | null;
  location_context_name: string | null;
  fromPrevDay?: boolean;
  window_kind: WindowKind;
  dayTypeTimeBlockId?: string | null;
  dayTypeStartUtcMs?: number | null;
  dayTypeEndUtcMs?: number | null;
  isOverlayCandidate?: boolean;
  overlayWindowId?: string | null;
  allowAllInstanceTypes?: boolean;
  allowAllHabitTypes?: boolean;
  allowAllSkills?: boolean;
  allowAllMonuments?: boolean;
  allowedInstanceTypes?: string[] | null;
  allowedHabitTypes?: string[] | null;
  allowedSkillIds?: string[] | null;
  allowedMonumentIds?: string[] | null;
  allowedInstanceTypesSet?: Set<string>;
  allowedHabitTypesSet?: Set<string>;
  allowedSkillIdsSet?: Set<string>;
  allowedMonumentIdsSet?: Set<string>;
  allowedSkillDisplays?: WindowSkillDisplay[];
  allowedMonumentDisplays?: WindowMonumentDisplay[];
};

export type RepoWindow = WindowLite;

type WindowRecord = {
  id: string;
  label?: string | null;
  energy?: string | null;
  start_local?: string | null;
  end_local?: string | null;
  days?: number[] | null;
  location_context_id?: string | null;
  window_kind?: string | null;
  day_type_time_block_id?: string | null;
  allow_all_habit_types?: boolean | null;
  allow_all_skills?: boolean | null;
  allow_all_monuments?: boolean | null;
  allowed_habit_types?: string[] | null;
  allowed_skill_ids?: string[] | null;
  allowed_monument_ids?: string[] | null;
  location_context?: {
    id?: string | null;
    value?: string | null;
    label?: string | null;
  } | null;
};

type TaskRecord = {
  id: string;
  name?: string | null;
  priority?: string | number | null;
  energy?: string | number | null;
  stage?: string | null;
  duration_min?: number | null;
  goal_id?: string | null;
  project_id?: string | null;
  skill_id?: string | null;
  skills?: {
    icon?: string | null;
    monument_id?: string | null;
  } | null;
};

function normalizeWindowKind(value?: string | null): WindowKind {
  if (!value) return "DEFAULT";
  const normalized = value.toUpperCase().trim();
  return WINDOW_KIND_SET.has(normalized as WindowKind)
    ? (normalized as WindowKind)
    : "DEFAULT";
}

function normalizeStrings(items?: string[] | null): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((entry) => String(entry ?? "").trim())
    .filter((entry) => entry.length > 0);
}

function buildHabitTypeSet(items: string[]): Set<string> | undefined {
  if (items.length === 0) return undefined;
  const set = new Set<string>();
  for (const entry of items) {
    const upper = entry.toUpperCase();
    if (upper) set.add(upper);
  }
  return set.size ? set : undefined;
}

function buildIdSet(items: string[]): Set<string> | undefined {
  if (items.length === 0) return undefined;
  const set = new Set<string>();
  for (const entry of items) {
    if (entry) set.add(entry);
  }
  return set.size ? set : undefined;
}

function uniqueConstraintIds(
  input?: string[] | null | Set<string>
): string[] {
  if (!input) return [];
  const values = input instanceof Set ? Array.from(input) : input;
  return Array.from(
    new Set(
      values
        .map((entry) => String(entry ?? "").trim())
        .filter((entry) => entry.length > 0)
    )
  );
}

function collectWindowConstraintIds(
  windows: WindowLite[],
  key: "allowedSkillIds" | "allowedMonumentIds"
): string[] {
  return Array.from(
    new Set(windows.flatMap((window) => uniqueConstraintIds(window[key])))
  );
}

type SkillDisplayRow = {
  id: string | null;
  icon: string | null;
  monument_id?: string | null;
};

type MonumentDisplayRow = {
  id: string | null;
  emoji: string | null;
};

async function fetchConstraintDisplayMaps(
  supabase: Client,
  skillIds: string[],
  monumentIds: string[]
): Promise<{
  skills: Map<string, WindowSkillDisplay>;
  monuments: Map<string, WindowMonumentDisplay>;
}> {
  const uniqueSkillIds = uniqueConstraintIds(skillIds);
  const uniqueMonumentIds = uniqueConstraintIds(monumentIds);

  const [skillDisplays, monumentDisplays] = await Promise.all([
    uniqueSkillIds.length > 0
      ? supabase
          .from("skills")
          .select("id, icon, monument_id")
          .in("id", uniqueSkillIds)
      : Promise.resolve({ data: [] as SkillDisplayRow[] | null, error: null }),
    uniqueMonumentIds.length > 0
      ? supabase
          .from("monuments")
          .select("id, emoji")
          .in("id", uniqueMonumentIds)
      : Promise.resolve({
          data: [] as MonumentDisplayRow[] | null,
          error: null,
        }),
  ]);

  if (skillDisplays.error) throw skillDisplays.error;
  if (monumentDisplays.error) throw monumentDisplays.error;

  const skills = new Map<string, WindowSkillDisplay>();
  for (const row of (skillDisplays.data ?? []) as SkillDisplayRow[]) {
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id) continue;
    const monumentId =
      typeof row.monument_id === "string" && row.monument_id.trim().length > 0
        ? row.monument_id.trim()
        : null;
    skills.set(id, { id, icon: row.icon ?? null, monumentId });
  }

  const monuments = new Map<string, WindowMonumentDisplay>();
  for (const row of (monumentDisplays.data ?? []) as MonumentDisplayRow[]) {
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id) continue;
    monuments.set(id, { id, emoji: row.emoji ?? null });
  }

  return { skills, monuments };
}

function attachConstraintDisplays(
  windows: WindowLite[],
  displays: {
    skills: Map<string, WindowSkillDisplay>;
    monuments: Map<string, WindowMonumentDisplay>;
  }
): WindowLite[] {
  return windows.map((window) => {
    const skillDisplays = uniqueConstraintIds(window.allowedSkillIds)
      .map((id) => displays.skills.get(id))
      .filter((display): display is WindowSkillDisplay => Boolean(display));
    const monumentDisplays = uniqueConstraintIds(window.allowedMonumentIds)
      .map((id) => displays.monuments.get(id))
      .filter((display): display is WindowMonumentDisplay =>
        Boolean(display)
      );

    return {
      ...window,
      allowedSkillDisplays: skillDisplays.length > 0 ? skillDisplays : undefined,
      allowedMonumentDisplays:
        monumentDisplays.length > 0 ? monumentDisplays : undefined,
    };
  });
}

async function enrichWindowConstraintDisplays(
  supabase: Client,
  windows: WindowLite[]
): Promise<WindowLite[]> {
  const skillIds = collectWindowConstraintIds(windows, "allowedSkillIds");
  const monumentIds = collectWindowConstraintIds(windows, "allowedMonumentIds");
  if (skillIds.length === 0 && monumentIds.length === 0) return windows;

  const displays = await fetchConstraintDisplayMaps(
    supabase,
    skillIds,
    monumentIds
  );
  return attachConstraintDisplays(windows, displays);
}

function mapWindowRecord(record: WindowRecord): WindowLite {
  const hasLocationContextId =
    typeof record.location_context_id === "string" &&
    record.location_context_id.trim().length > 0;
  const value =
    hasLocationContextId && record.location_context?.value
      ? String(record.location_context.value).toUpperCase().trim()
      : null;
  const label = record.location_context?.label ?? (value ? value : null);
  const allowedHabitTypes = normalizeStrings(record.allowed_habit_types);
  const allowedSkillIds = normalizeStrings(record.allowed_skill_ids);
  const allowedMonumentIds = normalizeStrings(record.allowed_monument_ids);

  return {
    id: record.id,
    label: record.label ?? "",
    energy: record.energy ?? "",
    start_local: record.start_local ?? "00:00",
    end_local: record.end_local ?? "00:00",
    days: record.days ?? null,
    location_context_id: record.location_context_id ?? null,
    location_context_value: value,
    location_context_name: label,
    window_kind: normalizeWindowKind(record.window_kind),
    dayTypeTimeBlockId: record.day_type_time_block_id ?? null,
    allowAllHabitTypes: record.allow_all_habit_types === true,
    allowAllSkills: record.allow_all_skills === true,
    allowAllMonuments: record.allow_all_monuments === true,
    allowedHabitTypes,
    allowedSkillIds,
    allowedMonumentIds,
    allowedHabitTypesSet: buildHabitTypeSet(allowedHabitTypes),
    allowedSkillIdsSet: buildIdSet(allowedSkillIds),
    allowedMonumentIdsSet: buildIdSet(allowedMonumentIds),
  };
}

type Client = SupabaseClient<Database>;

function ensureClient(client?: Client): Client {
  if (client) return client as Client;
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error("Supabase client not available");
  return supabase as Client;
}

export async function fetchReadyTasks(client?: Client): Promise<TaskLite[]> {
  const supabase = ensureClient(client);
  const columns = [
    "id",
    "name",
    "priority",
    "stage",
    "duration_min",
    "energy",
    "goal_id",
    "project_id",
    "skill_id",
    "skills(icon, monument_id)",
  ].join(", ");

  const [lookups, { data, error }] = await Promise.all([
    fetchPriorityEnergyLookups(supabase),
    supabase.from("tasks").select(columns),
  ]);

  if (error) throw error;
  return ((data ?? []) as TaskRecord[]).map((record) => {
    const priorityName = resolvePriorityLabel(
      record.priority,
      lookups.priority
    );
    const energyName = resolveEnergyLabel(record.energy, lookups.energy);
    const duration = Number(record.duration_min ?? 0);
    const safeDuration = Number.isFinite(duration) ? duration : 0;

    return {
      id: record.id,
      name: record.name ?? "",
      priority: normalizePriorityValue(priorityName),
      stage: normalizeStageValue(record.stage, "PREPARE"),
      duration_min: safeDuration,
      energy: normalizeEnergyValue(energyName),
      goal_id: record.goal_id ?? null,
      project_id: record.project_id ?? null,
      skill_id: record.skill_id ?? null,
      skill_icon: record.skills?.icon ?? null,
      skill_monument_id: record.skills?.monument_id ?? null,
    };
  });
}

export async function updateTaskStage(
  taskId: string,
  stage: TaskLite["stage"],
  client?: Client
) {
  const supabase = ensureClient(client);
  return await supabase.from("tasks").update({ stage }).eq("id", taskId);
}

export async function updateMyListTaskCompletion(
  taskId: string,
  stage: TaskLite["stage"],
  completedAt: string | null,
  client?: Client
) {
  const supabase = ensureClient(client);
  return await supabase
    .from("tasks")
    .update({ stage, completed_at: completedAt } as never)
    .eq("id", taskId);
}

export async function updateTaskSkill(
  taskId: string,
  skillId: string | null,
  client?: Client
) {
  const supabase = ensureClient(client);
  return await supabase
    .from("tasks")
    .update({ skill_id: skillId } as never)
    .eq("id", taskId);
}

const crossesMidnight = (w: WindowLite) => {
  const [sh = 0, sm = 0] = w.start_local.split(":").map(Number);
  const [eh = 0, em = 0] = w.end_local.split(":").map(Number);
  return eh < sh || (eh === sh && em < sm);
};

const timeToMinutes = (value?: string | null): number => {
  const [h = 0, m = 0] = String(value ?? "0:0")
    .split(":")
    .map(Number);
  const safeH = Number.isFinite(h) ? h : 0;
  const safeM = Number.isFinite(m) ? m : 0;
  return safeH * 60 + safeM;
};

const overlapsPrevCross = (base: WindowLite, prev: WindowLite): boolean => {
  const prevEnd = timeToMinutes(prev.end_local);
  if (prevEnd <= 0) return false;
  const baseStart = timeToMinutes(base.start_local);
  let baseEnd = timeToMinutes(base.end_local);
  if (baseEnd <= baseStart) {
    baseEnd = 24 * 60;
  }
  return baseStart < prevEnd && baseEnd > 0;
};

const sortWindowsByStartThenId = (
  a: Pick<WindowLite, "start_local" | "id">,
  b: Pick<WindowLite, "start_local" | "id">
) => {
  const [ah = 0, am = 0] = a.start_local.split(":").map(Number);
  const [bh = 0, bm = 0] = b.start_local.split(":").map(Number);
  if (ah !== bh) return ah - bh;
  if (am !== bm) return am - bm;
  return a.id.localeCompare(b.id);
};

function parseLocalTimeParts(value?: string | null) {
  const [hours = 0, minutes = 0] = String(value ?? "00:00")
    .split(":")
    .map(Number);
  return {
    hours: Number.isFinite(hours) ? hours : 0,
    minutes: Number.isFinite(minutes) ? minutes : 0,
  };
}

function buildWindowsForDateFromSnapshot(
  snapshot: WindowLite[],
  date: Date,
  timeZone: string
): WindowLite[] {
  const dayStartLocal = startOfDayInTimeZone(date, timeZone);
  const weekday = weekdayInTimeZone(dayStartLocal, timeZone);
  const nextDayStartLocal = addDaysInTimeZone(dayStartLocal, 1, timeZone);

  const applicableWindows = [...(snapshot ?? [])]
    .filter((window) => {
      const days = window.days ?? null;
      return days === null || (days?.includes(weekday) ?? false);
    })
    .sort(sortWindowsByStartThenId);

  const mapped = applicableWindows.map((window) => {
    const startMinutes = timeToMinutes(window.start_local);
    const endMinutes = timeToMinutes(window.end_local);
    const { hours: startHours, minutes: startMinutesPart } =
      parseLocalTimeParts(window.start_local);
    const { hours: endHours, minutes: endMinutesPart } =
      parseLocalTimeParts(window.end_local);

    const startBase =
      startMinutes < GLOBAL_DAY_START_HOUR * 60
        ? nextDayStartLocal
        : dayStartLocal;
    const startDate = setTimeInTimeZone(
      startBase,
      timeZone,
      startHours,
      startMinutesPart
    );

    const endBase =
      endMinutes <= startMinutes
        ? addDaysInTimeZone(startBase, 1, timeZone)
        : startBase;
    const endDate = setTimeInTimeZone(
      endBase,
      timeZone,
      endHours,
      endMinutesPart
    );

    return {
      ...window,
      fromPrevDay: false,
      dayTypeStartUtcMs: startDate.getTime(),
      dayTypeEndUtcMs: endDate.getTime(),
    } as WindowLite;
  });

  return mapped.sort((a, b) => {
    const aStart = a.dayTypeStartUtcMs ?? 0;
    const bStart = b.dayTypeStartUtcMs ?? 0;
    if (aStart !== bStart) return aStart - bStart;
    return a.id.localeCompare(b.id);
  });
}

export function buildWindowsForDateFromDayTypeBlocks(
  snapshot: WindowLite[],
  date: Date,
  timeZone: string
): WindowLite[] {
  const ordered = [...snapshot].sort(sortWindowsByStartThenId);
  return buildWindowsForDateFromSnapshot(ordered, date, timeZone);
}

export type FetchWindowsParityPayload = {
  mismatch: boolean;
  context?: string | null;
};

export type FetchWindowsParityOptions = {
  enabled?: boolean;
  onCheck?: (payload: FetchWindowsParityPayload) => void;
};

export type FetchWindowsOptions = {
  userId?: string | null;
  snapshot?: WindowLite[];
  useDayTypes?: boolean;
  parity?: FetchWindowsParityOptions | null;
};

async function fetchWindowsForDateLegacy(
  date: Date,
  client: Client | undefined,
  timeZone: string,
  options?: FetchWindowsOptions
): Promise<WindowLite[]> {
  const supabase = ensureClient(client);

  const weekday = weekdayInTimeZone(date, timeZone);
  const prevWeekday = (weekday + 6) % 7;
  const contextJoin = "location_context:location_contexts(id, value, label)";
  const columns = `id, label, energy, start_local, end_local, days, location_context_id, window_kind, day_type_time_block_id, allow_all_habit_types, allow_all_skills, allow_all_monuments, allowed_habit_types, allowed_skill_ids, allowed_monument_ids, ${contextJoin}`;

  const userId = options?.userId ?? null;
  const selectWindows = () => supabase.from("windows").select(columns);
  const applyUserFilter = <
    T extends { eq: (column: string, value: string) => T },
  >(
    builder: T
  ): T => {
    if (!userId) return builder;
    return builder.eq("user_id", userId);
  };

  const [
    { data: today, error: errToday },
    { data: prev, error: errPrev },
    { data: recurring, error: errRecurring },
  ] = await Promise.all([
    applyUserFilter(selectWindows()).contains("days", [weekday]),
    applyUserFilter(selectWindows()).contains("days", [prevWeekday]),
    applyUserFilter(selectWindows()).is("days", null),
  ]);

  if (errToday || errPrev || errRecurring) {
    throw errToday ?? errPrev ?? errRecurring;
  }

  const mapWindows = (entries: unknown): WindowLite[] =>
    ((entries ?? []) as WindowRecord[]).map(mapWindowRecord);

  const todayWindows = mapWindows(today);
  const prevWindows = mapWindows(prev);
  const alwaysWindows = mapWindows(recurring);

  const base = new Map<string, WindowLite>();
  for (const window of [...todayWindows, ...alwaysWindows]) {
    if (!base.has(window.id)) {
      base.set(window.id, window);
    }
  }

  const baseWindows = [...base.values()];
  const prevCross = [...prevWindows, ...alwaysWindows]
    .filter(crossesMidnight)
    .map((w) => ({ ...w, fromPrevDay: true }))
    .filter(
      (prevWindow) =>
        !baseWindows.some((baseWindow) =>
          overlapsPrevCross(baseWindow, prevWindow)
        )
    );

  return enrichWindowConstraintDisplays(supabase, [...baseWindows, ...prevCross]);
}

// These tables may not be present in generated types yet; use structural fallbacks during migration rollout.
type DayTypeAssignmentFallbackRow = {
  day_type_id?: string | null;
};
type DayTypeFallbackRow = {
  id?: string | null;
  name?: string | null;
  days?: unknown[] | null;
  created_at?: string | null;
};
type TimeBlockFallbackRow = {
  id?: string | null;
  label?: string | null;
  start_local?: string | null;
  end_local?: string | null;
  days?: number[] | null;
};
type DayTypeTimeBlockFallbackRow = {
  id?: string | null;
  day_type_id?: string | null;
  energy?: string | null;
  block_type?: string | null;
  location_context_id?: string | null;
  time_blocks?: TimeBlockFallbackRow | null;
  allow_all_habit_types?: boolean | null;
  allow_all_skills?: boolean | null;
  allow_all_monuments?: boolean | null;
};
type DayTypeAssignmentRow = Database["public"]["Tables"] extends {
  day_type_assignments: { Row: infer R };
}
  ? R
  : DayTypeAssignmentFallbackRow;
type DayTypeRow = Database["public"]["Tables"] extends {
  day_types: { Row: infer R };
}
  ? R
  : DayTypeFallbackRow;
type DayTypeTimeBlockRow = Database["public"]["Tables"] extends {
  day_type_time_blocks: { Row: infer R };
}
  ? R
  : DayTypeTimeBlockFallbackRow;
type TimeBlockRow = Database["public"]["Tables"] extends {
  time_blocks: { Row: infer R };
}
  ? R
  : TimeBlockFallbackRow;

export const normalizeBlockType = (value?: string | null): WindowKind => {
  const raw = typeof value === "string" ? value.toUpperCase().trim() : "FOCUS";
  if (raw === "BREAK") return "BREAK";
  if (raw === "MEAL") return "MEAL";
  if (raw === "PRACTICE") return "PRACTICE";
  return "DEFAULT";
};

export async function getWindowsForDate_v2(
  date: Date,
  client?: Client,
  timeZone?: string | null,
  options?: FetchWindowsOptions
): Promise<WindowLite[]> {
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  const userId = options?.userId ?? null;
  if (!userId) return [];
  const supabase = ensureClient(client);

  const anchor = startOfDayInTimeZone(date, normalizedTimeZone);
  const dateKey = formatDateKeyInTimeZone(anchor, normalizedTimeZone);
  const weekday = weekdayInTimeZone(anchor, normalizedTimeZone);
  const weekdayKey = String(weekday);

  const { data: assignmentRow, error: assignmentError } = await supabase
    .from("day_type_assignments")
    .select("day_type_id")
    .eq("user_id", userId)
    .eq("date_key", dateKey)
    .maybeSingle();

  if (assignmentError) throw assignmentError;

  let dayTypeId =
    (assignmentRow as Pick<DayTypeAssignmentRow, "day_type_id"> | null)
    ?.day_type_id ?? null;

  let dayTypeName: string | null = null;
  let dayTypeMatchSource: "assignment" | "weekday" | "fallback" | "none" =
    dayTypeId ? "assignment" : "none";

  if (!dayTypeId) {
    const { data: defaults, error: defaultsError } = await supabase
      .from("day_types")
      .select("id, name, days, is_default, created_at")
      .eq("user_id", userId)
      .eq("is_default", true);
    if (defaultsError) throw defaultsError;
    const matchesWeekday = (defaults ?? []).find((row) => {
      const days = (row as DayTypeRow).days ?? null;
      if (!Array.isArray(days)) return false;
      return days.some((day) => String(day) === weekdayKey);
    });
    if (matchesWeekday?.id) {
      dayTypeId = matchesWeekday.id;
      dayTypeName = (matchesWeekday as DayTypeRow).name ?? null;
      dayTypeMatchSource = "weekday";
    } else if (defaults && defaults.length > 0) {
      const sortedDefaults = [...defaults].sort((a, b) => {
        const aCreated = (a as DayTypeRow).created_at ?? "";
        const bCreated = (b as DayTypeRow).created_at ?? "";
        return String(aCreated).localeCompare(String(bCreated));
      });
      const fallbackRow = sortedDefaults[0] as DayTypeRow;
      dayTypeId = fallbackRow.id ?? null;
      dayTypeName = fallbackRow.name ?? null;
      dayTypeMatchSource = "fallback";
    }
  }

  if (!dayTypeId) return [];

  const contextJoin = "location_context:location_contexts(id, value, label)";
  const columns = `id, day_type_id, energy, block_type, location_context_id, time_block_id, allow_all_habit_types, allow_all_skills, allow_all_monuments, time_blocks ( id, label, start_local, end_local, days ), ${contextJoin}`;
  const { data: linkRows, error: linksError } = await supabase
    .from("day_type_time_blocks")
    .select(columns)
    .eq("day_type_id", dayTypeId)
    .eq("user_id", userId);

  if (linksError) throw linksError;

  const dttbIds = (linkRows ?? [])
    .map((row) => (row as { id?: string | null }).id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  type HabitWhitelistRow = {
    day_type_time_block_id: string | null;
    habit_type: string | null;
  };
  type SkillWhitelistRow = {
    day_type_time_block_id: string | null;
    skill_id: string | null;
  };
  type MonumentWhitelistRow = {
    day_type_time_block_id: string | null;
    monument_id: string | null;
  };

  const [habitWhitelist, skillWhitelist, monumentWhitelist] =
    dttbIds.length > 0
      ? await Promise.all([
          supabase
            .from("day_type_time_block_allowed_habit_types")
            .select("day_type_time_block_id, habit_type")
            .in("day_type_time_block_id", dttbIds),
          supabase
            .from("day_type_time_block_allowed_skills")
            .select("day_type_time_block_id, skill_id")
            .in("day_type_time_block_id", dttbIds),
          supabase
            .from("day_type_time_block_allowed_monuments")
            .select("day_type_time_block_id, monument_id")
            .in("day_type_time_block_id", dttbIds),
        ])
      : [
          { data: [] as HabitWhitelistRow[] | null, error: null },
          { data: [] as SkillWhitelistRow[] | null, error: null },
          { data: [] as MonumentWhitelistRow[] | null, error: null },
        ];

  if (habitWhitelist.error) throw habitWhitelist.error;
  if (skillWhitelist.error) throw skillWhitelist.error;
  if (monumentWhitelist.error) throw monumentWhitelist.error;

  const habitAllowMap = new Map<string, Set<string>>();
  for (const row of (habitWhitelist.data ?? []) as HabitWhitelistRow[]) {
    const key = row.day_type_time_block_id ?? "";
    if (!key || !row.habit_type) continue;
    const normalized = row.habit_type.toUpperCase().trim();
    if (!normalized) continue;
    const existing = habitAllowMap.get(key) ?? new Set<string>();
    existing.add(normalized);
    habitAllowMap.set(key, existing);
  }

  const skillAllowMap = new Map<string, Set<string>>();
  for (const row of (skillWhitelist.data ?? []) as SkillWhitelistRow[]) {
    const key = row.day_type_time_block_id ?? "";
    if (!key || !row.skill_id) continue;
    const normalized = row.skill_id.trim();
    if (!normalized) continue;
    const existing = skillAllowMap.get(key) ?? new Set<string>();
    existing.add(normalized);
    skillAllowMap.set(key, existing);
  }

  const monumentAllowMap = new Map<string, Set<string>>();
  for (const row of (monumentWhitelist.data ?? []) as MonumentWhitelistRow[]) {
    const key = row.day_type_time_block_id ?? "";
    if (!key || !row.monument_id) continue;
    const normalized = row.monument_id.trim();
    if (!normalized) continue;
    const existing = monumentAllowMap.get(key) ?? new Set<string>();
    existing.add(normalized);
    monumentAllowMap.set(key, existing);
  }

  const normalizeAllowAllFlag = (
    flag: boolean | null | undefined,
    whitelistSize: number
  ): boolean => flag === true || (flag == null && whitelistSize === 0);

  const baseWindows = (
    (linkRows ?? []) as (DayTypeTimeBlockRow & {
      time_blocks?: TimeBlockRow | null;
      location_context?: {
        id?: string | null;
        value?: string | null;
        label?: string | null;
      } | null;
    })[]
  )
    .map((row) => {
      const block = row.time_blocks;
      if (!block) return null;
      const hasLocationContextId =
        typeof row.location_context_id === "string" &&
        row.location_context_id.trim().length > 0;
      const locationValue =
        hasLocationContextId && row.location_context?.value
          ? String(row.location_context.value).toUpperCase().trim()
          : null;
      const locationLabel =
        row.location_context?.label ?? (locationValue ? locationValue : null);

      const dttbId = (row as { id?: string | null }).id ?? null;
      const habitWhitelist = dttbId ? habitAllowMap.get(dttbId) : undefined;
      const skillWhitelist = dttbId ? skillAllowMap.get(dttbId) : undefined;
      const monumentWhitelist = dttbId
        ? monumentAllowMap.get(dttbId)
        : undefined;

      const allowAllHabitTypes = normalizeAllowAllFlag(
        row.allow_all_habit_types,
        habitWhitelist?.size ?? 0
      );
      const allowAllSkills = normalizeAllowAllFlag(
        row.allow_all_skills,
        skillWhitelist?.size ?? 0
      );
      const allowAllMonuments = normalizeAllowAllFlag(
        row.allow_all_monuments,
        monumentWhitelist?.size ?? 0
      );

      return {
        dayTypeId: row.day_type_id ?? null,
        id: block.id,
        label: block.label ?? "",
        energy:
          typeof row.energy === "string" && row.energy.trim().length > 0
            ? row.energy.trim().toUpperCase()
            : null,
        start_local: block.start_local ?? "00:00",
        end_local: block.end_local ?? "00:00",
        // Day type already defines applicability; do not let time_blocks.days filter these out.
        days: null,
        location_context_id: row.location_context_id ?? null,
        locationContextId: row.location_context_id ?? null,
        location_context_value: locationValue,
        location_context_name: locationLabel,
        window_kind: normalizeBlockType(row.block_type),
        block_type: row.block_type ?? null,
        blockType: row.block_type ?? null,
        dayTypeTimeBlockId: dttbId,
       allowAllHabitTypes,
        allowAllSkills,
        allowAllMonuments,
        allowedHabitTypes: dttbId
          ? Array.from(habitAllowMap.get(dttbId) ?? [])
          : null,
        allowedSkillIds: dttbId
          ? Array.from(skillAllowMap.get(dttbId) ?? [])
          : null,
        allowedMonumentIds: dttbId
          ? Array.from(monumentAllowMap.get(dttbId) ?? [])
          : null,
      } as WindowLite;
    })
    .filter(Boolean)
    .sort(sortWindowsByStartThenId) as WindowLite[];

  const enrichedBaseWindows = await enrichWindowConstraintDisplays(
    supabase,
    baseWindows
  );

  const result = buildWindowsForDateFromSnapshot(
    enrichedBaseWindows,
    anchor,
    normalizedTimeZone
  );

  if (WINDOWS_DEBUG_LOGGING) {
    log("info", "scheduler_windows_debug", {
      kind: "scheduler_windows_debug",
      flag: USE_DAY_TYPES_FLAG,
      date: dateKey,
      dayTypeId,
      dayTypeName,
      dayTypeMatchSource,
      weekday,
      count: result.length,
    });
  }

  return result;
}

type WindowSignature = {
  startLocal: string;
  endLocal: string;
  duration: number;
  fromPrevDay: boolean;
  energy: Energy;
  windowKind: WindowKind;
  locationContextValue: string | null;
  locationContextName: string | null;
  allowAllHabitTypes: boolean;
  allowAllSkills: boolean;
  allowAllMonuments: boolean;
  allowedHabitTypes: string[] | null;
  allowedSkillIds: string[] | null;
  allowedMonumentIds: string[] | null;
};

const normalizeStringArray = (values?: string[] | null): string[] | null => {
  if (!Array.isArray(values) || values.length === 0) return null;
  const normalized = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
  if (normalized.length === 0) return null;
  const unique = Array.from(new Set(normalized));
  unique.sort((a, b) => a.localeCompare(b));
  return unique.length > 0 ? unique : null;
};

const computeWindowDuration = (startLocal: string, endLocal: string): number => {
  const startMinutes = timeToMinutes(startLocal);
  let endMinutes = timeToMinutes(endLocal);
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }
  return Math.max(0, endMinutes - startMinutes);
};

const compareSignaturesByTime = (
  a: WindowSignature,
  b: WindowSignature
): number => {
  const startDiff = timeToMinutes(a.startLocal) - timeToMinutes(b.startLocal);
  if (startDiff !== 0) return startDiff;
  const endDiff = timeToMinutes(a.endLocal) - timeToMinutes(b.endLocal);
  if (endDiff !== 0) return endDiff;
  if (a.fromPrevDay !== b.fromPrevDay) {
    return Number(a.fromPrevDay) - Number(b.fromPrevDay);
  }
  return 0;
};

const buildWindowSignature = (win: WindowLite): WindowSignature => {
  const startLocal = win.start_local ?? "00:00";
  const endLocal = win.end_local ?? "00:00";
  return {
    startLocal,
    endLocal,
    duration: computeWindowDuration(startLocal, endLocal),
    fromPrevDay: win.fromPrevDay ?? false,
    energy: normalizeEnergyValue(win.energy ?? null),
    windowKind: win.window_kind ?? "DEFAULT",
    locationContextValue: win.location_context_value ?? null,
    locationContextName: win.location_context_name ?? null,
    allowAllHabitTypes: win.allowAllHabitTypes ?? true,
    allowAllSkills: win.allowAllSkills ?? true,
    allowAllMonuments: win.allowAllMonuments ?? true,
    allowedHabitTypes: normalizeStringArray(win.allowedHabitTypes),
    allowedSkillIds: normalizeStringArray(win.allowedSkillIds),
    allowedMonumentIds: normalizeStringArray(win.allowedMonumentIds),
  };
};

const sortSignaturesByTime = (signatures: WindowSignature[]) =>
  [...signatures].sort(compareSignaturesByTime);

const signatureToJson = (sig: unknown): string => {
  try {
    return JSON.stringify(sig);
  } catch {
    return String(sig);
  }
};

const areSignaturesEqual = (a: WindowSignature, b: WindowSignature): boolean =>
  signatureToJson(a) === signatureToJson(b);

const findFirstSignatureMismatchIndex = (
  legacy: WindowSignature[],
  v2: WindowSignature[]
): number => {
  const minLength = Math.min(legacy.length, v2.length);
  for (let index = 0; index < minLength; index++) {
    if (!areSignaturesEqual(legacy[index], v2[index])) return index;
  }
  if (legacy.length !== v2.length) return minLength;
  return -1;
};

export async function fetchWindowsForDate(
  date: Date,
  client?: Client,
  timeZone?: string | null,
  options?: FetchWindowsOptions
): Promise<WindowLite[]> {
  const normalizedTimeZone = normalizeTimeZone(timeZone);

  if (options?.snapshot) {
    return buildWindowsForDateFromSnapshot(
      options.snapshot,
      date,
      normalizedTimeZone
    );
  }

  const useDayTypes = options?.useDayTypes ?? USE_DAY_TYPES_FLAG;
  const parityEnabled = options?.parity?.enabled === true;

  if (!useDayTypes) {
    return fetchWindowsForDateLegacy(date, client, normalizedTimeZone, options);
  }

  if (!parityEnabled) {
    return getWindowsForDate_v2(date, client, normalizedTimeZone, options);
  }

  const [legacy, v2] = await Promise.all([
    fetchWindowsForDateLegacy(date, client, normalizedTimeZone, options),
    getWindowsForDate_v2(date, client, normalizedTimeZone, options),
  ]);

  const legacySignatures = sortSignaturesByTime(
    legacy.map(buildWindowSignature)
  );
  const v2Signatures = sortSignaturesByTime(v2.map(buildWindowSignature));
  const firstDiffIndex = findFirstSignatureMismatchIndex(
    legacySignatures,
    v2Signatures
  );

  const parityContext = formatDateKeyInTimeZone(
    startOfDayInTimeZone(date, normalizedTimeZone),
    normalizedTimeZone
  );
  options?.parity?.onCheck?.({
    mismatch: firstDiffIndex !== -1,
    context: firstDiffIndex !== -1 ? parityContext : null,
  });

  return v2;
}

export async function fetchWindowsSnapshot(
  userId: string,
  client?: Client
): Promise<WindowLite[]> {
  const supabase = ensureClient(client);
  const contextJoin = "location_context:location_contexts(id, value, label)";
  const { data, error } = await supabase
    .from("windows")
    .select(
      `id, label, energy, start_local, end_local, days, location_context_id, window_kind, day_type_time_block_id, allow_all_habit_types, allow_all_skills, allow_all_monuments, allowed_habit_types, allowed_skill_ids, allowed_monument_ids, ${contextJoin}`
    )
    .eq("user_id", userId);

  if (error) throw error;

  return enrichWindowConstraintDisplays(
    supabase,
    ((data ?? []) as WindowRecord[]).map(mapWindowRecord)
  );
}

export function windowsForDateFromSnapshot(
  snapshot: WindowLite[],
  date: Date,
  timeZone: string
): WindowLite[] {
  return buildWindowsForDateFromSnapshot(snapshot, date, timeZone);
}

export async function fetchAllWindows(client?: Client): Promise<WindowLite[]> {
  const supabase = ensureClient(client);

  const contextJoin = "location_context:location_contexts(id, value, label)";
  const { data, error } = await supabase
    .from("windows")
    .select(
      `id, label, energy, start_local, end_local, days, location_context_id, window_kind, day_type_time_block_id, allow_all_habit_types, allow_all_skills, allow_all_monuments, allowed_habit_types, allowed_skill_ids, allowed_monument_ids, ${contextJoin}`
    );

  if (error) throw error;

  return enrichWindowConstraintDisplays(
    supabase,
    ((data ?? []) as WindowRecord[]).map(mapWindowRecord)
  );
}

export async function fetchProjectsMap(
  client?: Client
): Promise<Record<string, ProjectLite>> {
  const supabase = ensureClient(client);
  const columns = [
    "id",
    "name",
    "priority",
    "stage",
    "energy",
    "duration_min",
    "effective_duration_min",
    "goal_id",
    "due_date",
    "global_rank",
  ].join(", ");

  const [lookups, { data, error }] = await Promise.all([
    fetchPriorityEnergyLookups(supabase),
    supabase.from("projects").select(columns).is("completed_at", null),
  ]);

  if (error) throw error;
  const map: Record<string, ProjectLite> = {};
  type ProjectRecord = {
    id: string;
    name?: string | null;
    priority?: string | number | null;
    stage?: string | null;
    energy?: string | number | null;
    duration_min?: number | null;
    goal_id?: string | null;
    due_date?: string | null;
    global_rank?: number | string | null;
  };

  for (const p of (data ?? []) as ProjectRecord[]) {
    const priorityName = resolvePriorityLabel(p.priority, lookups.priority);
    const energyName = resolveEnergyLabel(p.energy, lookups.energy);
    const duration = Number(p.duration_min ?? 0);
    const effectiveDuration = Number(p.effective_duration_min ?? 0);
    const parsedGlobalRank =
      typeof p.global_rank === "number" ? p.global_rank : Number(p.global_rank);
    map[p.id] = {
      id: p.id,
      name: p.name ?? undefined,
      priority: normalizePriorityValue(priorityName),
      stage: normalizeStageValue(p.stage, "BUILD"),
      energy: normalizeEnergyValue(energyName),
      duration_min: Number.isFinite(duration) ? duration : null,
      effective_duration_min: Number.isFinite(effectiveDuration)
        ? effectiveDuration
        : null,
      goal_id: p.goal_id ?? null,
      due_date: p.due_date ?? null,
      globalRank: Number.isFinite(parsedGlobalRank) ? parsedGlobalRank : null,
      global_rank: Number.isFinite(parsedGlobalRank) ? parsedGlobalRank : null,
    };
  }
  return map;
}

export async function fetchAllProjectsMap(
  client?: Client
): Promise<Record<string, ProjectLite>> {
  const supabase = ensureClient(client);
  const columns = [
    "id",
    "name",
    "priority",
    "stage",
    "energy",
    "duration_min",
    "effective_duration_min",
    "goal_id",
    "due_date",
    "global_rank",
  ].join(", ");

  const [lookups, { data, error }] = await Promise.all([
    fetchPriorityEnergyLookups(supabase),
    supabase.from("projects").select(columns),
  ]);

  if (error) throw error;
  const map: Record<string, ProjectLite> = {};
  type ProjectRecord = {
    id: string;
    name?: string | null;
    priority?: string | number | null;
    stage?: string | null;
    energy?: string | number | null;
    duration_min?: number | null;
    goal_id?: string | null;
    due_date?: string | null;
    global_rank?: number | string | null;
  };

  for (const p of (data ?? []) as ProjectRecord[]) {
    const priorityName = resolvePriorityLabel(p.priority, lookups.priority);
    const energyName = resolveEnergyLabel(p.energy, lookups.energy);
    const duration = Number(p.duration_min ?? 0);
    const effectiveDuration = Number(p.effective_duration_min ?? 0);
    const parsedGlobalRank =
      typeof p.global_rank === "number" ? p.global_rank : Number(p.global_rank);
    map[p.id] = {
      id: p.id,
      name: p.name ?? undefined,
      priority: normalizePriorityValue(priorityName),
      stage: normalizeStageValue(p.stage, "BUILD"),
      energy: normalizeEnergyValue(energyName),
      duration_min: Number.isFinite(duration) ? duration : null,
      effective_duration_min: Number.isFinite(effectiveDuration)
        ? effectiveDuration
        : null,
      goal_id: p.goal_id ?? null,
      due_date: p.due_date ?? null,
      globalRank: Number.isFinite(parsedGlobalRank) ? parsedGlobalRank : null,
      global_rank: Number.isFinite(parsedGlobalRank) ? parsedGlobalRank : null,
    };
  }
  return map;
}

export async function fetchProjectSkillsForProjects(
  projectIds: string[],
  client?: Client
): Promise<Record<string, string[]>> {
  if (projectIds.length === 0) return {};

  const supabase = ensureClient(client);
  const { data, error } = await supabase
    .from("project_skills")
    .select("project_id, skill_id")
    .in("project_id", projectIds);

  if (error) throw error;

  const map: Record<string, string[]> = {};
  for (const entry of (data ?? []) as {
    project_id: string | null;
    skill_id: string | null;
  }[]) {
    const projectId = entry.project_id;
    const skillId = entry.skill_id;
    if (!projectId || !skillId) continue;
    const existing = map[projectId] ?? [];
    if (!existing.includes(skillId)) {
      existing.push(skillId);
      map[projectId] = existing;
    } else if (!map[projectId]) {
      map[projectId] = existing;
    }
  }

  return map;
}

export type GoalSummary = {
  id: string;
  name: string | null;
  status: GoalStatus;
  weight: number;
  monumentId: string | null;
  emoji: string | null;
  global_rank?: number | null;
  globalRank?: number | null;
  roadmap_id?: string | null;
  roadmapId?: string | null;
  priority_rank?: number | null;
  priorityRank?: number | null;
};

export async function fetchGoalsForUser(
  userId: string,
  client?: Client
): Promise<GoalSummary[]> {
  const supabase = ensureClient(client);
  type GoalRecord = {
    id: string;
    name?: string | null;
    status?: string | null;
    active?: boolean | null;
    global_rank?: number | null;
    roadmap_id?: string | null;
    priority_rank?: number | null;
    monument_id?: string | null;
    emoji?: string | null;
  };
  type MonumentRoadmapRecord = {
    id: string;
    monument_id?: string | null;
    created_at?: string | null;
  };
  type RoadmapItemRecord = {
    id?: string | null;
    roadmap_id: string;
    item_type?: string | null;
    campaign_id?: string | null;
    goal_id?: string | null;
    position?: number | null;
    created_at?: string | null;
  };
  type CampaignGoalRecord = {
    id?: string | null;
    campaign_id: string;
    goal_id?: string | null;
    position?: number | null;
    created_at?: string | null;
  };
  const normalizeFiniteNumber = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return null;
  };
  const normalizeIdString = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };
  const compareNullableText = (
    a: string | null | undefined,
    b: string | null | undefined
  ) => (a ?? "").localeCompare(b ?? "");
  const comparePosition = (
    a: number | null | undefined,
    b: number | null | undefined
  ) => {
    const aPosition =
      typeof a === "number" && Number.isFinite(a)
        ? a
        : Number.POSITIVE_INFINITY;
    const bPosition =
      typeof b === "number" && Number.isFinite(b)
        ? b
        : Number.POSITIVE_INFINITY;
    return aPosition - bPosition;
  };
  const { data, error } = await supabase
    .from("goals")
    .select(
      "id, name, status, active, global_rank, roadmap_id, priority_rank, monument_id, emoji"
    )
    .eq("user_id", userId);

  if (error) throw error;

  const goals = (data ?? []) as GoalRecord[];
  const goalStatusById = new Map<string, GoalStatus>();
  const goalMonumentIdById = new Map<string, string | null>();
  for (const goal of goals) {
    goalStatusById.set(goal.id, normalizeGoalStatus(goal.status, goal.active));
    goalMonumentIdById.set(goal.id, normalizeIdString(goal.monument_id));
  }
  const { data: roadmapData, error: roadmapError } = await supabase
    .from("roadmaps")
    .select("id, monument_id, created_at")
    .eq("user_id", userId)
    .not("monument_id", "is", null);

  if (roadmapError) throw roadmapError;

  const monumentRoadmaps = (roadmapData ?? []) as MonumentRoadmapRecord[];
  const roadmapIds = monumentRoadmaps
    .map((roadmap) => roadmap.id)
    .filter((roadmapId) => typeof roadmapId === "string" && roadmapId.length > 0);

  const derivedPriorityRankByGoalId = new Map<string, number>();

  if (roadmapIds.length > 0) {
    const { data: roadmapItemData, error: roadmapItemError } = await supabase
      .from("roadmap_items")
      .select(
        "id, roadmap_id, item_type, campaign_id, goal_id, position, created_at"
      )
      .in("roadmap_id", roadmapIds)
      .order("position", { ascending: true });

    if (roadmapItemError) throw roadmapItemError;

    const roadmapItems = (roadmapItemData ?? []) as RoadmapItemRecord[];
    const campaignIds = Array.from(
      new Set(
        roadmapItems
          .map((item) =>
            typeof item.campaign_id === "string" && item.campaign_id.length > 0
              ? item.campaign_id
              : null
          )
          .filter((campaignId): campaignId is string => campaignId !== null)
      )
    );

    let campaignGoals: CampaignGoalRecord[] = [];
    if (campaignIds.length > 0) {
      const { data: campaignGoalData, error: campaignGoalError } = await supabase
        .from("campaign_goals")
        .select("id, campaign_id, goal_id, position, created_at")
        .eq("user_id", userId)
        .in("campaign_id", campaignIds)
        .order("position", { ascending: true });

      if (campaignGoalError) throw campaignGoalError;
      campaignGoals = (campaignGoalData ?? []) as CampaignGoalRecord[];
    }
    campaignGoals.sort((a, b) => {
      const campaignDelta = compareNullableText(a.campaign_id, b.campaign_id);
      if (campaignDelta !== 0) return campaignDelta;
      const positionDelta = comparePosition(a.position, b.position);
      if (positionDelta !== 0) return positionDelta;
      const createdDelta = compareNullableText(a.created_at, b.created_at);
      if (createdDelta !== 0) return createdDelta;
      const idDelta = compareNullableText(a.id, b.id);
      if (idDelta !== 0) return idDelta;
      return compareNullableText(a.goal_id, b.goal_id);
    });
    const redundantStandaloneItemIds = findRedundantStandaloneRoadmapItemIds({
      roadmapItems,
      campaignGoals,
    });

    const campaignGoalIdsByCampaignId = new Map<string, string[]>();
    for (const campaignGoal of campaignGoals) {
      const campaignId =
        typeof campaignGoal.campaign_id === "string" &&
        campaignGoal.campaign_id.length > 0
          ? campaignGoal.campaign_id
          : null;
      const goalId =
        typeof campaignGoal.goal_id === "string" && campaignGoal.goal_id.length > 0
          ? campaignGoal.goal_id
          : null;
      if (!campaignId || !goalId) continue;
      const existing = campaignGoalIdsByCampaignId.get(campaignId) ?? [];
      existing.push(goalId);
      campaignGoalIdsByCampaignId.set(campaignId, existing);
    }

    const roadmapItemsByRoadmapId = new Map<string, RoadmapItemRecord[]>();
    for (const roadmapItem of roadmapItems) {
      if (
        roadmapItem.id &&
        redundantStandaloneItemIds.has(roadmapItem.id)
      ) {
        continue;
      }

      const roadmapId =
        typeof roadmapItem.roadmap_id === "string" &&
        roadmapItem.roadmap_id.length > 0
          ? roadmapItem.roadmap_id
          : null;
      if (!roadmapId) continue;
      const existing = roadmapItemsByRoadmapId.get(roadmapId) ?? [];
      existing.push(roadmapItem);
      roadmapItemsByRoadmapId.set(roadmapId, existing);
    }

    const nextRankByMonumentId = new Map<string, number>();
    const seenActiveGoalIdsByMonumentId = new Map<string, Set<string>>();
    const sortedMonumentRoadmaps = [...monumentRoadmaps].sort((a, b) => {
      const monumentDelta = compareNullableText(a.monument_id, b.monument_id);
      if (monumentDelta !== 0) return monumentDelta;
      const createdDelta = compareNullableText(a.created_at, b.created_at);
      if (createdDelta !== 0) return createdDelta;
      return compareNullableText(a.id, b.id);
    });

    for (const roadmap of sortedMonumentRoadmaps) {
      const roadmapId = normalizeIdString(roadmap.id);
      const monumentId = normalizeIdString(roadmap.monument_id);
      if (!roadmapId || !monumentId) continue;

      let nextRank = nextRankByMonumentId.get(monumentId) ?? 1;
      const seenActiveGoalIds =
        seenActiveGoalIdsByMonumentId.get(monumentId) ?? new Set<string>();
      const roadmapItems = [...(roadmapItemsByRoadmapId.get(roadmapId) ?? [])].sort(
        (a, b) => {
          const positionDelta = comparePosition(a.position, b.position);
          if (positionDelta !== 0) return positionDelta;
          const createdDelta = compareNullableText(a.created_at, b.created_at);
          if (createdDelta !== 0) return createdDelta;
          const idDelta = compareNullableText(a.id, b.id);
          if (idDelta !== 0) return idDelta;
          return compareNullableText(
            a.goal_id ?? a.campaign_id,
            b.goal_id ?? b.campaign_id
          );
        }
      );

      for (const roadmapItem of roadmapItems) {
        const itemType = String(roadmapItem.item_type ?? "").trim().toUpperCase();
        let itemGoalIds: string[] = [];
        if (itemType === "GOAL") {
          const goalId = normalizeIdString(roadmapItem.goal_id);
          itemGoalIds = goalId ? [goalId] : [];
        } else if (itemType === "CAMPAIGN") {
          const campaignId = normalizeIdString(roadmapItem.campaign_id);
          itemGoalIds = campaignId
            ? (campaignGoalIdsByCampaignId.get(campaignId) ?? [])
            : [];
        }

        for (const goalId of itemGoalIds) {
          if (seenActiveGoalIds.has(goalId)) continue;
          if (goalStatusById.get(goalId) !== "ACTIVE") continue;
          const goalMonumentId = goalMonumentIdById.get(goalId) ?? null;
          if (goalMonumentId && goalMonumentId !== monumentId) continue;

          seenActiveGoalIds.add(goalId);
          if (!derivedPriorityRankByGoalId.has(goalId)) {
            derivedPriorityRankByGoalId.set(goalId, nextRank);
          }
          nextRank += 1;
        }
      }
      nextRankByMonumentId.set(monumentId, nextRank);
      seenActiveGoalIdsByMonumentId.set(monumentId, seenActiveGoalIds);
    }
  }

  return goals.map((goal) => {
    const status = normalizeGoalStatus(goal.status, goal.active);
    const globalRank = normalizeFiniteNumber(goal.global_rank);
    const legacyPriorityRank = normalizeFiniteNumber(goal.priority_rank);
    const derivedPriorityRank = derivedPriorityRankByGoalId.get(goal.id) ?? null;
    const priorityRank = derivedPriorityRank ?? legacyPriorityRank;
    const roadmapId =
      typeof goal.roadmap_id === "string" && goal.roadmap_id.length > 0
        ? goal.roadmap_id
        : goal.roadmap_id ?? null;
    const hasPriorityRank =
      typeof priorityRank === "number" &&
      Number.isFinite(priorityRank) &&
      priorityRank > 0;
    const hasGlobalRank =
      typeof globalRank === "number" &&
      Number.isFinite(globalRank) &&
      globalRank > 0;
    const weight = hasPriorityRank
      ? 100000 - priorityRank
      : hasGlobalRank
        ? 100000 - globalRank
        : 0;
    // Roadmap-derived priorityRank is primary; globalRank is only a fallback.
    return {
      id: goal.id,
      name: goal.name ?? null,
      status,
      weight,
      monumentId: goal.monument_id ?? null,
      emoji: goal.emoji ?? null,
      global_rank: globalRank,
      globalRank,
      roadmap_id: roadmapId,
      roadmapId,
      priority_rank: priorityRank,
      priorityRank,
    };
  });
}
