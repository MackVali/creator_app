import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { getSupabaseServer } from "@/lib/supabase";
import PriorityEditorClient from "./PriorityEditorClient";
import {
  compareRankValues,
  normalizePriority,
  parseGlobalRank,
  PRIORITY_ORDER,
  sortGlobalPriorityItems,
  sortRoadmapItems,
  type GlobalPriorityRoadmapItem,
  type MonumentRoadmapPriority,
  type RoadmapPriorityCampaign,
  type RoadmapPriorityGoal,
  type RoadmapPriorityItem,
} from "./utils";

export const runtime = "nodejs";

type AuthUserForAdmin = {
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
} | null;

type MonumentRow = {
  id: string;
  title?: string | null;
  emoji?: string | null;
  priority_rank?: number | string | null;
  created_at?: string | null;
};

type RoadmapRow = {
  id: string;
  title?: string | null;
  emoji?: string | null;
  monument_id?: string | null;
  created_at?: string | null;
};

type GoalRow = {
  id: string;
  name?: string | null;
  emoji?: string | null;
  monument_id?: string | null;
  roadmap_id?: string | null;
  circle_id?: string | null;
  status?: string | null;
  priority?: string | null;
  priority_code?: string | null;
  priority_order?: number | string | null;
  global_rank?: number | string | null;
  priority_rank?: number | string | null;
  created_at?: string | null;
  monument?: { emoji?: string | null } | null;
};

type RoadmapItemRow = {
  id: string;
  roadmap_id: string;
  item_type?: string | null;
  position?: number | null;
  campaign_id?: string | null;
  goal_id?: string | null;
  created_at?: string | null;
};

type CampaignRow = {
  id: string;
  name?: string | null;
  description?: string | null;
  emoji?: string | null;
  priority_code?: string | null;
  priority_order?: number | string | null;
  scheduling_state?: string | null;
  position?: number | null;
  roadmap_id?: string | null;
  primary_monument_id?: string | null;
  created_at?: string | null;
};

type CampaignGoalRow = {
  campaign_id: string;
  goal_id: string;
  position?: number | null;
  created_at?: string | null;
};

type GlobalPriorityCampaignCandidate = GlobalPriorityRoadmapItem & {
  normalizedName: string;
};

type GlobalPriorityCampaignGroup = {
  candidates: GlobalPriorityCampaignCandidate[];
  goalIds: Set<string>;
};

function userIsAdmin(user: AuthUserForAdmin) {
  if (!user) return false;

  const possibleRoles = new Set<string>();
  const addRole = (value: unknown) => {
    if (typeof value === "string") {
      possibleRoles.add(value.toLowerCase());
    }
  };
  const addRoles = (values: unknown) => {
    if (Array.isArray(values)) {
      values.forEach((role) => addRole(role));
    }
  };

  addRole(user.user_metadata?.role);
  addRole(user.app_metadata?.role);
  addRoles(user.user_metadata?.roles);
  addRoles(user.app_metadata?.roles);

  if (user.user_metadata?.is_admin === true || user.app_metadata?.is_admin === true) {
    possibleRoles.add("admin");
  }

  return possibleRoles.has("admin");
}

function isCompletedGoal(status?: string | null) {
  return typeof status === "string" && status.trim().toUpperCase() === "COMPLETED";
}

function compareText(a?: string | null, b?: string | null) {
  return (a ?? "").localeCompare(b ?? "");
}

function getMonumentName(monument: MonumentRow) {
  return (monument.title ?? "").trim() || "Untitled Monument";
}

function compareMonumentsByPriority(a: MonumentRow, b: MonumentRow) {
  const aRank = parseGlobalRank(a.priority_rank);
  const bRank = parseGlobalRank(b.priority_rank);
  const rankDelta = compareRankValues(aRank, bRank);
  if (rankDelta !== 0) {
    return rankDelta;
  }

  if (typeof aRank === "number" && typeof bRank === "number") {
    return 0;
  }

  const createdDelta = compareText(a.created_at, b.created_at);
  if (createdDelta !== 0) return createdDelta;

  return compareText(a.id, b.id);
}

