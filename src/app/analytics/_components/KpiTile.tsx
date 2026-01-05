"use client";

import { useState } from "react";
import type { Kpi } from "@/lib/analytics/types";

interface KpiTileProps extends Kpi {
  onOpen?: () => void;
}

export function KpiTile({
  id,
  label,
  value,
  delta,
  spark,
  confidence,
  target,
  top,
  onOpen,
}: KpiTileProps) {
  const [isHovered, setIsHovered] = useState(false);

  const isPositive = delta > 0;
  const deltaColor = isPositive ? "text-emerald-400" : "text-red-400";
  const deltaSymbol = isPositive ? "▲" : "▼";

  // Calculate sparkline path
  const width = 40;
  const height = 20;
  const padding = 2;

  if (spark.length === 0) {
    return null;
  }

  const max = Math.max(...spark);
  const min = Math.min(...spark);
  const range = max - min || 1;

  const points = spark.map((value, index) => {
    const x = (index / (spark.length - 1)) * (width - padding * 2) + padding;
    const y =
      height - ((value - min) / range) * (height - padding * 2) - padding;
    return `${x},${y}`;
  });

  const pathData = `M ${points.join(" L ")}`;

  // Target band
  let targetBand = null;
  if (target && target.length === 2) {
    const [minTarget, maxTarget] = target;
    const targetMinY =
      height - ((maxTarget - min) / range) * (height - padding * 2) - padding;
    const targetMaxY =
      height - ((minTarget - min) / range) * (height - padding * 2) - padding;
    const bandHeight = Math.max(1, targetMaxY - targetMinY);

    targetBand = (
      <rect
        x={0}
        y={targetMinY}
        width={width}
        height={bandHeight}
        fill="rgba(255,255,255,0.05)"
        rx={1}
      />
    );
  }

  return (
    <button
      onClick={onOpen}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group relative w-full rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-950/80 to-black/60 p-4 text-left transition-all hover:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-600 ${
        isHovered ? "shadow-lg" : ""
      }`}
      aria-label={`${label}: ${value} (${delta > 0 ? "+" : ""}${delta})`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm text-zinc-400">{label}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <div className="text-3xl font-semibold text-white">
              {typeof value === "number" && value % 1 !== 0
                ? value.toFixed(2)
                : value}
            </div>
            {delta !== 0 && (
              <div className={`flex items-center gap-1 text-sm ${deltaColor}`}>
                <span>{deltaSymbol}</span>
                <span>{Math.abs(delta)}</span>
              </div>
            )}
          </div>
          {top && <div className="mt-1 text-xs text-zinc-500">Top: {top}</div>}
        </div>
        <div className="flex flex-col items-end gap-2">
          {confidence && (
            <div className="text-xs text-zinc-500 uppercase tracking-wider">
              {confidence}
            </div>
          )}
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="text-zinc-400"
            aria-hidden="true"
          >
            {targetBand}
            <path
              d={pathData}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </button>
  );
}
