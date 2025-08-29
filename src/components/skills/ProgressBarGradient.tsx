import React from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  height?: number;
  className?: string;
}

export function ProgressBarGradient({ value, height = 8, className }: Props) {
  const clamped = Math.min(Math.max(value, 0), 100);
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "w-full overflow-hidden rounded-full bg-white/5 ring-1 ring-white/10",
        className
      )}
      style={{ height }}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-gray-300 to-gray-500 transition-[width] duration-300"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export default ProgressBarGradient;
