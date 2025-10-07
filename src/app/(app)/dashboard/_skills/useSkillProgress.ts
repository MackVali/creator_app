"use client";

import { useEffect, useMemo, useState } from "react";
import { useProfileContext } from "@/components/ProfileProvider";
import { getSupabaseBrowser } from "@/lib/supabase";
import { xpRequired } from "@/lib/skills/progression";

interface SkillProgressRow {
  skill_id: string;
  level: number | null;
  prestige: number | null;
  xp_into_level: number | null;
}

export interface SkillProgressData {
  level: number;
  prestige: number;
  xpIntoLevel: number;
  xpRequired: number;
  progressPercent: number;
}

function mapRowToProgress(row: SkillProgressRow): SkillProgressData | null {
  if (!row?.skill_id) return null;
  const level = typeof row.level === "number" ? row.level : 1;
  const prestige = typeof row.prestige === "number" ? row.prestige : 0;
  const xpIntoLevel = typeof row.xp_into_level === "number" ? row.xp_into_level : 0;
  const required = xpRequired(level, prestige);
  const safeRequired = required > 0 ? required : 1;
  const percent = Math.max(0, Math.min(100, (xpIntoLevel / safeRequired) * 100));

  return {
    level,
    prestige,
    xpIntoLevel,
    xpRequired: safeRequired,
    progressPercent: percent,
  };
}

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
        (payload) => {
          if (!isActive) return;
          const mapped = mapRowToProgress(payload.new as SkillProgressRow);
          if (!mapped) return;
          const skillId = (payload.new as SkillProgressRow | null)?.skill_id;
          if (!skillId) return;
          setProgress((prev) => ({ ...prev, [skillId]: mapped }));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "skill_progress",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (!isActive) return;
          const mapped = mapRowToProgress(payload.new as SkillProgressRow);
          if (!mapped) return;
          const skillId = (payload.new as SkillProgressRow | null)?.skill_id;
          if (!skillId) return;
          setProgress((prev) => ({ ...prev, [skillId]: mapped }));
        }
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