function normalizeGoal(row: GoalRow): RoadmapPriorityGoal {
  return {
    id: row.id,
    name: (row.name ?? "").trim() || "Untitled Goal",
    emoji: row.emoji ?? null,
    monumentEmoji: row.monument?.emoji ?? null,
    priority: normalizePriority(row.priority_code ?? row.priority),
    status: row.status ?? null,
    globalRank: parseGlobalRank(row.global_rank),
    priorityOrder: parseGlobalRank(row.priority_order),
    priorityRank: parseGlobalRank(row.priority_rank),
    createdAt: row.created_at ?? null,
  };
}

function normalizeCampaignGoal(
  row: GoalRow,
  campaignGoal: CampaignGoalRow
): RoadmapPriorityGoal {
  return {
    ...normalizeGoal(row),
    campaignPosition: parseGlobalRank(campaignGoal.position),
    campaignGoalCreatedAt: campaignGoal.created_at ?? null,
  };
}

function normalizeCampaign(
  campaign: CampaignRow,
  goals: RoadmapPriorityGoal[] = []
): RoadmapPriorityCampaign {
  return {
    id: campaign.id,
    name: (campaign.name ?? "").trim() || "Untitled Campaign",
    emoji: campaign.emoji ?? null,
    description: campaign.description ?? null,
    priority: normalizePriority(campaign.priority_code),
    schedulingState: campaign.scheduling_state ?? null,
    position: parseGlobalRank(campaign.position),
    goals,
  };
}

function goalBelongsToRoadmap(
  goal: GoalRow | undefined,
  roadmap: RoadmapRow,
  monumentId: string
) {
  if (!goal) return false;
  return goal.roadmap_id === roadmap.id || goal.monument_id === monumentId;
}

function sortGoalsForRoadmap(goals: GoalRow[]) {
  return [...goals].sort((a, b) => {
    const priorityRankDelta = compareRankValues(
      parseGlobalRank(a.priority_rank),
      parseGlobalRank(b.priority_rank)
    );
    if (priorityRankDelta !== 0) return priorityRankDelta;

    const globalRankDelta = compareRankValues(
      parseGlobalRank(a.global_rank),
      parseGlobalRank(b.global_rank)
    );
    if (globalRankDelta !== 0) return globalRankDelta;

    const createdDelta = compareText(a.created_at, b.created_at);
    if (createdDelta !== 0) return createdDelta;

    return compareText(a.name, b.name);
  });
}

function sortCampaignNestedGoals(
  goals: RoadmapPriorityGoal[]
): RoadmapPriorityGoal[] {
  return [...goals].sort((a, b) => {
    const priorityDelta =
      PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
    if (priorityDelta !== 0) return priorityDelta;

    const rankDelta = compareRankValues(
      a.priorityOrder ?? a.priorityRank,
      b.priorityOrder ?? b.priorityRank
    );
    if (rankDelta !== 0) return rankDelta;

    const campaignPositionDelta = compareRankValues(
      a.campaignPosition,
      b.campaignPosition
    );
    if (campaignPositionDelta !== 0) return campaignPositionDelta;

    const campaignCreatedDelta = compareText(
      a.campaignGoalCreatedAt,
      b.campaignGoalCreatedAt
    );
    if (campaignCreatedDelta !== 0) return campaignCreatedDelta;

    const createdDelta = compareText(a.createdAt, b.createdAt);
    if (createdDelta !== 0) return createdDelta;

    return compareText(a.id, b.id);
  });
}

