"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { LevelBanner } from "@/components/ui/LevelBanner";
import { MonumentContainer } from "@/components/ui/MonumentContainer";
import CategorySection from "@/components/skills/CategorySection";
import { SkillCardSkeleton } from "@/components/skills/SkillCardSkeleton";
import { GoalCard } from "@/app/(app)/goals/components/GoalCard";
import type { Goal, Project } from "@/app/(app)/goals/types";
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

function projectStageToStatus(stage: string): string {
  switch (stage) {
    case "RESEARCH":
      return "Todo";
    case "RELEASE":
      return "Completed";
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

  const fetchDashboardData = async () => {
    try {
      const response = await fetch("/api/dashboard");
      const data = await response.json();

      setCategories(data.skillsAndGoals?.cats || []);

      const supabase = getSupabaseBrowser();
      if (supabase) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
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
            const tasks = tasksByProject[p.id] || [];
            const total = tasks.length;
            const done = tasks.filter((t) => t.stage === "PERFECT").length;
            const progress = total ? Math.round((done / total) * 100) : 0;
            const status = p.status || projectStageToStatus(p.stage);
            const proj: Project = {
              id: p.id,
              name: p.name,
              status,
              progress,
            };
            const list = projectsByGoal.get(p.goal_id) || [];
            list.push(proj);
            projectsByGoal.set(p.goal_id, list);
          });

          const realGoals: Goal[] = goalsData.map((g) => {
            const projList = projectsByGoal.get(g.id) || [];
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
              status: progress >= 100 ? "Completed" : g.status || "Active",
              active: g.active,
              updatedAt: g.created_at,
              projects: projList,
            };
          });

          const activeGoals = realGoals
            .filter((g) => g.active)
            .map((g) => ({
              ...g,
              projects: g.projects.filter((p) => p.status === "Active"),
            }));

          setGoals(activeGoals);
        }
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
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
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-24 bg-gray-800 rounded" />
            ))}
          </div>
        ) : goals.length > 0 ? (
          <div className="space-y-4">
            {goals.map((goal) => (
              <GoalCard key={goal.id} goal={goal} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No active goals
          </div>
        )}
      </Section>
    </main>
  );
}
