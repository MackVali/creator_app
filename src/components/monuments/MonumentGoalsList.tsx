"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { getGoalStatusById } from "@/lib/queries/goals";
import type { Goal as GoalRow } from "@/lib/queries/goals";
import { GoalCard } from "@/app/(app)/goals/components/GoalCard";
import MixedRoadmapCard from "@/app/(app)/goals/components/MixedRoadmapCard";
import { RoadmapCard } from "@/app/(app)/goals/components/RoadmapCard";
import type { ProjectCardMorphOrigin } from "@/app/(app)/goals/components/ProjectRow";
import type { Goal, Project } from "@/app/(app)/goals/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Fab, type FabEditTarget } from "@/components/ui/Fab";
import {
  projectWeight,
  taskWeight,
  type TaskLite,
  type ProjectLite,
} from "@/lib/scheduler/weight";
import { getSkillsForUser } from "@/lib/queries/skills";
import {
  listRoadmaps,
  listRoadmapsWithItems,
  type Roadmap,
  type RoadmapWithItems,
} from "@/lib/queries/roadmaps";
import { computeGoalWeight } from "@/lib/goals/weight";
import { normalizeGoalStatus } from "@/lib/goals/status";

type GoalRowWithRelations = GoalRow & {
  due_date?: string | null;
  priority_code?: string | null;
  energy_code?: string | null;
  emoji?: string | null;
  projects?: {
    id: string;
    name: string;
    goal_id: string;
    priority: string | null;
    energy: string | null;
    stage: string | null;
    completed_at?: string | null;
    duration_min?: number | null;
    created_at: string;
    due_date?: string | null;
    tasks?: {
      id: string;
      stage: string;
      name?: string;
      skill_id: string | null;
      priority: string | null;
    }[];
    project_skills?: {
      skill_id: string | null;
    }[];
  }[];
  priority_rank?: number | null;
};

const GOAL_RELATIONS_BASE_SELECT =
  "id, name, priority, energy, priority_code, energy_code, why, created_at, active, status, monument_id, roadmap_id, weight, weight_boost, due_date, emoji, priority_rank";
const GOAL_RELATIONS_SELECT = `
  ${GOAL_RELATIONS_BASE_SELECT},
  projects (
    id, name, goal_id, stage, completed_at, duration_min, created_at, due_date,
    priority,
    energy,
    tasks (
      id, stage, skill_id, priority
    ),
    project_skills (
      skill_id
    )
  )
`;

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

