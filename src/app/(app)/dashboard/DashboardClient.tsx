"use client";

import React from "react";
import { Section } from "@/components/ui/Section";
import { LevelBanner } from "@/components/ui/LevelBanner";
import { GoalsCard } from "@/components/ui/GoalsCard";
import { MonumentContainer } from "@/components/ui/MonumentContainer";
import SkillsContainer from "@/components/dashboard/SkillsContainer";
import { Skill } from "@/types/skills";

interface DashboardClientProps {
  skills: Skill[];
}

export default function DashboardClient({ skills }: DashboardClientProps) {
  return (
    <main className="pb-20">
      <LevelBanner level={80} current={3200} total={4000} />

      <MonumentContainer />

      <SkillsContainer skills={skills} />

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
