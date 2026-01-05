import { getSupabaseBrowser } from "@/lib/supabase";

export interface Goal {
  id: string;
  name: string;
  priority: string;
  energy: string;
  priority_code?: string | null;
  energy_code?: string | null;
  why?: string;
  created_at: string;
  emoji?: string | null;
  active?: boolean;
  status?: string;
  monument_id?: string | null;
  monumentEmoji?: string | null;
  roadmap_id?: string | null;
  weight?: number | null;
  weight_boost?: number | null;
  due_date?: string | null;
}

export async function getGoalsForUser(userId: string): Promise<Goal[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("goals")
    .select(
      "id, name, emoji, priority, energy, priority_code, energy_code, why, created_at, active, status, monument_id, weight, weight_boost, due_date, monument:monuments(emoji)"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching goals:", error);
    throw error;
  }

  return (
    data?.map((goal: any) => ({
      ...goal,
      monumentEmoji: goal?.monument?.emoji ?? null,
    })) ?? []
  );
}

export async function getGoalById(goalId: string): Promise<Goal | null> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("goals")
    .select(
      "id, name, emoji, priority, energy, priority_code, energy_code, why, created_at, active, status, monument_id, due_date, monument:monuments(emoji)"
    )
    .eq("id", goalId)
    .single();

  if (error) {
    console.error("Error fetching goal:", error);
    return null;
  }

  return data
    ? { ...data, monumentEmoji: (data as any)?.monument?.emoji ?? null }
    : null;
}
