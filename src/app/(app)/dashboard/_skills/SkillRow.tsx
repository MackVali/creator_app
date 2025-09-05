"use client";

import Link from "next/link";
import type { Skill } from "./useSkillsData";

export function computeWidth(percent: number) {
  const clamped = Math.max(0, Math.min(100, percent));
  return `${clamped}%`;
}

interface Props {
  skill: Skill;
}

export default function SkillRow({ skill }: Props) {
  const showLevel = skill.level !== null && skill.level !== undefined;
  const showProgress = skill.xpPercent !== null && skill.xpPercent !== undefined;

  return (
    <Link
      href={`/skills/${skill.id}`}
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-texthi transition-colors duration-150 hover:bg-cardho active:scale-[.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border"
    >
      <div className="flex size-9 items-center justify-center rounded-full bg-pill text-lg text-icon">
        {skill.emoji || ""}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{skill.name}</div>
        {showLevel && (
          <div className="mt-1 inline-block rounded-lg border border-border bg-pill px-1.5 py-0.5 text-[10px] text-textmed">
            Lv {skill.level}
          </div>
        )}
      </div>
      {showProgress && (
        <div className="min-w-[36%] flex items-center gap-2">
          <div className="flex-1 h-2 overflow-hidden rounded-full bg-track">
            <div
              className="h-full rounded-full bg-fill transition-[width] duration-200"
              style={{ width: computeWidth(skill.xpPercent as number) }}
            />
          </div>
          <span className="text-xs text-textmed">{skill.xpPercent}%</span>
        </div>
      )}
    </Link>
  );
}