function mapEnergy(
  energy: { name?: string | null } | string | null | undefined
): Goal["energy"] {
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

function buildProjectFromUpdates(
  projectId: string,
  updates: Partial<Project>
): Project {
  return {
    id: projectId,
    name: updates.name ?? "New project",
    status: updates.status ?? "In-Progress",
    progress: updates.progress ?? 0,
    dueDate: updates.dueDate,
    energy: updates.energy ?? "No",
    emoji: updates.emoji ?? null,
    tasks: updates.tasks ?? [],
    stage: updates.stage ?? "BUILD",
    energyCode: updates.energyCode ?? "NO",
    priorityCode: updates.priorityCode ?? "NO",
    durationMinutes: updates.durationMinutes ?? null,
    skillIds: updates.skillIds ?? [],
    weight: updates.weight,
    isNew: updates.isNew,
  };
}

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

const COMPLETED_PROJECT_STAGES = new Set([
  "RELEASE",
  "COMPLETE",
  "COMPLETED",
  "DONE",
]);

const NORMALIZED_PRIORITY_VALUES = new Set([
  "NO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
  "ULTRA-CRITICAL",
]);
const NORMALIZED_ENERGY_VALUES = new Set([
  "NO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "ULTRA",
  "EXTREME",
]);
const GOAL_GRID_CLASS =
  "goal-grid grid w-full max-w-full grid-cols-[repeat(auto-fit,_minmax(110px,_1fr))] gap-1 px-0.5 sm:grid-cols-3 sm:px-2 sm:gap-1 md:grid-cols-4 md:-mx-3 md:px-3 lg:grid-cols-5 xl:grid-cols-6";

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

const extractLookupName = (
  field: { name?: string | null } | string | null | undefined
) => {
  if (!field) return null;
  if (typeof field === "string") return field;
  if (typeof field === "object" && "name" in field) {
    const candidate = field.name;
    return typeof candidate === "string" ? candidate : null;
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

async function fetchGoalsWithRelationsForMonument(
  monumentId: string,
  userId: string
) {
  const supabase = getSupabaseBrowser();
  if (!supabase) return [] as GoalRowWithRelations[];

  const runQuery = (select: string) =>
    supabase
      .from("goals")
      .select(select)
      .eq("user_id", userId)
      .eq("monument_id", monumentId)
      .order("created_at", { ascending: false });

  const variants = [
    { description: "enum column project fetch", select: GOAL_RELATIONS_SELECT },
    {
      description: "lookup relation project fetch",
      select: GOAL_RELATIONS_SELECT,
    },
  ];

  for (const variant of variants) {
    const { data, error } = await runQuery(variant.select);
    if (!error) {
      return data ?? [];
    }
    console.warn(
      `Monument goal fetch variant failed (${variant.description}):`,
      error
    );
  }

  console.warn("Falling back to basic monument goal fetch");

  const fallback = await runQuery(GOAL_RELATIONS_BASE_SELECT);
  if (fallback.error) {
    console.error("Error fetching monument goals:", fallback.error);
    return [];
  }
  return fallback.data ?? [];
}

async function fetchGoalWithRelationsById(goalId: string) {
  const supabase = getSupabaseBrowser();
  if (!supabase) return null;

  const variants = [
    { description: "enum column goal display fetch", select: GOAL_RELATIONS_SELECT },
    {
      description: "lookup relation goal display fetch",
      select: GOAL_RELATIONS_SELECT,
    },
  ];

  for (const variant of variants) {
    const { data, error } = await supabase
      .from("goals")
      .select(variant.select)
      .eq("id", goalId)
      .single();

    if (!error && data) {
      return data as GoalRowWithRelations;
    }

    if (error) {
      console.warn(
        `Goal display fetch variant failed (${variant.description}):`,
        error
      );
    }
  }

  const fallback = await supabase
    .from("goals")
    .select(GOAL_RELATIONS_BASE_SELECT)
    .eq("id", goalId)
    .single();

  if (fallback.error) {
    console.error("Error fetching goal for display:", fallback.error);
    return null;
  }

  return (fallback.data as GoalRowWithRelations | null) ?? null;
}

async function fetchTrueRoadmapsForMonument(
  userId: string,
  monumentId: string
): Promise<RoadmapWithItems[]> {
  const allRoadmapsWithItems = await listRoadmapsWithItems(userId).catch(
    (err) => {
      console.error("Error fetching true monument roadmaps:", err);
      return [];
    }
  );

  return allRoadmapsWithItems.filter(
    (roadmap) => roadmap.monument_id === monumentId
  );
}

export function MonumentGoalsList({
  monumentId,
  monumentEmoji,
  monumentView = "goals",
  goalSection = "active",
  onGoalSectionChange,
  roadmapEmptyState,
}: {
  monumentId: string;
  monumentEmoji?: string | null;
  monumentView?: "goals" | "roadmap";
  goalSection?: "active" | "completed";
  onGoalSectionChange?: (section: "active" | "completed") => void;
  roadmapEmptyState?: ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  const [monumentRoadmapsWithItems, setMonumentRoadmapsWithItems] = useState<
    RoadmapWithItems[]
  >([]);
  const [roadmapGoals, setRoadmapGoals] = useState<Map<string, Goal[]>>(
    new Map()
  );
  const [openGoalId, setOpenGoalId] = useState<string | null>(null);
  const [roadmapOpenGoal, setRoadmapOpenGoal] = useState<Goal | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [fabEditTarget, setFabEditTarget] = useState<FabEditTarget | null>(
    null
  );

  useEffect(() => {
    setOpenGoalId(null);
    setRoadmapOpenGoal(null);
  }, [monumentId]);

  const decorate = useCallback((goal: Goal) => {
    try {
      return {
        ...goal,
        weight: computeGoalWeight(goal),
      };
    } catch (error) {
      console.error("Failed to compute monument goal weight:", {
        goalId: goal.id,
        roadmapId: goal.roadmapId ?? null,
        priorityRank: goal.priorityRank ?? null,
        error,
      });
      return {
        ...goal,
        weight: typeof goal.weight === "number" ? goal.weight : 0,
      };
    }
  }, []);

  const mapGoalRowToDisplayGoal = useCallback(
    (
      goalRow: GoalRowWithRelations,
      skillIconLookup: Map<string, string | null>,
      fallback?: Partial<Goal>
    ): Goal => {
      const resolveSkillEmoji = (skillId?: string | null) => {
        if (!skillId) return null;
        return skillIconLookup.get(skillId ?? "") ?? null;
      };

      const goalSkills = new Set<string>(fallback?.skills ?? []);
      const projList: Project[] = (goalRow.projects ?? []).map((project) => {
        const normalizedTasks = (project.tasks ?? []).map((task) => {
          const normalized = {
            id: task.id,
            name: task.name ?? "Untitled task",
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
        (project.project_skills ?? []).forEach((record) => {
          if (record?.skill_id) {
            goalSkills.add(record.skill_id);
            projectSkillIds.push(record.skill_id);
          }
        });
        const total = normalizedTasks.length;
        const done = normalizedTasks.filter((task) => task.stage === "PERFECT").length;
        const isCompleted =
          typeof project.completed_at === "string" &&
          project.completed_at.length > 0;
        const effectiveStage = isCompleted ? "RELEASE" : (project.stage ?? "BUILD");
        let progress = total ? Math.round((done / total) * 100) : 0;
        if (isCompleted || isProjectStageComplete(effectiveStage)) {
          progress = 100;
        }
        const status = isCompleted
          ? "Done"
          : projectStageToStatus(effectiveStage);
        const schedulerTasks: TaskLite[] = normalizedTasks.map(toSchedulerTask);
        const relatedTaskWeightSum = schedulerTasks.reduce(
          (sum, task) => sum + taskWeight(task),
          0
        );
        const projectWeightValue = projectWeight(
          toSchedulerProject({
            id: project.id,
            priorityCode: project.priority ?? undefined,
            stage: effectiveStage,
            dueDate: project.due_date ?? undefined,
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
        const rawEnergy = extractLookupName(project.energy);
        const rawPriority = extractLookupName(project.priority);
        const energyCode = normalizeEnergyCode(rawEnergy);
        const priorityCode = normalizePriorityCode(rawPriority);

        return {
          id: project.id,
          name: project.name,
          status,
          progress,
          energy: mapEnergy(energyCode),
          energyCode,
          dueDate: project.due_date ?? undefined,
          emoji: projectEmoji,
          stage: effectiveStage,
          priorityCode,
          durationMinutes:
            typeof project.duration_min === "number" &&
            Number.isFinite(project.duration_min)
              ? project.duration_min
              : null,
          skillIds: projectSkillIds,
          weight: projectWeightValue,
          isNew: false,
          tasks: normalizedTasks,
        };
      });

      let derivedProgress =
        projList.length > 0
          ? Math.round(
              projList.reduce((sum, project) => sum + project.progress, 0) /
                projList.length
            )
          : 0;
      const normalizedStatus = normalizeGoalStatus(goalRow.status, goalRow.active);
      if (normalizedStatus === "COMPLETED") {
        derivedProgress = 100;
      }

      const goalPrioritySource =
        goalRow.priority_code ?? extractLookupName(goalRow.priority);
      const normalizedGoalPriorityCode = goalPrioritySource
        ? goalPrioritySource.toUpperCase()
        : null;
      const goalEnergySource =
        goalRow.energy_code ?? extractLookupName(goalRow.energy);
      const normalizedGoalEnergyCode = goalEnergySource
        ? goalEnergySource.toUpperCase()
        : null;

      return decorate({
        id: goalRow.id,
        title: goalRow.name,
        emoji: goalRow.emoji ?? fallback?.emoji ?? undefined,
        priority: mapPriority(goalPrioritySource),
        energy: mapEnergy(goalEnergySource),
        progress: derivedProgress,
        status: normalizedStatus,
        active: normalizedStatus === "ACTIVE",
        createdAt: goalRow.created_at ?? fallback?.createdAt ?? "",
        updatedAt: goalRow.created_at ?? fallback?.updatedAt ?? "",
        dueDate: goalRow.due_date ?? fallback?.dueDate,
        projects: projList,
        monumentId: goalRow.monument_id ?? fallback?.monumentId ?? null,
        monumentEmoji: fallback?.monumentEmoji ?? monumentEmoji ?? null,
        roadmapId: goalRow.roadmap_id ?? fallback?.roadmapId ?? null,
        priorityCode: normalizedGoalPriorityCode,
        energyCode: normalizedGoalEnergyCode,
        weightBoost: goalRow.weight_boost ?? fallback?.weightBoost ?? 0,
        skills: Array.from(goalSkills),
        priorityRank:
          typeof goalRow.priority_rank === "number" &&
          Number.isFinite(goalRow.priority_rank)
            ? goalRow.priority_rank
            : fallback?.priorityRank,
        why: goalRow.why || fallback?.why,
      });
    },
    [decorate, monumentEmoji]
  );

  const fetchGoalForDisplay = useCallback(
    async (goalId: string, fallback?: Partial<Goal>): Promise<Goal | null> => {
      const fallbackGoal = fallback
        ? decorate({
            id: fallback.id ?? goalId,
            title: fallback.title ?? "Untitled goal",
            emoji: fallback.emoji,
            priority: fallback.priority ?? "Low",
            energy: fallback.energy ?? "No",
            progress: fallback.progress ?? 0,
            status: fallback.status ?? "ACTIVE",
            active: fallback.active ?? true,
            createdAt: fallback.createdAt ?? "",
            updatedAt: fallback.updatedAt ?? "",
            dueDate: fallback.dueDate,
            projects: fallback.projects ?? [],
            monumentId: fallback.monumentId ?? monumentId,
            monumentEmoji: fallback.monumentEmoji ?? monumentEmoji ?? null,
            roadmapId: fallback.roadmapId ?? null,
            priorityCode: fallback.priorityCode ?? "NO",
            energyCode: fallback.energyCode ?? "NO",
            skills: fallback.skills ?? [],
            weightBoost: fallback.weightBoost ?? 0,
            why: fallback.why,
            priorityRank: fallback.priorityRank,
          })
        : null;

      try {
        const goalRow = await fetchGoalWithRelationsById(goalId);
        if (!goalRow) {
          return fallbackGoal;
        }

        let skillIconLookup = new Map<string, string | null>();
        if (userId) {
          const skills = await getSkillsForUser(userId).catch(() => []);
          skillIconLookup = new Map(
            skills.map((skill) => [skill.id, skill.icon ?? null])
          );
        }

        return mapGoalRowToDisplayGoal(goalRow, skillIconLookup, fallback);
      } catch (err) {
        console.warn("Failed to fetch goal for roadmap display:", err);
        return fallbackGoal;
      }
    },
    [decorate, mapGoalRowToDisplayGoal, monumentEmoji, monumentId, userId]
  );

  const refreshTrueRoadmaps = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase || !monumentId) {
      setMonumentRoadmapsWithItems([]);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setMonumentRoadmapsWithItems([]);
      return;
    }

    setUserId(user.id);
    const trueMonumentRoadmaps = await fetchTrueRoadmapsForMonument(
      user.id,
      monumentId
    );
    setMonumentRoadmapsWithItems(trueMonumentRoadmaps);
  }, [monumentId]);

  useEffect(() => {
    const load = async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase || !monumentId) {
        setMonumentRoadmapsWithItems([]);
        setLoading(false);
        return;
      }
      setMonumentRoadmapsWithItems([]);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }
        setUserId(user.id);

        const [rows, skills, trueMonumentRoadmaps] =
          await Promise.all([
            fetchGoalsWithRelationsForMonument(monumentId, user.id),
            getSkillsForUser(user.id).catch(() => []),
            fetchTrueRoadmapsForMonument(user.id, monumentId),
          ]);

        setMonumentRoadmapsWithItems(trueMonumentRoadmaps);

        // Prepare skill emoji resolver before mapping any goals (used in both roadmap + standalone mappings)
        const skillIconLookup = new Map(
          skills.map((skill) => [skill.id, skill.icon ?? null])
        );

        // Check if any goals have a valid roadmap_id (non-null, non-undefined, non-empty string)
        const roadmapIds = new Set<string>();
        rows.forEach((g) => {
          const roadmapId = g.roadmap_id;
          if (roadmapId && roadmapId.trim() !== "") {
            roadmapIds.add(roadmapId);
          }
        });

        // If roadmaps exist, fetch them and their goals
        let monumentRoadmaps: Roadmap[] = [];
        const roadmapGoalsMap = new Map<string, Goal[]>();
        if (roadmapIds.size > 0) {
          try {
            const allRoadmaps = await listRoadmaps(user.id);
            monumentRoadmaps = allRoadmaps.filter((r) => roadmapIds.has(r.id));
            setRoadmaps(monumentRoadmaps);

            // Fetch goals for each roadmap
            for (const roadmap of monumentRoadmaps) {
              const roadmapGoalsData = rows.filter(
                (g) => g.roadmap_id === roadmap.id
              );
              const roadmapGoalsList: Goal[] = roadmapGoalsData.map((g) =>
                mapGoalRowToDisplayGoal(g, skillIconLookup, {
                  roadmapId: roadmap.id,
                })
              );
              roadmapGoalsMap.set(roadmap.id, roadmapGoalsList);
            }
            setRoadmapGoals(roadmapGoalsMap);
          } catch (err) {
            console.error("Error fetching roadmaps for monument:", err);
          }
        }

        // Filter out goals with valid roadmap_id if roadmaps exist
        // Only hide goals with a valid roadmap_id (non-null, non-undefined, non-empty string)
        const goalsToMap =
          monumentRoadmaps.length > 0
            ? rows.filter((g) => {
                const roadmapId = g.roadmap_id;
                // Keep goals where roadmap_id is null, undefined, or empty string
                return !roadmapId || roadmapId.trim() === "";
              })
            : rows;

        const mapped: Goal[] = goalsToMap.map((g) =>
          mapGoalRowToDisplayGoal(g, skillIconLookup)
        );

        // Sort by weight desc, then recent updated, then title
        mapped.sort((a, b) => {
          const w = (b.weight ?? 0) - (a.weight ?? 0);
          if (w !== 0) return w;
          const ad = Date.parse(a.updatedAt);
          const bd = Date.parse(b.updatedAt);
          if (Number.isFinite(ad) && Number.isFinite(bd) && ad !== bd)
            return bd - ad;
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
  }, [
    monumentId,
    monumentEmoji,
    decorate,
    mapGoalRowToDisplayGoal,
    refreshVersion,
  ]);

  const refreshGoalStatus = useCallback(
    async (goalId: string) => {
      if (!goalId) return;
      try {
        const statusRow = await getGoalStatusById(goalId);
        if (!statusRow?.status) return;
        setGoals((prev) =>
          prev.map((goal) =>
            goal.id === goalId
              ? {
                  ...goal,
                  status: normalizeGoalStatus(statusRow.status),
                  updatedAt: statusRow.updatedAt ?? goal.updatedAt,
                }
              : goal
          )
        );
      } catch (err) {
        console.error("Failed to refresh goal status:", err);
      }
    },
    []
  );

  const handleProjectUpdated = useCallback(
    (goalId: string, projectId: string, updates: Partial<Project>) => {
      setGoals((prev) =>
        prev.map((goal) => {
          if (goal.id !== goalId) return goal;
          const existingProject = goal.projects.find(
            (project) => project.id === projectId
          );
          return {
            ...goal,
            projects: existingProject
              ? goal.projects.map((project) =>
                  project.id === projectId
                    ? { ...project, ...updates }
                    : project
                )
              : [...goal.projects, buildProjectFromUpdates(projectId, updates)],
          };
        })
      );
      void refreshGoalStatus(goalId);
    },
    [refreshGoalStatus]
  );

  const handleProjectDeleted = useCallback(
    (goalId: string, projectId: string) => {
      setGoals((prev) =>
        prev.map((goal) => {
          if (goal.id !== goalId) return goal;
          return {
            ...goal,
            projects: goal.projects.filter(
              (project) => project.id !== projectId
            ),
          };
        })
      );
      void refreshGoalStatus(goalId);
    },
    [refreshGoalStatus]
  );

  const handleGoalOpenChange = useCallback(
    (goalId: string, isOpen: boolean) => {
      setOpenGoalId((current) => {
        if (isOpen) {
          return goalId;
        }
        if (current === goalId) {
          return null;
        }
        return current;
      });
    },
    []
  );

  const getGoalEditOriginRect = useCallback((goalId: string) => {
    if (typeof document === "undefined") return null;
    const element = document.querySelector<HTMLElement>(
      `[data-monument-goal-card-id="${goalId}"]`
    );
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    };
  }, []);

  const handleGoalEdit = useCallback(
    (goal: Goal) => {
      setFabEditTarget({
        entityType: "GOAL",
        entityId: goal.id,
        title: goal.title,
        originRect: getGoalEditOriginRect(goal.id),
      });
    },
    [getGoalEditOriginRect]
  );

  const handleRoadmapGoalEdit = useCallback(
    (goal: Goal) => {
      setFabEditTarget({
        entityType: "GOAL",
        entityId: goal.id,
        title: goal.title,
        originRect: getGoalEditOriginRect(goal.id),
      });
    },
    [getGoalEditOriginRect]
  );

  const handleRoadmapGoalOpen = useCallback(
    (goalId: string) => {
      const existingGoal = goals.find((goal) => goal.id === goalId);
      if (existingGoal) {
        if (existingGoal.projects.length > 0) {
          setRoadmapOpenGoal(existingGoal);
          setOpenGoalId(existingGoal.id);
          return;
        }

        void fetchGoalForDisplay(goalId, existingGoal).then((fullGoal) => {
          if (!fullGoal) {
            console.warn(
              "Falling back to existing roadmap goal because display hydration failed:",
              goalId
            );
            setRoadmapOpenGoal(existingGoal);
            setOpenGoalId(existingGoal.id);
            return;
          }
          setRoadmapOpenGoal(fullGoal);
          setOpenGoalId(fullGoal.id);
        });
        return;
      }

      for (const roadmap of monumentRoadmapsWithItems) {
        const standaloneRoadmapGoal = roadmap.items.find(
          (item) => item.item_type === "GOAL" && item.goal?.id === goalId
        )?.goal;

        if (standaloneRoadmapGoal) {
          const fallbackGoal = decorate({
            id: standaloneRoadmapGoal.id,
            title: standaloneRoadmapGoal.name,
            emoji: standaloneRoadmapGoal.emoji ?? undefined,
            priority: "Low",
            energy: "No",
            progress: 0,
            status: "ACTIVE",
            active: true,
            createdAt: "",
            updatedAt: "",
            projects: [],
            monumentId: roadmap.monument_id ?? monumentId,
            monumentEmoji:
              standaloneRoadmapGoal.monumentEmoji ?? monumentEmoji ?? null,
            roadmapId: standaloneRoadmapGoal.roadmap_id ?? roadmap.id,
            priorityCode: "NO",
            energyCode: "NO",
            weightBoost: 0,
            skills: [],
          });

          void fetchGoalForDisplay(goalId, fallbackGoal).then((fullGoal) => {
            if (!fullGoal) {
              console.warn(
                "Falling back to lightweight roadmap goal because display hydration failed:",
                goalId
              );
              setRoadmapOpenGoal(fallbackGoal);
              setOpenGoalId(fallbackGoal.id);
              return;
            }
            setRoadmapOpenGoal(fullGoal);
            setOpenGoalId(fullGoal.id);
          });
          return;
        }

        const campaignGoal = roadmap.items
          .flatMap((item) => item.campaign?.goals ?? [])
          .find((goal) => goal.id === goalId);

        if (campaignGoal) {
          const fallbackGoal = decorate({
            id: campaignGoal.id,
            title: campaignGoal.name,
            emoji: campaignGoal.emoji ?? undefined,
            priority: "Low",
            energy: "No",
            progress: 0,
            status: "ACTIVE",
            active: true,
            createdAt: "",
            updatedAt: "",
            projects: [],
            monumentId: roadmap.monument_id ?? monumentId,
            monumentEmoji: campaignGoal.monumentEmoji ?? monumentEmoji ?? null,
            roadmapId: roadmap.id,
            priorityCode: "NO",
            energyCode: "NO",
            weightBoost: 0,
            skills: [],
          });

          void fetchGoalForDisplay(goalId, fallbackGoal).then((fullGoal) => {
            if (!fullGoal) {
              console.warn(
                "Falling back to lightweight campaign goal because display hydration failed:",
                goalId
              );
              setRoadmapOpenGoal(fallbackGoal);
              setOpenGoalId(fallbackGoal.id);
              return;
            }
            setRoadmapOpenGoal(fullGoal);
            setOpenGoalId(fullGoal.id);
          });
          return;
        }
      }

      console.warn(
        "Unable to open roadmap goal drawer because the goal was not found in local roadmap data:",
        goalId
      );
    },
    [
      decorate,
      fetchGoalForDisplay,
      goals,
      monumentEmoji,
      monumentId,
      monumentRoadmapsWithItems,
    ]
  );

  const handleProjectEditOpen = useCallback(
    (
      target: FabEditTarget,
      _projectId: string,
      _goalId: string,
      origin: ProjectCardMorphOrigin | null
    ) => {
      setFabEditTarget({
        ...target,
        originRect:
          target.originRect ??
          (origin
            ? {
                top: origin.y,
                left: origin.x,
                width: origin.width,
                height: origin.height,
              }
            : null),
      });
    },
    []
  );

  useEffect(() => {
    if (!openGoalId) {
      setRoadmapOpenGoal(null);
      return;
    }
    if (
      !goals.some((goal) => goal.id === openGoalId) &&
      roadmapOpenGoal?.id !== openGoalId
    ) {
      setOpenGoalId(null);
      setRoadmapOpenGoal(null);
    }
  }, [goals, openGoalId, roadmapOpenGoal]);

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className={GOAL_GRID_CLASS}>
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-[100px] w-full rounded-2xl bg-white/10"
            />
          ))}
        </div>
      );
    }

    // Compute standalone goals by excluding any that belong to a roadmap
    const roadmapGoalIds = new Set<string>(
      roadmaps.flatMap((r) => (roadmapGoals.get(r.id) ?? []).map((g) => g.id))
    );
    const standaloneGoals = goals.filter((g) => !roadmapGoalIds.has(g.id));
    const isCompletedGoal = (goal: Goal) => goal.status === "COMPLETED";
    const filterGoalBySection = (goal: Goal) =>
      goalSection === "completed" ? isCompletedGoal(goal) : !isCompletedGoal(goal);
    const filteredStandaloneGoals = standaloneGoals.filter(filterGoalBySection);
    const filteredRoadmaps = roadmaps
      .map((roadmap) => {
        const allRoadmapGoals = roadmapGoals.get(roadmap.id) ?? [];
        const filteredGoals = allRoadmapGoals.filter(filterGoalBySection);
        return {
          roadmap,
          goals: filteredGoals,
          goalCount: allRoadmapGoals.length,
        };
      })
      .filter((entry) => entry.goalCount > 0);

    const hasTrueRoadmaps = monumentRoadmapsWithItems.length > 0;

    if (monumentView === "roadmap") {
      if (!hasTrueRoadmaps) {
        return (
          roadmapEmptyState ?? (
            <Card className="rounded-2xl border border-white/5 bg-[#111520] p-4 text-center text-sm text-[#A7B0BD] shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
              No true roadmap linked to this monument yet.
            </Card>
          )
        );
      }

      return (
        <div className="space-y-3.5 sm:space-y-4">
          {monumentRoadmapsWithItems.map((roadmap) => (
            <MixedRoadmapCard
              key={roadmap.id}
              roadmap={roadmap}
              variant="compact"
              defaultOpen
              onGoalOpen={handleRoadmapGoalOpen}
              onReorderSaved={refreshTrueRoadmaps}
            />
          ))}
          {roadmapOpenGoal && openGoalId === roadmapOpenGoal.id ? (
            <div
              className="goal-card-wrapper"
              data-monument-goal-card-id={roadmapOpenGoal.id}
            >
              <GoalCard
                goal={roadmapOpenGoal}
                showWeight={false}
                showCreatedAt={false}
                showEmojiPrefix={false}
                variant="compact"
                monumentContext
                onEdit={() => handleGoalEdit(roadmapOpenGoal)}
                onProjectUpdated={(projectId, updates) =>
                  handleProjectUpdated(roadmapOpenGoal.id, projectId, updates)
                }
                onProjectDeleted={(projectId) =>
                  handleProjectDeleted(roadmapOpenGoal.id, projectId)
                }
                onProjectEditOpen={(target, project, origin) =>
                  handleProjectEditOpen(
                    target,
                    project.id,
                    roadmapOpenGoal.id,
                    origin
                  )
                }
                open={openGoalId === roadmapOpenGoal.id}
                onOpenChange={(isOpen) => {
                  handleGoalOpenChange(roadmapOpenGoal.id, isOpen);
                  if (!isOpen) setRoadmapOpenGoal(null);
                }}
              />
            </div>
          ) : null}
        </div>
      );
    }

    if (filteredRoadmaps.length === 0 && filteredStandaloneGoals.length === 0) {
      return (
        <Card className="rounded-2xl border border-white/5 bg-[#111520] p-4 text-center text-sm text-[#A7B0BD] shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
          {goalSection === "completed"
            ? "No completed goals linked to this monument yet."
            : "No active goals linked to this monument yet."}
        </Card>
      );
    }

    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35">
              Goal Library
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.04] p-1">
            <button
              type="button"
              onClick={() => onGoalSectionChange?.("active")}
              className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${
                goalSection === "active"
                  ? "bg-[#3B3F49] text-white"
                  : "text-[#A7B0BD] hover:text-white"
              }`}
              aria-pressed={goalSection === "active"}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => onGoalSectionChange?.("completed")}
              className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${
                goalSection === "completed"
                  ? "bg-[#3B3F49] text-white"
                  : "text-[#A7B0BD] hover:text-white"
              }`}
              aria-pressed={goalSection === "completed"}
            >
              Completed
            </button>
          </div>
        </div>
        <div className={GOAL_GRID_CLASS}>
          {filteredRoadmaps.map(({ roadmap, goals: roadmapGoalsList, goalCount }) => {
            return (
              <div
                key={roadmap.id}
                className="goal-card-wrapper relative z-0 mb-0 min-w-0 w-full overflow-visible opacity-80"
              >
                <RoadmapCard
                  roadmap={roadmap}
                  goalCount={goalCount}
                  goals={roadmapGoalsList}
                  variant="compact"
                  onGoalEdit={handleRoadmapGoalEdit}
                  onProjectEditOpen={handleProjectEditOpen}
                  monumentContext
                />
              </div>
            );
          })}

          {filteredStandaloneGoals.map((goal) => (
            <div
              key={goal.id}
              data-monument-goal-card-id={goal.id}
              className="goal-card-wrapper relative z-0 mb-0 min-w-0 w-full overflow-visible opacity-80"
            >
              <GoalCard
                goal={goal}
                showWeight={false}
                showCreatedAt={false}
                showEmojiPrefix={false}
                variant="compact"
                monumentContext
                onEdit={() => handleGoalEdit(goal)}
                onProjectUpdated={(projectId, updates) =>
                  handleProjectUpdated(goal.id, projectId, updates)
                }
                onProjectDeleted={(projectId) =>
                  handleProjectDeleted(goal.id, projectId)
                }
                onProjectEditOpen={(target, project, origin) =>
                  handleProjectEditOpen(target, project.id, goal.id, origin)
                }
                open={openGoalId === goal.id}
                onOpenChange={(isOpen) => handleGoalOpenChange(goal.id, isOpen)}
              />
            </div>
          ))}
        </div>
      </section>
    );
  }, [
    loading,
    goals,
    monumentView,
    roadmapEmptyState,
    monumentRoadmapsWithItems,
    roadmaps,
    roadmapGoals,
    roadmapOpenGoal,
    goalSection,
    openGoalId,
    handleGoalEdit,
    handleGoalOpenChange,
    handleRoadmapGoalOpen,
    handleProjectEditOpen,
    handleProjectUpdated,
    handleProjectDeleted,
    handleRoadmapGoalEdit,
    refreshTrueRoadmaps,
    onGoalSectionChange,
  ]);

  return (
    <div className="monument-goals-list">
      {content}
      <Fab
        editTarget={fabEditTarget}
        onEditClose={() => setFabEditTarget(null)}
        onEditSaved={() => setRefreshVersion((current) => current + 1)}
        hideLauncher
        portalToBody
      />
      <style jsx global>{`
        /* Prevent lift/overlap across browsers */
        .monument-goals-list .group {
          transform: none !important;
          will-change: auto !important;
          z-index: 0 !important;
        }
        .monument-goals-list .group:hover {
          transform: none !important;
        }
        @media (max-width: 520px) {
          .monument-goals-list .goal-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 0.4rem;
            padding-left: 0;
            padding-right: 0;
          }
          .monument-goals-list [data-variant="compact"] {
            padding: 0.65rem 0.45rem;
            border-radius: 1rem;
            min-height: 108px;
            aspect-ratio: auto;
          }
          .monument-goals-list [data-variant="compact"] button {
            gap: 0.45rem;
          }
          .monument-goals-list
            [data-variant="compact"]
            button
            > div:first-of-type {
            height: 1.85rem;
            width: 1.85rem;
            border-radius: 0.85rem;
            font-size: 0.7rem;
          }
          .monument-goals-list [data-variant="compact"] h3 {
            font-size: 0.5rem;
            line-height: 1.15;
            min-height: 0;
            max-height: 3.45em;
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        }
        /* Avoid Safari/iOS clipping issues on small screens */
        @media (min-width: 640px) {
          .monument-goals-list .goal-card-wrapper {
            overflow: visible;
          }
        }
      `}</style>
    </div>
  );
}
export default MonumentGoalsList;
