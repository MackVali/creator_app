"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getSupabaseBrowser } from "@/lib/supabase";

type ExistingTimeBlocksState = {
  hasExistingTimeBlocks: boolean;
  isLoading: boolean;
};

export function useHasExistingTimeBlocks(): ExistingTimeBlocksState {
  const { user } = useAuth();
  const [state, setState] = useState<ExistingTimeBlocksState>({
    hasExistingTimeBlocks: false,
    isLoading: true,
  });

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseBrowser();

    if (!user?.id || !supabase) {
      setState({ hasExistingTimeBlocks: false, isLoading: false });
      return () => {
        active = false;
      };
    }

    setState((previous) => ({ ...previous, isLoading: true }));

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
        setState({ hasExistingTimeBlocks: false, isLoading: false });
        return;
      }

      setState({
        hasExistingTimeBlocks: Array.isArray(data) && data.length > 0,
        isLoading: false,
      });
    })();

    return () => {
      active = false;
    };
  }, [user?.id]);

  return state;
}
