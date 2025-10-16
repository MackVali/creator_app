import { xpRequired } from "./progression";

export interface SkillProgressRow {
  skill_id: string;
  level: number | string | null;
  prestige: number | string | null;
  xp_into_level: number | string | null;
}

export interface SkillProgressData {
  level: number;
  prestige: number;
  xpIntoLevel: number;
  xpRequired: number;
  progressPercent: number;
}

function coerceNumber(value: number | string | null | undefined, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function mapRowToProgress(row: SkillProgressRow | null): SkillProgressData | null {
  if (!row?.skill_id) return null;
  const level = coerceNumber(row.level, 1);
  const prestige = coerceNumber(row.prestige, 0);
  const xpIntoLevel = Math.max(0, coerceNumber(row.xp_into_level, 0));
  const required = xpRequired(level, prestige);
  const safeRequired = required > 0 ? required : 1;
  const percent = Math.max(0, Math.min(100, (xpIntoLevel / safeRequired) * 100));

  return {
    level,
    prestige,
    xpIntoLevel,
    xpRequired: safeRequired,
    progressPercent: percent,
  };
}
