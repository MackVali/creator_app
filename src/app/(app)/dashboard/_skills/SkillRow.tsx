"use client";

import Link from "next/link";
import type { Skill } from "./useSkillsData";
import type { SkillProgressData } from "./useSkillProgress";

export function computeWidth(percent: number) {
  const clamped = Math.max(0, Math.min(100, percent));
  return `${clamped}%`;
}

interface Props {
  skill: Skill;
  progress?: SkillProgressData;
  onColor: string;
  trackColor: string;
  fillColor: string;
}

export default function SkillRow({ skill, progress, onColor, trackColor, fillColor }: Props) {
  const level = progress?.level ?? skill.level;
  const showLevel = level !== null && level !== undefined;
  const showProgress =
    progress?.xpIntoLevel !== undefined &&
    progress?.xpIntoLevel !== null &&
    progress?.xpRequired !== undefined &&
    progress?.xpRequired !== null &&
    progress.xpRequired > 0;

  const percent = progress?.progressPercent ?? 0;
  const formattedPercent = Number.isFinite(percent)
    ? Math.round(percent)
    : 0;

  return (
    <Link
      href={`/skills/${skill.id}`}
      className="rounded-2xl bg-black/15 border border-black/20 px-3 py-2.5 flex items-center gap-3 active:scale-[.98] transition-transform"
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      style={{ color: onColor }}
    >
      <div className="size-9 rounded-xl bg-black/25 flex items-center justify-center text-lg">
        {skill.emoji || ""}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate" style={{ color: onColor }}>
          {skill.name}
        </div>
        {showLevel && (
          <div
            className="mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded-lg border border-white/15 bg-white/8"
            style={{ color: onColor }}
          >
            Lv {level}
          </div>
        )}
      </div>
      {showProgress && (
        <div className="flex items-center gap-2 min-w-[36%]">
          <div
            className="flex-1 h-2 rounded-full overflow-hidden"
            style={{ backgroundColor: trackColor }}
          >
            <div
              className="h-full rounded-full transition-[width] duration-200"
              style={{ width: computeWidth(progress?.progressPercent ?? 0), backgroundColor: fillColor }}
            />
          </div>
          <span className="text-xs" style={{ color: onColor }}>
            {progress?.xpIntoLevel ?? 0} / {progress?.xpRequired ?? 0} XP
            <span className="ml-1 text-[11px] text-white/80">({formattedPercent}%)</span>
          </span>
        </div>
      )}
    </Link>
  );
}

