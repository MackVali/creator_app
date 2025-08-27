import React from "react";
import Link from "next/link";
import ProgressBarGradient from "@/components/skills/ProgressBarGradient";

interface SkillCardProps {
  id: string;
  icon: React.ReactNode;
  name: string;
  level: number;
  percent?: number;
}

export function SkillCard({ id, icon, name, level, percent = 0 }: SkillCardProps) {
  const value = percent ?? 0;

  return (
    <Link
      href={`/skills/${id}`}
      className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-900/60 ring-1 ring-white/10 shadow-[inset_0_1px_rgba(255,255,255,0.05),0_6px_18px_rgba(0,0,0,0.35)]"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded bg-white/5 ring-1 ring-white/10">
        {typeof icon === "string" ? <span className="text-lg">{icon}</span> : icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" title={name}>
          {name}
        </div>
        <ProgressBarGradient value={value} height={10} className="mt-2" />
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="text-[11px] rounded-full bg-white/8 ring-1 ring-white/10 px-2 py-[2px]">
          Lv {level}
        </span>
        <span className="text-[11px] opacity-70">{Math.round(value)}%</span>
      </div>
    </Link>
  );
}

export default SkillCard;

