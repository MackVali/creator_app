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
  FileText,
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
}

export function ScheduleTopBar({ year, onBack, onToday }: ScheduleTopBarProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const actions = [
    { label: "Add Task", icon: CheckSquare, onClick: () => router.push("/tasks/new") },
    { label: "Quick Project", icon: FolderPlus, onClick: () => router.push("/projects/new") },
    { label: "Filters", icon: Filter, onClick: () => router.push("/schedule/filters") },
    { label: "Energy Showcase", icon: Flame, onClick: () => router.push("/schedule/energy") },
    { label: "Tasks", icon: ListChecks, onClick: () => router.push("/tasks") },
    { label: "Draft", icon: FileText, onClick: () => router.push("/schedule/draft") },
    { label: "Windows", icon: PanelsTopLeft, onClick: () => router.push("/windows") },
    { label: "Today", icon: Calendar, onClick: onToday },
  ];

  return (
    <header className="flex items-center justify-between px-4 h-12 bg-[var(--surface-elevated)] border-b border-[var(--hairline)]">
      <button onClick={onBack} className="p-2">
        <ChevronLeft className="h-5 w-5 text-[var(--accent-red)]" />
      </button>
      <button className="text-[16px] font-semibold text-[var(--text-primary)]">
        {year}
      </button>
      <div className="flex items-center gap-2">
        <button className="p-2">
          <Calendar className="h-5 w-5 text-[var(--accent-red)]" />
        </button>
        <button className="p-2">
          <Search className="h-5 w-5 text-[var(--accent-red)]" />
        </button>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button className="p-2">
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

