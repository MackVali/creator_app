import { NextRequest, NextResponse } from "next/server";
import type { PostgrestError, PostgrestResponse } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { startOfDayInTimeZone } from "@/lib/scheduler/timezone";
import type {
  AnalyticsActivityEvent,
  AnalyticsHabitSummary,
  AnalyticsKpi,
  AnalyticsKpiId,
  AnalyticsMonument,
  AnalyticsProject,
  AnalyticsRange,
  AnalyticsResponse,
  AnalyticsSkill,
  AnalyticsWindowsSummary,
  AnalyticsScheduleCompletion,
} from "@/types/analytics";

export const runtime = "nodejs";

const RANGE_TO_DAYS: Record<AnalyticsRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

type RawTaskRow = {
  id: string;
  created_at: string | null;
  project_id: string | null;
  stage?: string | null;
  name?: string | null;
  stage_id?: number | null;
  title?: string | null;
};

type RawProjectRow = {
  id: string;
  created_at: string | null;
  updated_at?: string | null;
  name?: string | null;
  title?: string | null;
};

type RawMonumentRow = {
  id: string;
  created_at: string | null;
  updated_at?: string | null;
  title?: string | null;
  name?: string | null;
};

type RawSkillRow = {
  id: string;
  name?: string | null;
  title?: string | null;
  monument_id?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type RawXpEventRow = {
  id: string;
  created_at: string | null;
  amount?: number | null;
  kind?: string | null;
  skill_id?: string | null;
};

type RawHabitRow = {
  id: string;
  created_at: string | null;
  name?: string | null;
  routine_id?: string | null;
};

type RawHabitCompletionRow = {
  habit_id: string | null;
  completion_day: string | null;
  completed_at: string | null;
};

type RawHabitRoutineRow = {
  id: string;
  name?: string | null;
};

type NormalizedTaskRow = {
  id: string;
  created_at: string | null;
  project_id: string | null;
  stage: string | null;
  name: string | null;
};

type NormalizedProjectRow = {
  id: string;
  name: string;
  created_at: string | null;
  updated_at: string | null;
};

type NormalizedMonumentRow = {
  id: string;
  name: string;
  title: string;
  created_at: string | null;
  updated_at: string | null;
};

type NormalizedSkillRow = {
  id: string;
  name: string;
  monument_id: string | null;
  updated_at: string | null;
};

type NormalizedHabitRow = {
  id: string;
  name: string;
  created_at: string | null;
  routine_id: string | null;
};

type NormalizedHabitRoutineRow = {
  id: string;
  name: string;
};

type NormalizedHabitCompletionRow = {
  habit_id: string;
  completion_day: string;
  completed_at: string | null;
};

type RawScheduleInstanceRow = {
  id: string;
  source_id: string | null;
  source_type: string | null;
  start_utc: string | null;
  end_utc: string | null;
  duration_min: number | null;
  energy_resolved?: string | null;
  completed_at: string | null;
};

type NormalizedScheduleInstanceRow = {
  id: string;
  sourceId: string;
  sourceType: ScheduleSourceType;
  startUtc: string;
  endUtc: string;
  durationMinutes: number;
  energy: string | null;
  completedAt: string;
};

type ScheduleSourceType = "PROJECT" | "TASK" | "HABIT";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const requestedRange = url.searchParams.get("range");
  const range: AnalyticsRange = isAnalyticsRange(requestedRange)
    ? requestedRange
    : "30d";

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client not initialized" },
      { status: 500 }
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return NextResponse.json(
      { error: userError.message },
      { status: 500 }
    );
  }

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const days = RANGE_TO_DAYS[range];
  const { start, end, previousStart, previousEnd } = computeDateWindows(days);
  const combinedStartIso = previousStart.toISOString();

  const habitHistoryStart = startOfDay(addDays(end, -365));
  const habitCompletionStart = habitHistoryStart.toISOString().slice(0, 10);

  const [
    xpEventsRes,
    tasksRes,
    projectsRes,
    habitsRes,
    monumentsRes,
    windowsRes,
    skillsRes,
    skillProgressRes,
    goalsRes,
    habitHistoryRes,
    habitRoutinesRes,
    habitCompletionRes,
    recentScheduleInstancesRes,
  ] = await Promise.all([
    supabase
      .from("xp_events")
      .select("id, created_at, amount, kind, skill_id")
      .eq("user_id", user.id)
      .gte("created_at", combinedStartIso)
      .order("created_at", { ascending: false }),
    queryWithFallback(
      () =>
        supabase
          .from("tasks")
          .select("id, created_at, project_id, stage, name")
          .eq("user_id", user.id)
          .gte("created_at", combinedStartIso)
          .order("created_at", { ascending: false }),
      () =>
        supabase
          .from("tasks")
          .select("id, created_at, project_id, stage_id, title")
          .eq("user_id", user.id)
          .gte("created_at", combinedStartIso)
          .order("created_at", { ascending: false })
    ),
    queryWithFallback(
      () =>
        supabase
          .from("projects")
          .select("id, created_at, updated_at, name")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false }),
      () =>
        supabase
          .from("projects")
          .select("id, created_at, title")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
    ),
    queryWithFallback(
      () =>
        supabase
          .from("habits")
          .select("id, created_at, name, routine_id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      () =>
        supabase
          .from("habits")
          .select("id, created_at, name")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
    ),
    queryWithFallback(
      () =>
        supabase
          .from("monuments")
          .select("id, created_at, updated_at, title, name")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false }),
      () =>
        supabase
          .from("monuments")
          .select("id, created_at, title")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
    ),
    supabase
      .from("windows")
      .select("id, created_at, days, start_local, end_local, energy, label")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    queryWithFallback(
      () =>
        supabase
          .from("skills")
          .select("id, name, monument_id, updated_at")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false }),
      () =>
        supabase
          .from("skills")
          .select("id, title, monument_id, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
    ),
    supabase
      .from("skill_progress")
      .select("skill_id, level, prestige, xp_into_level, total_xp, updated_at")
      .eq("user_id", user.id),
    supabase
      .from("goals")
      .select("id, created_at, monument_id, name")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("xp_events")
      .select("created_at")
      .eq("user_id", user.id)
      .eq("kind", "habit")
      .gte("created_at", habitHistoryStart.toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("habit_routines")
      .select("id, name")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("habit_completion_days")
      .select("habit_id, completion_day, completed_at")
      .eq("user_id", user.id)
      .gte("completion_day", habitCompletionStart)
      .order("completion_day", { ascending: true }),
    supabase
      .from("schedule_instances")
      .select(
        "id, source_id, source_type, start_utc, end_utc, duration_min, energy_resolved, completed_at"
      )
      .eq("user_id", user.id)
      .eq("status", "completed")
      .not("completed_at", "is", null)
      .gte("completed_at", start.toISOString())
      .lte("completed_at", end.toISOString())
      .order("completed_at", { ascending: false })
      .limit(12),
  ]);

  const queryError =
    xpEventsRes.error ||
    tasksRes.error ||
    projectsRes.error ||
    habitsRes.error ||
    monumentsRes.error ||
    windowsRes.error ||
    skillsRes.error ||
    skillProgressRes.error ||
    goalsRes.error ||
    habitHistoryRes.error ||
    habitRoutinesRes.error ||
    habitCompletionRes.error ||
    recentScheduleInstancesRes.error;

  if (queryError) {
    return NextResponse.json(
      { error: queryError.message },
      { status: 500 }
    );
  }

  const xpEvents = (xpEventsRes.data ?? []) as RawXpEventRow[];
  const tasks = normalizeTaskRows(tasksRes.data ?? []);
  const projects = normalizeProjectRows(projectsRes.data ?? []);
  const habits = normalizeHabitRows(habitsRes.data ?? []);
  const monuments = normalizeMonumentRows(monumentsRes.data ?? []);
  const windows = windowsRes.data ?? [];
  const skills = normalizeSkillRows(skillsRes.data ?? []);
  const skillProgress = skillProgressRes.data ?? [];
  const goals = goalsRes.data ?? [];
  const habitHistory = habitHistoryRes.data ?? [];
  const habitRoutines = normalizeHabitRoutineRows(habitRoutinesRes.data ?? []);
  const habitCompletions = normalizeHabitCompletionRows(
    habitCompletionRes.data ?? []
  );
  const recentScheduleInstances = normalizeScheduleInstanceRows(
    (recentScheduleInstancesRes.data ??
      []) as RawScheduleInstanceRow[]
  );

  const xpSplit = splitByPeriod(
    xpEvents,
    start,
    end,
    previousStart,
    previousEnd,
    (event) => parseDate(event.created_at)
  );

  const skillXpDuringRange = new Map<string, number>();
  for (const event of xpEvents) {
    if (!event?.skill_id) continue;
    const eventDate = parseDate(event.created_at);
    if (!isWithinRange(eventDate, start, end)) continue;
    const amount = Number(event.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    skillXpDuringRange.set(
      event.skill_id,
      (skillXpDuringRange.get(event.skill_id) ?? 0) + amount
    );
  }

  const taskSplit = splitByPeriod(
    tasks,
    start,
    end,
    previousStart,
    previousEnd,
    (task) => parseDate(task.created_at)
  );

  const projectSplit = splitByPeriod(
    projects,
    start,
    end,
    previousStart,
    previousEnd,
    (project) => parseDate(project.created_at)
  );

  const monumentSplit = splitByPeriod(
    monuments,
    start,
    end,
    previousStart,
    previousEnd,
    (monument) => parseDate(monument.created_at)
  );

  const windowSplit = splitByPeriod(
    windows,
    start,
    end,
    previousStart,
    previousEnd,
    (window) => parseDate(window.created_at)
  );

  const habitSplit = splitByPeriod(
    habits,
    start,
    end,
    previousStart,
    previousEnd,
    (habit) => parseDate(habit.created_at)
  );

  const habitXpSplit = splitByPeriod(
    xpEvents.filter((event) => event.kind === "habit"),
    start,
    end,
    previousStart,
    previousEnd,
    (event) => parseDate(event.created_at)
  );

  const currentXp = xpSplit.current.reduce(
    (sum, event) => sum + (event.amount ?? 0),
    0
  );
  const previousXp = xpSplit.previous.reduce(
    (sum, event) => sum + (event.amount ?? 0),
    0
  );

  const kpis: AnalyticsKpi[] = [
    makeKpi("skill_xp", "Skill XP", currentXp, previousXp),
    makeKpi("tasks", "Tasks", taskSplit.current.length, taskSplit.previous.length),
    makeKpi(
      "projects",
      "Projects",
      projectSplit.current.length,
      projectSplit.previous.length
    ),
    makeKpi(
      "monuments",
      "Monuments",
      monumentSplit.current.length,
      monumentSplit.previous.length
    ),
    makeKpi(
      "windows",
      "Windows",
      windowSplit.current.length,
      windowSplit.previous.length
    ),
    makeKpi(
      "habits",
      "Habit logs",
      habitXpSplit.current.length,
      habitXpSplit.previous.length
    ),
  ];

  const skillProgressMap = new Map(
    skillProgress.map((row) => [row.skill_id, row])
  );

  const rankedSkills: AnalyticsSkill[] = skills
    .map((skill) => {
      const xpGained = skillXpDuringRange.get(skill.id) ?? 0;
      if (xpGained <= 0) {
        return null;
      }
      const progress = skillProgressMap.get(skill.id);
      if (!progress) {
        return {
          id: skill.id,
          name: skill.name,
          level: 1,
          progress: 0,
          updatedAt: skill.updated_at ?? null,
          xpGained,
        } satisfies AnalyticsSkill;
      }

      const cost = skillCost(progress.level ?? 1, progress.prestige ?? 0);
      const percent =
        cost === 0 ? 0 : Math.round(((progress.xp_into_level ?? 0) / cost) * 100);

      return {
        id: skill.id,
        name: skill.name,
        level: progress.level ?? 1,
        progress: clampPercent(percent),
        updatedAt: progress.updated_at ?? skill.updated_at ?? null,
        xpGained,
      } satisfies AnalyticsSkill;
    })
    .filter((skill): skill is AnalyticsSkill => skill !== null)
    .sort((a, b) => b.xpGained - a.xpGained)
    .slice(0, 6);

  const projectIds = projects.map((project) => project.id);
  const projectTasksRes: PostgrestResponse<RawTaskRow> = projectIds.length
    ? await queryWithFallback(
        () =>
          supabase
            .from("tasks")
            .select("id, project_id, stage")
            .eq("user_id", user.id)
            .in("project_id", projectIds),
        () =>
          supabase
            .from("tasks")
            .select("id, project_id, stage_id")
            .eq("user_id", user.id)
            .in("project_id", projectIds)
      )
    : ({ data: [], error: null, status: 200, statusText: "OK" } as PostgrestResponse<RawTaskRow>);

  if (projectTasksRes.error) {
    return NextResponse.json(
      { error: projectTasksRes.error.message },
      { status: 500 }
    );
  }

  const tasksByProject = new Map<string, { total: number; done: number }>();
  const projectTaskRows = normalizeTaskRows(projectTasksRes.data ?? []);
  for (const task of projectTaskRows) {
    if (!task.project_id) continue;
    const bucket = tasksByProject.get(task.project_id) ?? { total: 0, done: 0 };
    bucket.total += 1;
    if (task.stage === "PERFECT") {
      bucket.done += 1;
    }
    tasksByProject.set(task.project_id, bucket);
  }

  const rankedProjects: AnalyticsProject[] = projects
    .map((project) => {
      const stats = tasksByProject.get(project.id) ?? { total: 0, done: 0 };
      const progress =
        stats.total === 0 ? 0 : Math.round((stats.done / stats.total) * 100);
      return {
        id: project.id,
        title: project.name,
        progress,
        tasksDone: stats.done,
        tasksTotal: stats.total,
        updatedAt: project.updated_at ?? project.created_at ?? null,
      } satisfies AnalyticsProject;
    })
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .slice(0, 4);

  const totalSkills = skills.length || 1;
  const skillsPerMonument = new Map<string, number>();
  for (const skill of skills) {
    if (!skill.monument_id) continue;
    skillsPerMonument.set(
      skill.monument_id,
      (skillsPerMonument.get(skill.monument_id) ?? 0) + 1
    );
  }

  const goalsPerMonument = new Map<string, number>();
  for (const goal of goals) {
    if (!goal.monument_id) continue;
    goalsPerMonument.set(
      goal.monument_id,
      (goalsPerMonument.get(goal.monument_id) ?? 0) + 1
    );
  }

  const rankedMonuments: AnalyticsMonument[] = monuments
    .map((monument) => {
      const title = monument.title ?? monument.name ?? "Untitled";
      const linkedSkills = skillsPerMonument.get(monument.id) ?? 0;
      const progress = Math.round((linkedSkills / totalSkills) * 100);
      return {
        id: monument.id,
        title,
        progress: clampPercent(progress),
        goalCount: goalsPerMonument.get(monument.id) ?? 0,
      } satisfies AnalyticsMonument;
    })
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 4);

  let recentScheduleShowcase: AnalyticsScheduleCompletion[] = [];
  if (recentScheduleInstances.length > 0) {
    const instanceIds = recentScheduleInstances.map((instance) => instance.id);
    let cancelledInstanceIds = new Set<string>();
    if (instanceIds.length > 0) {
      const { data: scheduleXpRows, error: scheduleXpError } = await supabase
        .from("xp_events")
        .select("schedule_instance_id, amount")
        .eq("user_id", user.id)
        .in("schedule_instance_id", instanceIds);

      if (scheduleXpError) {
        return NextResponse.json(
          { error: scheduleXpError.message },
          { status: 500 }
        );
      }

      cancelledInstanceIds = collectCancelledScheduleInstances(
        scheduleXpRows ?? []
      );
    }

    const activeInstances = recentScheduleInstances.filter(
      (instance) => !cancelledInstanceIds.has(instance.id)
    );

    if (activeInstances.length > 0) {
      const projectIds = Array.from(
        new Set(
          activeInstances
            .filter((instance) => instance.sourceType === "PROJECT")
            .map((instance) => instance.sourceId)
        )
      );
      const taskIds = Array.from(
        new Set(
          activeInstances
            .filter((instance) => instance.sourceType === "TASK")
            .map((instance) => instance.sourceId)
        )
      );
      const habitIds = Array.from(
        new Set(
          activeInstances
            .filter((instance) => instance.sourceType === "HABIT")
            .map((instance) => instance.sourceId)
        )
      );

      const projectLookupRes =
        projectIds.length > 0
          ? await queryWithFallback(
              () =>
                supabase
                  .from("projects")
                  .select("id, name, title")
                  .eq("user_id", user.id)
                  .in("id", projectIds),
              () =>
                supabase
                  .from("projects")
                  .select("id, title")
                  .eq("user_id", user.id)
                  .in("id", projectIds)
            )
          : null;

      const taskLookupRes =
        taskIds.length > 0
          ? await queryWithFallback(
              () =>
                supabase
                  .from("tasks")
                  .select("id, name")
                  .eq("user_id", user.id)
                  .in("id", taskIds),
              () =>
                supabase
                  .from("tasks")
                  .select("id, title")
                  .eq("user_id", user.id)
                  .in("id", taskIds)
            )
          : null;

      const habitLookupRes =
        habitIds.length > 0
          ? await supabase
              .from("habits")
              .select("id, name")
              .eq("user_id", user.id)
              .in("id", habitIds)
          : null;

      const scheduleLookupError =
        projectLookupRes?.error ||
        taskLookupRes?.error ||
        habitLookupRes?.error;

      if (scheduleLookupError) {
        return NextResponse.json(
          { error: scheduleLookupError.message },
          { status: 500 }
        );
      }

      const projectNameById = new Map<string, string>();
      for (const record of (projectLookupRes?.data ??
        []) as RawProjectRow[]) {
        projectNameById.set(
          record.id,
          normalizeText(record.name, record.title) ?? "Untitled project"
        );
      }

      const taskNameById = new Map<string, string>();
      for (const record of (taskLookupRes?.data ?? []) as RawTaskRow[]) {
        taskNameById.set(
          record.id,
          normalizeText(record.name, record.title) ?? "Untitled task"
        );
      }

      const habitNameById = new Map<string, string>();
      for (const record of (habitLookupRes?.data ?? []) as RawHabitRow[]) {
        habitNameById.set(
          record.id,
          normalizeText(record.name) ?? "Habit session"
        );
      }

      const trimmedInstances = activeInstances.slice(0, 6);
      recentScheduleShowcase = trimmedInstances.map((instance) => {
        let resolvedTitle: string | null = null;
        if (instance.sourceType === "PROJECT") {
          resolvedTitle = projectNameById.get(instance.sourceId) ?? null;
        } else if (instance.sourceType === "TASK") {
          resolvedTitle = taskNameById.get(instance.sourceId) ?? null;
        } else if (instance.sourceType === "HABIT") {
          resolvedTitle = habitNameById.get(instance.sourceId) ?? null;
        }

        return {
          id: instance.id,
          title:
            resolvedTitle ?? fallbackScheduleLabel(instance.sourceType),
          type: SCHEDULE_SOURCE_TYPE_MAP[instance.sourceType],
          completedAt: instance.completedAt,
          startUtc: instance.startUtc,
          endUtc: instance.endUtc,
          durationMinutes: instance.durationMinutes,
          energy: instance.energy,
        } satisfies AnalyticsScheduleCompletion;
      });
    }
  }

  const windowSummary: AnalyticsWindowsSummary = {
    heatmap: buildWindowHeatmap(windows),
    energy: buildEnergyBreakdown(windows),
  };

  const activityEvents = buildActivityFeed({
    xpEvents: xpSplit.current,
    tasks: taskSplit.current,
    projects: projectSplit.current,
    habits: habitSplit.current,
    monuments: monumentSplit.current,
    windows: windowSplit.current,
    goals: goals.filter((goal) =>
      isWithinRange(parseDate(goal.created_at), start, end)
    ),
  });

  const habitSummary = buildHabitSummary({
    completions: habitCompletions,
    habits,
    routines: habitRoutines,
    end,
    fallbackDates: habitHistory
      .map((entry) => entry.created_at)
      .filter(Boolean) as string[],
  });

  const projectVelocity = buildProjectDeliverySeries(
    xpEvents.filter((event) => event.kind === "project"),
    end
  );

  const response: AnalyticsResponse = {
    range,
    generatedAt: new Date().toISOString(),
    kpis,
    skills: rankedSkills,
    projects: rankedProjects,
    monuments: rankedMonuments,
    recentSchedules: recentScheduleShowcase,
    windows: windowSummary,
    activity: activityEvents,
    habit: habitSummary,
    projectVelocity,
  };

  return NextResponse.json(response);
}

