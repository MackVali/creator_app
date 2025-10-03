"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { GoalsHeader } from "./components/GoalsHeader";
import {
  GoalsUtilityBar,
  EnergyFilter,
  PriorityFilter,
  SortOption,
} from "./components/GoalsUtilityBar";
import { GoalCard } from "./components/GoalCard";
import { LoadingSkeleton } from "./components/LoadingSkeleton";
import { EmptyState } from "./components/EmptyState";
import { GoalDrawer, type GoalUpdateContext } from "./components/GoalDrawer";
import type { Goal, Project } from "./types";
import { getSupabaseBrowser } from "@/lib/supabase";
import { getGoalsForUser } from "@/lib/queries/goals";
import { getProjectsForUser } from "@/lib/queries/projects";
import { getMonumentsForUser } from "@/lib/queries/monuments";
import { getSkillsForUser } from "@/lib/queries/skills";

function mapPriority(priority: string): Goal["priority"] {
  switch (priority) {
    case "HIGH":
    case "CRITICAL":
    case "ULTRA-CRITICAL":
      return "High";
    case "MEDIUM":
      return "Medium";
    default:
      return "Low";
  }
}

function mapEnergy(energy: string): Goal["energy"] {
  switch (energy) {
    case "LOW":
      return "Low";
    case "MEDIUM":
      return "Medium";
    case "HIGH":
      return "High";
    case "ULTRA":
      return "Ultra";
    case "EXTREME":
      return "Extreme";
    default:
      return "No";
  }
}

function projectStageToStatus(stage: string): Project["status"] {
  switch (stage) {
    case "RESEARCH":
      return "Todo";
    case "RELEASE":
      return "Done";
    default:
      return "In-Progress";
  }
}

function projectStatusToStage(status: Project["status"]): string {
  switch (status) {
    case "Todo":
      return "RESEARCH";
    case "Done":
      return "RELEASE";
    default:
      return "BUILD";
  }
}

function energyToDbValue(energy: Goal["energy"]): string {
  switch (energy) {
    case "Extreme":
      return "EXTREME";
    case "Ultra":
      return "ULTRA";
    case "High":
      return "HIGH";
    case "Medium":
      return "MEDIUM";
    case "Low":
      return "LOW";
    default:
      return "NO";
  }
}

async function syncProjectsAndTasks(
  supabase: SupabaseClient,
  userId: string,
  goalId: string,
  context: GoalUpdateContext
) {
  const { projects, removedProjectIds, removedTaskIds } = context;

  const uniqueRemovedProjectIds = Array.from(new Set(removedProjectIds));
  if (uniqueRemovedProjectIds.length > 0) {
    const { error } = await supabase
      .from("projects")
      .delete()
      .in("id", uniqueRemovedProjectIds);
    if (error) {
      console.error("Error deleting projects:", error);
    }
  }

  const uniqueRemovedTaskIds = Array.from(new Set(removedTaskIds));
  if (uniqueRemovedTaskIds.length > 0) {
    const { error } = await supabase
      .from("tasks")
      .delete()
      .in("id", uniqueRemovedTaskIds);
    if (error) {
      console.error("Error deleting tasks:", error);
    }
  }

  const newProjects = projects.filter((project) => project.isNew);
  if (newProjects.length > 0) {
    const { error } = await supabase.from("projects").insert(
      newProjects.map((project) => ({
        id: project.id,
        name: project.name.trim(),
        goal_id: goalId,
        user_id: userId,
        stage: project.stage ?? projectStatusToStage(project.status),
        energy: project.energyCode ?? energyToDbValue(project.energy),
        priority: project.priorityCode ?? "NO",
      }))
    );
    if (error) {
      console.error("Error inserting projects:", error);
    }
  }

  const existingProjects = projects.filter((project) => !project.isNew);
  if (existingProjects.length > 0) {
    await Promise.all(
      existingProjects.map(async (project) => {
        const { error } = await supabase
          .from("projects")
          .update({
            name: project.name.trim(),
            stage: project.stage ?? projectStatusToStage(project.status),
            energy: project.energyCode ?? energyToDbValue(project.energy),
            priority: project.priorityCode ?? "NO",
          })
          .eq("id", project.id);
        if (error) {
          console.error("Error updating project:", error);
        }
      })
    );
  }

  const taskInserts: {
    id: string;
    name: string;
    stage: string;
    project_id: string;
    user_id: string;
  }[] = [];
  const taskUpdates: {
    id: string;
    name: string;
    stage: string;
    project_id: string;
  }[] = [];

  projects.forEach((project) => {
    project.tasks.forEach((task) => {
      const trimmedName = task.name.trim();
      if (task.isNew) {
        taskInserts.push({
          id: task.id,
          name: trimmedName,
          stage: task.stage,
          project_id: project.id,
          user_id: userId,
        });
      } else {
        taskUpdates.push({
          id: task.id,
          name: trimmedName,
          stage: task.stage,
          project_id: project.id,
        });
      }
    });
  });

  if (taskInserts.length > 0) {
    const { error } = await supabase.from("tasks").insert(taskInserts);
    if (error) {
      console.error("Error inserting tasks:", error);
    }
  }

  if (taskUpdates.length > 0) {
    await Promise.all(
      taskUpdates.map(async (task) => {
        const { error } = await supabase
          .from("tasks")
          .update({
            name: task.name,
            stage: task.stage,
            project_id: task.project_id,
          })
          .eq("id", task.id);
        if (error) {
          console.error("Error updating task:", error);
        }
      })
    );
  }
}

