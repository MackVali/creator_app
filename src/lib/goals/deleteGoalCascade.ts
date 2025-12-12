import type { SupabaseClient } from "@supabase/supabase-js";

interface DeleteGoalCascadeOptions {
  supabase: SupabaseClient | null;
  goalId: string;
  userId: string;
}

/**
 * Remove a goal plus its related projects, tasks, and project skills.
 */
export async function deleteGoalCascade({
  supabase,
  goalId,
  userId,
}: DeleteGoalCascadeOptions) {
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data: projectRows, error: projectFetchError } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", userId)
    .eq("goal_id", goalId);

  if (projectFetchError) {
    throw projectFetchError;
  }

  const projectIds = projectRows?.map((project) => project.id) ?? [];

  if (projectIds.length > 0) {
    const { error: deleteTasksError } = await supabase
      .from("tasks")
      .delete()
      .eq("user_id", userId)
      .in("project_id", projectIds);

    if (deleteTasksError) {
      throw deleteTasksError;
    }

    const { error: deleteProjectSkillsError } = await supabase
      .from("project_skills")
      .delete()
      .in("project_id", projectIds);

    if (deleteProjectSkillsError) {
      throw deleteProjectSkillsError;
    }

    const { error: deleteProjectsError } = await supabase
      .from("projects")
      .delete()
      .in("id", projectIds);

    if (deleteProjectsError) {
      throw deleteProjectsError;
    }
  }

  const { error: deleteGoalError } = await supabase
    .from("goals")
    .delete()
    .eq("id", goalId);

  if (deleteGoalError) {
    throw deleteGoalError;
  }
}