function isAnalyticsRange(value: string | null): value is AnalyticsRange {
  return value === "7d" || value === "30d" || value === "90d";
}

function computeDateWindows(days: number) {
  const end = endOfDay(new Date());
  const start = startOfDay(addDays(end, -(days - 1)));
  const previousEnd = endOfDay(addDays(start, -1));
  const previousStart = startOfDay(addDays(previousEnd, -(days - 1)));
  return { start, end, previousStart, previousEnd };
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function startOfDay(date: Date) {
  return startOfDayInTimeZone(date, "UTC");
}

function endOfDay(date: Date) {
  const start = startOfDay(date);
  const nextStart = startOfDay(addDays(start, 1));
  return new Date(nextStart.getTime() - 1);
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizeIsoString(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    if (!value) continue;
    if (parseDate(value)) {
      return value;
    }
  }
  return null;
}

function normalizeText(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return null;
}

function legacyTaskStageToEnum(stageId?: number | null) {
  if (stageId === null || stageId === undefined) return null;
  switch (stageId) {
    case 3:
    case 4:
      return "PERFECT";
    case 2:
      return "PRODUCE";
    case 1:
      return "PREPARE";
    default:
      return null;
  }
}

function normalizeTaskRows(rows: unknown[]): NormalizedTaskRow[] {
  return rows.map((row) => {
    const record = row as RawTaskRow;
    return {
      id: record.id,
      created_at: record.created_at ?? null,
      project_id: record.project_id ?? null,
      stage:
        typeof record.stage === "string"
          ? record.stage
          : legacyTaskStageToEnum(record.stage_id),
      name: normalizeText(record.name, record.title),
    } satisfies NormalizedTaskRow;
  });
}

function normalizeProjectRows(rows: unknown[]): NormalizedProjectRow[] {
  return rows.map((row) => {
    const record = row as RawProjectRow;
    return {
      id: record.id,
      name: normalizeText(record.name, record.title) ?? "Untitled project",
      created_at: record.created_at ?? null,
      updated_at: normalizeIsoString(record.updated_at, record.created_at),
    } satisfies NormalizedProjectRow;
  });
}

function normalizeMonumentRows(rows: unknown[]): NormalizedMonumentRow[] {
  return rows.map((row) => {
    const record = row as RawMonumentRow;
    const primary = normalizeText(record.name, record.title) ?? "Untitled";
    const secondary = normalizeText(record.title, record.name) ?? primary;
    return {
      id: record.id,
      name: primary,
      title: secondary,
      created_at: record.created_at ?? null,
      updated_at: normalizeIsoString(record.updated_at, record.created_at),
    } satisfies NormalizedMonumentRow;
  });
}

function normalizeSkillRows(rows: unknown[]): NormalizedSkillRow[] {
  return rows.map((row) => {
    const record = row as RawSkillRow;
    return {
      id: record.id,
      name: normalizeText(record.name, record.title) ?? "Untitled skill",
      monument_id: record.monument_id ?? null,
      updated_at: normalizeIsoString(record.updated_at, record.created_at),
    } satisfies NormalizedSkillRow;
  });
}

function normalizeHabitRows(rows: unknown[]): NormalizedHabitRow[] {
  return rows.map((row) => {
    const record = row as RawHabitRow;
    return {
      id: record.id,
      name: normalizeText(record.name) ?? "Untitled habit",
      created_at: record.created_at ?? null,
      routine_id: record.routine_id ?? null,
    } satisfies NormalizedHabitRow;
  });
}

function normalizeHabitRoutineRows(
  rows: unknown[]
): NormalizedHabitRoutineRow[] {
  return rows.map((row) => {
    const record = row as RawHabitRoutineRow;
    return {
      id: record.id,
      name: normalizeText(record.name) ?? "Routine",
    } satisfies NormalizedHabitRoutineRow;
  });
}

function normalizeHabitCompletionRows(
  rows: unknown[]
): NormalizedHabitCompletionRow[] {
  return rows
    .map((row) => {
      const record = row as RawHabitCompletionRow;
      if (!record.habit_id || !record.completion_day) {
        return null;
      }
      return {
        habit_id: record.habit_id,
        completion_day: record.completion_day,
        completed_at: record.completed_at ?? null,
      } satisfies NormalizedHabitCompletionRow;
    })
    .filter(
      (row): row is NormalizedHabitCompletionRow =>
        row !== null && typeof row.habit_id === "string"
    );
}

const SCHEDULE_SOURCE_TYPE_MAP: Record<
  ScheduleSourceType,
  AnalyticsScheduleCompletion["type"]
> = {
  PROJECT: "project",
  TASK: "task",
  HABIT: "habit",
};

function normalizeScheduleInstanceRows(
  rows: RawScheduleInstanceRow[]
): NormalizedScheduleInstanceRow[] {
  return rows
    .map((row) => {
      if (typeof row.id !== "string") {
        return null;
      }
      const sourceId =
        typeof row.source_id === "string" ? row.source_id : null;
      const sourceType = normalizeScheduleSourceType(row.source_type);
      const startUtc = normalizeIsoString(row.start_utc);
      const endUtc = normalizeIsoString(row.end_utc);
      const completedAt = normalizeIsoString(row.completed_at);
      if (!sourceId || !sourceType || !startUtc || !endUtc || !completedAt) {
        return null;
      }
      const durationMinutes = deriveDurationMinutes(
        row.duration_min,
        startUtc,
        endUtc
      );
      return {
        id: row.id,
        sourceId,
        sourceType,
        startUtc,
        endUtc,
        durationMinutes,
        energy:
          typeof row.energy_resolved === "string"
            ? row.energy_resolved
            : null,
        completedAt,
      } satisfies NormalizedScheduleInstanceRow;
    })
    .filter(
      (row): row is NormalizedScheduleInstanceRow => row !== null
    );
}

function normalizeScheduleSourceType(
  value: string | null | undefined
): ScheduleSourceType | null {
  if (!value) return null;
  const normalized = value.toUpperCase();
  if (
    normalized === "PROJECT" ||
    normalized === "TASK" ||
    normalized === "HABIT"
  ) {
    return normalized as ScheduleSourceType;
  }
  return null;
}

function deriveDurationMinutes(
  duration: number | null | undefined,
  startUtc: string,
  endUtc: string
) {
  if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) {
    return Math.max(1, Math.round(duration));
  }
  const start = parseDate(startUtc);
  const end = parseDate(endUtc);
  if (!start || !end) {
    return 30;
  }
  const diffMs = end.getTime() - start.getTime();
  const minutes = Math.round(diffMs / (60 * 1000));
  return Math.max(1, minutes);
}

