"use client";

import { useRouter } from "next/navigation";
import type { Skill } from "./useSkillsData";

interface SkillRowProps {
  skill: Skill;
}

export function SkillRow({ skill }: SkillRowProps) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push(`/skills/${skill.id}`)}
      className="w-full rounded-2xl bg-black/15 border border-black/20 px-3 py-2.5 flex items-center gap-3 text-left"
    >
      <div className="size-9 rounded-xl bg-black/20 flex items-center justify-center text-lg">
        {skill.icon || "💡"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 truncate">
          <span className="text-white/90 font-medium truncate">{skill.name}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-md border border-white/15 bg-white/10 text-white/70 flex-shrink-0">
            Lv {skill.level}
          </span>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <div className="h-2 w-[38%] min-w-[120px] rounded-full bg-white/15 overflow-hidden">
          <div
            className="h-full rounded-full bg-white/80 transition-[width] duration-200"
            style={{ width: `${skill.progress}%` }}
          />
        </div>
        <span className="text-xs text-white/70 w-9 text-right">
          {Math.round(skill.progress)}%
        </span>
      </div>
    </button>
  );
}

