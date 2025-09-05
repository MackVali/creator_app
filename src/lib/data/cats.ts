import { getSupabaseBrowser } from "../../../lib/supabase";
import type { CatRow } from "../types/cat";

export async function getCatsForUser(userId: string) {
  const sb = getSupabaseBrowser();
  if (!sb) throw new Error("Supabase client not available");

  const { data, error } = await sb
    .from("cats")
    .select("id,name,user_id,created_at,color_hex,sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((c) => ({ ...c, color_hex: c.color_hex || '#000000' })) as CatRow[];
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

export async function updateCatOrder(catId: string, order: number) {
  const sb = getSupabaseBrowser();
  if (!sb) throw new Error("Supabase client not available");
  const { error } = await sb
    .from("cats")
    .update({ sort_order: order })
    .eq("id", catId);
  if (error) throw error;
}

export async function updateCatsOrder(
  orders: { id: string; sort_order: number }[]
) {
  const sb = getSupabaseBrowser();
  if (!sb) throw new Error("Supabase client not available");
  const { error } = await sb.from("cats").upsert(orders);
  if (error) throw error;
}
