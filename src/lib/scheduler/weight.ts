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
  skill_monument_id?: string | null;
};

export type ProjectLite = {
  id: string;
  name?: string;
  priority: string;
  stage: string;
  energy?: string | null;
  duration_min?: number | null;
  goal_id?: string | null;
  due_date?: string | null;
  dueDate?: string | null;
  globalRank?: number | null;
};

export type GoalLite = {
  id: string;
  priority: string;
};

function hasKey<T extends object>(obj: T, key: PropertyKey): key is keyof T {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

const DAY_IN_MS = 86_400_000;

export type DueDateBoostOptions = {
  linearWindowDays?: number;
  linearMax?: number;
  surgeWindowDays?: number;
  surgeMax?: number;
  overdueBonusPerDay?: number;
  overdueMax?: number;
};

const DEFAULT_DUE_DATE_OPTIONS: Required<DueDateBoostOptions> = {
  linearWindowDays: 30,
  linearMax: 200,
  surgeWindowDays: 3,
  surgeMax: 350,
  overdueBonusPerDay: 125,
  overdueMax: 350,
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function dueDateUrgencyBoost(
  dueDate?: string | null,
  options: DueDateBoostOptions = {}
): number {
  if (!dueDate) return 0;
  const parsed = Date.parse(dueDate);
  if (Number.isNaN(parsed)) return 0;

  const config: Required<DueDateBoostOptions> = {
    ...DEFAULT_DUE_DATE_OPTIONS,
    ...options,
  };

  const now = Date.now();
  const diffMs = parsed - now;
  const daysUntilDue = diffMs / DAY_IN_MS;

  let linearBoost = 0;
  if (daysUntilDue <= config.linearWindowDays) {
    const ratio = clamp01(1 - daysUntilDue / config.linearWindowDays);
    linearBoost = ratio * config.linearMax;
  }

  let surgeBoost = 0;
  if (daysUntilDue <= config.surgeWindowDays) {
    const ratio = clamp01(1 - daysUntilDue / config.surgeWindowDays);
    surgeBoost = Math.pow(ratio, 2) * config.surgeMax;
  }

  let overdueBoost = 0;
  if (daysUntilDue < 0) {
    const overdueDays = Math.abs(daysUntilDue);
    overdueBoost = Math.min(
      config.overdueMax,
      overdueDays * config.overdueBonusPerDay
    );
  }

  return Math.round(linearBoost + surgeBoost + overdueBoost);
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
  const dueBoost = dueDateUrgencyBoost(p.dueDate ?? p.due_date ?? null, {
    linearMax: 40,
    surgeMax: 70,
    surgeWindowDays: 4,
    linearWindowDays: 28,
    overdueBonusPerDay: 25,
    overdueMax: 140,
  });
  return relatedTaskWeightsSum / 1000 + priority + stage + dueBoost;
}

export function goalWeight(g: GoalLite, relatedProjectWeightsSum: number): number {
  const priority = hasKey(GOAL_PRIORITY_WEIGHT, g.priority)
    ? GOAL_PRIORITY_WEIGHT[g.priority]
    : 0;
  return relatedProjectWeightsSum / 1000 + priority;
}
