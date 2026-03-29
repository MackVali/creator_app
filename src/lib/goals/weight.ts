import type { Goal } from "@/app/(app)/goals/types";

function normalizePriorityCode(code?: string | null): string {
  if (typeof code !== "string") return "NO";
  return code.toUpperCase();
}

export function computeGoalWeight(goal: Goal): number {
  const priorityDigit = priorityCodeToDigit(
    normalizePriorityCode(goal.priorityCode)
  );
  const hasRoadmap = Boolean(goal.roadmapId);
  const hasRoadmapOrder =
    hasRoadmap &&
    typeof goal.priorityRank === "number" &&
    Number.isFinite(goal.priorityRank) &&
    goal.priorityRank > 0;

  if (hasRoadmap && !hasRoadmapOrder) {
    const identifier = goal.name ?? goal.id ?? "unknown";
    throw new Error(
      `Roadmap goal ${identifier} must have a valid priorityRank.`
    );
  }

  let roadmapOrderLane: number;
  if (hasRoadmapOrder) {
    const rankBasedValue = 100 - (goal.priorityRank - 1);
    roadmapOrderLane = Math.max(0, Math.min(999, rankBasedValue));
  } else {
    roadmapOrderLane = 0;
  }

  const roadmapMembershipLane = hasRoadmap ? 1 : 0;

  // Structured strategic code, not a blended score: each digit lane stands for one facet.
  return (
    roadmapMembershipLane * 10000 +
    (roadmapOrderLane % 1000) * 10 +
    priorityDigit
  );
}

// Map normalized priority codes to a single-digit priority lane (lower digits == higher urgency).
function priorityCodeToDigit(code: string): number {
  // Deterministic lane: lower digits mean higher urgency.
  if (code === "ULTRA-CRITICAL") return 0;
  if (code === "CRITICAL") return 1;
  if (code === "HIGH") return 2;
  if (code === "MEDIUM") return 3;
  if (code === "LOW") return 4;
  return 5;
}
