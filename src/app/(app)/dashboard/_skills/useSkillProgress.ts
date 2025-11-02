"use client";

import { useEffect, useMemo, useState } from "react";
import { useProfileContext } from "@/components/ProfileProvider";
import { getSupabaseBrowser } from "@/lib/supabase";
import {
  mapPrestigeBadgeRows,
  mapRowToProgress,
  type SkillBadgeRow,
  type SkillProgressData,
  type SkillProgressRow,
} from "@/lib/skills/skillProgress";

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
      if (!isActive || !row?.skill_id) return;
      setProgress((prev) => {
        const existing = prev[row.skill_id];
        const mapped = mapRowToProgress(row, existing?.badges ?? []);
        if (!mapped) {
          return prev;
        }
        return { ...prev, [row.skill_id]: mapped };
      });
    };

    const refreshBadgesForSkill = async (skillId: string | null | undefined) => {
      if (!skillId) return;
      const { data: badgeRows, error: badgeError } = await supabase
        .from("skill_badges")
        .select("id,badge_id,skill_id,badges(badge_type,level,emoji,label,description)")
        .eq("user_id", userId)
        .eq("skill_id", skillId)
        .order("badge_type", { ascending: true, foreignTable: "badges" })
        .order("level", { ascending: true, foreignTable: "badges" });

      if (badgeError) {
        console.error("Failed to refresh skill badges", badgeError);
        return;
      }

      const mapped = mapPrestigeBadgeRows((badgeRows ?? []) as SkillBadgeRow[]);
      setProgress((prev) => {
        const existing = prev[skillId];
        if (!existing) {
          return prev;
        }
        return { ...prev, [skillId]: { ...existing, badges: mapped } };
      });
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
        (payload) => handleRealtimeRow(payload.new as SkillProgressRow | null),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "skill_progress",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => handleRealtimeRow(payload.new as SkillProgressRow | null),
      );

    const badgeChannel = supabase
      .channel(`skill_badges_user_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "skill_badges",
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const nextSkillId =
            ((payload.new as { skill_id?: string | null })?.skill_id ?? null) ||
            ((payload.old as { skill_id?: string | null })?.skill_id ?? null);
          await refreshBadgesForSkill(nextSkillId ?? null);
        },
      );

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.error("Failed to subscribe to skill_progress updates");
      }
    });

    badgeChannel.subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.error("Failed to subscribe to skill_badges updates");
      }
    });

    const load = async () => {
      setIsLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from("skill_progress")
        .select(
          `
            skill_id,
            level,
            prestige,
            xp_into_level,
            skill_badges (
              id,
              badge_id,
              badges (
                badge_type,
                level,
                emoji,
                label,
                description
              )
            )
          `,
        )
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
      supabase.removeChannel(badgeChannel);
    };
  }, [userId]);

  const progressBySkillId = useMemo(() => progress, [progress]);

  return {
    progressBySkillId,
    isLoading,
    error,
  };
}
