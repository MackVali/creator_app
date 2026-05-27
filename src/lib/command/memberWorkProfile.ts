export type CircleMemberWorkProfile = {
  skill_constraint_ids?: string[] | null;
  location_context_ids?: string[] | null;
};

export type CommandWorkCandidate = {
  skill_id?: string | null;
  skillId?: string | null;
  skill_ids?: string[] | null;
  skillIds?: string[] | null;
  location_context_id?: string | null;
  locationContextId?: string | null;
};

function normalizeIds(ids: string[] | null | undefined): string[] {
  if (!Array.isArray(ids)) return [];

  return ids
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter((id) => id.length > 0);
}

function addId(target: Set<string>, value: string | null | undefined) {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (trimmed.length > 0) {
    target.add(trimmed);
  }
}

export function getWorkSkillIds(work: CommandWorkCandidate): string[] {
  const skillIds = new Set<string>();

  addId(skillIds, work.skill_id);
  addId(skillIds, work.skillId);

  for (const id of normalizeIds(work.skill_ids)) {
    skillIds.add(id);
  }

  for (const id of normalizeIds(work.skillIds)) {
    skillIds.add(id);
  }

  return Array.from(skillIds);
}

export function getWorkLocationContextId(
  work: CommandWorkCandidate
): string | null {
  const locationContextId =
    typeof work.location_context_id === "string"
      ? work.location_context_id.trim()
      : "";

  if (locationContextId.length > 0) {
    return locationContextId;
  }

  const camelLocationContextId =
    typeof work.locationContextId === "string"
      ? work.locationContextId.trim()
      : "";

  return camelLocationContextId.length > 0 ? camelLocationContextId : null;
}

export function memberWorkProfileAllowsWork(
  member: CircleMemberWorkProfile,
  work: CommandWorkCandidate
) {
  const skillConstraints = normalizeIds(member.skill_constraint_ids);
  const locationConstraints = normalizeIds(member.location_context_ids);

  const workSkillIds = getWorkSkillIds(work);
  const workLocationContextId = getWorkLocationContextId(work);

  const skillAllowed =
    skillConstraints.length === 0 ||
    workSkillIds.some((id) => skillConstraints.includes(id));

  const locationAllowed =
    locationConstraints.length > 0 &&
    typeof workLocationContextId === "string" &&
    locationConstraints.includes(workLocationContextId);

  return skillAllowed && locationAllowed;
}