function fallbackScheduleLabel(type: ScheduleSourceType) {
  switch (type) {
    case "PROJECT":
      return "Project focus";
    case "TASK":
      return "Task block";
    case "HABIT":
    default:
      return "Habit session";
  }
}

function collectCancelledScheduleInstances(
  events: Array<{ schedule_instance_id: string | null; amount: number | null }>
) {
  const cancelled = new Set<string>();
  const aggregates = new Map<string, { sum: number; count: number }>();
  for (const event of events) {
    const scheduleId =
      typeof event.schedule_instance_id === "string"
        ? event.schedule_instance_id
        : null;
    if (!scheduleId) continue;
    const amount = Number(event.amount ?? 0);
    const current = aggregates.get(scheduleId);
    if (current) {
      current.sum += amount;
      current.count += 1;
    } else {
      aggregates.set(scheduleId, { sum: amount, count: 1 });
    }
  }
  for (const [id, stats] of aggregates.entries()) {
    if (stats.count > 0 && stats.sum === 0) {
      cancelled.add(id);
    }
  }
  return cancelled;
}

function splitByPeriod<T>(
  items: T[],
  start: Date,
  end: Date,
  previousStart: Date,
  previousEnd: Date,
  getDate: (item: T) => Date | null
) {
  const current: T[] = [];
  const previous: T[] = [];

  for (const item of items) {
    const date = getDate(item);
    if (!date) continue;
    if (isWithinRange(date, start, end)) {
      current.push(item);
    } else if (isWithinRange(date, previousStart, previousEnd)) {
      previous.push(item);
    }
  }

  return { current, previous };
}

