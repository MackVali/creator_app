"use client";

import React, { useEffect, useRef, useState } from "react";
// Minimal local skeleton and empty state styles to avoid cross-module deps
import { GoalCard } from "./GoalCard";
import { ProjectRow } from "./ProjectRow";
import { TaskRow } from "./TaskRow";
import type {
  Goal,
  Project,
  Task,
  GoalFilter,
  GoalSort,
} from "./types";
import { filterAndSortGoals } from "./utils";
import { useVirtualizer } from "@tanstack/react-virtual";

interface CurrentGoalsProps {
  initialGoals?: Goal[];
  initialLoading?: boolean;
  fetchGoals?: () => Promise<Goal[]>;
  fetchProjects?: (goalId: string) => Promise<Project[]>;
  fetchTasks?: (projectId: string) => Promise<Task[]>;
}

async function noopFetchGoals(): Promise<Goal[]> {
  return [];
}
async function noopFetchProjects(goalId: string): Promise<Project[]> {
  void goalId;
  return [];
}
async function noopFetchTasks(projectId: string): Promise<Task[]> {
  void projectId;
  return [];
}

export function CurrentGoals({
  initialGoals,
  initialLoading,
  fetchGoals = noopFetchGoals,
  fetchProjects = noopFetchProjects,
  fetchTasks = noopFetchTasks,
}: CurrentGoalsProps) {
  const [goals, setGoals] = useState<Goal[]>(initialGoals || []);
  const [loading, setLoading] = useState(initialLoading ?? true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<GoalFilter>("active");
  const [sort, setSort] = useState<GoalSort>("progress");
  const [showCompleted, setShowCompleted] = useState(false);

  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [projectsCache, setProjectsCache] = useState<Record<string, Project[]>>({});
  const [tasksCache, setTasksCache] = useState<Record<string, Task[]>>({});


  const loadGoals = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGoals();
      setGoals(data);
    } catch {
      setError("Failed to load goals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialGoals === undefined) {
      loadGoals();
    } else {
      setLoading(initialLoading ?? false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialGoals, initialLoading, fetchGoals]);

  const toggleGoal = async (goalId: string) => {
    setExpandedGoals((prev) => {
      const next = new Set(prev);
      if (next.has(goalId)) next.delete(goalId);
      else next.add(goalId);
      return next;
    });
    if (!projectsCache[goalId]) {
      try {
        const projects = await fetchProjects(goalId);
        setProjectsCache((p) => ({ ...p, [goalId]: projects }));
      } catch {
        console.error("Failed to load projects");
      }
    }
  };

  const toggleProject = async (projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
    if (!tasksCache[projectId]) {
      try {
        const tasks = await fetchTasks(projectId);
        setTasksCache((p) => ({ ...p, [projectId]: tasks }));
      } catch {
        console.error("Failed to load tasks");
      }
    }
  };

  const parentRef = useRef<HTMLDivElement>(null);
  const filteredGoals = filterAndSortGoals(goals, filter, sort);

  const rowVirtualizer = useVirtualizer({
    count: filteredGoals.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 88,
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex bg-zinc-800 rounded-lg overflow-hidden text-sm">
          {(
            [
              ["all", "All"],
              ["active", "Active"],
              ["due", "Due Soon"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1 ${
                filter === key ? "bg-zinc-700" : "bg-transparent"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as GoalSort)}
          className="bg-zinc-800 text-sm rounded px-2 py-1"
        >
          <option value="priority">Priority</option>
          <option value="progress">Progress</option>
          <option value="due">Due Date</option>
          <option value="updated">Updated</option>
        </select>
        <label className="flex items-center gap-1 text-sm ml-auto">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
          />
          Show completed
        </label>
      </div>

      {error && (
        <div className="text-center text-sm text-red-500">
          {error} {" "}
          <button
            onClick={loadGoals}
            className="underline text-red-400 hover:text-red-300"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-12 bg-zinc-800 animate-pulse rounded"
            />
          ))}
        </div>
      ) : filteredGoals.length === 0 ? (
        <div className="text-center text-sm text-zinc-400 py-6">
          No current goals. Use + to add.
        </div>
      ) : (
        <div ref={parentRef} className="max-h-96 overflow-auto">
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const goal = filteredGoals[virtualRow.index];
              const isExpanded = expandedGoals.has(goal.id);
              return (
                <div
                  key={goal.id}
                  ref={rowVirtualizer.measureElement}
                  className="absolute top-0 left-0 w-full"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <GoalCard
                    goal={goal}
                    expanded={isExpanded}
                    onToggle={() => toggleGoal(goal.id)}
                  >
                    {isExpanded &&
                      (projectsCache[goal.id] || []).map((project) => {
                        const projExpanded = expandedProjects.has(project.id);
                        return (
                          <ProjectRow
                            key={project.id}
                            project={project}
                            expanded={projExpanded}
                            onToggle={() => toggleProject(project.id)}
                          >
                            {projExpanded &&
                              (tasksCache[project.id] || []).map((task) => (
                                <TaskRow
                                  key={task.id}
                                  task={task}
                                  showCompleted={showCompleted}
                                />
                              ))}
                          </ProjectRow>
                        );
                      })}
                  </GoalCard>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

