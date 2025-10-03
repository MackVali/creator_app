import { getSupabaseBrowser } from "@/lib/supabase";
import type { HabitRow } from "@/lib/types/habit";

export async function getHabitsForUser(userId: string): Promise<HabitRow[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("habits")
    .select(
      "id, user_id, name, description, habit_type, recurrence, created_at, updated_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching habits:", error);
    throw error;
  }

  return (data ?? []) as HabitRow[];
}
