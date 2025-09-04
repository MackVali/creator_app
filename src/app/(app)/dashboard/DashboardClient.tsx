"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { LevelBanner } from "@/components/ui/LevelBanner";
import { MonumentContainer } from "@/components/ui/MonumentContainer";
import CategorySection from "@/components/skills/CategorySection";
import { GoalCard } from "../goals/components/GoalCard";
import type { Goal, Project } from "../goals/types";
import { getSupabaseBrowser } from "@/lib/supabase";
import { getGoalsForUser } from "@/lib/queries/goals";
import { getProjectsForUser } from "@/lib/queries/projects";

interface Skill {
  skill_id: string;
  cat_id: string;
  name: string;
  icon: string;
  level: number;
  progress: number;
}

interface Category {
  cat_id: string;
  cat_name: string;
  skill_count: number;
  skills: Skill[];
  color?: string | null;
}

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

export default function DashboardClient() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const loadGoals = async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

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
          progress,
          status,
          active: g.active ?? status === "Active",
          updatedAt: g.created_at,
          projects: projList,
        };
      })
      .filter((g) => g.active);

    setGoals(realGoals);
  };

  const fetchDashboardData = async () => {
    try {
      const response = await fetch("/api/dashboard");
      const data = await response.json();

      setCategories(data.skillsAndGoals?.cats || []);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      await loadGoals();
      setLoading(false);
    }
  };

  return (
    <main className="pb-20">
      <LevelBanner level={80} current={3200} total={4000} />

      <MonumentContainer />

      <Section title={<Link href="/skills">Skills</Link>} className="mt-1 px-4">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-24 rounded-lg bg-gray-800 animate-pulse"
              />
            ))}
          </div>
        ) : categories.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {categories.map((cat) => (
              <CategorySection
                key={cat.cat_id}
                title={cat.cat_name}
                skills={cat.skills}
                color={cat.color}
              />
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-gray-500">
            No skills found. Create your first skill to get started!
          </div>
        )}
      </Section>

      <Section
        title={<Link href="/goals">Current Goals</Link>}
        className="safe-bottom mt-2 px-4"
      >
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 bg-gray-800 animate-pulse rounded" />
            ))}
          </div>
        ) : goals.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {goals.map((goal) => (
              <GoalCard key={goal.id} goal={goal} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">No active goals.</div>
        )}
      </Section>
    </main>
  );
}
