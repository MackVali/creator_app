import { getSupabaseBrowser } from "@/lib/supabase";

export interface Skill {
  id: string;
  name: string;
  icon?: string | null;
  cat_id?: string | null;
  monument_id?: string | null;
}

export async function getSkillsForUser(userId: string): Promise<Skill[]> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    throw new Error("Supabase client not available");
  }

  const { data, error } = await supabase
    .from("skills")
    .select("id, name, icon, cat_id, monument_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching skills:", error);
    throw error;
  }

  return (data ?? []).map(({ id, name, icon, cat_id, monument_id }) => ({
    id,
    name,
    icon: icon ?? null,
    cat_id: cat_id ?? null,
    monument_id: monument_id ?? null,
  }));
}
