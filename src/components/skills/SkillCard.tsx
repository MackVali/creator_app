/* eslint-disable @next/next/no-img-element */
import React from "react";
import Link from "next/link";
import ProgressBarGradient from "@/components/skills/ProgressBarGradient";

interface SkillCardProps {
  icon: string | React.ReactNode | null;
  name: string;
  level?: number;
  percent?: number;
  skillId?: string;
}

export function SkillCard({
  icon,
  name,
  level = 1,
  percent = 0,
  skillId,
}: SkillCardProps) {
  const value = percent ?? 0;

  const renderIcon = () => {
    if (!icon) {
      return (
        <span aria-hidden="true" className="text-xl leading-none">
          🧩
        </span>
      );
    }
    if (typeof icon === "string" && icon.startsWith("http")) {
      return <img src={icon} alt="" className="h-6 w-6" />;
    }
    if (typeof icon === "string") {
      return (
        <span aria-hidden="true" className="text-xl leading-none">
          {icon}
        </span>
      );
    }
    return icon;
  };

  const cardContent = (
    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-900/60 ring-1 ring-white/10 shadow-[inset_0_1px_rgba(255,255,255,0.05),0_6px_18px_rgba(0,0,0,0.35)] hover:bg-slate-800/60 transition-colors">
      <div className="flex h-9 w-9 items-center justify-center rounded bg-white/5 ring-1 ring-white/10">
        {renderIcon()}
      </div>
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
    </div>
  );

  if (skillId) {
    return (
      <Link href={`/skills/${skillId}`} className="block">
        {cardContent}
      </Link>
    );
  }

  return cardContent;
}

export default SkillCard;
