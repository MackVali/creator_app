"use client";

import { MonthView } from "./MonthView";
import { useEffect, useRef } from "react";
import type { FlameLevel } from "@/components/FlameEmber";

interface YearViewProps {
  events?: Record<string, number>;
  energies?: Record<string, FlameLevel>;
  selectedDate?: Date;
  onSelectDate?: (date: Date) => void;
}

/**
 * Scrollable list of months centered on the current month.
 */
export function YearView({ events, energies, selectedDate, onSelectDate }: YearViewProps) {
  const today = new Date();
  const pastMonths = 10 * 12;
  const futureMonths = 10 * 12;
  const months = Array.from(
    { length: pastMonths + futureMonths + 1 },
    (_, i) => new Date(today.getFullYear(), today.getMonth() - pastMonths + i, 1)
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
          ref={i === pastMonths ? currentRef : undefined}
          className="space-y-2"
        >
          <h2 className="px-2 text-sm font-semibold text-[var(--text-primary)]">
            {date.toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </h2>
          <MonthView
            date={date}
            events={events}
            energies={energies}
            selectedDate={selectedDate}
            onSelectDate={onSelectDate}
            showAdjacentMonths={false}
            showMonthLabel={false}
          />
        </div>
      ))}
    </div>
  );
}

