"use client";

import { EnergyFlame } from "@/components/ui";
import type { EnergyLevel } from "@/components/ui/EnergyFlame";

const LEVELS: EnergyLevel[] = [
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
          <EnergyFlame level={lvl} />
          <span className="capitalize">{lvl.toLowerCase()}</span>
        </div>
      ))}
    </div>
  );
}

