"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { hapticSoftTick } from "@/lib/haptics/creatorHaptics";
import {
  Bug,
  ChevronLeft,
  Calendar,
  MousePointerClick,
  Rows3,
  RefreshCcw,
  Recycle,
  X,
} from "lucide-react";
interface ScheduleTopBarProps {
  year: number;
  weekdayLabel?: string;
  monthLabel?: string;
  onBack: () => void;
  onToday: () => void;
  canGoBack?: boolean;
  onOpenJumpToDate?: () => void;
  onOpenSearch?: () => void;
  onReschedule?: () => void | Promise<void>;
  canReschedule?: boolean;
  isRescheduling?: boolean;
  onClearUncompletedScheduleInstances?: () => void | Promise<void>;
  isClearingUncompletedScheduleInstances?: boolean;
  onRecycleManualEvents?: () => void | Promise<void>;
  isRecyclingManualEvents?: boolean;
  isManualSchedulingMode?: boolean;
  onToggleManualSchedulingMode?: () => void;
  isSimpleSchedulingMode?: boolean;
  onToggleSimpleSchedulingMode?: () => void;
  onHeightChange?: (height: number) => void;
}

export function ScheduleTopBar({
  year,
  weekdayLabel,
  monthLabel,
  onBack,
  canGoBack = true,
  onOpenJumpToDate,
  onReschedule,
  canReschedule = true,
  isRescheduling = false,
  onClearUncompletedScheduleInstances,
  isClearingUncompletedScheduleInstances = false,
  onRecycleManualEvents,
  isRecyclingManualEvents = false,
  isManualSchedulingMode = false,
  onToggleManualSchedulingMode,
  isSimpleSchedulingMode = false,
  onToggleSimpleSchedulingMode,
  onHeightChange,
}: ScheduleTopBarProps) {
  const headerRef = useRef<HTMLElement | null>(null);
  const debugMenuRef = useRef<HTMLDivElement | null>(null);
  const [isDebugMenuOpen, setIsDebugMenuOpen] = useState(false);

  useEffect(() => {
    if (!onHeightChange) return;
    const node = headerRef.current;
    if (!node) {
      onHeightChange(0);
      return;
    }

    const notify = () => {
      onHeightChange(node.offsetHeight);
    };
    notify();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", notify);
      return () => {
        window.removeEventListener("resize", notify);
      };
    }

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === node) {
          const height =
            entry.borderBoxSize && entry.borderBoxSize.length > 0
              ? entry.borderBoxSize[0].blockSize
              : entry.contentRect.height;
          onHeightChange(height);
        }
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [onHeightChange]);

  useEffect(() => {
    if (!isDebugMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        debugMenuRef.current?.contains(target)
      ) {
        return;
      }
      setIsDebugMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDebugMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDebugMenuOpen]);

  const triggerTopBarHaptic = () => {
    void hapticSoftTick();
  };

  const handleBackClick = () => {
    if (!canGoBack) return;
    triggerTopBarHaptic();
    onBack();
  };

  const handleRescheduleClick = () => {
    if (!onReschedule || !canReschedule || isRescheduling) return;
    triggerTopBarHaptic();
    void onReschedule();
  };

  const handleDebugMenuTriggerClick = () => {
    triggerTopBarHaptic();
    setIsDebugMenuOpen((open) => !open);
  };

  const handleClearUncompletedScheduleInstances = async () => {
    if (!onClearUncompletedScheduleInstances) return;
    if (isClearingUncompletedScheduleInstances) return;
    triggerTopBarHaptic();
    await onClearUncompletedScheduleInstances();
    setIsDebugMenuOpen(false);
  };

  const handleRecycleManualEvents = async () => {
    if (!onRecycleManualEvents) return;
    if (isRecyclingManualEvents) return;
    triggerTopBarHaptic();
    await onRecycleManualEvents();
    setIsDebugMenuOpen(false);
  };

  const handleToggleManualSchedulingModeClick = () => {
    if (!onToggleManualSchedulingMode) return;
    triggerTopBarHaptic();
    onToggleManualSchedulingMode();
  };

  const handleToggleSimpleSchedulingModeClick = () => {
    if (!onToggleSimpleSchedulingMode) return;
    triggerTopBarHaptic();
    onToggleSimpleSchedulingMode();
  };

  const iconButtonClass =
    "app-button inline-flex h-9 w-9 items-center justify-center rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_22px_rgba(0,0,0,0.12)] backdrop-blur-xl transition-colors hover:border-[var(--border)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-elevated)] disabled:opacity-30";

  const rescheduleButtonClass =
    "group relative hidden sm:inline-flex items-center gap-2 rounded-full bg-[var(--accent-red)] px-5 py-2 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(190,18,60,0.45)] transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(190,18,60,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-elevated)] disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-60 disabled:shadow-none";

  const debugButtonClass =
    "app-button hidden sm:inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_10px_28px_rgba(0,0,0,0.12)] backdrop-blur-xl transition hover:border-[var(--border)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-elevated)]";

  const debugMenuActionClass =
    "inline-flex h-8 w-8 flex-none items-center justify-center bg-black text-zinc-500 transition hover:bg-zinc-950 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/70 disabled:pointer-events-none disabled:opacity-45";

  const safeAreaPadding: CSSProperties = {
    paddingTop: "calc(0.45rem + env(safe-area-inset-top, 0px))",
    paddingBottom: "0.45rem",
    paddingLeft: "calc(1rem + env(safe-area-inset-left, 0px))",
    paddingRight: "calc(1rem + env(safe-area-inset-right, 0px))",
  };

  return (
    <header
      className="app-surface-elevated fixed inset-x-0 top-0 z-[120] flex items-center justify-between gap-2 shadow-sm border-b border-[var(--hairline)]"
      style={safeAreaPadding}
      ref={headerRef}
    >
      <div className="flex items-center gap-2">
        <button type="button" onClick={handleBackClick} disabled={!canGoBack} className={iconButtonClass}>
          <ChevronLeft className="h-5 w-5 text-[var(--muted)]" />
        </button>
        <button
          type="button"
          data-tour="jump-to-date"
          onClick={() => onOpenJumpToDate?.()}
          aria-label="Open jump to date"
          className={iconButtonClass}
        >
          <Calendar className="h-5 w-5 text-[var(--muted)]" />
        </button>
      </div>
      <div className="flex items-center justify-center gap-1.5 px-2 leading-none text-[var(--text)]">
        {weekdayLabel ? (
          <span className="text-sm font-black tracking-tight text-[var(--text)]">
            {weekdayLabel}
          </span>
        ) : null}
        {monthLabel ? (
          <span className="text-sm font-black uppercase tracking-tight text-[var(--muted)]">
            {monthLabel}
          </span>
        ) : null}
        <span className="text-sm font-black tracking-tight text-[var(--text)]">
          {year}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {onReschedule ? (
          <>
            <button
              type="button"
              onClick={handleRescheduleClick}
              disabled={!canReschedule || isRescheduling}
              aria-label={isRescheduling ? "Rescheduling…" : "Reschedule"}
              className={rescheduleButtonClass}
            >
              <RefreshCcw
                strokeWidth={2.4}
                className={`h-[18px] w-[18px] transition-transform duration-200 ease-out group-hover:rotate-6 ${
                  isRescheduling ? "animate-spin" : ""
                }`}
              />
              <span>{isRescheduling ? "Rescheduling…" : "Reschedule"}</span>
            </button>
            <button
              type="button"
              onClick={handleRescheduleClick}
              disabled={!canReschedule || isRescheduling}
              aria-label={isRescheduling ? "Rescheduling…" : "Reschedule"}
              className={`sm:hidden ${iconButtonClass}`}
            >
              <RefreshCcw
                className={`h-5 w-5 text-[var(--muted)] ${
                  isRescheduling ? "animate-spin" : ""
                }`}
              />
            </button>
          </>
        ) : null}
        <div ref={debugMenuRef} className="relative flex items-center">
          <button
            type="button"
            onClick={handleDebugMenuTriggerClick}
            aria-label="Toggle schedule debug menu"
            aria-expanded={isDebugMenuOpen}
            className={cn(
              debugButtonClass,
              isDebugMenuOpen &&
                "relative z-[140] bg-black text-zinc-100 hover:bg-black hover:text-zinc-100"
            )}
          >
            <Bug className="h-4 w-4 text-[var(--muted)]" />
            <span>Schedule Debug</span>
          </button>
          <button
            type="button"
            onClick={handleDebugMenuTriggerClick}
            aria-label="Toggle Schedule Debug menu"
            aria-expanded={isDebugMenuOpen}
            className={cn(
              iconButtonClass,
              "sm:hidden",
              isDebugMenuOpen &&
                "relative z-[140] bg-black hover:bg-black"
            )}
          >
            <Bug className="h-5 w-5 text-[var(--muted)]" />
          </button>
          <div
            className={cn(
              "absolute right-0 top-[calc(100%-0.375rem)] z-[130] flex w-8 origin-top flex-col overflow-hidden rounded-b-full rounded-t-none bg-black p-0 shadow-none transition-all duration-150 ease-out",
              isDebugMenuOpen
                ? "translate-y-0 scale-y-100 opacity-100"
                : "pointer-events-none -translate-y-2 scale-y-75 opacity-0"
            )}
          >
            <button
              type="button"
              onClick={handleClearUncompletedScheduleInstances}
              disabled={
                !onClearUncompletedScheduleInstances ||
                isClearingUncompletedScheduleInstances
              }
              aria-label="Clear uncompleted Events"
              title="Clear uncompleted Events"
              className={debugMenuActionClass}
            >
              <X className="h-5 w-5" strokeWidth={2.4} />
            </button>
            <button
              type="button"
              onClick={handleRecycleManualEvents}
              disabled={!onRecycleManualEvents || isRecyclingManualEvents}
              aria-label="Recycle manual Events"
              title="Recycle manual Events"
              className={debugMenuActionClass}
            >
              <Recycle
                className={cn(
                  "h-[18px] w-[18px]",
                  isRecyclingManualEvents && "animate-spin"
                )}
                strokeWidth={2.4}
              />
            </button>
            <button
              type="button"
              onClick={handleToggleManualSchedulingModeClick}
              disabled={!onToggleManualSchedulingMode}
              aria-label="Manual scheduling"
              title="Manual scheduling"
              aria-pressed={isManualSchedulingMode}
              className={cn(
                debugMenuActionClass,
                isManualSchedulingMode &&
                  "text-white hover:text-white focus-visible:ring-white/80"
              )}
            >
              <MousePointerClick className="h-[18px] w-[18px]" strokeWidth={2.4} />
            </button>
            <button
              type="button"
              onClick={handleToggleSimpleSchedulingModeClick}
              disabled={!onToggleSimpleSchedulingMode}
              aria-label="Simple Scheduling"
              title="Simple Scheduling"
              aria-pressed={isSimpleSchedulingMode}
              className={cn(
                debugMenuActionClass,
                isSimpleSchedulingMode &&
                  "text-white hover:text-white focus-visible:ring-white/80"
              )}
            >
              <Rows3 className="h-[18px] w-[18px]" strokeWidth={2.4} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
