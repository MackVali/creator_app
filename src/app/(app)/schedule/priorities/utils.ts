import type { FlameLevel } from "@/components/FlameEmber";

export const PRIORITY_ORDER = [
  "ULTRA-CRITICAL",
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "NO",
] as const;

export type PriorityBucketId = (typeof PRIORITY_ORDER)[number];

export const DEFAULT_CAMPAIGN_PRIORITY: PriorityBucketId = "HIGH";

export const PRIORITY_LABELS: Record<PriorityBucketId, string> = {
  NO: "No Priority",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
  "ULTRA-CRITICAL": "Ultra",
};

export const HABIT_TYPE_ORDER = ["CHORE", "HABIT", "SYNC", "PRACTICE"] as const;

export type HabitBucketId = (typeof HABIT_TYPE_ORDER)[number];

export const HABIT_TYPE_LABELS: Record<HabitBucketId, string> = {
  CHORE: "CHORES",
  HABIT: "HABITS",
  SYNC: "SYNC",
  PRACTICE: "PRACTICE",
};

export type RoadmapPriorityGoal = {
  id: string;
  name: string;
  emoji?: string | null;
  monumentId?: string | null;
  monumentName?: string | null;
  monumentIcon?: string | null;
  monumentEmoji?: string | null;
  skills?: RoadmapFilterOptionData[];
  priority: PriorityBucketId;
  status?: string | null;
  globalRank?: number;
  priorityOrder?: number;
  priorityRank?: number;
  campaignPosition?: number;
  campaignGoalCreatedAt?: string | null;
  createdAt?: string | null;
  projects?: RoadmapPriorityProject[];
};

export type RoadmapPriorityProject = {
  id: string;
  name: string;
  emoji?: string | null;
  skillId?: string | null;
  skillName?: string | null;
  skillIcon?: string | null;
  skillMonumentId?: string | null;
  skillIds?: string[];
  skillMonumentIds?: string[];
  taskSkillIds?: Array<string | null>;
  priority?: PriorityBucketId;
  energy?: string | null;
  stage?: string | null;
  completedAt?: string | null;
  globalRank?: number;
  createdAt?: string | null;
  tasks?: RoadmapPriorityTask[];
};

export type RoadmapPriorityTask = {
  id: string;
  name: string;
  skillId?: string | null;
  skillName?: string | null;
  skillIcon?: string | null;
  skillMonumentId?: string | null;
  priority?: PriorityBucketId;
  energy?: string | null;
  stage?: string | null;
  completedAt?: string | null;
  durationMin?: number | null;
  createdAt?: string | null;
};

export type RoadmapPriorityCampaign = {
  id: string;
  name: string;
  emoji?: string | null;
  description?: string | null;
  monumentId?: string | null;
  monumentName?: string | null;
  monumentIcon?: string | null;
  priority: PriorityBucketId;
  schedulingState?: string | null;
  position?: number;
  goals: RoadmapPriorityGoal[];
};

export type RoadmapFilterOptionData = {
  id?: string | null;
  name?: string | null;
  icon?: string | null;
};

export type UserPriorityFilterOptionData = {
  id: string;
  name: string;
  icon: string | null;
  categoryId?: string | null;
  sortOrder?: number | null;
};

export type UserPrioritySkillCategoryData = {
  id: string;
  name: string;
  sortOrder?: number | null;
};

export type PriorityTimeBlockFilterOptionData = {
  id: string;
  name: string;
  detail?: string | null;
  energy: FlameLevel;
  blockType?: string | null;
  allowAllHabitTypes: boolean;
  allowAllSkills: boolean;
  allowAllMonuments: boolean;
  allowedHabitTypes: string[];
  allowedSkillIds: string[];
  allowedMonumentIds: string[];
};

export type GlobalPriorityRoadmapItem = {
  id: string;
  type: "goal" | "campaign";
  sourceIds?: string[];
  name: string;
  priority: PriorityBucketId;
  priorityOrder?: number;
  emoji?: string | null;
  monumentId?: string | null;
  monumentName?: string | null;
  monumentIcon?: string | null;
  monumentEmoji?: string | null;
  skills?: RoadmapFilterOptionData[];
  globalRank?: number;
  priorityRank?: number;
  position?: number;
  createdAt?: string | null;
  goals?: RoadmapPriorityGoal[];
  projects?: RoadmapPriorityProject[];
};

