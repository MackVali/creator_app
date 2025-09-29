"use client";

import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { LevelBanner } from "@/components/ui/LevelBanner";
import { MonumentContainer } from "@/components/ui/MonumentContainer";
import SkillsCarousel from "./_skills/SkillsCarousel";

export default function DashboardClient() {
  return (
    <main className="pb-20">
      <LevelBanner level={80} current={3200} total={4000} />

      <MonumentContainer />

      <Section title={<Link href="/skills">Skills</Link>} className="mt-1 px-4">
        <SkillsCarousel />
      </Section>
    </main>
  );
}
