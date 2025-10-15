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
  dueDate?: string | null;
};

export type ProjectLite = {
  id: string;
  name?: string;
  priority: string;
  stage: string;
  energy?: string | null;
  duration_min?: number | null;
  dueDate?: string | null;
};

export type GoalLite = {
  id: string;
  priority: string;
  dueDate?: string | null;
};

function hasKey<T extends object>(obj: T, key: PropertyKey): key is keyof T {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function dueDateUrgencyWeight(
  dueDate?: string | null,
  windowDays = 14,
  maxBoost = 1000
): number {
  if (!dueDate || windowDays <= 0 || maxBoost <= 0) return 0;
  const dueTime = Date.parse(dueDate);
  if (Number.isNaN(dueTime)) return 0;
  const now = Date.now();
  if (dueTime <= now) {
    return maxBoost;
  }
  const windowMs = windowDays * MS_PER_DAY;
  const remaining = dueTime - now;
  if (remaining >= windowMs) {
    return 0;
  }
  const urgency = 1 - remaining / windowMs;
  return Math.max(0, Math.min(1, urgency)) * maxBoost;
}

export function taskWeight(t: TaskLite): number {
  const priority = hasKey(TASK_PRIORITY_WEIGHT, t.priority)
    ? TASK_PRIORITY_WEIGHT[t.priority]
    : 0;
  const stage = hasKey(TASK_STAGE_WEIGHT, t.stage) ? TASK_STAGE_WEIGHT[t.stage] : 0;
  const due = dueDateUrgencyWeight(t.dueDate, 14, 1000);
  return priority + stage + due;
}

export function projectWeight(p: ProjectLite, relatedTaskWeightsSum: number): number {
  const priority = hasKey(PROJECT_PRIORITY_WEIGHT, p.priority)
    ? PROJECT_PRIORITY_WEIGHT[p.priority]
    : 0;
  const stage = hasKey(PROJECT_STAGE_WEIGHT, p.stage) ? PROJECT_STAGE_WEIGHT[p.stage] : 0;
  const due = dueDateUrgencyWeight(p.dueDate, 28, 800);
  return relatedTaskWeightsSum / 1000 + priority + stage + due;
}

export function goalWeight(g: GoalLite, relatedProjectWeightsSum: number): number {
  const priority = hasKey(GOAL_PRIORITY_WEIGHT, g.priority)
    ? GOAL_PRIORITY_WEIGHT[g.priority]
    : 0;
  const due = dueDateUrgencyWeight(g.dueDate, 42, 600);
  return relatedProjectWeightsSum / 1000 + priority + due;
}

