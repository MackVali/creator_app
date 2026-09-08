"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AREA_CARD_STATUS_REFRESH_EVENT } from "@/lib/areas/areaCardStatusEvents";
import { resolveCreatorDay } from "@/lib/creatorDay";
import { evaluateHabitDueOnDate } from "@/lib/scheduler/habitRecurrence";
import { fetchHabitsForSchedule, type HabitScheduleItem } from "@/lib/scheduler/habits";
import { getSupabaseBrowser } from "@/lib/supabase";

export type AreaCardStatus = "neutral" | "red" | "orange" | "green";

type AreaMetric = {
  dueHabits: number;
  completedDueHabits: number;
  hasOtherCompletionToday: boolean;
};

type AreaSkillRow = {
  area_id: string | null;
  skill_id: string | null;
};

type HabitCompletionRow = {
  habit_id: string | null;
  completion_day: string | null;
  completed_at: string | null;
};

type MyListCompletionRow = {
  skill_id: string | null;
};

type GoalAreaRow = {
  id: string;
  area_id: string | null;
};

type ProjectCompletionRow = {
  id: string;
  goal_id: string | null;
};

type TaskCompletionRow = {
  goal_id: string | null;
  project_id: string | null;
};

function getBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

function createAreaMetrics(areaIds: readonly string[]) {
  return areaIds.reduce<Record<string, AreaMetric>>((metrics, areaId) => {
    metrics[areaId] = {
      dueHabits: 0,
      completedDueHabits: 0,
      hasOtherCompletionToday: false,
    };
    return metrics;
  }, {});
}

function resolveStatus(metric: AreaMetric): AreaCardStatus {
  const unfinishedDueHabits = metric.dueHabits - metric.completedDueHabits;
  const hasProgress =
    metric.completedDueHabits > 0 || metric.hasOtherCompletionToday;

  if (unfinishedDueHabits > 0) {
    return hasProgress ? "orange" : "red";
  }

  return hasProgress ? "green" : "neutral";
}

function markAreaProgress(
  metrics: Record<string, AreaMetric>,
  areaId?: string | null,
) {
  if (!areaId || !metrics[areaId]) return;
  metrics[areaId].hasOtherCompletionToday = true;
}

function applyAreaSkills(
  metrics: Record<string, AreaMetric>,
  areaBySkillId: Map<string, string>,
  skillIds: Array<string | null>,
) {
  for (const skillId of skillIds) {
    if (!skillId) continue;
    markAreaProgress(metrics, areaBySkillId.get(skillId) ?? null);
  }
}

function withPreviousCompletionForToday(
  habit: HabitScheduleItem,
  currentCompletionIds: Set<string>,
  previousCompletionByHabitId: Map<string, string | null>,
): HabitScheduleItem {
  if (!currentCompletionIds.has(habit.id)) return habit;
  return {
    ...habit,
    lastCompletedAt: previousCompletionByHabitId.get(habit.id) ?? null,
  };
}

async function fetchGoalAreas(
  supabase: ReturnType<typeof getSupabaseBrowser>,
  userId: string,
  goalIds: string[],
) {
  if (!supabase || goalIds.length === 0) return new Map<string, string>();

  const { data, error } = await supabase
    .from("goals")
    .select("id,area_id")
    .eq("user_id", userId)
    .in("id", goalIds);

  if (error) throw error;

  return new Map(
    ((data ?? []) as GoalAreaRow[])
      .filter((goal) => goal.id && goal.area_id)
      .map((goal) => [goal.id, goal.area_id!]),
  );
}

