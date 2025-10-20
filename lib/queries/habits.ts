import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

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

export async function getHabits(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<Habit[]> {
  const { data, error } = await supabase
    .from("habits")
    .select(
      "id, name, description, habit_type, recurrence, recurrence_days, duration_minutes, created_at, updated_at, skill_id, energy, goal_id, completion_target, skill:skills(id, name, icon), goal:goals(id, name), routine_id, routine:habit_routines(id, name, description, created_at, updated_at)"
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.warn("Error fetching habits with routines, falling back:", error);

    const fallback = await supabase
      .from("habits")
      .select(
        "id, name, description, habit_type, recurrence, recurrence_days, duration_minutes, created_at, updated_at, skill_id, energy, goal_id, completion_target"
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (fallback.error) {
      console.error("Error fetching habits:", fallback.error);
      throw fallback.error;
    }

    return (
      fallback.data?.map((habit) => ({
        ...habit,
        skill_id: habit.skill_id ?? null,
        energy: habit.energy ?? null,
        skill: null,
        goal_id: habit.goal_id ?? null,
        completion_target: habit.completion_target ?? null,
        goal: null,
        routine_id: null,
        routine: null,
      })) || []
    );
  }

  return (
    data?.map((habit) => ({
      ...habit,
      skill_id: habit.skill_id ?? null,
      energy: habit.energy ?? null,
      skill: habit.skill
        ? {
            id: habit.skill.id,
            name: habit.skill.name,
            icon: habit.skill.icon ?? null,
          }
        : null,
      goal_id: habit.goal_id ?? null,
      completion_target: habit.completion_target ?? null,
      goal: habit.goal
        ? {
            id: habit.goal.id,
            name: habit.goal.name ?? null,
          }
        : null,
    })) ?? []
  );
}
