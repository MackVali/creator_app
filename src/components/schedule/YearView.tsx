"use client";

import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { FlameLevel } from "@/components/FlameEmber";
import MiniMonth from "./MiniMonth";

interface YearViewProps {
  events?: Record<string, number>;
  energies?: Record<string, FlameLevel>;
  selectedDate?: Date;
  onSelectDate?: (date: Date) => void;
}

/**
 * Virtualized scrollable list of years. Each year displays a grid of months
 * similar to the iOS calendar year view.
 */
export function YearView({
  events: _events,
  energies: _energies,
  selectedDate,
  onSelectDate,
}: YearViewProps) {
  const today = useMemo(() => new Date(), []);
  const totalYears = 400; // ~200 years back and forward
  const currentIndex = Math.floor(totalYears / 2);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: totalYears,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 420,
    overscan: 2,
  });

  useEffect(() => {
    virtualizer.scrollToIndex(currentIndex, { align: "center" });
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
          const year = today.getFullYear() + item.index - currentIndex;
          return (
            <div
              key={item.key}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full mb-4"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <h2 className="px-2 text-lg font-semibold text-[var(--text-primary)] mb-2">
                {year}
              </h2>
              <div className="grid grid-cols-3 gap-2 px-2">
                {Array.from({ length: 12 }).map((_, m) => (
                  <MiniMonth
                    key={m}
                    year={year}
                    month={m}
                    selectedDate={selectedDate}
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