function goalStatusToStatus(status?: string | null): Goal["status"] {
  switch (status) {
    case "COMPLETED":
    case "Completed":
    case "DONE":
      return "Completed";
    case "INACTIVE":
    case "Inactive":
      return "Inactive";
    case "OVERDUE":
    case "Overdue":
      return "Overdue";
    case "ACTIVE":
    case "Active":
    case "IN_PROGRESS":
    case "IN PROGRESS":
    default:
      return "Active";
  }
}

export default function GoalsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [search, setSearch] = useState("");
  const [energy, setEnergy] = useState<EnergyFilter>("All");
  const [priority, setPriority] = useState<PriorityFilter>("All");
  const [sort, setSort] = useState<SortOption>("A→Z");
  const [monuments, setMonuments] = useState<{ id: string; title: string }[]>([]);
  const [skills, setSkills] = useState<{ id: string; name: string }[]>([]);
  const [monument, setMonument] = useState<string>("All");
  const [skill, setSkill] = useState<string>("All");
  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId && goals.length > 0) {
      const goal = goals.find((g) => g.id === editId);
      if (goal) {
        setEditing(goal);
        setDrawer(true);
      }
    }
  }, [searchParams, goals]);

  useEffect(() => {
    const load = async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        setLoading(false);
        return;
      }

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setUserId(null);
          setLoading(false);
          return;
        }

        setUserId(user.id);

        let goalsData: Awaited<ReturnType<typeof getGoalsForUser>> = [];
        try {
          goalsData = await getGoalsForUser(user.id);
        } catch (err) {
          console.error("Error fetching goals:", err);
        }

        let projectsData: Awaited<ReturnType<typeof getProjectsForUser>> = [];
        try {
          projectsData = await getProjectsForUser(user.id);
        } catch (err) {
          console.error("Error fetching projects:", err);
        }

        const projectIds = projectsData.map((p) => p.id);

        let tasksData: {
          id: string;
          project_id: string | null;
          stage: string;
          name: string;
          skill_id: string | null;
        }[] = [];
        try {
          const tasksRes = await supabase
            .from("tasks")
            .select("id, project_id, stage, name, skill_id")
            .eq("user_id", user.id);
          tasksData = tasksRes.data || [];
        } catch (err) {
          console.error("Error fetching tasks:", err);
        }

        let projectSkills: { project_id: string; skill_id: string | null }[] = [];
        try {
          if (projectIds.length > 0) {
            const { data: psData, error: psError } = await supabase
              .from("project_skills")
              .select("project_id, skill_id")
              .in("project_id", projectIds);
            if (psError) throw psError;
            projectSkills = psData || [];
          }
        } catch (err) {
          console.error("Error fetching project skills:", err);
        }

        let monumentsData: Awaited<ReturnType<typeof getMonumentsForUser>> = [];
        try {
          monumentsData = await getMonumentsForUser(user.id);
        } catch (err) {
          console.error("Error fetching monuments:", err);
        }

        let skillsData: Awaited<ReturnType<typeof getSkillsForUser>> = [];
        try {
          skillsData = await getSkillsForUser(user.id);
        } catch (err) {
          console.error("Error fetching skills:", err);
        }

        const tasksByProject = tasksData.reduce(
          (
            acc: Record<
              string,
              { id: string; name: string; stage: string; skill_id: string | null }[]
            >,
            task
          ) => {
            if (!task.project_id) return acc;
            acc[task.project_id] = acc[task.project_id] || [];
            acc[task.project_id].push({
              id: task.id,
              name: task.name,
              stage: task.stage,
              skillId: task.skill_id ?? null,
            });
            return acc;
          },
          {}
        );

        const skillsByProject: Record<string, Set<string>> = {};
        projectSkills.forEach((ps) => {
          if (!skillsByProject[ps.project_id]) {
            skillsByProject[ps.project_id] = new Set();
          }
          if (ps.skill_id) {
            skillsByProject[ps.project_id].add(ps.skill_id);
          }
        });

        Object.entries(tasksByProject).forEach(([pid, tasks]) => {
          tasks.forEach((t) => {
            if (t.skillId) {
              skillsByProject[pid] = skillsByProject[pid] || new Set();
              skillsByProject[pid].add(t.skillId);
            }
          });
        });

        const projectsByGoal = new Map<string, Project[]>();
        const skillsByGoal = new Map<string, Set<string>>();
        projectsData.forEach((p) => {
          const tasks = tasksByProject[p.id] || [];
          const total = tasks.length;
          const done = tasks.filter((t) => t.stage === "PERFECT").length;
          const progress = total ? Math.round((done / total) * 100) : 0;
          const status = projectStageToStatus(p.stage);
          const normalizedTasks = tasks.map((task) => ({
            ...task,
            isNew: false,
          }));
          const proj: Project = {
            id: p.id,
            name: p.name,
            status,
            progress,
            energy: mapEnergy(p.energy),
            energyCode: p.energy,
            stage: p.stage,
            priorityCode: p.priority ?? undefined,
            isNew: false,
            tasks: normalizedTasks,
          };
          const list = projectsByGoal.get(p.goal_id) || [];
          list.push(proj);
          projectsByGoal.set(p.goal_id, list);

          const projSkills = skillsByProject[p.id];
          if (projSkills) {
            const goalSkills = skillsByGoal.get(p.goal_id) || new Set<string>();
            projSkills.forEach((s) => goalSkills.add(s));
            skillsByGoal.set(p.goal_id, goalSkills);
          }
        });

        const realGoals: Goal[] = goalsData.map((g) => {
          const projList = projectsByGoal.get(g.id) || [];
          const progress =
            projList.length > 0
              ? Math.round(
                  projList.reduce((sum, p) => sum + p.progress, 0) /
                    projList.length
                )
              : 0;
          const status = g.status
            ? goalStatusToStatus(g.status)
            : progress >= 100
            ? "Completed"
            : "Active";
          return {
            id: g.id,
            title: g.name,
            priority: mapPriority(g.priority),
            energy: mapEnergy(g.energy),
            progress,
            status,
            active: g.active ?? status === "Active",
            updatedAt: g.created_at,
            projects: projList,
            monumentId: g.monument_id ?? null,
            skills: Array.from(skillsByGoal.get(g.id) || []),
            why: g.why || undefined,
          };
        });

        setGoals(realGoals);
        setMonuments(monumentsData);
        setSkills(skillsData);
      } catch (err) {
        console.error("Error loading goals", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filteredGoals = useMemo(() => {
    let data = goals.filter((g) => {
      const term = search.toLowerCase();
      if (!term) return true;
      const goalMatch = g.title.toLowerCase().includes(term);
      const projectMatch = g.projects.some((p) =>
        p.name.toLowerCase().includes(term)
      );
      return goalMatch || projectMatch;
    });
    if (energy !== "All") {
      data = data.filter((g) => g.energy === energy);
    }
    if (priority !== "All") {
      data = data.filter((g) => g.priority === priority);
    }
    if (monument !== "All") {
      data = data.filter((g) => g.monumentId === monument);
    }
    if (skill !== "All") {
      data = data.filter((g) => g.skills?.includes(skill));
    }
    const sorted = [...data];
    switch (sort) {
      case "A→Z":
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "Due Soon":
        sorted.sort((a, b) => {
          const ad = a.dueDate ? Date.parse(a.dueDate) : Infinity;
          const bd = b.dueDate ? Date.parse(b.dueDate) : Infinity;
          return ad - bd;
        });
        break;
      case "Progress":
        sorted.sort((a, b) => b.progress - a.progress);
        break;
      case "Recently Updated":
        sorted.sort(
          (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
        );
        break;
    }
    return sorted;
  }, [goals, search, energy, priority, monument, skill, sort]);

  const addGoal = (_goal: Goal, _context: GoalUpdateContext) => {
    void _context;
    setGoals((g) => [_goal, ...g]);
  };

  const updateGoal = (goal: Goal) =>
    setGoals((gs) => gs.map((g) => (g.id === goal.id ? goal : g)));

  const handleEdit = (goal: Goal) => {
    setEditing(goal);
    setDrawer(true);
    router.push(`/goals?edit=${goal.id}`);
  };

  const handleToggleActive = async (goal: Goal) => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    const nextActive = !goal.active;
    const status: Goal["status"] = nextActive ? "Active" : "Inactive";
    await supabase
      .from("goals")
      .update({ active: nextActive, status })
      .eq("id", goal.id);
    updateGoal({ ...goal, active: nextActive, status });
  };

  const handleDelete = async (goal: Goal) => {
    if (!userId) return;

    const shouldProceed =
      typeof window === "undefined" ||
      window.confirm(
        "Deleting this goal will also delete any related projects and tasks. Are you sure?"
      );

    if (!shouldProceed) {
      return;
    }

    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    try {
      const { data: projectRows, error: projectFetchError } = await supabase
        .from("projects")
        .select("id")
        .eq("user_id", userId)
        .eq("goal_id", goal.id);

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
        .eq("id", goal.id);

      if (deleteGoalError) {
        throw deleteGoalError;
      }

      setGoals((gs) => gs.filter((g) => g.id !== goal.id));

      if (editing?.id === goal.id) {
        setEditing(null);
        setDrawer(false);
        router.replace("/goals");
      }
    } catch (err) {
      console.error("Error deleting goal:", err);
    }
  };

  return (
    <ProtectedRoute>
      <div className="relative min-h-screen overflow-hidden bg-[#05070c] text-white">
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-80">
          <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="absolute bottom-0 left-10 h-72 w-72 rounded-full bg-sky-500/20 blur-3xl" />
          <div className="absolute -right-32 top-32 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl" />
        </div>
        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-28 sm:px-6 lg:px-8">
          <GoalsHeader onCreate={() => setDrawer(true)} />
          <GoalsUtilityBar
            search={search}
            onSearch={setSearch}
            energy={energy}
            onEnergy={setEnergy}
            priority={priority}
            onPriority={setPriority}
            sort={sort}
            onSort={setSort}
            monuments={monuments}
            monument={monument}
            onMonument={setMonument}
            skills={skills}
            skill={skill}
            onSkill={setSkill}
          />
          {loading ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur">
              <LoadingSkeleton />
            </div>
          ) : filteredGoals.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/20 bg-white/[0.02] p-10 text-center backdrop-blur">
              <EmptyState onCreate={() => setDrawer(true)} />
            </div>
          ) : (
            <div className="grid gap-6 pb-8 sm:grid-cols-2">
              {filteredGoals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  onEdit={() => handleEdit(goal)}
                  onToggleActive={() => handleToggleActive(goal)}
                  onDelete={() => handleDelete(goal)}
                />
              ))}
            </div>
          )}
        </div>
        <GoalDrawer
          open={drawer}
          onClose={() => {
            setDrawer(false);
            setEditing(null);
            router.replace("/goals");
          }}
          onAdd={addGoal}
          initialGoal={editing}
          monuments={monuments}
          onUpdate={async (goal, context) => {
            const supabase = getSupabaseBrowser();
            if (supabase) {
              try {
                const { error } = await supabase
                  .from("goals")
                  .update({
                    name: goal.title,
                    priority:
                      goal.priority === "High"
                        ? "HIGH"
                        : goal.priority === "Medium"
                        ? "MEDIUM"
                        : "LOW",
                    energy: energyToDbValue(goal.energy),
                    active: goal.active,
                    status:
                      goal.status === "Completed"
                        ? "COMPLETED"
                        : goal.status === "Overdue"
                        ? "OVERDUE"
                        : goal.status === "Inactive"
                        ? "INACTIVE"
                        : "ACTIVE",
                    why: goal.why ?? null,
                    monument_id: goal.monumentId || null,
                  })
                  .eq("id", goal.id);

                if (error) {
                  console.error("Error updating goal:", error);
                }

                if (context) {
                  let ownerId = userId;
                  if (!ownerId) {
                    const {
                      data: authData,
                      error: authError,
                    } = await supabase.auth.getUser();
                    if (authError) {
                      console.error("Error fetching user for updates:", authError);
                    }
                    ownerId = authData.user?.id ?? null;
                    if (ownerId) {
                      setUserId(ownerId);
                    }
                  }

                  if (ownerId) {
                    await syncProjectsAndTasks(supabase, ownerId, goal.id, context);
                  }
                }
              } catch (err) {
                console.error("Unexpected error updating goal:", err);
              }
            }
            updateGoal(goal);
          }}
        />
      </div>
    </ProtectedRoute>
  );
}
