"use client";

import React from "react";
import { Section } from "@/components/ui/Section";
import { LevelBanner } from "@/components/ui/LevelBanner";
import { SkillPill } from "@/components/ui/SkillPill";
import { GoalsCard } from "@/components/ui/GoalsCard";
import { MonumentContainer } from "@/components/ui/MonumentContainer";

export default function DashboardClient() {
  return (
    <main className="pb-20">
      <LevelBanner level={80} current={3200} total={4000} />

      <MonumentContainer />

      <Section title="Skills" className="mt-1 px-4">
        <SkillPill emoji="🖊️" title="Writing" pct={65} />
        <SkillPill emoji="⏱️" title="Time Management" pct={40} />
        <SkillPill emoji="🗣️" title="Public Speaking" pct={30} />
        <SkillPill emoji="🧩" title="Problem Solving" pct={55} />
        <SkillPill emoji="🎵" title="Music" pct={20} />
        <SkillPill emoji="🎸" title="Guitar" pct={15} />
      </Section>

      <Section title="Current Goals" className="safe-bottom mt-2">
        <GoalsCard
          items={[
            "Complete book manuscript",
            "Improve presentation skills",
            "Plan charity event",
          ]}
        />
      </Section>
    </main>
  );
}
