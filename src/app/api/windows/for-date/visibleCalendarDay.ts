import type { WindowLite } from "@/lib/scheduler/repo";
import { getDateTimeParts } from "@/lib/scheduler/timezone";

export type VisibleCalendarWindow = WindowLite & {
  fromPrevSchedulerDay?: boolean;
  sourceWindowId?: string;
};

function formatLocalTime(date: Date, timeZone: string): string {
  const parts = getDateTimeParts(date, timeZone);
  return `${String(parts.hour).padStart(2, "0")}:${String(
    parts.minute
  ).padStart(2, "0")}`;
}

function normalizeVisibleEndLocal(
  date: Date,
  visibleEnd: Date,
  timeZone: string
): string {
  if (date.getTime() === visibleEnd.getTime()) {
    return "00:00";
  }
  return formatLocalTime(date, timeZone);
}

function makeDisplayId(
  window: WindowLite,
  dayKey: string,
  clippedStartMs: number,
  clippedEndMs: number,
  index: number
): string {
  return `${window.id}::visible-${dayKey}-${clippedStartMs}-${clippedEndMs}-${index}`;
}

export function visibleCalendarWindowsForDay(params: {
  dayKey: string;
  timeZone: string;
  visibleStart: Date;
  visibleEnd: Date;
  previousSchedulerWindows: WindowLite[];
  currentSchedulerWindows: WindowLite[];
}): VisibleCalendarWindow[] {
  const {
    dayKey,
    timeZone,
    visibleStart,
    visibleEnd,
    previousSchedulerWindows,
    currentSchedulerWindows,
  } = params;

  const candidates = [
    ...previousSchedulerWindows.map((window) => ({
      window,
      fromPrevSchedulerDay: true,
    })),
    ...currentSchedulerWindows.map((window) => ({
      window,
      fromPrevSchedulerDay: false,
    })),
  ];

  const visibleStartMs = visibleStart.getTime();
  const visibleEndMs = visibleEnd.getTime();
  const clipped = candidates
    .map(({ window, fromPrevSchedulerDay }, index) => {
      const startMs = window.dayTypeStartUtcMs;
      const endMs = window.dayTypeEndUtcMs;
      if (
        typeof startMs !== "number" ||
        typeof endMs !== "number" ||
        !Number.isFinite(startMs) ||
        !Number.isFinite(endMs)
      ) {
        return null;
      }

      const clippedStartMs = Math.max(startMs, visibleStartMs);
      const clippedEndMs = Math.min(endMs, visibleEndMs);
      if (clippedEndMs <= clippedStartMs) {
        return null;
      }

      const clippedStart = new Date(clippedStartMs);
      const clippedEnd = new Date(clippedEndMs);
      const id =
        clippedStartMs !== startMs || clippedEndMs !== endMs
          ? makeDisplayId(window, dayKey, clippedStartMs, clippedEndMs, index)
          : window.id;

      return {
        ...window,
        id,
        sourceWindowId: id === window.id ? undefined : window.id,
        start_local: formatLocalTime(clippedStart, timeZone),
        end_local: normalizeVisibleEndLocal(clippedEnd, visibleEnd, timeZone),
        dayTypeStartUtcMs: clippedStartMs,
        dayTypeEndUtcMs: clippedEndMs,
        fromPrevDay: false,
        fromPrevSchedulerDay,
      } satisfies VisibleCalendarWindow;
    })
    .filter((window): window is VisibleCalendarWindow => window !== null);

  const seen = new Map<string, number>();
  return clipped
    .map((window, index) => {
      const count = seen.get(window.id) ?? 0;
      seen.set(window.id, count + 1);
      if (count === 0) return window;
      return {
        ...window,
        id: makeDisplayId(
          window,
          dayKey,
          window.dayTypeStartUtcMs ?? 0,
          window.dayTypeEndUtcMs ?? 0,
          index
        ),
        sourceWindowId: window.sourceWindowId ?? window.id,
      };
    })
    .sort((a, b) => {
      const startDiff = (a.dayTypeStartUtcMs ?? 0) - (b.dayTypeStartUtcMs ?? 0);
      if (startDiff !== 0) return startDiff;
      return a.id.localeCompare(b.id);
    });
}
