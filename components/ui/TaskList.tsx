"use client";

import { useState, useEffect } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Badge } from "./badge";
import { Card, CardContent } from "./card";
import { EmptyState } from "./empty-state";
import { getProjectsForUser } from "@/lib/queries/projects";
import { getGoalById } from "@/lib/queries/goals";

interface Task {
  id: string;
  name: string;
  project_id: string;
  priority: string;
  energy: string;
  stage: string;
  created_at: string;
}

interface TaskWithContext extends Task {
  project_name: string;
  goal_name: string;
}

export function TaskList() {
  const [tasks, setTasks] = useState<TaskWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = getSupabaseBrowser();

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    if (!supabase) {
      console.error("Supabase client not available");
      setLoading(false);
      return;
    }

    try {
      console.log("Loading tasks...");
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

      // Get all tasks for the user
      const { data: tasksData, error: tasksError } = await supabase
        .from("tasks")
        .select("id, name, project_id, priority, energy, stage, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (tasksError) {
        console.error("Error loading tasks:", tasksError);
        setLoading(false);
        return;
      }

      // Get all projects to map project_id to project details
      const projectsData = await getProjectsForUser(user.id);
      const projectsMap = new Map(projectsData.map((p) => [p.id, p]));

      // Enrich tasks with project and goal context
      const tasksWithContext = await Promise.all(
        (tasksData || []).map(async (task) => {
          const project = projectsMap.get(task.project_id);
          const goal = project ? await getGoalById(project.goal_id) : null;

          return {
            ...task,
            project_name: project?.name || "Unknown Project",
            goal_name: goal?.name || "Unknown Goal",
          };
        })
      );

      console.log("Tasks data:", tasksWithContext);
      setTasks(tasksWithContext);
    } catch (error) {
      console.error("Error loading tasks:", error);
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

  if (tasks.length === 0) {
    return (
      <EmptyState
        title="No tasks yet"
        description="Start by creating your first task under a project."
      />
    );
  }

  return (
    <div className="space-y-4">
      {tasks.map((task) => (
        <Card key={task.id} className="hover:bg-gray-800/50 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-medium text-white">{task.name}</h3>
              <div className="flex flex-col items-end gap-1">
                <Badge variant="outline" className="text-xs">
                  {task.project_name}
                </Badge>
                <Badge variant="outline" className="text-xs text-gray-400">
                  {task.goal_name}
                </Badge>
              </div>
            </div>
            <div className="flex gap-2">
              <Badge variant={getPriorityVariant(task.priority)}>
                {task.priority}
              </Badge>
              <Badge variant={getEnergyVariant(task.energy)}>
                {task.energy}
              </Badge>
              <Badge variant="secondary">{task.stage}</Badge>
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
