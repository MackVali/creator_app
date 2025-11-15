"use client";

import Link from "next/link";

import MonumentGridWithSharedTransition, {
  type Monument as MonumentCard,
} from "@/components/MonumentGridWithSharedTransition";
import { MonumentsList } from "@/components/monuments/MonumentsList";
import { Section } from "@/components/ui/Section";

export function MonumentContainer() {
  return (
    <Section
      title="Monuments"
      description="Celebrate the milestones and creative builds that define your journey."
      action={
        <Link
          href="/monuments"
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/60 transition hover:text-white"
        >
          Browse all
          <span aria-hidden className="text-sm">↗</span>
        </Link>
      }
      contentClassName="space-y-0"
    >
      <MonumentsList limit={8} createHref="/monuments/new">
        {(monuments) => (
          <MonumentGridWithSharedTransition
            monuments={monuments.map<MonumentCard>((m) => ({
              id: m.id,
              emoji: m.emoji ?? null,
              title: m.title,
              stats: `${m.goalCount} Goal${m.goalCount === 1 ? "" : "s"}`,
            }))}
          />
        )}
      </MonumentsList>
    </Section>
  );
}

