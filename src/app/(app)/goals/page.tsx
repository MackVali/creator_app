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
    title: "Learn Guitar",
    emoji: "🎸",
    dueDate: "2024-12-01",
    priority: "High",
    progress: 40,
    status: "Active",
    updatedAt: "2024-05-20",
    projects: [
      {
        id: "p1",
        name: "Practice chords",
        status: "In-Progress",
        progress: 60,
        dueDate: "2024-06-10",
      },
      {
        id: "p2",
        name: "Learn song",
        status: "Todo",
        progress: 0,
      },
    ],
  },
  {
    id: "2",
    title: "Read 12 Books",
    emoji: "📚",
    dueDate: "2024-12-31",
    priority: "Medium",
    progress: 70,
    status: "Active",
    updatedAt: "2024-05-18",
    projects: [
      {
        id: "p3",
        name: "Finish Dune",
        status: "Done",
        progress: 100,
      },
      {
        id: "p4",
        name: "Start 1984",
        status: "Todo",
        progress: 0,
      },
    ],
  },
  {
    id: "3",
    title: "Build Portfolio",
    emoji: "💻",
    dueDate: "2024-07-01",
    priority: "High",
    progress: 90,
    status: "Completed",
    updatedAt: "2024-05-10",
    projects: [
      {
        id: "p5",
        name: "Design layout",
        status: "Done",
        progress: 100,
      },
      {
        id: "p6",
        name: "Deploy site",
        status: "Done",
        progress: 100,
      },
    ],
  },
  {
    id: "4",
    title: "Plan Vacation",
    emoji: "🏖️",
    dueDate: "2024-05-15",
    priority: "Low",
    progress: 20,
    status: "Overdue",
    updatedAt: "2024-04-30",
    projects: [
      {
        id: "p7",
        name: "Book flights",
        status: "Todo",
        progress: 0,
      },
      {
        id: "p8",
        name: "Reserve hotel",
        status: "Todo",
        progress: 0,
      },
    ],
  },
  {
    id: "5",
    title: "Meditation Habit",
    emoji: "🧘",
    priority: "Low",
    progress: 10,
    status: "Active",
    updatedAt: "2024-05-25",
    projects: [],
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
    setGoals(initialGoals);
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
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
        setLoadingProjects((lp) => ({ ...lp, [id]: true }));
        setTimeout(
          () => setLoadingProjects((lp) => ({ ...lp, [id]: false })),
          400
        );
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
