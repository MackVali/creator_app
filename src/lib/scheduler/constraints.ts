export type ConstraintItem = {
  habitType?: string | null;
  sourceType?: string | null;
  skillId?: string | null;
  skillIds?: string[] | null;
  areaId?: string | null;
  areaIds?: string[] | null;
  monumentId?: string | null;
  skillMonumentId?: string | null;
  monumentIds?: string[] | null;
  isProject?: boolean;
  allowEmptyProjectCandidates?: boolean;
};

export type WindowConstraint = {
  allowAllInstanceTypes?: boolean;
  allowAllHabitTypes?: boolean;
  allowAllSkills?: boolean;
  allowAllAreas?: boolean;
  allowAllMonuments?: boolean;
  allowedInstanceTypes?: string[] | null;
  allowedHabitTypes?: string[] | null;
  allowedSkillIds?: string[] | null;
  allowedAreaIds?: string[] | null;
  allowedMonumentIds?: string[] | null;
  allowedInstanceTypesSet?: Set<string> | null;
  allowedHabitTypesSet?: Set<string> | null;
  allowedSkillIdsSet?: Set<string> | null;
  allowedAreaIdsSet?: Set<string> | null;
  allowedMonumentIdsSet?: Set<string> | null;
  window_kind?: string | null;
  windowKind?: string | null;
  block_type?: string | null;
  blockType?: string | null;
};

const extractWindowKind = (window: WindowConstraint): string | null => {
  const candidates = [
    window.window_kind,
    window.windowKind,
    window.block_type,
    window.blockType,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    return trimmed.toUpperCase();
  }
  return null;
};

const isBreakLikeWindowKind = (value: string | null) =>
  value === "BREAK" || value === "MEAL";

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
    allowAllInstanceTypes = true,
    allowAllHabitTypes = true,
    allowAllSkills = true,
    allowAllAreas = true,
    allowAllMonuments = true,
    allowedInstanceTypes,
    allowedHabitTypes,
    allowedSkillIds,
    allowedAreaIds,
    allowedMonumentIds,
  } = window;
  const windowKind = extractWindowKind(window);
  const normalizedHabitType = item.habitType
    ? item.habitType.trim().toUpperCase()
    : null;

  if (isBreakLikeWindowKind(windowKind)) {
    if (item.isProject) return false;
    if (normalizedHabitType !== "RELAXER") return false;
  }

  if (!allowAllInstanceTypes) {
    const instanceType = item.isProject
      ? "PROJECT"
      : typeof item.sourceType === "string" && item.sourceType.trim()
        ? item.sourceType.trim().toUpperCase()
        : normalizedHabitType;
    const allowed =
      window.allowedInstanceTypesSet ?? normalizeSet(allowedInstanceTypes);
    if (!instanceType || !allowed || allowed.size === 0) return false;
    if (!allowed.has(instanceType)) return false;
  }

  // Habit type dimension
  if (!allowAllHabitTypes) {
    const habitType = item.habitType ? item.habitType.trim().toUpperCase() : null;
    if (habitType) {
      const allowed =
        window.allowedHabitTypesSet ?? normalizeSet(allowedHabitTypes);
      if (!allowed || allowed.size === 0) return false;
      if (!allowed.has(habitType)) return false;
    }
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
    if (skillCandidates.size === 0) {
      if (!item.isProject || !item.allowEmptyProjectCandidates) return false;
    } else {
      let hasMatch = false;
      for (const candidate of skillCandidates) {
        if (allowed.has(candidate)) {
          hasMatch = true;
          break;
        }
      }
      if (!hasMatch) return false;
    }
  }

  // Scope dimension: Areas and Monuments share one OR whitelist.
  if (!allowAllAreas || !allowAllMonuments) {
    const allowedAreas =
      window.allowedAreaIdsSet ?? normalizeIdSet(allowedAreaIds);
    const allowedMonuments =
      window.allowedMonumentIdsSet ?? normalizeIdSet(allowedMonumentIds);
    const hasAreaRestrictions =
      !allowAllAreas && Boolean(allowedAreas && allowedAreas.size > 0);
    const hasMonumentRestrictions =
      !allowAllMonuments &&
      Boolean(allowedMonuments && allowedMonuments.size > 0);
    if (!hasAreaRestrictions && !hasMonumentRestrictions) return false;

    const areaCandidates = new Set<string>();
    const areaPrimary = item.areaId ? item.areaId.trim() : null;
    const areaExtra = normalizeIdSet(item.areaIds ?? null);
    if (areaPrimary) areaCandidates.add(areaPrimary);
    if (areaExtra) {
      for (const val of areaExtra) areaCandidates.add(val);
    }

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
    if (areaCandidates.size === 0 && monumentCandidates.size === 0) {
      if (!item.isProject || !item.allowEmptyProjectCandidates) return false;
    } else {
      let areaMatch = false;
      if (hasAreaRestrictions && allowedAreas) {
        for (const candidate of areaCandidates) {
          if (allowedAreas.has(candidate)) {
            areaMatch = true;
            break;
          }
        }
      }
      let monumentMatch = false;
      if (hasMonumentRestrictions && allowedMonuments) {
        for (const candidate of monumentCandidates) {
          if (allowedMonuments.has(candidate)) {
            monumentMatch = true;
            break;
          }
        }
      }
      if (!areaMatch && !monumentMatch) return false;
    }
  }

  return true;
}

export function scopeConstraintFails(
  item: ConstraintItem,
  window: WindowConstraint
): boolean {
  const allowedAreas = window.allowedAreaIdsSet ?? normalizeIdSet(window.allowedAreaIds);
  const allowedMonuments =
    window.allowedMonumentIdsSet ?? normalizeIdSet(window.allowedMonumentIds);
  const hasAreaRestrictions =
    window.allowAllAreas === false && Boolean(allowedAreas && allowedAreas.size > 0);
  const hasMonumentRestrictions =
    window.allowAllMonuments === false &&
    Boolean(allowedMonuments && allowedMonuments.size > 0);
  if (!hasAreaRestrictions && !hasMonumentRestrictions) {
    return window.allowAllAreas === false || window.allowAllMonuments === false;
  }

  const areaCandidates = new Set<string>();
  if (item.areaId?.trim()) areaCandidates.add(item.areaId.trim());
  for (const value of item.areaIds ?? []) {
    const trimmed = value?.trim();
    if (trimmed) areaCandidates.add(trimmed);
  }

  const monumentCandidates = new Set<string>();
  if (item.monumentId?.trim()) monumentCandidates.add(item.monumentId.trim());
  if (item.skillMonumentId?.trim()) monumentCandidates.add(item.skillMonumentId.trim());
  for (const value of item.monumentIds ?? []) {
    const trimmed = value?.trim();
    if (trimmed) monumentCandidates.add(trimmed);
  }

  if (areaCandidates.size === 0 && monumentCandidates.size === 0) {
    return !item.isProject || !item.allowEmptyProjectCandidates;
  }

  if (hasAreaRestrictions && allowedAreas) {
    for (const candidate of areaCandidates) {
      if (allowedAreas.has(candidate)) {
        return false;
      }
    }
  }
  if (hasMonumentRestrictions && allowedMonuments) {
    for (const candidate of monumentCandidates) {
      if (allowedMonuments.has(candidate)) {
        return false;
      }
    }
  }
  return true;
}
