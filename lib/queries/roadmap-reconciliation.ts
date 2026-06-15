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

export type RoadmapMembershipItem = {
  id?: string | null;
  roadmap_id?: string | null;
  item_type?: string | null;
  campaign_id?: string | null;
  goal_id?: string | null;
};

export type CampaignGoalMembership = {
  campaign_id?: string | null;
  goal_id?: string | null;
};

function normalizeMembershipId(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function findRoadmapCampaignGoalIds(input: {
  roadmapItems: RoadmapMembershipItem[];
  campaignGoals: CampaignGoalMembership[];
}): Map<string, Set<string>> {
  const roadmapIdsByCampaignId = new Map<string, Set<string>>();

  for (const item of input.roadmapItems) {
    const itemType = String(item.item_type ?? "").trim().toUpperCase();
    if (itemType !== "CAMPAIGN") {
      continue;
    }

    const campaignId = normalizeMembershipId(item.campaign_id);
    const roadmapId = normalizeMembershipId(item.roadmap_id);
    if (!campaignId || !roadmapId) {
      continue;
    }

    const roadmapIds = roadmapIdsByCampaignId.get(campaignId) ?? new Set<string>();
    roadmapIds.add(roadmapId);
    roadmapIdsByCampaignId.set(campaignId, roadmapIds);
  }

  const campaignGoalIdsByRoadmapId = new Map<string, Set<string>>();
  for (const campaignGoal of input.campaignGoals) {
    const campaignId = normalizeMembershipId(campaignGoal.campaign_id);
    const goalId = normalizeMembershipId(campaignGoal.goal_id);
    if (!campaignId || !goalId) {
      continue;
    }

    const roadmapIds = roadmapIdsByCampaignId.get(campaignId);
    if (!roadmapIds) {
      continue;
    }

    for (const roadmapId of roadmapIds) {
      const goalIds =
        campaignGoalIdsByRoadmapId.get(roadmapId) ?? new Set<string>();
      goalIds.add(goalId);
      campaignGoalIdsByRoadmapId.set(roadmapId, goalIds);
    }
  }

  return campaignGoalIdsByRoadmapId;
}

export function findRedundantStandaloneRoadmapItemIds(input: {
  roadmapItems: RoadmapMembershipItem[];
  campaignGoals: CampaignGoalMembership[];
}): Set<string> {
  const campaignGoalIdsByRoadmapId = findRoadmapCampaignGoalIds(input);
  const redundantItemIds = new Set<string>();

  for (const item of input.roadmapItems) {
    const itemType = String(item.item_type ?? "").trim().toUpperCase();
    if (itemType !== "GOAL") {
      continue;
    }

    const itemId = normalizeMembershipId(item.id);
    const roadmapId = normalizeMembershipId(item.roadmap_id);
    const goalId = normalizeMembershipId(item.goal_id);
    if (!itemId || !roadmapId || !goalId) {
      continue;
    }

    if (campaignGoalIdsByRoadmapId.get(roadmapId)?.has(goalId)) {
      redundantItemIds.add(itemId);
    }
  }

  return redundantItemIds;
}
