"use client";

import { Fragment, useEffect, useMemo, useState, useCallback, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Paintbrush, Droplet } from "lucide-react";
import type { JumpToDateSnapshot } from "@/lib/scheduler/snapshot";
import { ENERGY_LEVELS } from "@/lib/scheduler/energy";
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";
import { Ticker } from "@/components/ui/Ticker";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatDateKeyInTimeZone } from "@/lib/scheduler/timezone";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface JumpToDateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentDate: Date;
  onSelectDate: (date: Date) => void;
  timeZone?: string | null;
  dayMetaByDateKey?: Record<string, { color?: string; kind?: string; label?: string }>;
  snapshot?: JumpToDateSnapshot;
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
  dayMetaByDateKey,
  snapshot,
}: JumpToDateSheetProps) {
  const [isPaintMode, setIsPaintMode] = useState(false);
  const [selectedDayTypeId, setSelectedDayTypeId] = useState<string>("");
  const energyHours = snapshot?.energyHours ?? {};
  const projected = snapshot?.projected ?? {};
  const scrollAreaPadding: CSSProperties = {
    paddingBottom: "calc(1.1rem + env(safe-area-inset-bottom, 0px))",
  };

  const formatHours = (value?: number) =>
    Number.isFinite(value ?? NaN) ? `${(value as number).toFixed(1)}h` : "—";
  const isVisibleLevel = (level: (typeof ENERGY_LEVELS)[number]) => {
    const epsilon = 0.0001;
    const d = energyHours.day?.[level] ?? 0;
    const w = energyHours.week?.[level] ?? 0;
    const m = energyHours.month?.[level] ?? 0;
    return d > epsilon || w > epsilon || m > epsilon;
  };
  const visibleLevels = ENERGY_LEVELS.filter(isVisibleLevel);

  function EnergyFlame({ level }: { level: (typeof ENERGY_LEVELS)[number] }) {
    return (
      <span className="inline-flex align-middle" aria-hidden="true">
        <FlameEmber
          level={level.toUpperCase() as FlameLevel}
          size="xs"
          className="translate-y-[1px]"
        />
      </span>
    );
  }

  function EnergyHoursCell({
    value,
    level,
  }: {
    value?: number;
    level: (typeof ENERGY_LEVELS)[number];
  }) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 text-center text-[9px] sm:text-[12px] leading-none">
        <span className="justify-self-center">{formatHours(value)}</span>
        <span className="justify-self-center text-white/40">/</span>
        <span className="justify-self-center text-white/70">
          <EnergyFlame level={level} />
        </span>
      </div>
    );
  }

  const weekLikelyGoals = projected.weekLikelyGoals ?? [];
  const monthLikelyGoals = projected.monthLikelyGoals ?? [];

  const formatCompleteBy = (iso?: string | null) => {
    if (!iso) return null;
    const resolvedTz =
      (timeZone && timeZone.trim()) ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      "UTC";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    const dateLabel = new Intl.DateTimeFormat(undefined, {
      timeZone: resolvedTz,
      month: "2-digit",
      day: "2-digit",
    }).format(date);
    const timeLabel = new Intl.DateTimeFormat(undefined, {
      timeZone: resolvedTz,
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
    return { dateLabel, timeLabel };
  };

  function GoalTickerCard({
    goal,
  }: {
    goal: { id: string; title: string; emoji?: string | null; completionUtc?: string | null };
  }) {
    const completeBy = formatCompleteBy(goal.completionUtc);
    return (
      <div className="min-w-[120px] sm:min-w-[200px] shrink-0 rounded-lg bg-[var(--surface-elevated)] px-2 py-1.5 text-white/90 shadow-[0_12px_30px_rgba(5,7,12,0.35)]">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] sm:text-base">{goal.emoji ?? "🎯"}</span>
          <span className="truncate text-[12px] sm:text-sm font-medium leading-tight">
            {goal.title}
          </span>
        </div>
        {completeBy ? (
          <div className="mt-1 flex items-center gap-1 text-[9px] sm:text-[11px] font-semibold uppercase tracking-[0.12em] sm:tracking-[0.16em] text-white/60 leading-tight">
            <span className="whitespace-nowrap">COMPLETE BY {completeBy.dateLabel}</span>
            <span className="text-[9px] sm:text-[9px] font-normal uppercase text-white/45 leading-none">
              {completeBy.timeLabel}
            </span>
          </div>
        ) : null}
      </div>
    );
  }
  const resolvedTimeZone =
    (timeZone && timeZone.trim()) ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC";
  const dayTypes: Array<{ id: string; name: string }> = [];

  const initialMonth = useMemo(() => {
    const base = new Date(currentDate);
    return new Date(base.getFullYear(), base.getMonth(), 1);
  }, [currentDate]);

  const [visibleMonth, setVisibleMonth] = useState(initialMonth);
  const [todayKey, setTodayKey] = useState<string | null>(null);
  const [showDayTypesComingSoon, setShowDayTypesComingSoon] = useState(false);

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
        className="bg-[var(--surface-elevated)] border-t border-white/10 p-0 text-[var(--text-primary)] rounded-t-[26px] sm:rounded-t-2xl max-h-[92vh] sm:max-h-[88vh] overflow-hidden shadow-[0_-22px_50px_rgba(0,0,0,0.45)] backdrop-blur"
      >
          <SheetHeader className="sticky top-0 z-20 border-b border-white/10 bg-[var(--surface-elevated)]/95 px-4 pt-4 pb-3 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <SheetTitle className="text-lg font-semibold">Jump to date</SheetTitle>
              </div>
            </div>
          </SheetHeader>
        <div
          className="flex min-h-0 flex-1 flex-col gap-3 px-3 sm:px-4 pb-4 pt-1 sm:pt-2 overflow-y-auto"
          style={scrollAreaPadding}
        >
          {snapshot ? (
            <div className="space-y-2 sm:space-y-3">
              <div className="flex items-center justify-between text-[10px] sm:text-xs font-semibold uppercase tracking-[0.1em] sm:tracking-[0.18em] text-white/70">
                <span className="text-white/80">Snapshot</span>
                <span className="text-white/50">Current view</span>
              </div>
              <div className="grid gap-2 sm:gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/5 bg-white/5 p-1.5 sm:p-3 w-fit max-w-full sm:w-full">
                  <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.08em] sm:tracking-[0.14em] text-white/60 leading-tight">
                    Energy hours
                  </div>
                  {visibleLevels.length === 0 ? (
                    <div className="mt-1 sm:mt-3 rounded-lg border border-white/5 bg-white/5 px-2.5 py-2 text-[11px] sm:text-sm text-white/70">
                      No energy windows found for this period.
                    </div>
                  ) : (
                    <div className="mt-0.5 inline-grid w-fit max-w-full grid-cols-[auto_repeat(3,minmax(70px,110px))] justify-start gap-x-1 sm:gap-x-3 gap-y-0 sm:gap-y-2 text-[10px] sm:text-[13px] text-white/80 leading-[1.1]">
                      <span />
                      <span className="text-center text-[9px] sm:text-[12px] text-white/50 leading-none">
                        Today
                      </span>
                      <span className="text-center text-[9px] sm:text-[12px] text-white/50 leading-none">
                        Week
                      </span>
                      <span className="text-center text-[9px] sm:text-[12px] text-white/50 leading-none">
                        Month
                      </span>
                      {visibleLevels.map(level => (
                        <Fragment key={level}>
                          <span className="text-white uppercase text-[9px] sm:text-[12px] leading-none">
                            {level}
                          </span>
                          <EnergyHoursCell value={energyHours.day?.[level]} level={level} />
                          <EnergyHoursCell value={energyHours.week?.[level]} level={level} />
                          <EnergyHoursCell value={energyHours.month?.[level]} level={level} />
                        </Fragment>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-white/5 bg-white/5 p-1.5 sm:p-3 w-full overflow-hidden">
                  <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.1em] sm:tracking-[0.14em] text-white/60">
                    LIKELY TO BE COMPLETED
                  </div>
                  <div className="mt-1 sm:mt-3 space-y-1 sm:space-y-3 text-[11px] sm:text-sm text-white/80">
                    <div className="space-y-1">
                      <div className="text-[9px] sm:text-[11px] uppercase tracking-[0.12em] sm:tracking-[0.16em] text-white/50">
                        LIKELY THIS WEEK
                      </div>
                      {weekLikelyGoals.length === 0 ? (
                        <div className="rounded-lg border border-white/5 bg-white/5 px-2.5 py-2 text-[11px] sm:text-sm text-white/70">
                          No likely goals this week.
                        </div>
                      ) : (
                        <Ticker
                          className="w-full"
                          items={weekLikelyGoals}
                          speed={40}
                          trackClassName="flex flex-nowrap gap-1.5 sm:gap-3 pb-1 will-change-transform"
                          renderItem={(goal, index) => (
                            <GoalTickerCard key={`${goal.id}-${index}`} goal={goal} />
                          )}
                        />
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="text-[9px] sm:text-[11px] uppercase tracking-[0.12em] sm:tracking-[0.16em] text-white/50">
                        LIKELY THIS MONTH
                      </div>
                      {monthLikelyGoals.length === 0 ? (
                        <div className="rounded-lg border border-white/5 bg-white/5 px-2.5 py-2 text-[11px] sm:text-sm text-white/70">
                          No likely goals this month.
                        </div>
                      ) : (
                        <Ticker
                          className="w-full"
                          items={monthLikelyGoals}
                          speed={40}
                          trackClassName="flex flex-nowrap gap-1.5 sm:gap-3 pb-1 will-change-transform"
                          renderItem={(goal, index) => (
                            <GoalTickerCard key={`${goal.id}-${index}`} goal={goal} />
                          )}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          {isPaintMode ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex flex-col gap-2">
                <div className="text-xs font-medium uppercase tracking-[0.14em] text-white/60">
                  Day type
                </div>
                <Select
                  value={selectedDayTypeId}
                  onValueChange={setSelectedDayTypeId}
                  placeholder="No day types yet"
                  triggerClassName={cn(
                    "h-10 rounded-lg border-white/10 bg-white/5 text-sm text-white/80",
                    dayTypes.length === 0 && "pointer-events-none opacity-60"
                  )}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No day types yet" />
                  </SelectTrigger>
                  <SelectContent>
                    {dayTypes.length === 0 ? (
                      <SelectItem value="" disabled>
                        No day types yet
                      </SelectItem>
                    ) : (
                      dayTypes.map(type => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-white/60">
                  Create day types first to paint your calendar.
                </p>
              </div>
            </div>
          ) : null}
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => goToOffsetMonth(-1)}
                className="rounded-full p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowDayTypesComingSoon(prev => !prev)}
                className={cn(
                  "rounded-full p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white",
                  showDayTypesComingSoon && "bg-white/15 text-white shadow-[0_8px_24px_rgba(0,0,0,0.25)]"
                )}
                aria-pressed={showDayTypesComingSoon}
                aria-label="Day types coming soon"
              >
                <Droplet className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
              <CalendarDays className="h-3.5 w-3.5" />
              <span>{monthMetadata.monthLabel}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsPaintMode(prev => !prev)}
                className={cn(
                  "rounded-full p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white",
                  isPaintMode && "bg-white/15 text-white shadow-[0_8px_24px_rgba(0,0,0,0.25)]"
                )}
                aria-pressed={isPaintMode}
                aria-label="Toggle day type paint mode"
              >
                <Paintbrush className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => goToOffsetMonth(1)}
                className="rounded-full p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {showDayTypesComingSoon ? (
            <div className="rounded-xl border border-dashed border-white/20 bg-white/5 px-3 py-2 text-sm text-white/80">
              Day types coming soon.
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
            <table className="w-full border-collapse table-fixed text-sm min-w-[320px]">
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
                  <tr key={`week-${weekIndex}`} className="text-center">
                    {week.map((day, dayIndex) => {
                      if (!day) {
                        return <td key={`empty-${weekIndex}-${dayIndex}`} />;
                      }
                      const dayKey = formatDateKeyInTimeZone(day, resolvedTimeZone);
                      const meta = dayMetaByDateKey?.[dayKey];
                      const isToday = todayKey ? dayKey === todayKey : false;
                      const isSelected = dayKey === selectedDateKey;
                      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                      const circleClass = cn(
                        "flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-md text-sm font-medium",
                        isSelected
                          ? "bg-[var(--accent-red)] text-white shadow-[0_14px_34px_rgba(252,165,165,0.45)]"
                          : "bg-white/10 text-white/80",
                        isToday && !isSelected && "ring-1 ring-white/40",
                        isWeekend && !isSelected && "text-white/60"
                      );
                      return (
                        <td key={day.toISOString()} className="px-1 py-1 sm:py-1.5">
                          <button
                            type="button"
                            onClick={() => handleSelect(day)}
                            className={cn(
                              "mx-auto flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl border text-sm font-semibold transition",
                              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-white",
                              "border-transparent bg-transparent hover:bg-white/10"
                            )}
                            aria-current={isSelected ? "date" : undefined}
                            aria-label={day.toLocaleDateString(undefined, {
                              weekday: "long",
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                            })}
                          >
                            <span
                              className={circleClass}
                              style={meta?.color && !isSelected ? { backgroundColor: meta.color } : undefined}
                            >
                              {day.getDate()}
                            </span>
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
