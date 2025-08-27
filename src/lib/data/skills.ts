import { getSupabaseBrowser } from "@/lib/supabase";
import type { SkillRow } from "../types/skill";

export async function getSkillsByCat(userId: string, catId?: string | null) {
  const sb = getSupabaseBrowser();
  if (!sb) throw new Error("Supabase client not available");

  let q = sb
    .from("skills")
    .select("id,name,icon,cat_id,level,created_at,updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (catId) {
    q = q.eq("cat_id", catId);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as SkillRow[];
}

export async function getSkillsForUser(userId: string) {
  const sb = getSupabaseBrowser();
  if (!sb) throw new Error("Supabase client not available");

  const { data, error } = await sb
    .from("skills")
    .select("id,name,icon,cat_id,level,created_at,updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as SkillRow[];
}

export function groupSkillsByCat(
  rows: SkillRow[]
): Record<string | null, SkillRow[]> {
  return rows.reduce((acc, row) => {
    const key = row.cat_id ?? null;
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {} as Record<string | null, SkillRow[]>);
}
