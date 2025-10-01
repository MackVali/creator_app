"use client";

import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { LevelBanner } from "@/components/ui/LevelBanner";
import { MonumentContainer } from "@/components/ui/MonumentContainer";
import { type Monument } from "@/components/monuments/MonumentsList";
import SkillsCarousel from "./_skills/SkillsCarousel";

interface DashboardClientProps {
  monuments: Monument[];
}

export default function DashboardClient({ monuments }: DashboardClientProps) {
  return (
    <main className="pb-20">
      <LevelBanner level={80} current={3200} total={4000} />

      <MonumentContainer monuments={monuments} />

      <Section title={<Link href="/skills">Skills</Link>} className="mt-1 px-4">
        <SkillsCarousel />
      </Section>
    </main>
  );
}
