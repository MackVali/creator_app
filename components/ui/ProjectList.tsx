"use client";

import { useState, useEffect } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Badge } from "./badge";
import { Card, CardContent } from "./card";
import { EmptyState } from "./empty-state";
import { getProjectsForUser } from "@/lib/queries/projects";
import { getGoalById } from "@/lib/queries/goals";
import { EnergyFlame, EnergyLevel } from "@/components/ui/EnergyFlame";

interface Project {
  id: string;
  name: string;
  goal_id: string;
  priority: string;
  energy: EnergyLevel;
  stage: string;
  created_at: string;
}

interface ProjectWithGoal extends Project {
  goal_name: string;
}

export function ProjectList() {
  const [projects, setProjects] = useState<ProjectWithGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = getSupabaseBrowser();

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
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
  };

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
        <Card
          key={project.id}
          className="hover:bg-gray-800/50 transition-colors"
        >
          <CardContent className="p-4">
            <div className="relative mb-2">
              <h3 className="font-medium text-white pr-12">{project.name}</h3>
              <div className="absolute top-0 right-0 flex items-center gap-2 pointer-events-none">
                <EnergyFlame level={project.energy as EnergyLevel} />
                <Badge variant="outline" className="text-xs pointer-events-auto">
                  {project.goal_name}
                </Badge>
              </div>
            </div>
            <div className="flex gap-2">
              <Badge variant={getPriorityVariant(project.priority)}>
                {project.priority}
              </Badge>
              <Badge variant={getEnergyVariant(project.energy)}>
                {project.energy}
              </Badge>
              <Badge variant="secondary">{project.stage}</Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function getPriorityVariant(
  priority: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (priority) {
    case "CRITICAL":
    case "ULTRA-CRITICAL":
      return "destructive";
    case "HIGH":
      return "default";
    case "MEDIUM":
      return "secondary";
    default:
      return "outline";
  }
}

function getEnergyVariant(
  energy: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (energy) {
    case "EXTREME":
      return "destructive";
    case "ULTRA":
      return "default";
    case "HIGH":
      return "secondary";
    default:
      return "outline";
  }
}
