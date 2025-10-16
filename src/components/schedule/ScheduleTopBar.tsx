"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Calendar,
  Search,
  Plus,
  CheckSquare,
  FolderPlus,
  Filter,
  Flame,
  ListChecks,
  RefreshCcw,
  PanelsTopLeft,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";

interface ScheduleTopBarProps {
  year: number;
  onBack: () => void;
  onToday: () => void;
  canGoBack?: boolean;
  onOpenJumpToDate?: () => void;
  onOpenSearch?: () => void;
  onReschedule?: () => void;
  canReschedule?: boolean;
  isRescheduling?: boolean;
}

export function ScheduleTopBar({
  year,
  onBack,
  onToday,
  canGoBack = true,
  onOpenJumpToDate,
  onOpenSearch,
  onReschedule,
  canReschedule = true,
  isRescheduling = false,
}: ScheduleTopBarProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const iconButtonClass =
    "inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-[var(--text-primary)] transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-red)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-elevated)] disabled:opacity-30 disabled:hover:bg-white/5";

  const rescheduleButtonClass =
    "group relative hidden sm:inline-flex items-center gap-2 rounded-full bg-[var(--accent-red)] px-5 py-2 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(190,18,60,0.45)] transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(190,18,60,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-elevated)] disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-60 disabled:shadow-none";

  const actions = [
    { label: "Add Task", icon: CheckSquare, onClick: () => router.push("/tasks/new") },
    { label: "Quick Project", icon: FolderPlus, onClick: () => router.push("/projects/new") },
    { label: "Filters", icon: Filter, onClick: () => router.push("/schedule/filters") },
    { label: "Energy Showcase", icon: Flame, onClick: () => router.push("/schedule/energy") },
    { label: "Tasks", icon: ListChecks, onClick: () => router.push("/tasks") },
    {
      label: "Scheduler",
      icon: RefreshCcw,
      onClick: () => router.push("/schedule/scheduler"),
    },
    { label: "Windows", icon: PanelsTopLeft, onClick: () => router.push("/windows") },
    { label: "Today", icon: Calendar, onClick: onToday },
  ];

  const safeAreaPadding: CSSProperties = {
    paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))",
    paddingBottom: "0.75rem",
    paddingLeft: "calc(1rem + env(safe-area-inset-left, 0px))",
    paddingRight: "calc(1rem + env(safe-area-inset-right, 0px))",
  };

  return (
    <header
      className="fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-3 bg-[var(--surface-elevated)]/95 shadow-sm border-b border-[var(--hairline)] supports-[backdrop-filter]:bg-[var(--surface-elevated)]/80 backdrop-blur"
      style={safeAreaPadding}
    >
      <button type="button" onClick={onBack} disabled={!canGoBack} className={iconButtonClass}>
        <ChevronLeft className="h-5 w-5 text-[var(--accent-red)]" />
      </button>
      <button
        type="button"
        className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--text-primary)] bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-red)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-elevated)]"
      >
        {year}
      </button>
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
                className={`h-5 w-5 text-[var(--accent-red)] ${
                  isRescheduling ? "animate-spin" : ""
                }`}
              />
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => onOpenJumpToDate?.()}
          aria-label="Open jump to date"
          className={iconButtonClass}
        >
          <Calendar className="h-5 w-5 text-[var(--accent-red)]" />
        </button>
        <button
          type="button"
          onClick={() => onOpenSearch?.()}
          aria-label="Search schedule"
          className={iconButtonClass}
        >
          <Search className="h-5 w-5 text-[var(--accent-red)]" />
        </button>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button type="button" aria-label="Open schedule quick actions" className={iconButtonClass}>
              <Plus className="h-5 w-5 text-[var(--accent-red)]" />
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="bg-[var(--surface-elevated)] rounded-t-xl p-4">
            <div className="grid gap-2">
              {actions.map(({ label, icon: Icon, onClick }) => (
                <button
                  key={label}
                  onClick={() => {
                    onClick();
                    setOpen(false);
                  }}
                  className="flex items-center gap-3 p-3 rounded-md bg-white/5 hover:bg-white/10 text-[var(--text-primary)]"
                >
                  <Icon className="h-5 w-5 text-[var(--accent-red)]" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

