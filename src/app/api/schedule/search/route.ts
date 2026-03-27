import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { normalizeHabitType } from "@/lib/scheduler/habits";
import { PROJECT_PRIORITY_WEIGHT } from "@/lib/scheduler/config";

const PAGE_SIZE = 25;
const SORT_OPTIONS = [
  "recent",
  "alphabetical",
  "priority",
  "global_rank",
  "scheduled",
] as const;
type SearchSortMode = (typeof SORT_OPTIONS)[number];

type SearchResult = {
  id: string;
  name: string;
  type: "PROJECT" | "HABIT";
  nextScheduledAt: string | null;
  scheduleInstanceId: string | null;
  durationMinutes: number | null;
  nextDueAt: string | null;
  completedAt: string | null;
  isCompleted: boolean;
  global_rank?: number | null;
  habitType?: string | null;
  goalId?: string | null;
  goalName?: string | null;
  energy?: string | null;
  priority?: string | null;
  priority_label?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
  currentStreakDays?: number | null;
  skillId?: string | null;
  skill_id?: string | null;
  skillIds?: string[];
  monumentId?: string | null;
  monument_id?: string | null;
  goalMonumentId?: string | null;
};

type ProjectSearchRecord = {
  id: string;
  name?: string | null;
  completed_at?: string | null;
  global_rank?: number | null;
  goal_id?: string | null;
  energy?: string | null;
  priority?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type HabitSearchRecord = {
  id: string;
  name?: string | null;
  habit_type?: string | null;
  skill_id?: string | null;
  current_streak_days?: number | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type ProjectSkillRow = {
  project_id: string | null;
  skill_id: string | null;
};

type SkillMonumentRecord = {
  id: string;
  monument_id?: string | null;
};

type ScheduleInstanceRow = {
  id: string;
  source_id: string;
  source_type: "PROJECT" | "HABIT";
  start_utc: string | null;
  duration_min: number | null;
};

type CursorPayload = {
  lastType: "PROJECT" | "HABIT";
  lastId: string;
  sortMode: SearchSortMode;
};

function normalizeQuery(value: string | null): string {
  if (!value) return "";
  return value.trim();
}

function normalizeSortMode(value: string | null): SearchSortMode {
  if (typeof value !== "string") return "recent";
  const normalized = value.toLowerCase();
  return (SORT_OPTIONS.includes(normalized as SearchSortMode)
    ? (normalized as SearchSortMode)
    : "recent");
}

function parseCursor(
  searchParams: URLSearchParams,
  sortMode: SearchSortMode
): CursorPayload | null {
  const raw = searchParams.get("cursorStartUtc");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        (parsed.lastType === "PROJECT" || parsed.lastType === "HABIT") &&
        typeof parsed.lastId === "string" &&
        parsed.lastId.length > 0 &&
        parsed.sortMode === sortMode
      ) {
        return {
          lastType: parsed.lastType,
          lastId: parsed.lastId,
          sortMode,
        };
      }
    } catch {
      // Fall through to fallback parsing
    }
  }
  const fallbackType = searchParams.get("cursorSourceType");
  const fallbackId = searchParams.get("cursorSourceId");
  if (
    (fallbackType === "PROJECT" || fallbackType === "HABIT") &&
    typeof fallbackId === "string" &&
    fallbackId.length > 0
  ) {
    return {
      lastType: fallbackType,
      lastId: fallbackId,
      sortMode,
    };
  }
  return null;
}

function buildCursorPayload(payload: CursorPayload): string {
  return JSON.stringify(payload);
}

function getRecencyTimestamp(record: SearchResult): number {
  const candidates = [
    record.updatedAt,
    record.updated_at,
    record.completedAt,
    record.nextScheduledAt,
  ];
  for (const candidate of candidates) {
    if (candidate) {
      const parsed = Date.parse(candidate);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }
  return Number.NEGATIVE_INFINITY;
}

function normalizeGlobalRank(value?: number | null): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return Number.POSITIVE_INFINITY;
}

