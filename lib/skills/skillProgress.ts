import { xpRequired } from "./progression";

export type BadgeType =
  | "user_prestige_badge"
  | "skill_prestige_badge"
  | "skill_level_badge";

export interface SkillBadgeRow {
  id?: string | null;
  badge_id?: string | null;
  skill_id?: string | null;
  badges?: {
    badge_type?: BadgeType | string | null;
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

export interface BadgeData {
  id: string;
  badgeId: string;
  badgeType: BadgeType;
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
  badges: BadgeData[];
}

function coerceNumber(value: number | string | null | undefined, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseBadgeType(value: string | null | undefined): BadgeType | null {
  switch (value) {
    case "user_prestige_badge":
    case "skill_prestige_badge":
    case "skill_level_badge":
      return value;
    default:
      return null;
  }
}

function fallbackLabel(type: BadgeType, level: number) {
  switch (type) {
    case "skill_level_badge":
      return `Skill Level ${level}`;
    case "user_prestige_badge":
    case "skill_prestige_badge":
    default:
      return `Prestige Tier ${level}`;
  }
}

function badgeSortWeight(type: BadgeType) {
  switch (type) {
    case "skill_level_badge":
      return 0;
    case "skill_prestige_badge":
      return 1;
    case "user_prestige_badge":
    default:
      return 2;
  }
}

export function mapPrestigeBadgeRows(
  rows: SkillBadgeRow[] | null | undefined,
): BadgeData[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  const mapped = rows
    .map((entry) => {
      const badgeId = typeof entry.badge_id === "string" ? entry.badge_id : null;
      const id = typeof entry.id === "string" ? entry.id : badgeId;
      const badge = entry.badges ?? null;

      const badgeType = parseBadgeType(badge?.badge_type ?? null);
      const level = coerceNumber(badge?.level ?? null, 0);
      const emoji = typeof badge?.emoji === "string" ? badge.emoji : null;
      const labelSource = typeof badge?.label === "string" ? badge.label : null;
      const type = badgeType ?? "skill_prestige_badge";
      const label = labelSource && labelSource.trim().length > 0
        ? labelSource.trim()
        : fallbackLabel(type, level);
      const description = typeof badge?.description === "string" ? badge.description : null;

      if (!id || !badgeId || !emoji || !badgeType) {
        return null;
      }

      return {
        id,
        badgeId,
        badgeType,
        level,
        emoji,
        label,
        description,
      } satisfies BadgeData;
    })
    .filter((entry): entry is BadgeData => entry !== null)
    .sort((a, b) => {
      const typeWeightDelta = badgeSortWeight(a.badgeType) - badgeSortWeight(b.badgeType);
      if (typeWeightDelta !== 0) {
        return typeWeightDelta;
      }
      if (a.level === b.level) {
        return a.label.localeCompare(b.label);
      }
      return b.level - a.level;
    });

  if (mapped.length === 0) {
    return [];
  }

  const bestByType = new Map<BadgeType, BadgeData>();

  for (const badge of mapped) {
    if (!bestByType.has(badge.badgeType)) {
      bestByType.set(badge.badgeType, badge);
    }
  }

  return Array.from(bestByType.values()).sort((a, b) => {
    const typeWeightDelta = badgeSortWeight(a.badgeType) - badgeSortWeight(b.badgeType);
    if (typeWeightDelta !== 0) {
      return typeWeightDelta;
    }
    if (a.level === b.level) {
      return a.label.localeCompare(b.label);
    }
    return b.level - a.level;
  });
}

export function mapRowToProgress(
  row: SkillProgressRow | null,
  fallbackBadges: BadgeData[] = [],
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