function buildRoadmapCards({
  monuments,
  roadmaps,
  goals,
  roadmapItems,
  campaigns,
  campaignGoals,
}: {
  monuments: MonumentRow[];
  roadmaps: RoadmapRow[];
  goals: GoalRow[];
  roadmapItems: RoadmapItemRow[];
  campaigns: CampaignRow[];
  campaignGoals: CampaignGoalRow[];
}): MonumentRoadmapPriority[] {
  const goalsById = new Map(goals.map((goal) => [goal.id, goal]));
  const roadmapsByMonumentId = new Map<string, RoadmapRow[]>();
  const itemsByRoadmapId = new Map<string, RoadmapItemRow[]>();
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  const campaignGoalsByCampaignId = new Map<string, CampaignGoalRow[]>();

  for (const roadmap of roadmaps) {
    if (!roadmap.monument_id) continue;
    const existing = roadmapsByMonumentId.get(roadmap.monument_id) ?? [];
    existing.push(roadmap);
    roadmapsByMonumentId.set(roadmap.monument_id, existing);
  }

  for (const item of roadmapItems) {
    const existing = itemsByRoadmapId.get(item.roadmap_id) ?? [];
    existing.push(item);
    itemsByRoadmapId.set(item.roadmap_id, existing);
  }

  for (const campaignGoal of campaignGoals) {
    const existing = campaignGoalsByCampaignId.get(campaignGoal.campaign_id) ?? [];
    existing.push(campaignGoal);
    campaignGoalsByCampaignId.set(campaignGoal.campaign_id, existing);
  }

  for (const groupedRoadmaps of roadmapsByMonumentId.values()) {
    groupedRoadmaps.sort((a, b) => {
      const createdDelta = compareText(a.created_at, b.created_at);
      if (createdDelta !== 0) return createdDelta;
      return compareText(a.title, b.title);
    });
  }

  for (const groupedItems of itemsByRoadmapId.values()) {
    groupedItems.sort((a, b) => {
      const aPosition = a.position ?? Number.POSITIVE_INFINITY;
      const bPosition = b.position ?? Number.POSITIVE_INFINITY;
      if (aPosition !== bPosition) return aPosition - bPosition;
      const createdDelta = compareText(a.created_at, b.created_at);
      if (createdDelta !== 0) return createdDelta;
      return compareText(a.id, b.id);
    });
  }

  for (const groupedCampaignGoals of campaignGoalsByCampaignId.values()) {
    groupedCampaignGoals.sort((a, b) => {
      const aPosition = a.position ?? Number.POSITIVE_INFINITY;
      const bPosition = b.position ?? Number.POSITIVE_INFINITY;
      if (aPosition !== bPosition) return aPosition - bPosition;
      const createdDelta = compareText(a.created_at, b.created_at);
      if (createdDelta !== 0) return createdDelta;
      return compareText(a.goal_id, b.goal_id);
    });
  }

  const cards: MonumentRoadmapPriority[] = [];

  for (const monument of [...monuments].sort(compareMonumentsByPriority)) {
    const monumentId = monument.id;
    const monumentRoadmaps = roadmapsByMonumentId.get(monumentId) ?? [];
    const monumentPriorityRank = parseGlobalRank(monument.priority_rank);
    const monumentName = getMonumentName(monument);

    if (monumentRoadmaps.length === 0) {
      cards.push({
        id: `monument:${monumentId}:empty`,
        monumentId,
        monumentName,
        monumentEmoji: monument.emoji ?? null,
        monumentPriorityRank,
        monumentCreatedAt: monument.created_at ?? null,
        roadmapId: null,
        roadmapTitle: null,
        roadmapEmoji: null,
        items: [],
        goalCount: 0,
        campaignCount: 0,
      });
      continue;
    }

    for (const roadmap of monumentRoadmaps) {
      const nestedCampaignGoalIds = new Set<string>();
      const existingItems = itemsByRoadmapId.get(roadmap.id) ?? [];

      for (const item of existingItems) {
        if (item.item_type?.toUpperCase() !== "CAMPAIGN" || !item.campaign_id) {
          continue;
        }
        for (const campaignGoal of campaignGoalsByCampaignId.get(item.campaign_id) ?? []) {
          nestedCampaignGoalIds.add(campaignGoal.goal_id);
        }
      }

      const mixedItems: RoadmapPriorityItem[] = existingItems
        .map((item, index): RoadmapPriorityItem | null => {
          const position = item.position ?? index + 1;
          const itemType = item.item_type?.toUpperCase();

          if (itemType === "CAMPAIGN" && item.campaign_id) {
            const campaign = campaignById.get(item.campaign_id);
            if (!campaign) return null;

            const campaignGoalsForCard = (campaignGoalsByCampaignId.get(campaign.id) ?? [])
              .map((campaignGoal) => goalsById.get(campaignGoal.goal_id))
              .filter((goal): goal is GoalRow =>
                Boolean(goal) &&
                !isCompletedGoal(goal?.status) &&
                goalBelongsToRoadmap(goal, roadmap, monumentId)
              );

            if (campaignGoalsForCard.length === 0) return null;

            const normalizedCampaign: RoadmapPriorityCampaign = {
              ...normalizeCampaign(campaign, campaignGoalsForCard.map(normalizeGoal)),
              position,
            };

            return {
              id: item.id,
              type: "campaign",
              position,
              campaign: normalizedCampaign,
            };
          }

          if (itemType === "GOAL" && item.goal_id) {
            if (nestedCampaignGoalIds.has(item.goal_id)) return null;
            const goal = goalsById.get(item.goal_id);
            if (
              !goal ||
              isCompletedGoal(goal.status) ||
              !goalBelongsToRoadmap(goal, roadmap, monumentId)
            ) {
              return null;
            }

            return {
              id: item.id,
              type: "goal",
              position,
              goal: normalizeGoal(goal),
            };
          }

          return null;
        })
        .filter((item): item is RoadmapPriorityItem => Boolean(item));

      const items =
        mixedItems.length > 0
          ? sortRoadmapItems(mixedItems)
          : sortGoalsForRoadmap(
              goals.filter(
                (goal) =>
                  goal.roadmap_id === roadmap.id &&
                  goal.monument_id === monumentId &&
                  !isCompletedGoal(goal.status)
              )
            ).map((goal, index) => ({
              id: `legacy-goal-${goal.id}`,
              type: "goal" as const,
              position: parseGlobalRank(goal.priority_rank) ?? index + 1,
              goal: normalizeGoal(goal),
            }));

      const goalCount = items.reduce(
        (count, item) =>
          count + (item.type === "campaign" ? item.campaign.goals.length : 1),
        0
      );

      cards.push({
        id: `roadmap:${roadmap.id}`,
        monumentId,
        monumentName,
        monumentEmoji: monument.emoji ?? null,
        monumentPriorityRank,
        monumentCreatedAt: monument.created_at ?? null,
        roadmapId: roadmap.id,
        roadmapTitle: (roadmap.title ?? "").trim() || "Roadmap",
        roadmapEmoji: roadmap.emoji ?? null,
        items,
        goalCount,
        campaignCount: items.filter((item) => item.type === "campaign").length,
      });
    }
  }

  return cards;
}

