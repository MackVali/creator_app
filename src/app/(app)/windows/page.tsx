"use client";

export const runtime = "nodejs";

import { useCallback, useEffect, useState } from "react";
import WindowsPolishedUI, { type WindowItem } from "@/components/WindowsPolishedUI";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { getSupabaseBrowser } from "@/lib/supabase";

function normalizeLocationValue(value?: string | null) {
  return value ? String(value).toUpperCase().trim() : "";
}

function formatLocationLabel(value: string) {
  return value
    .replace(/[_\s]+/g, " ")
    .trim()
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

type WindowRow = {
  id: string;
  label: string;
  days: number[] | null;
  start_local: string;
  end_local: string;
  energy: string | null;
  location_context_id: string | null;
  location_context: { value?: string | null } | null;
};

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
      .select(
        "id,label,days,start_local,end_local,energy,location_context_id,location_context:location_contexts(value)",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (!error && data) {
      const mapped: WindowItem[] = (data as WindowRow[]).map((w) => {
        const locationValue = normalizeLocationValue(w.location_context?.value);
        return {
          id: w.id,
          name: w.label,
          days: (w.days ?? []).map((d: number) => DAY_LABELS[d]),
          start: w.start_local,
          end: w.end_local,
          energy: w.energy?.toLowerCase() as WindowItem["energy"],
          location: locationValue || "ANY",
          locationId: w.location_context_id,
          active: true,
        };
      });
      setWindows(mapped);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolveLocationContextId(
    locationValue: string,
  ): Promise<string | null> {
    if (!supabase) return null;
    const normalized = normalizeLocationValue(locationValue);
    if (!normalized || normalized === "ANY") return null;

    const { data: existing, error: fetchError } = await supabase
      .from("location_contexts")
      .select("id")
      .eq("value", normalized)
      .maybeSingle();

    if (fetchError && fetchError.code !== "PGRST116") {
      throw fetchError;
    }

    if (existing?.id) {
      return existing.id;
    }

    const label = formatLocationLabel(normalized) || normalized;
    const { data: inserted, error: insertError } = await supabase
      .from("location_contexts")
      .insert({ value: normalized, label })
      .select("id")
      .single();

    if (insertError) throw insertError;
    return inserted?.id ?? null;
  }

  async function handleCreate(item: WindowItem): Promise<boolean> {
    if (!supabase) return false;
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) return false;

    const baseDays = item.days.map((d) => DAY_LABELS.indexOf(d));
    const normalizedLocation = normalizeLocationValue(item.location);
    const locationId =
      normalizedLocation && normalizedLocation !== "ANY"
        ? item.locationId ?? (await resolveLocationContextId(normalizedLocation))
        : null;

    const payload = {
      user_id: user.id,
      label: item.name,
      days: baseDays,
      start_local: item.start,
      end_local: item.end,
      energy: item.energy?.toUpperCase(),
      location_context_id: locationId,
    };

    const [sh, sm] = item.start.split(":").map(Number);
    const [eh, em] = item.end.split(":").map(Number);
    const crosses = eh < sh || (eh === sh && em < sm);

    try {
      if (!crosses) {
        const { data: inserted, error } = await supabase
          .from("windows")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        const id = inserted?.id ?? item.id;
        setWindows((prev) => [
          ...(prev ?? []),
          {
            ...item,
            id,
            location: normalizedLocation || "ANY",
            locationId: locationId ?? null,
          },
        ]);
      } else {
        const nextDays = baseDays.map((d) => (d + 1) % 7);
        const firstPayload = { ...payload, end_local: "23:59" };
        const secondPayload = {
          ...payload,
          days: nextDays,
          start_local: "00:00",
          end_local: item.end,
        };
        const { data: first, error: err1 } = await supabase
          .from("windows")
          .insert(firstPayload)
          .select("id")
          .single();
        if (err1) throw err1;
        const { data: second, error: err2 } = await supabase
          .from("windows")
          .insert(secondPayload)
          .select("id")
          .single();
        if (err2) throw err2;
        setWindows((prev) => [
          ...(prev ?? []),
          {
            ...item,
            id: first?.id ?? "",
            end: "23:59",
            location: normalizedLocation || "ANY",
            locationId: locationId ?? null,
          },
          {
            ...item,
            id: second?.id ?? "",
            start: "00:00",
            days: nextDays.map((d) => DAY_LABELS[d]),
            location: normalizedLocation || "ANY",
            locationId: locationId ?? null,
          },
        ]);
      }
      return true;
    } catch (err) {
      throw err;
    }
  }

  async function handleEdit(id: string, item: WindowItem): Promise<boolean> {
    if (!supabase) return false;

    const baseDays = item.days.map((d) => DAY_LABELS.indexOf(d));
    const [sh, sm] = item.start.split(":").map(Number);
    const [eh, em] = item.end.split(":").map(Number);
    const crosses = eh < sh || (eh === sh && em < sm);

    if (crosses) {
      const { error: delErr } = await supabase
        .from("windows")
        .delete()
        .eq("id", id);
      if (delErr) throw delErr;
      setWindows((prev) => prev?.filter((w) => w.id !== id));
      await handleCreate(item);
      return true;
    }

    const normalizedLocation = normalizeLocationValue(item.location);
    let locationId: string | null = null;
    if (normalizedLocation && normalizedLocation !== "ANY") {
      if (item.locationId) {
        locationId = item.locationId;
      } else {
        locationId = await resolveLocationContextId(normalizedLocation);
      }
    }

    const payload = {
      label: item.name,
      days: baseDays,
      start_local: item.start,
      end_local: item.end,
      energy: item.energy?.toUpperCase(),
      location_context_id: locationId,
    };

    const { error } = await supabase.from("windows").update(payload).eq("id", id);
    if (error) throw error;
    setWindows((prev) =>
      prev?.map((w) =>
        w.id === id
          ? {
              ...item,
              id,
              location: normalizedLocation || "ANY",
              locationId: locationId ?? null,
            }
          : w,
      )
    );
    return true;
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

