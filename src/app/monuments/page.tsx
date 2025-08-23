"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase";

interface Monument {
  id: string;
  title: string;
  emoji: string | null;
}

export default function MonumentsPage() {
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
        .order("created_at", { ascending: false });
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
    <main className="p-4 space-y-4">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Monuments</h1>
        <Link
          href="/monuments/new"
          className="rounded-full bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black"
        >
          + Add Monument
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
        <ul className="space-y-3">
          {monuments.map((m) => (
            <li
              key={m.id}
              className="card flex items-center gap-3 p-3"
              style={{ borderRadius: "var(--radius-sm)" }}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10 text-2xl">
                {m.emoji || "🏛️"}
              </div>
              <p className="flex-1 truncate font-medium">{m.title}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

