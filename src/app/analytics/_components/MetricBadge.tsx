import { ReactNode } from "react";
import { Sparkline } from "@/components/visuals/Sparkline";

interface MetricBadgeProps {
  label: string;
  value: string | number;
  delta?: number;
  spark?: number[];
  tooltip?: string;
}

export function MetricBadge({
  label,
  value,
  delta,
  spark,
  tooltip,
}: MetricBadgeProps) {
  const formatDelta = (delta: number) => {
    const sign = delta > 0 ? "+" : "";
    return `${sign}${delta}`;
  };

  return (
    <div
      className="flex items-center gap-3 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
      title={tooltip}
    >
      <span className="text-zinc-400">{label}:</span>
      <span className="font-semibold text-white">{value}</span>
      {delta !== undefined && (
        <span
          className={`text-xs ${
            delta > 0
              ? "text-green-400"
              : delta < 0
              ? "text-red-400"
              : "text-zinc-400"
          }`}
        >
          {delta > 0 ? "▲" : delta < 0 ? "▼" : "—"}
          {formatDelta(delta)}
        </span>
      )}
      {spark && spark.length > 0 && (
        <div className="h-6 w-10">
          <Sparkline
            data={spark}
            width={40}
            height={24}
            strokeWidth={1.5}
            area={false}
            className="text-red-400"
          />
        </div>
      )}
    </div>
  );
}
