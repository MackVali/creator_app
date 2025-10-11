"use client";

import { useState } from "react";
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
import { cn } from "@/lib/utils";

interface ScheduleTopBarProps {
  year: number;
  onBack: () => void;
  onToday: () => void;
  canGoBack?: boolean;
  onOpenJumpToDate?: () => void;
  onOpenSearch?: () => void;
}

export function ScheduleTopBar({
  year,
  onBack,
  onToday,
  canGoBack = true,
  onOpenJumpToDate,
  onOpenSearch,
}: ScheduleTopBarProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

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

  const iconButtonClass = cn(
    "inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10",
    "bg-white/5 text-[var(--text-primary)] transition-colors",
    "hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2",
    "focus-visible:ring-[var(--accent-red)] focus-visible:ring-offset-2",
    "focus-visible:ring-offset-[var(--surface-elevated)] supports-[backdrop-filter]:bg-white/10",
    "disabled:cursor-not-allowed disabled:opacity-30"
  );

  return (
    <header
      className={cn(
        "sticky inset-x-0 top-0 z-50",
        "border-b border-white/10 bg-[var(--surface-elevated)]/95",
        "supports-[backdrop-filter]:bg-[var(--surface-elevated)]/80 supports-[backdrop-filter]:backdrop-blur",
        "shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
      )}
      style={{
        top: "env(safe-area-inset-top, 0px)",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <div className="mx-auto flex h-[68px] w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onBack}
          disabled={!canGoBack}
          className={iconButtonClass}
          aria-label="Go back"
        >
          <ChevronLeft className="h-5 w-5 text-[var(--accent-red)]" />
        </button>
        <div className="flex flex-1 items-center justify-center">
          <div
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[15px] font-semibold text-[var(--text-primary)] shadow-inner shadow-white/5 supports-[backdrop-filter]:bg-white/10"
          >
            <span className="text-xs font-medium uppercase tracking-[0.24em] text-white/60">Year</span>
            <span className="text-[17px] leading-none">{year}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
              <button type="button" className={iconButtonClass} aria-label="Open quick actions">
                <Plus className="h-5 w-5 text-[var(--accent-red)]" />
              </button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className={cn(
                "border-t border-white/10 bg-[var(--surface-elevated)]/95 text-[var(--text-primary)]",
                "supports-[backdrop-filter]:bg-[var(--surface-elevated)]/80",
                "shadow-[0_-12px_48px_rgba(0,0,0,0.4)]"
              )}
            >
              <div className="mx-auto max-w-md space-y-3 py-4">
                <div className="mx-auto h-1 w-12 rounded-full bg-white/15" aria-hidden="true" />
                <div className="grid gap-2">
                  {actions.map(({ label, icon: Icon, onClick }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        onClick();
                        setOpen(false);
                      }}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left",
                        "text-[var(--text-primary)] transition-colors hover:bg-white/10",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-red)]",
                        "focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-elevated)]",
                        "supports-[backdrop-filter]:bg-white/10"
                      )}
                    >
                      <Icon className="h-5 w-5 text-[var(--accent-red)]" />
                      <span className="font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

