import {
  TASK_PRIORITY_WEIGHT,
  TASK_STAGE_WEIGHT,
  PROJECT_PRIORITY_WEIGHT,
  PROJECT_STAGE_WEIGHT,
  GOAL_PRIORITY_WEIGHT,
} from "./config";

export type TaskLite = {
  id: string;
  name: string;
  priority: string;
  stage: string;
  duration_min: number;
  energy: string | null;
  project_id?: string | null;
  skill_id?: string | null;
  skill_icon?: string | null;
};

export type ProjectLite = {
  id: string;
  name?: string;
  priority: string;
  stage: string;
  energy?: string | null;
  duration_min?: number | null;
  goal_id?: string | null;
  monument_id?: string | null;
};

export type GoalLite = {
  id: string;
  priority: string;
};

function hasKey<T extends object>(obj: T, key: PropertyKey): key is keyof T {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function taskWeight(t: TaskLite): number {
  const priority = hasKey(TASK_PRIORITY_WEIGHT, t.priority)
    ? TASK_PRIORITY_WEIGHT[t.priority]
    : 0;
  const stage = hasKey(TASK_STAGE_WEIGHT, t.stage) ? TASK_STAGE_WEIGHT[t.stage] : 0;
  return priority + stage;
}

export function projectWeight(p: ProjectLite, relatedTaskWeightsSum: number): number {
  const priority = hasKey(PROJECT_PRIORITY_WEIGHT, p.priority)
    ? PROJECT_PRIORITY_WEIGHT[p.priority]
    : 0;
  const stage = hasKey(PROJECT_STAGE_WEIGHT, p.stage) ? PROJECT_STAGE_WEIGHT[p.stage] : 0;
  return relatedTaskWeightsSum / 1000 + priority + stage;
}

export function goalWeight(g: GoalLite, relatedProjectWeightsSum: number): number {
  const priority = hasKey(GOAL_PRIORITY_WEIGHT, g.priority)
    ? GOAL_PRIORITY_WEIGHT[g.priority]
    : 0;
  return relatedProjectWeightsSum / 1000 + priority;
}

