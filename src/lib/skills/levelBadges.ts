export type SkillLevelBadgeStep = {
  maxLevel: number
  emoji: string
}

export const SKILL_LEVEL_BADGE_STEPS: SkillLevelBadgeStep[] = [
  { maxLevel: 10, emoji: '🌟' },
  { maxLevel: 20, emoji: '💫' },
  { maxLevel: 30, emoji: '⚡️' },
  { maxLevel: 40, emoji: '🌞' },
  { maxLevel: 50, emoji: '🐲' },
  { maxLevel: 75, emoji: '🐉' },
  { maxLevel: 90, emoji: '🐦‍🔥' },
  { maxLevel: 100, emoji: '⛓️‍💥' },
]

const DEFAULT_BADGE = SKILL_LEVEL_BADGE_STEPS[0].emoji

export function getSkillLevelBadge(level?: number | null): string {
  if (typeof level !== 'number' || !Number.isFinite(level)) {
    return DEFAULT_BADGE
  }

  const normalizedLevel = Math.max(0, Math.floor(level))

  for (const step of SKILL_LEVEL_BADGE_STEPS) {
    if (normalizedLevel <= step.maxLevel) {
      return step.emoji
    }
  }

  return SKILL_LEVEL_BADGE_STEPS[SKILL_LEVEL_BADGE_STEPS.length - 1].emoji
}
