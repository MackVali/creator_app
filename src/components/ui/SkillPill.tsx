import React from "react";

export function SkillPill({
  emoji = "✦", title, pct = 50
}:{emoji?:string; title:string; pct?:number;}){
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="mb-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-pill text-icon">
          {emoji}
        </div>
        <div className="flex-1">
          <div className="text-[15px] font-medium text-texthi">{title}</div>
          <div className="mt-1 h-2 rounded-full bg-track">
            <div
              className="h-2 rounded-full bg-fill"
              style={{ width: `${w}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
