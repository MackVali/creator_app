import Link from "next/link";
import { ReactNode } from "react";
import ProgressBarGradient from "@/components/skills/ProgressBarGradient";

interface SkillCardProps {
  id: string;
  icon: string | ReactNode;
  name: string;
  level?: number;
  percent?: number;
}

export function SkillCard({ id, icon, name, level = 1, percent = 0 }: SkillCardProps) {
  const renderIcon = () => {
    if (typeof icon === "string" && icon.startsWith("http")) {
      return <img src={icon} alt="" className="h-5 w-5" />;
    }
    if (typeof icon === "string") {
      return (
        <span aria-hidden className="text-lg leading-none">
          {icon}
        </span>
      );
    }
    return icon;
  };

  return (
    <Link
      href={`/skills/${id}`}
      className="flex items-center gap-3 p-3 bg-slate-900/60 ring-1 ring-white/10 rounded-2xl shadow-[inset_0_1px_rgba(255,255,255,.06),0_8px_24px_rgba(0,0,0,.45)]"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded bg-white/5 ring-1 ring-white/10">
        {renderIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" title={name}>
          {name}
        </div>
        <ProgressBarGradient value={percent ?? 0} className="mt-1" />
      </div>
      <div className="flex flex-col items-end ml-3 text-xs text-white/80">
        <span className="px-2 rounded-full bg-white/10">Lv {level ?? 1}</span>
        <span className="mt-1">{Math.round(percent ?? 0)}%</span>
      </div>
    </Link>
  );
}

export default SkillCard;