function getPriorityWeight(record: SearchResult): number {
  if (record.type === "HABIT") {
    return -1;
  }
  const label = record.priority ?? record.priority_label ?? "";
  if (!label) {
    return 0;
  }
  const trimmed = label.trim();
  const direct = PROJECT_PRIORITY_WEIGHT[trimmed as keyof typeof PROJECT_PRIORITY_WEIGHT];
  if (direct !== undefined) {
    return direct;
  }
  const upperMatch = Object.entries(PROJECT_PRIORITY_WEIGHT).find(
    ([key]) => key.toUpperCase() === trimmed.toUpperCase()
  );
  if (upperMatch) {
    return upperMatch[1];
  }
  return 0;
}

function compareByNameTypeId(a: SearchResult, b: SearchResult): number {
  const nameCompare = a.name.localeCompare(b.name);
  if (nameCompare !== 0) return nameCompare;
  if (a.type !== b.type) {
    return a.type.localeCompare(b.type);
  }
  return a.id.localeCompare(b.id);
}

function sortResults(results: SearchResult[], sortMode: SearchSortMode): SearchResult[] {
  return [...results].sort((a, b) => {
    switch (sortMode) {
      case "alphabetical": {
        return compareByNameTypeId(a, b);
      }
      case "global_rank": {
        const rankDiff = normalizeGlobalRank(a.global_rank) - normalizeGlobalRank(b.global_rank);
        if (rankDiff !== 0) return rankDiff;
        return compareByNameTypeId(a, b);
      }
      case "priority": {
        const weightDiff = getPriorityWeight(b) - getPriorityWeight(a);
        if (weightDiff !== 0) return weightDiff;
        if (a.type !== b.type) {
          return a.type.localeCompare(b.type);
        }
        return compareByNameTypeId(a, b);
      }
      case "scheduled": {
        const aHas = typeof a.nextScheduledAt === "string" && a.nextScheduledAt.length > 0;
        const bHas = typeof b.nextScheduledAt === "string" && b.nextScheduledAt.length > 0;
        if (aHas !== bHas) {
          return aHas ? -1 : 1;
        }
        if (aHas && bHas && a.nextScheduledAt !== b.nextScheduledAt) {
          return a.nextScheduledAt < b.nextScheduledAt ? -1 : 1;
        }
        return compareByNameTypeId(a, b);
      }
      case "recent":
      default: {
        const diff = getRecencyTimestamp(b) - getRecencyTimestamp(a);
        if (diff !== 0) return diff;
        return compareByNameTypeId(a, b);
      }
    }
  });
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client unavailable" },
      { status: 500 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sortMode = normalizeSortMode(searchParams.get("sort"));
  const query = normalizeQuery(searchParams.get("q"));
  const likeQuery = query
    ? `%${query.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`
    : null;
  const cursor = parseCursor(searchParams, sortMode);

  let projectQuery = supabase
    .from("projects")
    .select(
      "id,name,completed_at,global_rank,goal_id,energy,priority,updated_at,created_at"
    )
    .eq("user_id", user.id);
  let habitQuery = supabase
    .from("habits")
    .select(
      "id,name,habit_type,skill_id,current_streak_days,updated_at,created_at"
    )
    .eq("user_id", user.id);
  if (likeQuery) {
    projectQuery = projectQuery.ilike("name", likeQuery);
    habitQuery = habitQuery.ilike("name", likeQuery);
  }

  const [projectResponse, habitResponse] = await Promise.all([
    projectQuery,
    habitQuery,
  ]);

  if (projectResponse.error) {
    console.error("FAB search projects error", projectResponse.error);
    return NextResponse.json(
      { error: "Unable to load projects" },
      { status: 500 }
    );
  }
  if (habitResponse.error) {
    console.error("FAB search habits error", habitResponse.error);
    return NextResponse.json(
      { error: "Unable to load habits" },
      { status: 500 }
    );
  }

  const projectData = (projectResponse.data ?? []) as ProjectSearchRecord[];
  const habitData = (habitResponse.data ?? []) as HabitSearchRecord[];

  if (projectData.length === 0 && habitData.length === 0) {
    return NextResponse.json({ results: [], nextCursor: null });
  }

  const projectIds = projectData
    .map((project) => project?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const habitIds = habitData
    .map((habit) => habit?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const allSourceIds = [...new Set([...projectIds, ...habitIds])];

  const goalIds = new Set<string>();
  for (const project of projectData) {
    if (!project?.id) continue;
    const goalId = project.goal_id;
    if (goalId) {
      goalIds.add(goalId);
    }
  }

  const goalLookup = new Map<string, string>();
  const goalMonumentLookup = new Map<string, string | null>();
  if (goalIds.size > 0) {
    const { data: goalData, error: goalError } = await supabase
      .from("goals")
      .select("id,name,monument_id")
      .eq("user_id", user.id)
      .in("id", Array.from(goalIds));
    if (goalError) {
      console.error("FAB search goals error", goalError);
    } else {
      for (const goal of goalData ?? []) {
        if (!goal?.id) continue;
        if (typeof goal.name === "string") {
          goalLookup.set(goal.id, goal.name);
        }
        goalMonumentLookup.set(goal.id, goal.monument_id ?? null);
      }
    }
  }

  const projectSkillIds = new Map<string, string[]>();
  if (projectIds.length > 0) {
    const { data: projectSkillData, error: projectSkillError } = await supabase
      .from("project_skills")
      .select("project_id,skill_id")
      .in("project_id", projectIds);
    if (projectSkillError) {
      console.error("FAB search project skills error", projectSkillError);
    } else {
      for (const row of (projectSkillData ?? []) as ProjectSkillRow[]) {
        const projectId = row.project_id;
        const skillId = row.skill_id;
        if (!projectId || !skillId) continue;
        const current = projectSkillIds.get(projectId) ?? [];
        if (!current.includes(skillId)) {
          current.push(skillId);
          projectSkillIds.set(projectId, current);
        }
      }
    }
  }

  const allSkillIds = new Set<string>();
  for (const ids of projectSkillIds.values()) {
    ids.forEach((id) => allSkillIds.add(id));
  }
  for (const habit of habitData) {
    if (habit?.skill_id) {
      allSkillIds.add(habit.skill_id);
    }
  }

  const skillMonumentLookup = new Map<string, string | null>();
  if (allSkillIds.size > 0) {
    const { data: skillsData, error: skillsError } = await supabase
      .from("skills")
      .select("id,monument_id")
      .in("id", Array.from(allSkillIds));
    if (skillsError) {
      console.error("FAB search skills metadata error", skillsError);
    } else {
      for (const row of (skillsData ?? []) as SkillMonumentRecord[]) {
        if (!row?.id) continue;
        skillMonumentLookup.set(row.id, row.monument_id ?? null);
      }
    }
  }

  const scheduleMap = new Map<string, ScheduleInstanceRow>();
  if (allSourceIds.length > 0) {
    const scheduleNow = new Date().toISOString();
    const { data: scheduleRows, error: scheduleError } = await supabase
      .from("schedule_instances")
      .select("id,source_id,source_type,start_utc,duration_min")
      .eq("user_id", user.id)
      .in("source_type", ["PROJECT", "HABIT"])
      .in("source_id", allSourceIds)
      .eq("status", "scheduled")
      .gte("start_utc", scheduleNow)
      .order("start_utc", { ascending: true });
    if (scheduleError) {
      console.error("FAB search schedule lookup failed", scheduleError);
      return NextResponse.json(
        { error: "Unable to load schedule metadata" },
        { status: 500 }
      );
    }
    for (const row of scheduleRows ?? []) {
      if (!row) continue;
      const { source_id: sourceId, source_type: sourceType } = row;
      if (!sourceId || !sourceType || !row.start_utc) continue;
      const key = `${sourceType}:${sourceId}`;
      if (scheduleMap.has(key)) continue;
      scheduleMap.set(key, row);
    }
  }

  const results: SearchResult[] = [];
  for (const project of projectData) {
    if (!project?.id) continue;
    const scheduleKey = `PROJECT:${project.id}`;
    const schedule = scheduleMap.get(scheduleKey);
    const completedAt =
      typeof project.completed_at === "string" && project.completed_at.length > 0
        ? project.completed_at
        : null;
    const projectGoalId = project.goal_id ?? null;
    const projectGoalName = projectGoalId
      ? goalLookup.get(projectGoalId) ?? null
      : null;
    const projectGoalMonumentId = projectGoalId
      ? goalMonumentLookup.get(projectGoalId) ?? null
      : null;
    const projectSkills = projectSkillIds.get(project.id) ?? [];
    const projectPrimarySkillId = projectSkills[0] ?? null;
    const normalizedUpdated =
      typeof project.updated_at === "string" && project.updated_at.length > 0
        ? project.updated_at
        : typeof project.created_at === "string" &&
          project.created_at.length > 0
        ? project.created_at
        : null;
    const priorityValue = project.priority ?? null;
    results.push({
      id: project.id,
      name: project.name?.trim() || "Untitled project",
      type: "PROJECT",
      nextScheduledAt: schedule?.start_utc ?? null,
      scheduleInstanceId: schedule?.id ?? null,
      durationMinutes:
        typeof schedule?.duration_min === "number" &&
        Number.isFinite(schedule.duration_min)
          ? schedule.duration_min
          : null,
      nextDueAt: null,
      completedAt,
      isCompleted: typeof completedAt === "string",
      global_rank: project.global_rank ?? null,
      goalId: projectGoalId,
      goalName: projectGoalName,
      energy: project.energy ?? null,
      priority: priorityValue,
      priority_label: priorityValue,
      updatedAt: normalizedUpdated,
      updated_at: normalizedUpdated,
      skillId: projectPrimarySkillId,
      skill_id: projectPrimarySkillId,
      skillIds: projectSkills,
      goalMonumentId: projectGoalMonumentId,
      monumentId: projectGoalMonumentId,
      monument_id: projectGoalMonumentId,
    });
  }
  for (const habit of habitData) {
    if (!habit?.id) continue;
    const scheduleKey = `HABIT:${habit.id}`;
    const schedule = scheduleMap.get(scheduleKey);
    const normalizedUpdated =
      typeof habit.updated_at === "string" && habit.updated_at.length > 0
        ? habit.updated_at
        : typeof habit.created_at === "string" && habit.created_at.length > 0
        ? habit.created_at
        : null;
    const normalizedHabitType = normalizeHabitType(habit.habit_type);
    const habitSkillId = habit.skill_id ?? null;
    const habitMonumentId = habitSkillId
      ? skillMonumentLookup.get(habitSkillId) ?? null
      : null;
    results.push({
      id: habit.id,
      name: habit.name?.trim() || "Untitled habit",
      type: "HABIT",
      nextScheduledAt: schedule?.start_utc ?? null,
      scheduleInstanceId: schedule?.id ?? null,
      durationMinutes:
        typeof schedule?.duration_min === "number" &&
        Number.isFinite(schedule.duration_min)
          ? schedule.duration_min
          : null,
      nextDueAt: null,
      completedAt: null,
      isCompleted: false,
      habitType: normalizedHabitType,
      currentStreakDays:
        typeof habit.current_streak_days === "number" &&
        Number.isFinite(habit.current_streak_days)
          ? habit.current_streak_days
          : null,
      updatedAt: normalizedUpdated,
      updated_at: normalizedUpdated,
      skillId: habitSkillId,
      skill_id: habitSkillId,
      skillIds: habitSkillId ? [habitSkillId] : [],
      monumentId: habitMonumentId,
      monument_id: habitMonumentId,
    });
  }

  const sortedResults = sortResults(results, sortMode);
  let startIndex = 0;
  if (cursor) {
    const index = sortedResults.findIndex(
      (result) => result.type === cursor.lastType && result.id === cursor.lastId
    );
    if (index >= 0) {
      startIndex = index + 1;
    }
  }

  const pagedResults = sortedResults.slice(startIndex, startIndex + PAGE_SIZE);
  const hasMore = startIndex + PAGE_SIZE < sortedResults.length;
  const lastItem = pagedResults[pagedResults.length - 1] ?? null;
  const nextCursor = hasMore && lastItem
    ? {
        startUtc: buildCursorPayload({
          lastType: lastItem.type,
          lastId: lastItem.id,
          sortMode,
        }),
        sourceType: lastItem.type,
        sourceId: lastItem.id,
      }
    : null;

  return NextResponse.json({ results: pagedResults, nextCursor });
}
