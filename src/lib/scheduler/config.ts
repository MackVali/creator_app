export const ENERGY = {
  LIST: ["NO", "LOW", "MEDIUM", "HIGH", "ULTRA", "EXTREME"],
} as const;

export type Energy = (typeof ENERGY.LIST)[number];

export const TASK_PRIORITY_WEIGHT = {
  NO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  Critical: 4,
  "Ultra-Critical": 5,
};

export const TASK_STAGE_WEIGHT = {
  Prepare: 30,
  Produce: 20,
  Perfect: 10,
};

export const PROJECT_PRIORITY_WEIGHT = {
  NO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  Critical: 4,
  "Ultra-Critical": 5,
};

export const PROJECT_STAGE_WEIGHT = {
  RESEARCH: 50,
  TEST: 40,
  BUILD: 30,
  REFINE: 20,
  RELEASE: 10,
};

export const GOAL_PRIORITY_WEIGHT = {
  NO: 0,
  LOW: 10,
  MEDIUM: 20,
  HIGH: 30,
  Critical: 40,
  "Ultra-Critical": 50,
};

