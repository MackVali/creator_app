import React from "react";

interface Props {
  value: number;
  max: number;
  labelRight?: string;
}

export default function ProgressBar({ value, max, labelRight }: Props) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex items-center gap-2" role="progressbar" aria-valuenow={value} aria-valuemax={max} aria-label={labelRight ? undefined : `progress ${value} of ${max}`}> 
      <div className="flex-1 h-3 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full bg-white/60" style={{ width: `${pct}%` }} />
      </div>
      {labelRight && (
        <span className="text-xs px-2 py-0.5 bg-white/10 rounded-full text-white/60">
          {labelRight}
        </span>
      )}
    </div>
  );
}