export function useAreaCardStatuses({
  areaIds,
  userId,
  profileTimezone,
}: {
  areaIds: readonly string[];
  userId: string | null;
  profileTimezone?: string | null;
}) {
  const [statuses, setStatuses] = useState<Record<string, AreaCardStatus>>({});
  const areaIdsKey = useMemo(() => areaIds.join(","), [areaIds]);
  const normalizedAreaIds = useMemo(
    () => areaIdsKey.split(",").filter(Boolean),
    [areaIdsKey],
  );

  const loadStatuses = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase || !userId) {
      setStatuses({});
      return;
    }

    const creatorDay = resolveCreatorDay({
      profileTimezone,
      deviceTimezone: getBrowserTimezone(),
    });
    const metrics = createAreaMetrics(normalizedAreaIds);
    const dayStart = new Date(creatorDay.startsAt);
    const dayEnd = new Date(creatorDay.endsAt);
    const dueEvaluationDate = new Date(
      dayStart.getTime() + (dayEnd.getTime() - dayStart.getTime()) / 2,
    );

    const habits = await fetchHabitsForSchedule(
      userId,
      supabase as unknown as Parameters<typeof fetchHabitsForSchedule>[1],
    );
    const areaHabitIds = habits
      .filter((habit) => habit.areaId && metrics[habit.areaId])
      .map((habit) => habit.id);

    const [
      currentHabitCompletions,
      previousHabitCompletions,
      myListCompletions,
      completedProjects,
      completedTasks,
    ] = await Promise.all([
      areaHabitIds.length > 0
        ? supabase
            .from("habit_completion_days")
            .select("habit_id,completion_day,completed_at")
            .eq("user_id", userId)
            .eq("completion_day", creatorDay.creatorDayDate)
            .in("habit_id", areaHabitIds)
        : Promise.resolve({ data: [] as HabitCompletionRow[], error: null }),
      areaHabitIds.length > 0
        ? supabase
            .from("habit_completion_days")
            .select("habit_id,completion_day,completed_at")
            .eq("user_id", userId)
            .lt("completion_day", creatorDay.creatorDayDate)
            .in("habit_id", areaHabitIds)
            .order("completion_day", { ascending: false })
            .limit(1000)
        : Promise.resolve({ data: [] as HabitCompletionRow[], error: null }),
      supabase
        .from("my_list_items")
        .select("skill_id")
        .eq("user_id", userId)
        .eq("done", true)
        .not("skill_id", "is", null)
        .gte("completed_at", creatorDay.startsAt)
        .lt("completed_at", creatorDay.endsAt),
      supabase
        .from("projects")
        .select("id,goal_id")
        .eq("user_id", userId)
        .gte("completed_at", creatorDay.startsAt)
        .lt("completed_at", creatorDay.endsAt),
      supabase
        .from("tasks")
        .select("goal_id,project_id")
        .eq("user_id", userId)
        .gte("completed_at", creatorDay.startsAt)
        .lt("completed_at", creatorDay.endsAt),
    ]);

    if (currentHabitCompletions.error) throw currentHabitCompletions.error;
    if (previousHabitCompletions.error) throw previousHabitCompletions.error;
    if (myListCompletions.error) throw myListCompletions.error;
    if (completedProjects.error) throw completedProjects.error;
    if (completedTasks.error) throw completedTasks.error;

    const currentCompletionIds = new Set(
      ((currentHabitCompletions.data ?? []) as HabitCompletionRow[])
        .map((row) => row.habit_id)
        .filter((habitId): habitId is string => Boolean(habitId)),
    );
    const previousCompletionByHabitId = new Map<string, string | null>();
    for (const row of (previousHabitCompletions.data ?? []) as HabitCompletionRow[]) {
      if (!row.habit_id || previousCompletionByHabitId.has(row.habit_id)) {
        continue;
      }
      previousCompletionByHabitId.set(row.habit_id, row.completed_at);
    }

    for (const habit of habits) {
      if (!habit.areaId || !metrics[habit.areaId]) continue;
      const evaluation = evaluateHabitDueOnDate({
        habit: withPreviousCompletionForToday(
          habit,
          currentCompletionIds,
          previousCompletionByHabitId,
        ),
        date: dueEvaluationDate,
        timeZone: creatorDay.timezone,
        windowDays: habit.window?.days ?? null,
        nextDueOverride: habit.nextDueOverride
          ? new Date(habit.nextDueOverride)
          : null,
      });

      if (!evaluation.isDue) continue;

      metrics[habit.areaId].dueHabits += 1;
      if (currentCompletionIds.has(habit.id)) {
        metrics[habit.areaId].completedDueHabits += 1;
      }
    }

    const myListSkillIds = ((myListCompletions.data ?? []) as MyListCompletionRow[])
      .map((row) => row.skill_id)
      .filter((skillId): skillId is string => Boolean(skillId));
    if (myListSkillIds.length > 0) {
      const { data, error } = await supabase
        .from("area_skills")
        .select("area_id,skill_id")
        .eq("user_id", userId)
        .in("skill_id", Array.from(new Set(myListSkillIds)));
      if (error) throw error;
      const areaBySkillId = new Map(
        ((data ?? []) as AreaSkillRow[])
          .filter((row) => row.skill_id && row.area_id)
          .map((row) => [row.skill_id!, row.area_id!]),
      );
      applyAreaSkills(metrics, areaBySkillId, myListSkillIds);
    }

    const projectRows = (completedProjects.data ?? []) as ProjectCompletionRow[];
    const taskRows = (completedTasks.data ?? []) as TaskCompletionRow[];
    const fallbackTaskProjectIds = taskRows
      .filter((task) => !task.goal_id && task.project_id)
      .map((task) => task.project_id!);
    const { data: fallbackProjects, error: fallbackProjectsError } =
      fallbackTaskProjectIds.length > 0
        ? await supabase
            .from("projects")
            .select("id,goal_id")
            .eq("user_id", userId)
            .in("id", Array.from(new Set(fallbackTaskProjectIds)))
        : { data: [] as ProjectCompletionRow[], error: null };
    if (fallbackProjectsError) throw fallbackProjectsError;

    const goalIds = Array.from(
      new Set([
        ...projectRows.map((project) => project.goal_id),
        ...taskRows.map((task) => task.goal_id),
        ...((fallbackProjects ?? []) as ProjectCompletionRow[]).map(
          (project) => project.goal_id,
        ),
      ].filter((goalId): goalId is string => Boolean(goalId))),
    );
    const areaByGoalId = await fetchGoalAreas(supabase, userId, goalIds);
    const goalByFallbackProjectId = new Map(
      ((fallbackProjects ?? []) as ProjectCompletionRow[])
        .filter((project) => project.id && project.goal_id)
        .map((project) => [project.id, project.goal_id!]),
    );

    for (const project of projectRows) {
      markAreaProgress(metrics, areaByGoalId.get(project.goal_id ?? ""));
    }
    for (const task of taskRows) {
      const goalId =
        task.goal_id ?? goalByFallbackProjectId.get(task.project_id ?? "");
      markAreaProgress(metrics, areaByGoalId.get(goalId ?? ""));
    }

    setStatuses(
      normalizedAreaIds.reduce<Record<string, AreaCardStatus>>((nextStatuses, areaId) => {
        nextStatuses[areaId] = resolveStatus(metrics[areaId]);
        return nextStatuses;
      }, {}),
    );
  }, [normalizedAreaIds, profileTimezone, userId]);

  useEffect(() => {
    void loadStatuses().catch((error) => {
      console.error("Failed to load Area card statuses", error);
      setStatuses({});
    });
  }, [loadStatuses]);

  useEffect(() => {
    const refresh = () => {
      void loadStatuses().catch((error) => {
        console.error("Failed to refresh Area card statuses", error);
      });
    };

    window.addEventListener(AREA_CARD_STATUS_REFRESH_EVENT, refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("creator:entity-saved", refresh);

    return () => {
      window.removeEventListener(AREA_CARD_STATUS_REFRESH_EVENT, refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("creator:entity-saved", refresh);
    };
  }, [loadStatuses]);

  return statuses;
}
