"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";

interface MiniMonthProps {
  year: number;
  month: number; // 0-based
  selectedDate?: Date;
  onSelect?: (date: Date) => void;
}

/** A compact month grid used in the year view */
export function MiniMonth({ year, month, selectedDate, onSelect }: MiniMonthProps) {
  const today = useMemo(() => new Date(), []);
  const date = new Date(year, month, 1);
  const monthName = date.toLocaleString(undefined, { month: "short" });
  const firstWeekday = date.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const isSelectedMonth =
    selectedDate &&
    selectedDate.getFullYear() === year &&
    selectedDate.getMonth() === month;
  const selectedDay = isSelectedMonth ? selectedDate!.getDate() : null;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(date)}
      className="flex flex-col rounded-md p-1 text-center text-[10px] text-[var(--text-primary)] hover:bg-[var(--surface)]"
    >
      <div
        className={cn(
          "mb-1",
          isSelectedMonth && "text-[var(--accent-red)] font-semibold"
        )}
      >
        {monthName}
      </div>
      <div className="grid grid-cols-7 gap-[1px]">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="h-3 w-3" />;
          const cellDate = new Date(year, month, d);
          const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6;
          const isToday = isSameDay(cellDate, today);
          const isSelected = selectedDay === d;
          return (
            <div
              key={i}
              className={cn(
                "flex h-3 w-3 items-center justify-center rounded",
                isSelected &&
                  "bg-[var(--accent-red)] text-[var(--surface)] shadow-[inset_0_-1px_1px_rgba(0,0,0,0.4)]",
                !isSelected &&
                  isToday &&
                  "ring-1 ring-[var(--accent-red)] ring-opacity-40",
                !isSelected &&
                  !isToday &&
                  isWeekend &&
                  "text-[var(--weekend-dim)]"
              )}
            >
              {d}
            </div>
          );
        })}
      </div>
    </button>
  );
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default MiniMonth;

