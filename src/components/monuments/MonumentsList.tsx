"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase";
import { MonumentsEmptyState } from "@/components/ui/empty-state";

export interface Monument {
  id: string;
  title: string;
  emoji: string | null;
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
        setMonuments(data ?? []);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, limit]);

  if (loading) {
    return <p className="text-sm text-[var(--muted)]">Loading…</p>;
  }

  if (monuments.length === 0) {
    return <MonumentsEmptyState onAction={() => router.push(createHref)} />;
  }

  return <>{children(monuments)}</>;
}

export default MonumentsList;

