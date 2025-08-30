"use client";

import { useState, useMemo, useEffect } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { GoalsHeader } from "./components/GoalsHeader";
import { GoalsUtilityBar, FilterStatus, SortOption } from "./components/GoalsUtilityBar";
import { GoalCard } from "./components/GoalCard";
import { LoadingSkeleton } from "./components/LoadingSkeleton";
import { EmptyState } from "./components/EmptyState";
import { CreateGoalDrawer } from "./components/CreateGoalDrawer";
import type { Goal } from "./types";
import { mockGoals } from "./mockData";

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>(mockGoals);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("All");
  const [sort, setSort] = useState<SortOption>("A→Z");
  const [drawer, setDrawer] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(id);
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
        <CreateGoalDrawer
          open={drawer}
          onClose={() => setDrawer(false)}
          onAdd={addGoal}
        />
      </div>
    </ProtectedRoute>
  );
}