function isWithinRange(date: Date | null, start: Date, end: Date) {
  if (!date) return false;
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

function makeKpi(
  id: AnalyticsKpiId,
  label: string,
  current: number,
  previous: number
): AnalyticsKpi {
  return {
    id,
    label,
    value: Math.round(current),
    delta: Math.round(current - previous),
  } satisfies AnalyticsKpi;
}

function skillCost(level: number, prestige: number) {
  const base = (() => {
    if (level >= 1 && level <= 9) return 10;
    if (level >= 10 && level <= 19) return 14;
    if (level >= 20 && level <= 29) return 20;
    if (level >= 30 && level <= 39) return 24;
    if (level >= 40 && level <= 99) return 30;
    if (level === 100) return 50;
    return 30;
  })();

  return base + Math.max(0, prestige ?? 0) * 2;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function buildWindowHeatmap(windows: Array<{
  days?: number[] | null;
  start_local?: string | null;
  end_local?: string | null;
}>) {
  const rows = 7;
  const columns = 4;
  const heatmap = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => 0)
  );

  const bucketBounds = [0, 360, 720, 1080, 1440];

  for (const window of windows) {
    const days = Array.isArray(window.days) ? window.days : [];
    const start = parseMinutes(window.start_local);
    const end = parseMinutes(window.end_local);
    if (start === null || end === null || end <= start) continue;

    for (const day of days) {
      const row = normalizeDayIndex(day);
      if (row === null) continue;

      for (let bucket = 0; bucket < columns; bucket++) {
        const bucketStart = bucketBounds[bucket];
        const bucketEnd = bucketBounds[bucket + 1];
        const overlap = Math.max(
          0,
          Math.min(end, bucketEnd) - Math.max(start, bucketStart)
        );
        if (overlap > 0) {
          heatmap[row][bucket] += overlap;
        }
      }
    }
  }

  const flat = heatmap.flat();
  const max = flat.length ? Math.max(...flat) : 0;

  if (max === 0) {
    return heatmap.map((row) => row.map(() => 0));
  }

  return heatmap.map((row) =>
    row.map((value) => Math.round((value / max) * 100))
  );
}

