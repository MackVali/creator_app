import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";

export type PreviewRankRow = {
  score: number | null;
  projected_rank_after_ties: number | null;
  projected_percentile: number | null;
  notes: string | null;
};

type DraftInput = {
  goalId?: string | null;
  priority?: string | null;
  stage?: string | null;
};

export type PreviewRank = {
  score: number;
  rank: number;
  percentile: number;
};

export type PreviewState =
  | { status: "incomplete" }
  | { status: "loading" }
  | { status: "ready"; data: PreviewRank; notes?: string | null }
  | { status: "error"; message: string };

const DEBOUNCE_MS = 200;

export function useProjectedGlobalRank({ goalId, priority, stage }: DraftInput): PreviewState {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [state, setState] = useState<PreviewState>({ status: "incomplete" });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const trimmedGoal = goalId?.trim();
  const pri = priority?.trim().toUpperCase();
  const stg = stage?.trim().toUpperCase();
  const ready = Boolean(trimmedGoal && pri && stg);

  useEffect(() => {
    if (!ready) {
      setState({ status: "incomplete" });
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
      return;
    }

    if (!supabase) {
      setState({ status: "error", message: "Supabase client unavailable" });
      return;
    }

    setState({ status: "loading" });
    if (timerRef.current) clearTimeout(timerRef.current);

    const currentRequestId = ++requestIdRef.current;
    timerRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      console.debug("[rankPreview] inputs", {
        goalId: trimmedGoal,
        priority: pri,
        stage: stg,
      });

      const { data, error } = await supabase.rpc("preview_global_rank", {
        p_goal_id: trimmedGoal,
        p_project_priority: pri,
        p_project_stage: stg,
      });

      if (currentRequestId !== requestIdRef.current) return;

      console.debug("[rankPreview] result", { data, error });

      if (error) {
        setState({
          status: "error",
          message: error.message ?? "Unknown error",
        });
        return;
      }

      const row = data as PreviewRankRow | null;
      const score = row?.score ?? null;
      const rank = row?.projected_rank_after_ties ?? null;
      const percentile = row?.projected_percentile ?? null;

      if (score === null && rank === null && percentile === null) {
        setState({ status: "incomplete" });
        return;
      }

      if (
        typeof score !== "number" ||
        typeof rank !== "number" ||
        typeof percentile !== "number"
      ) {
        setState({
          status: "error",
          message: "Invalid preview data",
        });
        return;
      }

      setState({
        status: "ready",
        data: {
          score,
          rank,
          percentile,
        },
        notes: row?.notes ?? null,
      });
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [ready, trimmedGoal, pri, stg, supabase]);

  return state;
}
