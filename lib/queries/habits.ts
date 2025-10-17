import type { PostgrestError } from "@supabase/supabase-js";

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
  goal_id?: string | null;
  temp_completion_target?: number | null;
  temp_completion_count?: number | null;
  skill: {
    id: string;
    name: string;
    icon: string | null;
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

function isMissingTempCompletionColumns(error: PostgrestError | null) {
  if (!error) return false;
  if (error.code === "42703") return true;
  const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return (
    message.includes("temp_completion_target") ||
    message.includes("temp_completion_count")
  );
}

export async function getHabits(userId: string): Promise<Habit[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const baseQuery = supabase
    .from("habits")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  const columnsWithTempAndJoins =
    "id, name, description, habit_type, recurrence, recurrence_days, duration_minutes, created_at, updated_at, skill_id, energy, goal_id, temp_completion_target, temp_completion_count, skill:skills(id, name, icon), routine_id, routine:habit_routines(id, name, description, created_at, updated_at)";
  const columnsWithoutTempButWithJoins =
    "id, name, description, habit_type, recurrence, recurrence_days, duration_minutes, created_at, updated_at, skill_id, energy, goal_id, skill:skills(id, name, icon), routine_id, routine:habit_routines(id, name, description, created_at, updated_at)";
  const columnsWithTempNoJoin =
    "id, name, description, habit_type, recurrence, recurrence_days, duration_minutes, created_at, updated_at, skill_id, energy, goal_id, temp_completion_target, temp_completion_count";
  const columnsWithoutTempNoJoin =
    "id, name, description, habit_type, recurrence, recurrence_days, duration_minutes, created_at, updated_at, skill_id, energy, goal_id";

  let { data, error } = await baseQuery.select(columnsWithTempAndJoins);

  if (error && isMissingTempCompletionColumns(error)) {
    ({ data, error } = await baseQuery.select(columnsWithoutTempButWithJoins));
  }

  if (error) {
    console.warn("Error fetching habits with routines, falling back:", error);

    let fallback = await baseQuery.select(columnsWithTempNoJoin);
    if (fallback.error && isMissingTempCompletionColumns(fallback.error)) {
      fallback = await baseQuery.select(columnsWithoutTempNoJoin);
    }

    if (fallback.error) {
      console.error("Error fetching habits:", fallback.error);
      throw fallback.error;
    }

    return (
      fallback.data?.map((habit) => ({
        ...habit,
        skill_id: habit.skill_id ?? null,
        energy: habit.energy ?? null,
        goal_id: habit.goal_id ?? null,
        temp_completion_target:
          typeof habit.temp_completion_target === "number"
            ? habit.temp_completion_target
            : null,
        temp_completion_count:
          typeof habit.temp_completion_count === "number"
            ? habit.temp_completion_count
            : null,
        skill: null,
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
      goal_id: habit.goal_id ?? null,
      temp_completion_target:
        typeof habit.temp_completion_target === "number"
          ? habit.temp_completion_target
          : null,
      temp_completion_count:
        typeof habit.temp_completion_count === "number"
          ? habit.temp_completion_count
          : null,
      skill: habit.skill
        ? {
            id: habit.skill.id,
            name: habit.skill.name,
            icon: habit.skill.icon ?? null,
          }
        : null,
    })) ?? []
  );
}
