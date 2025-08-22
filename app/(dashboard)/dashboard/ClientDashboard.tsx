"use client";

import Section from "@/components/ui/Section";
import ProgressBar from "@/components/ui/ProgressBar";
import StatCard from "@/components/ui/StatCard";
import SkillCard from "@/components/ui/SkillCard";
import {
  Trophy,
  Medal,
  Star,
  Mountain,
  Pen,
  Clock,
  Mic,
  Brain,
  Music as MusicIcon,
  Guitar as GuitarIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Level, Monument, Skill } from "./data";

const monumentIcons: Record<string, LucideIcon> = {
  Achievement: Trophy,
  Legacy: Medal,
  Triumph: Star,
  Pinnacle: Mountain,
};

const skillIcons: Record<string, LucideIcon> = {
  Writing: Pen,
  "Time Management": Clock,
  "Public Speaking": Mic,
  "Problem Solving": Brain,
  Music: MusicIcon,
  Guitar: GuitarIcon,
};

interface Props {
  level: Level;
  monuments: Monument[];
  skills: Skill[];
  goals: string[];
}

export default function ClientDashboard({
  level,
  monuments,
  skills,
  goals,
}: Props) {
  return (
    <div className="container mx-auto max-w-6xl px-4 md:px-6 py-8 md:py-10 flex flex-col gap-6 md:gap-8">
      <h1 className="sr-only">Dashboard</h1>
      {/* HEADER */}
      <div className="relative h-24 md:h-28 w-full rounded-2xl bg-white/5 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#ffffff33,#ffffff00)] opacity-30" />
      </div>

      {/* LEVEL */}
      <div className="rounded-2xl border border-white/10 bg-[#151517] p-4 space-y-4 shadow-sm">
        <div className="text-sm md:text-base uppercase tracking-wide text-white/70">
          LEVEL {level.level}
        </div>
        <ProgressBar
          value={level.xp}
          max={level.next}
          labelRight={`${level.xp} / ${level.next}`}
        />
      </div>

      {/* MONUMENTS */}
      <Section title="MONUMENTS">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {monuments.map((m) => {
            const Icon = monumentIcons[m.label] ?? Trophy;
            return (
              <StatCard
                key={m.label}
                icon={<Icon className="h-5 w-5 text-white/70" />}
                label={m.label}
                value={m.count}
              />
            );
          })}
        </div>
      </Section>

      {/* SKILLS */}
      <Section title="SKILLS">
        <div className="grid md:grid-cols-2 gap-5">
          {skills.map((s) => {
            const Icon = skillIcons[s.name] ?? Pen;
            return (
              <SkillCard
                key={s.name}
                icon={<Icon className="h-4 w-4 text-white/70" />}
                name={s.name}
                percent={s.percent}
              />
            );
          })}
        </div>
      </Section>

      {/* CURRENT GOALS */}
      <Section title="CURRENT GOALS">
        <div className="rounded-2xl border border-white/10 bg-[#151517] p-5 shadow-sm">
          <ul className="list-disc list-inside space-y-2 text-white/85 leading-relaxed">
            {goals.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      </Section>
    </div>
  );
}