function parseMinutes(value: string | null | undefined) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    minutes < 0
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

function normalizeDayIndex(value: number) {
  if (!Number.isFinite(value)) return null;
  const normalized = ((Math.round(value) % 7) + 7) % 7;
  return normalized;
}

function buildEnergyBreakdown(
  windows: Array<{ energy?: string | null }>
) {
  const counts = new Map<string, number>();
  for (const window of windows) {
    const key = (window.energy ?? "Unknown").toString();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([label, value]) => ({
    label,
    value,
  }));
}

function buildActivityFeed(input: {
  xpEvents: Array<{ id: string; created_at: string | null; amount?: number | null; kind?: string | null }>;
  tasks: Array<{ id: string; created_at: string | null; name?: string | null }>;
  projects: Array<{ id: string; created_at: string | null; name?: string | null }>;
  habits: Array<{ id: string; created_at: string | null; name?: string | null }>;
  monuments: Array<{ id: string; created_at: string | null; title?: string | null; name?: string | null }>;
  windows: Array<{ id: string; created_at: string | null; label?: string | null }>;
  goals: Array<{ id: string; created_at: string | null; name?: string | null }>;
}): AnalyticsActivityEvent[] {
  const events: AnalyticsActivityEvent[] = [];

  const pushEvent = (id: string, created_at: string | null, label: string) => {
    const date = parseDate(created_at);
    if (!date) return;
    events.push({ id, date: date.toISOString(), label });
  };

  for (const event of input.xpEvents) {
    const kind = event.kind ?? "activity";
    const amount = event.amount ?? 0;
    pushEvent(
      `xp-${event.id}`,
      event.created_at,
      amount
        ? `Gained ${amount} XP from ${kind}`
        : `Logged ${kind} activity`
    );
  }

  for (const task of input.tasks) {
    const name = task.name?.trim();
    pushEvent(
      `task-${task.id}`,
      task.created_at,
      name ? `Created task ${name}` : "Logged a new task"
    );
  }

  for (const project of input.projects) {
    const name = project.name?.trim();
    pushEvent(
      `project-${project.id}`,
      project.created_at,
      name ? `Started project ${name}` : "Created a new project"
    );
  }

  for (const habit of input.habits) {
    const name = habit.name?.trim();
    pushEvent(
      `habit-${habit.id}`,
      habit.created_at,
      name ? `Tracked habit ${name}` : "Logged a habit"
    );
  }

  for (const monument of input.monuments) {
    const title = monument.title ?? monument.name ?? "Monument";
    pushEvent(
      `monument-${monument.id}`,
      monument.created_at,
      `Progressed monument ${title}`
    );
  }

  for (const window of input.windows) {
    const label = window.label?.trim() || "Focus window";
    pushEvent(
      `window-${window.id}`,
      window.created_at,
      `Scheduled ${label}`
    );
  }

  for (const goal of input.goals) {
    const name = goal.name?.trim();
    pushEvent(
      `goal-${goal.id}`,
      goal.created_at,
      name ? `Created goal ${name}` : "Added a new goal"
    );
  }

  return events
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 12);
}

