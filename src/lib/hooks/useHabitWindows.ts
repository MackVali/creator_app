import { useEffect, useState } from "react";

import { getSupabaseBrowser } from "@/lib/supabase";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type WindowKind = "DEFAULT" | "BREAK" | "PRACTICE";
export type HabitWindowKind = WindowKind;

type WindowRow = {
  id: string;
  label: string | null;
  start_local: string | null;
  end_local: string | null;
  days: number[] | null;
  window_kind: string | null;
};

export type HabitWindowSelectOption = {
  id: string;
  label: string;
  kind: WindowKind;
};

function normalizeWindowKind(value: string | null | undefined): WindowKind {
  if (!value) return "DEFAULT";
  const normalized = value.toUpperCase().trim();
  return normalized === "BREAK" || normalized === "PRACTICE" ? normalized : "DEFAULT";
}

function formatTime(value: string | null) {
  if (!value) return "--:--";
  return value.slice(0, 5);
}

function formatDays(days: number[] | null) {
  if (!Array.isArray(days) || days.length === 0) {
    return "Every day";
  }
  return days
    .map((day) => DAY_LABELS[Math.max(0, Math.min(6, day))])
    .join(" · ");
}

function mapWindowRow(row: WindowRow): HabitWindowSelectOption {
  const name = row.label?.trim() || "Untitled window";
  const daysLabel = formatDays(row.days);
  const timeLabel = `${formatTime(row.start_local)}–${formatTime(row.end_local)}`;
  return {
    id: row.id,
    label: `${name} (${daysLabel} · ${timeLabel})`,
    kind: normalizeWindowKind(row.window_kind),
  };
}

export function useHabitWindows() {
  const supabase = getSupabaseBrowser();
  const [windowOptions, setWindowOptions] = useState<HabitWindowSelectOption[]>([]);
  const [windowsLoading, setWindowsLoading] = useState(true);
  const [windowError, setWindowError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setWindowsLoading(true);
      setWindowError(null);

      if (!supabase) {
        if (active) {
          setWindowOptions([]);
          setWindowError("Supabase client not available.");
          setWindowsLoading(false);
        }
        return;
      }

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        if (!user) {
          if (active) {
            setWindowOptions([]);
            setWindowsLoading(false);
          }
          return;
        }

        const { data, error } = await supabase
          .from("windows")
          .select("id, label, start_local, end_local, days, window_kind")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true });

        if (error) {
          throw error;
        }

        if (active) {
          const mapped = (data ?? []).map((row) => mapWindowRow(row as WindowRow));
          setWindowOptions(mapped);
        }
      } catch (err) {
        console.error("Failed to load windows:", err);
        if (active) {
          setWindowOptions([]);
          setWindowError("Unable to load your windows right now.");
        }
      } finally {
        if (active) {
          setWindowsLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [supabase]);

  return { windowOptions, windowsLoading, windowError };
}
