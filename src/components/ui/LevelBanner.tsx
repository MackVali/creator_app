import React from "react";

export function LevelBanner({
  level = 80,
  current = 3200,
  total = 4000,
}: {
  level?: number;
  current?: number;
  total?: number;
}) {
  const pct = Math.max(0, Math.min(100, Math.round((current / total) * 100)));
  return (
    <section className="bg-panel rounded-lg border border-border shadow-soft p-6 md:p-7">
      <h2 className="mb-4 text-textmed text-[12.5px] md:text-[13px] font-semibold tracking-section uppercase">
        LEVEL {level}
      </h2>
      <div className="relative">
        <div className="h-[10px] w-full rounded-full bg-track" />
        <div
          className="absolute left-0 top-0 h-[10px] rounded-full bg-fill"
          style={{ width: `${pct}%` }}
        />
        <div className="absolute right-0 -top-6">
          <div className="px-2 py-1 bg-card text-textmed rounded-md text-[11.5px]">
            {current} / {total}
          </div>
        </div>
      </div>
    </section>
  );
}
