import React from "react";

export function LevelBanner({
  level = 80, current = 3200, total = 4000
}:{level?:number; current?:number; total?:number;}){
  const pct = Math.max(0, Math.min(100, Math.round((current/total)*100)));
  return (
    <div className="card mx-4 mt-4 p-4">
      <div className="mb-3">
        <div className="font-extrabold text-[18px] tracking-wide">LEVEL {level}</div>
      </div>
      <div className="relative">
        <div className="h-[12px] w-full rounded-full bg-[#0c0f14] inner-hair" />
        <div className="absolute left-0 top-0 h-[12px] rounded-full bg-[var(--accent)]" style={{width:`${pct}%`}} />
        <div className="absolute right-1 -top-6 text-[11px] px-2 py-[2px] rounded-full bg-[#0c0f14] border border-white/10">
          {current} / {total}
        </div>
      </div>
    </div>
  );
}
