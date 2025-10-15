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
  location_context: string | null;
  daylight_preference: string | null;
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

export async function getHabits(userId: string): Promise<Habit[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("habits")
    .select(
      "id, name, description, habit_type, recurrence, recurrence_days, duration_minutes, created_at, updated_at, skill_id, energy, location_context, daylight_preference, skill:skills(id, name, icon), routine_id, routine:habit_routines(id, name, description, created_at, updated_at)"
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.warn("Error fetching habits with routines, falling back:", error);

    const fallback = await supabase
      .from("habits")
      .select(
        "id, name, description, habit_type, recurrence, recurrence_days, duration_minutes, created_at, updated_at, skill_id, energy, location_context, daylight_preference"
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
        location_context: habit.location_context ?? null,
        daylight_preference: habit.daylight_preference ?? null,
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
      location_context: habit.location_context ?? null,
      daylight_preference: habit.daylight_preference ?? null,
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
