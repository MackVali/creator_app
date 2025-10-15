import { NextRequest, NextResponse } from "next/server";
import type { PostgrestError, PostgrestResponse } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase-server";
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
  ] = await Promise.all([
    supabase
      .from("xp_events")
      .select("id, created_at, amount, kind")
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
    supabase
      .from("habits")
      .select("id, created_at, name")
      .eq("user_id", user.id)
      .gte("created_at", combinedStartIso)
      .order("created_at", { ascending: false }),
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
    habitHistoryRes.error;

  if (queryError) {
    return NextResponse.json(
      { error: queryError.message },
      { status: 500 }
    );
  }

  const xpEvents = xpEventsRes.data ?? [];
  const tasks = normalizeTaskRows(tasksRes.data ?? []);
  const projects = normalizeProjectRows(projectsRes.data ?? []);
  const habits = habitsRes.data ?? [];
  const monuments = normalizeMonumentRows(monumentsRes.data ?? []);
  const windows = windowsRes.data ?? [];
  const skills = normalizeSkillRows(skillsRes.data ?? []);
  const skillProgress = skillProgressRes.data ?? [];
  const goals = goalsRes.data ?? [];
  const habitHistory = habitHistoryRes.data ?? [];

  const xpSplit = splitByPeriod(
    xpEvents,
    start,
    end,
    previousStart,
    previousEnd,
    (event) => parseDate(event.created_at)
  );

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
      const progress = skillProgressMap.get(skill.id);
      if (!progress) {
        return {
          id: skill.id,
          name: skill.name,
          level: 1,
          progress: 0,
          updatedAt: skill.updated_at ?? null,
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
      } satisfies AnalyticsSkill;
    })
    .sort((a, b) => {
      if (a.level === b.level) {
        return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
      }
      return b.level - a.level;
    })
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

  const habitSummary = buildHabitSummary(
    habitHistory.map((entry) => entry.created_at).filter(Boolean) as string[],
    end
  );

  const projectVelocity = buildProjectVelocity(taskSplit.current, end);

  const response: AnalyticsResponse = {
    range,
    generatedAt: new Date().toISOString(),
    kpis,
    skills: rankedSkills,
    projects: rankedProjects,
    monuments: rankedMonuments,
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
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setUTCHours(23, 59, 59, 999);
  return next;
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

function buildHabitSummary(
  dates: string[],
  end: Date
): AnalyticsHabitSummary {
  const uniqueDates = Array.from(
    new Set(
      dates
        .map((iso) => startOfDay(new Date(iso)).toISOString())
        .filter((iso) => !Number.isNaN(new Date(iso).getTime()))
    )
  ).sort();

  let longest = 0;
  let currentRun = 0;
  let previousDate: Date | null = null;

  for (const iso of uniqueDates) {
    const date = new Date(iso);
    if (!previousDate) {
      currentRun = 1;
    } else {
      const diff = Math.round(
        (date.getTime() - previousDate.getTime()) / MS_PER_DAY
      );
      currentRun = diff === 1 ? currentRun + 1 : 1;
    }
    if (currentRun > longest) {
      longest = currentRun;
    }
    previousDate = date;
  }

  const completionSet = new Set(uniqueDates);
  let currentStreak = 0;
  let cursor = startOfDay(end);
  while (completionSet.has(cursor.toISOString())) {
    currentStreak += 1;
    cursor = addDays(cursor, -1);
  }

  const calendarDays = 28;
  const calendarStart = startOfDay(addDays(end, -(calendarDays - 1)));
  const calendarCompleted = uniqueDates
    .map((iso) => {
      const date = new Date(iso);
      if (!isWithinRange(date, calendarStart, end)) return null;
      const diff = Math.round(
        (startOfDay(date).getTime() - calendarStart.getTime()) / MS_PER_DAY
      );
      return diff + 1;
    })
    .filter((value): value is number => value !== null);

  return {
    currentStreak,
    longestStreak: longest,
    calendarDays,
    calendarCompleted: Array.from(new Set(calendarCompleted)).sort(
      (a, b) => a - b
    ),
    routines: [],
    streakHistory: [],
    bestTimes: [],
    bestDays: [],
    weeklyReflections: [],
  } satisfies AnalyticsHabitSummary;
}

function buildProjectVelocity(
  tasks: Array<{ created_at: string | null }>,
  end: Date
): number[] {
  const segments = 7;
  const series = Array.from({ length: segments }, () => 0);
  const start = startOfDay(addDays(end, -(segments - 1)));

  for (const task of tasks) {
    const date = parseDate(task.created_at);
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
