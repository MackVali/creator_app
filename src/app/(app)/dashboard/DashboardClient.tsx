"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Section } from "@/components/ui/Section";
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
  const router = useRouter();
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

  const handleToggleActive = async (goal: Goal) => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    const nextActive = !goal.active;
    const status: Goal["status"] = nextActive ? "Active" : "Inactive";

    const { error } = await supabase
      .from("goals")
      .update({ active: nextActive, status })
      .eq("id", goal.id);

    if (error) {
      console.error("Failed to toggle goal active state:", error);
      return;
    }

    setGoals((gs) => {
      if (nextActive) {
        return gs.map((g) =>
          g.id === goal.id ? { ...g, active: nextActive, status } : g
        );
      }
      return gs.filter((g) => g.id !== goal.id);
    });
  };

  return (
    <main className="pb-20">
      <LevelBanner level={80} current={3200} total={4000} />

      <MonumentContainer />

      <Section title={<Link href="/skills">Skills</Link>} className="mt-1 px-4">
        <SkillsCarousel />
      </Section>

      <Section
        title={<Link href="/goals">Current Goals</Link>}
        className="safe-bottom mt-2 px-4"
      >
        {loadingGoals ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3 justify-items-center">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-[240px] w-[240px] animate-pulse rounded-3xl bg-gray-800/70"
              />
            ))}
          </div>
        ) : goals.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3 justify-items-center">
            {goals.map((goal) => (
              <GoalFolderCard
                key={goal.id}
                goal={goal}
                onEdit={() => router.push(`/goals?edit=${goal.id}`)}
                onToggleActive={() => handleToggleActive(goal)}
              />
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-gray-500">No active goals.</div>
        )}
      </Section>
    </main>
  );
}
