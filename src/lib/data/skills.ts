import { getSupabaseBrowser } from "../../../lib/supabase";
import type { SkillRow } from "../types/skill";

export async function getSkillsByCat(userId: string, catId?: string | null) {
  const sb = getSupabaseBrowser();
  if (!sb) throw new Error("Supabase client not available");
  
  let q = sb.from("skills")
    .select("id,name,icon,cat_id,level,monument_id,sort_order,created_at,updated_at,is_default,is_locked")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true, nullsFirst: false })
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
    .select("id,name,icon,cat_id,level,monument_id,sort_order,created_at,updated_at,is_default,is_locked")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  
  if (error) throw error;
  return (data ?? []) as SkillRow[];
}

export type SkillOrderUpdate = {
  id: string;
  sort_order: number;
};

export async function updateSkillsOrder(updates: SkillOrderUpdate[]) {
  if (updates.length === 0) return;
  const sb = getSupabaseBrowser();
  if (!sb) throw new Error("Supabase client not available");

  for (const { id, sort_order } of updates) {
    const { error } = await sb
      .from("skills")
      .update({ sort_order })
      .eq("id", id);
    if (error) {
      throw error;
    }
  }
}
