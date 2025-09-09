"use client";

import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { MonthView } from "./MonthView";
import type { FlameLevel } from "@/components/FlameEmber";

interface YearViewProps {
  events?: Record<string, number>;
  energies?: Record<string, FlameLevel>;
  selectedDate?: Date;
  onSelectDate?: (date: Date) => void;
}

/**
 * Scrollable list of months centered on the current month.
 * Uses virtualization to only render visible months and
 * dynamically load more as the user scrolls.
 */
export function YearView({
  events,
  energies,
  selectedDate,
  onSelectDate,
}: YearViewProps) {
  const today = useMemo(() => new Date(), []);
  const totalMonths = 2400; // ~200 years
  const currentIndex = Math.floor(totalMonths / 2);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: totalMonths,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 360,
    overscan: 2,
  });

  useEffect(() => {
    virtualizer.scrollToIndex(currentIndex, { align: "start" });
  }, [virtualizer, currentIndex]);

  return (
    <div ref={parentRef} className="max-h-[70vh] overflow-y-auto p-2">
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const date = new Date(
            today.getFullYear(),
            today.getMonth() + item.index - currentIndex,
            1
          );
          return (
            <div
              key={item.key}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full mb-4 space-y-2"
              style={{ transform: `translateY(${item.start}px)` }}
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
          );
        })}
      </div>
    </div>
  );
}

