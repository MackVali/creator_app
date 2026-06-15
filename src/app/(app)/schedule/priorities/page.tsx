import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { getSupabaseServer } from "@/lib/supabase";
import PriorityEditorClient from "./PriorityEditorClient";
import {
  compareRankValues,
  normalizePriority,
  parseGlobalRank,
  sortRoadmapItems,
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
  status?: string | null;
  priority?: string | null;
  priority_code?: string | null;
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
    priorityRank: parseGlobalRank(row.priority_rank),
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
              id: campaign.id,
              name: (campaign.name ?? "").trim() || "Untitled Campaign",
              emoji: campaign.emoji ?? null,
              description: campaign.description ?? null,
              schedulingState: campaign.scheduling_state ?? null,
              position,
              goals: campaignGoalsForCard.map(normalizeGoal),
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
        "id,name,emoji,monument_id,roadmap_id,status,priority,priority_code,global_rank,priority_rank,created_at,monument:monuments(emoji)"
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

    const campaignIds = Array.from(
      new Set(
        roadmapItems
          .map((item) => item.campaign_id)
          .filter((campaignId): campaignId is string => Boolean(campaignId))
      )
    );

    if (campaignIds.length > 0) {
      const [
        { data: campaignData, error: campaignError },
        { data: campaignGoalData, error: campaignGoalError },
      ] = await Promise.all([
        supabase
          .from("campaigns")
          .select(
            "id,name,description,emoji,scheduling_state,position,roadmap_id,primary_monument_id,created_at"
          )
          .eq("user_id", userId)
          .in("id", campaignIds),
        supabase
          .from("campaign_goals")
          .select("campaign_id,goal_id,position,created_at")
          .eq("user_id", userId)
          .in("campaign_id", campaignIds)
          .order("position", { ascending: true }),
      ]);

      if (campaignError) {
        console.error("Failed to load campaigns for priority editor", campaignError);
        campaignErrorMessage = campaignError.message || "Unable to load Campaigns.";
      } else {
        campaigns = (campaignData ?? []) as CampaignRow[];
      }

      if (campaignGoalError) {
        console.error("Failed to load campaign goals for priority editor", campaignGoalError);
        campaignGoalErrorMessage =
          campaignGoalError.message || "Unable to load Campaign Goals.";
      } else {
        campaignGoals = (campaignGoalData ?? []) as CampaignGoalRow[];
      }
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

  const roadmapCards = buildRoadmapCards({
    monuments: (monumentData ?? []) as MonumentRow[],
    roadmaps,
    goals: ((goalData ?? []) as GoalRow[]).filter((goal) => !isCompletedGoal(goal.status)),
    roadmapItems,
    campaigns,
    campaignGoals,
  });

  return (
    <ProtectedRoute>
      <PriorityEditorClient
        initialRoadmaps={roadmapCards}
        initialError={fetchErrorMessages.length ? fetchErrorMessages.join(" ") : null}
      />
    </ProtectedRoute>
  );
}
