export type CanonicalScheduleSourceType = "PROJECT" | "TASK" | "HABIT";

export type CanonicalAreaInput = {
  type: CanonicalScheduleSourceType;
  goalId?: string | null;
  skillId?: string | null;
  projectId?: string | null;
};

export type CanonicalAreaLookups = {
  goalAreaByGoalId: Map<string, string | null>;
  areaBySkillId: Map<string, string | null>;
  projectGoalIdByProjectId?: Map<string, string | null>;
};

export function resolveCanonicalScheduleAreaId(
  input: CanonicalAreaInput,
  lookups: CanonicalAreaLookups
): string | null {
  if (input.type === "HABIT") {
    return input.skillId ? lookups.areaBySkillId.get(input.skillId) ?? null : null;
  }

  const directGoalAreaId = input.goalId
    ? lookups.goalAreaByGoalId.get(input.goalId) ?? null
    : null;
  if (directGoalAreaId || input.type === "PROJECT") {
    return directGoalAreaId;
  }

  const fallbackGoalId = input.projectId
    ? lookups.projectGoalIdByProjectId?.get(input.projectId) ?? null
    : null;
  return fallbackGoalId
    ? lookups.goalAreaByGoalId.get(fallbackGoalId) ?? null
    : null;
}

export type AreaFilterableEntry = {
  areaId?: string | null;
};

export function matchesCanonicalAreaFilter<T extends AreaFilterableEntry>(
  entry: T,
  areaId: string | null | undefined
) {
  return !areaId || entry.areaId === areaId;
}
