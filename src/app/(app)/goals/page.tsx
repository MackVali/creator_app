"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { GoalsHeader } from "./components/GoalsHeader";
import {
  GoalsUtilityBar,
  FilterStatus,
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
  const [goals, setGoals] = useState<Goal[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("All");
  const [sort, setSort] = useState<SortOption>("A→Z");
  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const router = useRouter();

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

        let tasksData: {
          id: string;
          project_id: string | null;
          stage: string;
          name: string;
        }[] = [];
        try {
          const tasksRes = await supabase
            .from("tasks")
            .select("id, project_id, stage, name")
            .eq("user_id", user.id);
          tasksData = tasksRes.data || [];
        } catch (err) {
          console.error("Error fetching tasks:", err);
        }

        const tasksByProject = tasksData.reduce(
          (
            acc: Record<
              string,
              { id: string; name: string; stage: string }[]
            >,
            task
          ) => {
            if (!task.project_id) return acc;
            acc[task.project_id] = acc[task.project_id] || [];
            acc[task.project_id].push({
              id: task.id,
              name: task.name,
              stage: task.stage,
            });
            return acc;
          },
          {}
        );

        const projectsByGoal = new Map<string, Project[]>();
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
            tasks,
          };
          const list = projectsByGoal.get(p.goal_id) || [];
          list.push(proj);
          projectsByGoal.set(p.goal_id, list);
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
            progress,
            status,
            active: g.active ?? status === "Active",
            updatedAt: g.created_at,
            projects: projList,
          };
        });

        setGoals(realGoals);
      } catch (err) {
        console.error("Error loading goals", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId && goals.length > 0) {
      const goalToEdit = goals.find((g) => g.id === editId);
      if (goalToEdit) {
        setEditing(goalToEdit);
        setDrawer(true);
      }
    }
  }, [searchParams, goals]);

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
    if (filter !== "All") {
      data = data.filter((g) => g.status === filter);
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
  }, [goals, search, filter, sort]);

  const addGoal = (goal: Goal) => setGoals((g) => [goal, ...g]);

  const updateGoal = (goal: Goal) =>
    setGoals((gs) => gs.map((g) => (g.id === goal.id ? goal : g)));

  const handleEdit = (goal: Goal) => {
    setEditing(goal);
    setDrawer(true);
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
      <div className="min-h-screen bg-gray-900 text-white pb-24">
        <GoalsHeader onCreate={() => setDrawer(true)} />
        <GoalsUtilityBar
          search={search}
          onSearch={setSearch}
          filter={filter}
          onFilter={setFilter}
          sort={sort}
          onSort={setSort}
        />
        {loading ? (
          <LoadingSkeleton />
        ) : filteredGoals.length === 0 ? (
          <EmptyState onCreate={() => setDrawer(true)} />
        ) : (
          <div className="flex flex-col gap-4 p-4">
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
        <GoalDrawer
          open={drawer}
          onClose={() => {
            setDrawer(false);
            setEditing(null);
            router.replace("/goals");
          }}
          onAdd={addGoal}
          initialGoal={editing}
          onUpdate={async (goal) => {
            const supabase = getSupabaseBrowser();
            if (supabase) {
              await supabase
                .from("goals")
                .update({
                  name: goal.title,
                  priority: goal.priority,
                  active: goal.active,
                  status: goal.status,
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
