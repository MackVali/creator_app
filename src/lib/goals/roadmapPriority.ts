import type { SupabaseClient } from "@supabase/supabase-js";

interface EnsureGoalRoadmapPriorityRankOptions {
  supabase: SupabaseClient;
  goalId: string;
  roadmapId: string;
}

export async function ensureGoalRoadmapPriorityRank({
  supabase,
  goalId,
  roadmapId,
}: EnsureGoalRoadmapPriorityRankOptions): Promise<void> {
  const { data: roadmapGoals, error: fetchError } = await supabase
    .from("goals")
    .select("id")
    .eq("roadmap_id", roadmapId)
    .neq("id", goalId)
    .order("priority_rank", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (fetchError) {
    throw fetchError;
  }

  const orderedGoalIds = [
    ...(roadmapGoals ?? []).map((goal) => goal.id),
    goalId,
  ];

  const { error: saveError } = await supabase.rpc("save_roadmap_goal_order", {
    p_roadmap_id: roadmapId,
    p_goal_ids: orderedGoalIds,
  });

  if (saveError) {
    throw saveError;
  }
}
