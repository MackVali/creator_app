"use client";

export const runtime = "nodejs";

import { useCallback, useEffect, useState } from "react";
import WindowsPolishedUI, { type WindowItem } from "@/components/WindowsPolishedUI";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import {
  resolveLocationContextId,
  isLocationMetadataError,
  normalizeLocationValue,
  type LocationMetadataMode,
} from "@/lib/location-metadata";
import { getSupabaseBrowser } from "@/lib/supabase";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const CROSS_START = "00:00";
const CROSS_END = "23:59";

type WindowsStateItem = WindowItem & { segmentIds: string[] };

type SupabaseWindowRow = {
  id: string;
  label: string;
  days: number[] | null;
  start_local: string;
  end_local: string;
  energy: string | null;
  location_context_id?: string | null;
  location_context?: { value: string | null } | null;
  legacy_location_context?: string | null;
};

function normalizeLocation(value: string | null | undefined) {
  if (!value) return "ANY";
  return String(value).trim().toUpperCase();
}

function compactSegmentIds(...ids: Array<string | null | undefined>) {
  return ids.filter((id): id is string => Boolean(id));
}

function shiftDaysBackward(days: number[]) {
  return days.map((d) => (d + 6) % 7).sort((a, b) => a - b);
}

function sortDays(days: number[]) {
  return [...days].sort((a, b) => a - b);
}

function arraysEqual(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function mergeCrossMidnightWindows(rows: SupabaseWindowRow[]): WindowsStateItem[] {
  const result: WindowsStateItem[] = [];
  const consumed = new Set<string>();

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (consumed.has(row.id)) continue;

    const baseDays = row.days ? sortDays(row.days) : [];
    const locationSource =
      row.location_context?.value ?? row.legacy_location_context ?? null;
    const location = normalizeLocation(locationSource);
    const energy = row.energy?.toLowerCase() as WindowItem["energy"] | undefined;
    const dayLabels = baseDays.map((d) => DAY_LABELS[d]);

    if (row.end_local === CROSS_END && row.start_local !== CROSS_START) {
      const matchIndex = rows.findIndex((candidate, idx) => {
        if (idx <= i) return false;
        if (consumed.has(candidate.id)) return false;
        if (candidate.start_local !== CROSS_START) return false;
        if (candidate.label !== row.label) return false;
        if ((candidate.energy ?? null) !== (row.energy ?? null)) return false;
        const candidateLocationSource =
          candidate.location_context?.value ?? candidate.legacy_location_context ?? null;
        const candidateLocation = normalizeLocation(candidateLocationSource);
        if (candidateLocation !== location) return false;
        const candidateDays = candidate.days ? shiftDaysBackward(candidate.days) : [];
        return arraysEqual(candidateDays, baseDays);
      });

      if (matchIndex !== -1) {
        const match = rows[matchIndex];
        consumed.add(row.id);
        consumed.add(match.id);
        result.push({
          id: row.id,
          name: row.label,
          days: dayLabels,
          start: row.start_local,
          end: match.end_local,
          energy,
          location,
          active: true,
          segmentIds: [row.id, match.id],
        });
        continue;
      }
    }

    consumed.add(row.id);
    result.push({
      id: row.id,
      name: row.label,
      days: dayLabels,
      start: row.start_local,
      end: row.end_local,
      energy,
      location,
      active: true,
      segmentIds: [row.id],
    });
  }

  return result;
}

