"use client";

import Link from "next/link";
import MonumentGridWithSharedTransition, {
  type Monument as MonumentCard,
} from "@/components/MonumentGridWithSharedTransition";
import { MonumentsList } from "@/components/monuments/MonumentsList";

export function MonumentContainer() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] px-5 py-5 shadow-[0_16px_40px_rgba(0,0,0,0.45)] backdrop-blur">
      <div className="absolute inset-x-10 top-0 h-28 rounded-full bg-violet-500/10 blur-3xl" aria-hidden />
      <div className="relative flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/monuments"
          className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60"
        >
          Monuments
        </Link>
        <Link
          href="/monuments/new"
          className="text-xs font-semibold text-white/70 transition hover:text-white"
        >
          New monument
        </Link>
      </div>

      <div className="relative mt-5">
        <MonumentsList limit={8} createHref="/monuments/new">
          {(monuments) => (
            <div className="-mx-1">
              <MonumentGridWithSharedTransition
                monuments={monuments.map<MonumentCard>((m) => ({
                  id: m.id,
                  emoji: m.emoji || "\uD83C\uDFDB\uFE0F",
                  title: m.title,
                  stats: "0 Goals",
                }))}
              />
            </div>
          )}
        </MonumentsList>
      </div>
    </section>
  );
}

