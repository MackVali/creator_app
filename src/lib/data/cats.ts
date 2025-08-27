import { getSupabaseBrowser } from "@/lib/supabase";
import type { CatRow } from "../types/cat";

export async function getCatsForUser(userId: string) {
  const sb = getSupabaseBrowser();
  if (!sb) throw new Error("Supabase client not available");
  
  const { data, error } = await sb
    .from("cats")
    .select("id,name,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  
  if (error) throw error;
  return (data ?? []) as CatRow[];
}
