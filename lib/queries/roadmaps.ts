import { getSupabaseBrowser } from "@/lib/supabase";

export interface RoadmapGoal {
  id: string;
  name: string;
  roadmap_id: string | null;
}

export interface Roadmap {
  id: string;
  title: string;
  emoji: string | null;
  goals: RoadmapGoal[];
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
      goals:goals(id, name, roadmap_id)
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
    goals: (row.goals ?? []) as RoadmapGoal[],
  }));
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
      goals:goals(id, name, roadmap_id)
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
    goals: (data.goals ?? []) as RoadmapGoal[],
  };
}

