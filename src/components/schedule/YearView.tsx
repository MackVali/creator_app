"use client";

import { MonthView } from "./MonthView";
import type { FlameLevel } from "../FlameEmber";

interface YearViewProps {
  year?: number;
  energyMap?: Record<string, FlameLevel>;
  selectedDate?: Date;
  onSelectDate?: (date: Date) => void;
}

/**
 * Scrollable view of all months in a year.
 */
export function YearView({
  year = new Date().getFullYear(),
  energyMap,
  selectedDate,
  onSelectDate,
}: YearViewProps) {
  return (
    <div className="max-h-[70vh] overflow-y-auto space-y-4 p-2">
      {Array.from({ length: 12 }, (_, m) => (
        <MonthView
          key={m}
          date={new Date(year, m, 1)}
          energyMap={energyMap}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
        />
      ))}
    </div>
  );
}

