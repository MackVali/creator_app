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
import {
  projectWeight,
  taskWeight,
  type TaskLite,
  type ProjectLite,
} from "@/lib/scheduler/weight";
import { getSkillsForUser } from "@/lib/queries/skills";
import {
  ensureMonumentGoalsInTrueRoadmap,
  listRoadmapsWithItems,
  type Roadmap,
  type RoadmapCampaign,
  type RoadmapCampaignGoal,
  type RoadmapGoal,
  type RoadmapMixedItem,
  type RoadmapWithItems,
} from "@/lib/queries/roadmaps";
import { computeGoalWeight } from "@/lib/goals/weight";
import { normalizeGoalStatus } from "@/lib/goals/status";

type GoalRowWithRelations = GoalRow & {
  circle_id?: string | null;
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
};

type GoalPanel = "active" | "completed";
type GoalPanelSwipeAxis = "horizontal" | "vertical" | null;

const GOAL_RELATIONS_BASE_SELECT =
  "id, name, priority, energy, priority_code, energy_code, why, created_at, active, status, monument_id, circle_id, roadmap_id, weight, weight_boost, due_date, emoji, priority_rank";
const GOAL_RELATIONS_SELECT = `
  ${GOAL_RELATIONS_BASE_SELECT},
  projects (
    id, name, goal_id, stage, completed_at, duration_min, created_at, due_date,
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
const GOAL_GRID_CLASS =
  "goal-grid grid w-full max-w-full grid-cols-[repeat(auto-fit,_minmax(110px,_1fr))] gap-1 px-0.5 sm:grid-cols-3 sm:px-2 sm:gap-1 md:grid-cols-4 md:-mx-3 md:px-3 lg:grid-cols-5 xl:grid-cols-6";
const GOAL_GRID_MIN_HEIGHT_CLASS = "min-h-[240px] sm:min-h-[260px]";
const GOAL_PANEL_CONTENT_CLASS = "px-1 py-1 sm:px-1.5 sm:py-1.5";
const GOAL_REVEAL_CLASS = "monument-goal-reveal";

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
      `${ownerLabel} goal fetch variant failed (${variant.description}):`,
      error
    );
  }

  console.warn(`Falling back to basic ${sourceType} goal fetch`);

  const fallback = await runQuery(GOAL_RELATIONS_BASE_SELECT);
  if (fallback.error) {
    console.error(`Error fetching ${sourceType} goals:`, fallback.error);
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
  return (
    normalizeGoalStatus(goal.status) === "COMPLETED" ||
    goal.allProjectsCompleted === true
  );
}

type GoalProjectForCompletion = Project & {
  completedAt?: string | null;
};

function isProjectCompletedForGoalSection(
  project: GoalProjectForCompletion
): boolean {
  return (
    (typeof project.completedAt === "string" &&
      project.completedAt.trim().length > 0) ||
    isProjectStageComplete(project.stage)
  );
}

function isGoalCompletedForSection(goal: Goal): boolean {
  if (normalizeGoalStatus(goal.status) === "COMPLETED") {
    return true;
  }

  return (
    goal.projects.length > 0 &&
    goal.projects.every(isProjectCompletedForGoalSection)
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
  const roadmapIdSet = new Set(roadmapIds);

  const [
    legacyGoalsResult,
    roadmapItemsResult,
    campaignsResult,
  ] = await Promise.all([
    supabase
      .from("goals")
      .select(
        "id, name, emoji, roadmap_id, status, global_rank, priority_rank, monument:monuments(emoji)"
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
            "id, name, emoji, roadmap_id, status, global_rank, priority_rank, monument:monuments(emoji)"
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
  const campaignGoalIds = Array.from(
    new Set(campaignGoalRows.map((row) => row.goal_id).filter(Boolean))
  );

  const campaignGoalGoalsResult =
    campaignGoalIds.length > 0
      ? await supabase
          .from("goals")
          .select(
            "id, name, emoji, roadmap_id, status, global_rank, priority_rank, monument:monuments(emoji)"
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

  const campaignGoalsByCampaignId = new Map<string, RoadmapCampaignGoal[]>();
  for (const campaignGoal of campaignGoalRows) {
    const goal = campaignGoalsByGoalId.get(campaignGoal.goal_id);
    if (!goal || isRoadmapDisplayGoalCompleted(goal)) continue;
    const goals = campaignGoalsByCampaignId.get(campaignGoal.campaign_id) ?? [];
    goals.push({
      id: goal.id,
      name: goal.name,
      emoji: goal.emoji ?? null,
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
  const itemCampaignIds = new Set<string>();
  const itemGoalIds = new Set<string>();

  for (const item of roadmapItems) {
    if (item.campaign_id) itemCampaignIds.add(item.campaign_id);
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

  for (const campaign of campaignsById.values()) {
    if (itemCampaignIds.has(campaign.id)) continue;
    const roadmapId =
      campaign.roadmap_id && roadmapIdSet.has(campaign.roadmap_id)
        ? campaign.roadmap_id
        : roadmaps[0]?.id;
    if (!roadmapId) continue;
    const items = itemsByRoadmapId.get(roadmapId) ?? [];
    items.push({
      id: `circle-campaign-${campaign.id}`,
      roadmap_id: roadmapId,
      item_type: "CAMPAIGN",
      position: campaign.position ?? items.length + 1,
      campaign,
      goal: null,
    });
    itemsByRoadmapId.set(roadmapId, items);
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
    legacyGoals.forEach((goal, index) => {
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
        return !isRoadmapDisplayGoalCompleted(item.goal);
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
  const resolvedMonumentId =
    resolvedSourceType === "monument" ? resolvedSourceId : null;
  const ownerLabel = resolvedSourceType === "circle" ? "Circle" : "monument";
  const creationContext = useFabCreation();
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [monumentRoadmapsWithItems, setMonumentRoadmapsWithItems] = useState<
    RoadmapWithItems[]
  >([]);
  const [openGoalId, setOpenGoalId] = useState<string | null>(null);
  const [roadmapOpenGoal, setRoadmapOpenGoal] = useState<Goal | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [fabEditTarget, setFabEditTarget] = useState<FabEditTarget | null>(
    null
  );
  const [activeGoalPanel, setActiveGoalPanel] = useState<GoalPanel>("active");
  const [goalPanelHeight, setGoalPanelHeight] = useState<number | null>(null);
  const [goalPanelDragOffset, setGoalPanelDragOffset] = useState(0);
  const [goalPanelViewportWidth, setGoalPanelViewportWidth] = useState(0);
  const [goalPanelTransitionEnabled, setGoalPanelTransitionEnabled] =
    useState(false);
  const [goalsRoadmapViewportWidth, setGoalsRoadmapViewportWidth] = useState(0);
  const [goalsRoadmapViewHeight, setGoalsRoadmapViewHeight] = useState<
    number | null
  >(null);
  const deferredGoalCloseFrameRef = useRef<number | null>(null);
  const goalsRoadmapViewportRef = useRef<HTMLDivElement | null>(null);
  const goalsViewPanelRef = useRef<HTMLDivElement | null>(null);
  const roadmapViewPanelRef = useRef<HTMLDivElement | null>(null);
  const goalPanelViewportRef = useRef<HTMLDivElement | null>(null);
  const activeGoalPanelRef = useRef<HTMLDivElement | null>(null);
  const completedGoalPanelRef = useRef<HTMLDivElement | null>(null);
  const loadingGoalPanelRef = useRef<HTMLDivElement | null>(null);
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

  const measureActiveGoalPanel = useCallback(() => {
    const nextHeight = loading
      ? getLoadingGoalPanelHeight()
      : getGoalPanelHeight(activeGoalPanel);
    if (!nextHeight) return;

    setGoalPanelHeight((currentHeight) =>
      currentHeight === nextHeight ? currentHeight : nextHeight
    );
  }, [activeGoalPanel, getGoalPanelHeight, getLoadingGoalPanelHeight, loading]);

  useLayoutEffect(() => {
    if (monumentView !== "goals") {
      return;
    }

    measureActiveGoalPanel();
  }, [
    activeGoalPanel,
    goals,
    loading,
    measureActiveGoalPanel,
    monumentRoadmapsWithItems,
    monumentView,
    openGoalId,
    roadmapOpenGoal,
  ]);

  useEffect(() => {
    if (monumentView !== "goals") return;

    const activePanel = loading
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
  }, [activeGoalPanel, loading, measureActiveGoalPanel, monumentView]);

  useLayoutEffect(() => {
    measureSelectedGoalsRoadmapPanel();
  }, [
    activeGoalPanel,
    goalPanelHeight,
    goals,
    loading,
    measureSelectedGoalsRoadmapPanel,
    monumentRoadmapsWithItems,
    openGoalId,
    roadmapOpenGoal,
    goalsRoadmapViewportWidth,
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
    setRoadmapOpenGoal(null);
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
    const trueRoadmaps =
      resolvedSourceType === "circle"
        ? await fetchTrueRoadmapsForCircle(user.id, resolvedSourceId)
        : await fetchTrueRoadmapsForMonument(user.id, resolvedSourceId, {
            reconcile: true,
          });
    setMonumentRoadmapsWithItems(trueRoadmaps);
  }, [resolvedSourceId, resolvedSourceType]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleCreatorEntitySaved = (event: Event) => {
      const detail = (event as CustomEvent<{ entityType?: string }>).detail;
      if (detail?.entityType !== "GOAL") {
        return;
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
  }, []);

  useEffect(() => {
    const load = async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase || !resolvedSourceId) {
        setMonumentRoadmapsWithItems([]);
        setGoals([]);
        setLoading(false);
        return;
      }
      setLoading(true);
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

        const [rows, skills, trueMonumentRoadmaps] = await Promise.all([
          fetchGoalsWithRelationsForSource(
            resolvedSourceType,
            resolvedSourceId,
            user.id
          ),
          getSkillsForUser(user.id).catch(() => []),
          resolvedSourceType === "circle"
            ? fetchTrueRoadmapsForCircle(user.id, resolvedSourceId)
            : fetchTrueRoadmapsForMonument(user.id, resolvedSourceId, {
                reconcile: true,
              }),
        ]);

        setMonumentRoadmapsWithItems(trueMonumentRoadmaps);

        // Prepare skill emoji resolver before mapping any goals (used in both roadmap + standalone mappings)
        const skillIconLookup = new Map(
          skills.map((skill) => [skill.id, skill.icon ?? null])
        );

        const mapped: Goal[] = rows.map((g) =>
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
        console.error(`Error loading ${resolvedSourceType} goals`, err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [
    resolvedSourceId,
    resolvedSourceType,
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

  const handleCampaignAddGoal = useCallback(() => {
    creationContext?.requestGoalCreation(null);
  }, [creationContext]);

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
    if (
      !goals.some((goal) => goal.id === openGoalId) &&
      roadmapOpenGoal?.id !== openGoalId
    ) {
      setOpenGoalId(null);
      setRoadmapOpenGoal(null);
    }
  }, [goals, openGoalId, roadmapOpenGoal]);

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

    if (loading) {
      const loadingGoalsContent = (
        <section className={`${GOAL_REVEAL_CLASS} space-y-3`}>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35">
                Goal Library
              </p>
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/38">
              {activeGoalPanel === "completed" ? "COMPLETED" : "ACTIVE"}
            </p>
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
                className={`${GOAL_GRID_CLASS} ${GOAL_GRID_MIN_HEIGHT_CLASS}`}
              >
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className="h-[100px] rounded-2xl bg-white/[0.06]"
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
      );
      const loadingRoadmapContent = (
        <div className={`${GOAL_GRID_CLASS} ${GOAL_GRID_MIN_HEIGHT_CLASS}`}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-[100px] rounded-2xl bg-white/[0.06]"
            />
          ))}
        </div>
      );

      return renderGoalsRoadmapViewport(
        loadingGoalsContent,
        loadingRoadmapContent
      );
    }

    const filterGoalBySection = (goal: Goal, section: GoalPanel) =>
      section === "completed"
        ? isGoalCompletedForSection(goal)
        : !isGoalCompletedForSection(goal);
    const filterRoadmapGoalBySection = (
      goal: {
        status?: string | null;
        allProjectsCompleted?: boolean;
      },
      section: GoalPanel
    ) => {
      const isCompleted =
        normalizeGoalStatus(goal.status) === "COMPLETED" ||
        goal.allProjectsCompleted === true;
      return section === "completed" ? isCompleted : !isCompleted;
    };

    const campaignGoalIds = new Set<string>(
      monumentRoadmapsWithItems.flatMap((roadmap) =>
        roadmap.items.flatMap((item) =>
          item.campaign?.goals.map((goal) => goal.id) ?? []
        )
      )
    );
    const goalsById = new Map(goals.map((goal) => [goal.id, goal]));
    const buildCampaignDisplayGoal = (
      campaignGoal: RoadmapCampaignGoal,
      campaign: RoadmapCampaign
    ): Goal => {
      const fullGoal = goalsById.get(campaignGoal.id);
      if (fullGoal) {
        return fullGoal;
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
        priorityRank: campaignGoal.priority_rank ?? campaignGoal.position,
      });
    };
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

              const filteredGoals = campaign.goals.filter((goal) =>
                filterRoadmapGoalBySection(goal, section)
              );
              if (filteredGoals.length === 0) {
                return null;
              }

              const displayGoals = filteredGoals.map((goal) =>
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
                goals: filteredGoals.map((goal) => ({
                  id: goal.id,
                  name: goal.name,
                  emoji: goal.emoji ?? null,
                  monumentEmoji: goal.monumentEmoji ?? null,
                  roadmap_id: campaign.roadmap_id ?? roadmap.id,
                  status: goal.status ?? null,
                  allProjectsCompleted: goal.allProjectsCompleted,
                  global_rank: goal.global_rank ?? null,
                  priority_rank: goal.priority_rank ?? goal.position ?? null,
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
    const standaloneGoals = goals.filter((goal) => !campaignGoalIds.has(goal.id));

    const hasTrueRoadmaps = monumentRoadmapsWithItems.length > 0;

    const roadmapContent = !hasTrueRoadmaps ? (
      roadmapEmptyState ?? (
        <Card className="rounded-2xl border border-white/5 bg-[#111520] p-4 text-center text-sm text-[#A7B0BD] shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
          No true roadmap linked to this {ownerLabel} yet.
        </Card>
      )
    ) : (
      <div
        className={`${GOAL_REVEAL_CLASS} ${GOAL_GRID_MIN_HEIGHT_CLASS} space-y-3.5 sm:space-y-4`}
      >
        {monumentRoadmapsWithItems.map((roadmap) => (
          <div
            key={roadmap.id}
            className="goal-card-wrapper"
          >
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
              completeWhenProjectsDone
              completionTheme="border"
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
              onTaskEditOpen={handleTaskEditOpen}
              onTaskToggleCompletion={handleTaskToggleCompletion}
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

    const renderGoalsPanel = (section: GoalPanel) => {
      const campaignGroupsForGoalGrid = getCampaignGroupsForGoalGrid(section);
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
        return (
          <Card className="rounded-2xl border border-white/5 bg-[#111520] p-4 text-center text-sm text-[#A7B0BD] shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
            {section === "completed"
              ? `No completed goals linked to this ${ownerLabel} yet.`
              : `No active goals linked to this ${ownerLabel} yet.`}
          </Card>
        );
      }

      return (
        <div className={GOAL_GRID_CLASS}>
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
                  // Opens the Campaign Drawer ADD GOAL flow through the shared FAB creation request.
                  onAddGoal={handleCampaignAddGoal}
                  monumentContext
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
                onEdit={() => handleGoalEdit(openRoadmapGoalForSection)}
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
                open
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
                onTaskEditOpen={handleTaskEditOpen}
                onTaskToggleCompletion={handleTaskToggleCompletion}
                open={openGoalId === goal.id}
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
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/38">
            {activeGoalPanel === "completed" ? "COMPLETED" : "ACTIVE"}
          </p>
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
    loading,
    goals,
    monumentView,
    goalsRoadmapViewHeight,
    goalsRoadmapViewportWidth,
    goalsRoadmapTrackTransform,
    goalsRoadmapViewIndex,
    roadmapEmptyState,
    monumentRoadmapsWithItems,
    roadmapOpenGoal,
    activeGoalPanel,
    goalPanelHeight,
    openGoalId,
    handleGoalEdit,
    handleGoalOpenChange,
    handleCampaignAddGoal,
    handleRoadmapGoalEdit,
    handleRoadmapGoalOpen,
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