type HabitCompletionEntry = {
  habitId: string;
  timestamp: Date;
  dayIso: string;
};

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const TIME_BUCKETS = [
  { id: "early", label: "Early (before 8am)", startHour: 0, endHour: 8 },
  { id: "morning", label: "Morning (8am-noon)", startHour: 8, endHour: 12 },
  { id: "midday", label: "Midday (noon-3pm)", startHour: 12, endHour: 15 },
  { id: "afternoon", label: "Afternoon (3-6pm)", startHour: 15, endHour: 18 },
  { id: "evening", label: "Evening (6-9pm)", startHour: 18, endHour: 21 },
  { id: "late", label: "Late (after 9pm)", startHour: 21, endHour: 24 },
];

const WEEK_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

function buildHabitSummary({
  completions,
  habits,
  routines,
  end,
  calendarDays = 28,
  heatmapWeeks = 6,
  fallbackDates = [],
}: {
  completions: NormalizedHabitCompletionRow[];
  habits: NormalizedHabitRow[];
  routines: NormalizedHabitRoutineRow[];
  end: Date;
  calendarDays?: number;
  heatmapWeeks?: number;
  fallbackDates?: string[];
}): AnalyticsHabitSummary {
  const baseSummary: AnalyticsHabitSummary = {
    currentStreak: 0,
    longestStreak: 0,
    calendarDays,
    calendarCompleted: [],
    routines: [],
    streakHistory: [],
    bestTimes: [],
    bestDays: [],
    weeklyReflections: [],
  };

  const completionEntries = completions
    .map((entry) => {
      const date =
        parseDate(entry.completed_at) ??
        (entry.completion_day
          ? parseDate(`${entry.completion_day}T12:00:00Z`)
          : null);
      if (!date) {
        return null;
      }
      return {
        habitId: entry.habit_id,
        timestamp: date,
        dayIso: startOfDay(date).toISOString(),
      } satisfies HabitCompletionEntry;
    })
    .filter(
      (entry): entry is HabitCompletionEntry =>
        entry !== null && Boolean(entry.habitId)
    )
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const hasConcreteCompletions = completionEntries.length > 0;

  const fallbackEntries =
    completionEntries.length === 0 && fallbackDates.length > 0
      ? fallbackDates
          .map((iso) => parseDate(iso))
          .filter((date): date is Date => Boolean(date))
          .map((date) => ({
            habitId: "__fallback__",
            timestamp: date,
            dayIso: startOfDay(date).toISOString(),
          }))
      : [];

  const entries =
    completionEntries.length > 0 ? completionEntries : fallbackEntries;

  if (entries.length === 0) {
    return baseSummary;
  }

  const uniqueDayIsos = Array.from(
    new Set(entries.map((entry) => entry.dayIso))
  ).sort();

  const longestStreak = computeLongestRunFromIsoDays(uniqueDayIsos);
  const daySet = new Set(uniqueDayIsos);
  let currentStreak = 0;
  let cursor = startOfDay(end);
  while (daySet.has(cursor.toISOString())) {
    currentStreak += 1;
    cursor = addDays(cursor, -1);
  }

  const calendarStart = startOfDay(addDays(end, -(calendarDays - 1)));
  const calendarCompleted = uniqueDayIsos
    .map((iso) => {
      const date = new Date(iso);
      if (!isWithinRange(date, calendarStart, end)) return null;
      const diff = Math.round(
        (startOfDay(date).getTime() - calendarStart.getTime()) / MS_PER_DAY
      );
      return diff + 1;
    })
    .filter(
      (value): value is number => value !== null && value >= 1 && value <= calendarDays
    )
    .sort((a, b) => a - b);

  const streakHistory = buildStreakHistoryPoints(uniqueDayIsos, end);

  const routineHeatmap =
    hasConcreteCompletions && routines.length > 0
      ? buildRoutineHeatmap({
          entries: completionEntries,
          habits,
          routines,
          end,
          weeks: heatmapWeeks,
        })
      : [];

  const bestTimes = hasConcreteCompletions
    ? buildBestTimes(completionEntries)
    : [];
  const bestDays = hasConcreteCompletions
    ? buildBestDays(completionEntries)
    : [];
  const weeklyReflections = hasConcreteCompletions
    ? buildWeeklyReflections(completionEntries, end)
    : [];

  return {
    currentStreak,
    longestStreak,
    calendarDays,
    calendarCompleted,
    routines: routineHeatmap,
    streakHistory,
    bestTimes,
    bestDays,
    weeklyReflections,
  };
}

