import { ENERGY } from "./config";
import type { RepoWindow } from "./repo";
import type { ScheduleInstance } from "@/lib/scheduler/instanceRepo";
import type { ProjectItem } from "@/lib/scheduler/projects";
import {
  addDaysInTimeZone,
  getDateTimeParts,
  makeDateInTimeZone,
  makeZonedDate,
  normalizeTimeZone,
  startOfDayInTimeZone,
} from "@/lib/scheduler/timezone";
import { formatLocalDateKey } from "@/lib/time/tz";
import type { FlameLevel } from "@/components/FlameEmber";
import {
  describeEmptyWindowReport,
  energyIndexFromLabel,
  formatDurationLabel,
  SchedulerRunFailure,
  TIME_FORMATTER,
} from "./windowReports";

export type LocalDayRange = {
  dayStart: Date;
  dayEnd: Date;
};

export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

export function getLocalDayRange(date: Date, timeZone: string): LocalDayRange {
  const dayParts = getDateTimeParts(date, timeZone);
  const dayStart = makeZonedDate(
    {
      year: dayParts.year,
      month: dayParts.month,
      day: dayParts.day,
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone
  );
  const dayEnd = makeZonedDate(
    {
      year: dayParts.year,
      month: dayParts.month,
      day: dayParts.day + 1,
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone
  );
  return { dayStart, dayEnd };
}

export function clipSegmentToDay(
  start: Date,
  end: Date,
  dayStart: Date,
  dayEnd: Date
): { segStart: Date; segEnd: Date } | null {
  if (!isValidDate(start) || !isValidDate(end)) return null;
  const clippedStartMs = Math.max(start.getTime(), dayStart.getTime());
  const clippedEndMs = Math.min(end.getTime(), dayEnd.getTime());
  if (clippedEndMs <= clippedStartMs) return null;
  return {
    segStart: new Date(clippedStartMs),
    segEnd: new Date(clippedEndMs),
  };
}

export function resolveWindowBoundsForDate(
  window: RepoWindow,
  date: Date,
  timeZone: string
) {
  const zone = normalizeTimeZone(timeZone);
  const dayParts = getDateTimeParts(date, zone);
  const dayStart = makeDateInTimeZone(
    {
      year: dayParts.year,
      month: dayParts.month,
      day: dayParts.day,
      hour: 0,
      minute: 0,
    },
    zone
  );
  const prevDayStart = new Date(dayStart);
  prevDayStart.setUTCDate(prevDayStart.getUTCDate() - 1);
  const startAnchor = window.fromPrevDay ? prevDayStart : dayStart;
  const endAnchor = window.fromPrevDay ? prevDayStart : dayStart;

  const [startHour = 0, startMinute = 0] = window.start_local
    .split(":")
    .map(Number);
  const [endHour = 0, endMinute = 0] = window.end_local
    .split(":")
    .map(Number);

  const startParts = getDateTimeParts(startAnchor, zone);
  const endParts = getDateTimeParts(endAnchor, zone);

  const start = makeZonedDate(
    {
      year: startParts.year,
      month: startParts.month,
      day: startParts.day,
      hour: startHour,
      minute: startMinute,
    },
    zone
  );

  let end = makeZonedDate(
    {
      year: endParts.year,
      month: endParts.month,
      day: endParts.day,
      hour: endHour,
      minute: endMinute,
    },
    zone
  );

  if (!window.fromPrevDay && end.getTime() <= start.getTime()) {
    end = addDaysInTimeZone(end, 1, zone);
  }

  if (window.fromPrevDay && end.getTime() <= start.getTime()) {
    end = addDaysInTimeZone(end, 1, zone);
  }

  return { start, end };
}

type SchedulerTimelineEntry =
  | {
      type: "PROJECT";
      instanceId: string;
      projectId: string;
      windowId: string | null;
      decision: "kept" | "new" | "rescheduled" | "skipped";
      startUTC: string;
      endUTC: string;
      durationMin: number | null;
      energyResolved: string | null;
      scheduledDayOffset: number | null;
      availableStartLocal: string | null;
      windowStartLocal: string | null;
      locked: boolean;
    }
  | {
      type: "HABIT";
      habitId: string;
      habitName: string | null;
      windowId: string | null;
      decision: "kept" | "new" | "rescheduled" | "skipped";
      startUTC: string;
      endUTC: string;
      durationMin: number | null;
      energyResolved: string | null;
      scheduledDayOffset: number | null;
      availableStartLocal: string | null;
      windowStartLocal: string | null;
      clipped: boolean;
      practiceContextId?: string | null;
    };

export type SchedulerTimelinePlacement =
  | {
      type: "PROJECT";
      projectId: string;
      projectName: string;
      locked: boolean;
      start: Date;
      end: Date;
      startUtc: Date;
      rawStart: string;
      rawEnd: string;
      durationMinutes: number | null;
      energyLabel: (typeof ENERGY.LIST)[number];
      decision: SchedulerTimelineEntry["decision"];
    }
  | {
      type: "HABIT";
      habitId: string;
      habitName: string;
      start: Date;
      end: Date;
      startUtc: Date;
      rawStart: string;
      rawEnd: string;
      durationMinutes: number | null;
      energyLabel: (typeof ENERGY.LIST)[number];
      decision: SchedulerTimelineEntry["decision"];
      clipped: boolean;
      practiceContextId: string | null;
    };

export type SchedulerDebugState = {
  runAt: string;
  failures: SchedulerRunFailure[];
  placedCount: number;
  placedProjectIds: string[];
  timeline: SchedulerTimelineEntry[];
  error: unknown;
};

const DEFAULT_ENERGY_ID_LOOKUP: Record<string, (typeof ENERGY.LIST)[number]> =
  ENERGY.LIST.reduce((map, label, index) => {
    map[String(index + 1)] = label;
    map[label] = label;
    return map;
  }, {} as Record<string, (typeof ENERGY.LIST)[number]>);

let scheduleEnergyLookupMap: Record<string, (typeof ENERGY.LIST)[number]> = {
  ...DEFAULT_ENERGY_ID_LOOKUP,
};

export function resolveEnergyLevel(
  value?: unknown
): (typeof ENERGY.LIST)[number] | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const direct = scheduleEnergyLookupMap[trimmed];
    if (direct) return direct;
    const upper = trimmed.toUpperCase();
    const normalized = scheduleEnergyLookupMap[upper];
    if (normalized) return normalized;
    return ENERGY.LIST.includes(upper as (typeof ENERGY.LIST)[number])
      ? (upper as (typeof ENERGY.LIST)[number])
      : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const direct = scheduleEnergyLookupMap[String(value)];
    if (direct) return direct;
    return resolveEnergyLevel(String(value));
  }
  if (
    value &&
    typeof value === "object" &&
    "name" in (value as { name?: string | null })
  ) {
    const candidate = (value as { name?: string | null }).name ?? null;
    return resolveEnergyLevel(candidate);
  }
  return null;
}