export type RoadmapHabitItem = {
  id: string;
  name: string;
  habitType: HabitBucketId;
  rawHabitType?: string | null;
  circleId?: string | null;
  globalOrder?: number;
  skillId?: string | null;
  skillName?: string | null;
  skillIcon?: string | null;
  skillMonumentId?: string | null;
  goalId?: string | null;
  goalMonumentId?: string | null;
  monumentId?: string | null;
  monumentName?: string | null;
  monumentIcon?: string | null;
  monumentEmoji?: string | null;
  routineId?: string | null;
  routinePosition?: number;
  durationMinutes?: number | null;
  energy?: string | null;
  recurrenceMode?: string | null;
  currentStreakDays?: number | null;
  lastCompletedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export function normalizePriority(value?: string | null): PriorityBucketId {
  if (!value) return "NO";
  const normalized = value.trim().toUpperCase();
  if (PRIORITY_ORDER.includes(normalized as PriorityBucketId)) {
    return normalized as PriorityBucketId;
  }
  return "NO";
}

export function normalizeCampaignPriority(
  value?: string | null
): PriorityBucketId {
  if (!value?.trim()) return DEFAULT_CAMPAIGN_PRIORITY;
  return normalizePriority(value);
}

export function normalizeHabitBucket(value?: string | null): HabitBucketId {
  const normalized = (value ?? "").trim().toUpperCase();
  if (normalized === "ASYNC") return "SYNC";
  if (HABIT_TYPE_ORDER.includes(normalized as HabitBucketId)) {
    return normalized as HabitBucketId;
  }
  return "HABIT";
}

export function parseGlobalRank(value?: number | string | null): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function compareRankValues(a?: number, b?: number): number {
  const normalize = (value?: number): number =>
    typeof value === "number" && Number.isFinite(value) && value > 0
      ? value
      : Number.POSITIVE_INFINITY;

  const aValue = normalize(a);
  const bValue = normalize(b);
  if (aValue === bValue) return 0;
  return aValue < bValue ? -1 : 1;
}

export function sortGlobalPriorityItems(
  items: GlobalPriorityRoadmapItem[]
): GlobalPriorityRoadmapItem[] {
  return [...items].sort((a, b) => {
    const priorityDelta =
      PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
    if (priorityDelta !== 0) return priorityDelta;

    const aRank =
      a.type === "campaign"
        ? a.priorityOrder
        : a.priorityOrder ?? a.priorityRank ?? a.globalRank;
    const bRank =
      b.type === "campaign"
        ? b.priorityOrder
        : b.priorityOrder ?? b.priorityRank ?? b.globalRank;
    const rankDelta = compareRankValues(aRank, bRank);
    if (rankDelta !== 0) return rankDelta;

    const createdDelta = (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
    if (createdDelta !== 0) return createdDelta;

    const typeDelta = a.type.localeCompare(b.type);
    if (typeDelta !== 0) return typeDelta;

    const idDelta = a.id.localeCompare(b.id);
    if (idDelta !== 0) return idDelta;

    return a.name.localeCompare(b.name);
  });
}

export function sortHabitRoadmapItems(
  items: RoadmapHabitItem[]
): RoadmapHabitItem[] {
  return [...items].sort((a, b) => {
    const typeDelta =
      HABIT_TYPE_ORDER.indexOf(a.habitType) - HABIT_TYPE_ORDER.indexOf(b.habitType);
    if (typeDelta !== 0) return typeDelta;

    const globalOrderDelta = compareRankValues(a.globalOrder, b.globalOrder);
    if (globalOrderDelta !== 0) return globalOrderDelta;

    const routinePositionDelta = compareRankValues(
      a.routinePosition,
      b.routinePosition
    );
    if (routinePositionDelta !== 0) return routinePositionDelta;

    const updatedDelta = (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
    if (updatedDelta !== 0) return updatedDelta;

    const createdDelta = (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
    if (createdDelta !== 0) return createdDelta;

    const idDelta = a.id.localeCompare(b.id);
    if (idDelta !== 0) return idDelta;

    return a.name.localeCompare(b.name);
  });
}
