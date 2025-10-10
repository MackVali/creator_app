import { getSupabaseBrowser } from "@/lib/supabase";

export interface Habit {
  id: string;
  name: string;
  description: string | null;
  habit_type: string;
  recurrence: string | null;
  duration_minutes: number | null;
  created_at: string;
  updated_at: string;
  skill_id: string | null;
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
  window_id: string | null;
  window: {
    id: string;
    label: string;
    start_local: string;
    end_local: string;
    energy: string;
  } | null;
}

export async function getHabits(userId: string): Promise<Habit[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("habits")
    .select(
      "id, name, description, habit_type, recurrence, duration_minutes, created_at, updated_at, skill_id, skill:skills(id, name, icon), routine_id, routine:habit_routines(id, name, description, created_at, updated_at), window_id, window:windows(id, label, start_local, end_local, energy)"
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.warn("Error fetching habits with routines, falling back:", error);

    const fallback = await supabase
      .from("habits")
      .select(
        "id, name, description, habit_type, recurrence, duration_minutes, created_at, updated_at, skill_id, window_id, window:windows(id, label, start_local, end_local, energy)"
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
