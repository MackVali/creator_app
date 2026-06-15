import { getSupabaseBrowser } from "@/lib/supabase";
import { findMissingMonumentRoadmapGoalIds } from "./roadmap-reconciliation";

export { findMissingMonumentRoadmapGoalIds } from "./roadmap-reconciliation";

export interface RoadmapGoal {
  id: string;
  name: string;
  emoji: string | null;
  monument_id: string | null;
  circle_id: string | null;
  monumentEmoji: string | null;
  roadmap_id: string | null;
  status: string | null;
  allProjectsCompleted: boolean;
  global_rank: number | null;
  priority_rank: number | null;
}

export interface Roadmap {
  id: string;
  title: string;
  emoji: string | null;
  monument_id?: string | null;
  circle_id?: string | null;
  goals: RoadmapGoal[];
}

export type RoadmapItemType = "CAMPAIGN" | "GOAL";

export type CampaignSchedulingState =
  | "ACTIVE"
  | "PAUSED"
  | "COMPLETED";

export interface RoadmapCampaignGoal {
  id: string;
  name: string;
  emoji: string | null;
  monument_id: string | null;
  circle_id: string | null;
  monumentEmoji: string | null;
  position: number;
  status: string | null;
  allProjectsCompleted: boolean;
  global_rank: number | null;
  priority_rank: number | null;
}

export interface RoadmapCampaign {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  scheduling_state: CampaignSchedulingState;
  position: number | null;
  roadmap_id?: string | null;
  primary_monument_id: string | null;
  primary_circle_id?: string | null;
  goals: RoadmapCampaignGoal[];
}

export interface RoadmapMixedItem {
  id: string;
  roadmap_id: string;
  item_type: RoadmapItemType;
  position: number;
  campaign: RoadmapCampaign | null;
  goal: RoadmapGoal | null;
}

export interface RoadmapWithItems extends Roadmap {
  monument_id: string | null;
  circle_id?: string | null;
  items: RoadmapMixedItem[];
}

export interface RoadmapItemRecord {
  id: string;
  user_id: string;
  roadmap_id: string;
  item_type: RoadmapItemType;
  position: number;
  campaign_id: string | null;
  goal_id: string | null;
}

export interface CampaignGoalRecord {
  campaign_id: string;
  goal_id: string;
  position: number;
}

export interface GoalCampaignCardGoal {
  id: string;
  position: number;
}

export interface GoalCampaignCardData {
  id: string;
  name: string;
  emoji: string | null;
  description: string | null;
  scheduling_state: CampaignSchedulingState;
  position: number | null;
  roadmap_id: string | null;
  primary_monument_id: string | null;
  primary_circle_id: string | null;
  goals: GoalCampaignCardGoal[];
}

export interface MonumentRoadmapReconciliationResult {
  roadmapId: string | null;
  insertedCount: number;
}

type RoadmapGoalRow = {
  id: string;
  name: string;
  emoji?: string | null;
  monument_id?: string | null;
  circle_id?: string | null;
  roadmap_id?: string | null;
  status?: string | null;
  global_rank?: number | null;
  priority_rank?: number | null;
  monument?: {
    emoji?: string | null;
  } | null;
};

type GoalProjectRow = {
  id: string;
  goal_id: string | null;
  completed_at: string | null;
};

function buildGoalProjectsCompletedMap(
  projects: GoalProjectRow[]
): Map<string, boolean> {
  const projectCountsByGoalId = new Map<string, number>();
  const completedCountsByGoalId = new Map<string, number>();

  for (const project of projects) {
    if (!project.goal_id) {
      continue;
    }

    projectCountsByGoalId.set(
      project.goal_id,
      (projectCountsByGoalId.get(project.goal_id) ?? 0) + 1
    );

    if (project.completed_at) {
      completedCountsByGoalId.set(
        project.goal_id,
        (completedCountsByGoalId.get(project.goal_id) ?? 0) + 1
      );
    }
  }

  const allProjectsCompletedByGoalId = new Map<string, boolean>();
  for (const [goalId, projectCount] of projectCountsByGoalId) {
    const completedCount = completedCountsByGoalId.get(goalId) ?? 0;
    allProjectsCompletedByGoalId.set(
      goalId,
      projectCount > 0 && completedCount === projectCount
    );
  }

  return allProjectsCompletedByGoalId;
}

