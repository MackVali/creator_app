import React from "react";

interface Props {
  icon: React.ReactNode;
  name: string;
  percent: number;
}

export default function SkillCard({ icon, name, percent }: Props) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-[#151517] p-4 hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 ring-white/30">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 opacity-80">
        {icon}
      </div>
      <div className="flex-1 space-y-2">
        <div className="font-semibold text-white/85">{name}</div>
        <div className="h-[6px] rounded-full bg-white/10 overflow-hidden">
          <div className="h-full rounded-full bg-white/70" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
