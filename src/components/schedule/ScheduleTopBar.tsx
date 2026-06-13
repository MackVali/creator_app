"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Bug,
  ChevronLeft,
  Calendar,
  RefreshCcw,
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
  onReschedule?: () => void;
  canReschedule?: boolean;
  isRescheduling?: boolean;
  onHeightChange?: (height: number) => void;
}

export function ScheduleTopBar({
  year,
  weekdayLabel,
  monthLabel,
  onBack,
  onToday,
  canGoBack = true,
  onOpenJumpToDate,
  onOpenSearch,
  onReschedule,
  canReschedule = true,
  isRescheduling = false,
  onHeightChange,
}: ScheduleTopBarProps) {
  const router = useRouter();
  const headerRef = useRef<HTMLElement | null>(null);

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

  const iconButtonClass =
    "app-button inline-flex h-9 w-9 items-center justify-center rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_22px_rgba(0,0,0,0.12)] backdrop-blur-xl transition-colors hover:border-[var(--border)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-elevated)] disabled:opacity-30";

  const rescheduleButtonClass =
    "group relative hidden sm:inline-flex items-center gap-2 rounded-full bg-[var(--accent-red)] px-5 py-2 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(190,18,60,0.45)] transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(190,18,60,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-elevated)] disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-60 disabled:shadow-none";

  const debugButtonClass =
    "app-button hidden sm:inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_10px_28px_rgba(0,0,0,0.12)] backdrop-blur-xl transition hover:border-[var(--border)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-elevated)]";

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
        <button type="button" onClick={onBack} disabled={!canGoBack} className={iconButtonClass}>
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
              onClick={onReschedule}
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
              onClick={onReschedule}
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
        <button
          type="button"
          onClick={() => router.push("/schedule/debug")}
          aria-label="Open schedule debug"
          className={debugButtonClass}
        >
          <Bug className="h-4 w-4 text-[var(--muted)]" />
          <span>Schedule Debug</span>
        </button>
        <button
          type="button"
          onClick={() => router.push("/schedule/debug")}
          aria-label="Schedule Debug"
          className={cn(iconButtonClass, "sm:hidden")}
        >
          <Bug className="h-5 w-5 text-[var(--muted)]" />
        </button>
      </div>
    </header>
  );
}
