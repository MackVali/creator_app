"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { EmptyState } from "./empty-state";
import { getProjectsForUser } from "@/lib/queries/projects";
import { getGoalById } from "@/lib/queries/goals";
import { Card, CardContent } from "./card";
import { ProjectCard } from "./ProjectCard";

interface Project {
  id: string;
  name: string;
  goal_id: string;
  priority: string;
  energy: string;
  stage: string;
  duration_min: number | null;
  created_at: string;
}

interface ProjectWithGoal extends Project {
  goal_name: string;
}

export function ProjectList() {
  const [projects, setProjects] = useState<ProjectWithGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = getSupabaseBrowser();

  const loadProjects = useCallback(async () => {
    if (!supabase) {
      console.error("Supabase client not available");
      setLoading(false);
      return;
    }

    try {
      console.log("Loading projects...");
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error("User not authenticated:", userError);
        setLoading(false);
        return;
      }

      console.log("User authenticated:", user.id);

      const projectsData = await getProjectsForUser(user.id);

      // Enrich projects with goal names
      const projectsWithGoals = await Promise.all(
        projectsData.map(async (project) => {
          const goal = await getGoalById(project.goal_id);
          return {
            ...project,
            goal_name: goal?.name || "Unknown Goal",
          };
        })
      );

      console.log("Projects data:", projectsWithGoals);
      setProjects(projectsWithGoals);
    } catch (error) {
      console.error("Error loading projects:", error);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-4 bg-gray-700 rounded w-3/4 mb-2"></div>
              <div className="flex gap-2">
                <div className="h-6 bg-gray-700 rounded w-16"></div>
                <div className="h-6 bg-gray-700 rounded w-16"></div>
                <div className="h-6 bg-gray-700 rounded w-24"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        title="No projects yet"
        description="Start by creating your first project under a goal."
      />
    );
  }

  return (
    <div className="space-y-4">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}
