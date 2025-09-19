"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { FlameLevel } from "@/components/FlameEmber";
import FlameEmber from "@/components/FlameEmber";
import { cn } from "@/lib/utils";
import { getZonedDateTimeParts, zonedTimeToUtc } from "@/lib/time/tz";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface MonthViewProps {
  timeZone: string;
  anchorDayKey?: string | null;
  events?: Record<string, number>;
  energies?: Record<string, FlameLevel>;
  selectedDayKey?: string | null;
  onSelectDate?: (date: Date) => void;
}

type DayCellInfo = { day: number; dayKey: string; weekday: number };
type Week = { days: Array<DayCellInfo | null>; weekNumber: number };

/**
 * Virtualized vertical scroller of full month grids. Allows swiping between
 * months while displaying week numbers, day energies and selection state.
 */
export function MonthView({
  timeZone,
  anchorDayKey,
  events,
  energies,
  selectedDayKey,
  onSelectDate,
}: MonthViewProps) {
  const todayParts = useMemo(
    () => getZonedDateTimeParts(new Date(), timeZone),
    [timeZone]
  );
  const anchorParts = useMemo(() => {
    const parsed = parseDayKey(anchorDayKey);
    if (parsed) return parsed;
    return {
      year: todayParts.year,
      month: todayParts.month,
      day: todayParts.day,
    };
  }, [anchorDayKey, todayParts]);
  const totalMonths = 1200; // ~100 years of months
  const baseIndex = Math.floor(totalMonths / 2);
  const monthDiff =
    (anchorParts.year - todayParts.year) * 12 +
    (anchorParts.month - todayParts.month);
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

  const todayDayKey = todayParts.dayKey;

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
          const offset = item.index - baseIndex;
          const { year, month } = addMonths(
            todayParts.year,
            todayParts.month,
            offset
          );
          const monthStartUtc = zonedTimeToUtc({ year, month, day: 1 }, timeZone);
          const label = new Intl.DateTimeFormat(undefined, {
            month: "long",
            year: "numeric",
            timeZone,
          }).format(monthStartUtc);
          return (
            <div
              key={item.key}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full px-2 pb-6"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">
                {label}
              </h2>
              <MonthGrid
                year={year}
                month={month}
                timeZone={timeZone}
                todayDayKey={todayDayKey}
                events={events}
                energies={energies}
                selectedDayKey={selectedDayKey}
                onSelectDate={onSelectDate}
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
  month: number; // 1-based
  timeZone: string;
  todayDayKey: string;
  events?: Record<string, number>;
  energies?: Record<string, FlameLevel>;
  selectedDayKey?: string | null;
  onSelectDate?: (date: Date) => void;
}

function MonthGrid({
  year,
  month,
  timeZone,
  todayDayKey,
  events,
  energies,
  selectedDayKey,
  onSelectDate,
}: MonthGridProps) {
  const weeks = useMemo<Week[]>(() => {
    const firstUtc = zonedTimeToUtc({ year, month, day: 1 }, timeZone);
    const startParts = getZonedDateTimeParts(firstUtc, timeZone);
    const startWeekday = startParts.weekday;
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells: Array<DayCellInfo | null> = [];

    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const utcDate = zonedTimeToUtc({ year, month, day }, timeZone);
      const parts = getZonedDateTimeParts(utcDate, timeZone);
      cells.push({ day, dayKey: parts.dayKey, weekday: parts.weekday });
    }
    while (cells.length % 7 !== 0) cells.push(null);

    const weeks: Week[] = [];
    for (let i = 0; i < cells.length; i += 7) {
      const weekDays = cells.slice(i, i + 7);
      const ref = weekDays.find(
        (cell): cell is DayCellInfo => cell !== null
      );
      const refKey = ref ? ref.dayKey : `${year}-${pad(month)}-01`;
      weeks.push({ days: weekDays, weekNumber: getWeekNumberFromDayKey(refKey) });
    }
    return weeks;
  }, [year, month, timeZone]);

  return (
    <div className="text-[11px]">
      <div className="relative mb-[6px] grid grid-cols-[24px_repeat(7,1fr)] gap-[6px] text-center text-[var(--text-muted)] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-[var(--hairline)] after:content-['']">
        <div />
        {dayNames.map((d) => (
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
            timeZone={timeZone}
            todayDayKey={todayDayKey}
            events={events}
            energies={energies}
            selectedDayKey={selectedDayKey}
            onSelectDate={onSelectDate}
          />
        ))}
      </div>
    </div>
  );
}

interface WeekRowProps {
  week: Week;
  timeZone: string;
  todayDayKey: string;
  events?: Record<string, number>;
  energies?: Record<string, FlameLevel>;
  selectedDayKey?: string | null;
  onSelectDate?: (date: Date) => void;
}

const WeekRow = React.memo(function WeekRow({
  week,
  timeZone,
  todayDayKey,
  events,
  energies,
  selectedDayKey,
  onSelectDate,
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
          timeZone={timeZone}
          todayDayKey={todayDayKey}
          events={events}
          energies={energies}
          selectedDayKey={selectedDayKey}
          onSelectDate={onSelectDate}
        />
      ))}
    </div>
  );
});

interface DayCellProps {
  cell: DayCellInfo | null;
  timeZone: string;
  todayDayKey: string;
  events?: Record<string, number>;
  energies?: Record<string, FlameLevel>;
  selectedDayKey?: string | null;
  onSelectDate?: (date: Date) => void;
}

const DayCell = React.memo(function DayCell({
  cell,
  timeZone,
  todayDayKey,
  events,
  energies,
  selectedDayKey,
  onSelectDate,
}: DayCellProps) {
  if (!cell) return <div className="min-h-[48px]" />;

  const { day, dayKey, weekday } = cell;
  const count = events ? events[dayKey] ?? 0 : 0;
  const energy = energies ? energies[dayKey] : undefined;
  const isToday = dayKey === todayDayKey;
  const isSelected = dayKey === selectedDayKey;
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

  return (
    <button
      type="button"
      onClick={() => {
        const parts = parseDayKey(dayKey);
        if (!parts) return;
        const date = zonedTimeToUtc(parts, timeZone);
        onSelectDate?.(date);
      }}
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
        <span>{day}</span>
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

function parseDayKey(key: string | null | undefined) {
  if (!key) return null;
  const [y, m, d] = key.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return { year: y, month: m, day: d };
}

function addMonths(baseYear: number, baseMonth: number, offset: number) {
  const total = baseYear * 12 + (baseMonth - 1) + offset;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return { year, month };
}

function getWeekNumberFromDayKey(dayKey: string) {
  const parts = parseDayKey(dayKey);
  if (!parts) return 0;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const dayNr = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const diff = date.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / 604800000);
}

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

DayCell.displayName = "DayCell";
WeekRow.displayName = "WeekRow";
