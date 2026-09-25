"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getSupabaseBrowser } from "@/lib/supabase";

type ExistingTimeBlocksState = {
  hasExistingTimeBlocks: boolean;
  isLoading: boolean;
  userId: string | null;
};

type UseHasExistingTimeBlocksOptions = {
  enabled?: boolean;
};

export function useHasExistingTimeBlocks({
  enabled = true,
}: UseHasExistingTimeBlocksOptions = {}): ExistingTimeBlocksState {
  const { user } = useAuth();
  const [state, setState] = useState<ExistingTimeBlocksState>({
    hasExistingTimeBlocks: false,
    isLoading: false,
    userId: null,
  });
  const queryUserId = enabled ? user?.id ?? null : null;

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseBrowser();

    if (!enabled || !user?.id || !supabase) {
      setState({ hasExistingTimeBlocks: false, isLoading: false, userId: null });
      return () => {
        active = false;
      };
    }

    setState((previous) => ({
      hasExistingTimeBlocks:
        previous.userId === user.id ? previous.hasExistingTimeBlocks : false,
      isLoading: true,
      userId: user.id,
    }));

    void (async () => {
      const { data, error } = await supabase
        .from("time_blocks")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (!active) {
        return;
      }

      if (error) {
        console.warn("Unable to check for existing time blocks", error);
        setState({ hasExistingTimeBlocks: false, isLoading: false, userId: user.id });
        return;
      }

      setState({
        hasExistingTimeBlocks: Array.isArray(data) && data.length > 0,
        isLoading: false,
        userId: user.id,
      });
    })();

    return () => {
      active = false;
    };
  }, [enabled, user?.id]);

  return {
    hasExistingTimeBlocks:
      queryUserId && state.userId === queryUserId ? state.hasExistingTimeBlocks : false,
    isLoading: Boolean(queryUserId) && (state.isLoading || state.userId !== queryUserId),
    userId: state.userId,
  };
}
