"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Goal as GoalRow } from "@/lib/queries/goals";
import { GoalCard } from "@/app/(app)/goals/components/GoalCard";
import type { Goal, Project } from "@/app/(app)/goals/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { projectWeight, taskWeight, type TaskLite, type ProjectLite } from "@/lib/scheduler/weight";
import { getMonumentsForUser } from "@/lib/queries/monuments";

type GoalRowWithRelations = GoalRow & {
  projects?: {
    id: string;
    name: string;
    goal_id: string;
    priority: string | null;
    energy: string | null;
    stage: string | null;
    created_at: string;
    tasks?: {
      id: string;
      project_id: string | null;
      stage: string;
      name: string;
      skill_id: string | null;
      priority: string | null;
    }[];
    project_skills?: {
      skill_id: string | null;
    }[];
  }[];
};

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

const DAY_IN_MS = 86_400_000;
const GOAL_PRIORITY_WEIGHT: Record<string, number> = {
  NO: 0,
  LOW: 10,
  MEDIUM: 200,
  HIGH: 300,
  CRITICAL: 500,
  "ULTRA-CRITICAL": 1000,
};

const SCHEDULER_PRIORITY_MAP: Record<string, string> = {
  NO: "NO",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "Critical",
  "ULTRA-CRITICAL": "Ultra-Critical",
};

const TASK_STAGE_MAP: Record<string, string> = {
  PREPARE: "Prepare",
  PRODUCE: "Produce",
  PERFECT: "Perfect",
};

function mapSchedulerPriority(priority?: string | null): string {
  if (!priority) return "NO";
  const upper = priority.toUpperCase();
  return SCHEDULER_PRIORITY_MAP[upper] || "NO";
}

function mapSchedulerTaskStage(stage?: string | null): string {
  if (!stage) return "Produce";
  const upper = stage.toUpperCase();
  return TASK_STAGE_MAP[upper] || "Produce";
}

function toSchedulerTask(task: {
  id: string;
  name: string;
  stage: string;
  priorityCode?: string | null;
}): TaskLite {
  return {
    id: task.id,
    name: task.name,
    stage: mapSchedulerTaskStage(task.stage),
    priority: mapSchedulerPriority(task.priorityCode ?? null),
    duration_min: 0,
    energy: null,
  };
}

function toSchedulerProject(project: {
  id: string;
  priorityCode?: string | null;
  stage?: string | null;
}): ProjectLite {
  return {
    id: project.id,
    priority: mapSchedulerPriority(project.priorityCode ?? null),
    stage: project.stage ?? "BUILD",
  };
}

function computeGoalWeight(goal: Goal): number {
  const priorityCode = goal.priorityCode?.toUpperCase() ?? "NO";
  const priorityWeight = GOAL_PRIORITY_WEIGHT[priorityCode] ?? 0;
  const projectWeightSum = goal.projects.reduce(
    (sum, project) => sum + (project.weight ?? 0),
    0
  );
  const ageInDays =
    goal.status === "Completed"
      ? 0
      : Math.max(
          0,
          Math.floor((Date.now() - Date.parse(goal.updatedAt)) / DAY_IN_MS)
        );
  const boost = goal.weightBoost ?? 0;
  return priorityWeight + projectWeightSum + ageInDays + boost;
}

async function fetchGoalsWithRelations(userId: string) {
  const supabase = getSupabaseBrowser();
  if (!supabase) return [] as GoalRowWithRelations[];

  const { data, error } = await supabase
    .from("goals")
    .select(
      `
        id, name, priority, energy, why, created_at, active, status, monument_id, weight, weight_boost,
        projects (
          id, name, goal_id, priority, energy, stage, created_at,
          tasks (
            id, project_id, stage, name, skill_id, priority
          ),
          project_skills (
            skill_id
          )
        )
      `
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching goals for skill view:", error);
    return [];
  }
  return data ?? [];
}

