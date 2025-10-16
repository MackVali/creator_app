"use client";

import { useEffect, useMemo, useState } from "react";
import { useProfileContext } from "@/components/ProfileProvider";
import { getSupabaseBrowser } from "@/lib/supabase";
import {
  mapRowToProgress,
  type SkillProgressData,
  type SkillProgressRow,
} from "../../../../../lib/skills/skillProgress";

export type { SkillProgressData } from "../../../../../lib/skills/skillProgress";

export default function useSkillProgress() {
  const { userId } = useProfileContext();
  const [progress, setProgress] = useState<Record<string, SkillProgressData>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowser();

    if (!supabase || !userId) {
      setProgress({});
      setIsLoading(false);
      setError(null);
      return;
    }

    let isActive = true;
    const handleRealtimeRow = (row: SkillProgressRow | null) => {
      if (!isActive) return;
      const mapped = mapRowToProgress(row);
      if (!mapped || !row?.skill_id) return;
      setProgress((prev) => ({ ...prev, [row.skill_id]: mapped }));
    };

    const channel = supabase
      .channel(`skill_progress_user_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "skill_progress",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => handleRealtimeRow(payload.new as SkillProgressRow | null)
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "skill_progress",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => handleRealtimeRow(payload.new as SkillProgressRow | null)
      );

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.error("Failed to subscribe to skill_progress updates");
      }
    });

    const load = async () => {
      setIsLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from("skill_progress")
        .select("skill_id,level,prestige,xp_into_level")
        .eq("user_id", userId);

      if (!isActive) return;

      if (fetchError) {
        setError(fetchError);
        setProgress({});
        setIsLoading(false);
        return;
      }

      const mapped = (data ?? []).reduce<Record<string, SkillProgressData>>((acc, row) => {
        const normalized = mapRowToProgress(row as SkillProgressRow);
        if (normalized) {
          acc[row.skill_id] = normalized;
        }
        return acc;
      }, {});

      setProgress(mapped);
      setIsLoading(false);
    };

    load();

    return () => {
      isActive = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const progressBySkillId = useMemo(() => progress, [progress]);

  return {
    progressBySkillId,
    isLoading,
    error,
  };
}
