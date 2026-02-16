import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import {
  fetchProjectsMap,
  fetchProjectSkillsForProjects,
  fetchGoalsForUser,
  fetchReadyTasks,
  fetchPriorityEnergyLookups,
  type GoalSummary,
} from "./repo";
import { fetchHabitsForSchedule, type HabitScheduleItem } from "./habits";
import {
  fetchInstancesForRange,
  fetchScheduledProjectIds,
  type ScheduleInstance,
} from "./instanceRepo";
import { type SyncPairingsByInstanceId } from "./syncLayout";
import {
  addDaysInTimeZone,
  normalizeTimeZone,
  startOfDayInTimeZone,
} from "./timezone";
import { DEFAULT_SCHEDULE_LOOKAHEAD_DAYS } from "./limits";
import { toZonedTime } from "date-fns-tz";
import { dayKeyFromUtc } from "../time/tz";
import type { TaskLite, ProjectLite } from "./weight";
import { ENERGY } from "./config";
import type { SkillRow } from "@/lib/types/skill";
import type { Monument } from "@/lib/queries/monuments";
import { log } from "@/lib/utils/logGate";

type Client = SupabaseClient<Database>;

export type ScheduleEventDataset = {
  generatedAt: string;
  rangeStartUTC: string;
  rangeEndUTC: string;
  lookaheadDays: number;
  tasks: TaskLite[];
  projects: ProjectLite[];
  projectSkillIds: Record<string, string[]>;
  projectGoalRelations: ProjectGoalRelations;
  habits: HabitScheduleItem[];
  skills: SkillRow[];
  monuments: Monument[];
  scheduledProjectIds: string[];
  instances: ScheduleInstance[];
  syncPairings: SyncPairingsByInstanceId;
  energyLookup: Record<string, (typeof ENERGY.LIST)[number]>;
  priorityLookup: Record<string, string>;
  needsOnboarding?: boolean;
};

export type ProjectGoalRelations = Record<
  string,
  {
    goalId: string;
    goalName: string | null;
    goalEmoji: string | null;
    goalMonumentId: string | null;
  }
>;

function buildEmptyScheduleEventDataset({
  lookaheadDays,
  rangeStartUTC,
  rangeEndUTC,
  tasks,
  projects,
  projectSkillIds,
  projectGoalRelations,
  habits,
  skills,
  monuments,
  scheduledProjectIds,
  energyLookup,
  priorityLookup,
}: {
  lookaheadDays: number;
  rangeStartUTC: string;
  rangeEndUTC: string;
  tasks: TaskLite[];
  projects: ProjectLite[];
  projectSkillIds: Record<string, string[]>;
  projectGoalRelations: ProjectGoalRelations;
  habits: HabitScheduleItem[];
  skills: SkillRow[];
  monuments: Monument[];
  scheduledProjectIds: string[];
  energyLookup: Record<string, (typeof ENERGY.LIST)[number]>;
  priorityLookup: Record<string, string>;
}): ScheduleEventDataset & { needsOnboarding: true } {
  return {
    generatedAt: new Date().toISOString(),
    rangeStartUTC,
    rangeEndUTC,
    lookaheadDays,
    tasks,
    projects,
    projectSkillIds,
    projectGoalRelations,
    habits,
    skills,
    monuments,
    scheduledProjectIds,
    instances: [],
    syncPairings: {},
    energyLookup,
    priorityLookup,
    needsOnboarding: true,
  };
}

const COMPLETED_LOOKBACK_DAYS = 3;

function throwDatasetViolation(
  kind: "FETCH" | "CONTRACT",
  details: Record<string, unknown>
): void {
  throw new Error(
    `DATASET_${kind}_VIOLATION\n${JSON.stringify(details, null, 2)}`
  );
}

function datasetSectionError(section: string, error: unknown): Error {
  const message =
    error instanceof Error ? error.message : String(error ?? "unknown error");
  const annotated = new Error(`[dataset] ${section}: ${message}`);
  if (error instanceof Error && error.stack) {
    annotated.stack = error.stack;
  }
  return Object.assign(annotated, { cause: error });
}

