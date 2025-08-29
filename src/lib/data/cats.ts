import { getSupabaseBrowser } from "@/lib/supabase/browser";

export type CatRow = {
  id: string;
  user_id: string;
  name: string;
  created_at?: string | null;
};

export async function getCatsForUser(userId: string) {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb
    .from("cats")
    .select("id,name,created_at,user_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CatRow[];
}
