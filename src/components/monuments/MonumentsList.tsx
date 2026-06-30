"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase";
import { normalizeGoalStatus } from "@/lib/goals/status";
import { MonumentsEmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export interface Monument {
  id: string;
  title: string;
  emoji: string | null;
  goalCount: number;
  priorityRank?: number | null;
}

type MonumentGoalCountRow = {
  monument_id: string | null;
  status: string | null;
  active: boolean | null;
};

type MonumentPriorityOrderRpcClient = {
  rpc: (
    fn: "save_monument_priority_order",
    args: { p_monument_ids: string[] }
  ) => Promise<{ error: unknown | null }>;
};

interface MonumentsListProps {
  limit?: number;
  createHref?: string;
  renderEmptyChildren?: boolean;
  children: (
    monuments: Monument[],
    saveMonumentOrder: (monumentIds: string[]) => Promise<void>
  ) => ReactNode;
}

export type MonumentsListHandle = {
  refresh: () => Promise<void>;
};

export const MonumentsList = forwardRef<MonumentsListHandle, MonumentsListProps>(
  function MonumentsList(
    {
      limit,
      createHref = "/monuments/new",
      renderEmptyChildren = false,
      children,
    },
    ref,
  ) {
    const [monuments, setMonuments] = useState<Monument[]>([]);
    const [loading, setLoading] = useState(true);
    const supabase = getSupabaseBrowser();
    const router = useRouter();

    const load = useCallback(
      async (isCancelled: () => boolean = () => false) => {
        if (!supabase) return;
        setLoading(true);
        await supabase.auth.getSession();
        let query = supabase
          .from("monuments")
          .select("id,title,emoji,priority_rank")
          .order("priority_rank", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true });
        if (typeof limit === "number") {
          query = query.range(0, limit - 1);
        }
        const { data, error } = await query;
        if (!isCancelled()) {
          if (error) console.error(error);
          const monumentsData = (data ?? []) as {
            id: string;
            title: string;
            emoji: string | null;
            priority_rank: number | null;
          }[];

          let goalCounts: Record<string, number> = {};
          if (monumentsData.length) {
            const monumentIds = monumentsData.map((monument) => monument.id);
            const { data: goalsData, error: goalsError } = await supabase
              .from("goals")
              .select("monument_id,status,active")
              .in("monument_id", monumentIds);
            if (goalsError) {
              console.error(goalsError);
            } else {
              goalCounts = ((goalsData ?? []) as MonumentGoalCountRow[]).reduce<
                Record<string, number>
              >(
                (acc, goal) => {
                  const monumentId = goal.monument_id;
                  if (
                    monumentId &&
                    normalizeGoalStatus(goal.status, goal.active) !== "COMPLETED"
                  ) {
                    acc[monumentId] = (acc[monumentId] ?? 0) + 1;
                  }
                  return acc;
                },
                {},
              );
            }
          }

          if (isCancelled()) {
            return;
          }

          setMonuments(
            monumentsData.map((monument) => ({
              ...monument,
              goalCount: goalCounts[monument.id] ?? 0,
              priorityRank: monument.priority_rank,
            })),
          );
          setLoading(false);
        }
      },
      [limit, supabase],
    );

    const saveMonumentOrder = useCallback(
      async (monumentIds: string[]) => {
        if (!supabase) return;

        const previousMonuments = monuments;
        const monumentById = new Map(
          previousMonuments.map((monument) => [monument.id, monument])
        );
        const reorderedMonuments = monumentIds
          .map((monumentId) => monumentById.get(monumentId))
          .filter((monument): monument is Monument => Boolean(monument));

        if (reorderedMonuments.length !== previousMonuments.length) {
          return;
        }

        setMonuments(
          reorderedMonuments.map((monument, index) => ({
            ...monument,
            priorityRank: index + 1,
          }))
        );

        const { error } = await (
          supabase as unknown as MonumentPriorityOrderRpcClient
        ).rpc("save_monument_priority_order", {
          p_monument_ids: monumentIds,
        });

        if (error) {
          console.error("Failed to save Monument order", error);
          setMonuments(previousMonuments);
        }
      },
      [monuments, supabase]
    );

    useImperativeHandle(ref, () => ({ refresh: () => load() }), [load]);

    useEffect(() => {
      let cancelled = false;
      void load(() => cancelled);
      return () => {
        cancelled = true;
      };
    }, [load]);

    if (loading) {
      return (
        <div className="app-dashboard-monuments-panel px-4">
          <div className="grid grid-cols-4 gap-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton
                key={i}
                className="app-dashboard-monument-skeleton aspect-square w-full rounded-2xl bg-white/[0.06]"
              />
            ))}
          </div>
        </div>
      );
    }

    if (monuments.length === 0) {
      if (renderEmptyChildren) {
        return <>{children([], saveMonumentOrder)}</>;
      }

      return <MonumentsEmptyState onAction={() => router.push(createHref)} />;
    }

    return <>{children(monuments, saveMonumentOrder)}</>;
  },
);

export default MonumentsList;
