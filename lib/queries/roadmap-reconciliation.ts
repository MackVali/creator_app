export function findMissingMonumentRoadmapGoalIds(input: {
  monumentGoalIds: string[];
  roadmapGoalItemIds: string[];
  campaignGoalIds: string[];
}): string[] {
  const representedGoalIds = new Set([
    ...input.roadmapGoalItemIds,
    ...input.campaignGoalIds,
  ]);
  const seenGoalIds = new Set<string>();
  const missingGoalIds: string[] = [];

  for (const goalId of input.monumentGoalIds) {
    if (seenGoalIds.has(goalId)) {
      continue;
    }
    seenGoalIds.add(goalId);

    if (!representedGoalIds.has(goalId)) {
      missingGoalIds.push(goalId);
    }
  }

  return missingGoalIds;
}
