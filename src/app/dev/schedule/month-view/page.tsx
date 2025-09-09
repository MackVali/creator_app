"use client";

import { MonthView } from "@/components/schedule/MonthView";
import type { FlameLevel } from "@/components/FlameEmber";

export default function MonthViewPreview() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = (day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;
  const dayEnergyMap: Record<string, FlameLevel> = {
    [d(2)]: "LOW",
    [d(5)]: "MEDIUM",
    [d(12)]: "HIGH",
    [d(21)]: "EXTREME",
  };
  return (
    <div className="p-4 text-white">
      <MonthView date={now} dayEnergyMap={dayEnergyMap} />
    </div>
  );
}

