"use client";

import { useEffect, useState } from "react";
import { Folder, FileText } from "lucide-react";
import { Card, CardContent } from "./card";
import { Progress } from "./Progress";
import { Button } from "./button";
import { Input } from "./input";
import { Badge } from "./badge";
import { getSupabaseBrowser } from "@/lib/supabase";
import { getGoalsForUser, type Goal } from "@/lib/queries/goals";
import { getProjectsForGoal, type Project } from "@/lib/queries/projects";
import { getTasksForProject, type Task } from "@/lib/queries/tasks";

interface ProjectWithTasks extends Project {
  tasks: Task[];
}

interface GoalWithProjects extends Goal {
  projects: ProjectWithTasks[];
}

export function GoalsContainer() {
  const [goals, setGoals] = useState<GoalWithProjects[]>([]);
  const [expandedGoals, setExpandedGoals] = useState<Record<string, boolean>>({});
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [newProjectName, setNewProjectName] = useState<Record<string, string>>({});
  const [newTaskName, setNewTaskName] = useState<Record<string, string>>({});

  useEffect(() => {
    loadGoals();
  }, []);

  const loadGoals = async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const goalsData = await getGoalsForUser(user.id);
    setGoals(goalsData.map((g) => ({ ...g, projects: [] })));
  };

  const toggleGoal = async (goalId: string) => {
    const isExpanded = expandedGoals[goalId];
    setExpandedGoals((prev) => ({ ...prev, [goalId]: !isExpanded }));
    if (!isExpanded) {
      const goal = goals.find((g) => g.id === goalId);
      if (goal && goal.projects.length === 0) {
        const projects = await getProjectsForGoal(goalId);
        const projectsWithTasks = await Promise.all(
          projects.map(async (p) => ({ ...p, tasks: await getTasksForProject(p.id) }))
        );
        setGoals((prev) =>
          prev.map((g) => (g.id === goalId ? { ...g, projects: projectsWithTasks } : g))
        );
      }
    }
  };

  const toggleProject = async (projectId: string, goalId: string) => {
    const isExpanded = expandedProjects[projectId];
    setExpandedProjects((prev) => ({ ...prev, [projectId]: !isExpanded }));
    if (!isExpanded) {
      const goal = goals.find((g) => g.id === goalId);
      const project = goal?.projects.find((p) => p.id === projectId);
      if (project && project.tasks.length === 0) {
        const tasks = await getTasksForProject(projectId);
        setGoals((prev) =>
          prev.map((g) =>
            g.id === goalId
              ? {
                  ...g,
                  projects: g.projects.map((p) =>
                    p.id === projectId ? { ...p, tasks } : p
                  ),
                }
              : g
          )
        );
      }
    }
  };

  const addProject = async (goalId: string) => {
    const name = newProjectName[goalId];
    if (!name) return;
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("projects")
      .insert({ name, goal_id: goalId, user_id: user.id })
      .select()
      .single();
    if (!error && data) {
      setGoals((prev) =>
        prev.map((g) =>
          g.id === goalId ? { ...g, projects: [...g.projects, { ...data, tasks: [] }] } : g
        )
      );
      setNewProjectName((p) => ({ ...p, [goalId]: "" }));
    }
  };

  const addTask = async (projectId: string, goalId: string) => {
    const name = newTaskName[projectId];
    if (!name) return;
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("tasks")
      .insert({ name, project_id: projectId, user_id: user.id, status: "todo" })
      .select()
      .single();
    if (!error && data) {
      setGoals((prev) =>
        prev.map((g) => {
          if (g.id !== goalId) return g;
          return {
            ...g,
            projects: g.projects.map((p) =>
              p.id === projectId ? { ...p, tasks: [...p.tasks, data] } : p
            ),
          };
        })
      );
      setNewTaskName((p) => ({ ...p, [projectId]: "" }));
    }
  };

  const toggleTaskStatus = async (
    goalId: string,
    projectId: string,
    task: Task
  ) => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    const newStatus = task.status === "done" ? "todo" : "done";
    const { error } = await supabase
      .from("tasks")
      .update({ status: newStatus })
      .eq("id", task.id);
    if (!error) {
      setGoals((prev) =>
        prev.map((g) => {
          if (g.id !== goalId) return g;
          return {
            ...g,
            projects: g.projects.map((p) =>
              p.id === projectId
                ? {
                    ...p,
                    tasks: p.tasks.map((t) =>
                      t.id === task.id ? { ...t, status: newStatus } : t
                    ),
                  }
                : p
            ),
          };
        })
      );
    }
  };

  const projectProgress = (project: ProjectWithTasks) => {
    if (project.tasks.length === 0) return 0;
    const completed = project.tasks.filter((t) => t.status === "done").length;
    return (completed / project.tasks.length) * 100;
  };

  const goalProgress = (goal: GoalWithProjects) => {
    const tasks = goal.projects.flatMap((p) => p.tasks);
    if (tasks.length === 0) return 0;
    const completed = tasks.filter((t) => t.status === "done").length;
    return (completed / tasks.length) * 100;
  };

  return (
    <div className="space-y-4">
      {goals.map((goal) => (
        <Card key={goal.id} className="bg-gray-900/50">
          <CardContent className="p-4">
            <button
              className="w-full flex items-center justify-between"
              onClick={() => toggleGoal(goal.id)}
            >
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-gray-400" />
                <span className="font-medium text-left text-white">
                  {goal.name}
                </span>
              </div>
              <div className="w-32">
                <Progress value={goalProgress(goal)} />
              </div>
            </button>
            {expandedGoals[goal.id] && (
              <div className="mt-4 space-y-4">
                {goal.projects.length > 0 ? (
                  goal.projects.map((project) => (
                    <div key={project.id} className="border-l border-gray-700 pl-4">
                      <button
                        className="w-full flex items-center justify-between"
                        onClick={() => toggleProject(project.id, goal.id)}
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-white">
                            {project.name}
                          </span>
                          <Badge variant="outline" className="ml-2 text-xs">
                            {goal.name}
                          </Badge>
                        </div>
                        <div className="w-24">
                          <Progress value={projectProgress(project)} />
                        </div>
                      </button>
                      {expandedProjects[project.id] && (
                        <div className="mt-2 ml-6 space-y-2">
                          {project.tasks.length > 0 ? (
                            project.tasks.map((task) => (
                              <div
                                key={task.id}
                                className="flex items-center justify-between py-1"
                              >
                                <label className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={task.status === "done"}
                                    onChange={() =>
                                      toggleTaskStatus(goal.id, project.id, task)
                                    }
                                  />
                                  <span className="text-sm text-white">
                                    {task.name}
                                  </span>
                                </label>
                                {task.due_date && (
                                  <span className="text-xs text-gray-400">
                                    {new Date(task.due_date).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-gray-400">
                              No tasks yet. Add tasks to break this project down.
                            </p>
                          )}
                          <div className="flex gap-2 mt-2">
                            <Input
                              value={newTaskName[project.id] || ""}
                              onChange={(e) =>
                                setNewTaskName((p) => ({
                                  ...p,
                                  [project.id]: e.target.value,
                                }))
                              }
                              placeholder="+ New Task"
                              className="h-8"
                            />
                            <Button
                              size="sm"
                              onClick={() => addTask(project.id, goal.id)}
                            >
                              Add
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-400 ml-4">
                    No projects yet. Add one to move this goal forward.
                  </p>
                )}
                <div className="flex gap-2 mt-2 ml-4">
                  <Input
                    value={newProjectName[goal.id] || ""}
                    onChange={(e) =>
                      setNewProjectName((p) => ({
                        ...p,
                        [goal.id]: e.target.value,
                      }))
                    }
                    placeholder="+ New Project"
                    className="h-8"
                  />
                  <Button size="sm" onClick={() => addProject(goal.id)}>
                    Add
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