function buildGlobalPriorityItems({
  goals,
  campaigns,
  campaignGoals,
}: {
  goals: GoalRow[];
  campaigns: CampaignRow[];
  campaignGoals: CampaignGoalRow[];
}): GlobalPriorityRoadmapItem[] {
  const goalsById = new Map(goals.map((goal) => [goal.id, goal]));
  const campaignGoalIds = new Set<string>();
  const campaignGoalsByCampaignId = new Map<string, CampaignGoalRow[]>();
  const campaignCandidatesById = new Map<string, GlobalPriorityCampaignCandidate>();

  for (const campaignGoal of campaignGoals) {
    campaignGoalIds.add(campaignGoal.goal_id);
    const existing = campaignGoalsByCampaignId.get(campaignGoal.campaign_id) ?? [];
    existing.push(campaignGoal);
    campaignGoalsByCampaignId.set(campaignGoal.campaign_id, existing);
  }

  for (const groupedCampaignGoals of campaignGoalsByCampaignId.values()) {
    groupedCampaignGoals.sort((a, b) => {
      const aPosition = a.position ?? Number.POSITIVE_INFINITY;
      const bPosition = b.position ?? Number.POSITIVE_INFINITY;
      if (aPosition !== bPosition) return aPosition - bPosition;
      const createdDelta = compareText(a.created_at, b.created_at);
      if (createdDelta !== 0) return createdDelta;
      return compareText(a.goal_id, b.goal_id);
    });
  }

  for (const campaign of campaigns) {
    const campaignNestedGoalsById = new Map<string, RoadmapPriorityGoal>();
    for (const campaignGoal of campaignGoalsByCampaignId.get(campaign.id) ?? []) {
      const goal = goalsById.get(campaignGoal.goal_id);
      if (
        !goal ||
        goal.circle_id ||
        isCompletedGoal(goal.status) ||
        campaignNestedGoalsById.has(goal.id)
      ) {
        continue;
      }
      campaignNestedGoalsById.set(goal.id, normalizeCampaignGoal(goal, campaignGoal));
    }

    if (campaignNestedGoalsById.size === 0) continue;

    const normalizedCampaign = normalizeCampaign(
      campaign,
      sortCampaignNestedGoals(Array.from(campaignNestedGoalsById.values()))
    );
    const candidate: GlobalPriorityCampaignCandidate = {
      id: campaign.id,
      type: "campaign",
      sourceIds: [campaign.id],
      normalizedName: normalizeGlobalPriorityCampaignName(normalizedCampaign.name),
      name: normalizedCampaign.name,
      emoji: normalizedCampaign.emoji,
      priority: normalizedCampaign.priority,
      priorityOrder: parseGlobalRank(campaign.priority_order),
      position: normalizedCampaign.position,
      createdAt: campaign.created_at ?? null,
      goals: normalizedCampaign.goals,
    };
    const existing = campaignCandidatesById.get(campaign.id);

    if (!existing) {
      campaignCandidatesById.set(campaign.id, candidate);
      continue;
    }

    const goalsForMergedItem = mergeGlobalPriorityCampaignGoals(
      existing.goals,
      candidate.goals
    );
    const preferredItem =
      compareGlobalPriorityCampaignStability(candidate, existing) < 0
        ? candidate
        : existing;

    campaignCandidatesById.set(campaign.id, {
      ...preferredItem,
      sourceIds: mergeSourceIds(existing.sourceIds, candidate.sourceIds),
      goals: sortCampaignNestedGoals(goalsForMergedItem),
    });
  }

  const campaignItems = buildGlobalPriorityCampaignItems(
    Array.from(campaignCandidatesById.values())
  );

  const standaloneGoalItems: GlobalPriorityRoadmapItem[] = goals
    .filter(
      (goal) =>
        !goal.circle_id && !isCompletedGoal(goal.status) && !campaignGoalIds.has(goal.id)
    )
    .map((goal) => {
      const normalizedGoal = normalizeGoal(goal);

      return {
        id: goal.id,
        type: "goal",
        name: normalizedGoal.name,
        emoji: normalizedGoal.emoji,
        monumentEmoji: normalizedGoal.monumentEmoji,
        priority: normalizedGoal.priority,
        priorityOrder: parseGlobalRank(goal.priority_order),
        globalRank: normalizedGoal.globalRank,
        priorityRank: normalizedGoal.priorityRank,
        createdAt: goal.created_at ?? null,
      };
    });

  return sortGlobalPriorityItems([...campaignItems, ...standaloneGoalItems]);
}

