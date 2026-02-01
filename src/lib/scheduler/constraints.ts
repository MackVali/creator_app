export type ConstraintItem = {
  habitType?: string | null;
  skillId?: string | null;
  skillIds?: string[] | null;
  monumentId?: string | null;
  skillMonumentId?: string | null;
  monumentIds?: string[] | null;
};

export type WindowConstraint = {
  allowAllHabitTypes?: boolean;
  allowAllSkills?: boolean;
  allowAllMonuments?: boolean;
  allowedHabitTypes?: string[] | null;
  allowedSkillIds?: string[] | null;
  allowedMonumentIds?: string[] | null;
  allowedHabitTypesSet?: Set<string> | null;
  allowedSkillIdsSet?: Set<string> | null;
  allowedMonumentIdsSet?: Set<string> | null;
};

export const normalizeSet = (values?: string[] | null): Set<string> | null => {
  if (!Array.isArray(values) || values.length === 0) return null;
  const set = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) set.add(trimmed.toUpperCase());
  }
  return set.size > 0 ? set : null;
};

export const normalizeIdSet = (values?: string[] | null): Set<string> | null => {
  if (!Array.isArray(values) || values.length === 0) return null;
  const set = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) set.add(trimmed);
  }
  return set.size > 0 ? set : null;
};

export function passesTimeBlockConstraints(
  item: ConstraintItem,
  window: WindowConstraint
): boolean {
  const {
    allowAllHabitTypes = true,
    allowAllSkills = true,
    allowAllMonuments = true,
    allowedHabitTypes,
    allowedSkillIds,
    allowedMonumentIds,
  } = window;

  // Habit type dimension
  if (!allowAllHabitTypes) {
    const allowed =
      window.allowedHabitTypesSet ?? normalizeSet(allowedHabitTypes);
    if (!allowed || allowed.size === 0) return false;
    const habitType = item.habitType ? item.habitType.toUpperCase() : null;
    if (!habitType) return true;
    if (!allowed.has(habitType)) return false;
  }

  // Skill dimension
  if (!allowAllSkills) {
    const allowed =
      window.allowedSkillIdsSet ?? normalizeIdSet(allowedSkillIds);
    if (!allowed || allowed.size === 0) return false;
    const primary = item.skillId ? item.skillId.trim() : null;
    const extras = normalizeIdSet(item.skillIds ?? null);
    const skillCandidates = new Set<string>();
    if (primary) skillCandidates.add(primary);
    if (extras) {
      for (const val of extras) skillCandidates.add(val);
    }
    if (skillCandidates.size === 0) return false;
    let hasMatch = false;
    for (const candidate of skillCandidates) {
      if (allowed.has(candidate)) {
        hasMatch = true;
        break;
      }
    }
    if (!hasMatch) return false;
  }

  // Monument dimension
  if (!allowAllMonuments) {
    const allowed =
      window.allowedMonumentIdsSet ??
      normalizeIdSet(allowedMonumentIds);
    if (!allowed || allowed.size === 0) return false;
    const monumentCandidates = new Set<string>();
    const primary = item.monumentId ? item.monumentId.trim() : null;
    const fromSkill = item.skillMonumentId
      ? item.skillMonumentId.trim()
      : null;
    const extra = normalizeIdSet(item.monumentIds ?? null);
    if (primary) monumentCandidates.add(primary);
    if (fromSkill) monumentCandidates.add(fromSkill);
    if (extra) {
      for (const val of extra) monumentCandidates.add(val);
    }
    if (monumentCandidates.size === 0) return false;
    let hasMatch = false;
    for (const candidate of monumentCandidates) {
      if (allowed.has(candidate)) {
        hasMatch = true;
        break;
      }
    }
    if (!hasMatch) return false;
  }

  return true;
}
