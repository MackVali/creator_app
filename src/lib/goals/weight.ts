import type { Goal } from "@/app/(app)/goals/types";

function normalizePriorityCode(code?: string | null): string {
  if (typeof code !== "string") return "NO";
  return code.toUpperCase();
}

export function computeGoalWeight(goal: Goal): number {
  const projectWeightSum = goal.projects.reduce(
    (sum, project) => sum + (project.weight ?? 0),
    0
  );
  const hasRoadmapOrder =
    goal.roadmapId &&
    typeof goal.priorityRank === "number" &&
    Number.isFinite(goal.priorityRank) &&
    goal.priorityRank > 0;
  const roadmapPositionBand = hasRoadmapOrder
    ? Math.min(9, Math.max(0, goal.priorityRank - 1))
    : 9;
  const priorityCode = normalizePriorityCode(goal.priorityCode);
  const priorityBand =
    priorityCode === "ULTRA-CRITICAL"
      ? 0
      : priorityCode === "CRITICAL"
      ? 1
      : priorityCode === "HIGH"
      ? 2
      : priorityCode === "MEDIUM"
      ? 3
      : priorityCode === "LOW"
      ? 4
      : 5;
  const roadmapMembershipBand = goal.roadmapId ? 0 : 1;
  const projectBand = Math.max(
    0,
    99 - Math.min(99, Math.floor(projectWeightSum / 10))
  );
  return (
    roadmapPositionBand * 10000 +
    priorityBand * 1000 +
    roadmapMembershipBand * 100 +
    projectBand
  );
}
