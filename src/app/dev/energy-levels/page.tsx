"use client";

import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";
const LEVELS: FlameLevel[] = [
  "NO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "ULTRA",
  "EXTREME",
];

export default function EnergyLevelsDemo() {
  return (
    <div className="p-4 space-y-4 text-white">
      {LEVELS.map((lvl) => (
        <div key={lvl} className="flex items-center gap-3">
          <FlameEmber level={lvl} />
          <span className="capitalize">{lvl.toLowerCase()}</span>
        </div>
      ))}
    </div>
  );
}

