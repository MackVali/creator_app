"use client";

import { getSupabaseBrowser } from "@/lib/supabase";
import type { Database } from "../../../types/supabase";
import { getWindowsForDate, type WindowRow } from "@/lib/scheduler/windows";
import {
  ENERGY_LEVELS,
  emptyEnergyTotals,
  type EnergyLevel,
  type EnergyTotals,
} from "@/lib/scheduler/energy";
import { log } from "@/lib/utils/logGate";

export const EMPTY_ENERGY_TOTALS: EnergyTotals = emptyEnergyTotals();

export type JumpToDateSnapshot = {
  energyHours: {
    day: EnergyTotals;
    week: EnergyTotals;
    month: EnergyTotals;
  };
  projected: {
    weekGoalsCompleted?: number;
    monthGoalsCompleted?: number;
    weekLikelyGoals?: Array<{
      id: string;
      title: string;
      emoji?: string | null;
      completionUtc?: string | null;
    }>;
    monthLikelyGoals?: Array<{
      id: string;
      title: string;
      emoji?: string | null;
      completionUtc?: string | null;
    }>;
  };
};

const DEBUG_LIKELY_GOALS = false;

function normalizeEnergy(label?: string | null): EnergyLevel {
  const normalized = String(label ?? "medium").trim().toLowerCase() as EnergyLevel;
  return (ENERGY_LEVELS as readonly string[]).includes(normalized)
    ? normalized
    : "medium";
}

function toMinutes(time?: string | null): number {
  const [h = 0, m = 0] = String(time ?? "0:0")
    .split(":")
    .map((part) => Number(part));
  const safeH = Number.isFinite(h) ? h : 0;
  const safeM = Number.isFinite(m) ? m : 0;
  return safeH * 60 + safeM;
}

export function sumEnergyHoursFromWindows(windows: WindowRow[]): EnergyTotals {
  const totalsMin: EnergyTotals = emptyEnergyTotals();

  for (const window of windows) {
    const startMin = toMinutes(window.start_local);
    const endMin = toMinutes(window.end_local);
    const crossesMidnight = endMin < startMin;
    const durationMin = crossesMidnight
      ? Math.max(0, 1440 - startMin + endMin)
      : Math.max(0, endMin - startMin);
    const energy = normalizeEnergy(window.energy);
    totalsMin[energy] += durationMin;
  }

  const toHours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

  const totalsHours: EnergyTotals = emptyEnergyTotals();
  for (const level of ENERGY_LEVELS) {
    totalsHours[level] = toHours(totalsMin[level]);
  }
  return totalsHours;
}

export async function computeEnergyHoursForDateRange(
  dates: Date[],
  userId: string | null | undefined
): Promise<EnergyTotals> {
  if (!userId || dates.length === 0) return emptyEnergyTotals();

  const windowsByDay = await Promise.all(
    dates.map((date) => getWindowsForDate(date, userId))
  );

  const totals: EnergyTotals = emptyEnergyTotals();
  for (const windows of windowsByDay) {
    const dayTotals = sumEnergyHoursFromWindows(windows);
    for (const level of ENERGY_LEVELS) {
      totals[level] += dayTotals[level];
    }
  }

  const rounded: EnergyTotals = emptyEnergyTotals();
  for (const level of ENERGY_LEVELS) {
    rounded[level] = Math.round(totals[level] * 10) / 10;
  }
  return rounded;
}


type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];

type ScheduledInstanceRow = {
  source_id?: string | null;
  start_utc?: string | null;
};

type GoalInstanceTotals = Map<
  string,
  {
    total: number;
    week: number;
    month: number;
    weekCompletionMs: number | null;
    monthCompletionMs: number | null;
  }
>;

async function fetchScheduledInstancesByType(
  userId: string,
  supabase: ReturnType<typeof getSupabaseBrowser>,
  sourceType: Database["public"]["Enums"]["schedule_instance_source_type"]
): Promise<ScheduledInstanceRow[]> {
  const { data, error } = await supabase
    .from("schedule_instances")
    .select("source_id, start_utc")
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .eq("source_type", sourceType);
  if (error) throw error;
  return (data ?? []) as ScheduledInstanceRow[];
}

async function fetchHabitGoalMap(
  userId: string,
  supabase: ReturnType<typeof getSupabaseBrowser>
) {
  const { data, error } = await supabase
    .from("habits")
    .select("id, goal_id")
    .eq("user_id", userId)
    .not("goal_id", "is", null);
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const habitId = row?.id;
    const goalId = row?.goal_id;
    if (habitId && goalId) {
      map.set(habitId, goalId);
    }
  }
  return map;
}

async function fetchIncompleteProjectsByGoal(
  userId: string,
  supabase: ReturnType<typeof getSupabaseBrowser>
) {
  const { data, error } = await supabase
    .from("projects")
    .select("id, goal_id")
    .eq("user_id", userId)
    .is("completed_at", null);
  if (error) throw error;
  const map = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const project = row as Pick<ProjectRow, "id" | "goal_id">;
    const goalId = project.goal_id;
    if (!goalId || !project.id) continue;
    if (!map.has(goalId)) {
      map.set(goalId, new Set());
    }
    map.get(goalId)?.add(project.id);
  }
  return map;
}

