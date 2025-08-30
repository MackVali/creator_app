import { getSupabaseBrowser } from "@/lib/supabase";

export interface Goal {
  id: string;
  name: string;
  priority: string;
  energy: string;
  why?: string;
  created_at: string;
  active: boolean;
  status: string;
}

export async function getGoalsForUser(userId: string): Promise<Goal[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("goals")
    .select("id, name, priority, energy, why, created_at, active, status")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching goals:", error);
    throw error;
  }

  return data || [];
}

export async function getGoalById(goalId: string): Promise<Goal | null> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("goals")
    .select("id, name, priority, energy, why, created_at, active, status")
    .eq("id", goalId)
    .single();

  if (error) {
    console.error("Error fetching goal:", error);
    return null;
  }

  return data;
}
