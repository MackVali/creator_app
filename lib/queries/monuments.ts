import { getSupabaseBrowser } from "@/lib/supabase";

export interface Monument {
  id: string;
  title: string;
  emoji: string | null;
}

export async function getMonumentsForUser(
  userId: string
): Promise<Monument[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("monuments")
    .select("id, title, emoji")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching monuments:", error);
    throw error;
  }

  return (data ?? []).map(monument => ({
    id: monument.id,
    title: monument.title,
    emoji: (monument as { emoji?: string | null }).emoji ?? null,
  }));
}
