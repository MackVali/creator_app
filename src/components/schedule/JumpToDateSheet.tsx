"use client";

import { Fragment, useEffect, useMemo, useState, useCallback, useRef, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarDays, Paintbrush, Droplet, MapPin } from "lucide-react";
import type { JumpToDateSnapshot } from "@/lib/scheduler/snapshot";
import { ENERGY_LEVELS } from "@/lib/scheduler/energy";
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";
import { Ticker } from "@/components/ui/Ticker";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WindowLite } from "@/lib/scheduler/repo";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatDateKeyInTimeZone } from "@/lib/scheduler/timezone";
import { getSupabaseBrowser } from "@/lib/supabase";

interface JumpToDateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentDate: Date;
  onSelectDate: (date: Date) => void;
  timeZone?: string | null;
  dayMetaByDateKey?: Record<string, { color?: string; kind?: string; label?: string }>;
  snapshot?: JumpToDateSnapshot;
  windowSnapshot?: WindowLite[];
}

type BlockType = "FOCUS" | "BREAK" | "PRACTICE";

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
  windowSnapshot: _windowSnapshot,
}: JumpToDateSheetProps) {
  const router = useRouter();
  const [isPaintMode, setIsPaintMode] = useState(false);
  const [paintSelectionKey, setPaintSelectionKey] = useState<string | null>(null);
  const [isDayTypesMenuOpen, setIsDayTypesMenuOpen] = useState(false);
  const SHOW_TIME_BLOCKS_KEY = "jump-to-date-show-time-blocks";
  const [showTimeBlocks, setShowTimeBlocks] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const stored = window.localStorage.getItem(SHOW_TIME_BLOCKS_KEY);
      if (stored === null) return true;
      return stored === "1";
    } catch {
      return true;
    }
  });
  const [dayTypes, setDayTypes] = useState<
    Array<{ id: string; name: string; isDefault: boolean; days: number[] }>
  >([]);
  const [isLoadingDayTypes, setIsLoadingDayTypes] = useState(false);
  const [dayTypeError, setDayTypeError] = useState<string | null>(null);
  const [timeBlocks, setTimeBlocks] = useState<
    Array<{ id: string; label?: string | null; start_local: string; end_local: string }>
  >([]);
  const [dayTypeBlockMap, setDayTypeBlockMap] = useState<Map<string, Set<string>>>(() => new Map());
  const [blockEnergy, setBlockEnergy] = useState<Map<string, FlameLevel>>(() => new Map());
  const [blockTypeMap, setBlockTypeMap] = useState<Map<string, BlockType>>(() => new Map());
  const [blockLocation, setBlockLocation] = useState<Map<string, { label: string; value: string } | null>>(
    () => new Map()
  );
  const [isLoadingTimeBlocks, setIsLoadingTimeBlocks] = useState(false);
  const [timeBlockError, setTimeBlockError] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SHOW_TIME_BLOCKS_KEY, showTimeBlocks ? "1" : "0");
    } catch {
      // ignore write errors
    }
  }, [showTimeBlocks, SHOW_TIME_BLOCKS_KEY]);
  const energyHours = (snapshot?.energyHours ?? {}) as JumpToDateSnapshot["energyHours"];
  const projected = snapshot?.projected ?? {};
  type EnergyView = "day" | "week" | "month";
  const [energyView, setEnergyView] = useState<EnergyView>("day");
  const energyViewOrder: EnergyView[] = ["day", "week", "month"];
  const energyViewLabels: Record<EnergyView, string> = {
    day: "Today",
    week: "Week",
    month: "Month",
  };
  const isFirstEnergyRender = useRef(true);
  const [prevEnergyView, setPrevEnergyView] = useState<EnergyView | null>(null);
  const [isPrevFading, setIsPrevFading] = useState(false);
  const [isEnteringEnergy, setIsEnteringEnergy] = useState(false);
  const cycleEnergyView = () => {
    const next = energyViewOrder[(energyViewOrder.indexOf(energyView) + 1) % energyViewOrder.length];
    setPrevEnergyView(energyView);
    setIsPrevFading(false);
    setEnergyView(next);
  };
  useEffect(() => {
    if (!prevEnergyView) return;
    const raf = window.requestAnimationFrame(() => setIsPrevFading(true));
    const timeout = window.setTimeout(() => {
      setPrevEnergyView(null);
      setIsPrevFading(false);
    }, 280);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
    };
  }, [prevEnergyView]);

  useEffect(() => {
    if (isFirstEnergyRender.current) {
      isFirstEnergyRender.current = false;
      return;
    }
    setIsEnteringEnergy(true);
    const raf = window.requestAnimationFrame(() => setIsEnteringEnergy(false));
    return () => window.cancelAnimationFrame(raf);
  }, [energyView]);
  const scrollAreaPadding: CSSProperties = {
    paddingBottom: "calc(0.8rem + env(safe-area-inset-bottom, 0px))",
  };

  const togglePaintMode = () => {
    setIsPaintMode(prev => {
      const next = !prev;
      if (!next) {
        setPaintSelectionKey(null);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!open || !isPaintMode) return;
    let cancelled = false;
    const loadDayTypes = async () => {
      setIsLoadingDayTypes(true);
      setDayTypeError(null);
      try {
        const supabase = getSupabaseBrowser();
        if (!supabase) throw new Error("Supabase client not available");
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.id) {
          setDayTypes([]);
          return;
        }
        const { data, error } = await supabase
          .from("day_types")
          .select("id,name,is_default,days")
          .eq("user_id", user.id);
        if (error) throw error;
        if (cancelled) return;
        const normalized =
          data?.flatMap(entry => {
            if (!entry?.id || typeof entry.name !== "string") return [];
            const days = Array.isArray(entry.days)
              ? entry.days
                  .map(day => Number(day))
                  .filter(day => Number.isInteger(day) && day >= 0 && day <= 6)
              : [];
            return [
              {
                id: entry.id,
                name: entry.name,
                isDefault: entry.is_default ?? false,
                days,
              },
            ];
          }) ?? [];
        setDayTypes(normalized);
      } catch (error) {
        console.warn("Unable to load day types", error);
        if (cancelled) return;
        setDayTypes([]);
        setDayTypeError("Unable to load day types right now.");
      } finally {
        if (cancelled) return;
        setIsLoadingDayTypes(false);
      }
    };
    void loadDayTypes();
    return () => {
      cancelled = true;
    };
  }, [open, isPaintMode]);

  useEffect(() => {
    if (!open || !isPaintMode) return;
    let cancelled = false;
    const loadTimeBlocks = async () => {
      setIsLoadingTimeBlocks(true);
      setTimeBlockError(null);
      try {
        const supabase = getSupabaseBrowser();
        if (!supabase) throw new Error("Supabase client not available");
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.id) {
          setTimeBlocks([]);
          setDayTypeBlockMap(new Map());
          setBlockEnergy(new Map());
          setBlockTypeMap(new Map());
          setBlockLocation(new Map());
          return;
        }
        const [blocksResult, linksResult] = await Promise.all([
          supabase
            .from("time_blocks")
            .select("id,label,start_local,end_local")
            .eq("user_id", user.id),
          supabase
            .from("day_type_time_blocks")
            .select(
              "day_type_id,time_block_id,energy,block_type,location_context_id,location_context:location_contexts(value,label)"
            )
            .eq("user_id", user.id),
        ]);
        if (blocksResult.error) throw blocksResult.error;
        if (linksResult.error) throw linksResult.error;
        if (cancelled) return;

        const normalizedBlocks =
          blocksResult.data?.flatMap(entry => {
            if (!entry?.id) return [];
            return [
              {
                id: entry.id,
                label: normalizeBlockLabel(entry.label),
                start_local: normalizeTimeLabel(entry.start_local),
                end_local: normalizeTimeLabel(entry.end_local),
              },
            ];
          }) ?? [];

        const byDayType = new Map<string, Set<string>>();
        const energyMap = new Map<string, FlameLevel>();
        const typeMap = new Map<string, BlockType>();
        const locationMap = new Map<string, { label: string; value: string } | null>();
        (linksResult.data ?? []).forEach(row => {
          const dayTypeId = (row as { day_type_id?: string | null })?.day_type_id;
          const blockId = (row as { time_block_id?: string | null })?.time_block_id;
          if (!dayTypeId || !blockId) return;
          const existing = byDayType.get(dayTypeId) ?? new Set<string>();
          existing.add(blockId);
          byDayType.set(dayTypeId, existing);
          const level = (row as { energy?: string | null })?.energy ?? "NO";
          energyMap.set(blockId, normalizeFlameLevel(level));
          const type = ((row as { block_type?: string | null })?.block_type ?? "FOCUS").toUpperCase();
          if (type === "BREAK" || type === "PRACTICE" || type === "FOCUS") {
            typeMap.set(blockId, type);
          } else {
            typeMap.set(blockId, "FOCUS");
          }
          const locationContext = (row as { location_context?: { value?: string | null; label?: string | null } | null })
            ?.location_context;
          const locationId = (row as { location_context_id?: string | null })?.location_context_id;
          if (locationId) {
            const value =
              typeof locationContext?.value === "string" ? locationContext.value.trim().toUpperCase() : locationId;
            const label =
              typeof locationContext?.label === "string" ? locationContext.label.trim() : locationContext?.value ?? value;
            locationMap.set(blockId, { label: label ?? locationId, value });
          } else {
            locationMap.set(blockId, null);
          }
        });

        const sortedBlocks = [...normalizedBlocks].sort((a, b) => {
          const aStart = timeStringToMinutes(a.start_local);
          const bStart = timeStringToMinutes(b.start_local);
          if (aStart === bStart) {
            return (a.label ?? "").localeCompare(b.label ?? "");
          }
          return aStart - bStart;
        });

        setTimeBlocks(sortedBlocks);
        setDayTypeBlockMap(byDayType);
        setBlockEnergy(energyMap);
        setBlockTypeMap(typeMap);
        setBlockLocation(locationMap);
      } catch (error) {
        console.warn("Unable to load time blocks for paint mode", error);
        if (cancelled) return;
        setTimeBlocks([]);
        setDayTypeBlockMap(new Map());
        setBlockEnergy(new Map());
        setBlockTypeMap(new Map());
        setBlockLocation(new Map());
        setTimeBlockError("Unable to load time blocks right now.");
      } finally {
        if (cancelled) return;
        setIsLoadingTimeBlocks(false);
      }
    };
    void loadTimeBlocks();
    return () => {
      cancelled = true;
    };
  }, [open, isPaintMode]);

  const handleCreateDayType = useCallback(() => {
    onOpenChange(false);
    setIsDayTypesMenuOpen(false);
    router.push("/schedule/day-types/new");
  }, [onOpenChange, router]);

  const formatHours = (value?: number) =>
    Number.isFinite(value ?? NaN) ? `${(value as number).toFixed(1)}h` : "—";
  const formatWindowHours = (value?: number) =>
    Number.isFinite(value ?? NaN) ? `${(value as number).toFixed(1)}h` : "0h";
  const normalizeFlameLevel = (value?: string | null): FlameLevel => {
    const upper = String(value ?? "MEDIUM").trim().toUpperCase();
    return (["NO", "LOW", "MEDIUM", "HIGH", "ULTRA", "EXTREME"] as const).includes(
      upper as FlameLevel
    )
      ? (upper as FlameLevel)
      : "MEDIUM";
  };
  const normalizeBlockLabel = (value?: string | null) => {
    const trimmed = (value ?? "").trim();
    return trimmed.length > 0 ? trimmed.toUpperCase() : null;
  };
  const timeStringToMinutes = (time?: string | null) => {
    const [h, m] = String(time ?? "").split(":").map(Number);
    const hh = Number.isFinite(h) ? Math.min(Math.max(h, 0), 24) : 0;
    const mm = Number.isFinite(m) ? Math.min(Math.max(m, 0), 59) : 0;
    const clampedHour = hh === 24 && mm > 0 ? 23 : hh;
    return clampedHour * 60 + mm;
  };
  const normalizeTimeLabel = (value?: string | null) => {
    const minutes = timeStringToMinutes(value);
    const clamped = Math.min(Math.max(minutes, 0), 1439);
    const h = Math.floor(clamped / 60);
    const m = clamped % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  const windowDurationHours = (
    window?: { start_local?: string | null; end_local?: string | null } | null
  ) => {
    if (!window) return 0;
    const start = timeStringToMinutes(window.start_local);
    const end = timeStringToMinutes(window.end_local);
    const durationMin = end < start ? 1440 - start + end : end - start;
    return Math.max(durationMin, 0) / 60;
  };
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
          size="sm"
          className="scale-90"
        />
      </span>
    );
  }

  function EnergyHoursCell({
    value,
    level,
    className,
  }: {
    value?: number;
    level: (typeof ENERGY_LEVELS)[number];
    className?: string;
  }) {
    return (
      <div
        className={cn(
          "grid h-5 sm:h-6 grid-cols-[minmax(42px,1fr)_auto_auto] items-center justify-items-end gap-1 text-[10px] sm:text-[13px] leading-none whitespace-nowrap tabular-nums",
          className
        )}
      >
        <span className="justify-self-end">{formatHours(value)}</span>
        <span className="text-white/40 justify-self-end">/</span>
        <span className="text-white/70 justify-self-end">
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
      <div className="min-w-[110px] sm:min-w-[180px] shrink-0 rounded-lg bg-[var(--surface-elevated)] px-2 py-1 text-white/90 shadow-[0_12px_30px_rgba(5,7,12,0.32)]">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] sm:text-base">{goal.emoji ?? "🎯"}</span>
          <span className="truncate text-[11px] sm:text-sm font-medium leading-tight">
            {goal.title}
          </span>
        </div>
        {completeBy ? (
          <div className="mt-1 flex items-center gap-1 text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.12em] sm:tracking-[0.14em] text-white/60 leading-tight">
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

  const paintSelectionDate = useMemo(() => {
    if (!paintSelectionKey) return null;
    return parseDateKey(paintSelectionKey);
  }, [paintSelectionKey]);

  const paintSelectionLabel = useMemo(() => {
    if (!paintSelectionDate) return null;
    const dayName = paintSelectionDate.toLocaleDateString(undefined, { weekday: "long" });
    const dateLabel = paintSelectionDate.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    return { dayName, dateLabel };
  }, [paintSelectionDate]);

  const paintDayType = useMemo(() => {
    if (!paintSelectionDate || dayTypes.length === 0) return null;
    const dayIndex = paintSelectionDate.getDay();
    const matches = dayTypes.filter(dayType => dayType.days.includes(dayIndex));
    if (matches.length === 0) return null;
    const preferred = matches.find(dayType => dayType.isDefault);
    return preferred ?? matches[0];
  }, [dayTypes, paintSelectionDate]);

  const paintTimeBlocks = useMemo(() => {
    if (!isPaintMode || !paintDayType) return [];
    const linkedBlocks = dayTypeBlockMap.get(paintDayType.id);
    if (!linkedBlocks) return [];
    return timeBlocks
      .filter(block => linkedBlocks.has(block.id))
      .map(block => ({
        ...block,
        energy: blockEnergy.get(block.id) ?? null,
        blockType: blockTypeMap.get(block.id) ?? "FOCUS",
        location: blockLocation.get(block.id) ?? null,
      }));
  }, [blockEnergy, blockLocation, blockTypeMap, dayTypeBlockMap, isPaintMode, paintDayType, timeBlocks]);

  const handleSelect = (date: Date, dateKey?: string) => {
    if (isPaintMode && dateKey) {
      setPaintSelectionKey(dateKey);
      return;
    }
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
        className="bg-gradient-to-b from-[var(--surface-elevated)] via-[var(--surface-elevated)]/95 to-[#0b0f16] border-t border-white/10 p-0 text-[var(--text-primary)] rounded-t-[22px] sm:rounded-t-2xl max-h-[92vh] sm:max-h-[88vh] overflow-hidden shadow-[0_-22px_50px_rgba(0,0,0,0.45)] backdrop-blur"
      >
        <SheetHeader className="sticky top-0 z-20 border-b border-white/10 bg-[var(--surface-elevated)]/90 px-4 pt-3 pb-2 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <SheetTitle className="text-base font-semibold tracking-tight text-white">Jump to date</SheetTitle>
            </div>
          </div>
        </SheetHeader>
        <div
          className="flex min-h-0 flex-1 flex-col gap-2.5 px-3 sm:px-4 pb-3.5 pt-1.5 sm:pt-2 overflow-y-auto"
          style={scrollAreaPadding}
        >
          {isPaintMode ? (
            <div className="space-y-2 sm:space-y-3">
              <div className="flex items-center justify-between text-[10px] sm:text-xs font-semibold uppercase tracking-[0.12em] sm:tracking-[0.18em] text-white/70">
                <span className="text-white/80">Day</span>
                <span className="text-white/50">Paint mode</span>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/5 p-3 sm:p-3.5 text-white/85 shadow-[0_12px_28px_rgba(0,0,0,0.25)] space-y-3">
                {paintSelectionLabel ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col">
                      <span className="text-[13px] sm:text-sm font-semibold uppercase tracking-[0.14em] text-white/70">
                        {paintSelectionLabel.dayName}
                      </span>
                      <span className="text-base sm:text-lg font-semibold text-white leading-tight">
                        {paintSelectionLabel.dateLabel}
                      </span>
                    </div>
                    <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] sm:text-sm font-semibold uppercase tracking-[0.16em] text-white/80">
                      Selected
                    </span>
                  </div>
                ) : (
                  <div className="text-[13px] sm:text-sm text-white/70">
                    Tap a date to select it while paint mode is on.
                  </div>
                )}
                {paintSelectionLabel ? (
                  <div className="rounded-lg border border-white/10 bg-white/5 p-2.5 sm:p-3 space-y-1.5">
                    <div className="pt-1 space-y-0.5 text-[12px] sm:text-sm font-semibold text-white/75">
                      <div className="flex items-center justify-between gap-2">
                        <span>Day type</span>
                        <span className="text-white/90">
                          {dayTypeError
                            ? "Unavailable"
                            : isLoadingDayTypes
                              ? "Loading…"
                              : paintDayType?.name ?? "None set"}
                        </span>
                      </div>
                      <div>
                        Mode: <span className="text-white/90">Default</span>
                      </div>
                    </div>
                    <div className="rounded-md border border-white/10 bg-white/5 p-2.5 sm:p-3 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] sm:text-sm font-semibold uppercase tracking-[0.12em] text-white/70">
                        <span>Time blocks</span>
                        <label className="flex items-center gap-2 text-[11px] sm:text-xs font-medium text-white/70 select-none">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border border-white/40 bg-white/5 accent-white/80"
                            checked={showTimeBlocks}
                            onChange={e => setShowTimeBlocks(e.target.checked)}
                          />
                          <span>View time blocks</span>
                        </label>
                      </div>
                      {!showTimeBlocks ? null : timeBlockError ? (
                        <div className="rounded-md border border-white/5 bg-white/5 px-2.5 py-1.5 text-[12px] sm:text-sm text-white/65">
                          {timeBlockError}
                        </div>
                      ) : isLoadingTimeBlocks ? (
                        <div className="rounded-md border border-white/5 bg-white/5 px-2.5 py-1.5 text-[12px] sm:text-sm text-white/65">
                          Loading time blocks…
                        </div>
                      ) : paintTimeBlocks.length === 0 ? (
                        <div className="rounded-md border border-white/5 bg-white/5 px-2.5 py-1.5 text-[12px] sm:text-sm text-white/65">
                          No time blocks for this day type.
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {paintTimeBlocks.map(block => {
                            const hours = windowDurationHours(block);
                            const typeLabel =
                              (block.blockType ?? "FOCUS").charAt(0) +
                              (block.blockType ?? "FOCUS").slice(1).toLowerCase();
                            return (
                              <div
                                key={block.id}
                                className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5"
                              >
                                <div className="min-w-0 space-y-0.5">
                                  <div className="truncate text-[13px] sm:text-sm font-semibold text-white/90">
                                    {block.label || "Time block"}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] sm:text-[11px] text-white/60">
                                    <span>
                                      {block.start_local} – {block.end_local}
                                    </span>
                                    {block.location ? (
                                      <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-white/65">
                                        <MapPin className="h-3 w-3" />
                                        <span className="truncate max-w-[120px] sm:max-w-[200px]">
                                          {block.location.label ?? block.location.value}
                                        </span>
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 text-[11px] sm:text-[12px] font-semibold text-white/90 whitespace-nowrap">
                                  <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/75">
                                    {typeLabel}
                                  </span>
                                  <span>{formatWindowHours(hours)}</span>
                                  <EnergyFlame level={normalizeFlameLevel(block.energy)} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : snapshot ? (
            <div className="space-y-1.5 sm:space-y-2.5">
              <div className="flex items-center justify-between text-[10px] sm:text-xs font-semibold uppercase tracking-[0.12em] sm:tracking-[0.18em] text-white/70">
                <span className="text-white/80">Snapshot</span>
                <span className="text-white/50">Current view</span>
              </div>
              <div className="grid grid-cols-[0.9fr_1.1fr] gap-2 sm:gap-3">
                <div className="rounded-xl border border-white/5 bg-white/5 p-1.5 sm:p-2.5 w-full">
                  <div className="flex items-center justify-between gap-2 whitespace-nowrap">
                    <div className="text-[11px] sm:text-[12px] font-semibold uppercase tracking-[0.08em] sm:tracking-[0.12em] text-white/60 leading-tight whitespace-nowrap">
                      Energy hours
                    </div>
                    <button
                      type="button"
                      onClick={cycleEnergyView}
                      className="text-center text-[10px] sm:text-[12px] uppercase tracking-[0.12em] sm:tracking-[0.14em] text-white/80 leading-none rounded-full bg-white/5 px-2 py-1.25 sm:px-2.5 sm:py-1.5 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70 whitespace-nowrap"
                    >
                      {energyViewLabels[energyView]}
                    </button>
                  </div>
                  {visibleLevels.length === 0 ? (
                    <div className="mt-1.5 sm:mt-3 rounded-lg border border-white/5 bg-white/5 px-2 py-2 text-[10px] sm:text-sm text-white/70">
                      No energy windows found for this period.
                    </div>
                  ) : (
                    <div className="mt-1 w-full relative text-[11px] sm:text-[13px] text-white/80 leading-[1.1]">
                      {prevEnergyView ? (
                        <div
                          className={cn(
                            "absolute inset-0 grid grid-cols-[minmax(74px,1fr)_minmax(90px,140px)] items-center justify-start gap-x-1.5 sm:gap-x-3 gap-y-0.5 sm:gap-y-1.5 transition-all duration-250 ease-out pointer-events-none",
                            isPrevFading ? "opacity-0 translate-y-1" : "opacity-100 translate-y-0"
                          )}
                        >
                          {visibleLevels.map(level => (
                            <Fragment key={`${prevEnergyView}-${level}`}>
                              <span className="text-white uppercase text-[10px] sm:text-[12px] leading-none">
                                {level}
                              </span>
                              <EnergyHoursCell value={energyHours[prevEnergyView]?.[level]} level={level} />
                            </Fragment>
                          ))}
                        </div>
                      ) : null}
                      <div
                        className={cn(
                          "grid grid-cols-[minmax(74px,1fr)_minmax(90px,140px)] items-center justify-start gap-x-1.5 sm:gap-x-3 gap-y-0.5 sm:gap-y-1.5 transition-all duration-250 ease-out",
                          isEnteringEnergy ? "opacity-0 translate-y-1" : "opacity-100 translate-y-0"
                        )}
                      >
                        {visibleLevels.map(level => (
                          <Fragment key={`${energyView}-${level}`}>
                            <span className="text-white uppercase text-[10px] sm:text-[12px] leading-none">
                              {level}
                            </span>
                            <EnergyHoursCell value={energyHours[energyView]?.[level]} level={level} />
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-white/5 bg-white/5 p-1.5 sm:p-2.5 w-full overflow-hidden">
                  <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.1em] sm:tracking-[0.12em] text-white/60">
                    LIKELY TO BE COMPLETED
                  </div>
                  <div className="mt-1.5 sm:mt-3 space-y-1 sm:space-y-2.5 text-[11px] sm:text-sm text-white/80">
                    <div className="space-y-1">
                      <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.12em] sm:tracking-[0.14em] text-white/50">
                        LIKELY THIS WEEK
                      </div>
                      {weekLikelyGoals.length === 0 ? (
                        <div className="rounded-lg border border-white/5 bg-white/5 px-2 py-2 text-[10px] sm:text-sm text-white/70">
                          No likely goals this week.
                        </div>
                      ) : (
                        <Ticker
                          className="w-full"
                          items={weekLikelyGoals}
                          speed={40}
                          trackClassName="flex flex-nowrap gap-1 sm:gap-2.5 pb-1 will-change-transform"
                          renderItem={(goal, index) => (
                            <GoalTickerCard key={`${goal.id}-${index}`} goal={goal} />
                          )}
                        />
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.12em] sm:tracking-[0.14em] text-white/50">
                        LIKELY THIS MONTH
                      </div>
                      {monthLikelyGoals.length === 0 ? (
                        <div className="rounded-lg border border-white/5 bg-white/5 px-2 py-2 text-[10px] sm:text-sm text-white/70">
                          No likely goals this month.
                        </div>
                      ) : (
                        <Ticker
                          className="w-full"
                          items={monthLikelyGoals}
                          speed={40}
                          trackClassName="flex flex-nowrap gap-1 sm:gap-2.5 pb-1 will-change-transform"
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
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.25">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => goToOffsetMonth(-1)}
                className="rounded-full p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <DropdownMenu open={isDayTypesMenuOpen} onOpenChange={setIsDayTypesMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "rounded-full p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white",
                      isDayTypesMenuOpen && "bg-white/15 text-white shadow-[0_8px_24px_rgba(0,0,0,0.25)]"
                    )}
                    aria-pressed={isDayTypesMenuOpen}
                    aria-label="Day types coming soon"
                  >
                    <Droplet className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  side="bottom"
                  sideOffset={6}
                  className="min-w-[180px] bg-[var(--surface-elevated)] border-white/10 text-white shadow-lg shadow-black/40 z-[9999]"
                >
                  <DropdownMenuItem
                    className="text-sm text-white/90 focus:bg-white/10 focus:text-white"
                    onSelect={handleCreateDayType}
                  >
                    Create day type
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
              <CalendarDays className="h-3 w-3" />
              <span>{monthMetadata.monthLabel}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={togglePaintMode}
                className={cn(
                  "rounded-full p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white",
                  isPaintMode && "bg-white/15 text-white shadow-[0_8px_24px_rgba(0,0,0,0.25)]"
                )}
                aria-pressed={isPaintMode}
                aria-label="Toggle day selection paint mode"
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

          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
            <table className="w-full border-collapse table-fixed text-[13px] min-w-[300px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.22em] text-white/60">
                  {WEEKDAY_LABELS.map(label => (
                    <th key={label} className="py-2 text-center font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-sm">
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
                      const isPaintSelected = isPaintMode && paintSelectionKey === dayKey;
                      const circleClass = cn(
                        "flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-md text-[13px] font-medium",
                        isSelected
                          ? "bg-[var(--accent-red)] text-white shadow-[0_14px_34px_rgba(252,165,165,0.45)]"
                          : "bg-white/10 text-white/80",
                        isToday && !isSelected && "ring-1 ring-white/40",
                        isWeekend && !isSelected && "text-white/60",
                        isPaintSelected && "ring-2 ring-white/70 shadow-[0_0_0_4px_rgba(255,255,255,0.14)]"
                      );
                      return (
                        <td key={day.toISOString()} className="px-[4px] py-[4px] sm:py-1.25">
                          <button
                            type="button"
                            onClick={() => handleSelect(day, dayKey)}
                            className={cn(
                              "mx-auto flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-lg border text-sm font-semibold transition",
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
              className="rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-white/15"
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
