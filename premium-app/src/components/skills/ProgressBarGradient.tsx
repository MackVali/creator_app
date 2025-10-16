import React from "react";
import { cn } from "../../../lib/utils";

interface ProgressBarGradientProps {
  value?: number;
  height?: number;
  className?: string;
}

export function ProgressBarGradient({
  value = 0,
  height = 10,
  className,
}: ProgressBarGradientProps) {
  const clamped = Math.min(Math.max(value ?? 0, 0), 100);

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "w-full bg-slate-800/70 ring-1 ring-white/5 rounded-full overflow-hidden",
        className
      )}
      style={{ height }}
    >
      <div
        className="h-full bg-gradient-to-r from-gray-200 to-gray-400 transition-[width] duration-300 shadow-[0_0_2px_rgba(0,0,0,0.4)]"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export default ProgressBarGradient;