function normalizeRoadmapGoal(
  goal: RoadmapGoalRow,
  allProjectsCompleted = false
): RoadmapGoal {
  return {
    id: goal.id,
    name: goal.name,
    emoji: goal.emoji ?? null,
    monument_id: goal.monument_id ?? null,
    circle_id: goal.circle_id ?? null,
    monumentEmoji: goal.monument?.emoji ?? null,
    roadmap_id: goal.roadmap_id ?? null,
    status: goal.status ?? null,
    allProjectsCompleted,
    global_rank: goal.global_rank ?? null,
    priority_rank: goal.priority_rank ?? null,
  };
}

function sortCampaignGoalsByPosition<T extends { position: number }>(
  goals: T[]
): T[] {
  return [...goals]
    .map((goal, index) => ({ goal, index }))
    .sort((a, b) => {
      const positionDiff = a.goal.position - b.goal.position;
      return positionDiff === 0 ? a.index - b.index : positionDiff;
    })
    .map(({ goal }) => goal);
}

function isRoadmapGoalCompleted(goal: {
  status?: string | null;
  allProjectsCompleted?: boolean;
}): boolean {
  return (
    (typeof goal.status === "string" &&
      goal.status.trim().toUpperCase() === "COMPLETED") ||
    goal.allProjectsCompleted === true
  );
}

function isRoadmapGoalLinkedToContext(
  goal: { monument_id?: string | null; circle_id?: string | null },
  context: { monument_id?: string | null; circle_id?: string | null }
): boolean {
  if (context.circle_id) {
    return goal.circle_id === context.circle_id;
  }
  if (context.monument_id) {
    return goal.monument_id === context.monument_id;
  }
  return true;
}

async function requireCurrentUserId(): Promise<string> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    console.error("Error fetching current user:", error);
    throw error;
  }

  if (!user?.id) {
    throw new Error("Authenticated user not available");
  }

  return user.id;
}

