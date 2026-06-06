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
import { MonumentsEmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export interface Monument {
  id: string;
  title: string;
  emoji: string | null;
  goalCount: number;
}

interface MonumentsListProps {
  limit?: number;
  createHref?: string;
  renderEmptyChildren?: boolean;
  children: (monuments: Monument[]) => ReactNode;
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
          .select("id,title,emoji")
          .order("created_at", { ascending: false });
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
          }[];

          let goalCounts: Record<string, number> = {};
          if (monumentsData.length) {
            const monumentIds = monumentsData.map((monument) => monument.id);
            const { data: goalsData, error: goalsError } = await supabase
              .from("goals")
              .select("monument_id")
              .in("monument_id", monumentIds);
            if (goalsError) {
              console.error(goalsError);
            } else {
              goalCounts = (goalsData ?? []).reduce<Record<string, number>>(
                (acc, goal) => {
                  const monumentId = goal.monument_id;
                  if (monumentId) {
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
            })),
          );
          setLoading(false);
        }
      },
      [limit, supabase],
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
        <div className="px-4">
          <div className="grid grid-cols-4 gap-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton
                key={i}
                className="aspect-square w-full rounded-2xl bg-white/[0.06]"
              />
            ))}
          </div>
        </div>
      );
    }

    if (monuments.length === 0) {
      if (renderEmptyChildren) {
        return <>{children([])}</>;
      }

      return <MonumentsEmptyState onAction={() => router.push(createHref)} />;
    }

    return <>{children(monuments)}</>;
  },
);

export default MonumentsList;
