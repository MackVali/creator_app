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

  const iconButtonClass =
    "inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 " +
    "text-[var(--text-primary)] transition hover:bg-white/10 focus-visible:outline-none " +
    "focus-visible:ring-2 focus-visible:ring-[var(--accent-red)] focus-visible:ring-offset-2 " +
    "focus-visible:ring-offset-[var(--surface-elevated)] disabled:cursor-not-allowed disabled:opacity-30";

  return (
    <header
      className="sticky top-0 z-40 border-b border-white/10 bg-[var(--surface-elevated)]/95 shadow-lg shadow-black/20 backdrop-blur"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="flex h-[72px] items-center justify-between gap-3 px-4">
        <button onClick={onBack} disabled={!canGoBack} className={iconButtonClass} aria-label="Go back">
          <ChevronLeft className="h-5 w-5 text-[var(--accent-red)]" />
        </button>
        <button
          className="rounded-full border border-white/10 bg-white/5 px-5 py-2 text-[17px] font-semibold text-[var(--text-primary)] shadow-inner shadow-white/5 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-red)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-elevated)]"
        >
          {year}
        </button>
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
              <button className={iconButtonClass} aria-label="Open quick actions">
                <Plus className="h-5 w-5 text-[var(--accent-red)]" />
              </button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="border-t border-white/10 bg-[var(--surface-elevated)]/95 text-[var(--text-primary)] shadow-[0_-12px_40px_rgba(0,0,0,0.45)] supports-[backdrop-filter]:bg-[var(--surface-elevated)]/85"
            >
              <div className="mx-auto max-w-md space-y-2 py-4">
                <div className="h-1 w-12 mx-auto rounded-full bg-white/15" aria-hidden="true" />
                <div className="grid gap-2">
                  {actions.map(({ label, icon: Icon, onClick }) => (
                    <button
                      key={label}
                      onClick={() => {
                        onClick();
                        setOpen(false);
                      }}
                      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left text-[var(--text-primary)] transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-red)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-elevated)]"
                    >
                      <Icon className="h-5 w-5 text-[var(--accent-red)]" />
                      <span>{label}</span>
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

