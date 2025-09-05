import React from "react";

export function LevelBanner({
  level = 80, current = 3200, total = 4000
}:{level?:number; current?:number; total?:number;}){
  const pct = Math.max(0, Math.min(100, Math.round((current/total)*100)));
  return (
    <div className="mx-4 mt-4 rounded-lg border border-border bg-panel p-6 shadow-soft">
      <div className="mb-4 text-[12.5px] font-semibold uppercase tracking-section text-textmed md:text-[13px]">
        LEVEL {level}
      </div>
      <div className="relative">
        <div className="h-[10px] w-full rounded-full bg-track" />
        <div
          className="absolute left-0 top-0 h-[10px] rounded-full bg-fill"
          style={{ width: `${pct}%` }}
        />
        <div className="absolute right-0 -top-6 rounded-md bg-card px-2 py-1 text-[11.5px] text-textmed">
          {current} / {total}
        </div>
      </div>
    </div>
  );
}
