"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { LevelBanner } from "@/components/ui/LevelBanner";
import { MonumentContainer } from "@/components/ui/MonumentContainer";
import CategorySection from "@/components/skills/CategorySection";
import { SkillCardSkeleton } from "@/components/skills/SkillCardSkeleton";
import { GoalCard } from "../goals/components/GoalCard";
import { GoalDrawer } from "../goals/components/GoalDrawer";
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

export default function DashboardClient() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

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
            const isActive = p.status === "ACTIVE" || p.active !== false;
            if (!isActive) return;
            const tasks = tasksByProject[p.id] || [];
            const total = tasks.length;
            const done = tasks.filter((t) => t.stage === "PERFECT").length;
            const progress = total ? Math.round((done / total) * 100) : 0;
            const status: Project["status"] = progress >= 100 ? "Done" : "In-Progress";
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

          const realGoals: Goal[] = goalsData
            .filter((g) => g.active !== false)
            .map((g) => {
              const projList = projectsByGoal.get(g.id) || [];
              const progress =
                projList.length > 0
                  ? Math.round(
                      projList.reduce((sum, p) => sum + p.progress, 0) /
                        projList.length
                    )
                  : 0;
              const status = progress >= 100 ? "Completed" : "Active";
              return {
                id: g.id,
                title: g.name,
                priority: mapPriority(g.priority),
                progress,
                status,
                active: true,
                updatedAt: g.created_at,
                projects: projList,
              };
            });

          setGoals(realGoals);
        }
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateGoal = (goal: Goal) =>
    setGoals((g) => g.map((item) => (item.id === goal.id ? goal : item)));
  const handleEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setDrawer(true);
  };
  const handleActiveChange = (id: string, active: boolean) => {
    setGoals((g) =>
      g.map((goal) =>
        goal.id === id
          ? {
              ...goal,
              active,
              status: active
                ? goal.progress >= 100
                  ? "Completed"
                  : "Active"
                : "Inactive",
            }
          : goal
      )
    );
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
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-24 bg-gray-800 rounded" />
            ))}
          </div>
        ) : goals.length > 0 ? (
          <div className="grid grid-cols-2 gap-4">
            {goals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onEdit={handleEdit}
                onActiveChange={handleActiveChange}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No active goals found.
          </div>
        )}
      </Section>

      <GoalDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        onAdd={(g) => setGoals((prev) => [g, ...prev])}
        goal={editingGoal || undefined}
        onUpdate={(g) => {
          updateGoal(g);
          setEditingGoal(null);
        }}
      />
    </main>
  );
}
