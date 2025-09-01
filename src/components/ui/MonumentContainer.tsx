"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase";
import MonumentGridWithSharedTransition, {
  type Monument as MonumentCard,
} from "@/components/MonumentGridWithSharedTransition";

interface FetchedMonument {
  id: string;
  title: string;
  emoji: string | null;
}

export function MonumentContainer() {
  const [monuments, setMonuments] = useState<FetchedMonument[] | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = getSupabaseBrowser();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!supabase) return;
      setLoading(true);
      await supabase.auth.getSession();
      const { data, error } = await supabase
        .from("monuments")
        .select("id,title,emoji")
        .order("created_at", { ascending: false })
        .range(0, 7);
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
  }, [supabase]);

  return (
    <section className="section mt-2">
      <div className="mb-3">
        <Link href="/monuments" className="h-label block">
          Monuments
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : !monuments || monuments.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="mb-4">No Monuments yet.</p>
          <Link
            href="/monuments/new"
            className="inline-block rounded-full bg-[var(--accent)] px-4 py-2 font-semibold text-black"
          >
            + Add Monument
          </Link>
        </div>
      ) : (
        <div className="px-4">
          <MonumentGridWithSharedTransition
            monuments={(monuments ?? []).map<MonumentCard>((m) => ({
              id: m.id,
              emoji: m.emoji || "🏛️",
              title: m.title,
              stats: "0 Goals",
            }))}
          />
        </div>
      )}
    </section>
  );
}
