import { getSupabaseBrowser } from "@/lib/supabase";

export interface Skill {
  id: string;
  name: string;
}

export async function getSkillsForUser(userId: string): Promise<Skill[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("skills")
    .select("id, name")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching skills:", error);
    throw error;
  }

  return data || [];
}
