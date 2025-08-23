import React from "react";
import { Section } from "@/components/ui/Section";
import { LevelBanner } from "@/components/ui/LevelBanner";
import { MonoCard } from "@/components/ui/MonoCard";
import { SkillPill } from "@/components/ui/SkillPill";
import { GoalsCard } from "@/components/ui/GoalsCard";

export default function DashboardPage(){
  return (
    <main className="pb-20">
      <LevelBanner level={80} current={3200} total={4000} />

      <Section title="Monuments" className="mt-2">
        <div className="px-4 overflow-x-auto scroll-snap">
          <div className="flex">
            <MonoCard emoji="🏆" title="Achievement" value={5} />
            <MonoCard emoji="🎗️" title="Legacy" value={10} />
            <MonoCard emoji="🟊" title="Triumph" value={4} />
            <MonoCard emoji="⛰️" title="Pinnacle" value={7} />
          </div>
        </div>
      </Section>

      <Section title="Skills" className="mt-1 px-4">
        <SkillPill emoji="🖊️" title="Writing" pct={65} />
        <SkillPill emoji="⏱️" title="Time Management" pct={40} />
        <SkillPill emoji="🗣️" title="Public Speaking" pct={30} />
        <SkillPill emoji="🧩" title="Problem Solving" pct={55} />
        <SkillPill emoji="🎵" title="Music" pct={20} />
        <SkillPill emoji="🎸" title="Guitar" pct={15} />
      </Section>

      <Section title="Current Goals" className="safe-bottom mt-2">
        <GoalsCard items={[
          "Complete book manuscript",
          "Improve presentation skills",
          "Plan charity event",
        ]} />
      </Section>
    </main>
  );
}
