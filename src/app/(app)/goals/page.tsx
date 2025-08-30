"use client";

import { useState, useMemo, useEffect } from "react";
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

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("All");
  const [sort, setSort] = useState<SortOption>("A→Z");
  const [drawer, setDrawer] = useState(false);
  const [loading, setLoading] = useState(true);

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

        const [goalsData, projectsData, tasksRes] = await Promise.all([
          getGoalsForUser(user.id),
          getProjectsForUser(user.id),
          supabase
            .from("tasks")
            .select("id, project_id, stage")
            .eq("user_id", user.id),
        ]);

        const tasksData = tasksRes.data || [];

        const tasksByProject = tasksData.reduce(
          (acc: Record<string, { stage: string }[]>, task) => {
            if (!task.project_id) return acc;
            acc[task.project_id] = acc[task.project_id] || [];
            acc[task.project_id].push(task);
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
          const status = p.status || projectStageToStatus(p.stage);
          const proj: Project = {
            id: p.id,
            name: p.name,
            status,
            progress,
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
          return {
            id: g.id,
            title: g.name,
            priority: mapPriority(g.priority),
            progress,
            status: progress >= 100 ? "Completed" : g.status || "Active",
            active: g.active,
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
          view={view}
          onViewChange={setView}
        />
        {loading ? (
          <LoadingSkeleton />
        ) : filteredGoals.length === 0 ? (
          <EmptyState onCreate={() => setDrawer(true)} />
        ) : (
          <div
            className={
              view === "grid"
                ? "grid grid-cols-2 gap-4 p-4"
                : "flex flex-col gap-4 p-4"
            }
          >
            {filteredGoals.map((goal) => (
              <GoalCard key={goal.id} goal={goal} />
            ))}
          </div>
        )}
        <GoalDrawer
          open={drawer}
          onClose={() => setDrawer(false)}
          onSave={addGoal}
        />
      </div>
    </ProtectedRoute>
  );
}
