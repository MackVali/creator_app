"use client";

import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { FlameLevel } from "@/components/FlameEmber";
import MiniMonth from "./MiniMonth";
import { getZonedDateTimeParts } from "@/lib/time/tz";

interface YearViewProps {
  events?: Record<string, number>;
  energies?: Record<string, FlameLevel>;
  timeZone: string;
  selectedDayKey?: string | null;
  onSelectDate?: (date: Date) => void;
}

/**
 * Virtualized scrollable list of years. Each year displays a grid of months
 * similar to the iOS calendar year view.
 */
export function YearView({
  events: _events,
  energies: _energies,
  timeZone,
  selectedDayKey,
  onSelectDate,
}: YearViewProps) {
  const todayParts = useMemo(
    () => getZonedDateTimeParts(new Date(), timeZone),
    [timeZone]
  );
  const totalYears = 400; // ~200 years back and forward
  const currentIndex = Math.floor(totalYears / 2);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: totalYears,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 460,
    overscan: 2,
  });

  useEffect(() => {
    virtualizer.scrollToIndex(currentIndex, { align: "center" });
  }, [virtualizer, currentIndex]);

  return (
    <div ref={parentRef} className="max-h-[70vh] overflow-y-auto">
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const year = todayParts.year + item.index - currentIndex;
          return (
            <div
              key={item.key}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full px-2 pb-6"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">
                {year}
              </h2>
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 12 }).map((_, m) => (
                  <MiniMonth
                    key={m}
                    year={year}
                    month={m}
                    timeZone={timeZone}
                    selectedDayKey={selectedDayKey}
                    onSelect={onSelectDate}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

