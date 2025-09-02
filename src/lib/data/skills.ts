import { getSupabaseBrowser } from "../../../lib/supabase";
import type { SkillRow } from "../types/skill";

export async function getSkillsByCat(userId: string, catId?: string | null) {
  const sb = getSupabaseBrowser();
  if (!sb) throw new Error("Supabase client not available");
  
  let q = sb.from("skills")
    .select("id,name,icon,cat_id,level,monument_id,created_at,updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  
  if (catId) { 
    q = q.eq("cat_id", catId); 
  } // IMPORTANT: never .eq('cat_id', null)
  
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as SkillRow[];
}

export async function getSkillsForUser(userId: string) {
  const sb = getSupabaseBrowser();
  if (!sb) throw new Error("Supabase client not available");
  
  const { data, error } = await sb
    .from("skills")
    .select("id,name,icon,cat_id,level,monument_id,created_at,updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  
  if (error) throw error;
  return (data ?? []) as SkillRow[];
}

export async function createSkill(
  userId: string,
  skill: { name: string; icon: string; cat_id: string | null; monument_id: string; level?: number }
) {
  const sb = getSupabaseBrowser();
  if (!sb) throw new Error("Supabase client not available");

  const { data, error } = await sb
    .from("skills")
    .insert({
      user_id: userId,
      name: skill.name,
      icon: skill.icon,
      cat_id: skill.cat_id,
      monument_id: skill.monument_id,
      level: skill.level ?? 1,
    })
    .select("id,name,icon,cat_id,level,monument_id,created_at,updated_at")
    .single();

  if (error) throw error;
  return data as SkillRow;
}

export async function deleteSkill(userId: string, id: string) {
  const sb = getSupabaseBrowser();
  if (!sb) throw new Error("Supabase client not available");

  const { error } = await sb
    .from("skills")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
}
