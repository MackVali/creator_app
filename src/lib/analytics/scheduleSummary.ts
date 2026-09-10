import type { AnalyticsScheduleSummary } from "@/types/analytics";

export type ScheduleSummaryType =
  AnalyticsScheduleSummary["byType"][number]["type"];

export type NormalizedObservedScheduleAnalyticsRow = {
  id: string;
  sourceId: string;
  sourceType: ScheduleSummaryType;
  status: "scheduled" | "completed" | null;
  dayStartUtc: string | null;
  windowId: string | null;
  dayTypeTimeBlockId: string | null;
  timeBlockId: string | null;
  startUtc: string;
  endUtc: string;
  durationMinutes: number;
};

export type RawObservedScheduleAnalyticsRow = {
  id: string;
  schedule_instance_id: string | null;
  source_id: string | null;
  source_type: string | null;
  observed_status: string | null;
  scheduled_start_utc: string | null;
  scheduled_end_utc: string | null;
  day_start_utc: string | null;
  day_end_utc: string | null;
  duration_min: number | null;
  time_block_id: string | null;
  day_type_time_block_id: string | null;
  window_id: string | null;
};

const SCHEDULE_SOURCE_TYPE_MAP = {
  PROJECT: "project",
  TASK: "task",
  HABIT: "habit",
  EVENT: "unknown",
} as const;

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizeIsoString(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    if (!value) continue;
    if (parseDate(value)) {
      return value;
    }
  }
  return null;
}

function normalizeScheduleSourceType(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase();
  if (
    normalized === "PROJECT" ||
    normalized === "TASK" ||
    normalized === "HABIT" ||
    normalized === "EVENT"
  ) {
    return normalized;
  }
  return null;
}

export function normalizeScheduleSummaryType(
  value: string | null | undefined
): ScheduleSummaryType {
  const normalized = normalizeScheduleSourceType(value);
  if (!normalized) {
    return "unknown";
  }
  return SCHEDULE_SOURCE_TYPE_MAP[normalized];
}

export function normalizeObservedScheduleStatus(
  value: string | null | undefined
): "scheduled" | "completed" | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized === "completed") {
    return "completed";
  }
  if (normalized === "scheduled") {
    return "scheduled";
  }
  return null;
}

export function deriveObservedDurationMinutes(
  duration: number | null | undefined,
  startUtc: string,
  endUtc: string
) {
  if (
    typeof duration === "number" &&
    Number.isFinite(duration) &&
    duration > 0
  ) {
    return Math.max(1, Math.round(duration));
  }
  const start = parseDate(startUtc);
  const end = parseDate(endUtc);
  if (!start || !end) {
    return 30;
  }
  const diffMs = end.getTime() - start.getTime();
  const minutes = Math.round(diffMs / (60 * 1000));
  return Math.max(1, minutes);
}

export function normalizeObservedScheduleAnalyticsRows(
  rows: RawObservedScheduleAnalyticsRow[]
): NormalizedObservedScheduleAnalyticsRow[] {
  return rows
    .map((row) => {
      const sourceType = normalizeScheduleSummaryType(row.source_type);
      const startUtc = normalizeIsoString(
        row.scheduled_start_utc ?? row.day_start_utc
      );
      const endUtc = normalizeIsoString(
        row.scheduled_end_utc ??
          row.scheduled_start_utc ??
          row.day_end_utc ??
          row.day_start_utc
      );
      if (!sourceType || !startUtc || !endUtc) {
        return null;
      }

      return {
        id:
          typeof row.schedule_instance_id === "string" &&
          row.schedule_instance_id.length > 0
            ? row.schedule_instance_id
            : row.id,
        sourceId: typeof row.source_id === "string" ? row.source_id : "",
        sourceType,
        status: normalizeObservedScheduleStatus(row.observed_status),
        dayStartUtc: normalizeIsoString(row.day_start_utc),
        windowId:
          typeof row.window_id === "string" && row.window_id.length > 0
            ? row.window_id
            : null,
        dayTypeTimeBlockId:
          typeof row.day_type_time_block_id === "string" &&
          row.day_type_time_block_id.length > 0
            ? row.day_type_time_block_id
            : null,
        timeBlockId:
          typeof row.time_block_id === "string" && row.time_block_id.length > 0
            ? row.time_block_id
            : null,
        startUtc,
        endUtc,
        durationMinutes: deriveObservedDurationMinutes(
          row.duration_min,
          startUtc,
          endUtc
        ),
      } satisfies NormalizedObservedScheduleAnalyticsRow;
    })
    .filter((row): row is NormalizedObservedScheduleAnalyticsRow => row !== null);
}

