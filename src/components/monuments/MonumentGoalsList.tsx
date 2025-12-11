"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Goal as GoalRow } from "@/lib/queries/goals";
import { GoalCard } from "@/app/(app)/goals/components/GoalCard";
import { GoalDrawer, type GoalUpdateContext } from "@/app/(app)/goals/components/GoalDrawer";
import type { Goal, Project } from "@/app/(app)/goals/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { projectWeight, taskWeight, type TaskLite, type ProjectLite, dueDateUrgencyBoost } from "@/lib/scheduler/weight";
import { getSkillsForUser } from "@/lib/queries/skills";
import { getMonumentsForUser } from "@/lib/queries/monuments";
import { persistGoalUpdate } from "@/lib/goals/persistGoalUpdate";

type GoalRowWithRelations = GoalRow & {
  due_date?: string | null;
  priority_code?: string | null;
  energy_code?: string | null;
  projects?: {
    id: string;
    name: string;
    goal_id: string;
    priority: { id?: string | number | null; name?: string | null } | string | null;
    energy: { id?: string | number | null; name?: string | null } | string | null;
    stage: string | null;
    duration_min?: number | null;
    created_at: string;
    due_date?: string | null;
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

function mapPriority(
  priority: { name?: string | null } | string | null | undefined
): Goal["priority"] {
  const normalized = extractLookupName(priority)?.toUpperCase();
  switch (normalized) {
    case "NO":
      return "No";
    case "ULTRA-CRITICAL":
      return "Ultra-Critical";
    case "CRITICAL":
      return "Critical";
    case "HIGH":
      return "High";
    case "MEDIUM":
      return "Medium";
    case "LOW":
      return "Low";
    default:
      return "Low";
  }
}

function mapEnergy(energy: { name?: string | null } | string | null | undefined): Goal["energy"] {
  const normalized = extractLookupName(energy)?.toUpperCase();
  switch (normalized) {
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

const COMPLETED_PROJECT_STAGES = new Set(["RELEASE", "COMPLETE", "COMPLETED", "DONE"]);

const NORMALIZED_PRIORITY_VALUES = new Set(["NO", "LOW", "MEDIUM", "HIGH", "CRITICAL", "ULTRA-CRITICAL"]);
const NORMALIZED_ENERGY_VALUES = new Set(["NO", "LOW", "MEDIUM", "HIGH", "ULTRA", "EXTREME"]);
const GOAL_GRID_CLASS =
  "goal-grid grid w-full max-w-full grid-cols-[repeat(auto-fit,_minmax(110px,_1fr))] gap-2 px-0.5 sm:grid-cols-3 sm:px-2 sm:gap-3 md:grid-cols-4 md:-mx-3 md:px-3 lg:grid-cols-5 xl:grid-cols-6";

const normalizePriorityCode = (value?: string | null): string => {
  if (typeof value !== "string") return "NO";
  const upper = value.toUpperCase();
  return NORMALIZED_PRIORITY_VALUES.has(upper) ? upper : "NO";
};

const normalizeEnergyCode = (value?: string | null): string => {
  if (typeof value !== "string") return "NO";
  const upper = value.toUpperCase();
  return NORMALIZED_ENERGY_VALUES.has(upper) ? upper : "NO";
};

const extractLookupName = (field: { name?: string | null } | string | null | undefined) => {
  if (!field) return null;
  if (typeof field === "string") return field;
  if (typeof field === "object" && "name" in field) {
    const candidate = field.name;
    return typeof candidate === "string" ? candidate : null;
  }
  return null;
};

const extractLookupId = (
  field: { id?: string | number | null } | string | number | null | undefined
) => {
  if (field && typeof field === "object" && "id" in field) {
    return field.id ?? null;
  }
  if (typeof field === "string" || typeof field === "number") {
    return field;
  }
  return null;
};

const isProjectStageComplete = (stage?: string | null): boolean => {
  if (typeof stage !== "string") return false;
  return COMPLETED_PROJECT_STAGES.has(stage.toUpperCase());
};

function mapSchedulerPriority(priority?: string | null): string {
  if (typeof priority !== "string") return "NO";
  const upper = priority.toUpperCase();
  return SCHEDULER_PRIORITY_MAP[upper] || "NO";
}

function mapSchedulerTaskStage(stage?: string | null): string {
  if (typeof stage !== "string") return "Produce";
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
  dueDate?: string | null;
}): ProjectLite {
  return {
    id: project.id,
    priority: mapSchedulerPriority(project.priorityCode ?? null),
    stage: project.stage ?? "BUILD",
    due_date: project.dueDate ?? null,
  };
}

function computeGoalWeight(goal: Goal): number {
  const priorityCode = normalizePriorityCode(goal.priorityCode);
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
  const dueDateBoost = dueDateUrgencyBoost(goal.dueDate ?? null, {
    linearMax: 220,
    surgeMax: 420,
    surgeWindowDays: 4,
    linearWindowDays: 30,
    overdueBonusPerDay: 85,
    overdueMax: 360,
  });
  return priorityWeight + projectWeightSum + ageInDays + boost + dueDateBoost;
}

async function fetchGoalsWithRelationsForMonument(monumentId: string, userId: string) {
  const supabase = getSupabaseBrowser();
  if (!supabase) return [] as GoalRowWithRelations[];

  const baseSelect =
    "id, name, priority, energy, priority_code, energy_code, why, created_at, active, status, monument_id, weight, weight_boost, due_date";
  const selectWithRelations = `
    ${baseSelect},
    projects (
      id, name, goal_id, stage, duration_min, created_at, due_date,
      priority:priority(name),
      energy:energy(name),
      tasks (
        id, project_id, stage, name, skill_id, priority
      ),
      project_skills (
        skill_id
      )
    )
  `;

  const runQuery = (select: string) =>
    supabase
      .from("goals")
      .select(select)
      .eq("user_id", userId)
      .eq("monument_id", monumentId)
      .order("created_at", { ascending: false });

  const { data, error } = await runQuery(selectWithRelations);

  if (!error) {
    return data ?? [];
  }

  console.warn("Falling back to basic monument goal fetch:", error);

  const fallback = await runQuery(baseSelect);
  if (fallback.error) {
    console.error("Error fetching monument goals:", fallback.error);
    return [];
  }
  return fallback.data ?? [];
}

export function MonumentGoalsList({ monumentId, monumentEmoji }: { monumentId: string; monumentEmoji?: string | null }) {
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [openGoalId, setOpenGoalId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [monuments, setMonuments] = useState<{ id: string; title: string; emoji: string | null }[]>([]);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setOpenGoalId(null);
  }, [monumentId]);

  const decorate = useCallback((goal: Goal) => {
    return {
      ...goal,
      weight: computeGoalWeight(goal),
    };
  }, []);

  const fetchGoalForEditing = useCallback(async (goal: Goal) => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return goal;
    try {
      const { data, error } = await supabase
        .from("goals")
        .select(
          "priority, energy, monument_id, due_date, why, active, status, priority_lookup:priority(name), energy_lookup:energy(name)"
        )
        .eq("id", goal.id)
        .single();
      if (error || !data) {
        return goal;
      }
      const priorityName =
        typeof data.priority_lookup?.name === "string"
          ? data.priority_lookup.name
          : null;
      const energyName =
        typeof data.energy_lookup?.name === "string"
          ? data.energy_lookup.name
          : null;
      const priorityCode = priorityName
        ? priorityName.toUpperCase()
        : typeof data.priority === "string"
          ? data.priority.toUpperCase()
          : null;
      const energyCode = energyName
        ? energyName.toUpperCase()
        : typeof data.energy === "string"
          ? data.energy.toUpperCase()
          : null;
      return {
        ...goal,
        priority: priorityCode ? mapPriority(priorityCode) : goal.priority,
        priorityCode: priorityCode ?? goal.priorityCode ?? null,
        energy: energyCode ? mapEnergy(energyCode) : goal.energy,
        energyCode: energyCode ?? goal.energyCode ?? null,
        monumentId: data.monument_id ?? goal.monumentId ?? null,
        dueDate: data.due_date ?? goal.dueDate,
        why: data.why ?? goal.why,
        active: typeof data.active === "boolean" ? data.active : goal.active,
        status: data.status ? goalStatusToStatus(data.status) : goal.status,
      };
    } catch (err) {
      console.error("Failed to fetch goal for editing", err);
      return goal;
    }
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
        setUserId(user.id);

        const [rows, skills, userMonuments] = await Promise.all([
          fetchGoalsWithRelationsForMonument(monumentId, user.id),
          getSkillsForUser(user.id).catch(() => []),
          getMonumentsForUser(user.id).catch(() => []),
        ]);

        setMonuments(
          userMonuments.map((monument) => ({
            id: monument.id,
            title: monument.title,
            emoji: monument.emoji ?? null,
          }))
        );

        const skillIconLookup = new Map(skills.map(skill => [skill.id, skill.icon ?? null]));
        const resolveSkillEmoji = (skillId?: string | null) => {
          if (!skillId) return null;
          return skillIconLookup.get(skillId ?? "") ?? null;
        };

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
            const projectSkillIds: string[] = [];
            (p.project_skills ?? []).forEach((record) => {
              if (record?.skill_id) {
                goalSkills.add(record.skill_id);
                projectSkillIds.push(record.skill_id);
              }
            });
            const total = normalizedTasks.length;
            const done = normalizedTasks.filter((t) => t.stage === "PERFECT").length;
            let progress = total ? Math.round((done / total) * 100) : 0;
            if (isProjectStageComplete(p.stage)) {
              progress = 100;
            }
            const status = projectStageToStatus(p.stage ?? "BUILD");
            const schedulerTasks: TaskLite[] = normalizedTasks.map(toSchedulerTask);
            const relatedTaskWeightSum = schedulerTasks.reduce((sum, t) => sum + taskWeight(t), 0);
            const projectWeightValue = projectWeight(
              toSchedulerProject({
                id: p.id,
                priorityCode: p.priority ?? undefined,
                stage: p.stage ?? undefined,
                dueDate: p.due_date ?? null,
              }),
              relatedTaskWeightSum
            );
            const normalizedTaskSkillIds = normalizedTasks
              .map((task) => task.skillId)
              .filter((value): value is string => Boolean(value));
            const projectEmoji =
              projectSkillIds
                .map(resolveSkillEmoji)
                .find((emoji): emoji is string => Boolean(emoji)) ??
              normalizedTaskSkillIds
                .map(resolveSkillEmoji)
                .find((emoji): emoji is string => Boolean(emoji)) ??
              null;
            const rawEnergy = extractLookupName(p.energy);
            const rawPriority = extractLookupName(p.priority);
            const energyCode = normalizeEnergyCode(rawEnergy);
            const priorityCode = normalizePriorityCode(rawPriority);
            const energyId = extractLookupId(p.energy);
            const priorityId = extractLookupId(p.priority);
            return {
              id: p.id,
              name: p.name,
              status,
              progress,
              energy: mapEnergy(energyCode),
              energyCode,
              dueDate: p.due_date ?? null,
              emoji: projectEmoji,
              stage: p.stage ?? "BUILD",
              priorityCode,
              energyId,
              priorityId,
              durationMinutes:
                typeof p.duration_min === "number" && Number.isFinite(p.duration_min)
                  ? p.duration_min
                  : null,
              skillIds: projectSkillIds,
              weight: projectWeightValue,
              isNew: false,
              tasks: normalizedTasks,
            };
          });

          const status = g.status ? goalStatusToStatus(g.status) : undefined;
          let derivedProgress =
            projList.length > 0
              ? Math.round(
                  projList.reduce((sum, p) => sum + p.progress, 0) / projList.length
                )
              : 0;
          const normalizedStatus = status ?? (derivedProgress >= 100 ? "Completed" : "Active");
          if (normalizedStatus === "Completed") {
            derivedProgress = 100;
          }

          const goalPrioritySource =
            g.priority_code ?? extractLookupName(g.priority);
          const normalizedGoalPriorityCode = goalPrioritySource
            ? goalPrioritySource.toUpperCase()
            : null;
          const goalEnergySource =
            g.energy_code ?? extractLookupName(g.energy);
          const normalizedGoalEnergyCode = goalEnergySource
            ? goalEnergySource.toUpperCase()
            : null;
          const base: Goal = {
            id: g.id,
            title: g.name,
            priority: mapPriority(goalPrioritySource),
            energy: mapEnergy(goalEnergySource),
            progress: derivedProgress,
            status: normalizedStatus,
            active: g.active ?? normalizedStatus === "Active",
            createdAt: g.created_at,
            updatedAt: g.created_at,
            dueDate: g.due_date ?? undefined,
            projects: projList,
            monumentId: g.monument_id ?? null,
            monumentEmoji: monumentEmoji ?? null,
            priorityCode: normalizedGoalPriorityCode,
            energyCode: normalizedGoalEnergyCode,
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

  const handleProjectUpdated = useCallback(
    (goalId: string, projectId: string, updates: Partial<Project>) => {
      setGoals((prev) =>
        prev.map((goal) => {
          if (goal.id !== goalId) return goal;
          return {
            ...goal,
            projects: goal.projects.map((project) =>
              project.id === projectId ? { ...project, ...updates } : project
            ),
          };
        })
      );
    },
    []
  );

  const handleProjectDeleted = useCallback(
    (goalId: string, projectId: string) => {
      setGoals((prev) =>
        prev.map((goal) => {
          if (goal.id !== goalId) return goal;
          return {
            ...goal,
            projects: goal.projects.filter((project) => project.id !== projectId),
          };
        })
      );
    },
    []
  );

  const handleGoalOpenChange = useCallback((goalId: string, isOpen: boolean) => {
    setOpenGoalId((current) => {
      if (isOpen) {
        return goalId;
      }
      if (current === goalId) {
        return null;
      }
      return current;
    });
  }, []);

  const handleGoalEdit = useCallback((goal: Goal) => {
    setEditingGoal(null);
    void fetchGoalForEditing(goal).then((fresh) => {
      setEditingGoal(fresh);
      setDrawerOpen(true);
    });
  }, [fetchGoalForEditing]);

  const handleGoalUpdated = useCallback(
    async (updatedGoal: Goal, context: GoalUpdateContext) => {
      setGoals((prev) =>
        prev.map((goal) => (goal.id === updatedGoal.id ? decorate(updatedGoal) : goal))
      );

      const supabase = getSupabaseBrowser();
      if (!supabase) return;
      try {
        await persistGoalUpdate({
          supabase,
          goal: updatedGoal,
          context,
          userId,
          onUserResolved: setUserId,
        });
      } catch (err) {
        console.error("Error updating goal from monument detail:", err);
      }
    },
    [decorate, userId]
  );

  useEffect(() => {
    if (!openGoalId) return;
    if (!goals.some((goal) => goal.id === openGoalId)) {
      setOpenGoalId(null);
    }
  }, [goals, openGoalId]);

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className={GOAL_GRID_CLASS}>
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-[100px] w-full rounded-2xl bg-white/10" />
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
      <div className={GOAL_GRID_CLASS}>
        {goals.map((goal) => (
          <div key={goal.id} className="goal-card-wrapper relative z-0 w-full isolate min-w-0">
            <GoalCard
              goal={goal}
              showWeight={false}
              showCreatedAt={false}
              showEmojiPrefix={false}
              variant="compact"
              onEdit={() => handleGoalEdit(goal)}
              onProjectUpdated={(projectId, updates) =>
                handleProjectUpdated(goal.id, projectId, updates)
              }
              onProjectDeleted={(projectId) =>
                handleProjectDeleted(goal.id, projectId)
              }
              open={openGoalId === goal.id}
              onOpenChange={(isOpen) => handleGoalOpenChange(goal.id, isOpen)}
            />
          </div>
        ))}
      </div>
    );
  }, [
    loading,
    goals,
    openGoalId,
    handleGoalOpenChange,
    handleProjectUpdated,
    handleProjectDeleted,
  ]);

  return (
    <div className="monument-goals-list">
      {content}
      <style jsx global>{`
        /* Prevent lift/overlap across browsers */
        .monument-goals-list .group { transform: none !important; will-change: auto !important; z-index: 0 !important; }
        .monument-goals-list .group:hover { transform: none !important; }
        @media (max-width: 520px) {
          .monument-goals-list .goal-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 0.4rem;
            padding-left: 0;
            padding-right: 0;
          }
          .monument-goals-list [data-variant='compact'] {
            padding: 0.55rem 0.4rem;
            border-radius: 1rem;
            min-height: 90px;
            aspect-ratio: auto;
          }
          .monument-goals-list [data-variant='compact'] button {
            gap: 0.45rem;
          }
          .monument-goals-list [data-variant='compact'] button > div:first-of-type {
            height: 1.85rem;
            width: 1.85rem;
            border-radius: 0.85rem;
            font-size: 0.7rem;
          }
          .monument-goals-list [data-variant='compact'] h3 {
            font-size: 0.45rem;
            line-height: 1.1;
            min-height: 0;
            max-height: 2.2em;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        }
        /* Avoid Safari/iOS clipping issues on small screens */
        @media (min-width: 640px) {
          .monument-goals-list .goal-card-wrapper { isolation: isolate; content-visibility: auto; contain-intrinsic-size: 300px 1px; }
        }
      `}</style>
      <GoalDrawer
        key={editingGoal?.id ?? (drawerOpen ? "goal-editor" : "goal-editor-closed")}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setEditingGoal(null);
        }}
        onAdd={() => {}}
        initialGoal={editingGoal}
        monuments={monuments}
        onUpdate={handleGoalUpdated}
        hideProjects
      />
    </div>
  );
}
export default MonumentGoalsList;
