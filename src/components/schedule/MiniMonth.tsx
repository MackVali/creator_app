"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { getZonedDateTimeParts, zonedTimeToUtc } from "@/lib/time/tz";

interface MiniMonthProps {
  year: number;
  month: number; // 0-based
  timeZone: string;
  selectedDayKey?: string | null;
  onSelect?: (date: Date) => void;
}

/** A compact month grid used in the year view */
export function MiniMonth({
  year,
  month,
  timeZone,
  selectedDayKey,
  onSelect,
}: MiniMonthProps) {
  const todayKey = useMemo(
    () => getZonedDateTimeParts(new Date(), timeZone).dayKey,
    [timeZone]
  );
  const firstOfMonthUtc = useMemo(
    () => zonedTimeToUtc({ year, month: month + 1, day: 1 }, timeZone),
    [year, month, timeZone]
  );
  const firstParts = useMemo(
    () => getZonedDateTimeParts(firstOfMonthUtc, timeZone),
    [firstOfMonthUtc, timeZone]
  );
  const monthName = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        month: "short",
        timeZone,
      }).format(firstOfMonthUtc),
    [firstOfMonthUtc, timeZone]
  );
  const firstWeekday = firstParts.weekday;
  const daysInMonth = useMemo(() => new Date(year, month + 1, 0).getDate(), [year, month]);

  const cells = useMemo(() => {
    const items: Array<{ day: number; dayKey: string; weekday: number } | null> = [];
    for (let i = 0; i < firstWeekday; i++) items.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const utcDate = zonedTimeToUtc({ year, month: month + 1, day: d }, timeZone);
      const parts = getZonedDateTimeParts(utcDate, timeZone);
      items.push({ day: d, dayKey: parts.dayKey, weekday: parts.weekday });
    }
    while (items.length % 7 !== 0) items.push(null);
    return items;
  }, [firstWeekday, daysInMonth, year, month, timeZone]);

  const isSelectedMonth = useMemo(() => {
    if (!selectedDayKey) return false;
    const parsed = parseDayKey(selectedDayKey);
    if (!parsed) return false;
    return parsed.year === year && parsed.month - 1 === month;
  }, [selectedDayKey, year, month]);

  return (
    <button
      type="button"
      onClick={() => {
        onSelect?.(firstOfMonthUtc);
      }}
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
          const isWeekend = d.weekday === 0 || d.weekday === 6;
          const isToday = d.dayKey === todayKey;
          const isSelected = d.dayKey === selectedDayKey;
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
              onClick={(event) => {
                event.stopPropagation();
                const parts = parseDayKey(d.dayKey);
                if (!parts) return;
                const date = zonedTimeToUtc(parts, timeZone);
                onSelect?.(date);
              }}
            >
              {d.day}
            </div>
          );
        })}
      </div>
    </button>
  );
}

function parseDayKey(key: string | null | undefined) {
  if (!key) return null;
  const [y, m, d] = key.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return { year: y, month: m, day: d };
}

export default MiniMonth;

