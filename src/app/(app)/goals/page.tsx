"use client";

import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Goal, GoalPriority, ProjectStatus, GoalStatus } from "./_components/types";
import { GoalsHeader } from "./_components/GoalsHeader";
import {
  GoalsUtilityBar,
  FilterType,
  SortType,
  ViewType,
} from "./_components/GoalsUtilityBar";
import { GoalCard } from "./_components/GoalCard";
import { CreateGoalDrawer } from "./_components/CreateGoalDrawer";
import { LoadingSkeleton } from "./_components/LoadingSkeleton";
import { EmptyState } from "./_components/EmptyState";
import { getSupabaseBrowser } from "@/lib/supabase";
import { useAuth } from "@/components/auth/AuthProvider";

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("All");
  const [sort, setSort] = useState<SortType>("az");
  const [view, setView] = useState<ViewType>("grid");
  const [openGoals, setOpenGoals] = useState<Set<string>>(new Set());
  const [loadingProjects, setLoadingProjects] = useState<Record<string, boolean>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { session } = useAuth();
  const supabase = getSupabaseBrowser();

  const mapPriority = (p?: string): GoalPriority | undefined => {
    if (!p) return undefined;
    const map: Record<string, GoalPriority> = {
      LOW: "Low",
      MEDIUM: "Medium",
      HIGH: "High",
    };
    return map[p as keyof typeof map];
  };

  const mapStage = (s?: string): ProjectStatus => {
    if (!s) return "Todo";
    const stage = s.toLowerCase();
    if (stage.includes("progress")) return "In-Progress";
    if (stage.includes("done")) return "Done";
    return "Todo";
  };

  useEffect(() => {
    const loadGoals = async () => {
      if (!supabase || !session?.user) {
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from("goals")
          .select(
            "id, name, priority, updated_at, created_at, projects (id, name, stage, created_at)"
          )
          .eq("user_id", session.user.id)
          .order("updated_at", { ascending: false });

        if (error) throw error;

        const mapped = (data || []).map((g) => ({
          id: g.id,
          title: g.name,
          priority: mapPriority(g.priority),
          progress: 0,
          status: "Active" as GoalStatus,
          updatedAt: g.updated_at || g.created_at,
          projectCount: g.projects ? g.projects.length : 0,
          projects: (g.projects || []).map(
            (p: { id: string; name: string; stage: string }) => ({
              id: p.id,
              name: p.name,
              status: mapStage(p.stage),
              progress: 0,
            })
          ),
        }));
        setGoals(mapped);
      } catch (e) {
        console.error("Error loading goals", e);
        setGoals([]);
      } finally {
        setLoading(false);
      }
    };
    loadGoals();
  }, [supabase, session?.user]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  const handleToggle = (id: string) => {
    setOpenGoals((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        if (!loadingProjects[id]) {
          setLoadingProjects((lp) => ({ ...lp, [id]: true }));
          setTimeout(
            () => setLoadingProjects((lp) => ({ ...lp, [id]: false })),
            300
          );
        }
      }
      return next;
    });
  };

  const filteredGoals = goals
    .filter((goal) => {
      const term = debouncedSearch.toLowerCase();
      if (!term) return true;
      const inGoal = goal.title.toLowerCase().includes(term);
      const inProject = goal.projects.some((p) =>
        p.name.toLowerCase().includes(term)
      );
      return inGoal || inProject;
    })
    .filter((goal) => (filter === "All" ? true : goal.status === filter))
    .sort((a, b) => {
      switch (sort) {
        case "az":
          return a.title.localeCompare(b.title);
        case "due":
          return (a.dueDate || "").localeCompare(b.dueDate || "");
        case "progress":
          return b.progress - a.progress;
        case "updated":
          return (
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
        default:
          return 0;
      }
    });

  const addGoal = (goal: Goal) => {
    setGoals((prev) => [...prev, goal]);
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-900 p-4 text-white">
        {loading ? (
          <LoadingSkeleton />
        ) : (
          <>
            <GoalsHeader onOpenCreate={() => setDrawerOpen(true)} />
            <GoalsUtilityBar
              search={search}
              setSearch={setSearch}
              filter={filter}
              setFilter={setFilter}
              sort={sort}
              setSort={setSort}
              view={view}
              setView={setView}
            />
            {filteredGoals.length === 0 ? (
              <EmptyState onCreate={() => setDrawerOpen(true)} />
            ) : (
              <div
                className={
                  view === "grid"
                    ? "mt-4 grid grid-cols-2 gap-4"
                    : "mt-4 space-y-4"
                }
              >
                {filteredGoals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    isOpen={openGoals.has(goal.id)}
                    onToggle={() => handleToggle(goal.id)}
                    loading={!!loadingProjects[goal.id]}
                  />
                ))}
              </div>
            )}
          </>
        )}
        <CreateGoalDrawer
          open={drawerOpen}
          setOpen={setDrawerOpen}
          onCreate={addGoal}
        />
      </div>
    </ProtectedRoute>
  );
}