export function SkillGoalsList({ skillId }: { skillId: string }) {
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);

  const decorate = useCallback((goal: Goal) => {
    return {
      ...goal,
      weight: computeGoalWeight(goal),
    };
  }, []);

  useEffect(() => {
    const load = async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase || !skillId) {
        setLoading(false);
        return;
      }
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        const [rows, monuments] = await Promise.all([
          fetchGoalsWithRelations(user.id),
          getMonumentsForUser(user.id).catch(() => []),
        ]);
        const monumentEmojiLookup = new Map(monuments.map(m => [m.id, m.emoji ?? null]));

        const mappedAll: Goal[] = rows.map((g) => {
          const goalSkills = new Set<string>();
          const projList: Project[] = (g.projects ?? []).map((p) => {
            const normalizedTasks = (p.tasks ?? []).map((task) => {
              const normalized = {
                id: task.id,
                name: task.name,
                stage: task.stage,
                skillId: task.skill_id ?? null,
                priorityCode: task.priority ?? null,
                isNew: false,
              };
              if (normalized.skillId) {
                goalSkills.add(normalized.skillId);
              }
              return normalized;
            });
            (p.project_skills ?? []).forEach((record) => {
              if (record?.skill_id) {
                goalSkills.add(record.skill_id);
              }
            });
            const total = normalizedTasks.length;
            const done = normalizedTasks.filter((t) => t.stage === "PERFECT").length;
            const progress = total ? Math.round((done / total) * 100) : 0;
            const status = projectStageToStatus(p.stage ?? "BUILD");
            const schedulerTasks: TaskLite[] = normalizedTasks.map(toSchedulerTask);
            const relatedTaskWeightSum = schedulerTasks.reduce((sum, t) => sum + taskWeight(t), 0);
            const projectWeightValue = projectWeight(
              toSchedulerProject({ id: p.id, priorityCode: p.priority ?? undefined, stage: p.stage ?? undefined }),
              relatedTaskWeightSum
            );
            return {
              id: p.id,
              name: p.name,
              status,
              progress,
              energy: mapEnergy(p.energy ?? "NO"),
              energyCode: p.energy ?? undefined,
              stage: p.stage ?? "BUILD",
              priorityCode: p.priority ?? undefined,
              weight: projectWeightValue,
              isNew: false,
              tasks: normalizedTasks,
            };
          });

          const progress =
            projList.length > 0
              ? Math.round(
                  projList.reduce((sum, p) => sum + p.progress, 0) / projList.length
                )
              : 0;
          const status = g.status ? goalStatusToStatus(g.status) : progress >= 100 ? "Completed" : "Active";

          const base: Goal = {
            id: g.id,
            title: g.name,
            priority: mapPriority(g.priority),
            energy: mapEnergy(g.energy),
            progress,
            status,
            active: g.active ?? status === "Active",
            createdAt: g.created_at,
            updatedAt: g.created_at,
            projects: projList,
            monumentId: g.monument_id ?? null,
            monumentEmoji: monumentEmojiLookup.get(g.monument_id ?? "") ?? null,
            priorityCode: g.priority ?? null,
            weightBoost: g.weight_boost ?? 0,
            skills: Array.from(goalSkills),
            why: g.why || undefined,
          };
          return decorate(base);
        });

        const filtered = mappedAll.filter((g) => (g.skills ?? []).includes(skillId));

        filtered.sort((a, b) => {
          const w = (b.weight ?? 0) - (a.weight ?? 0);
          if (w !== 0) return w;
          const ad = Date.parse(a.updatedAt);
          const bd = Date.parse(b.updatedAt);
          if (Number.isFinite(ad) && Number.isFinite(bd) && ad !== bd) return bd - ad;
          return a.title.localeCompare(b.title);
        });

        setGoals(filtered);
      } catch (err) {
        console.error("Error loading skill goals", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [skillId, decorate]);

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className="grid grid-cols-1 items-start justify-items-stretch gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[220px] w-full rounded-[26px] bg-white/10" />
          ))}
        </div>
      );
    }
    if (goals.length === 0) {
      return (
        <Card className="rounded-2xl border border-white/5 bg-[#111520] p-4 text-center text-sm text-[#A7B0BD] shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
          No goals linked to this skill yet.
        </Card>
      );
    }

    return (
      <div className="grid grid-cols-1 items-start justify-items-stretch gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {goals.map((goal) => (
          <div key={goal.id} className="skill-goal-card-wrapper relative z-0 w-full isolate">
            <GoalCard goal={goal} showWeight={false} showCreatedAt={false} showEmojiPrefix={false} />
          </div>
        ))}
      </div>
    );
  }, [loading, goals]);

  return (
    <div className="skill-goals-list">
      {content}
      <style jsx global>{`
        .skill-goals-list .group { transform: none !important; will-change: auto !important; z-index: 0 !important; }
        .skill-goals-list .group:hover { transform: none !important; }
        .skill-goals-list .skill-goal-card-wrapper { isolation: isolate; content-visibility: auto; contain-intrinsic-size: 300px 1px; }
      `}</style>
    </div>
  );
}

export default SkillGoalsList;
