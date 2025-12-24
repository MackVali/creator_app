import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "../../../lib/supabase";
import type { Database } from "../../../types/supabase";
import { normalizeTimeZone, weekdayInTimeZone } from "./timezone";
import { ENERGY, type Energy } from "./config";
import type { TaskLite, ProjectLite } from "./weight";

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
    console.warn("Failed to load priority lookup values", priorityRes.error);
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
    console.warn("Failed to load energy lookup values", energyRes.error);
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

export type WindowKind = "DEFAULT" | "BREAK" | "PRACTICE";

const WINDOW_KIND_SET = new Set<WindowKind>(["DEFAULT", "BREAK", "PRACTICE"]);

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
};

type WindowRecord = {
  id: string;
  label?: string | null;
  energy?: string | null;
  start_local?: string | null;
  end_local?: string | null;
  days?: number[] | null;
  location_context_id?: string | null;
  window_kind?: string | null;
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

function mapWindowRecord(record: WindowRecord): WindowLite {
  const value = record.location_context?.value
    ? String(record.location_context.value).toUpperCase().trim()
    : null;
  const label = record.location_context?.label ?? (value ? value : null);

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

function buildWindowsForDateFromSnapshot(
  snapshot: WindowLite[],
  date: Date,
  timeZone: string
): WindowLite[] {
  const weekday = weekdayInTimeZone(date, timeZone);
  const prevWeekday = (weekday + 6) % 7;

  const today: WindowLite[] = [];
  const prev: WindowLite[] = [];
  const always: WindowLite[] = [];

  for (const window of snapshot) {
    const days = window.days ?? null;
    const crosses = crossesMidnight(window);

    if (days === null) {
      always.push({ ...window, fromPrevDay: false });
    } else if (days.includes(weekday)) {
      today.push({ ...window, fromPrevDay: false });
    }

    const appliesToPrev =
      days === null || (days?.includes(prevWeekday) ?? false);
    if (crosses && appliesToPrev) {
      prev.push({ ...window, fromPrevDay: true });
    }
  }

  const base = new Map<string, WindowLite>();
  for (const window of [...today, ...always]) {
    if (!base.has(window.id)) {
      base.set(window.id, { ...window, fromPrevDay: false });
    }
  }

  const baseWindows = [...base.values()];
  const prevCross = [
    ...prev,
    ...always.filter(crossesMidnight).map((w) => ({ ...w, fromPrevDay: true })),
  ].filter(
    (prevWindow) =>
      !baseWindows.some((baseWindow) =>
        overlapsPrevCross(baseWindow, prevWindow)
      )
  );

  return [...baseWindows, ...prevCross];
}

export async function fetchWindowsForDate(
  date: Date,
  client?: Client,
  timeZone?: string | null,
  options?: { userId?: string | null; snapshot?: WindowLite[] }
): Promise<WindowLite[]> {
  const normalizedTimeZone = normalizeTimeZone(timeZone);

  if (options?.snapshot) {
    return buildWindowsForDateFromSnapshot(
      options.snapshot,
      date,
      normalizedTimeZone
    );
  }

  const supabase = ensureClient(client);

  const weekday = weekdayInTimeZone(date, normalizedTimeZone);
  const prevWeekday = (weekday + 6) % 7;
  const contextJoin = "location_context:location_contexts(id, value, label)";
  const columns = `id, label, energy, start_local, end_local, days, location_context_id, window_kind, ${contextJoin}`;

  const userId = options?.userId ?? null;
  const selectWindows = () => supabase.from("windows").select(columns);
  const applyUserFilter = <
    T extends { eq: (column: string, value: string) => T }
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

  return [...baseWindows, ...prevCross];
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
      `id, label, energy, start_local, end_local, days, location_context_id, window_kind, ${contextJoin}`
    )
    .eq("user_id", userId);

  if (error) throw error;

  return ((data ?? []) as WindowRecord[]).map(mapWindowRecord);
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
      `id, label, energy, start_local, end_local, days, location_context_id, window_kind, ${contextJoin}`
    );

  if (error) throw error;

  return ((data ?? []) as WindowRecord[]).map(mapWindowRecord);
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
    const parsedGlobalRank =
      typeof p.global_rank === "number" ? p.global_rank : Number(p.global_rank);
    map[p.id] = {
      id: p.id,
      name: p.name ?? undefined,
      priority: normalizePriorityValue(priorityName),
      stage: normalizeStageValue(p.stage, "BUILD"),
      energy: normalizeEnergyValue(energyName),
      duration_min: Number.isFinite(duration) ? duration : null,
      goal_id: p.goal_id ?? null,
      due_date: p.due_date ?? null,
      globalRank: Number.isFinite(parsedGlobalRank) ? parsedGlobalRank : null,
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
    const parsedGlobalRank =
      typeof p.global_rank === "number" ? p.global_rank : Number(p.global_rank);
    map[p.id] = {
      id: p.id,
      name: p.name ?? undefined,
      priority: normalizePriorityValue(priorityName),
      stage: normalizeStageValue(p.stage, "BUILD"),
      energy: normalizeEnergyValue(energyName),
      duration_min: Number.isFinite(duration) ? duration : null,
      goal_id: p.goal_id ?? null,
      due_date: p.due_date ?? null,
      globalRank: Number.isFinite(parsedGlobalRank) ? parsedGlobalRank : null,
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
  weight: number;
  monumentId: string | null;
};

export async function fetchGoalsForUser(
  userId: string,
  client?: Client
): Promise<GoalSummary[]> {
  const supabase = ensureClient(client);
  type GoalRecord = {
    id: string;
    name?: string | null;
    weight?: number | null;
    monument_id?: string | null;
  };
  const { data, error } = await supabase
    .from("goals")
    .select("id, name, weight, monument_id")
    .eq("user_id", userId);

  if (error) throw error;

  return ((data ?? []) as GoalRecord[]).map((goal) => ({
    id: goal.id,
    name: goal.name ?? null,
    weight: Number(goal.weight ?? 0) || 0,
    monumentId: goal.monument_id ?? null,
  }));
}