export default function WindowsPage() {
  const supabase = getSupabaseBrowser();
  const [windows, setWindows] = useState<WindowsStateItem[]>();

  const load = useCallback(async () => {
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setWindows([]);
      return;
    }
    const baseQuery = supabase
      .from("windows")
      .select(
        "id,label,days,start_local,end_local,energy,location_context_id,location_context:location_contexts(value,label)"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    const { data, error } = await baseQuery;

    if (!error && data) {
      const merged = mergeCrossMidnightWindows(data as SupabaseWindowRow[]);
      setWindows(merged);
      return;
    }

    if (error && isLocationMetadataError(error)) {
      const { data: legacyData, error: legacyError } = await supabase
        .from("windows")
        .select(
          "id,label,days,start_local,end_local,energy,legacy_location_context:location_context"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (!legacyError && legacyData) {
        const merged = mergeCrossMidnightWindows(legacyData as SupabaseWindowRow[]);
        setWindows(merged);
      }
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(item: WindowItem): Promise<boolean> {
    if (!supabase) return false;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const baseDays = item.days.map((d) => DAY_LABELS.indexOf(d));
    const normalizedLocationValue = normalizeLocationValue(item.location ?? null);
    const normalizedLocation = normalizeLocation(item.location ?? null);

    let locationContextId: string | null = null;
    let metadataModes: LocationMetadataMode[] = ["id", "legacy"];

    if (normalizedLocationValue) {
      try {
        locationContextId = await resolveLocationContextId(
          supabase,
          user.id,
          normalizedLocationValue,
        );
      } catch (maybeError) {
        if (isLocationMetadataError(maybeError)) {
          metadataModes = ["legacy"];
        } else {
          throw maybeError;
        }
      }
    }

    const basePayload = {
      user_id: user.id,
      label: item.name,
      days: baseDays,
      start_local: item.start,
      end_local: item.end,
      energy: item.energy?.toUpperCase(),
    };

    const [sh, sm] = item.start.split(":").map(Number);
    const [eh, em] = item.end.split(":").map(Number);
    const crosses = eh < sh || (eh === sh && em < sm);

    const locationModes = metadataModes.includes("id")
      ? metadataModes
      : ["legacy"];

    let lastError: unknown = null;

    for (const mode of locationModes) {
      try {
        if (!crosses) {
          const payload = {
            ...basePayload,
            ...(mode === "id"
              ? { location_context_id: locationContextId }
              : { location_context: normalizedLocationValue }),
          };
          const { data: inserted, error } = await supabase
            .from("windows")
            .insert(payload)
            .select("id")
            .single();
          if (error) throw error;
          const id =
            inserted?.id ??
            item.id ??
            (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
              ? crypto.randomUUID()
              : Math.random().toString(36).slice(2));
          setWindows((prev) => [
            ...(prev ?? []),
            {
              ...item,
              id,
              location: normalizedLocation,
              segmentIds: [id],
              active: true,
            },
          ]);
          return true;
        }

        const nextDays = baseDays.map((d) => (d + 1) % 7);
        const firstPayload = {
          ...basePayload,
          end_local: CROSS_END,
          ...(mode === "id"
            ? { location_context_id: locationContextId }
            : { location_context: normalizedLocationValue }),
        };
        const secondPayload = {
          ...basePayload,
          days: nextDays,
          start_local: CROSS_START,
          end_local: item.end,
          ...(mode === "id"
            ? { location_context_id: locationContextId }
            : { location_context: normalizedLocationValue }),
        };

        const { data, error } = await supabase
          .from("windows")
          .insert([firstPayload, secondPayload])
          .select("id");
        if (error) throw error;

        const [first, second] = Array.isArray(data) ? data : [];
        const firstId =
          (first as { id?: string } | null | undefined)?.id ??
          item.id ??
          (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2));
        const secondId = (second as { id?: string } | null | undefined)?.id ?? null;

        setWindows((prev) => [
          ...(prev ?? []),
          {
            ...item,
            id: firstId,
            end: item.end,
            location: normalizedLocation,
            segmentIds: compactSegmentIds(firstId, secondId),
            active: true,
          },
        ]);
        return true;
      } catch (error) {
        lastError = error;
        if (mode === "id" && isLocationMetadataError(error)) {
          continue;
        }
        throw error;
      }
    }

    if (lastError) {
      throw lastError;
    }

    return false;
  }

  async function handleEdit(id: string, item: WindowItem): Promise<boolean> {
    if (!supabase) return false;

    const existing = windows?.find((w) => w.id === id);
    const existingSegments = existing?.segmentIds ?? [id];
    const normalizedLocation = normalizeLocation(item.location ?? null);
    const baseDays = item.days.map((d) => DAY_LABELS.indexOf(d));
    const [sh, sm] = item.start.split(":").map(Number);
    const [eh, em] = item.end.split(":").map(Number);
    const crosses = eh < sh || (eh === sh && em < sm);

    if (crosses) {
      const deleteQuery = supabase.from("windows").delete();
      const { error: delErr } =
        existingSegments.length > 1
          ? deleteQuery.in("id", existingSegments)
          : deleteQuery.eq("id", id);
      if (delErr) throw delErr;
      setWindows((prev) => prev?.filter((w) => w.id !== id));
      await handleCreate(item);
      return true;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const normalizedLocationValue = normalizeLocationValue(item.location ?? null);
    let locationContextId: string | null = null;
    let metadataModes: LocationMetadataMode[] = ["id", "legacy"];

    if (normalizedLocationValue) {
      try {
        locationContextId = await resolveLocationContextId(
          supabase,
          user.id,
          normalizedLocationValue,
        );
      } catch (maybeError) {
        if (isLocationMetadataError(maybeError)) {
          metadataModes = ["legacy"];
        } else {
          throw maybeError;
        }
      }
    }

    const payloadBase = {
      label: item.name,
      days: baseDays,
      start_local: item.start,
      end_local: item.end,
      energy: item.energy?.toUpperCase(),
    };

    const extraSegments = existingSegments.filter((segmentId) => segmentId !== id);
    if (extraSegments.length) {
      const { error: cleanupError } = await supabase
        .from("windows")
        .delete()
        .in("id", extraSegments);
      if (cleanupError) throw cleanupError;
    }

    const locationModes = metadataModes.includes("id")
      ? metadataModes
      : ["legacy"];

    let lastError: unknown = null;

    for (const mode of locationModes) {
      try {
        const updatePayload = {
          ...payloadBase,
          ...(mode === "id"
            ? { location_context_id: locationContextId }
            : { location_context: normalizedLocationValue }),
        };
        const { error } = await supabase.from("windows").update(updatePayload).eq("id", id);
        if (error) throw error;
        setWindows((prev) =>
          prev?.map((w) =>
            w.id === id
              ? {
                  ...item,
                  id,
                  location: normalizedLocation,
                  segmentIds: [id],
                  active: w.active,
                }
              : w,
          )
        );
        return true;
      } catch (error) {
        lastError = error;
        if (mode === "id" && isLocationMetadataError(error)) {
          continue;
        }
        throw error;
      }
    }

    if (lastError) {
      throw lastError;
    }

    return false;
  }

  async function handleDelete(id: string) {
    if (!supabase) return;
    const target = windows?.find((w) => w.id === id);
    const segments = target?.segmentIds ?? [id];
    const deleteQuery = supabase.from("windows").delete();
    const { error } =
      segments.length > 1 ? deleteQuery.in("id", segments) : deleteQuery.eq("id", id);
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

