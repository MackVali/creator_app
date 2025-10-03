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
      "id, name, description, habit_type, recurrence, duration_minutes, created_at, updated_at, window_id, window:windows(id, label, start_local, end_local, energy)"
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Error fetching habits:", error);
    throw error;
  }

  return data || [];
}
