"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { LevelBanner } from "@/components/ui/LevelBanner";
import { MonumentContainer } from "@/components/ui/MonumentContainer";
import SkillsCarousel from "./_skills/SkillsCarousel";
import { GoalFolderCard } from "./components/GoalFolderCard";
import type { Goal, Project } from "../goals/types";
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

export default function DashboardClient() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loadingGoals, setLoadingGoals] = useState(true);

  useEffect(() => {
    loadGoals();
  }, []);

  const loadGoals = async () => {
    setLoadingGoals(true);
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setLoadingGoals(false);
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoadingGoals(false);
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
        energy: mapEnergy(p.energy),
        tasks,
      };
      const list = projectsByGoal.get(p.goal_id) || [];
      list.push(proj);
      projectsByGoal.set(p.goal_id, list);
    });

    const realGoals: Goal[] = goalsData
      .map((g) => {
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
        };
      })
      .filter((g) => g.active);

    setGoals(realGoals);
    setLoadingGoals(false);
  };

  const activeGoalsCount = goals.length;
  const averageProgress = activeGoalsCount
    ? Math.round(
        goals.reduce((sum, goal) => sum + goal.progress, 0) / activeGoalsCount
      )
    : 0;
  const linkedProjectsCount = goals.reduce(
    (total, goal) => total + goal.projects.length,
    0
  );
  const openTasksCount = goals.reduce(
    (total, goal) =>
      total +
      goal.projects.reduce(
        (projectTotal, project) =>
          projectTotal +
          project.tasks.filter((task) => task.stage !== "PERFECT").length,
        0
      ),
    0
  );

  const overviewStats = [
    {
      label: "Active goals",
      value: activeGoalsCount,
      hint: "Focus areas on your radar.",
    },
    {
      label: "Avg completion",
      value: `${averageProgress}%`,
      hint: "Across all active goals.",
    },
    {
      label: "Linked projects",
      value: linkedProjectsCount,
      hint:
        linkedProjectsCount > 0
          ? "Projects synced to goals."
          : "Connect projects to build momentum.",
    },
    {
      label: "Open tasks",
      value: openTasksCount,
      hint:
        openTasksCount > 0
          ? "Tasks still in motion."
          : "You're all caught up.",
    },
  ];

  return (
    <main className="pb-24">
      <div className="relative isolate">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute left-[6%] top-[-180px] h-[320px] w-[320px] rounded-full bg-emerald-500/20 blur-[140px]" aria-hidden />
          <div className="absolute right-[12%] top-[180px] h-[420px] w-[420px] rounded-full bg-indigo-500/15 blur-[170px]" aria-hidden />
        </div>
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 pb-16 pt-6 sm:px-6 lg:px-8">
          <section className="card relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.02] px-6 py-8 shadow-[0_20px_45px_rgba(0,0,0,0.45)] backdrop-blur">
            <div className="absolute inset-y-0 right-[-25%] top-8 hidden h-[420px] w-[420px] rounded-full bg-sky-500/10 blur-3xl sm:block" aria-hidden />
            <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-center">
              <div className="space-y-6">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">
                  Overview
                </p>
                <h1 className="text-3xl font-semibold text-white sm:text-[34px] sm:leading-[1.2]">
                  Your creative command center
                </h1>
                <p className="max-w-2xl text-sm text-white/70">
                  Keep goals, projects, and skill building aligned in one place.
                </p>
                <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {overviewStats.map(({ label, value, hint }) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 shadow-inner shadow-black/30"
                    >
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
                        {label}
                      </dt>
                      <dd className="mt-2 text-2xl font-semibold text-white">
                        {loadingGoals ? (
                          <span
                            className="inline-flex h-7 w-16 animate-pulse rounded-full bg-white/20"
                            aria-hidden
                          />
                        ) : (
                          value
                        )}
                      </dd>
                      <p className="mt-1 text-xs text-white/60">{hint}</p>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="flex items-center justify-center">
                <LevelBanner
                  level={80}
                  current={3200}
                  total={4000}
                  className="mx-0 mt-0 w-full max-w-sm border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-6 shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
                />
              </div>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <section className="card relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] px-6 py-6 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
              <div className="absolute inset-x-16 top-0 h-32 rounded-full bg-emerald-500/10 blur-3xl" aria-hidden />
              <div className="relative flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Active goals</h2>
                  <p className="mt-1 text-sm text-white/60">
                    Tap a folder to peek at linked projects and tasks.
                  </p>
                </div>
                <Link
                  href="/goals"
                  className="text-sm font-semibold text-white/70 transition hover:text-white"
                >
                  View all
                </Link>
              </div>
              <div className="relative mt-6">
                {loadingGoals ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <div
                        key={idx}
                        className="h-[220px] animate-pulse rounded-3xl border border-white/10 bg-white/[0.06]"
                      />
                    ))}
                  </div>
                ) : goals.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {goals.map((goal) => (
                      <GoalFolderCard
                        key={goal.id}
                        goal={goal}
                        size={0.52}
                        className="items-stretch"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/20 bg-white/[0.04] py-10 text-center text-sm text-white/60">
                    No active goals yet. Start one to build momentum.
                  </div>
                )}
              </div>
            </section>

            <div className="flex flex-col gap-6">
              <section className="card relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] px-6 py-6 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
                <div className="absolute inset-x-8 top-0 h-32 rounded-full bg-sky-500/10 blur-3xl" aria-hidden />
                <div className="relative flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Skill focus</h2>
                    <p className="mt-1 text-sm text-white/60">
                      Choose a category to explore and practice next.
                    </p>
                  </div>
                  <Link
                    href="/skills"
                    className="text-sm font-semibold text-white/70 transition hover:text-white"
                  >
                    View skills
                  </Link>
                </div>
                <div className="relative mt-6 -mx-4">
                  <SkillsCarousel />
                </div>
              </section>

              <MonumentContainer />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
