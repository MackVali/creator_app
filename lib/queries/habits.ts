import { getSupabaseBrowser } from "@/lib/supabase";

type GoalMetadataSupportState = "unknown" | "supported" | "unsupported";

let goalMetadataSupport: GoalMetadataSupportState = "unknown";

function shouldIncludeGoalMetadata(maybeError?: unknown): boolean {
  if (goalMetadataSupport === "unsupported") {
    return false;
  }
  if (!maybeError || typeof maybeError !== "object") {
    return goalMetadataSupport !== "unsupported";
  }
  const message =
    "message" in maybeError && typeof maybeError.message === "string"
      ? maybeError.message.toLowerCase()
      : "";
  if (!message) {
    return goalMetadataSupport !== "unsupported";
  }
  const missing =
    message.includes("goal_id") || message.includes("completion_target");
  if (missing) {
    goalMetadataSupport = "unsupported";
  }
  return !missing;
}

function normalizeStreakDayCount(value: unknown): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.round(numeric));
}

type HabitCompletionRow = {
  habit_id: string;
  completion_day: string;
  completed_at: string | null;
};

type HabitStreakStats = {
  current: number;
  longest: number;
  lastCompletedAt: string | null;
};

function diffInDays(a: string, b: string): number {
  const first = Date.parse(`${a}T00:00:00Z`);
  const second = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    return Number.NaN;
  }
  return Math.round((second - first) / 86_400_000);
}

function computeHabitStreakStats(rows: HabitCompletionRow[]): Map<string, HabitStreakStats> {
  const map = new Map<string, HabitCompletionRow[]>();
  for (const row of rows) {
    if (!row.habit_id || !row.completion_day) continue;
    if (!map.has(row.habit_id)) {
      map.set(row.habit_id, []);
    }
    map.get(row.habit_id)!.push(row);
  }

  const stats = new Map<string, HabitStreakStats>();
  for (const [habitId, habitRows] of map) {
    const uniqueDays = Array.from(
      new Set(
        habitRows
          .map((row) => row.completion_day)
          .filter((day): day is string => Boolean(day))
      )
    ).sort();

    let longest = 0;
    let run = 0;
    let prevDay: string | null = null;
    for (const day of uniqueDays) {
      if (!prevDay) {
        run = 1;
      } else {
        const diff = diffInDays(prevDay, day);
        if (Number.isNaN(diff)) {
          run = 1;
        } else if (diff === 0) {
          continue;
        } else if (diff === 1) {
          run += 1;
        } else {
          run = 1;
        }
      }
      longest = Math.max(longest, run);
      prevDay = day;
    }

    let current = 0;
    prevDay = null;
    for (let index = uniqueDays.length - 1; index >= 0; index -= 1) {
      const day = uniqueDays[index];
      if (!prevDay) {
        current = 1;
      } else {
        const diff = diffInDays(day, prevDay);
        if (Number.isNaN(diff)) {
          break;
        }
        if (diff === 0) {
          continue;
        }
        if (diff === 1) {
          current += 1;
        } else {
          break;
        }
      }
      prevDay = day;
    }

    if (uniqueDays.length === 0) {
      current = 0;
      longest = 0;
    }

    const lastCompletedAt = habitRows.reduce<string | null>((latest, row) => {
      if (!row.completed_at) return latest;
      if (!latest) return row.completed_at;
      return Date.parse(row.completed_at) > Date.parse(latest) ? row.completed_at : latest;
    }, null);

    stats.set(habitId, {
      current,
      longest,
      lastCompletedAt:
        lastCompletedAt ??
        (uniqueDays.length ? `${uniqueDays[uniqueDays.length - 1]}T00:00:00.000Z` : null),
    });
  }

  return stats;
}

async function fetchHabitStreakMap(
  client: ReturnType<typeof getSupabaseBrowser>,
  userId: string
): Promise<Map<string, HabitStreakStats>> {
  if (!client) {
    return new Map();
  }

  const { data, error } = await client
    .from("habit_completion_days")
    .select("habit_id, completion_day, completed_at")
    .eq("user_id", userId)
    .order("habit_id", { ascending: true })
    .order("completion_day", { ascending: true });

  if (error) {
    console.error("Failed to load habit completion days", error);
    return new Map();
  }

  return computeHabitStreakStats((data ?? []) as HabitCompletionRow[]);
}

function pickLatestTimestamp(a?: string | null, b?: string | null): string | null {
  const first = a ? Date.parse(a) : Number.NaN;
  const second = b ? Date.parse(b) : Number.NaN;
  if (!Number.isFinite(first) && !Number.isFinite(second)) {
    return a ?? b ?? null;
  }
  if (!Number.isFinite(first)) return b ?? null;
  if (!Number.isFinite(second)) return a ?? null;
  return first >= second ? (a ?? null) : (b ?? null);
}

type HabitRecord = {
  id: string;
  name?: string | null;
  description?: string | null;
  habit_type?: string | null;
  recurrence?: string | null;
  recurrence_days?: number[] | null;
  duration_minutes?: number | null;
  last_completed_at?: string | null;
  current_streak_days?: number | null;
  longest_streak_days?: number | null;
  created_at?: string;
  updated_at?: string;
  skill_id?: string | null;
  energy?: string | null;
  goal_id?: string | null;
  completion_target?: number | null;
  location_context_id?: string | null;
  location_context?: {
    id: string;
    value: string | null;
    label: string | null;
  } | null;
  skill?: {
    id: string;
    name: string;
    icon: string | null;
  } | null;
  goal?: {
    id: string;
    name: string | null;
  } | null;
  routine_id?: string | null;
  routine?: {
    id: string;
    name: string;
    description: string | null;
    created_at: string;
    updated_at: string;
  } | null;
  next_due_override?: string | null;
};

