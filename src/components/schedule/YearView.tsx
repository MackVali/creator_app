"use client";

import { MonthView } from "./MonthView";
import type { FlameLevel } from "../FlameEmber";
import { useEffect, useRef } from "react";

interface YearViewProps {
  energyMap?: Record<string, FlameLevel>;
  selectedDate?: Date;
  onSelectDate?: (date: Date) => void;
}

/**
 * Scrollable list of months centered on the current month.
 */
export function YearView({ energyMap, selectedDate, onSelectDate }: YearViewProps) {
  const today = new Date();
  const months = Array.from({ length: 25 }, (_, i) =>
    new Date(today.getFullYear(), today.getMonth() - 12 + i, 1)
  );
  const currentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <div className="max-h-[70vh] overflow-y-auto space-y-4 p-2">
      {months.map((date, i) => (
        <div
          key={`${date.getFullYear()}-${date.getMonth()}`}
          ref={i === 12 ? currentRef : undefined}
        >
          <MonthView
            date={date}
            energyMap={energyMap}
            selectedDate={selectedDate}
            onSelectDate={onSelectDate}
          />
        </div>
      ))}
    </div>
  );
}

