import { getSupabaseBrowser } from "../../../lib/supabase";
import type { CatRow } from "../types/cat";

export async function getCatsForUser(userId: string) {
  const sb = getSupabaseBrowser();
  if (!sb) throw new Error("Supabase client not available");
  
  const { data, error } = await sb
    .from("cats")
    .select("id,name,user_id,created_at,color_hex")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  
  if (error) throw error;
  return (data ?? []) as CatRow[];
}

export async function updateCatColor(catId: string, color: string) {
  const sb = getSupabaseBrowser();
  if (!sb) throw new Error("Supabase client not available");
  const { error } = await sb
    .from("cats")
    .update({ color_hex: color })
    .eq("id", catId);
  if (error) throw error;
}
