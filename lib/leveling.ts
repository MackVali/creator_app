export type LevelProgress = {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  xpToNextLevel: number;
  totalXpConsumed: number;
  totalXpForNextLevel: number;
  progressPercent: number;
};

const LEVEL_COST_BANDS: Array<{ min: number; max: number; cost: number }> = [
  { min: 1, max: 9, cost: 10 },
  { min: 10, max: 19, cost: 14 },
  { min: 20, max: 29, cost: 20 },
  { min: 30, max: 39, cost: 24 },
  { min: 40, max: 99, cost: 30 },
  { min: 100, max: 100, cost: 50 },
];

export function getSkillLevelCost(level: number) {
  for (const band of LEVEL_COST_BANDS) {
    if (level >= band.min && level <= band.max) {
      return band.cost;
    }
  }

  return 30;
}

export function calculateLevelProgress(totalXp: number): LevelProgress {
  const safeTotal = Number.isFinite(totalXp) ? Math.max(0, Math.floor(totalXp)) : 0;

  let level = 1;
  let xpIntoLevel = safeTotal;
  let totalXpConsumed = 0;
  let cost = getSkillLevelCost(level);

  while (xpIntoLevel >= cost) {
    xpIntoLevel -= cost;
    totalXpConsumed += cost;
    level += 1;
    cost = getSkillLevelCost(level);
  }

  const xpForNextLevel = cost;
  const xpToNextLevel = Math.max(0, xpForNextLevel - xpIntoLevel);
  const totalXpForNextLevel = totalXpConsumed + xpForNextLevel;
  const progressPercent = xpForNextLevel > 0 ? Math.round((xpIntoLevel / xpForNextLevel) * 100) : 0;

  return {
    level,
    xpIntoLevel,
    xpForNextLevel,
    xpToNextLevel,
    totalXpConsumed,
    totalXpForNextLevel,
    progressPercent: Math.min(100, Math.max(0, progressPercent)),
  };
}

export function calculateDarkXpLevel(totalDarkXp: number): LevelProgress {
  const safeTotal = Number.isFinite(totalDarkXp)
    ? Math.max(0, Math.floor(totalDarkXp))
    : 0;

  const level = safeTotal + 1;

  return {
    level,
    xpIntoLevel: 0,
    xpForNextLevel: 1,
    xpToNextLevel: 1,
    totalXpConsumed: safeTotal,
    totalXpForNextLevel: safeTotal + 1,
    progressPercent: 0,
  };
}
