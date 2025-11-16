"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Goal as GoalRow } from "@/lib/queries/goals";
import { GoalCard } from "@/app/(app)/goals/components/GoalCard";
import type { Goal, Project } from "@/app/(app)/goals/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { projectWeight, taskWeight, type TaskLite, type ProjectLite } from "@/lib/scheduler/weight";

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

async function fetchGoalsWithRelationsForMonument(monumentId: string, userId: string) {
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
    .eq("monument_id", monumentId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching goals for monument:", error);
    return [];
  }
  return data ?? [];
}

export function MonumentGoalsList({ monumentId, monumentEmoji }: { monumentId: string; monumentEmoji?: string | null }) {
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
      if (!supabase || !monumentId) {
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

        const rows = await fetchGoalsWithRelationsForMonument(monumentId, user.id);

        const mapped: Goal[] = rows.map((g) => {
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
            monumentEmoji: monumentEmoji ?? null,
            priorityCode: g.priority ?? null,
            weightBoost: g.weight_boost ?? 0,
            skills: Array.from(goalSkills),
            why: g.why || undefined,
          };
          return decorate(base);
        });

        // Sort by weight desc, then recent updated, then title
        mapped.sort((a, b) => {
          const w = (b.weight ?? 0) - (a.weight ?? 0);
          if (w !== 0) return w;
          const ad = Date.parse(a.updatedAt);
          const bd = Date.parse(b.updatedAt);
          if (Number.isFinite(ad) && Number.isFinite(bd) && ad !== bd) return bd - ad;
          return a.title.localeCompare(b.title);
        });

        setGoals(mapped);
      } catch (err) {
        console.error("Error loading monument goals", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [monumentId, monumentEmoji, decorate]);

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className="grid grid-cols-3 items-start justify-items-stretch gap-3 sm:gap-4 lg:gap-6 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-[140px] w-full rounded-[22px] bg-white/10 sm:h-[200px]"
            />
          ))}
        </div>
      );
    }
    if (goals.length === 0) {
      return (
        <Card className="rounded-2xl border border-white/5 bg-[#111520] p-4 text-center text-sm text-[#A7B0BD] shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
          No goals linked to this monument yet.
        </Card>
      );
    }

    return (
      <div className="grid grid-cols-3 items-start justify-items-stretch gap-3 sm:gap-4 lg:gap-6 xl:grid-cols-4">
        {goals.map((goal) => (
          <div key={goal.id} className="goal-card-wrapper relative z-0 w-full isolate">
            <div className="hidden sm:block">
              <GoalCard
                goal={goal}
                showWeight={false}
                showCreatedAt={false}
                showEmojiPrefix={false}
              />
            </div>
            <div className="sm:hidden">
              <CompactMonumentGoalCard goal={goal} />
            </div>
          </div>
        ))}
      </div>
    );
  }, [loading, goals]);

  return (
    <div className="monument-goals-list">
      {content}
      <style jsx global>{`
        /* Prevent lift/overlap across browsers */
        .monument-goals-list .group { transform: none !important; will-change: auto !important; z-index: 0 !important; }
        .monument-goals-list .group:hover { transform: none !important; }
        .monument-goals-list .goal-card-wrapper { isolation: isolate; content-visibility: auto; contain-intrinsic-size: 300px 1px; }
        @media (max-width: 640px) {
          .monument-goals-list .goal-card-wrapper {
            contain-intrinsic-size: 180px 1px;
          }
        }
      `}</style>
    </div>
  );
}

const energyAccentMap: Record<Goal["energy"], { dot: string; bar: string }> = {
  Low: { dot: "bg-emerald-400", bar: "linear-gradient(90deg,#3CB371,#0d9488)" },
  Medium: { dot: "bg-sky-400", bar: "linear-gradient(90deg,#38bdf8,#6366f1)" },
  High: { dot: "bg-amber-400", bar: "linear-gradient(90deg,#fbbf24,#f97316)" },
  Ultra: { dot: "bg-fuchsia-400", bar: "linear-gradient(90deg,#f472b6,#a855f7)" },
  Extreme: { dot: "bg-yellow-300", bar: "linear-gradient(90deg,#facc15,#f43f5e)" },
  No: { dot: "bg-slate-300", bar: "linear-gradient(90deg,#cbd5f5,#94a3b8)" },
};

function CompactMonumentGoalCard({ goal }: { goal: Goal }) {
  const energy = energyAccentMap[goal.energy];
  const progress = Math.min(Math.max(goal.progress ?? 0, 0), 100);
  const emoji = goal.monumentEmoji ?? goal.emoji ?? goal.title.slice(0, 2);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-white/5 p-2.5 text-white shadow-[0_10px_30px_rgba(3,7,18,0.45)]">
      <div className="flex items-start gap-2">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-sm font-semibold">
          {emoji}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.28em] text-white/50">{goal.status}</p>
          <p className="text-xs font-semibold leading-tight text-white line-clamp-2">{goal.title}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-white/60">
        <span className={`h-1.5 w-1.5 rounded-full ${energy.dot}`} aria-hidden />
        <span className="truncate">{goal.energy} energy</span>
      </div>
      <div className="mt-2 flex items-center gap-1 text-[10px] text-white/60">
        <span className="rounded-full border border-white/10 px-2 py-0.5">{goal.projects.length} proj</span>
        {goal.dueDate ? (
          <span className="truncate rounded-full border border-white/10 px-2 py-0.5">
            {new Date(goal.dueDate).toLocaleDateString()}
          </span>
        ) : null}
      </div>
      <div className="mt-2">
        <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.25em] text-white/40">
          <span>Progress</span>
          <span>{progress}%</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full" style={{ width: `${progress}%`, background: energy.bar }} />
        </div>
      </div>
    </div>
  );
}

export default MonumentGoalsList;
