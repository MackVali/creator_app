"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatDateKeyInTimeZone } from "@/lib/scheduler/timezone";

interface JumpToDateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentDate: Date;
  onSelectDate: (date: Date) => void;
  timeZone?: string | null;
}

const WEEKDAY_LABELS = (() => {
  try {
    // Use a midday UTC timestamp to avoid timezone shifts that would otherwise
    // roll the date backward (e.g., UTC-7 turning Sunday into Saturday).
    return Array.from({ length: 7 }, (_, index) =>
      new Intl.DateTimeFormat(undefined, {
        weekday: "short",
      })
        .format(new Date(Date.UTC(2024, 6, index + 7, 12)))
        .slice(0, 2)
    );
  } catch (error) {
    console.warn("Unable to format weekday labels", error);
    return ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  }
})();

export function JumpToDateSheet({
  open,
  onOpenChange,
  currentDate,
  onSelectDate,
  timeZone,
}: JumpToDateSheetProps) {
  const resolvedTimeZone =
    (timeZone && timeZone.trim()) ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC";

  const initialMonth = useMemo(() => {
    const base = new Date(currentDate);
    return new Date(base.getFullYear(), base.getMonth(), 1);
  }, [currentDate]);

  const [visibleMonth, setVisibleMonth] = useState(initialMonth);
  const [todayKey, setTodayKey] = useState<string | null>(null);

  const computeTodayKey = useCallback(() => {
    try {
      return formatDateKeyInTimeZone(new Date(), resolvedTimeZone);
    } catch (error) {
      console.warn("Unable to resolve today key", error);
      return null;
    }
  }, [resolvedTimeZone]);

  useEffect(() => {
    if (open) {
      setVisibleMonth(initialMonth);
      setTodayKey(computeTodayKey());
    }
  }, [open, initialMonth, computeTodayKey]);

  const selectedDateKey = useMemo(
    () => formatDateKeyInTimeZone(currentDate, resolvedTimeZone),
    [currentDate, resolvedTimeZone]
  );

  const monthMetadata = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const monthStart = new Date(year, month, 1);
    const monthLabel = monthStart.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
    const firstWeekday = monthStart.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: Array<Date | null> = [];
    for (let i = 0; i < firstWeekday; i += 1) {
      cells.push(null);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(new Date(year, month, day));
    }
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    const weeks: Array<Array<Date | null>> = [];
    for (let index = 0; index < cells.length; index += 7) {
      weeks.push(cells.slice(index, index + 7));
    }

    return { monthLabel, weeks };
  }, [visibleMonth]);

  const handleSelect = (date: Date) => {
    onSelectDate(new Date(date));
  };

  const goToOffsetMonth = (offset: number) => {
    setVisibleMonth(prev => {
      const next = new Date(prev);
      next.setMonth(prev.getMonth() + offset);
      next.setDate(1);
      return next;
    });
  };

  const handleSelectToday = () => {
    if (!todayKey) return;
    const parsed = parseDateKey(todayKey);
    if (parsed) {
      onSelectDate(parsed);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-[var(--surface-elevated)] border-t border-white/10 p-0 text-[var(--text-primary)]"
      >
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="text-lg font-semibold">Jump to date</SheetTitle>
          <SheetDescription className="text-sm text-[var(--text-secondary)]">
            Pick a date to instantly change the schedule view.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <button
              type="button"
              onClick={() => goToOffsetMonth(-1)}
              className="rounded-full p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.2em] text-white/80">
              <CalendarDays className="h-4 w-4" />
              <span>{monthMetadata.monthLabel}</span>
            </div>
            <button
              type="button"
              onClick={() => goToOffsetMonth(1)}
              className="rounded-full p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
              aria-label="Next month"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.28em] text-white/60">
                  {WEEKDAY_LABELS.map(label => (
                    <th key={label} className="py-2 text-center font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-base">
                {monthMetadata.weeks.map((week, weekIndex) => (
                  <tr key={`week-${weekIndex}`} className="h-12 text-center">
                    {week.map((day, dayIndex) => {
                      if (!day) {
                        return <td key={`empty-${weekIndex}-${dayIndex}`} />;
                      }
                      const dayKey = formatDateKeyInTimeZone(day, resolvedTimeZone);
                      const isToday = todayKey ? dayKey === todayKey : false;
                      const isSelected = dayKey === selectedDateKey;
                      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                      return (
                        <td key={day.toISOString()} className="py-1">
                          <button
                            type="button"
                            onClick={() => handleSelect(day)}
                            className={cn(
                              "mx-auto flex h-10 w-10 items-center justify-center rounded-xl border text-sm font-semibold transition",
                              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-white",
                              isSelected
                                ? "border-transparent bg-[var(--accent-red)] text-white shadow-[0_14px_34px_rgba(252,165,165,0.45)]"
                                : "border-transparent bg-transparent text-white/80 hover:bg-white/10",
                              isToday && !isSelected && "border border-white/40",
                              isWeekend && !isSelected && "text-white/60"
                            )}
                            aria-current={isSelected ? "date" : undefined}
                            aria-label={day.toLocaleDateString(undefined, {
                              weekday: "long",
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                            })}
                          >
                            {day.getDate()}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSelectToday}
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
            >
              Today
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function parseDateKey(key: string): Date | null {
  const [yearStr, monthStr, dayStr] = key.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return null;
  }
  return new Date(year, month - 1, day);
}