export async function computeProjectedGoalsLikely(
  weekStart: Date,
  weekEnd: Date,
  monthStart: Date,
  monthEnd: Date,
  userId: string | null | undefined
): Promise<{
  weekGoalIds: Set<string>;
  monthGoalIds: Set<string>;
  weekLikelyGoals: Array<{
    id: string;
    title: string;
    emoji?: string | null;
    completionUtc?: string | null;
  }>;
  monthLikelyGoals: Array<{
    id: string;
    title: string;
    emoji?: string | null;
    completionUtc?: string | null;
  }>;
}> {
  if (!userId)
    return {
      weekGoalIds: new Set(),
      monthGoalIds: new Set(),
      weekLikelyGoals: [],
      monthLikelyGoals: [],
    };
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error("Supabase client not available");

  const [
    incompleteByGoal,
    projectInstances,
    habitInstances,
    habitGoalMap,
  ] = await Promise.all([
    fetchIncompleteProjectsByGoal(userId, supabase),
    fetchScheduledInstancesByType(userId, supabase, "PROJECT"),
    fetchScheduledInstancesByType(userId, supabase, "HABIT"),
    fetchHabitGoalMap(userId, supabase),
  ]);

  const projectToGoal = new Map<string, string>();
  for (const [goalId, projectIds] of incompleteByGoal.entries()) {
    for (const projectId of projectIds) {
      projectToGoal.set(projectId, goalId);
    }
  }

  const goalTotals: GoalInstanceTotals = new Map();
  const weekStartMs = weekStart.getTime();
  const weekEndMs = weekEnd.getTime();
  const monthStartMs = monthStart.getTime();
  const monthEndMs = monthEnd.getTime();

  const getTot = (goalId: string) => {
    const existing = goalTotals.get(goalId);
    if (existing) return existing;
    const next = {
      total: 0,
      week: 0,
      month: 0,
      weekCompletionMs: null,
      monthCompletionMs: null,
    };
    goalTotals.set(goalId, next);
    return next;
  };

  const recordItem = (goalId: string, startMs: number) => {
    const totals = getTot(goalId);
    totals.total += 1;
    if (startMs >= weekStartMs && startMs < weekEndMs) {
      totals.week += 1;
      if (!totals.weekCompletionMs || startMs > totals.weekCompletionMs) {
        totals.weekCompletionMs = startMs;
      }
    }
    if (startMs >= monthStartMs && startMs < monthEndMs) {
      totals.month += 1;
      if (!totals.monthCompletionMs || startMs > totals.monthCompletionMs) {
        totals.monthCompletionMs = startMs;
      }
    }
  };

  const toMillis = (instance: ScheduledInstanceRow): number | null => {
    if (!instance.start_utc) return null;
    const parsed = Date.parse(instance.start_utc);
    return Number.isFinite(parsed) ? parsed : null;
  };

  for (const inst of projectInstances) {
    const projectId = inst.source_id;
    if (!projectId) continue;
    const goalId = projectToGoal.get(projectId);
    if (!goalId) continue;
    const startMs = toMillis(inst);
    if (!startMs) continue;
    recordItem(goalId, startMs);
  }

  for (const inst of habitInstances) {
    const habitId = inst.source_id;
    if (!habitId) continue;
    const goalId = habitGoalMap.get(habitId);
    if (!goalId) continue;
    const startMs = toMillis(inst);
    if (!startMs) continue;
    recordItem(goalId, startMs);
  }

  type LikelyMatchInternal = {
    id: string;
    completionUtc: string | null;
    timeMs: number | null;
  };

  const buildMatches = (horizon: "week" | "month") => {
    const matches: LikelyMatchInternal[] = [];
    for (const [goalId, totals] of goalTotals.entries()) {
      if (totals.total === 0) continue;
      const horizonCount = horizon === "week" ? totals.week : totals.month;
      if (horizonCount === 0 || horizonCount !== totals.total) continue;
      const completionMs = horizon === "week" ? totals.weekCompletionMs : totals.monthCompletionMs;
      matches.push({
        id: goalId,
        completionUtc: completionMs ? new Date(completionMs).toISOString() : null,
        timeMs: completionMs,
      });
    }
    matches.sort((a, b) =>
      (a.timeMs ?? Number.MAX_SAFE_INTEGER) - (b.timeMs ?? Number.MAX_SAFE_INTEGER)
    );
    return matches;
  };

  const weekMatches = buildMatches("week");
  const weekGoalIds = new Set(weekMatches.map((entry) => entry.id));
  const monthMatchesRaw = buildMatches("month");
  const monthMatches = monthMatchesRaw.filter((entry) => !weekGoalIds.has(entry.id));
  const monthGoalIds = new Set(monthMatches.map((entry) => entry.id));

  if (DEBUG_LIKELY_GOALS) {
    const goalsConsidered = goalTotals.size;
    const weekCount = weekMatches.length;
    const monthCount = monthMatches.length;
    log("debug", "[ProjectedGoalsLikely]", {
      goalsConsidered,
      weekCount,
      monthCount,
      sampleWeek: weekMatches.slice(0, 5),
      sampleMonth: monthMatches.slice(0, 5),
    });
  }

  return {
    weekGoalIds,
    monthGoalIds,
    weekLikelyGoals: weekMatches.map((entry) => ({
      id: entry.id,
      title: "",
      emoji: null,
      completionUtc: entry.completionUtc,
    })),
    monthLikelyGoals: monthMatches.map((entry) => ({
      id: entry.id,
      title: "",
      emoji: null,
      completionUtc: entry.completionUtc,
    })),
  };
}
