"use client";

import { useEffect, useRef } from "react";

import { useProfileContext } from "@/components/ProfileProvider";
import { useToastHelpers } from "@/components/ui/toast";
import { getSupabaseBrowser } from "@/lib/supabase";

type DarkXpEvent = {
  skill_id: string;
  amount: number;
  new_skill_level: number;
};

export default function LevelUpListener() {
  const { userId } = useProfileContext();
  const toast = useToastHelpers();
  const toastRef = useRef(toast);
  const skillNameCacheRef = useRef(new Map<string, string>());

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  useEffect(() => {
    skillNameCacheRef.current.clear();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const controller = new AbortController();

    const reconcile = async () => {
      try {
        const response = await fetch("/api/xp/reconcile", {
          method: "POST",
          signal: controller.signal,
        });

        if (!response.ok) {
          console.error(
            "Failed to reconcile dark XP",
            await response.text()
          );
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Failed to reconcile dark XP", error);
      }
    };

    reconcile();

    return () => {
      controller.abort();
    };
  }, [userId]);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase || !userId) {
      return;
    }

    let isActive = true;

    const channel = supabase
      .channel(`dark_xp_events_user_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "dark_xp_events",
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          if (!isActive) return;

          const event = payload.new as Partial<DarkXpEvent> | null;
          if (!event || !event.skill_id) return;
          if (typeof event.amount !== "number" || event.amount <= 0) return;
          if (typeof event.new_skill_level !== "number") return;

          const cache = skillNameCacheRef.current;
          let skillName = cache.get(event.skill_id);

          if (!skillName) {
            const { data, error } = await supabase
              .from("skills")
              .select("name")
              .eq("id", event.skill_id)
              .maybeSingle<{ name: string | null }>();

            if (error) {
              console.error("Failed to load skill for level-up toast", error);
            }

            skillName = data?.name ?? "Skill";
            cache.set(event.skill_id, skillName);
          }

          toastRef.current.success(
            `${skillName} leveled up!`,
            `Now level ${event.new_skill_level}`
          );
        }
      );

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.error("Failed to subscribe to dark_xp_events");
      }
    });

    return () => {
      isActive = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return null;
}