function normalizeHabitRecord(
  habit: HabitRecord,
  supportsGoalMetadata: boolean,
  streakMap: Map<string, HabitStreakStats>
): Habit {
  const streakStats = streakMap.get(habit.id) ?? { current: 0, longest: 0, lastCompletedAt: null };
  const currentStreak = Math.max(
    normalizeStreakDayCount(habit.current_streak_days),
    normalizeStreakDayCount(streakStats.current)
  );
  const longestStreak = Math.max(
    normalizeStreakDayCount(habit.longest_streak_days),
    normalizeStreakDayCount(streakStats.longest)
  );

  const lastCompletedAt = pickLatestTimestamp(
    habit.last_completed_at ?? null,
    streakStats.lastCompletedAt
  );

  return {
    id: habit.id,
    name: habit.name ?? "Untitled habit",
    description: habit.description ?? null,
    habit_type: habit.habit_type ?? "HABIT",
    recurrence: habit.recurrence ?? null,
    recurrence_days: habit.recurrence_days ?? null,
    duration_minutes: habit.duration_minutes ?? null,
    last_completed_at: lastCompletedAt,
    current_streak_days: currentStreak,
    longest_streak_days: longestStreak,
    created_at: habit.created_at ?? "",
    updated_at: habit.updated_at ?? "",
    skill_id: habit.skill_id ?? null,
    energy: habit.energy ?? null,
    goal_id: supportsGoalMetadata ? habit.goal_id ?? null : null,
    completion_target:
      supportsGoalMetadata &&
      typeof habit.completion_target === "number" &&
      Number.isFinite(habit.completion_target)
        ? habit.completion_target
        : null,
    location_context_id: habit.location_context_id ?? null,
    location_context: habit.location_context
      ? {
          id: habit.location_context.id,
          value: habit.location_context.value ?? null,
          label: habit.location_context.label ?? null,
        }
      : null,
    skill: habit.skill
      ? {
          id: habit.skill.id,
          name: habit.skill.name,
          icon: habit.skill.icon ?? null,
        }
      : null,
    goal:
      supportsGoalMetadata && habit.goal
        ? {
            id: habit.goal.id,
            name: habit.goal.name ?? null,
          }
        : null,
    routine_id: habit.routine_id ?? null,
    routine: habit.routine
      ? {
          id: habit.routine.id,
          name: habit.routine.name,
          description: habit.routine.description ?? null,
          created_at: habit.routine.created_at,
          updated_at: habit.routine.updated_at,
        }
      : null,
    next_due_override: habit.next_due_override ?? null,
  };
}

export interface Habit {
  id: string;
  name: string;
  description: string | null;
  habit_type: string;
  recurrence: string | null;
  recurrence_days: number[] | null;
  duration_minutes: number | null;
  last_completed_at: string | null;
  current_streak_days: number;
  longest_streak_days: number;
  created_at: string;
  updated_at: string;
  skill_id: string | null;
  energy: string | null;
  goal_id: string | null;
  completion_target: number | null;
  location_context_id: string | null;
  location_context?: {
    id: string;
    value: string | null;
    label: string | null;
  } | null;
  skill: {
    id: string;
    name: string;
    icon: string | null;
  } | null;
  goal?: {
    id: string;
    name: string | null;
  } | null;
  routine_id?: string | null;
  routine?: {
    id: string;
    name: string;
    description: string | null;
    created_at: string;
    updated_at: string;
  } | null;
  next_due_override: string | null;
}

export async function getHabits(userId: string): Promise<Habit[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const baseColumns =
    "id, name, description, habit_type, recurrence, recurrence_days, duration_minutes, last_completed_at, current_streak_days, longest_streak_days, created_at, updated_at, skill_id, energy, location_context_id, next_due_override";
  const extendedColumns = `${baseColumns}, goal_id, completion_target`;
  let supportsGoalMetadata = goalMetadataSupport !== "unsupported";
  const selectColumns = supportsGoalMetadata ? extendedColumns : baseColumns;

  const primary = await supabase
    .from("habits")
    .select(
      `${selectColumns}, location_context:location_contexts(id, value, label), skill:skills(id, name, icon), goal:goals(id, name), routine_id, routine:habit_routines(id, name, description, created_at, updated_at)`
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  let habitRows: HabitRecord[] = [];

  if (primary.error) {
    const canRetainGoalMetadata = shouldIncludeGoalMetadata(primary.error);
    if (!canRetainGoalMetadata) {
      console.warn(
        "Error fetching habits with goal metadata, retrying without goal fields:",
        primary.error
      );
      const fallback = await supabase
        .from("habits")
        .select(
          `${baseColumns}, location_context:location_contexts(id, value, label), skill:skills(id, name, icon), routine_id, routine:habit_routines(id, name, description, created_at, updated_at)`
        )
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (fallback.error) {
        console.error("Error fetching habits:", fallback.error);
        throw fallback.error;
      }

      goalMetadataSupport = "unsupported";
      supportsGoalMetadata = false;
      habitRows = (fallback.data ?? []) as HabitRecord[];
    } else {
      console.error("Error fetching habits:", primary.error);
      throw primary.error;
    }
  } else {
    habitRows = (primary.data ?? []) as HabitRecord[];
    if (supportsGoalMetadata && goalMetadataSupport === "unknown") {
      goalMetadataSupport = "supported";
    }
  }

  const streakMap = await fetchHabitStreakMap(supabase, userId);

  return habitRows.map((habit) => normalizeHabitRecord(habit, supportsGoalMetadata, streakMap));
}
