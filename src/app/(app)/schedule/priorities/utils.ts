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
  "ULTRA-CRITICAL": "Ultra-Critical",
};

export const STAGE_ORDER = ["RESEARCH", "BUILD", "TEST", "REFINE", "RELEASE"] as const;
export type StageId = (typeof STAGE_ORDER)[number];

export type PriorityProject = {
  id: string;
  name: string;
  priority: PriorityBucketId;
  stage?: string | null;
  globalRank?: number;
};

export type PriorityGoal = {
  id: string;
  name: string;
  priority: PriorityBucketId;
  stage?: string | null;
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
