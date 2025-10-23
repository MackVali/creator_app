import { xpRequired } from "./progression";

export interface SkillBadgeRow {
  id?: string | null;
  badge_id?: string | null;
  skill_id?: string | null;
  badges?: {
    level?: number | string | null;
    emoji?: string | null;
    label?: string | null;
    description?: string | null;
  } | null;
}

export interface SkillProgressRow {
  skill_id: string;
  level: number | string | null;
  prestige: number | string | null;
  xp_into_level: number | string | null;
  skill_badges?: SkillBadgeRow[] | null;
}

export interface PrestigeBadgeData {
  id: string;
  badgeId: string;
  level: number;
  emoji: string;
  label: string;
  description: string | null;
}

export interface SkillProgressData {
  level: number;
  prestige: number;
  xpIntoLevel: number;
  xpRequired: number;
  progressPercent: number;
  badges: PrestigeBadgeData[];
}

function coerceNumber(value: number | string | null | undefined, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function mapPrestigeBadgeRows(
  rows: SkillBadgeRow[] | null | undefined,
): PrestigeBadgeData[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((entry) => {
      const badgeId = typeof entry.badge_id === "string" ? entry.badge_id : null;
      const id = typeof entry.id === "string" ? entry.id : badgeId;
      const badge = entry.badges ?? null;

      const level = coerceNumber(badge?.level ?? null, 0);
      const emoji = typeof badge?.emoji === "string" ? badge.emoji : null;
      const labelSource = typeof badge?.label === "string" ? badge.label : null;
      const label = labelSource && labelSource.trim().length > 0
        ? labelSource.trim()
        : `Prestige Tier ${level}`;
      const description = typeof badge?.description === "string" ? badge.description : null;

      if (!id || !badgeId || !emoji) {
        return null;
      }

      return {
        id,
        badgeId,
        level,
        emoji,
        label,
        description,
      } satisfies PrestigeBadgeData;
    })
    .filter((entry): entry is PrestigeBadgeData => entry !== null)
    .sort((a, b) => {
      if (a.level === b.level) {
        return a.label.localeCompare(b.label);
      }
      return a.level - b.level;
    });
}

export function mapRowToProgress(
  row: SkillProgressRow | null,
  fallbackBadges: PrestigeBadgeData[] = [],
): SkillProgressData | null {
  if (!row?.skill_id) return null;
  const level = coerceNumber(row.level, 1);
  const prestige = coerceNumber(row.prestige, 0);
  const xpIntoLevel = Math.max(0, coerceNumber(row.xp_into_level, 0));
  const required = xpRequired(level, prestige);
  const safeRequired = required > 0 ? required : 1;
  const percent = Math.max(0, Math.min(100, (xpIntoLevel / safeRequired) * 100));
  const badges = row?.skill_badges
    ? mapPrestigeBadgeRows(row.skill_badges)
    : fallbackBadges;

  return {
    level,
    prestige,
    xpIntoLevel,
    xpRequired: safeRequired,
    progressPercent: percent,
    badges,
  };
}
