import { getSupabaseBrowser } from "@/lib/supabase";

export interface Task {
  id: string;
  name: string;
  project_id: string;
  status: string;
  due_date: string | null;
  created_at: string;
}

export async function getTasksForProject(projectId: string): Promise<Task[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("tasks")
    .select("id, name, project_id, status, due_date, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching tasks for project:", error);
    throw error;
  }

  return data || [];
}
