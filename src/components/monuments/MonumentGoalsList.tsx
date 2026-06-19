"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type TouchEvent,
  type WheelEvent,
} from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { Grid2x2, Grid3x3 } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { getGoalStatusById } from "@/lib/queries/goals";
import type { Goal as GoalRow } from "@/lib/queries/goals";
import { GoalCard } from "@/app/(app)/goals/components/GoalCard";
import MixedRoadmapCard from "@/app/(app)/goals/components/MixedRoadmapCard";
import { RoadmapCard } from "@/app/(app)/goals/components/RoadmapCard";
import type { ProjectCardMorphOrigin } from "@/app/(app)/goals/components/ProjectRow";
import type { Goal, Project, Task } from "@/app/(app)/goals/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LazyFab } from "@/components/ui/LazyFab";
import { useFabCreation } from "@/components/ui/FabCreationContext";
import type { FabEditTarget } from "@/components/ui/Fab";
import { useToastHelpers } from "@/components/ui/toast";
import {
  projectWeight,
  taskWeight,
  type TaskLite,
  type ProjectLite,
} from "@/lib/scheduler/weight";
import { getSkillsForUser } from "@/lib/queries/skills";
import {
  ensureMonumentGoalsInTrueRoadmap,
  listGoalCampaignCards,
  listRoadmapsWithItems,
  type GoalCampaignCardData,
  type Roadmap,
  type RoadmapCampaign,
  type RoadmapCampaignGoal,
  type RoadmapGoal,
  type RoadmapMixedItem,
  type RoadmapWithItems,
} from "@/lib/queries/roadmaps";
import {
  findRoadmapCampaignGoalIds,
  findRedundantStandaloneRoadmapItemIds,
} from "@/lib/queries/roadmap-reconciliation";
import { computeGoalWeight } from "@/lib/goals/weight";
import { normalizeGoalStatus } from "@/lib/goals/status";
import {
  normalizeCampaignPriority,
  normalizePriority,
  parseGlobalRank,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  sortGlobalPriorityItems,
  type GlobalPriorityRoadmapItem,
  type PriorityBucketId,
  type RoadmapPriorityGoal,
} from "@/app/(app)/schedule/priorities/utils";
import {
  GlobalPriorityRoadmap,
  applyCampaignGoalOrder,
  buildCampaignGoalPriorityUpdates,
  buildGlobalPriorityOrderPayload,
  campaignGoalOrdersMatch,
  clearGlobalPriorityRanks,
  globalPriorityOrdersMatch,
  mergeVisibleCampaignGoalOrder,
  moveCampaignGoal,
  moveGlobalPriorityItem,
  parseCampaignGoalBucketId,
  parseGlobalPriorityBucketId,
  usePriorityRoadmapSensors,
  type CampaignGoalPriorityUpdate,
  type GlobalPriorityGoalLongPressEditHandler,
  type GlobalPriorityOrderPayloadItem,
} from "@/app/(app)/schedule/priorities/GlobalPriorityRoadmap";

type GoalRowWithRelations = GoalRow & {
  circle_id?: string | null;
  due_date?: string | null;
  priority_code?: string | null;
  priority_order?: number | string | null;
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
    global_rank?: number | null;
    due_date?: string | null;
    tasks?: {
      id: string;
      project_id: string | null;
      stage: string;
      completed_at: string | null;
      name: string | null;
      skill_id: string | null;
      priority: string | null;
      energy: string | null;
    }[];
    project_skills?: {
      skill_id: string | null;
    }[];
  }[];
  priority_rank?: number | null;
  global_rank?: number | string | null;
};

type GoalPanel = "active" | "completed";
type GoalPanelSwipeAxis = "horizontal" | "vertical" | null;
type GoalCardDensity = "large" | "small";

const GOAL_RELATIONS_BASE_SELECT =
  "id, name, priority, energy, priority_code, priority_order, energy_code, why, created_at, active, status, monument_id, circle_id, roadmap_id, weight, weight_boost, due_date, emoji, priority_rank, global_rank";
