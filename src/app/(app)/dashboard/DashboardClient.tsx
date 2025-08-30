"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { LevelBanner } from "@/components/ui/LevelBanner";
import { GoalCardGrid } from "@/components/ui/GoalCardGrid";
import { MonumentContainer } from "@/components/ui/MonumentContainer";
import CategorySection from "@/components/skills/CategorySection";
import { SkillCardSkeleton } from "@/components/skills/SkillCardSkeleton";
import { LoadingSkeleton } from "@/app/(app)/goals/components/LoadingSkeleton";
import { EmptyState } from "@/app/(app)/goals/components/EmptyState";
import type { Goal, Project, Task } from "@/app/(app)/goals/types";
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
}

export default function DashboardClient() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const dashboardFetch = fetch("/api/dashboard").then((res) => res.json());
      const goalsList = loadGoals();

      const [data, goalsData] = await Promise.all([dashboardFetch, goalsList]);

      // Debug logging
      console.log("🔍 Dashboard API response:", data);
      console.log("🔍 Categories data:", data.skillsAndGoals?.cats);

      setCategories(data.skillsAndGoals?.cats || []);
      setGoals(goalsData);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const mapPriority = (priority: string): Goal["priority"] => {
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
  };

  const projectStageToStatus = (stage: string): Project["status"] => {
    switch (stage) {
      case "RESEARCH":
        return "Todo";
      case "RELEASE":
        return "Done";
      default:
        return "In-Progress";
    }
  };

  const taskStageToStatus = (stage: string): Task["status"] => {
    switch (stage) {
      case "PERFECT":
        return "Done";
      case "PREPARE":
        return "Todo";
      default:
        return "In-Progress";
    }
  };

  const loadGoals = async (): Promise<Goal[]> => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return [];

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const [goalsData, projectsData, tasksRes] = await Promise.all([
      getGoalsForUser(user.id),
      getProjectsForUser(user.id),
      supabase
        .from("tasks")
        .select("id, project_id, name, stage")
        .eq("user_id", user.id),
    ]);

    const tasksData = tasksRes.data || [];
    const tasksByProject = tasksData.reduce(
      (acc: Record<string, Task[]>, task) => {
        if (!task.project_id) return acc;
        const t: Task = {
          id: task.id,
          name: task.name,
          status: taskStageToStatus(task.stage),
        };
        acc[task.project_id] = acc[task.project_id] || [];
        acc[task.project_id].push(t);
        return acc;
      },
      {}
    );

    const projectsByGoal = new Map<string, Project[]>();
    projectsData.forEach((p) => {
      const tasks = tasksByProject[p.id] || [];
      const total = tasks.length;
      const done = tasks.filter((t) => t.status === "Done").length;
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
      const activeProjects = projList.filter((p) => p.status !== "Done");
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
        status: progress >= 100 ? "Completed" : "Active",
        updatedAt: g.created_at,
        projects: activeProjects,
        active: progress < 100,
      };
    });

    return realGoals.filter((g) => g.active);
  };

  const toggleActive = (id: string) =>
    setGoals((g) =>
      g.map((goal) =>
        goal.id === id
          ? {
              ...goal,
              active: !goal.active,
              status: !goal.active ? "Active" : goal.status,
            }
          : goal
      )
    );

  return (
    <main className="pb-20">
      <LevelBanner level={80} current={3200} total={4000} />

      <MonumentContainer />

      <Section title={<Link href="/skills">Skills</Link>} className="mt-1 px-4">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkillCardSkeleton key={i} />
            ))}
          </div>
        ) : categories.length > 0 ? (
          <div className="space-y-4">
            {categories.map((cat) => (
              <CategorySection
                key={cat.cat_id}
                title={cat.cat_name}
                skillCount={cat.skill_count}
                skills={cat.skills}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No skills found. Create your first skill to get started!
          </div>
        )}
      </Section>

      <Section
        title={<Link href="/goals">Current Goals</Link>}
        className="safe-bottom mt-2 px-4"
      >
        {loading ? (
          <LoadingSkeleton />
        ) : goals.length === 0 ? (
          <EmptyState onCreate={() => {}} />
        ) : (
          <GoalCardGrid
            goals={goals}
            onEdit={() => {}}
            onToggleActive={toggleActive}
          />
        )}
      </Section>
    </main>
  );
}
