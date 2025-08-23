"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase";

interface Monument {
  id: string;
  title: string;
  emoji: string | null;
}

export function MonumentContainer() {
  const [monuments, setMonuments] = useState<Monument[] | null>(null);
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
        .limit(3);
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
        <div className="px-4 overflow-x-auto scroll-snap">
          <div className="flex">
            {monuments.map((m) => (
              <div
                key={m.id}
                className="card mr-3 flex h-[128px] w-[128px] snap-start flex-col items-center justify-center p-3"
              >
                <div className="mb-2 text-2xl" aria-hidden>
                  {m.emoji || "🏛️"}
                </div>
                <div className="w-full truncate text-center text-sm font-semibold">
                  {m.title}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