const GOAL_RELATIONS_SELECT = `
  ${GOAL_RELATIONS_BASE_SELECT},
  projects (
    id, name, goal_id, stage, completed_at, duration_min, created_at, due_date, global_rank,
    priority,
    energy,
    tasks (
      id, project_id, stage, completed_at, name, skill_id, priority, energy
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
      return "Ultra";
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

function updateGoalTaskCompletion(
  goal: Goal,
  goalId: string,
  projectId: string,
  taskId: string,
  nextCompletedAt: string | null
): Goal {
  if (goal.id !== goalId) return goal;
  let projectChanged = false;
  const updatedProjects = goal.projects.map((project) => {
    if (project.id !== projectId) return project;
    projectChanged = true;
    const updatedTasks = project.tasks.map((task) =>
      task.id === taskId ? { ...task, completedAt: nextCompletedAt } : task
    );
    const total = updatedTasks.length;
    const done = updatedTasks.filter((task) => Boolean(task.completedAt)).length;
    const progress = total ? Math.round((done / total) * 100) : 0;
    const schedulerTasks = updatedTasks.map(toSchedulerTask);
    const relatedTaskWeightSum = schedulerTasks.reduce(
      (sum, task) => sum + taskWeight(task),
      0
    );
    const projectWeightValue = projectWeight(
      toSchedulerProject({
        id: project.id,
        priorityCode: project.priorityCode ?? undefined,
        stage: project.stage ?? undefined,
        dueDate: project.dueDate ?? null,
      }),
      relatedTaskWeightSum
    );

    return {
      ...project,
      tasks: updatedTasks,
      progress,
      weight: projectWeightValue,
    };
  });

  if (!projectChanged) return goal;
  const goalProgress =
    updatedProjects.length > 0
      ? Math.round(
          updatedProjects.reduce(
            (sum, project) => sum + (project.progress ?? 0),
            0
          ) / updatedProjects.length
        )
      : 0;

  return {
    ...goal,
    projects: updatedProjects,
    progress: goalProgress,
  };
}

function markRoadmapGoalCompleted(
  roadmaps: RoadmapWithItems[],
  goalId: string
): RoadmapWithItems[] {
  return roadmaps.map((roadmap) => ({
    ...roadmap,
    goals: roadmap.goals.map((goal) =>
      goal.id === goalId ? { ...goal, status: "COMPLETED" } : goal
    ),
    items: roadmap.items.map((item) => ({
      ...item,
      goal:
        item.goal?.id === goalId
          ? { ...item.goal, status: "COMPLETED" }
          : item.goal,
      campaign: item.campaign
        ? {
            ...item.campaign,
            goals: item.campaign.goals.map((goal) =>
              goal.id === goalId ? { ...goal, status: "COMPLETED" } : goal
            ),
          }
        : item.campaign,
    })),
  }));
}

function removeGoalFromPriorityRoadmapItems(
  items: GlobalPriorityRoadmapItem[],
  goalId: string
): GlobalPriorityRoadmapItem[] {
  return items
    .map((item) => {
      if (item.type === "goal") {
        return item.id === goalId ? null : item;
      }

      return {
        ...item,
        goals: (item.goals ?? []).filter((goal) => goal.id !== goalId),
      };
    })
    .filter((item): item is GlobalPriorityRoadmapItem => Boolean(item));
}

const SCHEDULER_PRIORITY_MAP: Record<string, string> = {
  NO: "NO",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "Critical",
  "ULTRA-CRITICAL": "Ultra",
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
const GOAL_SMALL_GRID_CLASS =
  "goal-grid grid w-full max-w-full grid-cols-[repeat(auto-fit,_minmax(110px,_1fr))] gap-1 px-0.5 sm:grid-cols-3 sm:px-2 sm:gap-1 md:grid-cols-4 md:-mx-3 md:px-3 lg:grid-cols-5 xl:grid-cols-6";
const GOAL_GRID_CLASS =
  "-mx-3 grid grid-cols-3 gap-2.5 px-3 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
const GOAL_GRID_MIN_HEIGHT_CLASS = "min-h-[240px] sm:min-h-[260px]";
const GOAL_PANEL_CONTENT_CLASS = "px-1 py-1 sm:px-1.5 sm:py-1.5";
const GOAL_REVEAL_CLASS = "monument-goal-reveal";
const RECENTLY_COMPLETED_GOAL_HOLD_MS = 1100;

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

type GoalsSourceType = "monument" | "circle";

async function fetchGoalsWithRelationsForSource(
  sourceType: GoalsSourceType,
  sourceId: string,
  userId: string
) {
  const supabase = getSupabaseBrowser();
  if (!supabase) return [] as GoalRowWithRelations[];

  const ownerColumn = sourceType === "circle" ? "circle_id" : "monument_id";
  const { data, error } = await supabase
    .from("goals")
    .select(GOAL_RELATIONS_BASE_SELECT)
    .eq("user_id", userId)
    .eq(ownerColumn, sourceId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(`Error fetching ${sourceType} goals:`, error);
    return [];
  }
  return data ?? [];
}

async function fetchGoalsFullRelationsForSource(
  sourceType: GoalsSourceType,
  sourceId: string,
  userId: string
) {
  const supabase = getSupabaseBrowser();
  if (!supabase) return [] as GoalRowWithRelations[];

  const ownerColumn = sourceType === "circle" ? "circle_id" : "monument_id";
  const ownerLabel = sourceType === "circle" ? "Circle" : "Monument";
  const runQuery = (select: string) =>
    supabase
      .from("goals")
      .select(select)
      .eq("user_id", userId)
      .eq(ownerColumn, sourceId)
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
      `${ownerLabel} goal relation fetch variant failed (${variant.description}):`,
      error
    );
  }

  console.warn(`Falling back to basic ${sourceType} goal relation fetch`);

  const fallback = await runQuery(GOAL_RELATIONS_BASE_SELECT);
  if (fallback.error) {
    console.error(`Error fetching ${sourceType} goal relations:`, fallback.error);
    return [];
  }
  return fallback.data ?? [];
}

async function fetchGoalWithRelationsById(
  goalId: string,
  userId: string,
  sourceType: GoalsSourceType,
  sourceId: string
) {
  const supabase = getSupabaseBrowser();
  if (!supabase) return null;

  const ownerColumn = sourceType === "circle" ? "circle_id" : "monument_id";
  const runQuery = (select: string) =>
    supabase
      .from("goals")
      .select(select)
      .eq("id", goalId)
      .eq("user_id", userId)
      .eq(ownerColumn, sourceId)
      .single();

  const variants = [
    { description: "enum column goal display fetch", select: GOAL_RELATIONS_SELECT },
    {
      description: "lookup relation goal display fetch",
      select: GOAL_RELATIONS_SELECT,
    },
  ];

  for (const variant of variants) {
    const { data, error } = await runQuery(variant.select);

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

  const fallback = await runQuery(GOAL_RELATIONS_BASE_SELECT);

  if (fallback.error) {
    console.error("Error fetching goal for display:", fallback.error);
    return null;
  }

  return (fallback.data as GoalRowWithRelations | null) ?? null;
}

function sortGoalsForDisplay(goals: Goal[]): Goal[] {
  goals.sort((a, b) => {
    const w = (b.weight ?? 0) - (a.weight ?? 0);
    if (w !== 0) return w;
    const ad = Date.parse(a.updatedAt);
    const bd = Date.parse(b.updatedAt);
    if (Number.isFinite(ad) && Number.isFinite(bd) && ad !== bd) {
      return bd - ad;
    }
    return a.title.localeCompare(b.title);
  });
  return goals;
}

async function fetchTrueRoadmapsForMonument(
  userId: string,
  monumentId: string,
  options: { reconcile?: boolean } = {}
): Promise<RoadmapWithItems[]> {
  if (options.reconcile) {
    await ensureMonumentGoalsInTrueRoadmap(userId, monumentId).catch((err) => {
      console.error("Error reconciling true monument roadmap:", err);
    });
  }

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

type MonumentPriorityGoalRow = {
  id: string;
  name?: string | null;
  emoji?: string | null;
  monument_id?: string | null;
  circle_id?: string | null;
  roadmap_id?: string | null;
  status?: string | null;
  priority?: string | null;
  priority_code?: string | null;
  priority_order?: number | string | null;
  global_rank?: number | string | null;
  priority_rank?: number | string | null;
  created_at?: string | null;
  monument?: {
    emoji?: string | null;
  } | null;
};

type MonumentPriorityCampaignRow = {
  id: string;
  name?: string | null;
  description?: string | null;
  emoji?: string | null;
  priority_code?: string | null;
  priority_order?: number | string | null;
  scheduling_state?: string | null;
  position?: number | string | null;
  roadmap_id?: string | null;
  primary_monument_id?: string | null;
  primary_circle_id?: string | null;
  created_at?: string | null;
};

type MonumentPriorityCampaignGoalRow = {
  campaign_id: string;
  goal_id: string;
  position?: number | string | null;
  created_at?: string | null;
};

type MonumentPrioritySupabaseClient = NonNullable<
  ReturnType<typeof getSupabaseBrowser>
> & {
  rpc(
    fn: "save_global_priority_order",
    args: { p_items: GlobalPriorityOrderPayloadItem[] }
  ): Promise<{ error: { message?: string } | null }>;
  rpc(
    fn: "recalculate_goal_global_rank"
  ): Promise<{ error: { message?: string } | null }>;
};

function comparePriorityRoadmapText(a?: string | null, b?: string | null) {
  return (a ?? "").localeCompare(b ?? "");
}

function normalizeMonumentPriorityGoal(
  goal: MonumentPriorityGoalRow,
  campaignGoal?: MonumentPriorityCampaignGoalRow
): RoadmapPriorityGoal {
  return {
    id: goal.id,
    name: (goal.name ?? "").trim() || "Untitled Goal",
    emoji: goal.emoji ?? null,
    monumentId: goal.monument_id ?? null,
    monumentEmoji: goal.monument?.emoji ?? null,
    priority: normalizePriority(goal.priority_code ?? goal.priority),
    status: goal.status ?? null,
    globalRank: parseGlobalRank(goal.global_rank),
    priorityOrder: parseGlobalRank(goal.priority_order),
    priorityRank: parseGlobalRank(goal.priority_rank),
    campaignPosition: parseGlobalRank(campaignGoal?.position),
    campaignGoalCreatedAt: campaignGoal?.created_at ?? null,
    createdAt: goal.created_at ?? null,
  };
}

function compareMonumentPriorityCampaignGoals(
  a: RoadmapPriorityGoal,
  b: RoadmapPriorityGoal
) {
  const priorityDelta =
    PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
  if (priorityDelta !== 0) return priorityDelta;

  const orderDelta = compareNullableRank(
    a.priorityOrder ?? a.priorityRank,
    b.priorityOrder ?? b.priorityRank
  );
  if (orderDelta !== 0) return orderDelta;

  const campaignPositionDelta = compareNullableRank(
    a.campaignPosition,
    b.campaignPosition
  );
  if (campaignPositionDelta !== 0) return campaignPositionDelta;

  const campaignCreatedDelta = comparePriorityRoadmapText(
    a.campaignGoalCreatedAt,
    b.campaignGoalCreatedAt
  );
  if (campaignCreatedDelta !== 0) return campaignCreatedDelta;

  const createdDelta = comparePriorityRoadmapText(a.createdAt, b.createdAt);
  if (createdDelta !== 0) return createdDelta;

  return comparePriorityRoadmapText(a.id, b.id);
}

function compareNullableRank(a?: number, b?: number) {
  const aValue =
    typeof a === "number" && Number.isFinite(a) && a > 0
      ? a
      : Number.POSITIVE_INFINITY;
  const bValue =
    typeof b === "number" && Number.isFinite(b) && b > 0
      ? b
      : Number.POSITIVE_INFINITY;

  if (aValue === bValue) return 0;
  return aValue < bValue ? -1 : 1;
}

function dedupeMonumentPriorityGoals(goals: RoadmapPriorityGoal[]) {
  const goalsById = new Map<string, RoadmapPriorityGoal>();

  for (const goal of goals) {
    const existingGoal = goalsById.get(goal.id);
    goalsById.set(
      goal.id,
      existingGoal
        ? {
            ...goal,
            ...existingGoal,
            emoji: existingGoal.emoji ?? goal.emoji,
            monumentId: existingGoal.monumentId ?? goal.monumentId,
            monumentName: existingGoal.monumentName ?? goal.monumentName,
            monumentIcon: existingGoal.monumentIcon ?? goal.monumentIcon,
            monumentEmoji: existingGoal.monumentEmoji ?? goal.monumentEmoji,
            skills: existingGoal.skills ?? goal.skills,
            globalRank: existingGoal.globalRank ?? goal.globalRank,
            priorityOrder: existingGoal.priorityOrder ?? goal.priorityOrder,
            priorityRank: existingGoal.priorityRank ?? goal.priorityRank,
            campaignPosition:
              existingGoal.campaignPosition ?? goal.campaignPosition,
            campaignGoalCreatedAt:
              existingGoal.campaignGoalCreatedAt ?? goal.campaignGoalCreatedAt,
            createdAt: existingGoal.createdAt ?? goal.createdAt,
          }
        : goal
    );
  }

  return Array.from(goalsById.values()).sort(compareMonumentPriorityCampaignGoals);
}

function dedupeMonumentPriorityStandaloneGoals(
  items: GlobalPriorityRoadmapItem[],
  monumentId?: string | null
) {
  const goalsById = new Map<string, GlobalPriorityRoadmapItem>();

  for (const item of items) {
    if (item.type !== "goal") continue;
    if (monumentId && item.monumentId !== monumentId) continue;

    const existing = goalsById.get(item.id);
    goalsById.set(
      item.id,
      existing
        ? {
            ...item,
            ...existing,
            emoji: existing.emoji ?? item.emoji,
            monumentId: existing.monumentId ?? item.monumentId,
            monumentName: existing.monumentName ?? item.monumentName,
            monumentIcon: existing.monumentIcon ?? item.monumentIcon,
            monumentEmoji: existing.monumentEmoji ?? item.monumentEmoji,
            skills: existing.skills ?? item.skills,
            priorityOrder: existing.priorityOrder ?? item.priorityOrder,
            globalRank: existing.globalRank ?? item.globalRank,
            priorityRank: existing.priorityRank ?? item.priorityRank,
            position: existing.position ?? item.position,
            createdAt: existing.createdAt ?? item.createdAt,
          }
        : item
    );
  }

  return Array.from(goalsById.values());
}

function getMonumentPriorityCampaignId(item: GlobalPriorityRoadmapItem) {
  return item.sourceIds?.[0] ?? item.id;
}

function getMonumentPriorityCampaignNameKey(item: GlobalPriorityRoadmapItem) {
  return item.name.trim().toLowerCase().replace(/\s+/g, " ");
}

function getVisibleMonumentPriorityCampaignGoals(
  goals: RoadmapPriorityGoal[],
  monumentId?: string | null
) {
  return goals.filter(
    (goal) =>
      (!monumentId || goal.monumentId === monumentId) &&
      normalizeGoalStatus(goal.status) !== "COMPLETED"
  );
}

function hasOverlappingMonumentPriorityCampaignGoals(
  a: GlobalPriorityRoadmapItem,
  b: GlobalPriorityRoadmapItem
) {
  const aGoalIds = new Set((a.goals ?? []).map((goal) => goal.id));
  if (aGoalIds.size === 0) return false;

  return (b.goals ?? []).some((goal) => aGoalIds.has(goal.id));
}

function compareMonumentPriorityCampaignPreference(
  a: GlobalPriorityRoadmapItem,
  b: GlobalPriorityRoadmapItem,
  monumentId?: string | null
) {
  const aPrimary = monumentId && a.monumentId === monumentId ? 1 : 0;
  const bPrimary = monumentId && b.monumentId === monumentId ? 1 : 0;
  if (aPrimary !== bPrimary) return bPrimary - aPrimary;

  const goalCountDelta = (b.goals?.length ?? 0) - (a.goals?.length ?? 0);
  if (goalCountDelta !== 0) return goalCountDelta;

  const aHasEmoji = a.emoji?.trim() ? 1 : 0;
  const bHasEmoji = b.emoji?.trim() ? 1 : 0;
  if (aHasEmoji !== bHasEmoji) return bHasEmoji - aHasEmoji;

  const orderDelta = compareNullableRank(
    a.priorityOrder ?? a.position,
    b.priorityOrder ?? b.position
  );
  if (orderDelta !== 0) return orderDelta;

  const createdDelta = comparePriorityRoadmapText(a.createdAt, b.createdAt);
  if (createdDelta !== 0) return createdDelta;

  return comparePriorityRoadmapText(
    getMonumentPriorityCampaignId(a),
    getMonumentPriorityCampaignId(b)
  );
}

function mergeMonumentPriorityCampaignGroup(
  items: GlobalPriorityRoadmapItem[],
  monumentId?: string | null
) {
  const preferred = [...items].sort((a, b) =>
    compareMonumentPriorityCampaignPreference(a, b, monumentId)
  )[0];
  const preferredId = getMonumentPriorityCampaignId(preferred);
  const sourceIds = new Set<string>([preferredId]);

  for (const item of items) {
    sourceIds.add(getMonumentPriorityCampaignId(item));
    for (const sourceId of item.sourceIds ?? []) {
      sourceIds.add(sourceId);
    }
  }

  return {
    ...preferred,
    id: preferredId,
    sourceIds: Array.from(sourceIds),
    goals: dedupeMonumentPriorityGoals(
      items.flatMap((item) => item.goals ?? [])
    ),
  };
}

function mergeOverlappingMonumentPriorityCampaignNames(
  items: GlobalPriorityRoadmapItem[],
  monumentId?: string | null
) {
  const campaignsByName = new Map<string, GlobalPriorityRoadmapItem[]>();

  for (const item of items) {
    const nameKey = getMonumentPriorityCampaignNameKey(item);
    const campaigns = campaignsByName.get(nameKey) ?? [];
    campaigns.push(item);
    campaignsByName.set(nameKey, campaigns);
  }

  const mergedCampaigns: GlobalPriorityRoadmapItem[] = [];

  for (const campaigns of campaignsByName.values()) {
    const visitedIndexes = new Set<number>();

    for (let index = 0; index < campaigns.length; index += 1) {
      if (visitedIndexes.has(index)) continue;

      const componentIndexes = [index];
      const queue = [index];
      visitedIndexes.add(index);

      while (queue.length > 0) {
        const currentIndex = queue.shift();
        if (currentIndex === undefined) continue;

        for (let nextIndex = 0; nextIndex < campaigns.length; nextIndex += 1) {
          if (visitedIndexes.has(nextIndex)) continue;
          if (
            !hasOverlappingMonumentPriorityCampaignGoals(
              campaigns[currentIndex],
              campaigns[nextIndex]
            )
          ) {
            continue;
          }

          visitedIndexes.add(nextIndex);
          componentIndexes.push(nextIndex);
          queue.push(nextIndex);
        }
      }

      mergedCampaigns.push(
        mergeMonumentPriorityCampaignGroup(
          componentIndexes.map((componentIndex) => campaigns[componentIndex]),
          monumentId
        )
      );
    }
  }

  return mergedCampaigns;
}

function mergeMonumentPriorityCampaignItems(
  items: GlobalPriorityRoadmapItem[],
  monumentId?: string | null
): GlobalPriorityRoadmapItem[] {
  const campaignsById = new Map<string, GlobalPriorityRoadmapItem>();

  for (const item of items) {
    if (item.type !== "campaign") continue;

    const campaignId = getMonumentPriorityCampaignId(item);
    const itemGoals = dedupeMonumentPriorityGoals(
      getVisibleMonumentPriorityCampaignGoals(item.goals ?? [], monumentId)
    );
    const campaignItem: GlobalPriorityRoadmapItem = {
      ...item,
      id: campaignId,
      sourceIds: Array.from(new Set([campaignId, ...(item.sourceIds ?? [])])),
      goals: itemGoals,
    };
    const existing = campaignsById.get(campaignId);
    if (!existing) {
      campaignsById.set(campaignId, campaignItem);
      continue;
    }

    campaignsById.set(
      campaignId,
      mergeMonumentPriorityCampaignGroup([existing, campaignItem], monumentId)
    );
  }

  const campaignItems = Array.from(campaignsById.values()).filter(
    (campaign) => (campaign.goals ?? []).length > 0
  );

  return mergeOverlappingMonumentPriorityCampaignNames(campaignItems, monumentId);
}

function finalizeMonumentPriorityRoadmapItems(
  items: GlobalPriorityRoadmapItem[],
  monumentId?: string | null
) {
  const visibleCampaignItems = mergeMonumentPriorityCampaignItems(
    items,
    monumentId
  );
  const visibleCampaignGoalIds = new Set<string>(
    visibleCampaignItems.flatMap((campaign) =>
      (campaign.goals ?? []).map((goal) => goal.id)
    )
  );
  const standaloneGoalItems = dedupeMonumentPriorityStandaloneGoals(
    items,
    monumentId
  ).filter((goal) => !visibleCampaignGoalIds.has(goal.id));

  return sortGlobalPriorityItems([...visibleCampaignItems, ...standaloneGoalItems]);
}

async function fetchMonumentPriorityRoadmapItems(
  userId: string
): Promise<GlobalPriorityRoadmapItem[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return [];

  const [goalsResult, campaignsResult] = await Promise.all([
    supabase
      .from("goals")
      .select(
        "id,name,emoji,monument_id,circle_id,roadmap_id,status,priority,priority_code,priority_order,global_rank,priority_rank,created_at,monument:monuments(emoji)"
      )
      .eq("user_id", userId)
      .is("circle_id", null),
    supabase
      .from("campaigns")
      .select(
        "id,name,description,emoji,priority_code,priority_order,scheduling_state,position,roadmap_id,primary_monument_id,primary_circle_id,created_at"
      )
      .eq("user_id", userId)
      .order("position", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
  ]);

  if (goalsResult.error) {
    console.error("Error fetching Monument priority goals:", goalsResult.error);
    return [];
  }
  if (campaignsResult.error) {
    console.error(
      "Error fetching Monument priority campaigns:",
      campaignsResult.error
    );
    return [];
  }

  const goalRows = ((goalsResult.data ?? []) as MonumentPriorityGoalRow[]).filter(
    (goal) => normalizeGoalStatus(goal.status) !== "COMPLETED"
  );
  const campaignRows = (campaignsResult.data ?? []) as MonumentPriorityCampaignRow[];
  const campaignIds = campaignRows.map((campaign) => campaign.id);
  const campaignGoalRows =
    campaignIds.length > 0
      ? await supabase
          .from("campaign_goals")
          .select("campaign_id,goal_id,position,created_at")
          .eq("user_id", userId)
          .in("campaign_id", campaignIds)
          .order("position", { ascending: true, nullsFirst: false })
      : { data: [], error: null };

  if (campaignGoalRows.error) {
    console.error(
      "Error fetching Monument priority campaign goals:",
      campaignGoalRows.error
    );
    return [];
  }

  const goalsById = new Map(goalRows.map((goal) => [goal.id, goal]));
  const campaignGoalIds = new Set(
    ((campaignGoalRows.data ?? []) as MonumentPriorityCampaignGoalRow[]).map(
      (campaignGoal) => campaignGoal.goal_id
    )
  );
  const campaignGoalsByCampaignId = new Map<
    string,
    MonumentPriorityCampaignGoalRow[]
  >();
  for (const campaignGoal of
    (campaignGoalRows.data ?? []) as MonumentPriorityCampaignGoalRow[]) {
    const goals = campaignGoalsByCampaignId.get(campaignGoal.campaign_id) ?? [];
    goals.push(campaignGoal);
    campaignGoalsByCampaignId.set(campaignGoal.campaign_id, goals);
  }

  const campaignItems: GlobalPriorityRoadmapItem[] = [];
  for (const campaign of campaignRows) {
    const nestedGoals = (campaignGoalsByCampaignId.get(campaign.id) ?? [])
      .map((campaignGoal) => {
        const goal = goalsById.get(campaignGoal.goal_id);
        if (!goal) return null;
        return normalizeMonumentPriorityGoal(goal, campaignGoal);
      })
      .filter(
        (goal): goal is RoadmapPriorityGoal =>
          Boolean(goal) && normalizeGoalStatus(goal.status) !== "COMPLETED"
      )
      .sort(compareMonumentPriorityCampaignGoals);

    if (nestedGoals.length === 0) continue;

    campaignItems.push({
      id: campaign.id,
      type: "campaign",
      sourceIds: [campaign.id],
      name: (campaign.name ?? "").trim() || "Untitled Campaign",
      emoji: campaign.emoji ?? null,
      monumentId: campaign.primary_monument_id ?? null,
      priority: normalizeCampaignPriority(campaign.priority_code),
      priorityOrder: parseGlobalRank(campaign.priority_order),
      position: parseGlobalRank(campaign.position),
      createdAt: campaign.created_at ?? null,
      goals: nestedGoals,
    });
  }

  const standaloneGoalItems: GlobalPriorityRoadmapItem[] = goalRows
    .filter((goal) => !campaignGoalIds.has(goal.id))
    .map((goal) => {
      const normalizedGoal = normalizeMonumentPriorityGoal(goal);

      return {
        id: goal.id,
        type: "goal",
        name: normalizedGoal.name,
        emoji: normalizedGoal.emoji,
        monumentId: normalizedGoal.monumentId,
        monumentEmoji: normalizedGoal.monumentEmoji,
        priority: normalizedGoal.priority,
        priorityOrder: normalizedGoal.priorityOrder,
        globalRank: normalizedGoal.globalRank,
        priorityRank: normalizedGoal.priorityRank,
        createdAt: normalizedGoal.createdAt,
      };
    });

  return sortGlobalPriorityItems([
    ...mergeMonumentPriorityCampaignItems(campaignItems),
    ...standaloneGoalItems,
  ]);
}

async function saveMonumentCampaignGoalPriorityOrder(
  supabase: MonumentPrioritySupabaseClient,
  updates: CampaignGoalPriorityUpdate[]
) {
  await Promise.all(
    updates.map(async (update) => {
      const { error } = await supabase
        .from("goals")
        .update({
          priority_code: update.priority,
          priority_order: update.priorityOrder,
        })
        .eq("id", update.id);

      if (error) {
        throw error;
      }
    })
  );

  const { error: rankError } = await supabase.rpc(
    "recalculate_goal_global_rank"
  );
  if (rankError) {
    throw rankError;
  }
}

type CircleRoadmapRow = {
  id: string;
  title: string;
  emoji?: string | null;
  monument_id?: string | null;
  circle_id?: string | null;
};

type CircleCampaignRow = {
  id: string;
  name: string;
  description?: string | null;
  emoji?: string | null;
  scheduling_state?: string | null;
  position?: number | null;
  roadmap_id?: string | null;
  primary_monument_id?: string | null;
  primary_circle_id?: string | null;
};

type CircleRoadmapGoalRow = {
  id: string;
  name: string;
  emoji?: string | null;
  monument_id?: string | null;
  circle_id?: string | null;
  roadmap_id?: string | null;
  status?: string | null;
  global_rank?: number | null;
  priority_rank?: number | null;
  monument?: {
    emoji?: string | null;
  } | null;
};

type CircleRoadmapItemRow = {
  id: string;
  roadmap_id: string;
  item_type: "CAMPAIGN" | "GOAL";
  position: number;
  campaign_id: string | null;
  goal_id: string | null;
};

type CircleCampaignGoalRow = {
  campaign_id: string;
  goal_id: string;
  position: number;
};

type CircleProjectRow = {
  id: string;
  goal_id: string | null;
  completed_at: string | null;
};

function buildAllProjectsCompletedMap(
  projects: CircleProjectRow[]
): Map<string, boolean> {
  const projectCountsByGoalId = new Map<string, number>();
  const completedCountsByGoalId = new Map<string, number>();

  for (const project of projects) {
    if (!project.goal_id) continue;
    projectCountsByGoalId.set(
      project.goal_id,
      (projectCountsByGoalId.get(project.goal_id) ?? 0) + 1
    );
    if (project.completed_at) {
      completedCountsByGoalId.set(
        project.goal_id,
        (completedCountsByGoalId.get(project.goal_id) ?? 0) + 1
      );
    }
  }

  const completedMap = new Map<string, boolean>();
  for (const [goalId, projectCount] of projectCountsByGoalId) {
    completedMap.set(
      goalId,
      projectCount > 0 &&
        (completedCountsByGoalId.get(goalId) ?? 0) === projectCount
    );
  }
  return completedMap;
}

function normalizeRoadmapGoalForCircle(
  goal: CircleRoadmapGoalRow,
  allProjectsCompleted = false
): RoadmapGoal {
  return {
    id: goal.id,
    name: goal.name,
    emoji: goal.emoji ?? null,
    monument_id: goal.monument_id ?? null,
    circle_id: goal.circle_id ?? null,
    monumentEmoji: goal.monument?.emoji ?? null,
    roadmap_id: goal.roadmap_id ?? null,
    status: goal.status ?? null,
    allProjectsCompleted,
    global_rank: goal.global_rank ?? null,
    priority_rank: goal.priority_rank ?? null,
  };
}

function isRoadmapDisplayGoalCompleted(goal: {
  status?: string | null;
  allProjectsCompleted?: boolean;
}): boolean {
  return normalizeGoalStatus(goal.status) === "COMPLETED";
}

function isRoadmapGoalLinkedToContext(
  goal: { monument_id?: string | null; circle_id?: string | null },
  context: { monument_id?: string | null; circle_id?: string | null }
): boolean {
  if (context.circle_id) {
    return goal.circle_id === context.circle_id;
  }
  if (context.monument_id) {
    return goal.monument_id === context.monument_id;
  }
  return true;
}

function isGoalCompletedForSection(goal: Goal): boolean {
  return normalizeGoalStatus(goal.status, goal.active) === "COMPLETED";
}

function isMonumentGoalReadyToComplete(goal: Goal): boolean {
  const hasCompletedProjects =
    goal.projects.length > 0 &&
    goal.projects.every(
      (project) =>
        project.status === "Done" ||
        project.stage === "RELEASE" ||
        Number(project.progress ?? 0) >= 100
    );
  return (
    hasCompletedProjects &&
    normalizeGoalStatus(goal.status, goal.active) !== "COMPLETED"
  );
}

async function fetchTrueRoadmapsForCircle(
  userId: string,
  circleId: string
): Promise<RoadmapWithItems[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return [];

  const { data: roadmapRows, error: roadmapsError } = await supabase
    .from("roadmaps")
    .select("id, title, emoji, created_at, monument_id, circle_id")
    .eq("user_id", userId)
    .eq("circle_id", circleId)
    .order("created_at", { ascending: false });

  if (roadmapsError) {
    console.error("Error fetching true Circle roadmaps:", roadmapsError);
    return [];
  }

  const roadmaps = ((roadmapRows ?? []) as CircleRoadmapRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    emoji: row.emoji ?? null,
    monument_id: row.monument_id ?? null,
    circle_id: row.circle_id ?? null,
  }));

  if (roadmaps.length === 0) {
    return [];
  }

  const roadmapIds = roadmaps.map((roadmap) => roadmap.id);

  const [
    legacyGoalsResult,
    roadmapItemsResult,
    campaignsResult,
  ] = await Promise.all([
    supabase
      .from("goals")
      .select(
        "id, name, emoji, monument_id, circle_id, roadmap_id, status, global_rank, priority_rank, monument:monuments(emoji)"
      )
      .in("roadmap_id", roadmapIds)
      .order("priority_rank", { ascending: true, nullsFirst: false }),
    supabase
      .from("roadmap_items")
      .select("id, user_id, roadmap_id, item_type, position, campaign_id, goal_id")
      .in("roadmap_id", roadmapIds)
      .order("position", { ascending: true }),
    supabase
      .from("campaigns")
      .select(
        "id, name, description, emoji, scheduling_state, position, roadmap_id, primary_monument_id, primary_circle_id"
      )
      .eq("user_id", userId)
      .or(`primary_circle_id.eq.${circleId},roadmap_id.in.(${roadmapIds.join(",")})`)
      .order("position", { ascending: true, nullsFirst: false }),
  ]);

  if (legacyGoalsResult.error) {
    console.error("Error fetching Circle roadmap goals:", legacyGoalsResult.error);
    return [];
  }
  if (roadmapItemsResult.error) {
    console.error("Error fetching Circle roadmap items:", roadmapItemsResult.error);
    return [];
  }
  if (campaignsResult.error) {
    console.error("Error fetching Circle roadmap campaigns:", campaignsResult.error);
    return [];
  }

  const roadmapItems = (roadmapItemsResult.data ?? []) as CircleRoadmapItemRow[];
  const campaignRows = (campaignsResult.data ?? []) as CircleCampaignRow[];
  const campaignIds = Array.from(
    new Set([
      ...roadmapItems
        .map((item) => item.campaign_id)
        .filter((id): id is string => Boolean(id)),
      ...campaignRows.map((campaign) => campaign.id),
    ])
  );
  const roadmapGoalIds = Array.from(
    new Set(
      roadmapItems
        .map((item) => item.goal_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const [roadmapGoalsResult, campaignGoalsResult] = await Promise.all([
    roadmapGoalIds.length > 0
      ? supabase
          .from("goals")
          .select(
            "id, name, emoji, monument_id, circle_id, roadmap_id, status, global_rank, priority_rank, monument:monuments(emoji)"
          )
          .in("id", roadmapGoalIds)
      : Promise.resolve({ data: [], error: null }),
    campaignIds.length > 0
      ? supabase
          .from("campaign_goals")
          .select("campaign_id, goal_id, position")
          .in("campaign_id", campaignIds)
          .order("position", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (roadmapGoalsResult.error) {
    console.error("Error fetching Circle roadmap item goals:", roadmapGoalsResult.error);
    return [];
  }
  if (campaignGoalsResult.error) {
    console.error("Error fetching Circle campaign goals:", campaignGoalsResult.error);
    return [];
  }

  const campaignGoalRows =
    (campaignGoalsResult.data ?? []) as CircleCampaignGoalRow[];
  const campaignGoalIdsByRoadmapId = findRoadmapCampaignGoalIds({
    roadmapItems,
    campaignGoals: campaignGoalRows,
  });
  const redundantStandaloneItemIds = findRedundantStandaloneRoadmapItemIds({
    roadmapItems,
    campaignGoals: campaignGoalRows,
  });
  const visibleRoadmapItems = roadmapItems.filter(
    (item) => !redundantStandaloneItemIds.has(item.id)
  );
  const campaignGoalIds = Array.from(
    new Set(campaignGoalRows.map((row) => row.goal_id).filter(Boolean))
  );

  const campaignGoalGoalsResult =
    campaignGoalIds.length > 0
      ? await supabase
          .from("goals")
          .select(
            "id, name, emoji, monument_id, circle_id, roadmap_id, status, global_rank, priority_rank, monument:monuments(emoji)"
          )
          .in("id", campaignGoalIds)
      : { data: [], error: null };

  if (campaignGoalGoalsResult.error) {
    console.error(
      "Error fetching Circle campaign goal records:",
      campaignGoalGoalsResult.error
    );
    return [];
  }

  const projectGoalIds = Array.from(
    new Set([
      ...roadmapGoalIds,
      ...campaignGoalIds,
      ...((legacyGoalsResult.data ?? []) as CircleRoadmapGoalRow[]).map(
        (goal) => goal.id
      ),
    ])
  );
  const projectRowsResult =
    projectGoalIds.length > 0
      ? await supabase
          .from("projects")
          .select("id, goal_id, completed_at")
          .in("goal_id", projectGoalIds)
      : { data: [], error: null };

  if (projectRowsResult.error) {
    console.error("Error fetching Circle roadmap goal projects:", projectRowsResult.error);
    return [];
  }

  const completedMap = buildAllProjectsCompletedMap(
    (projectRowsResult.data ?? []) as CircleProjectRow[]
  );
  const roadmapGoalsById = new Map<string, RoadmapGoal>(
    ((roadmapGoalsResult.data ?? []) as CircleRoadmapGoalRow[]).map((goal) => [
      goal.id,
      normalizeRoadmapGoalForCircle(goal, completedMap.get(goal.id) ?? false),
    ])
  );
  const campaignGoalsByGoalId = new Map<string, RoadmapGoal>(
    ((campaignGoalGoalsResult.data ?? []) as CircleRoadmapGoalRow[]).map(
      (goal) => [
        goal.id,
        normalizeRoadmapGoalForCircle(goal, completedMap.get(goal.id) ?? false),
      ]
    )
  );

  const campaignContextById = new Map(
    campaignRows.map((campaign) => [
      campaign.id,
      {
        monument_id: campaign.primary_monument_id ?? null,
        circle_id: campaign.primary_circle_id ?? null,
      },
    ])
  );

  const campaignGoalsByCampaignId = new Map<string, RoadmapCampaignGoal[]>();
  for (const campaignGoal of campaignGoalRows) {
    const goal = campaignGoalsByGoalId.get(campaignGoal.goal_id);
    if (!goal) continue;
    const campaignContext = campaignContextById.get(campaignGoal.campaign_id);
    if (
      campaignContext &&
      !isRoadmapGoalLinkedToContext(goal, campaignContext)
    ) {
      continue;
    }
    const goals = campaignGoalsByCampaignId.get(campaignGoal.campaign_id) ?? [];
    goals.push({
      id: goal.id,
      name: goal.name,
      emoji: goal.emoji ?? null,
      monument_id: goal.monument_id ?? null,
      circle_id: goal.circle_id ?? null,
      monumentEmoji: goal.monumentEmoji ?? null,
      position: campaignGoal.position,
      status: goal.status ?? null,
      allProjectsCompleted: goal.allProjectsCompleted,
      global_rank: goal.global_rank ?? null,
      priority_rank: goal.priority_rank ?? null,
    });
    campaignGoalsByCampaignId.set(campaignGoal.campaign_id, goals);
  }

  const campaignsById = new Map<string, RoadmapCampaign>(
    campaignRows
      .map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        description: campaign.description ?? null,
        emoji: campaign.emoji ?? null,
        scheduling_state:
          (campaign.scheduling_state ?? "ACTIVE") as RoadmapCampaign["scheduling_state"],
        position: campaign.position ?? null,
        roadmap_id: campaign.roadmap_id ?? null,
        primary_monument_id: campaign.primary_monument_id ?? null,
        primary_circle_id: campaign.primary_circle_id ?? null,
        goals: campaignGoalsByCampaignId.get(campaign.id) ?? [],
      }))
      .filter((campaign) => campaign.goals.length > 0)
      .map((campaign) => [campaign.id, campaign])
  );

  const itemsByRoadmapId = new Map<string, RoadmapMixedItem[]>();
  const itemGoalIds = new Set<string>();

  for (const item of visibleRoadmapItems) {
    if (item.goal_id) itemGoalIds.add(item.goal_id);
    const items = itemsByRoadmapId.get(item.roadmap_id) ?? [];
    items.push({
      id: item.id,
      roadmap_id: item.roadmap_id,
      item_type: item.item_type,
      position: item.position,
      campaign: item.campaign_id
        ? campaignsById.get(item.campaign_id) ?? null
        : null,
        goal: item.goal_id ? roadmapGoalsById.get(item.goal_id) ?? null : null,
    });
    itemsByRoadmapId.set(item.roadmap_id, items);
  }

  const legacyGoalsByRoadmapId = new Map<string, RoadmapGoal[]>();
  for (const goalRow of (legacyGoalsResult.data ?? []) as CircleRoadmapGoalRow[]) {
    const goal = normalizeRoadmapGoalForCircle(
      goalRow,
      completedMap.get(goalRow.id) ?? false
    );
    if (isRoadmapDisplayGoalCompleted(goal)) continue;
    const roadmapId = goal.roadmap_id;
    if (!roadmapId || itemGoalIds.has(goal.id)) continue;
    const goals = legacyGoalsByRoadmapId.get(roadmapId) ?? [];
    goals.push(goal);
    legacyGoalsByRoadmapId.set(roadmapId, goals);
  }

  return roadmaps.map((roadmap) => {
    const items = [...(itemsByRoadmapId.get(roadmap.id) ?? [])];
    const legacyGoals = legacyGoalsByRoadmapId.get(roadmap.id) ?? [];
    const nestedCampaignGoalIds =
      campaignGoalIdsByRoadmapId.get(roadmap.id) ?? new Set<string>();
    legacyGoals
      .filter((goal) => !nestedCampaignGoalIds.has(goal.id))
      .forEach((goal, index) => {
        items.push({
          id: `legacy-goal-${goal.id}`,
          roadmap_id: roadmap.id,
          item_type: "GOAL",
          position: goal.priority_rank ?? items.length + index + 1,
          campaign: null,
          goal,
        });
      });

    const filteredItems = items
      .filter((item) => {
        if (item.item_type === "CAMPAIGN") return Boolean(item.campaign);
        if (item.item_type !== "GOAL" || !item.goal) return true;
        return (
          isRoadmapGoalLinkedToContext(item.goal, roadmap) &&
          !isRoadmapDisplayGoalCompleted(item.goal)
        );
      })
      .sort((a, b) => a.position - b.position);
    const goalItems = filteredItems
      .map((item) => item.goal)
      .filter((goal): goal is RoadmapGoal => Boolean(goal));

    return {
      id: roadmap.id,
      title: roadmap.title,
      emoji: roadmap.emoji,
      monument_id: roadmap.monument_id,
      circle_id: roadmap.circle_id,
      goals: goalItems,
      items: filteredItems,
    };
  });
}

function MonumentPriorityRoadmapSkeleton() {
  return (
    <section
      className="overflow-hidden rounded-[20px] border border-black/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.075),rgba(113,113,122,0.10)_30%,rgba(24,24,27,0.34)_62%,rgba(255,255,255,0.035))] p-px shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_14px_36px_rgba(0,0,0,0.34)] sm:rounded-[22px]"
      aria-hidden="true"
    >
      <div className="rounded-[19px] border border-black/60 bg-zinc-950/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_0_22px_rgba(255,255,255,0.018),inset_0_-18px_30px_rgba(0,0,0,0.34)] sm:rounded-[21px] sm:p-4">
        <div className="space-y-3">
          {PRIORITY_ORDER.map((priority, bucketIndex) => {
            const rowCount = bucketIndex < 3 ? 2 : 1;

            return (
              <div key={priority} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 px-1">
                  <p className="text-[10px] font-semibold uppercase leading-none tracking-normal text-zinc-600">
                    {PRIORITY_LABELS[priority]}
                  </p>
                  <Skeleton className="h-2.5 w-3 rounded-sm bg-white/[0.055]" />
                </div>
                <div className="min-h-8 overflow-hidden rounded-[16px] border border-black/60 bg-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
                  {Array.from({ length: rowCount }).map((_, rowIndex) => (
                    <MonumentPriorityRoadmapSkeletonRow
                      key={`${priority}-${rowIndex}`}
                      isCampaign={rowIndex === 0}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MonumentPriorityRoadmapSkeletonRow({
  isCampaign,
}: {
  isCampaign: boolean;
}) {
  return (
    <div className="border-b border-black/40 bg-white/[0.026] last:border-b-0">
      <div className="flex min-h-10 items-center gap-2 px-2 py-1.5 sm:px-2.5">
        <Skeleton className="size-7 shrink-0 rounded-lg bg-white/[0.055]" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-3 w-3/4 max-w-[220px] rounded-sm bg-white/[0.06]" />
          {isCampaign ? (
            <Skeleton className="h-2 w-24 rounded-sm bg-white/[0.045]" />
          ) : null}
        </div>
        {isCampaign ? (
          <Skeleton className="h-3 w-10 shrink-0 rounded-sm bg-white/[0.045]" />
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            <Skeleton className="h-4 w-7 rounded-md bg-white/[0.045]" />
            <Skeleton className="hidden h-4 w-7 rounded-md bg-white/[0.045] sm:block" />
          </div>
        )}
      </div>
    </div>
  );
}

export function MonumentGoalsList({
  monumentId,
  sourceType = "monument",
  sourceId,
  circleId,
  monumentEmoji,
  monumentView = "goals",
  goalSection = "active",
  onGoalSectionChange,
  roadmapEmptyState,
}: {
  monumentId?: string;
  sourceType?: GoalsSourceType;
  sourceId?: string;
  circleId?: string;
  monumentEmoji?: string | null;
  monumentView?: "goals" | "roadmap";
  goalSection?: GoalPanel;
  onGoalSectionChange?: (section: GoalPanel) => void;
  roadmapEmptyState?: ReactNode;
}) {
  const resolvedSourceType: GoalsSourceType = sourceType;
  const resolvedSourceId =
    resolvedSourceType === "circle"
      ? circleId ?? sourceId ?? null
      : sourceId ?? monumentId ?? null;
  const goalsSourceKey = `${resolvedSourceType}:${resolvedSourceId ?? "none"}`;
  const resolvedMonumentId =
    resolvedSourceType === "monument" ? resolvedSourceId : null;
  const [refreshVersion, setRefreshVersion] = useState(0);
  const goalsDisplayKey = `${resolvedSourceType}:${resolvedSourceId ?? "none"}:${refreshVersion}`;
  const [goalsDisplayReadyKey, setGoalsDisplayReadyKey] = useState<
    string | null
  >(null);
  const [roadmapsDisplayReadyKey, setRoadmapsDisplayReadyKey] = useState<
    string | null
  >(null);
  const ownerLabel = resolvedSourceType === "circle" ? "Circle" : "monument";
  const creationContext = useFabCreation();
  const toast = useToastHelpers();
  const [loading, setLoading] = useState(true);
  const goalsDisplayReady = goalsDisplayReadyKey === goalsDisplayKey;
  const roadmapsDisplayReady = roadmapsDisplayReadyKey === goalsDisplayKey;
  const goalsGridLoading =
    loading || !goalsDisplayReady || !roadmapsDisplayReady;
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalCampaignCards, setGoalCampaignCards] = useState<
    GoalCampaignCardData[]
  >([]);
  const [monumentRoadmapsWithItems, setMonumentRoadmapsWithItems] = useState<
    RoadmapWithItems[]
  >([]);
  const [
    monumentPriorityRoadmapItems,
    setMonumentPriorityRoadmapItems,
  ] = useState<GlobalPriorityRoadmapItem[]>([]);
  const visibleMonumentPriorityRoadmapItems = useMemo(
    () =>
      resolvedSourceType === "monument"
        ? finalizeMonumentPriorityRoadmapItems(
            monumentPriorityRoadmapItems,
            resolvedSourceId
          )
        : [],
    [monumentPriorityRoadmapItems, resolvedSourceId, resolvedSourceType]
  );
  const [monumentPriorityRoadmapError, setMonumentPriorityRoadmapError] =
    useState<string | null>(null);
  const [isSavingMonumentPriorityOrder, setIsSavingMonumentPriorityOrder] =
    useState(false);
  const monumentPriorityRoadmapSensors = usePriorityRoadmapSensors();
  const [openGoalId, setOpenGoalId] = useState<string | null>(null);
  const [restoreGoalDrawerId, setRestoreGoalDrawerId] = useState<string | null>(
    null
  );
  const [restoreCampaignDrawerId, setRestoreCampaignDrawerId] = useState<
    string | null
  >(null);
  const [restoreCampaignGoalId, setRestoreCampaignGoalId] = useState<
    string | null
  >(null);
  const [newCampaignGoalReveal, setNewCampaignGoalReveal] = useState<{
    campaignId: string;
    goalId: string;
  } | null>(null);
  const [newProjectReveal, setNewProjectReveal] = useState<{
    goalId: string;
    projectId: string;
    campaignId?: string | null;
  } | null>(null);
  const [roadmapOpenGoal, setRoadmapOpenGoal] = useState<Goal | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [fabEditTarget, setFabEditTarget] = useState<FabEditTarget | null>(
    null
  );
  const [activeGoalPanel, setActiveGoalPanel] = useState<GoalPanel>("active");
  const [goalCardDensity, setGoalCardDensity] =
    useState<GoalCardDensity>("small");
  const [goalPanelHeight, setGoalPanelHeight] = useState<number | null>(null);
  const [goalPanelDragOffset, setGoalPanelDragOffset] = useState(0);
  const [goalPanelViewportWidth, setGoalPanelViewportWidth] = useState(0);
  const [goalPanelTransitionEnabled, setGoalPanelTransitionEnabled] =
    useState(false);
  const [recentlyCompletedGoalIds, setRecentlyCompletedGoalIds] = useState<
    Set<string>
  >(() => new Set());
  const [goalsRoadmapViewportWidth, setGoalsRoadmapViewportWidth] = useState(0);
  const [goalsRoadmapViewHeight, setGoalsRoadmapViewHeight] = useState<
    number | null
  >(null);
  const deferredGoalCloseFrameRef = useRef<number | null>(null);
  const recentlyCompletedGoalTimersRef = useRef<Map<string, number>>(
    new Map()
  );
  const goalsRoadmapViewportRef = useRef<HTMLDivElement | null>(null);
  const goalsViewPanelRef = useRef<HTMLDivElement | null>(null);
  const roadmapViewPanelRef = useRef<HTMLDivElement | null>(null);
  const goalPanelViewportRef = useRef<HTMLDivElement | null>(null);
  const activeGoalPanelRef = useRef<HTMLDivElement | null>(null);
  const completedGoalPanelRef = useRef<HTMLDivElement | null>(null);
  const loadingGoalPanelRef = useRef<HTMLDivElement | null>(null);
  const readyGoalsToastSignatureRef = useRef<string | null>(null);
  const hydratedGoalIdsRef = useRef<Set<string>>(new Set());
  const loadedGoalsSourceKeyRef = useRef<string | null>(null);
  const goalPanelWheelLockedRef = useRef(false);
  const goalPanelWheelCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const goalPanelDragStartRef = useRef<{
    x: number;
    y: number;
    pointerId: number;
  } | null>(null);
  const goalPanelTouchRef = useRef<{
    startX: number;
    startY: number;
    deltaX: number;
    deltaY: number;
    axis: GoalPanelSwipeAxis;
    width: number;
  } | null>(null);
  const activeGoalPanelIndex = activeGoalPanel === "completed" ? 1 : 0;
  const goalsRoadmapViewIndex = monumentView === "roadmap" ? 1 : 0;
  const goalsRoadmapTrackTransform =
    goalsRoadmapViewportWidth > 0
      ? -goalsRoadmapViewIndex * goalsRoadmapViewportWidth
      : 0;
  const goalPanelBaseTransform =
    goalPanelViewportWidth > 0
      ? -activeGoalPanelIndex * goalPanelViewportWidth
      : 0;
  const goalPanelTrackTransform = Math.max(
    -goalPanelViewportWidth,
    Math.min(0, goalPanelBaseTransform + goalPanelDragOffset)
  );
  const goalGridClass =
    goalCardDensity === "small" ? GOAL_SMALL_GRID_CLASS : GOAL_GRID_CLASS;
  const isSmallGoalCardDensity = goalCardDensity === "small";
  const readyGoalIds = useMemo(
    () =>
      goals
        .filter(isMonumentGoalReadyToComplete)
        .map((goal) => goal.id)
        .sort(),
    [goals]
  );
  const readyGoalIdsSignature = readyGoalIds.join("|");

  useEffect(() => {
    if (goalsGridLoading) {
      return;
    }

    if (readyGoalIds.length === 0) {
      readyGoalsToastSignatureRef.current = null;
      return;
    }

    if (readyGoalsToastSignatureRef.current === readyGoalIdsSignature) {
      return;
    }

    readyGoalsToastSignatureRef.current = readyGoalIdsSignature;
    toast.info(
      readyGoalIds.length === 1
        ? "1 goal ready to complete"
        : `${readyGoalIds.length} goals ready to complete`
    );
  }, [
    goalsGridLoading,
    readyGoalIds.length,
    readyGoalIdsSignature,
    toast,
  ]);

  const getGoalPanelElement = useCallback((panel: GoalPanel) => {
    return panel === "completed"
      ? completedGoalPanelRef.current
      : activeGoalPanelRef.current;
  }, []);

  const getGoalPanelHeight = useCallback(
    (panel: GoalPanel) => {
      const panelElement = getGoalPanelElement(panel);
      return panelElement ? Math.ceil(panelElement.scrollHeight) : null;
    },
    [getGoalPanelElement]
  );

  const getLoadingGoalPanelHeight = useCallback(() => {
    const panelElement = loadingGoalPanelRef.current;
    return panelElement ? Math.ceil(panelElement.scrollHeight) : null;
  }, []);

  const getGoalsRoadmapPanelHeight = useCallback(
    (view: "goals" | "roadmap") => {
      const panelElement =
        view === "roadmap"
          ? roadmapViewPanelRef.current
          : goalsViewPanelRef.current;
      return panelElement ? Math.ceil(panelElement.scrollHeight) : null;
    },
    []
  );

  const measureSelectedGoalsRoadmapPanel = useCallback(() => {
    const nextHeight = getGoalsRoadmapPanelHeight(monumentView);
    if (!nextHeight) return;

    setGoalsRoadmapViewHeight((currentHeight) =>
      currentHeight === nextHeight ? currentHeight : nextHeight
    );
  }, [getGoalsRoadmapPanelHeight, monumentView]);

  useLayoutEffect(() => {
    const nextHeight = getGoalPanelHeight(goalSection);
    if (nextHeight) {
      setGoalPanelHeight(nextHeight);
    }
    setGoalPanelDragOffset(0);
    setActiveGoalPanel(goalSection);
  }, [getGoalPanelHeight, goalSection]);

  useLayoutEffect(() => {
    const viewportElement = goalPanelViewportRef.current;
    if (!viewportElement) return;

    const measureViewportWidth = () => {
      setGoalPanelViewportWidth(viewportElement.clientWidth);
    };

    measureViewportWidth();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measureViewportWidth);
    resizeObserver?.observe(viewportElement);

    if (typeof window === "undefined") {
      return () => {
        resizeObserver?.disconnect();
      };
    }

    window.addEventListener("resize", measureViewportWidth);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measureViewportWidth);
    };
  }, [loading, monumentView]);

  useEffect(() => {
    setGoalPanelDragOffset(0);
    setGoalPanelTransitionEnabled(true);
  }, []);

  useLayoutEffect(() => {
    const viewportElement = goalsRoadmapViewportRef.current;
    if (!viewportElement) return;

    const measureViewportWidth = () => {
      setGoalsRoadmapViewportWidth(viewportElement.clientWidth);
    };

    measureViewportWidth();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measureViewportWidth);
    resizeObserver?.observe(viewportElement);

    if (typeof window === "undefined") {
      return () => {
        resizeObserver?.disconnect();
      };
    }

    window.addEventListener("resize", measureViewportWidth);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measureViewportWidth);
    };
  }, []);

  const handleGoalPanelChange = useCallback(
    (panel: GoalPanel) => {
      const nextHeight = getGoalPanelHeight(panel);
      if (nextHeight) {
        setGoalPanelHeight(nextHeight);
      }
      setGoalPanelDragOffset(0);
      setActiveGoalPanel(panel);
      onGoalSectionChange?.(panel);
    },
    [getGoalPanelHeight, onGoalSectionChange]
  );

  const handleGoalCardDensityToggle = useCallback(() => {
    setGoalCardDensity((currentDensity) =>
      currentDensity === "large" ? "small" : "large"
    );
  }, []);

  const renderGoalCardDensityToggle = useCallback(() => (
    <button
      type="button"
      aria-label={isSmallGoalCardDensity ? "Use large cards" : "Use small cards"}
      onClick={handleGoalCardDensityToggle}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/[0.035] text-zinc-500 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-zinc-300 focus-visible:border-white/20 focus-visible:bg-white/[0.06] focus-visible:outline-none ${
        isSmallGoalCardDensity ? "text-zinc-300" : ""
      }`}
    >
      {isSmallGoalCardDensity ? (
        <Grid2x2 className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
      ) : (
        <Grid3x3 className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
      )}
    </button>
  ), [handleGoalCardDensityToggle, isSmallGoalCardDensity]);

  const measureActiveGoalPanel = useCallback(() => {
    const nextHeight = goalsGridLoading
      ? getLoadingGoalPanelHeight()
      : getGoalPanelHeight(activeGoalPanel);
    if (!nextHeight) return;

    setGoalPanelHeight((currentHeight) =>
      currentHeight === nextHeight ? currentHeight : nextHeight
    );
  }, [
    activeGoalPanel,
    getGoalPanelHeight,
    getLoadingGoalPanelHeight,
    goalsGridLoading,
  ]);

  useLayoutEffect(() => {
    if (monumentView !== "goals") {
      return;
    }

    measureActiveGoalPanel();
  }, [
    activeGoalPanel,
    goalCardDensity,
    goalCampaignCards,
    goals,
    goalsGridLoading,
    measureActiveGoalPanel,
    monumentRoadmapsWithItems,
    monumentPriorityRoadmapItems,
    monumentView,
    openGoalId,
    roadmapOpenGoal,
    restoreCampaignDrawerId,
    restoreCampaignGoalId,
    restoreGoalDrawerId,
    newCampaignGoalReveal,
    newProjectReveal,
    recentlyCompletedGoalIds,
  ]);

  useEffect(() => {
    if (monumentView !== "goals") return;

    const activePanel = goalsGridLoading
      ? loadingGoalPanelRef.current
      : activeGoalPanel === "completed"
        ? completedGoalPanelRef.current
        : activeGoalPanelRef.current;

    if (!activePanel) return;

    measureActiveGoalPanel();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            measureActiveGoalPanel();
          });
    resizeObserver?.observe(activePanel);

    if (typeof window === "undefined") {
      return () => {
        resizeObserver?.disconnect();
      };
    }

    window.addEventListener("resize", measureActiveGoalPanel);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measureActiveGoalPanel);
    };
  }, [activeGoalPanel, goalsGridLoading, measureActiveGoalPanel, monumentView]);

  useLayoutEffect(() => {
    measureSelectedGoalsRoadmapPanel();
  }, [
    activeGoalPanel,
    goalPanelHeight,
    goalCardDensity,
    goalCampaignCards,
    goals,
    goalsGridLoading,
    loading,
    measureSelectedGoalsRoadmapPanel,
    monumentRoadmapsWithItems,
    monumentPriorityRoadmapItems,
    openGoalId,
    roadmapOpenGoal,
    goalsRoadmapViewportWidth,
    recentlyCompletedGoalIds,
  ]);

  useEffect(() => {
    const goalsPanel = goalsViewPanelRef.current;
    const roadmapPanel = roadmapViewPanelRef.current;

    measureSelectedGoalsRoadmapPanel();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            measureSelectedGoalsRoadmapPanel();
          });
    if (goalsPanel) resizeObserver?.observe(goalsPanel);
    if (roadmapPanel) resizeObserver?.observe(roadmapPanel);

    if (typeof window === "undefined") {
      return () => {
        resizeObserver?.disconnect();
      };
    }

    window.addEventListener("resize", measureSelectedGoalsRoadmapPanel);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measureSelectedGoalsRoadmapPanel);
    };
  }, [
    activeGoalPanel,
    goalPanelHeight,
    goalCardDensity,
    goalsGridLoading,
    loading,
    measureSelectedGoalsRoadmapPanel,
    monumentView,
  ]);

  const handleGoalPanelPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (
        event.pointerType !== "pen" &&
        event.pointerType !== "mouse"
      ) {
        return;
      }
      goalPanelDragStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
      };
    },
    []
  );

  const handleGoalPanelPointerEnd = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const start = goalPanelDragStartRef.current;
      if (!start || start.pointerId !== event.pointerId) return;
      goalPanelDragStartRef.current = null;

      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      const horizontalDistance = Math.abs(deltaX);

      if (
        horizontalDistance < 48 ||
        horizontalDistance < Math.abs(deltaY) * 1.35
      ) {
        return;
      }

      handleGoalPanelChange(deltaX < 0 ? "completed" : "active");
    },
    [handleGoalPanelChange]
  );

  const resetGoalPanelTouch = useCallback(() => {
    goalPanelTouchRef.current = null;
    setGoalPanelDragOffset(0);
  }, []);

  const handleGoalPanelTouchStart = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (event.touches.length !== 1) {
        resetGoalPanelTouch();
        return;
      }

      const touch = event.touches[0];
      goalPanelTouchRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        deltaX: 0,
        deltaY: 0,
        axis: null,
        width: event.currentTarget.clientWidth,
      };
      setGoalPanelDragOffset(0);
    },
    [resetGoalPanelTouch]
  );

  const handleGoalPanelTouchMove = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const gesture = goalPanelTouchRef.current;
      if (!gesture || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      gesture.deltaX = deltaX;
      gesture.deltaY = deltaY;

      if (!gesture.axis) {
        if (absX > 12 && absX > absY * 1.15) {
          gesture.axis = "horizontal";
        } else if (absY > 12 && absY > absX * 1.15) {
          gesture.axis = "vertical";
        } else {
          return;
        }
      }

      if (gesture.axis !== "horizontal") return;

      if (event.cancelable) {
        event.preventDefault();
      }

      const width = gesture.width || event.currentTarget.clientWidth || 1;
      const baseTransform = -activeGoalPanelIndex * width;
      const nextTransform = Math.max(
        -width,
        Math.min(0, baseTransform + deltaX)
      );
      setGoalPanelDragOffset(nextTransform - baseTransform);
    },
    [activeGoalPanelIndex]
  );

  const handleGoalPanelTouchEnd = useCallback(() => {
    const gesture = goalPanelTouchRef.current;
    if (!gesture) return;

    goalPanelTouchRef.current = null;
    setGoalPanelDragOffset(0);

    if (gesture.axis !== "horizontal") return;

    const horizontalDistance = Math.abs(gesture.deltaX);
    const releaseThreshold = Math.min(45, Math.max(28, gesture.width * 0.2));
    if (
      horizontalDistance < releaseThreshold ||
      horizontalDistance < Math.abs(gesture.deltaY) * 1.15
    ) {
      return;
    }

    if (activeGoalPanel === "active" && gesture.deltaX < -releaseThreshold) {
      handleGoalPanelChange("completed");
      return;
    }

    if (activeGoalPanel === "completed" && gesture.deltaX > releaseThreshold) {
      handleGoalPanelChange("active");
    }
  }, [activeGoalPanel, handleGoalPanelChange]);

  const handleGoalPanelWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      const horizontalDistance = Math.abs(event.deltaX);
      if (
        horizontalDistance < 28 ||
        horizontalDistance <= Math.abs(event.deltaY)
      ) {
        return;
      }

      const nextPanel = event.deltaX < 0 ? "completed" : "active";
      if (nextPanel === activeGoalPanel || goalPanelWheelLockedRef.current) {
        return;
      }

      event.preventDefault();
      goalPanelWheelLockedRef.current = true;
      handleGoalPanelChange(nextPanel);

      if (goalPanelWheelCooldownRef.current) {
        clearTimeout(goalPanelWheelCooldownRef.current);
      }
      goalPanelWheelCooldownRef.current = setTimeout(() => {
        goalPanelWheelLockedRef.current = false;
        goalPanelWheelCooldownRef.current = null;
      }, 650);
    },
    [activeGoalPanel, handleGoalPanelChange]
  );

  useEffect(() => {
    return () => {
      if (goalPanelWheelCooldownRef.current) {
        clearTimeout(goalPanelWheelCooldownRef.current);
      }
    };
  }, []);

  const holdRecentlyCompletedGoal = useCallback((goalId: string) => {
    setRecentlyCompletedGoalIds((current) => {
      const next = new Set(current);
      next.add(goalId);
      return next;
    });

    const existingTimer = recentlyCompletedGoalTimersRef.current.get(goalId);
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
    }

    const timer = window.setTimeout(() => {
      recentlyCompletedGoalTimersRef.current.delete(goalId);
      setRecentlyCompletedGoalIds((current) => {
        if (!current.has(goalId)) return current;
        const next = new Set(current);
        next.delete(goalId);
        return next;
      });
    }, RECENTLY_COMPLETED_GOAL_HOLD_MS);

    recentlyCompletedGoalTimersRef.current.set(goalId, timer);
  }, []);

  useEffect(() => {
    const recentlyCompletedGoalTimers =
      recentlyCompletedGoalTimersRef.current;

    return () => {
      recentlyCompletedGoalTimers.forEach((timer) => {
        window.clearTimeout(timer);
      });
      recentlyCompletedGoalTimers.clear();
    };
  }, []);

  const closeGoalDetailAfterFabOpen = useCallback(() => {
    const closeGoalDetail = () => {
      deferredGoalCloseFrameRef.current = null;
      setOpenGoalId(null);
      setRoadmapOpenGoal(null);
    };

    if (typeof window === "undefined") {
      closeGoalDetail();
      return;
    }

    if (deferredGoalCloseFrameRef.current !== null) {
      window.cancelAnimationFrame(deferredGoalCloseFrameRef.current);
    }

    deferredGoalCloseFrameRef.current = window.requestAnimationFrame(() => {
      deferredGoalCloseFrameRef.current =
        window.requestAnimationFrame(closeGoalDetail);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (
        typeof window !== "undefined" &&
        deferredGoalCloseFrameRef.current !== null
      ) {
        window.cancelAnimationFrame(deferredGoalCloseFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setOpenGoalId(null);
    setRestoreGoalDrawerId(null);
    setRestoreCampaignDrawerId(null);
    setRestoreCampaignGoalId(null);
    setRoadmapOpenGoal(null);
    setGoalCampaignCards([]);
    setMonumentPriorityRoadmapItems([]);
    setMonumentPriorityRoadmapError(null);
  }, [resolvedSourceType, resolvedSourceId]);

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
            completedAt: task.completed_at ?? null,
            skillId: task.skill_id ?? null,
            priorityCode: task.priority ?? null,
            energyCode: normalizeEnergyCode(task.energy),
            skillIcon: resolveSkillEmoji(task.skill_id ?? null),
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
        const done = normalizedTasks.filter((task) =>
          Boolean(task.completedAt)
        ).length;
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
          globalRank:
            typeof project.global_rank === "number" &&
            Number.isFinite(project.global_rank) &&
            project.global_rank > 0
              ? project.global_rank
              : null,
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
        circleId: goalRow.circle_id ?? fallback?.circleId ?? null,
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
        globalRank: parseGlobalRank(goalRow.global_rank) ?? fallback?.globalRank,
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
            monumentId: fallback.monumentId ?? resolvedMonumentId,
            circleId:
              fallback.circleId ??
              (resolvedSourceType === "circle" ? resolvedSourceId : null),
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
        if (!userId || !resolvedSourceId) {
          return fallbackGoal;
        }

        const goalRow = await fetchGoalWithRelationsById(
          goalId,
          userId,
          resolvedSourceType,
          resolvedSourceId
        );
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
    [
      decorate,
      mapGoalRowToDisplayGoal,
      monumentEmoji,
      resolvedMonumentId,
      resolvedSourceId,
      resolvedSourceType,
      userId,
    ]
  );

  const refreshTrueRoadmaps = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase || !resolvedSourceId) {
      setMonumentRoadmapsWithItems([]);
      setMonumentPriorityRoadmapItems([]);
      setMonumentPriorityRoadmapError(null);
      setGoalCampaignCards([]);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setMonumentRoadmapsWithItems([]);
      setMonumentPriorityRoadmapItems([]);
      setMonumentPriorityRoadmapError(null);
      setGoalCampaignCards([]);
      return;
    }

    setUserId(user.id);
    const [trueRoadmaps, campaignCards, priorityRoadmapItems] = await Promise.all([
      resolvedSourceType === "circle"
        ? fetchTrueRoadmapsForCircle(user.id, resolvedSourceId)
        : fetchTrueRoadmapsForMonument(user.id, resolvedSourceId, {
            reconcile: true,
          }),
      resolvedSourceType === "circle"
        ? listGoalCampaignCards(user.id).catch((err) => {
            console.error("Error refreshing Circle campaign cards", err);
            return [] as GoalCampaignCardData[];
          })
        : Promise.resolve([] as GoalCampaignCardData[]),
      resolvedSourceType === "monument"
        ? fetchMonumentPriorityRoadmapItems(user.id).catch(
            (err) => {
              console.error("Error refreshing Monument priority roadmap", err);
              return [] as GlobalPriorityRoadmapItem[];
            }
          )
        : Promise.resolve([] as GlobalPriorityRoadmapItem[]),
    ]);
    setMonumentRoadmapsWithItems(trueRoadmaps);
    setGoalCampaignCards(campaignCards);
    setMonumentPriorityRoadmapItems(priorityRoadmapItems);
    setMonumentPriorityRoadmapError(null);
  }, [resolvedSourceId, resolvedSourceType]);

  const isGoalLinkedToCurrentSource = useCallback(
    (goal: { monumentId?: string | null; circleId?: string | null }) => {
      if (!resolvedSourceId) return false;
      return resolvedSourceType === "circle"
        ? goal.circleId === resolvedSourceId
        : goal.monumentId === resolvedSourceId;
    },
    [resolvedSourceId, resolvedSourceType]
  );

  const isRoadmapGoalLinkedToCurrentSource = useCallback(
    (goal: { monument_id?: string | null; circle_id?: string | null }) => {
      if (!resolvedSourceId) return false;
      return resolvedSourceType === "circle"
        ? goal.circle_id === resolvedSourceId
        : goal.monument_id === resolvedSourceId;
    },
    [resolvedSourceId, resolvedSourceType]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleCreatorEntitySaved = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          entityType?: string;
          entityId?: string;
          action?: string;
          monumentId?: string | null;
          circleId?: string | null;
          campaignId?: string | null;
          goalId?: string | null;
          preserveDrawer?: {
            type?: string;
            id?: string;
            parentId?: string | null;
          } | null;
        }>
      ).detail;
      const entityType = detail?.entityType;
      if (
        entityType !== "GOAL" &&
        entityType !== "PROJECT" &&
        entityType !== "TASK" &&
        entityType !== "HABIT"
      ) {
        return;
      }

      if (entityType === "GOAL" && detail?.entityId) {
        const movedGoalId = detail.entityId;
        const eventGoal = {
          monumentId: detail.monumentId ?? null,
          circleId: detail.circleId ?? null,
        };
        if (!isGoalLinkedToCurrentSource(eventGoal)) {
          setGoals((current) =>
            current.filter((goal) => goal.id !== movedGoalId)
          );
          setMonumentRoadmapsWithItems((current) =>
            current.map((roadmap) => ({
              ...roadmap,
              goals: roadmap.goals.filter((goal) => goal.id !== movedGoalId),
              items: roadmap.items
                .map((item) => {
                  if (item.goal?.id === movedGoalId) {
                    return { ...item, goal: null };
                  }
                  if (!item.campaign) {
                    return item;
                  }
                  const campaignGoals = item.campaign.goals.filter(
                    (goal) => goal.id !== movedGoalId
                  );
                  return {
                    ...item,
                    campaign:
                      campaignGoals.length > 0
                        ? { ...item.campaign, goals: campaignGoals }
                        : null,
                  };
                })
                .filter((item) => {
                  if (item.item_type === "CAMPAIGN") {
                    return Boolean(item.campaign);
                  }
                  if (item.item_type === "GOAL") {
                    return Boolean(item.goal);
                  }
                  return true;
                }),
            }))
          );
          setMonumentPriorityRoadmapItems((current) =>
            removeGoalFromPriorityRoadmapItems(current, movedGoalId)
          );
          setRoadmapOpenGoal((current) =>
            current?.id === movedGoalId ? null : current
          );
          setOpenGoalId((current) =>
            current === movedGoalId ? null : current
          );
        }
      }

      if (detail?.action === "created") {
        if (
          entityType === "GOAL" &&
          detail.preserveDrawer?.type === "campaign"
        ) {
          const campaignId = detail.campaignId ?? detail.preserveDrawer.id;
          if (campaignId && detail.entityId) {
            setRestoreGoalDrawerId(null);
            setRestoreCampaignDrawerId(campaignId);
            setRestoreCampaignGoalId(null);
            setNewCampaignGoalReveal({
              campaignId,
              goalId: detail.entityId,
            });
          }
        }

        if (
          entityType === "PROJECT" &&
          detail.preserveDrawer?.type === "goal"
        ) {
          const goalId = detail.goalId ?? detail.preserveDrawer.id;
          if (goalId && detail.entityId) {
            const campaignId = detail.preserveDrawer.parentId ?? null;
            setNewProjectReveal({
              goalId,
              projectId: detail.entityId,
              campaignId,
            });

            if (campaignId) {
              setRestoreGoalDrawerId(null);
              setRoadmapOpenGoal((current) =>
                current?.id === goalId ? null : current
              );
              setRestoreCampaignDrawerId(campaignId);
              setRestoreCampaignGoalId(goalId);
            } else {
              setRestoreCampaignDrawerId(null);
              setRestoreCampaignGoalId(null);
              setOpenGoalId(goalId);
              setRestoreGoalDrawerId(goalId);

              const currentGoal = goals.find((goal) => goal.id === goalId);
              if (currentGoal) {
                setRoadmapOpenGoal(currentGoal);
              }
            }
          }
        }
      }

      setRefreshVersion((current) => current + 1);
    };

    window.addEventListener(
      "creator:entity-saved",
      handleCreatorEntitySaved
    );
    return () => {
      window.removeEventListener(
        "creator:entity-saved",
        handleCreatorEntitySaved
      );
    };
  }, [goals, isGoalLinkedToCurrentSource]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const shouldPreserveDisplayState =
        loadedGoalsSourceKeyRef.current === goalsSourceKey;
      const supabase = getSupabaseBrowser();
      if (!supabase || !resolvedSourceId) {
        loadedGoalsSourceKeyRef.current = null;
        setMonumentRoadmapsWithItems([]);
        setMonumentPriorityRoadmapItems([]);
        setMonumentPriorityRoadmapError(null);
        setGoalCampaignCards([]);
        setGoals([]);
        setGoalsDisplayReadyKey(goalsDisplayKey);
        setRoadmapsDisplayReadyKey(goalsDisplayKey);
        setLoading(false);
        return;
      }
      if (shouldPreserveDisplayState) {
        setLoading(false);
        setGoalsDisplayReadyKey(goalsDisplayKey);
        setRoadmapsDisplayReadyKey(goalsDisplayKey);
      } else {
        setLoading(true);
        setGoals([]);
        setGoalsDisplayReadyKey(null);
        setRoadmapsDisplayReadyKey(null);
        setMonumentRoadmapsWithItems([]);
        setMonumentPriorityRoadmapItems([]);
        setMonumentPriorityRoadmapError(null);
        setGoalCampaignCards([]);
        hydratedGoalIdsRef.current.clear();
      }
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!user) {
          setGoalCampaignCards([]);
          setMonumentPriorityRoadmapItems([]);
          setMonumentPriorityRoadmapError(null);
          loadedGoalsSourceKeyRef.current = goalsSourceKey;
          setGoalsDisplayReadyKey(goalsDisplayKey);
          setRoadmapsDisplayReadyKey(goalsDisplayKey);
          setLoading(false);
          return;
        }
        setUserId(user.id);

        const skillsPromise = getSkillsForUser(user.id).catch(() => []);
        const roadmapsPromise =
          (
            resolvedSourceType === "circle"
              ? fetchTrueRoadmapsForCircle(user.id, resolvedSourceId)
              : fetchTrueRoadmapsForMonument(user.id, resolvedSourceId, {
                  reconcile: true,
                })
          ).catch((err) => {
            console.error(`Error loading ${resolvedSourceType} roadmaps`, err);
            return [] as RoadmapWithItems[];
          });
        const goalsPromise = fetchGoalsWithRelationsForSource(
          resolvedSourceType,
          resolvedSourceId,
          user.id
        );
        const campaignCardsPromise =
          resolvedSourceType === "circle"
            ? listGoalCampaignCards(user.id).catch((err) => {
                console.error("Error loading Circle campaign cards", err);
                return [] as GoalCampaignCardData[];
              })
            : Promise.resolve([] as GoalCampaignCardData[]);
        const priorityRoadmapItemsPromise =
          resolvedSourceType === "monument"
            ? fetchMonumentPriorityRoadmapItems(user.id).catch(
                (err) => {
                  console.error("Error loading Monument priority roadmap", err);
                  return [] as GlobalPriorityRoadmapItem[];
                }
              )
            : Promise.resolve([] as GlobalPriorityRoadmapItem[]);
        const fullGoalsPromise = fetchGoalsFullRelationsForSource(
          resolvedSourceType,
          resolvedSourceId,
          user.id
        );
        const fullGoalsResultPromise = fullGoalsPromise
          .then((fullRows) => ({ fullRows, error: null }))
          .catch((error) => ({
            fullRows: [] as GoalRowWithRelations[],
            error,
          }));

        const [
          rows,
          trueMonumentRoadmaps,
          skills,
          campaignCards,
          priorityRoadmapItems,
          fullGoalsResult,
        ] =
          await Promise.all([
            goalsPromise,
            roadmapsPromise,
            skillsPromise,
            campaignCardsPromise,
            priorityRoadmapItemsPromise,
            fullGoalsResultPromise,
          ]);
        if (cancelled) return;

        const mapped: Goal[] = sortGoalsForDisplay(
          rows.map((g) => mapGoalRowToDisplayGoal(g, new Map()))
        );

        setMonumentRoadmapsWithItems(trueMonumentRoadmaps);
        setGoalCampaignCards(campaignCards);
        setMonumentPriorityRoadmapItems(priorityRoadmapItems);
        setMonumentPriorityRoadmapError(null);
        setRoadmapsDisplayReadyKey(goalsDisplayKey);

        if (fullGoalsResult.error) {
          console.error(
            `Error hydrating ${resolvedSourceType} goal relations`,
            fullGoalsResult.error
          );
          setGoals(mapped);
          hydratedGoalIdsRef.current.clear();
          loadedGoalsSourceKeyRef.current = goalsSourceKey;
          setGoalsDisplayReadyKey(goalsDisplayKey);
          setLoading(false);
          return;
        }

        const skillIconLookup = new Map(
          skills.map((skill) => [skill.id, skill.icon ?? null])
        );

        const fallbackGoalsById = new Map(mapped.map((goal) => [goal.id, goal]));
        const shouldUseMappedFallback =
          mapped.length > 0 && fullGoalsResult.fullRows.length === 0;
        if (shouldUseMappedFallback) {
          console.warn(
            `Hydrated ${resolvedSourceType} goal relations returned no rows; rendering first-pass goals as fallback`
          );
        }
        const hydratedGoals = shouldUseMappedFallback
          ? mapped
          : sortGoalsForDisplay(
              fullGoalsResult.fullRows.map((goalRow) =>
                mapGoalRowToDisplayGoal(
                  goalRow,
                  skillIconLookup,
                  fallbackGoalsById.get(goalRow.id)
                )
              )
            );

        setGoals(hydratedGoals);
        hydratedGoalIdsRef.current = shouldUseMappedFallback
          ? new Set()
          : new Set(fullGoalsResult.fullRows.map((goalRow) => goalRow.id));
        loadedGoalsSourceKeyRef.current = goalsSourceKey;
        setGoalsDisplayReadyKey(goalsDisplayKey);
        setLoading(false);
      } catch (err) {
        console.error(`Error loading ${resolvedSourceType} goals`, err);
        if (!cancelled) {
          if (!shouldPreserveDisplayState) {
            loadedGoalsSourceKeyRef.current = null;
            setGoals([]);
            setMonumentRoadmapsWithItems([]);
            setMonumentPriorityRoadmapItems([]);
            setMonumentPriorityRoadmapError(null);
            setGoalCampaignCards([]);
          }
          setGoalsDisplayReadyKey(goalsDisplayKey);
          setRoadmapsDisplayReadyKey(goalsDisplayKey);
          setLoading(false);
        }
      }
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [
    resolvedSourceId,
    resolvedSourceType,
    monumentEmoji,
    decorate,
    goalsSourceKey,
    goalsDisplayKey,
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
      const updateGoalProject = (goal: Goal) => {
        if (goal.id !== goalId) return goal;
        const existingProject = goal.projects.find(
          (project) => project.id === projectId
        );
        return {
          ...goal,
          projects: existingProject
            ? goal.projects.map((project) =>
                project.id === projectId ? { ...project, ...updates } : project
              )
            : [...goal.projects, buildProjectFromUpdates(projectId, updates)],
        };
      };

      setGoals((prev) => prev.map(updateGoalProject));
      setRoadmapOpenGoal((current) =>
        current?.id === goalId ? updateGoalProject(current) : current
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

  const handleNewCampaignGoalRevealComplete = useCallback(
    (campaignId: string, goalId: string) => {
      setNewCampaignGoalReveal((current) =>
        current?.campaignId === campaignId && current.goalId === goalId
          ? null
          : current
      );
    },
    []
  );

  const handleNewProjectRevealComplete = useCallback(
    (goalId: string, projectId: string) => {
      setNewProjectReveal((current) =>
        current?.goalId === goalId && current.projectId === projectId
          ? null
          : current
      );
    },
    []
  );

  const handleGoalOpenChange = useCallback(
    (goalId: string, isOpen: boolean) => {
      if (isOpen && !hydratedGoalIdsRef.current.has(goalId)) {
        const currentGoal = goals.find((goal) => goal.id === goalId);
        if (currentGoal && currentGoal.projects.length === 0) {
          hydratedGoalIdsRef.current.add(goalId);
          void fetchGoalForDisplay(goalId, currentGoal)
            .then((fullGoal) => {
              if (!fullGoal) {
                hydratedGoalIdsRef.current.delete(goalId);
                return;
              }
              setGoals((prev) =>
                prev.map((goal) => (goal.id === goalId ? fullGoal : goal))
              );
              setRoadmapOpenGoal((current) =>
                current?.id === goalId ? fullGoal : current
              );
            })
            .catch((err) => {
              hydratedGoalIdsRef.current.delete(goalId);
              console.warn("Failed to hydrate opened monument goal:", err);
            });
        }
      }

      setOpenGoalId((current) => {
        if (isOpen) {
          return goalId;
        }
        if (current === goalId) {
          if (restoreGoalDrawerId === goalId) {
            setRestoreGoalDrawerId(null);
          }
          return null;
        }
        return current;
      });
    },
    [fetchGoalForDisplay, goals, restoreGoalDrawerId]
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
      closeGoalDetailAfterFabOpen();
    },
    [closeGoalDetailAfterFabOpen, getGoalEditOriginRect]
  );

  const handleRoadmapGoalEdit = useCallback(
    (goal: Goal) => {
      setFabEditTarget({
        entityType: "GOAL",
        entityId: goal.id,
        title: goal.title,
        originRect: getGoalEditOriginRect(goal.id),
      });
      closeGoalDetailAfterFabOpen();
    },
    [closeGoalDetailAfterFabOpen, getGoalEditOriginRect]
  );

  const handleGoalLongPressEdit = useCallback(
    (goal: Goal, element: HTMLElement | null) => {
      const rect = element?.getBoundingClientRect();
      const styles = element ? window.getComputedStyle(element) : null;

      setFabEditTarget({
        entityType: "GOAL",
        entityId: goal.id,
        title: goal.title,
        originRect: rect
          ? {
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              borderRadius: styles?.borderRadius,
              backgroundColor: styles?.backgroundColor,
              backgroundImage: styles?.backgroundImage,
              boxShadow: styles?.boxShadow,
            }
          : getGoalEditOriginRect(goal.id),
      });
      closeGoalDetailAfterFabOpen();
    },
    [closeGoalDetailAfterFabOpen, getGoalEditOriginRect]
  );

  const handleMonumentPriorityGoalLongPressEdit =
    useCallback<GlobalPriorityGoalLongPressEditHandler>(
      (goal, element) => {
        const rect = element.getBoundingClientRect();
        const styles = window.getComputedStyle(element);

        setFabEditTarget({
          entityType: "GOAL",
          entityId: goal.id,
          title: goal.name,
          originRect: {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            borderRadius: styles.borderRadius,
            backgroundColor: styles.backgroundColor,
            backgroundImage: styles.backgroundImage,
            boxShadow: styles.boxShadow,
          },
        });
        closeGoalDetailAfterFabOpen();
      },
      [closeGoalDetailAfterFabOpen]
    );

  const handleCampaignAddGoal = useCallback(
    (campaignId: string) => {
      creationContext?.requestGoalCreation(null, campaignId, {
        preserveDrawer: { type: "campaign", id: campaignId },
      });
    },
    [creationContext]
  );

  const handleManualGoalComplete = useCallback(
    async (goal: Goal) => {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;
      const completedAt = new Date().toISOString();

      const applyCompletedStatus = (currentGoal: Goal): Goal =>
        currentGoal.id === goal.id
          ? {
              ...currentGoal,
              status: "COMPLETED",
              active: false,
              progress: 100,
            }
          : currentGoal;

      try {
        let query = supabase
          .from("goals")
          .update({ status: "COMPLETED", active: false })
          .eq("id", goal.id);

        if (userId) {
          query = query.eq("user_id", userId);
        }

        const { error } = await query;
        if (error) {
          throw error;
        }

        try {
          const response = await fetch("/api/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sourceType: "GOAL",
              sourceId: goal.id,
              completedAt,
              wasScheduled: false,
            }),
          });
          if (!response.ok) {
            console.error(
              "Failed to record goal completion",
              await response.text()
            );
          }
        } catch (completionError) {
          console.error("Failed to record goal completion", completionError);
        }

        setGoals((prev) => prev.map(applyCompletedStatus));
        setRoadmapOpenGoal((current) =>
          current?.id === goal.id ? applyCompletedStatus(current) : current
        );
        setMonumentRoadmapsWithItems((current) =>
          markRoadmapGoalCompleted(current, goal.id)
        );
        setMonumentPriorityRoadmapItems((current) =>
          removeGoalFromPriorityRoadmapItems(current, goal.id)
        );
        holdRecentlyCompletedGoal(goal.id);
        setOpenGoalId((current) => (current === goal.id ? null : current));
      } catch (err) {
        console.error("Failed to manually complete goal:", err);
        toast.error("Goal completion failed", "Try again in a moment.");
        throw err;
      }
    },
    [holdRecentlyCompletedGoal, toast, userId]
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
            monumentId: roadmap.monument_id ?? resolvedMonumentId,
            circleId: roadmap.circle_id ?? null,
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
            monumentId: roadmap.monument_id ?? resolvedMonumentId,
            circleId: roadmap.circle_id ?? null,
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
      monumentRoadmapsWithItems,
      resolvedMonumentId,
    ]
  );

  const handleMonumentPriorityDragEnd = useCallback(
    async (
      event: DragEndEvent,
      previewItems?: GlobalPriorityRoadmapItem[] | null
    ) => {
      const { active, over } = event;
      if (!over) return;

      const activeData = active.data.current as
        | { item?: GlobalPriorityRoadmapItem }
        | undefined;
      const draggedItem = activeData?.item;
      if (!draggedItem) return;

      const previousItems = monumentPriorityRoadmapItems;
      const previewItemsChanged = previewItems
        ? !globalPriorityOrdersMatch(previousItems, previewItems)
        : false;
      const overData = over.data.current as
        | { bucket?: PriorityBucketId; item?: GlobalPriorityRoadmapItem }
        | undefined;
      const overBucket =
        overData?.bucket ??
        overData?.item?.priority ??
        parseGlobalPriorityBucketId(String(over.id));
      let nextItems = overBucket
        ? moveGlobalPriorityItem(
            previousItems,
            draggedItem,
            overBucket,
            overData?.item
          )
        : null;

      if (
        (!nextItems || globalPriorityOrdersMatch(previousItems, nextItems)) &&
        previewItemsChanged &&
        previewItems
      ) {
        nextItems = previewItems;
      }
      if (!nextItems || globalPriorityOrdersMatch(previousItems, nextItems)) return;

      const payload = buildGlobalPriorityOrderPayload(nextItems);

      setMonumentPriorityRoadmapError(null);
      setMonumentPriorityRoadmapItems(clearGlobalPriorityRanks(nextItems));

      const supabase =
        getSupabaseBrowser() as MonumentPrioritySupabaseClient | null;
      if (!supabase) {
        setMonumentPriorityRoadmapItems(previousItems);
        setMonumentPriorityRoadmapError("Unable to save priority order.");
        return;
      }

      setIsSavingMonumentPriorityOrder(true);
      try {
        const { error: saveError } = await supabase.rpc(
          "save_global_priority_order",
          { p_items: payload }
        );

        if (saveError) {
          throw saveError;
        }

        const { error: rankError } = await supabase.rpc(
          "recalculate_goal_global_rank"
        );
        if (rankError) {
          throw rankError;
        }

        await refreshTrueRoadmaps();
      } catch (caught) {
        console.error("Failed to save Monument priority item order", caught);
        setMonumentPriorityRoadmapItems(previousItems);
        setMonumentPriorityRoadmapError("Could not save priority order.");
      } finally {
        setIsSavingMonumentPriorityOrder(false);
      }
    },
    [monumentPriorityRoadmapItems, refreshTrueRoadmaps]
  );

  const handleMonumentCampaignGoalDragEnd = useCallback(
    async (campaign: GlobalPriorityRoadmapItem, event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || campaign.type !== "campaign") return;

      const activeData = active.data.current as
        | { campaignId?: string; goal?: RoadmapPriorityGoal }
        | undefined;
      const draggedGoal = activeData?.goal;
      if (!draggedGoal || activeData?.campaignId !== campaign.id) return;

      const overData = over.data.current as
        | {
            campaignId?: string;
            bucket?: PriorityBucketId;
            goal?: RoadmapPriorityGoal;
          }
        | undefined;
      if (overData?.campaignId && overData.campaignId !== campaign.id) return;

      const targetPriority =
        overData?.bucket ??
        overData?.goal?.priority ??
        parseCampaignGoalBucketId(String(over.id), campaign.id);
      if (!targetPriority) return;

      const previousItems = monumentPriorityRoadmapItems;
      const currentCampaign =
        previousItems.find(
          (item) => item.type === "campaign" && item.id === campaign.id
        ) ?? campaign;
      const previousGoals = currentCampaign.goals ?? [];
      const visibleGoals = campaign.goals ?? previousGoals;
      if (!visibleGoals.some((goal) => goal.id === draggedGoal.id)) return;

      const nextVisibleGoals = moveCampaignGoal(
        visibleGoals,
        draggedGoal,
        targetPriority,
        overData?.goal
      );
      const nextGoals = mergeVisibleCampaignGoalOrder(
        previousGoals,
        visibleGoals,
        nextVisibleGoals
      );

      if (campaignGoalOrdersMatch(previousGoals, nextGoals)) return;

      const updates = buildCampaignGoalPriorityUpdates(previousGoals, nextGoals);
      if (updates.length === 0) return;

      setMonumentPriorityRoadmapError(null);
      setMonumentPriorityRoadmapItems(
        clearGlobalPriorityRanks(
          applyCampaignGoalOrder(previousItems, currentCampaign.id, nextGoals)
        )
      );

      const supabase =
        getSupabaseBrowser() as MonumentPrioritySupabaseClient | null;
      if (!supabase) {
        setMonumentPriorityRoadmapItems(previousItems);
        setMonumentPriorityRoadmapError("Unable to save Campaign Goal order.");
        return;
      }

      setIsSavingMonumentPriorityOrder(true);
      try {
        await saveMonumentCampaignGoalPriorityOrder(supabase, updates);
        await refreshTrueRoadmaps();
      } catch (caught) {
        console.error("Failed to save Monument Campaign Goal order", caught);
        setMonumentPriorityRoadmapItems(previousItems);
        setMonumentPriorityRoadmapError("Could not save Campaign Goal order.");
      } finally {
        setIsSavingMonumentPriorityOrder(false);
      }
    },
    [monumentPriorityRoadmapItems, refreshTrueRoadmaps]
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

  const handleTaskEditOpen = useCallback(
    (
      task: Task,
      _project: Project,
      origin: ProjectCardMorphOrigin | null
    ) => {
      setFabEditTarget({
        entityType: "TASK",
        entityId: task.id,
        title: task.name,
        originRect: origin
          ? {
              top: origin.y,
              left: origin.x,
              width: origin.width,
              height: origin.height,
              borderRadius: origin.borderRadius,
              backgroundColor: origin.backgroundColor,
              boxShadow: origin.boxShadow,
            }
          : null,
      });
    },
    []
  );

  const handleTaskToggleCompletion = useCallback(
    async (
      goalId: string,
      projectId: string,
      taskId: string,
      currentCompletedAt: string | null
    ) => {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;

      const nextCompletedAt = currentCompletedAt
        ? null
        : new Date().toISOString();
      const updateGoal = (completedAt: string | null) => (goal: Goal) => {
        const updatedGoal = updateGoalTaskCompletion(
          goal,
          goalId,
          projectId,
          taskId,
          completedAt
        );
        return updatedGoal === goal ? goal : decorate(updatedGoal);
      };
      const applyTaskCompletion = updateGoal(nextCompletedAt);
      const revertTaskCompletion = updateGoal(currentCompletedAt);

      setGoals((prev) => prev.map(applyTaskCompletion));
      setRoadmapOpenGoal((current) =>
        current?.id === goalId ? applyTaskCompletion(current) : current
      );

      try {
        const { error } = await supabase
          .from("tasks")
          .update({ completed_at: nextCompletedAt })
          .eq("id", taskId);

        if (error) {
          throw error;
        }

        void refreshGoalStatus(goalId);
      } catch (err) {
        console.error("Failed to toggle monument task completion", err);
        setGoals((prev) => prev.map(revertTaskCompletion));
        setRoadmapOpenGoal((current) =>
          current?.id === goalId ? revertTaskCompletion(current) : current
        );
      }
    },
    [decorate, refreshGoalStatus]
  );

  useEffect(() => {
    if (!openGoalId) {
      setRoadmapOpenGoal(null);
      return;
    }
    if (openGoalId === restoreGoalDrawerId) {
      return;
    }
    if (
      !goals.some((goal) => goal.id === openGoalId) &&
      roadmapOpenGoal?.id !== openGoalId
    ) {
      setOpenGoalId(null);
      setRoadmapOpenGoal(null);
    }
  }, [goals, openGoalId, restoreGoalDrawerId, roadmapOpenGoal]);

  useEffect(() => {
    if (
      goalsGridLoading ||
      (!restoreGoalDrawerId &&
        !restoreCampaignDrawerId &&
        !restoreCampaignGoalId)
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setRestoreGoalDrawerId(null);
      setRestoreCampaignDrawerId(null);
      setRestoreCampaignGoalId(null);
    }, 0);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    goalsGridLoading,
    restoreGoalDrawerId,
    restoreCampaignDrawerId,
    restoreCampaignGoalId,
  ]);

  const content = useMemo(() => {
    const renderGoalsRoadmapViewport = (
      goalsContent: ReactNode,
      roadmapContent: ReactNode
    ) => (
      <div
        ref={goalsRoadmapViewportRef}
        className="relative w-full overflow-hidden transition-[height] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={
          goalsRoadmapViewHeight
            ? { height: goalsRoadmapViewHeight }
            : undefined
        }
      >
        <div className="absolute inset-0">
          <div
            className="flex w-[200%] transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              transform:
                goalsRoadmapViewportWidth > 0
                  ? `translate3d(${goalsRoadmapTrackTransform}px, 0, 0)`
                  : `translate3d(${-goalsRoadmapViewIndex * 50}%, 0, 0)`,
            }}
          >
            <div className="w-1/2 shrink-0 overflow-hidden">
              <div
                ref={goalsViewPanelRef}
                className="px-1 py-1 sm:px-1.5 sm:py-1.5"
              >
                {goalsContent}
              </div>
            </div>
            <div className="w-1/2 shrink-0 overflow-hidden">
              <div
                ref={roadmapViewPanelRef}
                className="px-1 py-1 sm:px-1.5 sm:py-1.5"
              >
                {roadmapContent}
              </div>
            </div>
          </div>
        </div>
      </div>
    );

    if (goalsGridLoading) {
      const loadingGoalsContent = (
        <section className={`${GOAL_REVEAL_CLASS} space-y-3`}>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35">
                Goal Library
              </p>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/38">
                {activeGoalPanel === "completed" ? "COMPLETED" : "ACTIVE"}
              </p>
              {renderGoalCardDensityToggle()}
            </div>
          </div>
          <div
            className="relative w-full overflow-hidden touch-pan-y transition-[height] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={goalPanelHeight ? { height: goalPanelHeight } : undefined}
            onPointerDown={handleGoalPanelPointerDown}
            onPointerUp={handleGoalPanelPointerEnd}
            onWheel={handleGoalPanelWheel}
            onPointerCancel={() => {
              goalPanelDragStartRef.current = null;
            }}
          >
            <div
              ref={loadingGoalPanelRef}
              className={GOAL_PANEL_CONTENT_CLASS}
            >
              <div
                className={`${goalGridClass} ${GOAL_GRID_MIN_HEIGHT_CLASS}`}
              >
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className={`h-full bg-white/[0.06] ${
                      isSmallGoalCardDensity
                        ? "min-h-[70px] rounded-xl"
                        : "min-h-[100px] rounded-2xl"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
      );
      const loadingRoadmapContent =
        resolvedSourceType === "monument" ? (
          <div
            className={`${GOAL_REVEAL_CLASS} ${GOAL_GRID_MIN_HEIGHT_CLASS} space-y-3.5 sm:space-y-4`}
          >
            <MonumentPriorityRoadmapSkeleton />
          </div>
        ) : (
          <div className={`${GOAL_GRID_CLASS} ${GOAL_GRID_MIN_HEIGHT_CLASS}`}>
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-full min-h-[100px] rounded-2xl bg-white/[0.06]"
              />
            ))}
          </div>
        );

      return renderGoalsRoadmapViewport(
        loadingGoalsContent,
        loadingRoadmapContent
      );
    }

    const filterGoalBySection = (goal: Goal, section: GoalPanel) => {
      const isRecentlyCompleted = recentlyCompletedGoalIds.has(goal.id);
      if (isRecentlyCompleted) {
        return section === "active";
      }

      return section === "completed"
        ? isGoalCompletedForSection(goal)
        : !isGoalCompletedForSection(goal);
    };
    const filterRoadmapGoalBySection = (
      goal: {
        id?: string | null;
        status?: string | null;
        allProjectsCompleted?: boolean;
      },
      section: GoalPanel
    ) => {
      const isRecentlyCompleted = goal.id
        ? recentlyCompletedGoalIds.has(goal.id)
        : false;
      if (isRecentlyCompleted) {
        return section === "active";
      }

      const isCompleted = normalizeGoalStatus(goal.status) === "COMPLETED";
      return section === "completed" ? isCompleted : !isCompleted;
    };
    const isCampaignGroupVisibleInSection = (
      linkedGoals: RoadmapCampaignGoal[],
      section: GoalPanel
    ) => {
      if (linkedGoals.length === 0) {
        return false;
      }

      return section === "completed"
        ? linkedGoals.every((goal) =>
            filterRoadmapGoalBySection(goal, "completed")
          )
        : linkedGoals.some((goal) =>
            filterRoadmapGoalBySection(goal, "active")
          );
    };
    const sortCampaignGoalsByPosition = (
      linkedGoals: RoadmapCampaignGoal[]
    ) =>
      linkedGoals
        .map((goal, index) => ({ goal, index }))
        .sort((a, b) => {
          const positionDiff = a.goal.position - b.goal.position;
          return positionDiff === 0 ? a.index - b.index : positionDiff;
        })
        .map(({ goal }) => goal);
    const goalsForCurrentSource = goals.filter(isGoalLinkedToCurrentSource);
    const campaignGoalIds = new Set<string>(
      monumentRoadmapsWithItems.flatMap((roadmap) =>
        roadmap.items.flatMap((item) =>
          item.campaign?.goals
            .filter(isRoadmapGoalLinkedToCurrentSource)
            .map((goal) => goal.id) ?? []
        )
      )
    );
    const goalsById = new Map(
      goalsForCurrentSource.map((goal) => [goal.id, goal])
    );
    const trueRoadmapIds = new Set(
      monumentRoadmapsWithItems.map((roadmap) => roadmap.id)
    );
    const trueRoadmapTitlesById = new Map(
      monumentRoadmapsWithItems.map((roadmap) => [
        roadmap.id,
        roadmap.title.trim().toLowerCase(),
      ])
    );
    const trueRoadmapCampaignItemIds = new Set(
      monumentRoadmapsWithItems.flatMap((roadmap) =>
        roadmap.items
          .map((item) => item.campaign?.id)
          .filter((campaignId): campaignId is string => Boolean(campaignId))
      )
    );
    const isGeneratedCircleRoadmapCard = (
      campaignCard: GoalCampaignCardData
    ) => {
      if (resolvedSourceType !== "circle") return false;
      if (campaignCard.id.startsWith("circle-campaign-")) return true;
      if (trueRoadmapIds.has(campaignCard.id)) return true;

      const linkedRoadmapTitle = campaignCard.roadmap_id
        ? trueRoadmapTitlesById.get(campaignCard.roadmap_id)
        : null;
      const campaignTitle = campaignCard.name.trim().toLowerCase();
      return Boolean(
        linkedRoadmapTitle &&
          campaignTitle === linkedRoadmapTitle &&
          !trueRoadmapCampaignItemIds.has(campaignCard.id)
      );
    };
    const eligibleCircleCampaignCards =
      resolvedSourceType === "circle"
        ? goalCampaignCards.filter(
            (campaignCard) => !isGeneratedCircleRoadmapCard(campaignCard)
          )
        : [];
    const buildCampaignFromCard = (
      campaignCard: GoalCampaignCardData
    ): RoadmapCampaign => ({
      id: campaignCard.id,
      name: campaignCard.name,
      description: campaignCard.description ?? null,
      emoji: campaignCard.emoji ?? null,
      scheduling_state: campaignCard.scheduling_state,
      position: campaignCard.position ?? null,
      roadmap_id: campaignCard.roadmap_id ?? null,
      primary_monument_id: campaignCard.primary_monument_id ?? null,
      primary_circle_id: campaignCard.primary_circle_id ?? null,
      goals: campaignCard.goals
        .map((campaignGoal): RoadmapCampaignGoal | null => {
          const goal = goalsById.get(campaignGoal.id);
          if (!goal) {
            return null;
          }

          return {
            id: goal.id,
            name: goal.title,
            emoji: goal.emoji ?? null,
            monument_id: goal.monumentId ?? null,
            circle_id: goal.circleId ?? null,
            monumentEmoji: goal.monumentEmoji ?? null,
            position: campaignGoal.position,
            status: goal.status ?? null,
            allProjectsCompleted: isGoalCompletedForSection(goal),
            global_rank: goal.globalRank ?? null,
            priority_rank: goal.priorityRank ?? null,
          };
        })
        .filter((goal): goal is RoadmapCampaignGoal => Boolean(goal)),
    });
    const buildCampaignDisplayGoal = (
      campaignGoal: RoadmapCampaignGoal,
      campaign: RoadmapCampaign
    ): Goal => {
      const fullGoal = goalsById.get(campaignGoal.id);
      if (fullGoal) {
        return {
          ...fullGoal,
          priorityRank: campaignGoal.position,
        };
      }

      return decorate({
        id: campaignGoal.id,
        title: campaignGoal.name,
        emoji: campaignGoal.emoji ?? undefined,
        priority: "Low",
        energy: "No",
        progress: campaignGoal.allProjectsCompleted ? 100 : 0,
        status: normalizeGoalStatus(campaignGoal.status),
        active: normalizeGoalStatus(campaignGoal.status) === "ACTIVE",
        createdAt: "",
        updatedAt: "",
        projects: [],
        monumentId: campaign.primary_monument_id ?? resolvedMonumentId,
        circleId:
          campaign.primary_circle_id ??
          (resolvedSourceType === "circle" ? resolvedSourceId : null),
        monumentEmoji: campaignGoal.monumentEmoji ?? monumentEmoji ?? null,
        roadmapId: campaign.roadmap_id ?? null,
        priorityCode: "NO",
        energyCode: "NO",
        weightBoost: 0,
        skills: [],
        globalRank: campaignGoal.global_rank ?? null,
        priorityRank: campaignGoal.position,
      });
    };
    const getCircleCampaignGroupsForGoalGrid = (section: GoalPanel): {
      roadmap: Roadmap;
      goals: Goal[];
      goalCount: number;
      sortPosition: number;
    }[] =>
      eligibleCircleCampaignCards
        .map((campaignCard, campaignIndex) => {
          const campaign = buildCampaignFromCard(campaignCard);
          const linkedGoals = sortCampaignGoalsByPosition(
            campaign.goals.filter(isRoadmapGoalLinkedToCurrentSource)
          );
          if (!isCampaignGroupVisibleInSection(linkedGoals, section)) {
            return null;
          }

          const displayGoals = linkedGoals.map((goal) =>
            buildCampaignDisplayGoal(goal, campaign)
          );
          const campaignRoadmap: Roadmap = {
            id: campaign.id,
            title: campaign.name,
            emoji: campaign.emoji ?? null,
            monument_id: campaign.primary_monument_id ?? null,
            circle_id: campaign.primary_circle_id ?? null,
            goals: linkedGoals.map((goal) => ({
              id: goal.id,
              name: goal.name,
              emoji: goal.emoji ?? null,
              monument_id: goal.monument_id ?? null,
              circle_id: goal.circle_id ?? null,
              monumentEmoji: goal.monumentEmoji ?? null,
              roadmap_id: campaign.roadmap_id ?? null,
              status: goal.status ?? null,
              allProjectsCompleted: goal.allProjectsCompleted,
              global_rank: goal.global_rank ?? null,
              priority_rank: goal.position ?? null,
            })),
          };

          return {
            sortPosition: campaign.position ?? campaignIndex + 100000,
            roadmap: campaignRoadmap,
            goals: displayGoals,
            goalCount: displayGoals.length,
          };
        })
        .filter(
          (
            item
          ): item is {
            roadmap: Roadmap;
            goals: Goal[];
            goalCount: number;
            sortPosition: number;
          } => Boolean(item)
        )
        .sort((a, b) => a.sortPosition - b.sortPosition);
    const getCampaignGroupsForGoalGrid = (section: GoalPanel): {
      roadmap: Roadmap;
      goals: Goal[];
      goalCount: number;
      sortPosition: number;
    }[] =>
      monumentRoadmapsWithItems
        .flatMap((roadmap, roadmapIndex) =>
          roadmap.items
            .filter((item) => item.item_type === "CAMPAIGN" && item.campaign)
            .map((item) => {
              const campaign = item.campaign;
              if (!campaign) {
                return null;
              }

              const linkedGoals = sortCampaignGoalsByPosition(
                campaign.goals.filter(isRoadmapGoalLinkedToCurrentSource)
              );
              if (!isCampaignGroupVisibleInSection(linkedGoals, section)) {
                return null;
              }

              const displayGoals = linkedGoals.map((goal) =>
                buildCampaignDisplayGoal(goal, campaign)
              );
              const campaignRoadmap: Roadmap = {
                id: campaign.id,
                title: campaign.name,
                emoji: campaign.emoji ?? null,
                monument_id:
                  campaign.primary_monument_id ?? roadmap.monument_id ?? null,
                circle_id:
                  campaign.primary_circle_id ?? roadmap.circle_id ?? null,
                goals: linkedGoals.map((goal) => ({
                  id: goal.id,
                  name: goal.name,
                  emoji: goal.emoji ?? null,
                  monument_id: goal.monument_id ?? null,
                  circle_id: goal.circle_id ?? null,
                  monumentEmoji: goal.monumentEmoji ?? null,
                  roadmap_id: campaign.roadmap_id ?? roadmap.id,
                  status: goal.status ?? null,
                  allProjectsCompleted: goal.allProjectsCompleted,
                  global_rank: goal.global_rank ?? null,
                  priority_rank: goal.position ?? null,
                })),
              };

              return {
                sortPosition: roadmapIndex * 10000 + item.position,
                roadmap: campaignRoadmap,
                goals: displayGoals,
                goalCount: displayGoals.length,
              };
            })
            .filter(
              (
                item
              ): item is {
                roadmap: Roadmap;
                goals: Goal[];
                goalCount: number;
                sortPosition: number;
              } => Boolean(item)
            )
        )
        .sort((a, b) => a.sortPosition - b.sortPosition);
    const circleCampaignGoalIds = new Set<string>(
      eligibleCircleCampaignCards.flatMap((campaignCard) =>
        campaignCard.goals
          .map((goal) => goal.id)
          .filter((goalId) => goalsById.has(goalId))
      )
    );
    const standaloneGoals =
      resolvedSourceType === "circle"
        ? goalsForCurrentSource.filter(
            (goal) => !circleCampaignGoalIds.has(goal.id)
          )
        : goalsForCurrentSource.filter((goal) => !campaignGoalIds.has(goal.id));

    const hasTrueRoadmaps = monumentRoadmapsWithItems.length > 0;
    const roadmapEmptyContent = roadmapEmptyState ?? (
      <Card className="rounded-2xl border border-white/5 bg-[#111520] p-4 text-center text-sm text-[#A7B0BD] shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
        No true roadmap linked to this {ownerLabel} yet.
      </Card>
    );
    const openRoadmapGoalCard =
      roadmapOpenGoal && openGoalId === roadmapOpenGoal.id ? (
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
            completeWhenProjectsDone
            completionTheme="border"
            suppressReadyToast
            hideGoalEditAction
            onEdit={() => handleGoalEdit(roadmapOpenGoal)}
            onGoalLongPressEdit={handleGoalLongPressEdit}
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
            onTaskEditOpen={handleTaskEditOpen}
            onTaskToggleCompletion={handleTaskToggleCompletion}
            onManualComplete={handleManualGoalComplete}
            open={openGoalId === roadmapOpenGoal.id}
            newProjectRevealId={
              newProjectReveal?.goalId === roadmapOpenGoal.id &&
              !newProjectReveal.campaignId
                ? newProjectReveal.projectId
                : null
            }
            onNewProjectRevealComplete={(projectId) =>
              handleNewProjectRevealComplete(roadmapOpenGoal.id, projectId)
            }
            suppressDrawerOpenAnimation={
              restoreGoalDrawerId === roadmapOpenGoal.id
            }
            onOpenChange={(isOpen) => {
              handleGoalOpenChange(roadmapOpenGoal.id, isOpen);
              if (!isOpen) setRoadmapOpenGoal(null);
            }}
          />
        </div>
      ) : null;
    const roadmapContent =
      resolvedSourceType === "monument" ? (
        visibleMonumentPriorityRoadmapItems.length === 0 ? (
          roadmapEmptyContent
        ) : (
          <div
            className={`${GOAL_REVEAL_CLASS} ${GOAL_GRID_MIN_HEIGHT_CLASS} space-y-3.5 sm:space-y-4`}
          >
            <GlobalPriorityRoadmap
              title="Monument Roadmap"
              items={visibleMonumentPriorityRoadmapItems}
              error={monumentPriorityRoadmapError}
              isSaving={isSavingMonumentPriorityOrder}
              sensors={monumentPriorityRoadmapSensors}
              isFiltered={true}
              onGoalOpen={handleRoadmapGoalOpen}
              onGoalLongPressEdit={handleMonumentPriorityGoalLongPressEdit}
              onDragEnd={handleMonumentPriorityDragEnd}
              onCampaignGoalDragEnd={handleMonumentCampaignGoalDragEnd}
            />
            {openRoadmapGoalCard}
          </div>
        )
      ) : !hasTrueRoadmaps ? (
        roadmapEmptyContent
      ) : (
        <div
          className={`${GOAL_REVEAL_CLASS} ${GOAL_GRID_MIN_HEIGHT_CLASS} space-y-3.5 sm:space-y-4`}
        >
          {monumentRoadmapsWithItems.map((roadmap) => (
            <div key={roadmap.id} className="goal-card-wrapper">
              <MixedRoadmapCard
                roadmap={roadmap}
                variant="compact"
                defaultOpen
                onGoalOpen={handleRoadmapGoalOpen}
                onReorderSaved={refreshTrueRoadmaps}
                enableCampaignCollapse
              />
            </div>
          ))}
          {openRoadmapGoalCard}
        </div>
      );

    const renderGoalsPanel = (section: GoalPanel) => {
      const campaignGroupsForGoalGrid =
        resolvedSourceType === "circle"
          ? getCircleCampaignGroupsForGoalGrid(section)
          : getCampaignGroupsForGoalGrid(section);
      const filteredStandaloneGoals = standaloneGoals.filter((goal) =>
        filterGoalBySection(goal, section)
      );
      const openRoadmapGoalForSection =
        roadmapOpenGoal &&
        openGoalId === roadmapOpenGoal.id &&
        filterGoalBySection(roadmapOpenGoal, section)
          ? roadmapOpenGoal
          : null;

      if (
        campaignGroupsForGoalGrid.length === 0 &&
        filteredStandaloneGoals.length === 0 &&
        !openRoadmapGoalForSection
      ) {
        const emptyStateClassName =
          resolvedSourceType === "circle" && section === "completed"
            ? "rounded-2xl border border-white/[0.06] bg-[#151515] p-4 text-center text-sm text-zinc-500 shadow-[0_6px_24px_rgba(0,0,0,0.35)]"
            : "rounded-2xl border border-white/5 bg-[#111520] p-4 text-center text-sm text-[#A7B0BD] shadow-[0_6px_24px_rgba(0,0,0,0.35)]";

        return (
          <Card className={emptyStateClassName}>
            {section === "completed"
              ? `No completed goals linked to this ${ownerLabel} yet.`
              : `No active goals linked to this ${ownerLabel} yet.`}
          </Card>
        );
      }

      return (
        <div className={goalGridClass}>
          {campaignGroupsForGoalGrid.map(
            ({ roadmap, goals: roadmapGoalsList, goalCount }) => (
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
                  onProjectUpdated={handleProjectUpdated}
                  onGoalManualComplete={handleManualGoalComplete}
                  // Opens the Campaign Drawer ADD GOAL flow through the shared FAB creation request.
                  onAddGoal={handleCampaignAddGoal}
                  onCampaignDetailsSaved={() =>
                    setRefreshVersion((current) => current + 1)
                  }
                  restoreOpen={restoreCampaignDrawerId === roadmap.id}
                  restoreOpenGoalId={
                    restoreCampaignDrawerId === roadmap.id
                      ? restoreCampaignGoalId
                      : null
                  }
                  newGoalRevealId={
                    newCampaignGoalReveal?.campaignId === roadmap.id
                      ? newCampaignGoalReveal.goalId
                      : null
                  }
                  newProjectReveal={
                    newProjectReveal?.campaignId === roadmap.id
                      ? newProjectReveal
                      : null
                  }
                  onNewGoalRevealComplete={(goalId) =>
                    handleNewCampaignGoalRevealComplete(roadmap.id, goalId)
                  }
                  onNewProjectRevealComplete={handleNewProjectRevealComplete}
                  monumentContext
                  suppressReadyToast
                />
              </div>
            )
          )}

          {openRoadmapGoalForSection ? (
            <div
              className="goal-card-wrapper relative z-0 mb-0 min-w-0 w-full overflow-visible opacity-80"
              data-monument-goal-card-id={openRoadmapGoalForSection.id}
            >
              <GoalCard
                goal={openRoadmapGoalForSection}
                showWeight={false}
                showCreatedAt={false}
                showEmojiPrefix={false}
                variant="compact"
                monumentContext
                completeWhenProjectsDone
                completionTheme="border"
                suppressReadyToast
                onEdit={() => handleGoalEdit(openRoadmapGoalForSection)}
                onGoalLongPressEdit={handleGoalLongPressEdit}
                onProjectUpdated={(projectId, updates) =>
                  handleProjectUpdated(
                    openRoadmapGoalForSection.id,
                    projectId,
                    updates
                  )
                }
                onProjectDeleted={(projectId) =>
                  handleProjectDeleted(openRoadmapGoalForSection.id, projectId)
                }
                onProjectEditOpen={(target, project, origin) =>
                  handleProjectEditOpen(
                    target,
                    project.id,
                    openRoadmapGoalForSection.id,
                    origin
                  )
                }
                onTaskEditOpen={handleTaskEditOpen}
                onTaskToggleCompletion={handleTaskToggleCompletion}
                onManualComplete={handleManualGoalComplete}
                open
                newProjectRevealId={
                  newProjectReveal?.goalId === openRoadmapGoalForSection.id &&
                  !newProjectReveal.campaignId
                    ? newProjectReveal.projectId
                    : null
                }
                onNewProjectRevealComplete={(projectId) =>
                  handleNewProjectRevealComplete(
                    openRoadmapGoalForSection.id,
                    projectId
                  )
                }
                suppressDrawerOpenAnimation={
                  restoreGoalDrawerId === openRoadmapGoalForSection.id
                }
                onOpenChange={(isOpen) => {
                  handleGoalOpenChange(openRoadmapGoalForSection.id, isOpen);
                  if (!isOpen) setRoadmapOpenGoal(null);
                }}
              />
            </div>
          ) : null}

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
                completeWhenProjectsDone
                completionTheme="border"
                suppressReadyToast
                onEdit={() => handleGoalEdit(goal)}
                onGoalLongPressEdit={handleGoalLongPressEdit}
                onProjectUpdated={(projectId, updates) =>
                  handleProjectUpdated(goal.id, projectId, updates)
                }
                onProjectDeleted={(projectId) =>
                  handleProjectDeleted(goal.id, projectId)
                }
                onProjectEditOpen={(target, project, origin) =>
                  handleProjectEditOpen(target, project.id, goal.id, origin)
                }
                onTaskEditOpen={handleTaskEditOpen}
                onTaskToggleCompletion={handleTaskToggleCompletion}
                onManualComplete={handleManualGoalComplete}
                open={openGoalId === goal.id}
                newProjectRevealId={
                  newProjectReveal?.goalId === goal.id &&
                  !newProjectReveal.campaignId
                    ? newProjectReveal.projectId
                    : null
                }
                onNewProjectRevealComplete={(projectId) =>
                  handleNewProjectRevealComplete(goal.id, projectId)
                }
                suppressDrawerOpenAnimation={restoreGoalDrawerId === goal.id}
                onOpenChange={(isOpen) => handleGoalOpenChange(goal.id, isOpen)}
              />
            </div>
          ))}
        </div>
      );
    };

    const goalsContent = (
      <section className={`${GOAL_REVEAL_CLASS} space-y-3`}>
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35">
              Goal Library
            </p>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/38">
              {activeGoalPanel === "completed" ? "COMPLETED" : "ACTIVE"}
            </p>
            {renderGoalCardDensityToggle()}
          </div>
        </div>
        <div
          className="relative w-full overflow-hidden touch-pan-y transition-[height] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={goalPanelHeight ? { height: goalPanelHeight } : undefined}
          onPointerDown={handleGoalPanelPointerDown}
          onPointerUp={handleGoalPanelPointerEnd}
          onTouchStart={handleGoalPanelTouchStart}
          onTouchMove={handleGoalPanelTouchMove}
          onTouchEnd={handleGoalPanelTouchEnd}
          onTouchCancel={resetGoalPanelTouch}
          onWheel={handleGoalPanelWheel}
          onPointerCancel={() => {
            goalPanelDragStartRef.current = null;
          }}
        >
          <div
            ref={goalPanelViewportRef}
            className="absolute inset-0"
          >
            <div
              className="flex h-full w-[200%] transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{
                transform: `translate3d(${goalPanelTrackTransform}px, 0, 0)`,
                transitionDuration:
                  !goalPanelTransitionEnabled || goalPanelDragOffset
                    ? "0ms"
                    : undefined,
              }}
            >
              <div className="h-full w-1/2 shrink-0 overflow-hidden">
                <div
                  ref={activeGoalPanelRef}
                  className={GOAL_PANEL_CONTENT_CLASS}
                >
                  {renderGoalsPanel("active")}
                </div>
              </div>
              <div className="h-full w-1/2 shrink-0 overflow-hidden">
                <div
                  ref={completedGoalPanelRef}
                  className={GOAL_PANEL_CONTENT_CLASS}
                >
                  {renderGoalsPanel("completed")}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center gap-1.5">
          {(["active", "completed"] as const).map((panel) => {
            const isActive = activeGoalPanel === panel;
            return (
              <button
                key={panel}
                type="button"
                aria-label={
                  panel === "active"
                    ? "Show active goals"
                    : "Show completed goals"
                }
                aria-current={isActive ? "true" : undefined}
                onClick={() => handleGoalPanelChange(panel)}
                className={`h-1.5 rounded-full transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isActive
                    ? "w-5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.28)]"
                    : "w-1.5 bg-white/24 hover:bg-white/40"
                }`}
              />
            );
          })}
        </div>
      </section>
    );

    return renderGoalsRoadmapViewport(goalsContent, roadmapContent);
  }, [
    goalsGridLoading,
    goals,
    goalCampaignCards,
    goalsRoadmapViewHeight,
    goalsRoadmapViewportWidth,
    goalsRoadmapTrackTransform,
    goalsRoadmapViewIndex,
    roadmapEmptyState,
    monumentRoadmapsWithItems,
    visibleMonumentPriorityRoadmapItems,
    monumentPriorityRoadmapError,
    isSavingMonumentPriorityOrder,
    monumentPriorityRoadmapSensors,
    roadmapOpenGoal,
    restoreGoalDrawerId,
    restoreCampaignDrawerId,
    restoreCampaignGoalId,
    newCampaignGoalReveal?.campaignId,
    newCampaignGoalReveal?.goalId,
    newProjectReveal,
    recentlyCompletedGoalIds,
    activeGoalPanel,
    goalGridClass,
    goalPanelHeight,
    isSmallGoalCardDensity,
    openGoalId,
    renderGoalCardDensityToggle,
    handleGoalEdit,
    handleGoalLongPressEdit,
    handleManualGoalComplete,
    handleGoalOpenChange,
    handleCampaignAddGoal,
    handleNewCampaignGoalRevealComplete,
    handleNewProjectRevealComplete,
    handleRoadmapGoalEdit,
    handleRoadmapGoalOpen,
    handleMonumentPriorityGoalLongPressEdit,
    handleMonumentPriorityDragEnd,
    handleMonumentCampaignGoalDragEnd,
    handleProjectEditOpen,
    handleTaskEditOpen,
    handleTaskToggleCompletion,
    handleProjectUpdated,
    handleProjectDeleted,
    refreshTrueRoadmaps,
    handleGoalPanelChange,
    handleGoalPanelPointerDown,
    handleGoalPanelPointerEnd,
    handleGoalPanelTouchStart,
    handleGoalPanelTouchMove,
    handleGoalPanelTouchEnd,
    resetGoalPanelTouch,
    handleGoalPanelWheel,
    goalPanelDragOffset,
    goalPanelTrackTransform,
    goalPanelTransitionEnabled,
    ownerLabel,
    decorate,
    monumentEmoji,
    resolvedMonumentId,
    resolvedSourceId,
    resolvedSourceType,
    isGoalLinkedToCurrentSource,
    isRoadmapGoalLinkedToCurrentSource,
  ]);

  return (
    <div className="monument-goals-list">
      {content}
      <LazyFab
        editTarget={fabEditTarget}
        onEditTargetChange={(target) => setFabEditTarget(target)}
        onEditClose={() => setFabEditTarget(null)}
        onEditSaved={() => setRefreshVersion((current) => current + 1)}
        hideLauncher
        portalToBody
      />
      <style jsx global>{`
        @keyframes monumentGoalReveal {
          from {
            opacity: 0;
            transform: translateY(2px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .monument-goals-list .monument-goal-reveal {
          animation: monumentGoalReveal 150ms ease-out both;
        }
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
        @media (prefers-reduced-motion: reduce) {
          .monument-goals-list .monument-goal-reveal {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
export default MonumentGoalsList;
