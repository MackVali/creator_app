"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { LevelBanner } from "@/components/ui/LevelBanner";
import { MonumentContainer } from "@/components/ui/MonumentContainer";
import CategorySection from "@/components/skills/CategorySection";
import { SkillCardSkeleton } from "@/components/skills/SkillCardSkeleton";
import { GoalCard } from "../goals/components/GoalCard";
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

function projectStageToStatus(stage: string): "Todo" | "In-Progress" | "Done" {
  switch (stage) {
    case "RESEARCH":
      return "Todo";
    case "RELEASE":
      return "Done";
    default:
      return "In-Progress";
  }
}

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
    (async () => {
      await Promise.all([fetchDashboardData(), loadGoals()]);
      setLoading(false);
    })();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const response = await fetch("/api/dashboard");
      const data = await response.json();

      // Debug logging
      console.log("🔍 Dashboard API response:", data);
      console.log("🔍 Categories data:", data.skillsAndGoals?.cats);
      console.log("🔍 Goals data:", data.skillsAndGoals?.goals);

      setCategories(data.skillsAndGoals?.cats || []);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    }
  };

  const loadGoals = async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

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
      if (p.status !== "Active") return;
      const tasks = tasksByProject[p.id] || [];
      const total = tasks.length;
      const done = tasks.filter((t) => t.stage === "PERFECT").length;
      const progress = total ? Math.round((done / total) * 100) : 0;
      const status = projectStageToStatus(p.stage);
      const list = projectsByGoal.get(p.goal_id) || [];
      list.push({
        id: p.id,
        name: p.name,
        status,
        progress,
      });
      projectsByGoal.set(p.goal_id, list);
    });

    const realGoals: Goal[] = goalsData
      .filter((g) => g.active)
      .map((g) => {
        const projList = projectsByGoal.get(g.id) || [];
        const progress =
          projList.length > 0
            ? Math.round(
                projList.reduce((sum, p) => sum + p.progress, 0) /
                  projList.length
              )
            : 0;
        let status: Goal["status"] = "Active";
        if (progress >= 100) status = "Completed";
        else if (g.status === "Overdue") status = "Overdue";
        return {
          id: g.id,
          title: g.name,
          priority: mapPriority(g.priority),
          progress,
          status,
          active: g.active,
          updatedAt: g.updated_at || g.created_at,
          projects: projList,
        };
      });
    setGoals(realGoals);
  };

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
          <div className="text-gray-400">Loading goals...</div>
        ) : goals.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {goals.map((goal) => (
              <GoalCard key={goal.id} goal={goal} />
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-400">No active goals</div>
        )}
      </Section>
    </main>
  );
}
