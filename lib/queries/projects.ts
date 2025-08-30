import { getSupabaseBrowser } from "@/lib/supabase";

export interface Project {
  id: string;
  name: string;
  goal_id: string;
  priority: string;
  energy: string;
  stage: string;
  status?: string;
  description?: string;
  created_at: string;
}

export async function getProjectsForGoal(goalId: string): Promise<Project[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, name, goal_id, priority, energy, stage, description, status, created_at"
    )
    .eq("goal_id", goalId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching projects for goal:", error);
    throw error;
  }

  return data || [];
}

export async function getProjectsForUser(userId: string): Promise<Project[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, name, goal_id, priority, energy, stage, description, status, created_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching projects for user:", error);
    throw error;
  }

  return data || [];
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
      "id, name, goal_id, priority, energy, stage, description, status, created_at"
    )
    .eq("id", projectId)
    .single();

  if (error) {
    console.error("Error fetching project:", error);
    return null;
  }

  return data;
}