export async function listRoadmaps(
  userId: string
): Promise<Roadmap[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("roadmaps")
    .select(`
      id,
      title,
      emoji,
      monument_id,
      circle_id,
      created_at,
      goals:goals(id, name, emoji, monument_id, circle_id, roadmap_id, status, global_rank, priority_rank, monument:monuments(emoji))
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching roadmaps:", error);
    throw error;
  }

  return (data ?? []).map(row => ({
    id: row.id,
    title: row.title,
    emoji: row.emoji ?? null,
    monument_id: row.monument_id ?? null,
    circle_id: row.circle_id ?? null,
    goals: (row.goals ?? []).map(goal => normalizeRoadmapGoal(goal as RoadmapGoalRow)),
  }));
}

export async function listRoadmapsWithItems(
  userId: string
): Promise<RoadmapWithItems[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data: roadmapRows, error: roadmapsError } = await supabase
    .from("roadmaps")
    .select("id, title, emoji, created_at, monument_id, circle_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (roadmapsError) {
    console.error("Error fetching roadmaps with items:", roadmapsError);
    throw roadmapsError;
  }

  const roadmaps = (roadmapRows ?? []).map(row => ({
    id: row.id,
    title: row.title,
    emoji: row.emoji ?? null,
    monument_id: row.monument_id ?? null,
    circle_id: row.circle_id ?? null,
  }));

  if (roadmaps.length === 0) {
    return [];
  }

  const roadmapIds = roadmaps.map(roadmap => roadmap.id);

  const { data: legacyGoalRows, error: legacyGoalsError } = await supabase
    .from("goals")
    .select("id, name, emoji, monument_id, circle_id, roadmap_id, status, global_rank, priority_rank, monument:monuments(emoji)")
    .in("roadmap_id", roadmapIds)
    .order("priority_rank", { ascending: true, nullsFirst: false });

  if (legacyGoalsError) {
    console.error("Error fetching legacy roadmap goals:", legacyGoalsError);
    throw legacyGoalsError;
  }

  const { data: roadmapItemRows, error: roadmapItemsError } = await supabase
    .from("roadmap_items")
    .select("id, user_id, roadmap_id, item_type, position, campaign_id, goal_id")
    .in("roadmap_id", roadmapIds)
    .order("position", { ascending: true });

  if (roadmapItemsError) {
    console.error("Error fetching roadmap items:", roadmapItemsError);
    throw roadmapItemsError;
  }

  const roadmapItems = roadmapItemRows ?? [];
  const legacyGoals = [...(legacyGoalRows ?? [])].sort((a, b) => {
    const aRank = a.priority_rank ?? Number.POSITIVE_INFINITY;
    const bRank = b.priority_rank ?? Number.POSITIVE_INFINITY;
    if (aRank !== bRank) {
      return aRank - bRank;
    }

    return a.name.localeCompare(b.name);
  });
  const roadmapGoalIds = Array.from(
    new Set(
      roadmapItems
        .map(item => item.goal_id)
        .filter((goalId): goalId is string => Boolean(goalId))
    )
  );
  const campaignIds = Array.from(
    new Set(
      roadmapItems
        .map(item => item.campaign_id)
        .filter((campaignId): campaignId is string => Boolean(campaignId))
    )
  );

  const { data: roadmapGoalRows, error: roadmapGoalsError } =
    roadmapGoalIds.length > 0
      ? await supabase
          .from("goals")
          .select("id, name, emoji, monument_id, circle_id, roadmap_id, status, global_rank, priority_rank, monument:monuments(emoji)")
          .in("id", roadmapGoalIds)
      : { data: [], error: null };

  if (roadmapGoalsError) {
    console.error("Error fetching roadmap item goals:", roadmapGoalsError);
    throw roadmapGoalsError;
  }

  const { data: campaignRows, error: campaignsError } =
    campaignIds.length > 0
      ? await supabase
          .from("campaigns")
          .select(
            "id, name, description, emoji, scheduling_state, position, roadmap_id, primary_monument_id, primary_circle_id"
          )
          .in("id", campaignIds)
      : { data: [], error: null };

  if (campaignsError) {
    console.error("Error fetching roadmap item campaigns:", campaignsError);
    throw campaignsError;
  }

  const { data: campaignGoalRows, error: campaignGoalsError } =
    campaignIds.length > 0
      ? await supabase
          .from("campaign_goals")
          .select("campaign_id, goal_id, position")
          .in("campaign_id", campaignIds)
          .order("position", { ascending: true })
      : { data: [], error: null };

  if (campaignGoalsError) {
    console.error("Error fetching campaign goals:", campaignGoalsError);
    throw campaignGoalsError;
  }

  const campaignGoalIds = Array.from(
    new Set(
      (campaignGoalRows ?? [])
        .map(campaignGoal => campaignGoal.goal_id)
        .filter((goalId): goalId is string => Boolean(goalId))
    )
  );

  const { data: campaignGoalGoalRows, error: campaignGoalGoalError } =
    campaignGoalIds.length > 0
      ? await supabase
          .from("goals")
          .select("id, name, emoji, monument_id, circle_id, roadmap_id, status, global_rank, priority_rank, monument:monuments(emoji)")
          .in("id", campaignGoalIds)
      : { data: [], error: null };

  if (campaignGoalGoalError) {
    console.error("Error fetching campaign goal records:", campaignGoalGoalError);
    throw campaignGoalGoalError;
  }

  const projectGoalIds = Array.from(
    new Set([...roadmapGoalIds, ...campaignGoalIds, ...legacyGoals.map(goal => goal.id)])
  );

  const { data: projectRows, error: projectsError } =
    projectGoalIds.length > 0
      ? await supabase
          .from("projects")
          .select("id, goal_id, completed_at")
          .in("goal_id", projectGoalIds)
      : { data: [], error: null };

  if (projectsError) {
    console.error("Error fetching roadmap goal projects:", projectsError);
    throw projectsError;
  }

  const goalProjectsCompletedMap = buildGoalProjectsCompletedMap(
    (projectRows ?? []) as GoalProjectRow[]
  );

  const roadmapGoalsById = new Map<string, RoadmapGoal>(
    (roadmapGoalRows ?? []).map(goal => [
      goal.id,
      {
        ...normalizeRoadmapGoal(
          goal as RoadmapGoalRow,
          goalProjectsCompletedMap.get(goal.id) ?? false
        ),
      },
    ])
  );

  const campaignGoalsByGoalId = new Map<string, RoadmapGoal>(
    (campaignGoalGoalRows ?? []).map(goal => [
      goal.id,
      {
        ...normalizeRoadmapGoal(
          goal as RoadmapGoalRow,
          goalProjectsCompletedMap.get(goal.id) ?? false
        ),
      },
    ])
  );

  const campaignContextById = new Map(
    (campaignRows ?? []).map(campaign => [
      campaign.id,
      {
        monument_id: campaign.primary_monument_id ?? null,
        circle_id: campaign.primary_circle_id ?? null,
      },
    ])
  );

  const campaignGoalsByCampaignId = new Map<string, RoadmapCampaignGoal[]>();
  for (const campaignGoal of campaignGoalRows ?? []) {
    const goal = campaignGoalsByGoalId.get(campaignGoal.goal_id);
    if (!goal) {
      continue;
    }
    const campaignContext = campaignContextById.get(campaignGoal.campaign_id);
    if (
      campaignContext &&
      !isRoadmapGoalLinkedToContext(goal, campaignContext)
    ) {
      continue;
    }

    const goals = campaignGoalsByCampaignId.get(campaignGoal.campaign_id) ?? [];
    goals.push({
      id: goal.id,
      name: goal.name,
      emoji: goal.emoji ?? null,
      monument_id: goal.monument_id ?? null,
      circle_id: goal.circle_id ?? null,
      monumentEmoji: goal.monumentEmoji ?? null,
      position: campaignGoal.position,
      status: goal.status ?? null,
      allProjectsCompleted: goal.allProjectsCompleted,
      global_rank: goal.global_rank ?? null,
      priority_rank: goal.priority_rank ?? null,
    });
    campaignGoalsByCampaignId.set(campaignGoal.campaign_id, goals);
  }

  const legacyGoalsByRoadmapId = new Map<
    string,
    Array<{ goal: RoadmapGoal; priority_rank: number | null }>
  >();
  for (const goal of legacyGoals) {
    const roadmapGoals = legacyGoalsByRoadmapId.get(goal.roadmap_id) ?? [];
    roadmapGoals.push({
      goal: {
        ...normalizeRoadmapGoal(
          goal as RoadmapGoalRow,
          goalProjectsCompletedMap.get(goal.id) ?? false
        ),
      },
      priority_rank: goal.priority_rank ?? null,
    });
    legacyGoalsByRoadmapId.set(goal.roadmap_id, roadmapGoals);
  }

  const campaignsById = new Map<string, RoadmapCampaign>(
    (campaignRows ?? [])
      .map(campaign => ({
        id: campaign.id,
        name: campaign.name,
        description: campaign.description ?? null,
        emoji: campaign.emoji ?? null,
        scheduling_state: campaign.scheduling_state as CampaignSchedulingState,
        position: campaign.position,
        roadmap_id: campaign.roadmap_id ?? null,
        primary_monument_id: campaign.primary_monument_id ?? null,
        primary_circle_id: campaign.primary_circle_id ?? null,
        goals: sortCampaignGoalsByPosition(
          campaignGoalsByCampaignId.get(campaign.id) ?? []
        ),
      }))
      .filter(campaign => campaign.goals.length > 0)
      .map(campaign => [campaign.id, campaign])
  );

  const roadmapItemsByRoadmapId = new Map<string, RoadmapMixedItem[]>();
  for (const item of roadmapItems) {
    const items = roadmapItemsByRoadmapId.get(item.roadmap_id) ?? [];
    items.push({
      id: item.id,
      roadmap_id: item.roadmap_id,
      item_type: item.item_type as RoadmapItemType,
      position: item.position,
      campaign: item.campaign_id ? campaignsById.get(item.campaign_id) ?? null : null,
      goal: item.goal_id ? roadmapGoalsById.get(item.goal_id) ?? null : null,
    });
    roadmapItemsByRoadmapId.set(item.roadmap_id, items);
  }

  return roadmaps.map(roadmap => {
    const existingItems = roadmapItemsByRoadmapId.get(roadmap.id) ?? [];
    const legacyRoadmapGoals = legacyGoalsByRoadmapId.get(roadmap.id) ?? [];
    const items = (
      existingItems.length > 0
        ? existingItems
        : legacyRoadmapGoals.map(({ goal, priority_rank }, index) => {
            return {
              id: `legacy-goal-${goal.id}`,
              roadmap_id: roadmap.id,
              item_type: "GOAL" as const,
              position: priority_rank ?? index + 1,
              campaign: null,
              goal,
            };
          })
    ).filter(item => {
      if (item.item_type === "CAMPAIGN") {
        return Boolean(item.campaign);
      }

      if (item.item_type !== "GOAL" || !item.goal) {
        return true;
      }

      return (
        isRoadmapGoalLinkedToContext(item.goal, roadmap) &&
        !isRoadmapGoalCompleted(item.goal)
      );
    });
    const goalItems = items
      .map(item => item.goal)
      .filter((goal): goal is RoadmapGoal => Boolean(goal));

    return {
      id: roadmap.id,
      title: roadmap.title,
      emoji: roadmap.emoji,
      monument_id: roadmap.monument_id,
      circle_id: roadmap.circle_id,
      goals: goalItems,
      items,
    };
  });
}

export async function createRoadmap(
  userId: string,
  roadmap: { title: string; emoji?: string | null }
): Promise<Roadmap> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("roadmaps")
    .insert({
      user_id: userId,
      title: roadmap.title.trim(),
      emoji: roadmap.emoji?.trim() || null,
    })
    .select(`
      id,
      title,
      emoji,
      monument_id,
      circle_id,
      created_at,
      goals:goals(id, name, emoji, monument_id, circle_id, roadmap_id, status, global_rank, priority_rank, monument:monuments(emoji))
    `)
    .single();

  if (error) {
    console.error("Error creating roadmap:", error);
    throw error;
  }

  return {
    id: data.id,
    title: data.title,
    emoji: data.emoji ?? null,
    monument_id: data.monument_id ?? null,
    circle_id: data.circle_id ?? null,
    goals: (data.goals ?? []).map(goal => normalizeRoadmapGoal(goal as RoadmapGoalRow)),
  };
}

export async function listGoalCampaignCards(
  userId: string
): Promise<GoalCampaignCardData[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data: campaignRows, error: campaignsError } = await supabase
    .from("campaigns")
    .select(
      "id, name, description, emoji, scheduling_state, position, roadmap_id, primary_monument_id, primary_circle_id"
    )
    .eq("user_id", userId)
    .order("position", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (campaignsError) {
    console.error("Error fetching goal campaign cards:", campaignsError);
    throw campaignsError;
  }

  if (!campaignRows || campaignRows.length === 0) {
    return [];
  }

  const campaignIds = campaignRows.map(campaign => campaign.id);
  const { data: campaignGoalRows, error: campaignGoalsError } = await supabase
    .from("campaign_goals")
    .select("campaign_id, goal_id, position")
    .eq("user_id", userId)
    .in("campaign_id", campaignIds)
    .order("position", { ascending: true });

  if (campaignGoalsError) {
    console.error("Error fetching goal campaign card goals:", campaignGoalsError);
    throw campaignGoalsError;
  }

  const goalsByCampaignId = new Map<string, GoalCampaignCardGoal[]>();
  for (const campaignGoal of campaignGoalRows ?? []) {
    const goals = goalsByCampaignId.get(campaignGoal.campaign_id) ?? [];
    goals.push({
      id: campaignGoal.goal_id,
      position: campaignGoal.position,
    });
    goalsByCampaignId.set(campaignGoal.campaign_id, goals);
  }

  return campaignRows.map(campaign => ({
    id: campaign.id,
    name: campaign.name,
    emoji: campaign.emoji ?? null,
    description: campaign.description ?? null,
    scheduling_state: campaign.scheduling_state as CampaignSchedulingState,
    position: campaign.position ?? null,
    roadmap_id: campaign.roadmap_id ?? null,
    primary_monument_id: campaign.primary_monument_id ?? null,
    primary_circle_id: campaign.primary_circle_id ?? null,
    goals: sortCampaignGoalsByPosition(goalsByCampaignId.get(campaign.id) ?? []),
  }));
}

export async function createCampaign(
  userId: string,
  input: {
    roadmapId?: string | null;
    primaryMonumentId?: string | null;
    primaryCircleId?: string | null;
    name: string;
    description?: string | null;
    emoji?: string | null;
    schedulingState?: CampaignSchedulingState;
    position?: number | null;
  }
): Promise<RoadmapCampaign> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      user_id: userId,
      roadmap_id: input.roadmapId ?? null,
      primary_monument_id: input.primaryMonumentId ?? null,
      primary_circle_id: input.primaryCircleId ?? null,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      emoji: input.emoji?.trim() || null,
      scheduling_state: input.schedulingState ?? "ACTIVE",
      position: input.position ?? null,
    })
    .select(
      "id, name, description, emoji, scheduling_state, position, primary_monument_id, primary_circle_id"
    )
    .single();

  if (error) {
    console.error("Error creating campaign:", error);
    throw error;
  }

  return {
    id: data.id,
    name: data.name,
    description: data.description ?? null,
    emoji: data.emoji ?? null,
    scheduling_state: data.scheduling_state as CampaignSchedulingState,
    position: data.position ?? null,
    primary_monument_id: data.primary_monument_id ?? null,
    primary_circle_id: data.primary_circle_id ?? null,
    goals: [],
  };
}

export async function updateCampaignDetails(
  userId: string,
  campaignId: string,
  input: { name: string; emoji?: string | null }
): Promise<{ id: string; name: string; emoji: string | null }> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const name = input.name.trim();
  if (!name) {
    throw new Error("Campaign name is required.");
  }

  const emoji = input.emoji?.trim() || null;

  const { data, error } = await supabase
    .from("campaigns")
    .update({
      name,
      emoji,
    })
    .eq("id", campaignId)
    .eq("user_id", userId)
    .select("id, name, emoji")
    .single();

  if (error) {
    console.error("Error updating campaign details:", error);
    throw error;
  }

  return {
    id: data.id,
    name: data.name,
    emoji: data.emoji ?? null,
  };
}

export async function addCampaignToRoadmap(
  userId: string,
  input: {
    roadmapId: string;
    campaignId: string;
    position: number;
  }
): Promise<RoadmapItemRecord> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("roadmap_items")
    .insert({
      user_id: userId,
      roadmap_id: input.roadmapId,
      item_type: "CAMPAIGN",
      position: input.position,
      campaign_id: input.campaignId,
      goal_id: null,
    })
    .select("id, user_id, roadmap_id, item_type, position, campaign_id, goal_id")
    .single();

  if (error) {
    console.error("Error adding campaign to roadmap:", error);
    throw error;
  }

  return {
    id: data.id,
    user_id: data.user_id,
    roadmap_id: data.roadmap_id,
    item_type: data.item_type as RoadmapItemType,
    position: data.position,
    campaign_id: data.campaign_id ?? null,
    goal_id: data.goal_id ?? null,
  };
}

export async function addGoalToRoadmapItems(
  userId: string,
  input: {
    roadmapId: string;
    goalId: string;
    position: number;
  }
): Promise<RoadmapItemRecord> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("roadmap_items")
    .insert({
      user_id: userId,
      roadmap_id: input.roadmapId,
      item_type: "GOAL",
      position: input.position,
      campaign_id: null,
      goal_id: input.goalId,
    })
    .select("id, user_id, roadmap_id, item_type, position, campaign_id, goal_id")
    .single();

  if (error) {
    console.error("Error adding goal to roadmap items:", error);
    throw error;
  }

  return {
    id: data.id,
    user_id: data.user_id,
    roadmap_id: data.roadmap_id,
    item_type: data.item_type as RoadmapItemType,
    position: data.position,
    campaign_id: data.campaign_id ?? null,
    goal_id: data.goal_id ?? null,
  };
}

export async function createTopLevelGoalRoadmapItem(input: {
  roadmapId: string;
  goalId: string;
  position: number;
}): Promise<RoadmapItemRecord> {
  const userId = await requireCurrentUserId();

  return addGoalToRoadmapItems(userId, input);
}

function normalizeMonumentRoadmapReconciliationResult(
  data: unknown
): MonumentRoadmapReconciliationResult {
  const row = Array.isArray(data) ? data[0] : data;
  const record =
    row && typeof row === "object"
      ? (row as { roadmap_id?: unknown; inserted_count?: unknown })
      : null;
  const insertedCount =
    typeof record?.inserted_count === "number" &&
    Number.isFinite(record.inserted_count)
      ? record.inserted_count
      : 0;

  return {
    roadmapId:
      typeof record?.roadmap_id === "string" ? record.roadmap_id : null,
    insertedCount,
  };
}

async function ensureMonumentGoalsInTrueRoadmapFallback(
  userId: string,
  monumentId: string
): Promise<MonumentRoadmapReconciliationResult> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data: roadmapRow, error: roadmapError } = await supabase
    .from("roadmaps")
    .select("id")
    .eq("user_id", userId)
    .eq("monument_id", monumentId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (roadmapError) {
    throw roadmapError;
  }

  const roadmapId =
    typeof roadmapRow?.id === "string" && roadmapRow.id.length > 0
      ? roadmapRow.id
      : null;
  if (!roadmapId) {
    return { roadmapId: null, insertedCount: 0 };
  }

  const [
    { data: goalRows, error: goalsError },
    { data: roadmapItemRows, error: roadmapItemsError },
  ] = await Promise.all([
    supabase
      .from("goals")
      .select("id, created_at")
      .eq("user_id", userId)
      .eq("monument_id", monumentId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("roadmap_items")
      .select("id, item_type, campaign_id, goal_id, position")
      .eq("user_id", userId)
      .eq("roadmap_id", roadmapId)
      .order("position", { ascending: true }),
  ]);

  if (goalsError) {
    throw goalsError;
  }
  if (roadmapItemsError) {
    throw roadmapItemsError;
  }

  const roadmapItems = roadmapItemRows ?? [];
  const campaignIds = Array.from(
    new Set(
      roadmapItems
        .map((item) =>
          typeof item.campaign_id === "string" && item.campaign_id.length > 0
            ? item.campaign_id
            : null
        )
        .filter((campaignId): campaignId is string => campaignId !== null)
    )
  );
  const { data: campaignGoalRows, error: campaignGoalsError } =
    campaignIds.length > 0
      ? await supabase
          .from("campaign_goals")
          .select("goal_id")
          .eq("user_id", userId)
          .in("campaign_id", campaignIds)
      : { data: [], error: null };

  if (campaignGoalsError) {
    throw campaignGoalsError;
  }

  const missingGoalIds = findMissingMonumentRoadmapGoalIds({
    monumentGoalIds: (goalRows ?? [])
      .map((goal) => goal.id)
      .filter((goalId): goalId is string => Boolean(goalId)),
    roadmapGoalItemIds: roadmapItems
      .map((item) =>
        item.item_type === "GOAL" &&
        typeof item.goal_id === "string" &&
        item.goal_id.length > 0
          ? item.goal_id
          : null
      )
      .filter((goalId): goalId is string => goalId !== null),
    campaignGoalIds: (campaignGoalRows ?? [])
      .map((campaignGoal) => campaignGoal.goal_id)
      .filter((goalId): goalId is string => Boolean(goalId)),
  });

  if (missingGoalIds.length === 0) {
    return { roadmapId, insertedCount: 0 };
  }

  const maxPosition = roadmapItems.reduce((max, item) => {
    const position =
      typeof item.position === "number" && Number.isFinite(item.position)
        ? item.position
        : 0;
    return Math.max(max, position);
  }, 0);

  const { error: insertError } = await supabase.from("roadmap_items").insert(
    missingGoalIds.map((goalId, index) => ({
      user_id: userId,
      roadmap_id: roadmapId,
      item_type: "GOAL",
      campaign_id: null,
      goal_id: goalId,
      position: maxPosition + index + 1,
    }))
  );

  if (insertError) {
    throw insertError;
  }

  const { error: rankError } = await supabase.rpc(
    "recalculate_goal_global_rank"
  );
  if (rankError) {
    console.warn(
      "Unable to recalculate goal global rank after roadmap reconciliation:",
      rankError
    );
  }

  return { roadmapId, insertedCount: missingGoalIds.length };
}

export async function ensureMonumentGoalsInTrueRoadmap(
  userId: string,
  monumentId: string
): Promise<MonumentRoadmapReconciliationResult> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase.rpc(
    "ensure_monument_true_roadmap_items",
    {
      p_monument_id: monumentId,
    }
  );

  if (!error) {
    return normalizeMonumentRoadmapReconciliationResult(data);
  }

  console.warn(
    "True roadmap reconciliation RPC failed; falling back to client reconciliation:",
    error
  );
  return ensureMonumentGoalsInTrueRoadmapFallback(userId, monumentId);
}

export async function addGoalToCampaign(
  userId: string,
  input: {
    campaignId: string;
    goalId: string;
    position: number;
  }
): Promise<CampaignGoalRecord> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("campaign_goals")
    .insert({
      user_id: userId,
      campaign_id: input.campaignId,
      goal_id: input.goalId,
      position: input.position,
    })
    .select("campaign_id, goal_id, position")
    .single();

  if (error) {
    console.error("Error adding goal to campaign:", error);
    throw error;
  }

  return {
    campaign_id: data.campaign_id,
    goal_id: data.goal_id,
    position: data.position,
  };
}

export async function saveRoadmapItemOrder(
  roadmapId: string,
  itemIds: string[]
): Promise<void> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { error } = await supabase.rpc("save_roadmap_item_order", {
    p_roadmap_id: roadmapId,
    p_item_ids: itemIds,
  });

  if (error) {
    console.error("Error saving roadmap item order:", error);
    throw error;
  }
}

export async function saveCampaignGoalOrder(
  campaignId: string,
  goalIds: string[]
): Promise<void> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { error } = await supabase.rpc("save_campaign_goal_order", {
    p_campaign_id: campaignId,
    p_goal_ids: goalIds,
  });

  if (error) {
    console.error("Error saving campaign goal order:", error);
    throw error;
  }
}

export async function updateCampaignSchedulingState(
  userId: string,
  campaignId: string,
  schedulingState: CampaignSchedulingState
): Promise<void> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { error } = await supabase
    .from("campaigns")
    .update({
      scheduling_state: schedulingState,
    })
    .eq("id", campaignId)
    .eq("user_id", userId);

  if (error) {
    console.error("Error updating campaign scheduling state:", error);
    throw error;
  }
}

export async function updateRoadmapMonument(
  userId: string,
  roadmapId: string,
  monumentId: string | null
): Promise<void> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { error } = await supabase
    .from("roadmaps")
    .update({
      monument_id: monumentId,
    })
    .eq("id", roadmapId)
    .eq("user_id", userId);

  if (error) {
    console.error("Error updating roadmap monument:", error);
    throw error;
  }
}
