"use client";

import { cn } from "@/lib/utils";
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface MonthViewProps {
  date?: Date;
  /** Map of ISO date (yyyy-mm-dd) to number of events for that day */
  events?: Record<string, number>;
  /** Map of ISO date (yyyy-mm-dd) to highest energy level */
  energies?: Record<string, FlameLevel>;
  /** The currently selected day to highlight */
  selectedDate?: Date;
  /** Callback when a day is selected */
  onSelectDate?: (date: Date) => void;
  /** Include leading/trailing days from adjacent months */
  showAdjacentMonths?: boolean;
  /** Display the month name label on the first day */
  showMonthLabel?: boolean;
}

type Cell = { day: number; offset: number } | null;
type Week = { days: Cell[]; weekNumber: number };

export function MonthView({
  date = new Date(),
  events,
  energies,
  selectedDate,
  onSelectDate,
  showAdjacentMonths = true,
  showMonthLabel = true,
}: MonthViewProps) {
  const year = date.getFullYear();
  const month = date.getMonth();

  const weeks = useMemo<Week[]>(() => {
    const first = new Date(year, month, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Cell[] = [];
    const prevMonthDays = new Date(year, month, 0).getDate();

    for (let i = startWeekday - 1; i >= 0; i--) {
      if (showAdjacentMonths) {
        cells.push({ day: prevMonthDays - i, offset: -1 });
      } else {
        cells.push(null);
      }
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, offset: 0 });
    }
    let nextDay = 1;
    while (cells.length % 7 !== 0) {
      if (showAdjacentMonths) {
        cells.push({ day: nextDay++, offset: 1 });
      } else {
        cells.push(null);
      }
    }
    const weeks: Week[] = [];
    for (let i = 0; i < cells.length; i += 7) {
      const weekDays = cells.slice(i, i + 7);
      const ref =
        weekDays.find((d) => d && d.offset === 0) ||
        weekDays.find((d): d is Exclude<Cell, null> => d !== null) ||
        { day: 1, offset: 0 };
      const weekDate = new Date(year, month + ref.offset, ref.day);
      weeks.push({ days: weekDays, weekNumber: getWeekNumber(weekDate) });
    }
    return weeks;
  }, [year, month, showAdjacentMonths]);

  const containerRef = useRef<HTMLDivElement>(null);
  const rowHeight = 54; // 48px min height + 6px gap
  const [range, setRange] = useState({ start: 0, end: weeks.length });

  useEffect(() => {
    setRange({ start: 0, end: weeks.length });
  }, [weeks.length]);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const top = el.scrollTop;
    const vh = el.clientHeight;
    const start = Math.max(0, Math.floor(top / rowHeight) - 1);
    const end = Math.min(weeks.length, Math.ceil((top + vh) / rowHeight) + 1);
    setRange((r) => (r.start === start && r.end === end ? r : { start, end }));
  }, [weeks.length]);

  useEffect(() => {
    onScroll();
  }, [onScroll]);

  const today = useMemo(() => new Date(), []);

  return (
    <div className="text-[11px]">
      <div className="relative grid grid-cols-[24px_repeat(7,1fr)] gap-[6px] text-center mb-[6px] text-[var(--text-muted)] after:content-[''] after:absolute after:left-0 after:right-0 after:bottom-0 after:h-px after:bg-[var(--hairline)]">
        <div />
        {dayNames.map((d) => (
          <div key={d} className="tracking-wide">
            {d}
          </div>
        ))}
      </div>
      <div
        ref={containerRef}
        onScroll={onScroll}
        className="flex flex-col gap-[6px] overflow-y-auto snap-y snap-mandatory"
      >
        <div style={{ height: range.start * rowHeight }} />
        {weeks.slice(range.start, range.end).map((week, i) => (
          <WeekRow
            key={range.start + i}
            week={week}
            year={year}
            month={month}
            today={today}
            events={events}
            energies={energies}
            selectedDate={selectedDate}
            onSelectDate={onSelectDate}
            showMonthLabel={showMonthLabel}
          />
        ))}
        <div style={{ height: (weeks.length - range.end) * rowHeight }} />
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

interface WeekRowProps {
  week: Week;
  year: number;
  month: number;
  today: Date;
  events?: Record<string, number>;
  energies?: Record<string, FlameLevel>;
  selectedDate?: Date;
  onSelectDate?: (date: Date) => void;
  showMonthLabel?: boolean;
}

const WeekRow = React.memo(function WeekRow({
  week,
  year,
  month,
  today,
  events,
  energies,
  selectedDate,
  onSelectDate,
  showMonthLabel,
}: WeekRowProps) {
  return (
    <div className="relative grid grid-cols-[24px_repeat(7,1fr)] gap-[6px] snap-start min-h-[48px] after:content-[''] after:absolute after:left-0 after:right-0 after:bottom-0 after:h-px after:bg-[var(--hairline)] last:after:hidden">
      <div className="flex items-center justify-center text-[var(--accent-red)]">
        {week.weekNumber}
      </div>
      {week.days.map((cell, j) => (
        <DayCell
          key={j}
          cell={cell}
          year={year}
          month={month}
          today={today}
          events={events}
          energies={energies}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          showMonthLabel={showMonthLabel}
        />
      ))}
    </div>
  );
});

interface DayCellProps {
  cell: Cell;
  year: number;
  month: number;
  today: Date;
  events?: Record<string, number>;
  energies?: Record<string, FlameLevel>;
  selectedDate?: Date;
  onSelectDate?: (date: Date) => void;
  showMonthLabel?: boolean;
}

const DayCell = React.memo(function DayCell({
  cell,
  year,
  month,
  today,
  events,
  energies,
  selectedDate,
  onSelectDate,
  showMonthLabel,
}: DayCellProps) {
  const dayDate = useMemo(
    () => (cell ? new Date(year, month + cell.offset, cell.day) : null),
    [year, month, cell]
  );
  const key = dayDate ? dayDate.toISOString().slice(0, 10) : "";
  const count = key && events ? events[key] ?? 0 : 0;
  const energy = key && energies ? energies[key] : undefined;
  const isToday = dayDate ? isSameDay(dayDate, today) : false;
  const isSelected =
    dayDate && selectedDate ? isSameDay(dayDate, selectedDate) : false;
  const isWeekend = dayDate ? dayDate.getDay() === 0 || dayDate.getDay() === 6 : false;
  const inMonth = cell ? cell.offset === 0 : false;
  const dotOpacity = isWeekend ? 0.85 : 1;

  const dots = useMemo(() => {
    if (count === 0) return null;
    const items: React.ReactNode[] = [];
    const visible = Math.min(count, 3);
    for (let k = 0; k < visible; k++) {
      items.push(
        <span
          key={k}
          className="rounded-full bg-[var(--dot)] w-[3px] h-[3px]"
          style={{ opacity: dotOpacity }}
        />
      );
    }
    if (count > 3) {
      items.push(
        <span
          key="halo"
          className="rounded-full bg-[var(--dot)] w-[3px] h-[3px]"
          style={{ opacity: dotOpacity * 0.3 }}
        />
      );
    }
    return <div className="mt-1 flex gap-[4px] justify-center">{items}</div>;
  }, [count, dotOpacity]);

  if (!cell || !dayDate) return <div className="min-h-[48px]" />;

  return (
    <button
      type="button"
      onClick={() => onSelectDate?.(dayDate)}
      aria-current={isSelected ? "date" : undefined}
      className={cn(
        "relative flex flex-col items-center justify-center min-h-[48px] focus:outline-none text-[var(--text-primary)]",
        isWeekend && !isSelected && "text-[var(--weekend-dim)]",
        !inMonth && !isSelected && !isToday && "text-[var(--text-muted)]"
      )}
    >
      {cell.day === 1 && showMonthLabel && (
        <span className="absolute left-0 -top-5 text-[16px] font-semibold text-[var(--text-primary)]">
          {dayDate.toLocaleDateString(undefined, { month: "short" })}
        </span>
      )}
      <div
        className={cn(
          "flex items-center justify-center rounded-md h-6 min-w-[24px] px-1",
          isSelected &&
            "bg-[var(--accent-red)] text-[var(--surface)] shadow-[inset_0_-1px_1px_rgba(0,0,0,0.4)]",
          !isSelected && isToday &&
            "ring-1 ring-[var(--accent-red)] ring-opacity-40"
        )}
      >
        <span>{cell.day}</span>
        {energy && energy !== "NO" && (
          <FlameEmber
            level={energy}
            size="sm"
            className="ml-1 scale-[0.5] origin-left"
          />
        )}
      </div>
      {dots}
    </button>
  );
});

DayCell.displayName = "DayCell";
WeekRow.displayName = "WeekRow";

