"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { calculateLevelProgress } from "@/lib/leveling";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Database } from "@/types/supabase";

export type UserProgress = {
  currentLevel: number;
  totalDarkXp: number;
  updatedAt: string | null;
};

export type UseUserProgressOptions = {
  enabled?: boolean;
  subscribe?: boolean;
  client?: SupabaseClient<Database> | null;
};

const DEFAULT_PROGRESS: UserProgress = {
  currentLevel: 1,
  totalDarkXp: 0,
  updatedAt: null,
};

export function useUserProgress(
  userId: string | null | undefined,
  { enabled = true, subscribe = false, client }: UseUserProgressOptions = {},
) {
  const supabase = useMemo(() => client ?? getSupabaseBrowser(), [client]);
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !userId) {
      if (isMountedRef.current) {
        setProgress(null);
      }
    }
  }, [enabled, userId]);

  const fetchProgress = useCallback(async () => {
    if (!enabled || !supabase || !userId) {
      return null;
    }

    if (isMountedRef.current) {
      setLoading(true);
    }

    try {
      const { data, error: queryError } = await supabase
        .from("user_progress")
        .select("current_level,total_dark_xp,updated_at")
        .eq("user_id", userId)
        .single();

      if (!isMountedRef.current) {
        return data ?? null;
      }

      if (queryError) {
        if (queryError.code === "PGRST116") {
          setProgress(DEFAULT_PROGRESS);
          setError(null);
          return DEFAULT_PROGRESS;
        }

        console.error("Failed to load user progress", queryError);
        setError(queryError.message);
        return null;
      }

      const totalDarkXp = data?.total_dark_xp ?? 0;
      const derived = calculateLevelProgress(totalDarkXp);

      const resolved: UserProgress = {
        currentLevel: derived.level,
        totalDarkXp,
        updatedAt: data?.updated_at ?? null,
      };

      setProgress(resolved);
      setError(null);
      return resolved;
    } catch (err) {
      if (isMountedRef.current) {
        console.error("Unexpected error while loading user progress", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      }
      return null;
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [enabled, supabase, userId]);

  useEffect(() => {
    if (!enabled || !supabase || !userId) {
      return;
    }

    fetchProgress();
  }, [enabled, supabase, userId, fetchProgress]);

  useEffect(() => {
    if (!enabled || !subscribe || !supabase || !userId) {
      return;
    }

    const channel = supabase
      .channel(`dark_xp_events:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "dark_xp_events",
          filter: `user_id=eq.${userId}`,
        },
        async () => {
          setLastEventAt(Date.now());
          await fetchProgress();
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [enabled, subscribe, supabase, userId, fetchProgress]);

  return {
    progress,
    loading,
    error,
    lastEventAt,
    refresh: fetchProgress,
  };
}