function compareGlobalPriorityCampaignStability(
  a: GlobalPriorityRoadmapItem,
  b: GlobalPriorityRoadmapItem
) {
  const priorityOrderDelta = compareRankValues(a.priorityOrder, b.priorityOrder);
  if (priorityOrderDelta !== 0) return priorityOrderDelta;

  const createdDelta = compareText(a.createdAt, b.createdAt);
  if (createdDelta !== 0) return createdDelta;

  return compareText(a.id, b.id);
}

function mergeGlobalPriorityCampaignGoals(
  first?: RoadmapPriorityGoal[],
  second?: RoadmapPriorityGoal[]
) {
  const goalsById = new Map<string, RoadmapPriorityGoal>();

  for (const goal of [...(first ?? []), ...(second ?? [])]) {
    if (goalsById.has(goal.id)) continue;
    goalsById.set(goal.id, goal);
  }

  return Array.from(goalsById.values());
}

function normalizeGlobalPriorityCampaignName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function mergeSourceIds(first?: string[], second?: string[]) {
  return Array.from(new Set([...(first ?? []), ...(second ?? [])]));
}

function campaignCandidatesOverlap(
  group: GlobalPriorityCampaignGroup,
  candidate: GlobalPriorityCampaignCandidate
) {
  if (!candidate.normalizedName) return false;
  const candidateGoalIds = new Set((candidate.goals ?? []).map((goal) => goal.id));
  if (candidateGoalIds.size === 0) return false;

  for (const goalId of candidateGoalIds) {
    if (group.goalIds.has(goalId)) return true;
  }

  return false;
}

