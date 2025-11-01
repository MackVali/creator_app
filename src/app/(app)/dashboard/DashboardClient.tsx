"use client";

import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { LevelBanner } from "@/components/ui/LevelBanner";
import { MonumentContainer } from "@/components/ui/MonumentContainer";
import SkillsCarousel from "./_skills/SkillsCarousel";

export default function DashboardClient() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col pb-24">
      <LevelBanner />

      <MonumentContainer />

      <Section
        title="Skills"
        description="Your current streak of deliberate practice sessions."
        action={
          <Link
            href="/skills"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/80 transition hover:border-white/20 hover:bg-white/[0.08]"
          >
            View all
            <span aria-hidden className="text-xs">→</span>
          </Link>
        }
        contentClassName="space-y-0"
      >
        <SkillsCarousel />
      </Section>
    </main>
  );
}
