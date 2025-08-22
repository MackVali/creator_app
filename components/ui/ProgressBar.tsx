import React from "react";

interface Props {
  value: number;
  max: number;
  labelRight?: string;
}

export default function ProgressBar({ value, max, labelRight }: Props) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      className="relative h-3 w-full rounded-full bg-white/10 overflow-hidden"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemax={max}
      aria-label={labelRight ? undefined : `progress ${value} of ${max}`}
    >
      <div
        className="h-full rounded-full bg-white/70"
        style={{ width: `${pct}%` }}
      />
        {labelRight && (
          <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[11px] md:text-xs px-2 py-0.5 bg-white/10 rounded-full text-white/80">
            {labelRight}
          </span>
        )}
      </div>
    );
  }