function computeLongestRunFromIsoDays(dayIsos: string[]): number {
  if (dayIsos.length === 0) return 0;
  let longest = 0;
  let run = 0;
  let previousDate: Date | null = null;
  for (const iso of dayIsos) {
    const date = new Date(iso);
    if (!previousDate) {
      run = 1;
    } else {
      const diff = Math.round(
        (date.getTime() - previousDate.getTime()) / MS_PER_DAY
      );
      run = diff === 1 ? run + 1 : 1;
    }
    if (run > longest) {
      longest = run;
    }
    previousDate = date;
  }
  return longest;
}

function buildStreakHistoryPoints(
  dayIsos: string[],
  end: Date,
  maxWeeks = 8
): AnalyticsHabitStreakPoint[] {
  if (dayIsos.length === 0) return [];
  const weekMap = new Map<string, { start: Date; value: number }>();
  let run = 0;
  let prevDate: Date | null = null;
  for (const iso of dayIsos) {
    const date = new Date(iso);
    if (!prevDate) {
      run = 1;
    } else {
      const diff = Math.round(
        (date.getTime() - prevDate.getTime()) / MS_PER_DAY
      );
      run = diff === 1 ? run + 1 : 1;
    }
    const weekStart = startOfWeek(date);
    const key = weekStart.toISOString();
    const existing = weekMap.get(key);
    if (!existing || run > existing.value) {
      weekMap.set(key, { start: weekStart, value: run });
    }
    prevDate = date;
  }

  const ordered = Array.from(weekMap.values()).sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );
  const slice = ordered.slice(-maxWeeks);
  return slice.map((entry) => ({
    label: formatWeekLabel(entry.start),
    value: entry.value,
  }));
}

function buildRoutineHeatmap({
  entries,
  habits,
  routines,
  end,
  weeks,
}: {
  entries: HabitCompletionEntry[];
  habits: NormalizedHabitRow[];
  routines: NormalizedHabitRoutineRow[];
  end: Date;
  weeks: number;
}): AnalyticsHabitRoutine[] {
  if (entries.length === 0) return [];
  const routineNames = new Map(routines.map((routine) => [routine.id, routine.name]));
  const habitsByRoutine = new Map<string, string[]>();
  for (const habit of habits) {
    if (!habit.routine_id || !routineNames.has(habit.routine_id)) continue;
    const bucket = habitsByRoutine.get(habit.routine_id) ?? [];
    bucket.push(habit.id);
    habitsByRoutine.set(habit.routine_id, bucket);
  }
  if (habitsByRoutine.size === 0) return [];

  const habitById = new Map(habits.map((habit) => [habit.id, habit]));
  const completionsByDay = new Map<string, Map<string, Set<string>>>();

  for (const entry of entries) {
    const habit = habitById.get(entry.habitId);
    const routineId = habit?.routine_id;
    if (!routineId) continue;
    let routineMap = completionsByDay.get(entry.dayIso);
    if (!routineMap) {
      routineMap = new Map<string, Set<string>>();
      completionsByDay.set(entry.dayIso, routineMap);
    }
    const habitSet = routineMap.get(routineId) ?? new Set<string>();
    habitSet.add(entry.habitId);
    routineMap.set(routineId, habitSet);
  }

  const startWeek = startOfWeek(addDays(end, -7 * (weeks - 1)));
  const result: AnalyticsHabitRoutine[] = [];

  for (const [routineId, routineHabitIds] of habitsByRoutine) {
    const heatmap: number[][] = [];
    for (let weekIndex = 0; weekIndex < weeks; weekIndex += 1) {
      const weekStart = addDays(startWeek, weekIndex * 7);
      const weekRow: number[] = [];
      for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
        const date = addDays(weekStart, dayOffset);
        if (date.getTime() > end.getTime()) {
          weekRow.push(0);
          continue;
        }
        const dayKey = startOfDay(date).toISOString();
        const routineSet =
          completionsByDay.get(dayKey)?.get(routineId) ?? null;
        const matched = routineSet ? routineSet.size : 0;
        const ratio =
          routineHabitIds.length === 0 ? 0 : matched / routineHabitIds.length;
        weekRow.push(Number.isFinite(ratio) ? Number(ratio.toFixed(2)) : 0);
      }
      heatmap.push(weekRow);
    }
    const hasSignal = heatmap.some((week) => week.some((value) => value > 0));
    if (!hasSignal) continue;
    result.push({
      id: routineId,
      name: routineNames.get(routineId) ?? "Routine",
      heatmap,
    });
  }

  return result.slice(0, 4);
}

