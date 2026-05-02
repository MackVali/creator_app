import { getSupabaseBrowser } from "@/lib/supabase";

export interface RoadmapGoal {
  id: string;
  name: string;
  emoji: string | null;
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
  primary_monument_id: string | null;
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

type RoadmapGoalRow = {
  id: string;
  name: string;
  emoji?: string | null;
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
    monumentEmoji: goal.monument?.emoji ?? null,
    roadmap_id: goal.roadmap_id ?? null,
    status: goal.status ?? null,
    allProjectsCompleted,
    global_rank: goal.global_rank ?? null,
    priority_rank: goal.priority_rank ?? null,
  };
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
      created_at,
      goals:goals(id, name, emoji, roadmap_id, status, global_rank, priority_rank, monument:monuments(emoji))
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
    .select("id, title, emoji, created_at, monument_id")
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
  }));

  if (roadmaps.length === 0) {
    return [];
  }

  const roadmapIds = roadmaps.map(roadmap => roadmap.id);

  const { data: legacyGoalRows, error: legacyGoalsError } = await supabase
    .from("goals")
    .select("id, name, emoji, roadmap_id, status, global_rank, priority_rank, monument:monuments(emoji)")
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
          .select("id, name, emoji, roadmap_id, status, global_rank, priority_rank, monument:monuments(emoji)")
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
            "id, name, description, emoji, scheduling_state, position, primary_monument_id"
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
          .select("id, name, emoji, roadmap_id, status, global_rank, priority_rank, monument:monuments(emoji)")
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

  const campaignGoalsByCampaignId = new Map<string, RoadmapCampaignGoal[]>();
  for (const campaignGoal of campaignGoalRows ?? []) {
    const goal = campaignGoalsByGoalId.get(campaignGoal.goal_id);
    if (!goal || isRoadmapGoalCompleted(goal)) {
      continue;
    }

    const goals = campaignGoalsByCampaignId.get(campaignGoal.campaign_id) ?? [];
    goals.push({
      id: goal.id,
      name: goal.name,
      emoji: goal.emoji ?? null,
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
        primary_monument_id: campaign.primary_monument_id ?? null,
        goals: campaignGoalsByCampaignId.get(campaign.id) ?? [],
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

      return !isRoadmapGoalCompleted(item.goal);
    });
    const goalItems = items
      .map(item => item.goal)
      .filter((goal): goal is RoadmapGoal => Boolean(goal));

    return {
      id: roadmap.id,
      title: roadmap.title,
      emoji: roadmap.emoji,
      monument_id: roadmap.monument_id,
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
      created_at,
      goals:goals(id, name, emoji, roadmap_id, status, global_rank, priority_rank, monument:monuments(emoji))
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
    goals: (data.goals ?? []).map(goal => normalizeRoadmapGoal(goal as RoadmapGoalRow)),
  };
}

export async function createCampaign(
  userId: string,
  input: {
    roadmapId?: string | null;
    primaryMonumentId?: string | null;
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
      name: input.name.trim(),
      description: input.description?.trim() || null,
      emoji: input.emoji?.trim() || null,
      scheduling_state: input.schedulingState ?? "ACTIVE",
      position: input.position ?? null,
    })
    .select(
      "id, name, description, emoji, scheduling_state, position, primary_monument_id"
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
    goals: [],
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
