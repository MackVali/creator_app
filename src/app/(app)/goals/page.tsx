"use client";

import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Goal } from "./_components/types";
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

const initialGoals: Goal[] = [
  {
    id: "1",
    title: "Build portfolio",
    emoji: "💼",
    dueDate: "2025-03-01",
    priority: "High",
    progress: 30,
    status: "Active",
    updatedAt: "2025-01-05",
    projectCount: 3,
    projects: [
      { id: "p1", name: "Design", status: "In-Progress", progress: 60 },
      { id: "p2", name: "Develop", status: "Todo", progress: 0 },
      { id: "p3", name: "Deploy", status: "Todo", progress: 0 },
    ],
  },
  {
    id: "2",
    title: "Learn guitar",
    emoji: "🎸",
    dueDate: "2025-02-15",
    priority: "Medium",
    progress: 80,
    status: "Completed",
    updatedAt: "2025-02-10",
    projectCount: 2,
    projects: [
      { id: "p4", name: "Chords practice", status: "Done", progress: 100 },
      { id: "p5", name: "Song library", status: "Done", progress: 100 },
    ],
  },
  {
    id: "3",
    title: "Plan vacation",
    emoji: "🏖️",
    dueDate: "2024-12-20",
    priority: "Low",
    progress: 20,
    status: "Overdue",
    updatedAt: "2024-12-25",
    projectCount: 2,
    projects: [
      { id: "p6", name: "Book flights", status: "Todo", progress: 0 },
      { id: "p7", name: "Reserve hotel", status: "Todo", progress: 0 },
    ],
  },
  {
    id: "4",
    title: "Read books",
    emoji: "📚",
    dueDate: "2025-04-30",
    priority: "Medium",
    progress: 50,
    status: "Active",
    updatedAt: "2025-03-01",
    projectCount: 2,
    projects: [
      { id: "p8", name: "Fiction", status: "In-Progress", progress: 40 },
      { id: "p9", name: "Non-fiction", status: "Todo", progress: 0 },
    ],
  },
  {
    id: "5",
    title: "Fitness routine",
    emoji: "💪",
    dueDate: "2025-05-20",
    priority: "High",
    progress: 10,
    status: "Active",
    updatedAt: "2025-03-05",
    projectCount: 2,
    projects: [
      { id: "p10", name: "Cardio", status: "Todo", progress: 0 },
      { id: "p11", name: "Strength", status: "Todo", progress: 0 },
    ],
  },
];

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

  useEffect(() => {
    const t = setTimeout(() => {
      setGoals(initialGoals);
      setLoading(false);
    }, 400);
    return () => clearTimeout(t);
  }, []);

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
