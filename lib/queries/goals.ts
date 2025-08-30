import { getSupabaseBrowser } from "@/lib/supabase";

export interface Goal {
  id: string;
  name: string;
  priority: string;
  energy: string;
  why?: string;
  created_at: string;
  is_active: boolean;
}

export async function getGoalsForUser(userId: string): Promise<Goal[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("goals")
    .select("id, name, priority, energy, why, created_at, is_active")
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
    .select("id, name, priority, energy, why, created_at, is_active")
    .eq("id", goalId)
    .single();

  if (error) {
    console.error("Error fetching goal:", error);
    return null;
  }

  return data;
}

export async function updateGoal(
  goalId: string,
  values: Partial<{ name: string; priority: string; why?: string; energy: string; is_active: boolean; due_date?: string; emoji?: string }>
): Promise<void> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }
  const { error } = await supabase.from("goals").update(values).eq("id", goalId);
  if (error) {
    console.error("Error updating goal:", error);
    throw error;
  }
}

export async function toggleGoalActive(goalId: string, active: boolean): Promise<void> {
  return updateGoal(goalId, { is_active: active });
}
