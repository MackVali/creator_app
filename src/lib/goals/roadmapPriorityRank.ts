import type { SupabaseClient } from "@supabase/supabase-js";

interface NextRoadmapPriorityRankOptions {
  excludeGoalId?: string | null;
}

export async function getNextRoadmapPriorityRank(
  supabase: SupabaseClient,
  roadmapId: string,
  options: NextRoadmapPriorityRankOptions = {}
): Promise<number> {
  const { excludeGoalId = null } = options;

  let query = supabase
    .from("goals")
    .select("id, priority_rank")
    .eq("roadmap_id", roadmapId);

  if (excludeGoalId) {
    query = query.neq("id", excludeGoalId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  let maxRank = 0;
  for (const row of data ?? []) {
    const rank = row.priority_rank;
    if (typeof rank === "number" && Number.isFinite(rank) && rank > maxRank) {
      maxRank = rank;
    }
  }

  return maxRank + 1;
}
