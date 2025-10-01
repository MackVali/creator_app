import { getSupabaseBrowser } from "../../../lib/supabase";
import type { CatRow } from "../types/cat";

export async function getCatsForUser(userId: string) {
  const sb = getSupabaseBrowser();
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

export async function updateCatOrder(catId: string, order: number) {
  const sb = getSupabaseBrowser();
  if (!sb) throw new Error("Supabase client not available");

  const sanitizedOrder = Number.isFinite(order) ? Math.max(1, Math.floor(order)) : 1;

  const {
    data: target,
    error: targetError,
  } = await sb
    .from("cats")
    .select("id,user_id")
    .eq("id", catId)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!target) throw new Error("Category not found");

  const {
    data: siblings,
    error: siblingsError,
  } = await sb
    .from("cats")
    .select("id,sort_order,created_at")
    .eq("user_id", target.user_id)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (siblingsError) throw siblingsError;

  const orderedIds = (siblings ?? []).map((cat) => cat.id);
  if (!orderedIds.includes(catId)) {
    orderedIds.push(catId);
  }

  const nextOrder = orderedIds.filter((id) => id !== catId);
  const insertionIndex = Math.min(nextOrder.length, sanitizedOrder - 1);
  nextOrder.splice(insertionIndex, 0, catId);

  const updates = nextOrder.map((id, index) => ({
    id,
    sort_order: index + 1,
  }));

  const { error } = await sb
    .from("cats")
    .upsert(updates, { onConflict: "id" });

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

export async function reorderCats(
  ordering: ReadonlyArray<{ id: string; order: number }>
) {
  const sb = getSupabaseBrowser();
  if (!sb) throw new Error("Supabase client not available");

  const normalized = ordering
    .filter((entry) => entry && typeof entry.id === "string" && entry.id.trim().length > 0)
    .map((entry) => ({
      id: entry.id,
      sort_order:
        Number.isFinite(entry.order) && entry.order > 0 ? Math.floor(entry.order) : 1,
    }))
    .sort((a, b) => a.sort_order - b.sort_order);

  const seen = new Set<string>();
  const deduped: { id: string; sort_order: number }[] = [];
  for (const entry of normalized) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    deduped.push(entry);
  }

  const updates = deduped.map((entry, index) => ({
    id: entry.id,
    sort_order: index + 1,
  }));

  if (updates.length === 0) {
    return;
  }

  const { error } = await sb.from("cats").upsert(updates, { onConflict: "id" });
  if (error) throw error;
}
