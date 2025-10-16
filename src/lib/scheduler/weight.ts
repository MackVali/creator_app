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
  due_date?: string | null;
  dueDate?: string | null;
};

export type ProjectLite = {
  id: string;
  name?: string;
  priority: string;
  stage: string;
  energy?: string | null;
  duration_min?: number | null;
  due_date?: string | null;
  dueDate?: string | null;
};

export type GoalLite = {
  id: string;
  priority: string;
  due_date?: string | null;
  dueDate?: string | null;
};

function hasKey<T extends object>(obj: T, key: PropertyKey): key is keyof T {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

const MS_IN_DAY = 24 * 60 * 60 * 1000;
const DUE_DATE_RAMP_DAYS = 7;
const DUE_DATE_MAX_BOOST = 1000;

const resolveDueDate = <T extends { dueDate?: string | null; due_date?: string | null }>(
  item: T
): string | null => {
  if (item.dueDate && item.dueDate.length > 0) {
    return item.dueDate;
  }
  if (item.due_date && item.due_date.length > 0) {
    return item.due_date;
  }
  return null;
};

const dueDateWeightBoost = (dueDate: string | null | undefined, now: Date): number => {
  if (!dueDate) {
    return 0;
  }
  const target = new Date(dueDate);
  if (Number.isNaN(target.getTime())) {
    return 0;
  }
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) {
    return DUE_DATE_MAX_BOOST;
  }
  const rampMs = DUE_DATE_RAMP_DAYS * MS_IN_DAY;
  if (diffMs >= rampMs) {
    return 0;
  }
  const progress = 1 - diffMs / rampMs;
  return Math.max(0, progress * DUE_DATE_MAX_BOOST);
};

export function taskWeight(t: TaskLite): number {
  const priority = hasKey(TASK_PRIORITY_WEIGHT, t.priority)
    ? TASK_PRIORITY_WEIGHT[t.priority]
    : 0;
  const stage = hasKey(TASK_STAGE_WEIGHT, t.stage) ? TASK_STAGE_WEIGHT[t.stage] : 0;
  const now = new Date();
  const dueBoost = dueDateWeightBoost(resolveDueDate(t), now);
  return priority + stage + dueBoost;
}

export function projectWeight(p: ProjectLite, relatedTaskWeightsSum: number): number {
  const priority = hasKey(PROJECT_PRIORITY_WEIGHT, p.priority)
    ? PROJECT_PRIORITY_WEIGHT[p.priority]
    : 0;
  const stage = hasKey(PROJECT_STAGE_WEIGHT, p.stage) ? PROJECT_STAGE_WEIGHT[p.stage] : 0;
  const now = new Date();
  const dueBoost = dueDateWeightBoost(resolveDueDate(p), now);
  return relatedTaskWeightsSum / 1000 + priority + stage + dueBoost;
}

export function goalWeight(g: GoalLite, relatedProjectWeightsSum: number): number {
  const priority = hasKey(GOAL_PRIORITY_WEIGHT, g.priority)
    ? GOAL_PRIORITY_WEIGHT[g.priority]
    : 0;
  const now = new Date();
  const dueBoost = dueDateWeightBoost(resolveDueDate(g), now);
  return relatedProjectWeightsSum / 1000 + priority + dueBoost;
}