export function normalizeEnergyLabel(
  level?: string | null
): (typeof ENERGY.LIST)[number] {
  return resolveEnergyLevel(level) ?? "NO";
}

export function updateScheduleEnergyLookup(
  lookup?: Record<string, (typeof ENERGY.LIST)[number]> | null
) {
  scheduleEnergyLookupMap = { ...DEFAULT_ENERGY_ID_LOOKUP };
  if (!lookup) return;
  for (const [key, value] of Object.entries(lookup)) {
    if (!key) continue;
    const normalized = normalizeEnergyLabel(value);
    scheduleEnergyLookupMap[key] = normalized;
    scheduleEnergyLookupMap[normalized] = normalized;
  }
}

export type HabitTimelinePlacement = {
  habitId: string;
  habitName: string;
  habitType: string | null;
  skillId: string | null;
  practiceContextId: string | null;
  currentStreakDays: number;
  instanceId: string | null;
  start: Date;
  end: Date;
  rawStart: string;
  rawEnd: string;
  durationMinutes: number;
  energyLabel: FlameLevel;
  window: RepoWindow;
  truncated: boolean;
};

type WindowReportBase = {
  key: string;
  window: RepoWindow;
  windowLabel: string;
  summary: string;
  details: string[];
  energyLabel: (typeof ENERGY.LIST)[number];
  durationLabel: string;
  rangeLabel: string;
};

export type WindowReportEntry = WindowReportBase & {
  rangeStart: Date;
  rangeEnd: Date;
};

function formatGapRangeLabel(start: Date, end: Date): string {
  return `${TIME_FORMATTER.format(start)} – ${TIME_FORMATTER.format(end)}`;
}

