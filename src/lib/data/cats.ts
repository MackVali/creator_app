import { getSupabaseBrowser } from "../../../lib/supabase";
import { deleteRecord } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import type { CatRow } from "../types/cat";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getCatsForUser(userId: string, client?: SupabaseClient) {
  const sb = client ?? getSupabaseBrowser();
  if (!sb) throw new Error("Supabase client not available");

  const { data, error } = await sb
    .from("cats")
    .select("id,name,user_id,created_at,color_hex,sort_order,icon")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((c) => ({
    ...c,
    color_hex: c.color_hex || "#000000",
    icon: c.icon || null,
  })) as CatRow[];
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

export async function updateCatName(catId: string, name: string) {
  const sb = getSupabaseBrowser();
  if (!sb) throw new Error("Supabase client not available");
  const { error } = await sb
    .from("cats")
    .update({ name })
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

export async function updateCatIcon(catId: string, icon: string | null) {
  const sb = getSupabaseBrowser();
  if (!sb) throw new Error("Supabase client not available");
  const { error } = await sb
    .from("cats")
    .update({ icon })
    .eq("id", catId);
  if (error) throw error;
}

export async function deleteCat(catId: string, options?: { allowLocked?: boolean }) {
  const sb = getSupabaseBrowser();
  if (!sb) throw new Error("Supabase client not available");

  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("User not authenticated");
  }

  const { error: clearError } = await sb
    .from("skills")
    .update({ cat_id: null })
    .eq("user_id", userId)
    .eq("cat_id", catId);
  if (clearError) {
    throw clearError;
  }

  const { error } = await deleteRecord("cats", catId, {
    allowLocked: options?.allowLocked,
  });
  if (error) {
    throw error;
  }
}
