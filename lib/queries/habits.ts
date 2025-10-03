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
}

export async function getHabits(userId: string): Promise<Habit[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("habits")
    .select(
      "id, name, description, habit_type, recurrence, duration_minutes, created_at, updated_at"
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Error fetching habits:", error);
    throw error;
  }

  return data || [];
}