function mergeGlobalPriorityCampaignGroup(
  group: GlobalPriorityCampaignGroup
): GlobalPriorityRoadmapItem {
  const { candidates } = group;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error(
      "Invalid Global Priority Campaign group: expected a non-empty candidates array."
    );
  }

  const sortedCandidates = [...candidates].sort(
    compareGlobalPriorityCampaignStability
  );
  const preferredItem = sortedCandidates[0];
  const sourceIds = sortedCandidates.reduce<string[]>(
    (mergedIds, candidate) =>
      mergeSourceIds(mergedIds, candidate.sourceIds ?? [candidate.id]),
    []
  );
  return {
    id: preferredItem.id,
    type: "campaign",
    name: preferredItem.name,
    emoji: preferredItem.emoji,
    priority: preferredItem.priority,
    priorityOrder: preferredItem.priorityOrder,
    position: preferredItem.position,
    createdAt: preferredItem.createdAt,
    sourceIds,
    goals: sortCampaignNestedGoals(
      sortedCandidates.reduce<RoadmapPriorityGoal[]>(
        (mergedGoals, candidate) =>
          mergeGlobalPriorityCampaignGoals(mergedGoals, candidate.goals),
        []
      )
    ),
  };
}

function buildGlobalPriorityCampaignItems(
  candidates: GlobalPriorityCampaignCandidate[]
) {
  const groupsByName = new Map<string, GlobalPriorityCampaignGroup[]>();

  for (const candidate of candidates) {
    const groups = groupsByName.get(candidate.normalizedName) ?? [];
    const overlappingGroup = groups.find((group) =>
      campaignCandidatesOverlap(group, candidate)
    );

    if (overlappingGroup) {
      overlappingGroup.candidates.push(candidate);
      for (const goal of candidate.goals ?? []) {
        overlappingGroup.goalIds.add(goal.id);
      }
    } else {
      groups.push({
        candidates: [candidate],
        goalIds: new Set((candidate.goals ?? []).map((goal) => goal.id)),
      });
      groupsByName.set(candidate.normalizedName, groups);
    }
  }

  return Array.from(groupsByName.values())
    .flat()
    .map((group) => mergeGlobalPriorityCampaignGroup(group));
}

