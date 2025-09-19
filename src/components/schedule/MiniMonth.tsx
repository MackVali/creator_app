"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { getWeekdayFromKey, parseDateKey } from "@/lib/time/tz";

interface MiniMonthProps {
  year: number;
  month: number; // 0-based
  selectedKey?: string | null;
  todayKey?: string | null;
  onSelect?: (date: Date) => void;
  timeZone?: string | null;
}

/** A compact month grid used in the year view */
export function MiniMonth({
  year,
  month,
  selectedKey,
  todayKey,
  onSelect,
  timeZone,
}: MiniMonthProps) {
  const monthDate = useMemo(() => new Date(year, month, 1), [year, month]);
  const monthName = monthDate.toLocaleString(undefined, { month: "short" });

  const firstWeekday = monthDate.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedMonth = selectedKey ? keyToYearMonth(selectedKey) : null;
  const isSelectedMonth =
    selectedMonth && selectedMonth.year === year && selectedMonth.month === month;

  const selectedDay = isSelectedMonth ? selectedMonth.day : null;

  const todayMonth = todayKey ? keyToYearMonth(todayKey) : null;

  return (
    <button
      type="button"
      onClick={() =>
        onSelect?.(parseDateKey(makeDateKey(year, month, 1), timeZone))
      }
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
          const dayKey = makeDateKey(year, month, d);
          const isWeekend =
            (() => {
              const weekday = getWeekdayFromKey(dayKey, timeZone);
              return weekday === 0 || weekday === 6;
            })();
          const isToday = todayMonth
            ? todayMonth.year === year &&
              todayMonth.month === month &&
              todayMonth.day === d
            : false;
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
                !isSelected && !isToday && isWeekend && "text-[var(--weekend-dim)]"
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

function keyToYearMonth(key: string): { year: number; month: number; day: number } {
  const [yearStr, monthStr, dayStr] = key.split("-");
  return {
    year: Number(yearStr),
    month: Number(monthStr) - 1,
    day: Number(dayStr),
  };
}

function makeDateKey(year: number, monthIndex: number, day: number): string {
  const normalizedYear = year + Math.floor(monthIndex / 12);
  const normalizedMonth = ((monthIndex % 12) + 12) % 12 + 1;
  const paddedMonth = normalizedMonth.toString().padStart(2, "0");
  const paddedDay = day.toString().padStart(2, "0");
  return `${normalizedYear}-${paddedMonth}-${paddedDay}`;
}

export default MiniMonth;
