"use client";

import { useEffect, useState, type ReactNode } from "react";
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
  children: (monuments: Monument[]) => ReactNode;
}

export function MonumentsList({
  limit,
  createHref = "/monuments/new",
  children,
}: MonumentsListProps) {
  const [monuments, setMonuments] = useState<Monument[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = getSupabaseBrowser();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    async function load() {
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
      if (!cancelled) {
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
              {}
            );
          }
        }

        if (cancelled) {
          return;
        }

        setMonuments(
          monumentsData.map((monument) => ({
            ...monument,
            goalCount: goalCounts[monument.id] ?? 0,
          }))
        );
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, limit]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton
            key={i}
            className="aspect-square w-full rounded-3xl border border-white/5 bg-white/[0.04] shadow-[0_12px_30px_rgba(8,10,18,0.35)]"
          />
        ))}
      </div>
    );
  }

  if (monuments.length === 0) {
    return <MonumentsEmptyState onAction={() => router.push(createHref)} />;
  }

  return <>{children(monuments)}</>;
}

export default MonumentsList;

