import { useState, useEffect } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { GoalItem } from "@/types/dashboard";

interface UseFilteredGoalsOptions {
  entity: "monument" | "skill";
  id: string;
  limit?: number;
}

interface UseFilteredGoalsResult {
  goals: GoalItem[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useFilteredGoals({
  entity,
  id,
  limit = 12,
}: UseFilteredGoalsOptions): UseFilteredGoalsResult {
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = getSupabaseBrowser();

  const fetchGoals = async () => {
    if (!supabase || !id) return;

    setLoading(true);
    setError(null);

    try {
      await supabase.auth.getSession();

      let goalsData: GoalItem[] = [];

      if (entity === "monument") {
        // Direct query for monument goals
        const { data, error } = await supabase
          .from("goals")
          .select("id,name,priority,energy,monument_id,created_at")
          .eq("user_id", (await supabase.auth.getUser()).data.user?.id)
          .eq("monument_id", id)
          .order("priority", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(limit);

        if (error) throw error;
        goalsData = data || [];
      } else if (entity === "skill") {
        // Complex query for skill goals via project_skills and tasks
        const userId = (await supabase.auth.getUser()).data.user?.id;
        if (!userId) throw new Error("User not authenticated");

        // Get distinct goal IDs from both sources
        const goalIds = new Set<string>();

        // 1. Via project_skills → projects → goals
        const { data: projectSkillsData, error: psError } = await supabase
          .from("project_skills")
          .select("project_id")
          .eq("skill_id", id);

        if (psError) throw psError;

        // Get goal IDs from projects that use this skill
        if (projectSkillsData && projectSkillsData.length > 0) {
          const projectIds = projectSkillsData.map((ps) => ps.project_id);
          const { data: projectsData, error: projectsError } = await supabase
            .from("projects")
            .select("goal_id")
            .eq("user_id", userId)
            .in("id", projectIds);

          if (!projectsError && projectsData) {
            projectsData.forEach((project) => {
              if (project.goal_id) {
                goalIds.add(project.goal_id);
              }
            });
          }
        }

        // 2. Via tasks → projects → goals
        const { data: tasksData, error: tasksError } = await supabase
          .from("tasks")
          .select("project_id")
          .eq("skill_id", id);

        if (tasksError) throw tasksError;

        // Get goal IDs from projects that have tasks with this skill
        if (tasksData && tasksData.length > 0) {
          const projectIds = tasksData
            .map((task) => task.project_id)
            .filter(Boolean);
          if (projectIds.length > 0) {
            const { data: projectsData, error: projectsError } = await supabase
              .from("projects")
              .select("goal_id")
              .eq("user_id", userId)
              .in("id", projectIds);

            if (!projectsError && projectsData) {
              projectsData.forEach((project) => {
                if (project.goal_id) {
                  goalIds.add(project.goal_id);
                }
              });
            }
          }
        }

        // Fetch the actual goals data
        if (goalIds.size > 0) {
          const goalIdsArray = Array.from(goalIds);
          const { data: goalsDataResult, error: goalsError } = await supabase
            .from("goals")
            .select("id,name,priority,energy,monument_id,created_at")
            .eq("user_id", userId)
            .in("id", goalIdsArray)
            .order("priority", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(limit);

          if (goalsError) throw goalsError;
          goalsData = goalsDataResult || [];
        }
      }

      setGoals(goalsData);
      setError(null);
    } catch (err) {
      console.error("Error loading goals:", err);
      setError("Failed to load related goals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGoals();
  }, [entity, id, limit]);

  return {
    goals,
    loading,
    error,
    refetch: fetchGoals,
  };
}
