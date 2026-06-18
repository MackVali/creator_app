import type { ScheduleInstance } from "./instanceRepo";
import type { ProjectItem } from "./projects";

export type CanonicalGoalRecord = {
  status?: "ACTIVE" | "PAUSED" | "COMPLETED" | null;
  global_rank?: number | null;
  globalRank?: number | null;
};

export type CanonicalProjectSource = Pick<
  ProjectItem,
  "id" | "priority" | "stage" | "goal_id" | "due_date"
>;

export type CanonicalProjectRecord = CanonicalProjectSource & {
  created_at?: string | null;
  createdAt?: string | null;
  completed_at?: string | null;
  dueDate?: string | null;
  globalRank?: number | null;
  global_rank?: number | null;
};

type CanonicalProjectRankTuple = {
  goalGlobalRank: number | null;
  priorityStrength: number;
  stageStrength: number;
  dueTime: number;
  createdTime: number;
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
  if (a.priorityStrength !== b.priorityStrength) {
    return b.priorityStrength - a.priorityStrength;
  }
  if (a.stageStrength !== b.stageStrength) {
    return b.stageStrength - a.stageStrength;
  }
  if (a.dueTime !== b.dueTime) return a.dueTime - b.dueTime;
  if (a.createdTime !== b.createdTime) return a.createdTime - b.createdTime;
  return a.id.localeCompare(b.id);
}

function readTimestamp(value: unknown): number {
  if (typeof value !== "string" || value.trim().length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function canonicalProjectRankTupleFromProject(
  project: CanonicalProjectRecord | null | undefined,
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
    dueTime: readTimestamp(project.due_date ?? project.dueDate),
    createdTime: readTimestamp(project.created_at ?? project.createdAt),
    id: project.id,
  };
}

export function compareProjectsByCanonicalSchedulerOrder(
  a: CanonicalProjectRecord | null | undefined,
  b: CanonicalProjectRecord | null | undefined,
  goalsById: Map<string, CanonicalGoalRecord | null | undefined>
) {
  const aTuple = canonicalProjectRankTupleFromProject(a, goalsById);
  const bTuple = canonicalProjectRankTupleFromProject(b, goalsById);
  if (!aTuple || !bTuple) return 0;
  return compareCanonicalProjectRankTuples(aTuple, bTuple);
}

export function getCanonicalProjectGlobalRankUpdates(
  projects: CanonicalProjectRecord[],
  goalsById: Map<string, CanonicalGoalRecord | null | undefined>
): Array<{ id: string; global_rank: number | null }> {
  const activeProjects: CanonicalProjectRecord[] = [];
  const updates: Array<{ id: string; global_rank: number | null }> = [];

  for (const project of projects) {
    if (!project?.id) continue;
    if (project.completed_at) {
      updates.push({ id: project.id, global_rank: null });
      continue;
    }
    activeProjects.push(project);
  }

  activeProjects.sort((a, b) =>
    compareProjectsByCanonicalSchedulerOrder(a, b, goalsById)
  );

  activeProjects.forEach((project, index) => {
    updates.push({ id: project.id, global_rank: index + 1 });
  });

  return updates;
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
