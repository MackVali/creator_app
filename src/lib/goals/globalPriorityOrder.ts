import type { SupabaseClient } from "@supabase/supabase-js";

const VALID_PRIORITY_CODES = new Set([
  "ULTRA-CRITICAL",
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "NO",
]);

interface EnsureGoalGlobalPriorityOrderOptions {
  supabase: SupabaseClient;
  goalId: string;
}

type GoalPriorityOrderRow = {
  id: string;
  user_id?: string | null;
  priority?: string | null;
  priority_code?: string | null;
  priority_order?: number | null;
  status?: string | null;
  circle_id?: string | null;
};

type CampaignPriorityOrderRow = {
  priority_order?: number | null;
};

function normalizePriorityCode(
  priorityCode?: string | null,
  legacyPriority?: string | null
) {
  const normalized = String(priorityCode ?? legacyPriority ?? "NO")
    .trim()
    .toUpperCase();
  return VALID_PRIORITY_CODES.has(normalized) ? normalized : "NO";
}

function hasValidPriorityOrder(priorityOrder?: number | null) {
  return (
    typeof priorityOrder === "number" &&
    Number.isFinite(priorityOrder) &&
    priorityOrder > 0
  );
}

function isCompletedStatus(status?: string | null) {
  return String(status ?? "").trim().toUpperCase() === "COMPLETED";
}

function maxPriorityOrder(rows: Array<{ priority_order?: number | null }>) {
  return rows.reduce((max, row) => {
    const priorityOrder = row.priority_order;
    return hasValidPriorityOrder(priorityOrder)
      ? Math.max(max, priorityOrder)
      : max;
  }, 0);
}

function matchesPriority(row: GoalPriorityOrderRow, priorityCode: string) {
  return normalizePriorityCode(row.priority_code, row.priority) === priorityCode;
}

export async function ensureGoalGlobalPriorityOrder({
  supabase,
  goalId,
}: EnsureGoalGlobalPriorityOrderOptions): Promise<void> {
  const { data: goal, error: goalError } = await supabase
    .from("goals")
    .select("id,user_id,priority,priority_code,priority_order,status,circle_id")
    .eq("id", goalId)
    .maybeSingle();

  if (goalError) {
    throw goalError;
  }

  if (!goal || isCompletedStatus(goal.status) || goal.circle_id) {
    return;
  }

  if (hasValidPriorityOrder(goal.priority_order)) {
    return;
  }

  const userId = typeof goal.user_id === "string" ? goal.user_id : null;
  if (!userId) {
    return;
  }

  const priorityCode = normalizePriorityCode(goal.priority_code, goal.priority);

  const { data: campaignGoalRows, error: campaignGoalError } = await supabase
    .from("campaign_goals")
    .select("campaign_id")
    .eq("user_id", userId)
    .eq("goal_id", goalId);

  if (campaignGoalError) {
    throw campaignGoalError;
  }

  const campaignIds = Array.from(
    new Set(
      (campaignGoalRows ?? [])
        .map((row: { campaign_id?: string | null }) => row.campaign_id)
        .filter((campaignId): campaignId is string => Boolean(campaignId))
    )
  );

  let nextPriorityOrder = 1;

  if (campaignIds.length > 0) {
    const { data: siblingEdges, error: siblingEdgeError } = await supabase
      .from("campaign_goals")
      .select("goal_id")
      .eq("user_id", userId)
      .in("campaign_id", campaignIds);

    if (siblingEdgeError) {
      throw siblingEdgeError;
    }

    const siblingGoalIds = Array.from(
      new Set(
        (siblingEdges ?? [])
          .map((row: { goal_id?: string | null }) => row.goal_id)
          .filter(
            (siblingGoalId): siblingGoalId is string =>
              Boolean(siblingGoalId) && siblingGoalId !== goalId
          )
      )
    );

    if (siblingGoalIds.length > 0) {
      const { data: siblingGoals, error: siblingGoalError } = await supabase
        .from("goals")
        .select("id,priority,priority_code,priority_order,status,circle_id")
        .eq("user_id", userId)
        .in("id", siblingGoalIds);

      if (siblingGoalError) {
        throw siblingGoalError;
      }

      nextPriorityOrder =
        maxPriorityOrder(
          ((siblingGoals ?? []) as GoalPriorityOrderRow[]).filter(
            (row) =>
              !isCompletedStatus(row.status) &&
              !row.circle_id &&
              matchesPriority(row, priorityCode)
          )
        ) + 1;
    }
  } else {
    const [
      { data: goalRows, error: goalRowsError },
      { data: campaignRows, error: campaignRowsError },
      { data: allCampaignGoalRows, error: allCampaignGoalRowsError },
    ] = await Promise.all([
      supabase
        .from("goals")
        .select("id,priority,priority_code,priority_order,status,circle_id")
        .eq("user_id", userId),
      supabase
        .from("campaigns")
        .select("priority_order")
        .eq("user_id", userId)
        .eq("priority_code", priorityCode),
      supabase.from("campaign_goals").select("goal_id").eq("user_id", userId),
    ]);

    if (goalRowsError) {
      throw goalRowsError;
    }
    if (campaignRowsError) {
      throw campaignRowsError;
    }
    if (allCampaignGoalRowsError) {
      throw allCampaignGoalRowsError;
    }

    const campaignLinkedGoalIds = new Set(
      (allCampaignGoalRows ?? [])
        .map((row: { goal_id?: string | null }) => row.goal_id)
        .filter((campaignGoalId): campaignGoalId is string =>
          Boolean(campaignGoalId)
        )
    );

    const existingStandaloneGoalRows = (
      (goalRows ?? []) as GoalPriorityOrderRow[]
    ).filter(
      (row) =>
        row.id !== goalId &&
        !campaignLinkedGoalIds.has(row.id) &&
        !isCompletedStatus(row.status) &&
        !row.circle_id &&
        matchesPriority(row, priorityCode)
    );

    nextPriorityOrder =
      Math.max(
        maxPriorityOrder(existingStandaloneGoalRows),
        maxPriorityOrder((campaignRows ?? []) as CampaignPriorityOrderRow[])
      ) + 1;
  }

  const { error: updateError } = await supabase
    .from("goals")
    .update({
      priority_code: priorityCode,
      priority_order: nextPriorityOrder,
    })
    .eq("id", goalId);

  if (updateError) {
    throw updateError;
  }
}