function buildBestTimes(
  entries: HabitCompletionEntry[]
): AnalyticsHabitPerformance[] {
  if (entries.length === 0) return [];
  const bucketCounts = TIME_BUCKETS.map((bucket) => ({
    ...bucket,
    count: 0,
  }));

  for (const entry of entries) {
    const hours =
      entry.timestamp.getUTCHours() + entry.timestamp.getUTCMinutes() / 60;
    const bucket =
      bucketCounts.find(
        (slot) => hours >= slot.startHour && hours < slot.endHour
      ) ?? bucketCounts[bucketCounts.length - 1];
    bucket.count += 1;
  }

  const total = entries.length || 1;
  return bucketCounts
    .filter((bucket) => bucket.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map(
      (bucket) =>
        ({
          label: bucket.label,
          successRate: bucket.count / total,
        }) satisfies AnalyticsHabitPerformance
    );
}

function buildBestDays(
  entries: HabitCompletionEntry[]
): AnalyticsHabitPerformance[] {
  if (entries.length === 0) return [];
  const counts = Array.from({ length: 7 }, () => 0);
  for (const entry of entries) {
    const dayIndex = entry.timestamp.getUTCDay();
    counts[dayIndex] += 1;
  }
  const total = entries.length || 1;
  return counts
    .map((count, index) => ({
      label: DAY_LABELS[index],
      successRate: count / total,
      count,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(
      (item) =>
        ({
          label: item.label,
          successRate: item.successRate,
        }) satisfies AnalyticsHabitPerformance
    );
}

function buildWeeklyReflections(
  entries: HabitCompletionEntry[],
  end: Date,
  maxWeeks = 4
): AnalyticsHabitWeeklyReflection[] {
  const reflections: AnalyticsHabitWeeklyReflection[] = [];
  if (entries.length === 0) return reflections;

  const entriesByWeek = new Map<string, HabitCompletionEntry[]>();
  for (const entry of entries) {
    const weekKey = startOfWeek(entry.timestamp).toISOString();
    const bucket = entriesByWeek.get(weekKey) ?? [];
    bucket.push(entry);
    entriesByWeek.set(weekKey, bucket);
  }

  const startWeek = startOfWeek(end);
  for (let offset = 0; offset < maxWeeks; offset += 1) {
    const weekStart = addDays(startWeek, -7 * offset);
    const weekEnd = addDays(weekStart, 6);
    const key = weekStart.toISOString();
    const weekEntries = entriesByWeek.get(key) ?? [];
    if (weekEntries.length === 0) {
      continue;
    }
    const dayIsoSet = Array.from(
      new Set(
        weekEntries
          .map((entry) => entry.dayIso)
          .filter((iso) => {
            const date = new Date(iso);
            return isWithinRange(date, weekStart, weekEnd);
          })
      )
    ).sort();
    const weekStreak = computeLongestRunFromIsoDays(dayIsoSet);
    const dayCounts = Array.from({ length: 7 }, () => 0);
    for (const entry of weekEntries) {
      dayCounts[entry.timestamp.getUTCDay()] += 1;
    }
    const bestDayIndex = dayCounts.reduce(
      (best, value, index) => (value > dayCounts[best] ? index : best),
      0
    );
    const bestDayLabel = dayCounts[bestDayIndex] > 0 ? DAY_LABELS[bestDayIndex] : "—";
    const lesson = buildReflectionLesson(weekStreak, bestDayLabel, weekEntries.length);
    const recommendation = buildReflectionRecommendation(weekStreak);

    reflections.push({
      id: `week-${key}`,
      weekLabel: formatWeekRange(weekStart),
      streak: weekStreak,
      bestDay: bestDayLabel,
      lesson,
      pinned: offset === 0,
      recommendation,
    });
  }

  return reflections;
}

function startOfWeek(date: Date) {
  const start = startOfDay(date);
  const weekday = start.getUTCDay();
  const diff = (weekday + 6) % 7;
  return addDays(start, -diff);
}

function formatWeekLabel(date: Date) {
  return `Week of ${WEEK_LABEL_FORMATTER.format(date)}`;
}

function formatWeekRange(start: Date) {
  const end = addDays(start, 6);
  const startLabel = WEEK_LABEL_FORMATTER.format(start);
  const endLabel = WEEK_LABEL_FORMATTER.format(end);
  return `${startLabel} – ${endLabel}`;
}

function buildReflectionLesson(
  streak: number,
  bestDay: string,
  total: number
) {
  if (streak >= 6) {
    return `Locked in a ${streak}-day streak. Keep the chain going.`;
  }
  if (streak >= 3) {
    return `Momentum clustered around ${bestDay}. Extend it to nearby days.`;
  }
  if (total >= 3) {
    return `Logged ${total} times—batching around ${bestDay} works.`;
  }
  return "Light week. Plan deliberate check-ins earlier to regain flow.";
}

function buildReflectionRecommendation(streak: number) {
  if (streak >= 6) {
    return "Experiment with tougher goals or longer sessions.";
  }
  if (streak >= 3) {
    return "Aim to add one more consecutive day next week.";
  }
  return "Schedule two back-to-back check-ins to spark a new streak.";
}

function buildProjectDeliverySeries(
  events: Array<{ created_at: string | null }>,
  end: Date
): number[] {
  const segments = 7;
  const series = Array.from({ length: segments }, () => 0);
  const start = startOfDay(addDays(end, -(segments - 1)));

  for (const event of events) {
    const date = parseDate(event.created_at);
    if (!date) continue;
    if (!isWithinRange(date, start, end)) continue;
    const diff = Math.round(
      (startOfDay(date).getTime() - start.getTime()) / MS_PER_DAY
    );
    if (diff >= 0 && diff < segments) {
      series[diff] += 1;
    }
  }

  return series;
}

function shouldFallbackToLegacySchema(error: PostgrestError) {
  return error.code === "42703" || error.code === "42P01";
}

async function queryWithFallback<T>(
  primary: () => Promise<PostgrestResponse<T>>,
  fallback?: () => Promise<PostgrestResponse<T>>
): Promise<PostgrestResponse<T>> {
  const result = await primary();
  if (result.error && fallback && shouldFallbackToLegacySchema(result.error)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Analytics query falling back to legacy schema", {
        code: result.error.code,
        message: result.error.message,
      });
    }
    const fallbackResult = await fallback();
    if (!fallbackResult.error) {
      return fallbackResult;
    }
    return fallbackResult;
  }
  return result;
}
