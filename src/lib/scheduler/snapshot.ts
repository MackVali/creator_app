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

async function fetchScheduledProjectActivityInRange(
  start: Date,
  end: Date,
  userId: string,
  supabase: ReturnType<typeof getSupabaseBrowser>
): Promise<{
  scheduledProjectIds: Set<string>;
  lastScheduledStartUtcByProjectId: Map<string, Date>;
}> {
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const { data, error } = await supabase
    .from("schedule_instances")
    .select("source_id, start_utc")
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .eq("source_type", "PROJECT")
    .gte("start_utc", startIso)
    .lt("start_utc", endIso);
  if (error) throw error;
  const ids = new Set<string>();
  const lastScheduledStartUtcByProjectId = new Map<string, Date>();
  for (const row of data ?? []) {
    const id = (row as { source_id?: string | null; start_utc?: string | null })
      .source_id;
    if (id) ids.add(id);
    const startUtc = (row as { start_utc?: string | null }).start_utc;
    if (startUtc) {
      const parsed = new Date(startUtc);
      if (!Number.isNaN(parsed.getTime())) {
        const prev = lastScheduledStartUtcByProjectId.get(id ?? "");
        if (!prev || parsed.getTime() > prev.getTime()) {
          lastScheduledStartUtcByProjectId.set(id ?? "", parsed);
        }
      }
    }
  }
  return { scheduledProjectIds: ids, lastScheduledStartUtcByProjectId };
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

function computeLikelyGoals(
  incompleteProjectIdsByGoal: Map<string, Set<string>>,
  scheduledProjectIds: Set<string>,
  lastScheduledStartUtcByProjectId: Map<string, Date>
): Array<{ id: string; completionUtc: Date }> {
  const result: Array<{ id: string; completionUtc: Date }> = [];
  for (const [goalId, projIds] of incompleteProjectIdsByGoal.entries()) {
    if (projIds.size === 0) continue;
    let latest: Date | null = null;
    for (const pid of projIds) {
      if (!scheduledProjectIds.has(pid)) {
        latest = null;
        break;
      }
      const last = lastScheduledStartUtcByProjectId.get(pid);
      if (!last) {
        latest = null;
        break;
      }
      if (!latest || last.getTime() > latest.getTime()) {
        latest = last;
      }
    }
    if (latest) {
      result.push({ id: goalId, completionUtc: latest });
    }
  }
  return result.sort((a, b) => a.completionUtc.getTime() - b.completionUtc.getTime());
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
    weekActivity,
    monthActivity,
    incompleteByGoal
  ] = await Promise.all([
    fetchScheduledProjectActivityInRange(weekStart, weekEnd, userId, supabase),
    fetchScheduledProjectActivityInRange(monthStart, monthEnd, userId, supabase),
    fetchIncompleteProjectsByGoal(userId, supabase),
  ]);

  const weekGoalMatches = computeLikelyGoals(
    incompleteByGoal,
    weekActivity.scheduledProjectIds,
    weekActivity.lastScheduledStartUtcByProjectId
  );
  const weekGoalIds = new Set(weekGoalMatches.map((g) => g.id));

  const monthGoalMatchesRaw = computeLikelyGoals(
    incompleteByGoal,
    monthActivity.scheduledProjectIds,
    monthActivity.lastScheduledStartUtcByProjectId
  );
  const monthGoalMatches = monthGoalMatchesRaw.filter(
    (g) => !weekGoalIds.has(g.id)
  );
  const monthGoalIds = new Set(monthGoalMatches.map((g) => g.id));

  if (DEBUG_LIKELY_GOALS) {
    const goalsConsidered = incompleteByGoal.size;
    const weekCount = weekGoalMatches.length;
    const monthCount = monthGoalMatches.length;
    const sampleWeek = weekGoalMatches.slice(0, 5);
    const sampleMonth = monthGoalMatches.slice(0, 5);
    // eslint-disable-next-line no-console
    console.log("[ProjectedGoalsLikely]", {
      goalsConsidered,
      weekCount,
      monthCount,
      sampleWeek,
      sampleMonth,
    });
  }

  return {
    weekGoalIds,
    monthGoalIds,
    weekLikelyGoals: weekGoalMatches.map((g) => ({
      id: g.id,
      title: "",
      emoji: null,
      completionUtc: g.completionUtc.toISOString(),
    })),
    monthLikelyGoals: monthGoalMatches.map((g) => ({
      id: g.id,
      title: "",
      emoji: null,
      completionUtc: g.completionUtc.toISOString(),
    })),
  };
}
