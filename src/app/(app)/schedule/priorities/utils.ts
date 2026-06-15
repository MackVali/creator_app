export const PRIORITY_ORDER = [
  "ULTRA-CRITICAL",
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "NO",
] as const;

export type PriorityBucketId = (typeof PRIORITY_ORDER)[number];

export const PRIORITY_LABELS: Record<PriorityBucketId, string> = {
  NO: "No Priority",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
  "ULTRA-CRITICAL": "Ultra",
};

export const STAGE_ORDER = ["RESEARCH", "BUILD", "TEST", "REFINE", "RELEASE"] as const;
export type StageId = (typeof STAGE_ORDER)[number];

export type PriorityProject = {
  id: string;
  name: string;
  priority: PriorityBucketId;
  stage?: string | null;
  globalRank?: number;
  emoji?: string | null;
};

export type PriorityGoal = {
  id: string;
  name: string;
  priority: PriorityBucketId;
  stage?: string | null;
  emoji?: string | null;
  globalRank?: number;
  priorityRank?: number;
};

export type RoadmapPriorityGoal = {
  id: string;
  name: string;
  emoji?: string | null;
  monumentEmoji?: string | null;
  priority: PriorityBucketId;
  status?: string | null;
  globalRank?: number;
  priorityRank?: number;
};

export type RoadmapPriorityCampaign = {
  id: string;
  name: string;
  emoji?: string | null;
  description?: string | null;
  schedulingState?: string | null;
  position?: number;
  goals: RoadmapPriorityGoal[];
};

export type RoadmapPriorityItem =
  | {
      id: string;
      type: "goal";
      position: number;
      goal: RoadmapPriorityGoal;
    }
  | {
      id: string;
      type: "campaign";
      position: number;
      campaign: RoadmapPriorityCampaign;
    };

export type MonumentRoadmapPriority = {
  id: string;
  monumentId: string;
  monumentName: string;
  monumentEmoji?: string | null;
  monumentPriorityRank?: number;
  monumentCreatedAt?: string | null;
  roadmapId?: string | null;
  roadmapTitle?: string | null;
  roadmapEmoji?: string | null;
  items: RoadmapPriorityItem[];
  goalCount: number;
  campaignCount: number;
};

export function normalizeStage(value?: string | null): StageId | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return STAGE_ORDER.includes(normalized as StageId) ? (normalized as StageId) : null;
}

export function normalizePriority(value?: string | null): PriorityBucketId {
  if (!value) return "NO";
  const normalized = value.trim().toUpperCase();
  if (PRIORITY_ORDER.includes(normalized as PriorityBucketId)) {
    return normalized as PriorityBucketId;
  }
  return "NO";
}

export function parseGlobalRank(value?: number | string | null): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function formatEnumLabel(value?: string | null): string | null {
  if (!value) return null;
  const fragments = value
    .toLowerCase()
    .split(/[\s_-]+/)
    .map((segment) => (segment.length === 0 ? "" : segment[0].toUpperCase() + segment.slice(1)));
  return fragments.join(" ").trim() || null;
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

export function sortRoadmapItems(items: RoadmapPriorityItem[]): RoadmapPriorityItem[] {
  return [...items].sort((a, b) => {
    if (a.position !== b.position) {
      return a.position - b.position;
    }

    const aGoal = a.type === "goal" ? a.goal : a.campaign.goals[0];
    const bGoal = b.type === "goal" ? b.goal : b.campaign.goals[0];
    const priorityRankDelta = compareRankValues(aGoal?.priorityRank, bGoal?.priorityRank);
    if (priorityRankDelta !== 0) return priorityRankDelta;

    return compareRankValues(aGoal?.globalRank, bGoal?.globalRank);
  });
}
