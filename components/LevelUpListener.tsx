"use client";

import { useEffect } from "react";

import { useProfileContext } from "@/components/ProfileProvider";
import { hapticLevelUp } from "@/lib/haptics/creatorHaptics";
import { getSupabaseBrowser } from "@/lib/supabase";

type DarkXpEvent = {
  skill_id: string;
  amount: number;
  new_skill_level: number;
};

export default function LevelUpListener() {
  const { userId } = useProfileContext();
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

          void hapticLevelUp();
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
