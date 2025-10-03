"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Search, Sparkles } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ScheduleInstance } from "@/lib/scheduler/instanceRepo";
import type { TaskLite } from "@/lib/scheduler/weight";
import type { ProjectItem } from "@/lib/scheduler/projects";
import { toLocal } from "@/lib/time/tz";
import { cn } from "@/lib/utils";

interface ScheduleSearchSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instances: ScheduleInstance[];
  taskMap: Record<string, TaskLite>;
  projectMap: Record<string, ProjectItem>;
  onSelectResult: (payload: { instanceId: string; date: Date }) => void;
}

type SearchableInstance = {
  instance: ScheduleInstance;
  label: string;
  type: "task" | "project";
  detail: string;
  dateLabel: string;
  start: Date;
  searchableText: string;
};

export function ScheduleSearchSheet({
  open,
  onOpenChange,
  instances,
  taskMap,
  projectMap,
  onSelectResult,
}: ScheduleSearchSheetProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      const id = requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [open]);

  const searchableItems = useMemo(() => {
    const items: SearchableInstance[] = [];
    for (const instance of instances) {
      const start = toLocal(instance.start_utc);
      const end = toLocal(instance.end_utc);
      if (!isValidDate(start) || !isValidDate(end)) {
        continue;
      }

      if (!instance.source_id) continue;

      if (instance.source_type === "TASK") {
        const task = taskMap[instance.source_id];
        if (!task) continue;
        const label = task.name || "Untitled task";
        const detail = formatTimeRange(start, end);
        const dateLabel = formatDate(start);
        const searchableText = [label, detail, dateLabel, "task"]
          .join(" ")
          .toLowerCase();
        items.push({
          instance,
          label,
          type: "task",
          detail,
          dateLabel,
          start,
          searchableText,
        });
      } else if (instance.source_type === "PROJECT") {
        const project = projectMap[instance.source_id];
        if (!project) continue;
        const label = project.name || "Untitled project";
        const detail = formatTimeRange(start, end);
        const dateLabel = formatDate(start);
        const searchableText = [label, detail, dateLabel, "project"]
          .join(" ")
          .toLowerCase();
        items.push({
          instance,
          label,
          type: "project",
          detail,
          dateLabel,
          start,
          searchableText,
        });
      }
    }

    return items.sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [instances, projectMap, taskMap]);

  const filteredItems = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return searchableItems;
    return searchableItems.filter(item => item.searchableText.includes(trimmed));
  }, [query, searchableItems]);

  const showEmptyState = filteredItems.length === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-[var(--surface-elevated)] border-t border-white/10 p-0 text-[var(--text-primary)]"
      >
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="text-lg font-semibold">Search day schedule</SheetTitle>
          <SheetDescription className="text-sm text-[var(--text-secondary)]">
            Find a scheduled task or project and jump straight to it.
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
            <Input
              ref={inputRef}
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search by title or time"
              className="border-white/15 bg-white/5 pl-10 text-sm text-white placeholder:text-white/40"
              aria-label="Search scheduled items"
            />
          </div>
        </div>
        <ScrollArea className="max-h-[60vh] px-4 pb-6">
          <div className="flex flex-col gap-2 pb-2">
            {filteredItems.map(item => (
              <button
                key={item.instance.id}
                type="button"
                onClick={() =>
                  onSelectResult({
                    instanceId: item.instance.id,
                    date: item.start,
                  })
                }
                className="group flex w-full items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-white transition hover:border-white/20 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{item.label}</span>
                    <span
                      className={cn(
                        "flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] text-white/70",
                        item.type === "project" && "border-blue-400/30 text-blue-100",
                        item.type === "task" && "border-emerald-400/30 text-emerald-100"
                      )}
                    >
                      <Sparkles className="h-3 w-3" />
                      {item.type}
                    </span>
                  </div>
                  <div className="mt-1 text-[12px] text-white/60">
                    {item.detail}
                  </div>
                </div>
                <div className="flex flex-col items-end text-right text-[12px] text-white/60">
                  <span className="flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {item.dateLabel}
                  </span>
                </div>
              </button>
            ))}
          </div>
          {showEmptyState && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-white/5 px-6 py-10 text-center text-sm text-white/65">
              <Sparkles className="h-6 w-6 text-white/50" />
              <div className="space-y-1">
                <p className="font-medium text-white/80">No matching schedule items</p>
                <p className="text-xs text-white/60">
                  {query.trim()
                    ? "Try a different keyword or check another day."
                    : "Nothing is scheduled for this day yet."}
                </p>
              </div>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function isValidDate(value: Date) {
  return Number.isFinite(value.getTime());
}

function formatTimeRange(start: Date, end: Date) {
  try {
    const formatter = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${formatter.format(start)} – ${formatter.format(end)}`;
  } catch (error) {
    console.warn("Unable to format time range", error);
    return `${start.toLocaleTimeString()} – ${end.toLocaleTimeString()}`;
  }
}

function formatDate(date: Date) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(date);
  } catch (error) {
    console.warn("Unable to format date label", error);
    return date.toLocaleDateString();
  }
}

