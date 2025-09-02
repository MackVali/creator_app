"use client";

export const runtime = "nodejs";

import { useCallback, useEffect, useState } from "react";
import WindowsPolishedUI, { type WindowItem } from "@/components/WindowsPolishedUI";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { getSupabaseBrowser } from "@/lib/supabase";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export default function WindowsPage() {
  const supabase = getSupabaseBrowser();
  const [windows, setWindows] = useState<WindowItem[]>();

  const load = useCallback(async () => {
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setWindows([]);
      return;
    }
    const { data, error } = await supabase
      .from("windows")
      .select("id,label,days,start_local,end_local,energy")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (!error && data) {
      const mapped: WindowItem[] = data.map((w) => ({
        id: w.id,
        name: w.label,
        days: (w.days ?? []).map((d: number) => DAY_LABELS[d]),
        start: w.start_local,
        end: w.end_local,
        energy: w.energy?.toLowerCase() as WindowItem["energy"],
        active: true,
      }));
      setWindows(mapped);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(item: WindowItem) {
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const payload = {
      user_id: user.id,
      label: item.name,
      days: item.days.map((d) => DAY_LABELS.indexOf(d)),
      start_local: item.start,
      end_local: item.end,
      energy: item.energy?.toUpperCase(),
    };

    const { data: inserted, error } = await supabase
      .from("windows")
      .insert(payload)
      .select("id")
      .single();

    const id = inserted?.id ?? item.id;
    if (!error) {
      setWindows((prev) => [...(prev ?? []), { ...item, id }]);
    }
  }

  async function handleEdit(id: string, item: WindowItem) {
    if (!supabase) return;

    const payload = {
      label: item.name,
      days: item.days.map((d) => DAY_LABELS.indexOf(d)),
      start_local: item.start,
      end_local: item.end,
      energy: item.energy?.toUpperCase(),
    };

    const { error } = await supabase.from("windows").update(payload).eq("id", id);
    if (!error) {
      setWindows((prev) =>
        prev?.map((w) => (w.id === id ? { ...item, id } : w))
      );
    }
  }

  async function handleDelete(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from("windows").delete().eq("id", id);
    if (!error) {
      setWindows((prev) => prev?.filter((w) => w.id !== id));
    }
  }

  return (
    <ProtectedRoute>
      <WindowsPolishedUI
        windows={windows}
        onCreate={handleCreate}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </ProtectedRoute>
  );
}

