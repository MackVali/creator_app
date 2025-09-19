"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { FlameLevel } from "@/components/FlameEmber";
import FlameEmber from "@/components/FlameEmber";
import { cn } from "@/lib/utils";
import {
  getLocalDateKey,
  parseDateKey,
  getWeekdayFromKey,
} from "@/lib/time/tz";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface MonthViewProps {
  /** Starting month to center in the scroller */
  date?: Date;
  /** Map of ISO date (yyyy-mm-dd) to number of events for that day */
  events?: Record<string, number>;
  /** Map of ISO date (yyyy-mm-dd) to highest energy level */
  energies?: Record<string, FlameLevel>;
  /** The currently selected day to highlight */
  selectedDate?: Date;
  /** Callback when a day is selected */
  onSelectDate?: (date: Date) => void;
  /** Time zone used for deriving local dates */
  timeZone?: string | null;
}

/**
 * Virtualized vertical scroller of full month grids. Allows swiping between
 * months while displaying week numbers, day energies and selection state.
 */
export function MonthView({
  date = new Date(),
  events,
  energies,
  selectedDate,
  onSelectDate,
  timeZone,
}: MonthViewProps) {
  const currentKey = useMemo(
    () => getLocalDateKey(date.toISOString(), timeZone),
    [date, timeZone]
  );
  const selectedKey = useMemo(
    () =>
      selectedDate ? getLocalDateKey(selectedDate.toISOString(), timeZone) : null,
    [selectedDate, timeZone]
  );
  const todayKey = useMemo(
    () => getLocalDateKey(new Date().toISOString(), timeZone),
    [timeZone]
  );

  const [currentYear, currentMonth] = keyToYearMonth(currentKey);
  const [todayYear, todayMonth] = keyToYearMonth(todayKey);

  const totalMonths = 1200; // ~100 years of months
  const baseIndex = Math.floor(totalMonths / 2);
  const monthDiff = (currentYear - todayYear) * 12 + (currentMonth - todayMonth);
  const currentIndex = baseIndex + monthDiff;

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: totalMonths,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 360,
    overscan: 2,
  });

  // Jump to the requested month when the selected date changes
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
        {virtualizer.getVirtualItems().map(item => {
          const offset = item.index - baseIndex;
          const monthNumber = todayMonth + offset;
          const monthYear = todayYear + Math.floor(monthNumber / 12);
          const normalizedMonth = ((monthNumber % 12) + 12) % 12;
          const monthDate = new Date(monthYear, normalizedMonth, 1);
          return (
            <div
              key={item.key}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full px-2 pb-6"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">
                {monthDate.toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </h2>
              <MonthGrid
                year={monthYear}
                month={normalizedMonth}
                events={events}
                energies={energies}
                selectedKey={selectedKey}
                todayKey={todayKey}
                onSelectDate={onSelectDate}
                timeZone={timeZone}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface MonthGridProps {
  year: number;
  month: number;
  events?: Record<string, number>;
  energies?: Record<string, FlameLevel>;
  selectedKey?: string | null;
  todayKey?: string | null;
  onSelectDate?: (date: Date) => void;
  timeZone?: string | null;
}

type Cell = { day: number; offset: number } | null;
type Week = { days: Cell[]; weekNumber: number };

function MonthGrid({
  year,
  month,
  events,
  energies,
  selectedKey,
  todayKey,
  onSelectDate,
  timeZone,
}: MonthGridProps) {
  const weeks = useMemo<Week[]>(() => {
    const first = new Date(year, month, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Cell[] = [];

    for (let i = startWeekday - 1; i >= 0; i--) {
      cells.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, offset: 0 });
    }
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }
    const weeks: Week[] = [];
    for (let i = 0; i < cells.length; i += 7) {
      const weekDays = cells.slice(i, i + 7);
      const ref =
        weekDays.find(d => d && d.offset === 0) ||
        weekDays.find((d): d is Exclude<Cell, null> => d !== null) ||
        { day: 1, offset: 0 };
      const weekDate = new Date(year, month + ref.offset, ref.day);
      weeks.push({ days: weekDays, weekNumber: getWeekNumber(weekDate) });
    }
    return weeks;
  }, [year, month]);

  return (
    <div className="text-[11px]">
      <div className="relative mb-[6px] grid grid-cols-[24px_repeat(7,1fr)] gap-[6px] text-center text-[var(--text-muted)] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-[var(--hairline)] after:content-['']">
        <div />
        {dayNames.map(d => (
          <div key={d} className="tracking-wide">
            {d}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-[6px]">
        {weeks.map((week, i) => (
          <WeekRow
            key={i}
            week={week}
            year={year}
            month={month}
            events={events}
            energies={energies}
            selectedKey={selectedKey}
            todayKey={todayKey}
            onSelectDate={onSelectDate}
            timeZone={timeZone}
          />
        ))}
      </div>
    </div>
  );
}

interface WeekRowProps {
  week: Week;
  year: number;
  month: number;
  events?: Record<string, number>;
  energies?: Record<string, FlameLevel>;
  selectedKey?: string | null;
  todayKey?: string | null;
  onSelectDate?: (date: Date) => void;
  timeZone?: string | null;
}

const WeekRow = React.memo(function WeekRow({
  week,
  year,
  month,
  events,
  energies,
  selectedKey,
  todayKey,
  onSelectDate,
  timeZone,
}: WeekRowProps) {
  return (
    <div className="relative grid min-h-[48px] grid-cols-[24px_repeat(7,1fr)] gap-[6px] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-[var(--hairline)] after:content-[''] last:after:hidden">
      <div className="flex items-center justify-center text-[var(--accent-red)]">
        {week.weekNumber}
      </div>
      {week.days.map((cell, j) => (
        <DayCell
          key={j}
          cell={cell}
          year={year}
          month={month}
          events={events}
          energies={energies}
          selectedKey={selectedKey}
          todayKey={todayKey}
          onSelectDate={onSelectDate}
          timeZone={timeZone}
        />
      ))}
    </div>
  );
});

interface DayCellProps {
  cell: Cell;
  year: number;
  month: number;
  events?: Record<string, number>;
  energies?: Record<string, FlameLevel>;
  selectedKey?: string | null;
  todayKey?: string | null;
  onSelectDate?: (date: Date) => void;
  timeZone?: string | null;
}

const DayCell = React.memo(function DayCell({
  cell,
  year,
  month,
  events,
  energies,
  selectedKey,
  todayKey,
  onSelectDate,
  timeZone,
}: DayCellProps) {
  const dayKey = useMemo(() => {
    if (!cell || cell.offset !== 0) return null;
    return makeDateKey(year, month + cell.offset, cell.day);
  }, [cell, year, month]);

  const count = dayKey && events ? events[dayKey] ?? 0 : 0;
  const energy = dayKey && energies ? energies[dayKey] : undefined;
  const isSelected = dayKey && selectedKey ? dayKey === selectedKey : false;
  const isToday = dayKey && todayKey ? dayKey === todayKey : false;
  const weekday = dayKey ? getWeekdayFromKey(dayKey, timeZone) : null;
  const isWeekend = weekday === 0 || weekday === 6;
  const dotOpacity = isWeekend ? 0.85 : 1;

  const dots = useMemo(() => {
    if (count === 0) return null;
    const items: React.ReactNode[] = [];
    const visible = Math.min(count, 3);
    for (let k = 0; k < visible; k++) {
      items.push(
        <span
          key={k}
          className="h-[3px] w-[3px] rounded-full bg-[var(--dot)]"
          style={{ opacity: dotOpacity }}
        />
      );
    }
    if (count > 3) {
      items.push(
        <span
          key="halo"
          className="h-[3px] w-[3px] rounded-full bg-[var(--dot)]"
          style={{ opacity: dotOpacity * 0.3 }}
        />
      );
    }
    return <div className="mt-1 flex justify-center gap-[4px]">{items}</div>;
  }, [count, dotOpacity]);

  if (!cell || !dayKey || cell.offset !== 0) return <div className="min-h-[48px]" />;

  const dateForSelect = parseDateKey(dayKey, timeZone);

  return (
    <button
      type="button"
      onClick={() => onSelectDate?.(dateForSelect)}
      aria-current={isSelected ? "date" : undefined}
      className={cn(
        "relative flex min-h-[48px] flex-col items-center justify-center text-[var(--text-primary)] focus:outline-none",
        isWeekend && !isSelected && "text-[var(--weekend-dim)]"
      )}
    >
      <div
        className={cn(
          "flex h-6 min-w-[24px] items-center justify-center rounded-md px-1",
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
            className="ml-1 origin-left scale-[0.5]"
          />
        )}
      </div>
      {dots}
    </button>
  );
});

function keyToYearMonth(key: string): [number, number] {
  const [yearStr, monthStr] = key.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  return [Number.isFinite(year) ? year : 0, Number.isFinite(monthIndex) ? monthIndex : 0];
}

function makeDateKey(year: number, monthIndex: number, day: number): string {
  const normalizedYear = year + Math.floor(monthIndex / 12);
  const normalizedMonth = ((monthIndex % 12) + 12) % 12 + 1;
  const paddedMonth = normalizedMonth.toString().padStart(2, "0");
  const paddedDay = day.toString().padStart(2, "0");
  return `${normalizedYear}-${paddedMonth}-${paddedDay}`;
}

function getWeekNumber(date: Date) {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / 604800000);
}

DayCell.displayName = "DayCell";
WeekRow.displayName = "WeekRow";
