import { getSupabaseBrowser } from "@/lib/supabase";

export interface Project {
  id: string;
  name: string;
  goal_id: string;
  priority: string;
  energy: string;
  stage: string;
  why?: string;
  duration_min: number | null;
  created_at: string;
  due_date?: string | null;
}

export async function getProjectsForGoal(goalId: string): Promise<Project[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, name, goal_id, priority, energy, stage, why, duration_min, created_at, due_date"
    )
    .eq("goal_id", goalId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching projects for goal:", error);
    throw error;
  }

  return (data || []).map((project) => ({
    ...project,
    due_date: project.due_date ?? null,
  }));
}

export async function getProjectsForUser(userId: string): Promise<Project[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, name, goal_id, priority, energy, stage, why, duration_min, created_at, due_date"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching projects for user:", error);
    throw error;
  }

  return (data || []).map((project) => ({
    ...project,
    due_date: project.due_date ?? null,
  }));
}

export async function getProjectById(
  projectId: string
): Promise<Project | null> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, name, goal_id, priority, energy, stage, why, duration_min, created_at, due_date"
    )
    .eq("id", projectId)
    .single();

  if (error) {
    console.error("Error fetching project:", error);
    return null;
  }

  return data
    ? {
        ...data,
        due_date: data.due_date ?? null,
      }
    : null;
}
