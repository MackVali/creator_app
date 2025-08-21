export type UserStats = { level: number; xp_current: number; xp_max: number }
export type MonumentCounts = Record<'Achievement'|'Legacy'|'Triumph'|'Pinnacle', number>
export type SkillItem = { skill_id: string | number; name: string; progress: number }
export type GoalItem = { goal_id: string | number; name: string; updated_at?: string }
