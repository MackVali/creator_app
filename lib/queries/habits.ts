import { getSupabaseBrowser } from "@/lib/supabase";

export interface Habit {
  id: string;
  name: string;
  description: string | null;
  habit_type: string;
  recurrence: string | null;
  recurrence_days: number[] | null;
  duration_minutes: number | null;
  created_at: string;
  updated_at: string;
  skill_id: string | null;
  energy: string | null;
  goal_id: string | null;
  completion_target: number | null;
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
}

export async function getHabits(userId: string): Promise<Habit[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const {
    data: habitRows,
    error: habitError,
  } = await supabase
    .from("habits")
    .select(
      "id, name, description, habit_type, recurrence, recurrence_days, duration_minutes, created_at, updated_at, skill_id, energy, goal_id, completion_target, routine_id"
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (habitError) {
    console.error("Error fetching habits:", habitError);
    throw habitError;
  }

  const rows = habitRows ?? [];

  const skillIds = Array.from(
    new Set(rows.map((habit) => habit.skill_id).filter((id): id is string => Boolean(id)))
  );
  const goalIds = Array.from(
    new Set(rows.map((habit) => habit.goal_id).filter((id): id is string => Boolean(id)))
  );
  const routineIds = Array.from(
    new Set(rows.map((habit) => habit.routine_id).filter((id): id is string => Boolean(id)))
  );

  let skillsData: Array<{ id: string; name: string; icon: string | null }> = [];
  if (skillIds.length > 0) {
    const { data, error } = await supabase
      .from("skills")
      .select("id, name, icon")
      .in("id", skillIds);
    if (error) {
      console.warn("Failed to load skill metadata for habits:", error);
    } else {
      skillsData = data ?? [];
    }
  }

  let goalsData: Array<{ id: string; name: string | null }> = [];
  if (goalIds.length > 0) {
    const { data, error } = await supabase
      .from("goals")
      .select("id, name")
      .in("id", goalIds);
    if (error) {
      console.warn("Failed to load goal metadata for habits:", error);
    } else {
      goalsData = data ?? [];
    }
  }

  let routinesData: Array<{
    id: string;
    name: string;
    description: string | null;
    created_at: string;
    updated_at: string;
  }> = [];
  if (routineIds.length > 0) {
    const { data, error } = await supabase
      .from("habit_routines")
      .select("id, name, description, created_at, updated_at")
      .in("id", routineIds);
    if (error) {
      console.warn("Failed to load routine metadata for habits:", error);
    } else {
      routinesData = data ?? [];
    }
  }

  const skillMap = new Map<string, { id: string; name: string; icon: string | null }>();
  for (const skill of skillsData) {
    if (!skill?.id) continue;
    skillMap.set(skill.id, {
      id: skill.id,
      name: skill.name,
      icon: skill.icon ?? null,
    });
  }

  const goalMap = new Map<string, { id: string; name: string | null }>();
  for (const goal of goalsData) {
    if (!goal?.id) continue;
    goalMap.set(goal.id, {
      id: goal.id,
      name: goal.name ?? null,
    });
  }

  const routineMap = new Map<
    string,
    { id: string; name: string; description: string | null; created_at: string; updated_at: string }
  >();
  for (const routine of routinesData) {
    if (!routine?.id) continue;
    routineMap.set(routine.id, {
      id: routine.id,
      name: routine.name,
      description: routine.description ?? null,
      created_at: routine.created_at,
      updated_at: routine.updated_at,
    });
  }

  return rows.map((habit) => ({
    ...habit,
    skill_id: habit.skill_id ?? null,
    energy: habit.energy ?? null,
    skill: habit.skill_id ? skillMap.get(habit.skill_id) ?? null : null,
    goal_id: habit.goal_id ?? null,
    completion_target: habit.completion_target ?? null,
    goal: habit.goal_id ? goalMap.get(habit.goal_id) ?? null : null,
    routine_id: habit.routine_id ?? null,
    routine: habit.routine_id ? routineMap.get(habit.routine_id) ?? null : null,
  }));
}