export default async function PriorityEditorPage() {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer({
    get: (name) => cookieStore.get(name),
  });

  if (!supabase) {
    redirect("/auth");
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth");
  }

  if (!userIsAdmin(user)) {
    redirect("/schedule");
  }

  const userId = user.id;

  const [
    { data: monumentData, error: monumentError },
    { data: roadmapData, error: roadmapError },
    { data: goalData, error: goalError },
  ] = await Promise.all([
    supabase
      .from("monuments")
      .select("id,title,emoji,priority_rank,created_at")
      .eq("user_id", userId)
      .order("priority_rank", { ascending: true, nullsFirst: false }),
    supabase
      .from("roadmaps")
      .select("id,title,emoji,monument_id,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("goals")
      .select(
        "id,name,emoji,monument_id,roadmap_id,circle_id,status,priority,priority_code,priority_order,global_rank,priority_rank,created_at,monument:monuments(emoji)"
      )
      .eq("user_id", userId),
  ]);

  if (monumentError) {
    console.error("Failed to load monuments for priority editor", monumentError);
  }
  if (roadmapError) {
    console.error("Failed to load roadmaps for priority editor", roadmapError);
  }
  if (goalError) {
    console.error("Failed to load goals for priority editor", goalError);
  }

  const roadmaps = (roadmapData ?? []) as RoadmapRow[];
  const roadmapIds = roadmaps.map((roadmap) => roadmap.id);

  let roadmapItems: RoadmapItemRow[] = [];
  let campaigns: CampaignRow[] = [];
  let campaignGoals: CampaignGoalRow[] = [];
  let roadmapItemErrorMessage: string | null = null;
  let campaignErrorMessage: string | null = null;
  let campaignGoalErrorMessage: string | null = null;

  if (roadmapIds.length > 0) {
    const { data: roadmapItemData, error: roadmapItemError } = await supabase
      .from("roadmap_items")
      .select("id,roadmap_id,item_type,position,campaign_id,goal_id,created_at")
      .eq("user_id", userId)
      .in("roadmap_id", roadmapIds)
      .order("position", { ascending: true });

    if (roadmapItemError) {
      console.error("Failed to load roadmap items for priority editor", roadmapItemError);
      roadmapItemErrorMessage =
        roadmapItemError.message || "Unable to load Roadmap item order.";
    } else {
      roadmapItems = (roadmapItemData ?? []) as RoadmapItemRow[];
    }
  }

  const { data: campaignData, error: campaignError } = await supabase
    .from("campaigns")
    .select(
      "id,name,description,emoji,priority_code,priority_order,scheduling_state,position,roadmap_id,primary_monument_id,created_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (campaignError) {
    console.error("Failed to load campaigns for priority editor", campaignError);
    campaignErrorMessage = campaignError.message || "Unable to load Campaigns.";
  } else {
    campaigns = (campaignData ?? []) as CampaignRow[];
  }

  const campaignIds = campaigns.map((campaign) => campaign.id);

  if (campaignIds.length > 0) {
    const { data: campaignGoalData, error: campaignGoalError } = await supabase
      .from("campaign_goals")
      .select("campaign_id,goal_id,position,created_at")
      .eq("user_id", userId)
      .in("campaign_id", campaignIds)
      .order("position", { ascending: true });

    if (campaignGoalError) {
      console.error("Failed to load campaign goals for priority editor", campaignGoalError);
      campaignGoalErrorMessage =
        campaignGoalError.message || "Unable to load Campaign Goals.";
    } else {
      campaignGoals = (campaignGoalData ?? []) as CampaignGoalRow[];
    }
  }

  const fetchErrorMessages = [];
  if (monumentError) {
    fetchErrorMessages.push(
      `Monuments select error: ${monumentError.message || "Unable to load Monuments."}`
    );
  }
  if (roadmapError) {
    fetchErrorMessages.push(
      `Roadmaps select error: ${roadmapError.message || "Unable to load Roadmaps."}`
    );
  }
  if (goalError) {
    fetchErrorMessages.push(
      `Goals select error: ${goalError.message || "Unable to load Goals."}`
    );
  }
  if (roadmapItemErrorMessage) {
    fetchErrorMessages.push(`Roadmap items select error: ${roadmapItemErrorMessage}`);
  }
  if (campaignErrorMessage) {
    fetchErrorMessages.push(`Campaigns select error: ${campaignErrorMessage}`);
  }
  if (campaignGoalErrorMessage) {
    fetchErrorMessages.push(`Campaign Goals select error: ${campaignGoalErrorMessage}`);
  }

  const goals = (goalData ?? []) as GoalRow[];
  const nonCompletedGoals = goals.filter((goal) => !isCompletedGoal(goal.status));
  const roadmapCards = buildRoadmapCards({
    monuments: (monumentData ?? []) as MonumentRow[],
    roadmaps,
    goals: nonCompletedGoals,
    roadmapItems,
    campaigns,
    campaignGoals,
  });
  const globalPriorityItems = buildGlobalPriorityItems({
    goals: nonCompletedGoals,
    campaigns,
    campaignGoals,
  });

  return (
    <ProtectedRoute>
      <PriorityEditorClient
        initialRoadmaps={roadmapCards}
        initialGlobalPriorityItems={globalPriorityItems}
        initialError={fetchErrorMessages.length ? fetchErrorMessages.join(" ") : null}
      />
    </ProtectedRoute>
  );
}
