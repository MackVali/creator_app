import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export const MIN_SKILLS = 5;

export async function needsSkillStack(
  supabase: SupabaseClient<Database>,
  userId: string
) {
  const { count, error } = await supabase
    .from("skills")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  return (count ?? 0) < MIN_SKILLS;
}
