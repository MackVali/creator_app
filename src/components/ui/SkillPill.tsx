import React from "react";

export function SkillPill({
  emoji = "✦", title, pct = 50
}:{emoji?:string; title:string; pct?:number;}){
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="card rounded-full px-4 py-3 mb-3">
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-full bg-[#0c0f14] border border-white/10 grid place-items-center text-[15px]"
        >
          {emoji}
        </div>
        <div className="flex-1">
          <div className="font-semibold">{title}</div>
          <div className="mt-1 h-[6px] rounded-full bg-[#0c0f14]">
            <div
              className="h-[6px] rounded-full bg-gradient-to-r from-gray-700 to-gray-900"
              style={{ width: `${w}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
