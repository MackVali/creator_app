export const ENERGY = {
  LIST: ["NO", "LOW", "MEDIUM", "HIGH", "ULTRA", "EXTREME"],
} as const;

export type Energy = (typeof ENERGY.LIST)[number];

export const TASK_PRIORITY_WEIGHT = {
  NO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
  "ULTRA-CRITICAL": 5,
};

export const TASK_STAGE_WEIGHT = {
  PREPARE: 30,
  PRODUCE: 20,
  PERFECT: 10,
};

export const PROJECT_PRIORITY_WEIGHT = {
  NO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
  "ULTRA-CRITICAL": 5,
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
  CRITICAL: 40,
  "ULTRA-CRITICAL": 50,
};

