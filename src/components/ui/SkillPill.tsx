import React from "react";

export function SkillPill({
  emoji = "✦",
  title,
  pct = 0,
}: {
  emoji?: string;
  title: string;
  pct?: number;
}) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="bg-card rounded-lg border border-border p-4 flex items-center gap-3 hover:bg-cardho transition-colors duration-150">
      <div className="w-9 h-9 rounded-full bg-pill flex items-center justify-center text-icon text-[15px]">
        {emoji}
      </div>
      <div className="flex-1">
        <div className="text-texthi text-[15px] font-medium">{title}</div>
        <div className="mt-2 h-2 rounded bg-track">
          <div className="h-2 rounded bg-fill" style={{ width: `${w}%` }} />
        </div>
      </div>
    </div>
  );
}