export function classifyObservedScheduleInstance(
  instance: Pick<
    NormalizedObservedScheduleAnalyticsRow,
    "endUtc" | "timeBlockId" | "dayTypeTimeBlockId" | "windowId"
  >,
  now: Date
) {
  const isAssigned = Boolean(
    instance.timeBlockId || instance.dayTypeTimeBlockId || instance.windowId
  );
  const end = parseDate(instance.endUtc);
  const isPast = end ? end.getTime() < now.getTime() : false;

  return {
    isAssigned,
    isPast,
    isFutureOrCurrent: !isPast,
  };
}

export function getEffectiveObservedSummaryStatus(
  instance: NormalizedObservedScheduleAnalyticsRow,
  now: Date
): "completed" | "scheduled" | "missed" | null {
  if (instance.status === "completed") {
    return "completed";
  }

  if (instance.status !== "scheduled") {
    return null;
  }

  const end = parseDate(instance.endUtc);
  const start = parseDate(instance.startUtc);
  const comparisonDate = end ?? start;

  if (comparisonDate && comparisonDate.getTime() < now.getTime()) {
    return "missed";
  }

  return "scheduled";
}

export function buildScheduleSummary(
  instances: NormalizedObservedScheduleAnalyticsRow[],
  now: Date
): AnalyticsScheduleSummary {
  const byTypeMap = new Map<
    ScheduleSummaryType,
    AnalyticsScheduleSummary["byType"][number]
  >(
    ["project", "task", "habit", "unknown"].map((type) => [
      type as ScheduleSummaryType,
      {
        type: type as ScheduleSummaryType,
        planned: 0,
        completed: 0,
        missed: 0,
        minutes: 0,
      },
    ])
  );

  let completedEvents = 0;
  let scheduledEvents = 0;
  let missedEvents = 0;
  let completedMinutes = 0;
  let missedMinutes = 0;
  let pastEvents = 0;
  let completedPastEvents = 0;
  let upcomingScheduledEvents = 0;

  for (const instance of instances) {
    const bucket = byTypeMap.get(instance.sourceType);
    const effectiveStatus = getEffectiveObservedSummaryStatus(instance, now);
    if (!bucket || !effectiveStatus) {
      continue;
    }

    const classification = classifyObservedScheduleInstance(instance, now);

    if (effectiveStatus === "completed") {
      completedEvents += 1;
      completedMinutes += instance.durationMinutes;
      bucket.completed += 1;
      bucket.planned += 1;
      bucket.minutes += instance.durationMinutes;
      if (classification.isAssigned) {
        if (classification.isPast) {
          pastEvents += 1;
          completedPastEvents += 1;
        }
      }
      continue;
    }

    if (effectiveStatus === "missed") {
      missedEvents += 1;
      missedMinutes += instance.durationMinutes;
      bucket.missed += 1;
      bucket.planned += 1;
      if (classification.isAssigned && classification.isPast) {
        pastEvents += 1;
      }
      continue;
    }

    if (effectiveStatus === "scheduled") {
      scheduledEvents += 1;
      bucket.planned += 1;
      if (classification.isAssigned) {
        if (classification.isPast) {
          pastEvents += 1;
        } else {
          upcomingScheduledEvents += 1;
        }
      }
      continue;
    }
  }

  const plannedEvents = completedEvents + scheduledEvents + missedEvents;
  const assignedExecutionRate =
    pastEvents > 0
      ? Math.round((completedPastEvents / pastEvents) * 100)
      : 0;

  return {
    plannedEvents,
    completedEvents,
    missedEvents,
    scheduledEvents,
    executionRate:
      plannedEvents > 0
        ? Math.round((completedEvents / plannedEvents) * 100)
        : 0,
    pastEvents,
    completedPastEvents,
    upcomingScheduledEvents,
    assignedExecutionRate,
    missedRate:
      plannedEvents > 0 ? Math.round((missedEvents / plannedEvents) * 100) : 0,
    completedMinutes,
    missedMinutes,
    byType: Array.from(byTypeMap.values()),
  };
}