export function computeWindowReportsForDay({
  windows,
  projectInstances,
  unscheduledProjects,
  schedulerFailureByProjectId,
  schedulerDebug,
  schedulerTimelinePlacements,
  habitPlacements,
  currentDate,
  timeZone,
  modelStartHour,
}: {
  windows: RepoWindow[];
  projectInstances: Array<{
    instance: ScheduleInstance;
    project: ProjectItem;
    start: Date;
    end: Date;
    assignedWindow: RepoWindow | null;
  }>;
  unscheduledProjects: ProjectItem[];
  schedulerFailureByProjectId: Record<string, SchedulerRunFailure[]>;
  schedulerDebug: SchedulerDebugState | null;
  schedulerTimelinePlacements: SchedulerTimelinePlacement[];
  habitPlacements: HabitTimelinePlacement[];
  currentDate: Date;
  timeZone: string;
  modelStartHour: number;
}): WindowReportEntry[] {
  if (windows.length === 0) return [];
  const { dayStart, dayEnd } = getLocalDayRange(currentDate, timeZone);
  const safeStartHour = Number.isFinite(modelStartHour) ? modelStartHour : 0;
  const visibleStartMs =
    dayStart.getTime() + safeStartHour * 60 * 60 * 1000;
  const clampedStartMs = Math.min(
    dayEnd.getTime(),
    Math.max(dayStart.getTime(), visibleStartMs)
  );

  const scheduledSegments = [
    ...projectInstances.map(({ start, end }) => ({ start, end })),
    ...habitPlacements.map(({ start, end }) => ({ start, end })),
    ...schedulerTimelinePlacements.map(({ start, end }) => ({ start, end })),
  ]
    .map((segment) => clipSegmentToDay(segment.start, segment.end, dayStart, dayEnd))
    .filter(
      (
        value
      ): value is {
        segStart: Date;
        segEnd: Date;
      } => value !== null
    )
    .map(({ segStart, segEnd }) => ({ start: segStart, end: segEnd }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const gaps: Array<{ start: Date; end: Date }> = [];
  let cursor = new Date(clampedStartMs);
  for (const segment of scheduledSegments) {
    if (segment.start.getTime() > cursor.getTime()) {
      gaps.push({ start: cursor, end: segment.start });
    }
    if (segment.end.getTime() > cursor.getTime()) {
      cursor = new Date(segment.end);
    }
  }
  if (cursor.getTime() < dayEnd.getTime()) {
    gaps.push({ start: cursor, end: dayEnd });
  }

  const windowBounds = windows
    .map((win) => {
      const { start, end } = resolveWindowBoundsForDate(win, currentDate, timeZone);
      if (!isValidDate(start) || !isValidDate(end)) return null;
      if (end.getTime() <= start.getTime()) return null;
      return { window: win, windowStart: start, windowEnd: end };
    })
    .filter(
      (
        entry
      ): entry is { window: RepoWindow; windowStart: Date; windowEnd: Date } =>
        entry !== null
    )
    .sort((a, b) => a.windowStart.getTime() - b.windowStart.getTime());

  const diagnosticsAvailable = Boolean(schedulerDebug);
  const runStartedAt = schedulerDebug ? new Date(schedulerDebug.runAt) : null;
  const reports: WindowReportEntry[] = [];
  for (const entry of windowBounds) {
    const { window, windowStart, windowEnd } = entry;
    const windowLabel = window.label?.trim() || "Untitled window";
    const energyLabel = normalizeEnergyLabel(window.energy);
    const windowEnergyIndex = energyIndexFromLabel(energyLabel);

    for (const gap of gaps) {
      const segmentStartMs = Math.max(gap.start.getTime(), windowStart.getTime());
      const segmentEndMs = Math.min(gap.end.getTime(), windowEnd.getTime());
      if (segmentEndMs <= segmentStartMs) continue;

      const segmentStart = new Date(segmentStartMs);
      const segmentEnd = new Date(segmentEndMs);
      const durationMinutes = Math.max(
        0,
        Math.round((segmentEndMs - segmentStartMs) / 60000)
      );
      if (durationMinutes <= 0) continue;

      const futurePlacements = schedulerTimelinePlacements
        .filter(
          (
            entry
          ): entry is Extract<SchedulerTimelinePlacement, { type: "PROJECT" }> =>
            entry.type === "PROJECT"
        )
        .filter((entry) => entry.start.getTime() >= segmentEnd.getTime())
        .filter((entry) => {
          const entryEnergyIndex = energyIndexFromLabel(entry.energyLabel);
          return entryEnergyIndex !== -1 && entryEnergyIndex <= windowEnergyIndex;
        })
        .map((entry) => ({
          projectId: entry.projectId,
          projectName: entry.projectName,
          start: entry.start,
          durationMinutes: entry.durationMinutes,
          sameDay:
            formatLocalDateKey(entry.start) === formatLocalDateKey(segmentEnd),
          fits:
            typeof entry.durationMinutes === "number" &&
            Number.isFinite(entry.durationMinutes)
              ? entry.durationMinutes <= durationMinutes
              : null,
        }));

      const description = describeEmptyWindowReport({
        windowLabel,
        energyLabel,
        durationMinutes,
        unscheduledProjects,
        schedulerFailureByProjectId,
        diagnosticsAvailable,
        runStartedAt:
          runStartedAt && !Number.isNaN(runStartedAt.getTime())
            ? runStartedAt
            : null,
        windowStart,
        windowEnd,
        futurePlacements,
        segmentStart,
        segmentEnd,
        window,
      });
      reports.push({
        key: `${window.id}-${segmentStart.toISOString()}-${segmentEnd.toISOString()}`,
        window,
        windowLabel,
        summary: description.summary,
        details: description.details,
        energyLabel,
        durationLabel: formatDurationLabel(durationMinutes),
        rangeLabel: formatGapRangeLabel(segmentStart, segmentEnd),
        rangeStart: segmentStart,
        rangeEnd: segmentEnd,
      });
    }
  }
  return reports;
}
