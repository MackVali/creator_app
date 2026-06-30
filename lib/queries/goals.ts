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
  circle_id?: string | null;
  monumentEmoji?: string | null;
  roadmap_id?: string | null;
  weight?: number | null;
  weight_boost?: number | null;
  due_date?: string | null;
  global_rank?: number | null;
  updated_at?: string | null;
}

type GoalQueryRow = Goal & {
  monument?: {
    emoji?: string | null;
  } | null;
};

export async function getGoalsForUser(userId: string): Promise<Goal[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("goals")
    .select(
      "id, name, emoji, priority, energy, priority_code, energy_code, why, created_at, active, status, monument_id, circle_id, roadmap_id, weight, weight_boost, due_date, global_rank, updated_at, monument:monuments(emoji)"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching goals:", error);
    throw error;
  }

  return (
    ((data ?? []) as GoalQueryRow[]).map((goal) => ({
      ...goal,
      monumentEmoji: goal?.monument?.emoji ?? null,
    }))
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
      "id, name, emoji, priority, energy, priority_code, energy_code, why, created_at, active, status, monument_id, circle_id, roadmap_id, due_date, global_rank, updated_at, monument:monuments(emoji)"
    )
    .eq("id", goalId)
    .single();

  if (error) {
    console.error("Error fetching goal:", error);
    return null;
  }

  const goal = data as GoalQueryRow | null;
  return goal ? { ...goal, monumentEmoji: goal.monument?.emoji ?? null } : null;
}

export async function getGoalStatusById(
  goalId: string
): Promise<{ status: string | null; updatedAt: string | null } | null> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("goals")
    .select("status, updated_at")
    .eq("id", goalId)
    .single();

  if (error) {
    console.error("Error fetching goal status:", error);
    return null;
  }
  if (!data) {
    return null;
  }
  const statusRow = data as { status?: unknown; updated_at?: string | null };

  return {
    status: typeof statusRow.status === "string" ? statusRow.status : null,
    updatedAt: statusRow.updated_at ?? null,
  };
}
