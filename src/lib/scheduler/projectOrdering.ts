import type { ScheduleInstance } from "./instanceRepo";
import type { ProjectItem } from "./projects";

export type CanonicalGoalRecord = {
  global_rank?: number | null;
  globalRank?: number | null;
};

export type CanonicalProjectSource = Pick<
  ProjectItem,
  "id" | "priority" | "stage" | "goal_id"
>;

export type CanonicalProjectRecord = CanonicalProjectSource & {
  globalRank?: number | null;
  global_rank?: number | null;
};

type CanonicalProjectRankTuple = {
  goalGlobalRank: number | null;
  priorityStrength: number;
  stageStrength: number;
  id: string;
};

export function normalizeGoalGlobalRank(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

export function getPriorityIndex(priority: string): number {
  const priorityMap: Record<string, number> = {
    "ULTRA-CRITICAL": 6,
    CRITICAL: 5,
    HIGH: 4,
    MEDIUM: 3,
    LOW: 2,
    NO: 1,
  };
  return priorityMap[priority.toUpperCase()] || 0;
}

export function getStageIndex(stage: string): number {
  const stageMap: Record<string, number> = {
    RESEARCH: 5,
    TEST: 4,
    REFINE: 3,
    BUILD: 2,
    RELEASE: 1,
  };
  return stageMap[stage.toUpperCase()] || 0;
}

function compareCanonicalProjectRankTuples(
  a: CanonicalProjectRankTuple,
  b: CanonicalProjectRankTuple
) {
  const aGoalRank = a.goalGlobalRank ?? Number.POSITIVE_INFINITY;
  const bGoalRank = b.goalGlobalRank ?? Number.POSITIVE_INFINITY;
  if (aGoalRank !== bGoalRank) return aGoalRank - bGoalRank;
  if (a.stageStrength !== b.stageStrength) {
    return b.stageStrength - a.stageStrength;
  }
  if (a.priorityStrength !== b.priorityStrength) {
    return b.priorityStrength - a.priorityStrength;
  }
  return a.id.localeCompare(b.id);
}

function canonicalProjectRankTupleFromProject(
  project: CanonicalProjectSource | null | undefined,
  goalsById: Map<string, CanonicalGoalRecord | null | undefined>
): CanonicalProjectRankTuple | null {
  if (!project) return null;
  const goal = project.goal_id ? goalsById.get(project.goal_id) : null;
  const goalGlobalRank = normalizeGoalGlobalRank(
    goal?.global_rank ?? goal?.globalRank
  );
  return {
    goalGlobalRank,
    priorityStrength: project.priority ? getPriorityIndex(project.priority) : 0,
    stageStrength: project.stage ? getStageIndex(project.stage) : 0,
    id: project.id,
  };
}

export function compareProjectsByCanonicalSchedulerOrder(
  a: CanonicalProjectSource | null | undefined,
  b: CanonicalProjectSource | null | undefined,
  goalsById: Map<string, CanonicalGoalRecord | null | undefined>
) {
  const aTuple = canonicalProjectRankTupleFromProject(a, goalsById);
  const bTuple = canonicalProjectRankTupleFromProject(b, goalsById);
  if (!aTuple || !bTuple) return 0;
  return compareCanonicalProjectRankTuples(aTuple, bTuple);
}

export function pickProjectOverlapLoser(
  last: ScheduleInstance,
  current: ScheduleInstance,
  projectItemMap: Record<string, CanonicalProjectSource | undefined>,
  goalsById: Map<string, CanonicalGoalRecord | null | undefined>
): ScheduleInstance | null {
  const lastProject = last.source_id ? projectItemMap[last.source_id] : null;
  const currentProject = current.source_id
    ? projectItemMap[current.source_id]
    : null;
  if (!lastProject || !currentProject) return null;

  const comparison = compareProjectsByCanonicalSchedulerOrder(
    lastProject,
    currentProject,
    goalsById
  );
  if (comparison < 0) return current;
  if (comparison > 0) return last;

  const lastStart = new Date(last.start_utc ?? "").getTime();
  const currentStart = new Date(current.start_utc ?? "").getTime();
  return currentStart < lastStart ? last : current;
}
