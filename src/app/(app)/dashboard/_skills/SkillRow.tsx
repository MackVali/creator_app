"use client";

import Link from "next/link";
import type { Skill } from "./useSkillsData";

export function computeWidth(percent: number) {
  const clamped = Math.max(0, Math.min(100, percent));
  return `${clamped}%`;
}

interface Props {
  skill: Skill;
  onColor: string;
  trackColor: string;
  fillColor: string;
}

export default function SkillRow({ skill, onColor, trackColor, fillColor }: Props) {
  return (
    <Link
      href={`/skills/${skill.id}`}
      className="rounded-2xl bg-black/15 border border-black/20 px-3 py-2.5 flex items-center gap-3 active:scale-[.98] transition-transform"
      style={{ color: onColor }}
    >
      <div className="size-9 rounded-xl bg-black/25 flex items-center justify-center text-lg">
        {skill.emoji || ""}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate" style={{ color: onColor }}>
          {skill.name}
        </div>
        <div
          className="mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded-lg border border-white/15 bg-white/8"
          style={{ color: onColor }}
        >
          Lv {skill.level}
        </div>
      </div>
      <div className="flex items-center gap-2 min-w-[36%]">
        <div
          className="flex-1 h-2 rounded-full overflow-hidden"
          style={{ backgroundColor: trackColor }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-200"
            style={{ width: computeWidth(skill.xpPercent), backgroundColor: fillColor }}
          />
        </div>
        <span className="text-xs" style={{ color: onColor }}>
          {skill.xpPercent}%
        </span>
      </div>
    </Link>
  );
}

