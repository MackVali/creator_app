"use client";

import { useMemo, type ReactNode } from "react";
import { ProjectCard } from "@/components/ProjectCard";
import { DayTimeline } from "./DayTimeline";

export interface FocusTimelineEntry {
  id: string;
  title: string;
  start: Date;
  end: Date;
  completedAt?: string | null;
  completed?: boolean;
  isPending?: boolean;
}

interface FocusTimelineProps {
  entries?: FocusTimelineEntry[];
  onComplete?: (id: string) => void;
  onUndo?: (id: string) => void;
  children?: ReactNode;
}

export function FocusTimeline({
  entries = [],
  onComplete,
  onUndo,
  children,
}: FocusTimelineProps) {
  const now = new Date();
  const startHour = now.getHours() + now.getMinutes() / 60;
  const endHour = startHour + 3;
  const pxPerMin = 2;

  const sortedEntries = useMemo(() => {
    return [...entries].sort(
      (a, b) => a.start.getTime() - b.start.getTime()
    );
  }, [entries]);

  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }),
    []
  );

  return (
    <div className="-ml-4 -mr-2 sm:mx-0">
      <DayTimeline
        startHour={startHour}
        endHour={endHour}
        pxPerMin={pxPerMin}
        date={now}
      >
        {sortedEntries.map(entry => {
          const startOffsetMin =
            (entry.start.getHours() * 60 + entry.start.getMinutes()) -
            startHour * 60;
          const durationMinutes = Math.max(
            1,
            (entry.end.getTime() - entry.start.getTime()) / 60000
          );
          const top = Math.max(0, startOffsetMin * pxPerMin);
          const height = Math.max(durationMinutes * pxPerMin, 60);
          const timeRange = `${timeFormatter.format(entry.start)} – ${timeFormatter.format(entry.end)}`;

          return (
            <div
              key={entry.id}
              className="absolute left-16 right-3 flex items-stretch"
              style={{ top, height }}
            >
              <ProjectCard
                id={entry.id}
                title={entry.title}
                timeRange={timeRange}
                completedAt={entry.completedAt}
                completed={entry.completed}
                disabled={entry.isPending}
                className="h-full w-full"
                style={{ height: "100%" }}
                onComplete={
                  onComplete ? () => onComplete(entry.id) : undefined
                }
                onUndo={onUndo ? () => onUndo(entry.id) : undefined}
              />
            </div>
          );
        })}
        {children}
      </DayTimeline>
    </div>
  );
}