function datasetMissing(section: string, thing: string): Error {
  return new Error(`[dataset] ${section}: missing ${thing}`);
}

function groupCountByDayKey(
  instances: ScheduleInstance[],
  tz: string
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const instance of instances) {
    const dayKey = dayKeyFromUtc(instance.start_utc ?? "", tz);
    counts[dayKey] = (counts[dayKey] ?? 0) + 1;
  }
  return counts;
}

function sample(
  instances: ScheduleInstance[],
  tz: string,
  n = 5
): Array<{ id: string; start_utc: string; dayKey: string }> {
  return instances.slice(0, n).map((instance) => {
    const dayKey = dayKeyFromUtc(instance.start_utc ?? "", tz);
    return {
      id: instance.id,
      start_utc: instance.start_utc ?? "",
      dayKey,
    };
  });
}

function normalizeHabitType(value?: string | null) {
  const raw = (value ?? "HABIT").toUpperCase();
  return raw === "ASYNC" ? "SYNC" : raw;
}

async function fetchSyncPairingsForInstances({
  userId,
  instances,
  habits,
  client,
}: {
  userId: string;
  instances: ScheduleInstance[];
  habits: HabitScheduleItem[];
  client: Client;
}): Promise<SyncPairingsByInstanceId> {
  if (instances.length === 0 || habits.length === 0) return {};

  const habitTypeById = new Map<string, string>();
  for (const habit of habits) {
    habitTypeById.set(habit.id, normalizeHabitType(habit.habitType));
  }

  const syncInstanceIds = instances
    .filter((inst) => {
      if (inst.status !== "scheduled" && inst.status !== "completed") {
        return false;
      }
      if (inst.source_type !== "HABIT") return false;
      const habitType = habitTypeById.get(inst.source_id ?? "") ?? "HABIT";
      return habitType === "SYNC";
    })
    .map((inst) => inst.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (syncInstanceIds.length === 0) return {};

  const { data, error } = await client
    .from("schedule_sync_pairings")
    .select("sync_instance_id, partner_instance_ids")
    .eq("user_id", userId)
    .in("sync_instance_id", syncInstanceIds);

  if (error || !data) return {};

  const pairings: SyncPairingsByInstanceId = {};
  for (const row of data) {
    const syncInstanceId = row.sync_instance_id;
    if (!syncInstanceId) continue;
    const partnerIds = Array.isArray(row.partner_instance_ids)
      ? row.partner_instance_ids.filter(
          (id: unknown): id is string => typeof id === "string" && id.length > 0
        )
      : [];
    pairings[syncInstanceId] = partnerIds;
  }

  return pairings;
}

export async function buildScheduleEventDataset({
  userId,
  client,
  baseDate,
  timeZone,
  lookaheadDays = DEFAULT_SCHEDULE_LOOKAHEAD_DAYS,
}: {
  userId: string;
  client: Client;
  baseDate: Date;
  timeZone?: string | null;
  lookaheadDays?: number;
}): Promise<ScheduleEventDataset> {
  const normalizedTz = normalizeTimeZone(timeZone);
  const futureRangeAnchor = startOfDayInTimeZone(baseDate, normalizedTz);
  const rangeStart = startOfDayInTimeZone(
    addDaysInTimeZone(baseDate, -COMPLETED_LOOKBACK_DAYS, normalizedTz),
    normalizedTz
  );
  const rangeEnd = addDaysInTimeZone(
    futureRangeAnchor,
    lookaheadDays,
    normalizedTz
  );
  // Use local day boundaries for database fetching
  const effectiveRangeStart = rangeStart;
  const effectiveRangeEnd = addDaysInTimeZone(rangeEnd, 1);
  const retentionCutoffMs = rangeStart.getTime();

  try {
    const coreSection = "initial scheduler metadata";
    let tasks: TaskLite[];
    let projectMap: Record<string, ProjectLite>;
    let habits: HabitScheduleItem[];
    let skills: SkillRow[];
    let monuments: Monument[];
    let scheduledProjectIds: string[];
    let goals: GoalSummary[];
    let priorityEnergyLookups: Awaited<
      ReturnType<typeof fetchPriorityEnergyLookups>
    >;
    try {
      [
        tasks,
        projectMap,
        habits,
        skills,
        monuments,
        scheduledProjectIds,
        goals,
        priorityEnergyLookups,
      ] = await Promise.all([
        fetchReadyTasks(client),
        fetchProjectsMap(client),
        fetchHabitsForSchedule(userId, client),
        fetchSkillsForUser(userId, client),
        fetchMonumentsForUser(userId, client),
        fetchScheduledProjectIds(userId, client),
        fetchGoalsForUser(userId, client),
        fetchPriorityEnergyLookups(client),
      ]);
    } catch (error) {
      throw datasetSectionError(coreSection, error);
    }

    const projectIds = Object.keys(projectMap);
    let projectSkillIds: Record<string, string[]> = {};
    if (projectIds.length > 0) {
      try {
        projectSkillIds = await fetchProjectSkillsForProjects(projectIds, client);
      } catch (error) {
        throw datasetSectionError("project skills fetch", error);
      }
    }
    projectSkillIds = projectSkillIds ?? {};
    const resolvedScheduledProjectIds = scheduledProjectIds ?? [];

    const lookupResult = priorityEnergyLookups ?? {
      energy: {},
      priority: {},
    };
    const energyLookup = normalizeEnergyLookup(lookupResult.energy ?? {});
    const priorityLookup = normalizePriorityLookup(
      lookupResult.priority ?? {}
    );
    const projectList = Object.values(projectMap);
    const goalNameById = new Map<string, GoalSummary["name"]>(
      goals.map((goal) => [goal.id, goal.name ?? null])
    );
    const goalEmojiById = new Map<string, GoalSummary["emoji"]>(
      goals.map((goal) => [goal.id, goal.emoji ?? null])
    );
    const goalMonumentIdById = new Map<string, GoalSummary["monumentId"]>(
      goals.map((goal) => [goal.id, goal.monumentId ?? null])
    );
    const projectGoalRelations: ProjectGoalRelations = {};
    for (const project of projectList) {
      const goalId = project.goal_id ?? null;
      if (!goalId) continue;
      if (!project.id) continue;
      projectGoalRelations[project.id] = {
        goalId,
        goalName: goalNameById.get(goalId) ?? null,
        goalEmoji: goalEmojiById.get(goalId) ?? null,
        goalMonumentId: goalMonumentIdById.get(goalId) ?? null,
      };
    }

    const instanceSection = "fetch instances for range";
    let instanceRows: ScheduleInstance[];
    try {
      const { data, error: instanceError } = await fetchInstancesForRange(
        userId,
        effectiveRangeStart.toISOString(),
        effectiveRangeEnd.toISOString(),
        client
      );
      if (instanceError) {
        throw datasetSectionError(instanceSection, instanceError);
      }
      if (!data) {
        throw datasetMissing(instanceSection, "instances");
      }
      instanceRows = data;
    } catch (error) {
      throw datasetSectionError(instanceSection, error);
    }

    if (instanceRows.length === 0) {
      return buildEmptyScheduleEventDataset({
        lookaheadDays,
        rangeStartUTC: rangeStart.toISOString(),
        rangeEndUTC: rangeEnd.toISOString(),
        tasks,
        projects: projectList,
        projectSkillIds,
        projectGoalRelations,
        habits,
        skills,
        monuments,
        scheduledProjectIds: resolvedScheduledProjectIds,
        energyLookup,
        priorityLookup,
      });
    }

    const todayKey = dayKeyFromUtc(baseDate.toISOString(), normalizedTz);
    const fetchedTodayCount = instanceRows.filter(
      (i) => dayKeyFromUtc(i.start_utc ?? "", normalizedTz) === todayKey
    ).length;
    if (fetchedTodayCount === 0) {
      const fetchedByLocalDayKey = groupCountByDayKey(
        instanceRows,
        normalizedTz
      );
      const sampleFetched = sample(instanceRows, normalizedTz);
      throwDatasetViolation("FETCH", {
        tz: normalizedTz,
        rangeStartUtc: rangeStart.toISOString(),
        rangeEndUtc: rangeEnd.toISOString(),
        todayDateKey: todayKey,
        totalFetched: instanceRows.length,
        totalFiltered: 0, // not yet computed
        fetchedByLocalDayKey,
        sampleFetched,
      });
    }

    const filteredInstances = instanceRows.filter((instance) => {
      if (instance.status !== "completed") return true;
      const startMs = Date.parse(
        instance.start_utc ?? instance.completed_at ?? ""
      );
      const endMs = Date.parse(
        instance.end_utc ?? instance.completed_at ?? instance.start_utc ?? ""
      );
      if (!Number.isFinite(startMs) && !Number.isFinite(endMs)) {
        return false;
      }

      const effectiveEndMs = Number.isFinite(endMs) ? endMs : startMs;
      if (
        Number.isFinite(effectiveEndMs) &&
        effectiveEndMs < retentionCutoffMs
      ) {
        return false;
      }
      return true;
    });
    const todayInstanceCount = filteredInstances.filter(
      (instance) =>
        dayKeyFromUtc(instance.start_utc ?? "", normalizedTz) === todayKey
    ).length;
    if (todayInstanceCount === 0) {
      const fetchedByLocalDayKey = groupCountByDayKey(
        instanceRows,
        normalizedTz
      );
      const filteredByLocalDayKey = groupCountByDayKey(
        filteredInstances,
        normalizedTz
      );
      const sampleFetched = sample(instanceRows, normalizedTz);
      const sampleFiltered = sample(filteredInstances, normalizedTz);
      throwDatasetViolation("CONTRACT", {
        tz: normalizedTz,
        rangeStartUtc: rangeStart.toISOString(),
        rangeEndUtc: rangeEnd.toISOString(),
        todayDateKey: todayKey,
        totalFetched: instanceRows.length,
        totalFiltered: filteredInstances.length,
        fetchedByLocalDayKey,
        filteredByLocalDayKey,
        sampleFetched,
        sampleFiltered,
      });
    }

    const normalizedInstances = normalizeScheduleInstanceEnergy(
      filteredInstances,
      energyLookup,
      projectMap
    );
    let syncPairings: SyncPairingsByInstanceId = {};
    try {
      syncPairings = await fetchSyncPairingsForInstances({
        userId,
        instances: normalizedInstances,
        habits,
        client,
      });
    } catch (error) {
      throw datasetSectionError("sync pairings fetch", error);
    }

    const loadDay = dayKeyFromUtc(baseDate.toISOString(), normalizedTz);
    const habitCount = normalizedInstances.filter(
      (inst) => inst.source_type === "HABIT"
    ).length;
    const completedCount = normalizedInstances.filter(
      (inst) => inst.status === "completed"
    ).length;
    const scheduledCount = normalizedInstances.filter(
      (inst) => inst.status === "scheduled"
    ).length;
    const nonHabitCount = normalizedInstances.length - habitCount;
    log(
      "debug",
      `[LOAD] day=${loadDay} total=${normalizedInstances.length} habit=${habitCount} nonhabit=${nonHabitCount} completed=${completedCount} scheduled=${scheduledCount}`
    );

    if (process.env.NODE_ENV !== "production") {
      const inst = normalizedInstances[0];
      log("debug", "SCHEDULER CREATE", {
        start_utc: inst.start_utc,
        timeZone,
        dayKey: dayKeyFromUtc(inst.start_utc, normalizedTz),
        zoned: toZonedTime(new Date(inst.start_utc), normalizedTz),
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      rangeStartUTC: rangeStart.toISOString(),
      rangeEndUTC: rangeEnd.toISOString(),
      lookaheadDays,
      tasks,
      projects: projectList,
      projectSkillIds,
      projectGoalRelations,
      habits,
      skills,
      monuments,
      scheduledProjectIds: resolvedScheduledProjectIds,
      instances: normalizedInstances,
      syncPairings,
      energyLookup,
      priorityLookup,
    };
  } catch (error) {
    throw datasetSectionError("buildScheduleEventDataset", error);
  }
}

async function fetchSkillsForUser(
  userId: string,
  client: Client
): Promise<SkillRow[]> {
  const { data, error } = await client
    .from("skills")
    .select(
      "id, user_id, name, icon, cat_id, monument_id, level, created_at, updated_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as SkillRow[];
}

async function fetchMonumentsForUser(
  userId: string,
  client: Client
): Promise<Monument[]> {
  const { data, error } = await client
    .from("monuments")
    .select("id, title, emoji")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    emoji: row.emoji ?? null,
  }));
}

const DIGIT_PATTERN = /^\d+$/;

function normalizeScheduleInstanceEnergy(
  instances: ScheduleInstance[],
  lookup: Record<string, (typeof ENERGY.LIST)[number]>,
  projectMap: Record<string, ProjectLite>
): ScheduleInstance[] {
  return instances.map((instance) => {
    let energyValue = normalizeEnergyWithLookup(
      instance.energy_resolved,
      lookup
    );
    if (
      (!energyValue || energyValue === "NO") &&
      instance.source_type === "PROJECT" &&
      instance.source_id
    ) {
      const projectEnergy = projectMap[instance.source_id]?.energy;
      const fallback = normalizeEnergyWithLookup(projectEnergy, lookup);
      if (fallback) {
        energyValue = fallback;
      }
    }
    if (energyValue === instance.energy_resolved) {
      return instance;
    }
    return {
      ...instance,
      energy_resolved: energyValue,
    };
  });
}

function normalizeEnergyWithLookup(
  value: unknown,
  lookup: Record<string, (typeof ENERGY.LIST)[number]>
): string {
  if (typeof value === "number") {
    const mapped = lookup[String(value)];
    if (mapped) return mapped;
    const fallback = energyLabelFromIndex(value);
    if (fallback) return fallback;
    return String(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "NO";
    if (DIGIT_PATTERN.test(trimmed)) {
      const mapped = lookup[trimmed];
      if (mapped) return mapped;
      const fallback = energyLabelFromIndex(trimmed);
      return fallback ?? trimmed;
    }
    const upper = trimmed.toUpperCase();
    if (lookup[upper]) return lookup[upper];
    return upper;
  }
  return "NO";
}

function normalizeEnergyLookup(
  source: Record<string, string>
): Record<string, (typeof ENERGY.LIST)[number]> {
  const map: Record<string, (typeof ENERGY.LIST)[number]> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!key) continue;
    const normalized = normalizeEnergyValue(value);
    map[key] = normalized;
    map[normalized] = normalized;
  }
  // Ensure default mapping exists for numeric IDs even if lookup table is empty
  ENERGY.LIST.forEach((label, index) => {
    const key = String(index + 1);
    if (!map[key]) {
      map[key] = label;
    }
    map[label] = label;
  });
  return map;
}

function normalizeEnergyValue(
  value?: string | null
): (typeof ENERGY.LIST)[number] {
  if (typeof value !== "string") return "NO";
  const upper = value.trim().toUpperCase();
  return ENERGY.LIST.includes(upper as (typeof ENERGY.LIST)[number])
    ? (upper as (typeof ENERGY.LIST)[number])
    : "NO";
}

function normalizePriorityLookup(
  source: Record<string, string>
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!key || typeof value !== "string") continue;
    map[key] = value.toUpperCase();
  }
  return map;
}

function energyLabelFromIndex(
  value: number | string
): (typeof ENERGY.LIST)[number] | null {
  const numeric =
    typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) return null;
  const label = ENERGY.LIST[numeric - 1];
  return label ?? null;
}
