"use client";

import { cn } from "@/lib/utils";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface MonthViewProps {
  date?: Date;
  /** Map of ISO date (yyyy-mm-dd) to number of events for that day */
  events?: Record<string, number>;
  /** The currently selected day to highlight */
  selectedDate?: Date;
  /** Callback when a day is selected */
  onSelectDate?: (date: Date) => void;
}

export function MonthView({
  date = new Date(),
  events,
  selectedDate,
  onSelectDate,
}: MonthViewProps) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const label = date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: { days: (number | null)[]; weekNumber: number }[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const weekDays = cells.slice(i, i + 7);
    const weekDay = weekDays.find((d) => d !== null);
    const weekDate = weekDay ? new Date(year, month, weekDay) : new Date(year, month, i + 1);
    weeks.push({ days: weekDays, weekNumber: getWeekNumber(weekDate) });
  }

  return (
    <div className="text-[11px] text-[var(--text-muted)]">
      <div className="mb-2 text-left text-[16px] font-semibold text-[var(--text-primary)]">
        {label}
      </div>
      <div className="grid grid-cols-[24px_repeat(7,1fr)] gap-[6px] text-center mb-1">
        <div />
        {dayNames.map((d) => (
          <div key={d} className="tracking-wide">
            {d}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-[6px] overflow-y-auto snap-y snap-mandatory">
        {weeks.map((week, i) => (
          <div
            key={i}
            className="grid grid-cols-[24px_repeat(7,1fr)] gap-[6px] snap-start min-h-[48px]"
          >
            <div className="flex items-center justify-center text-[var(--accent-red)]">
              {week.weekNumber}
            </div>
            {week.days.map((day, j) => {
              if (day === null)
                return <div key={j} className="min-h-[48px] border border-[var(--hairline)]" />;
              const dayDate = new Date(year, month, day);
              const key = dayDate.toISOString().slice(0, 10);
              const count = events?.[key] ?? 0;
              const isToday = isSameDay(dayDate, new Date());
              const isSelected = selectedDate && isSameDay(dayDate, selectedDate);
              const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
              return (
                <button
                  key={j}
                  type="button"
                  onClick={() => onSelectDate?.(dayDate)}
                  aria-current={isSelected ? "date" : undefined}
                  className={cn(
                    "relative flex flex-col items-center justify-center border border-[var(--hairline)] min-h-[48px] rounded-md focus:outline-none",
                    isSelected &&
                      "bg-[var(--accent-red)] text-white shadow-inner",
                    !isSelected && isToday &&
                      "ring-1 ring-[var(--accent-red)] ring-opacity-50",
                    isWeekend && !isSelected &&
                      "text-[var(--weekend-dim)]",
                  )}
                >
                  <div>{day}</div>
                  {count > 0 && (
                    <div className="mt-1 flex gap-[2px]">
                      {Array.from({ length: Math.min(count, 3) }).map((_, k) => (
                        <span
                          key={k}
                          className="w-1 h-1 rounded-full bg-[var(--dot)]"
                        />
                      ))}
                      {count > 3 && (
                        <span className="w-1 h-1 rounded-full bg-[var(--dot)] opacity-30" />
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getWeekNumber(date: Date) {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / 604800000);
}

