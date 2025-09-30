"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { GoalDrawer } from "./components/GoalDrawer";
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
          setLoading(false);
          return;
        }

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
              skill_id: task.skill_id,
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
            if (t.skill_id) {
              skillsByProject[pid] = skillsByProject[pid] || new Set();
              skillsByProject[pid].add(t.skill_id);
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
          const proj: Project = {
            id: p.id,
            name: p.name,
            status,
            progress,
            energy: mapEnergy(p.energy),
            tasks,
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

  const addGoal = (goal: Goal) => setGoals((g) => [goal, ...g]);

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
          onUpdate={async (goal) => {
            const supabase = getSupabaseBrowser();
            if (supabase) {
              await supabase
                .from("goals")
                .update({
                  name: goal.title,
                  priority:
                    goal.priority === "High"
                      ? "HIGH"
                      : goal.priority === "Medium"
                      ? "MEDIUM"
                      : "LOW",
                  energy:
                    goal.energy === "Extreme"
                      ? "EXTREME"
                      : goal.energy === "Ultra"
                      ? "ULTRA"
                      : goal.energy === "High"
                      ? "HIGH"
                      : goal.energy === "Medium"
                      ? "MEDIUM"
                      : goal.energy === "Low"
                      ? "LOW"
                      : "NO",
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
            }
            updateGoal(goal);
          }}
        />
      </div>
    </ProtectedRoute>
  );
}
