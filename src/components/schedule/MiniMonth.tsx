"use client";

import { cn } from "@/lib/utils";

interface MiniMonthProps {
  year: number;
  month: number; // 0-based
  selectedDate?: Date;
  onSelect?: (date: Date) => void;
}

/** A compact month grid used in the year view */
export function MiniMonth({ year, month, selectedDate, onSelect }: MiniMonthProps) {
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

  return (
    <button
      type="button"
      onClick={() => onSelect?.(date)}
      className="text-center text-[10px] p-1 rounded hover:bg-[var(--surface)]"
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
        {cells.map((d, i) => (
          <div
            key={i}
            className="h-3 w-3 flex items-center justify-center"
          >
            {d ?? ""}
          </div>
        ))}
      </div>
    </button>
  );
}

export default MiniMonth;

