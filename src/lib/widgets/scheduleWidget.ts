"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";
import { addDaysInTimeZone, startOfDayInTimeZone } from "@/lib/scheduler/timezone";

const CREATOR_WIDGET_PLUGIN_NAME = "CreatorWidget";
const CREATOR_WIDGET_SYNC_LOG = "[CREATOR_WIDGET_SYNC]";

export type CreatorScheduleWidgetStatus =
  | "scheduled"
  | "completed"
  | "missed"
  | "unscheduled";

export type CreatorScheduleWidgetEvent = {
  id: string;
  title: string;
  startAt: string | null;
  endAt: string | null;
  startLabel: string;
  endLabel: string;
  sourceType: string;
  icon?: string | null;
  status: CreatorScheduleWidgetStatus;
  timeBlockId?: string | null;
  dayTypeTimeBlockId?: string | null;
  windowId?: string | null;
};

export type CreatorScheduleWidgetTimeBlock = {
  id: string;
  title: string;
  name: string;
  startAt: string;
  endAt: string;
  startLabel: string;
  endLabel: string;
  kind?: string | null;
  window_kind?: string | null;
  timeBlockId?: string | null;
  dayTypeTimeBlockId?: string | null;
  windowId?: string | null;
};

export type CreatorScheduleWidgetPayload = {
  generatedAt: string;
  dateLabel: string;
  currentTimeZone: string;
  counts: {
    scheduled: number;
    completed: number;
    missed: number;
  };
  timeBlocks: CreatorScheduleWidgetTimeBlock[];
  events: CreatorScheduleWidgetEvent[];
};

export type CreatorScheduleWidgetSourceInstance = {
  id: string;
  event_name: string | null;
  project_name?: string | null;
  skillIcon?: string | null;
  source_type: string;
  source_id: string | null;
  start_utc: string | null;
  end_utc: string | null;
  status: string | null;
  time_block_id?: string | null;
  day_type_time_block_id?: string | null;
  window_id?: string | null;
};

export type CreatorScheduleWidgetSourceTimeBlock = {
  id: string;
  label?: string | null;
  title?: string | null;
  name?: string | null;
  kind?: string | null;
  window_kind?: string | null;
  start_utc: string | null;
  end_utc: string | null;
  time_block_id?: string | null;
  day_type_time_block_id?: string | null;
  window_id?: string | null;
};

type CreatorWidgetPlugin = {
  writeSchedulePayload(options: { payload: string }): Promise<{ ok?: boolean }>;
  readSchedulePayload(): Promise<{
    ok?: boolean;
    exists?: boolean;
    byteCount?: number;
    payload?: string;
  }>;
};

const CreatorWidget = registerPlugin<CreatorWidgetPlugin>(
  CREATOR_WIDGET_PLUGIN_NAME
);

type BuildScheduleWidgetPayloadOptions = {
  timeZone?: string | null;
  now?: Date;
  date?: Date;
};

const STATUS_LABELS: Record<CreatorScheduleWidgetStatus, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  missed: "Missed",
  unscheduled: "Unscheduled",
};

function getCreatorWidgetPluginAvailability() {
  const isBrowser = typeof window !== "undefined";
  const isNative = isBrowser && Capacitor.isNativePlatform();
  const platform = isBrowser ? Capacitor.getPlatform() : "server";
  const isIos = platform === "ios";
  const pluginAvailable =
    isBrowser && Capacitor.isPluginAvailable(CREATOR_WIDGET_PLUGIN_NAME);

  return {
    isBrowser,
    isNative,
    platform,
    isIos,
    pluginAvailable,
    canUse: isBrowser && isNative && isIos && pluginAvailable,
  };
}

function readStatus(
  status: string | null | undefined
): CreatorScheduleWidgetStatus {
  const normalized = status?.trim().toLowerCase();
  if (
    normalized === "scheduled" ||
    normalized === "completed" ||
    normalized === "missed"
  ) {
    return normalized;
  }

  return "unscheduled";
}

function readTitle(instance: CreatorScheduleWidgetSourceInstance) {
  return (
    instance.event_name?.trim() ||
    instance.project_name?.trim() ||
    "Scheduled Event"
  );
}

function formatSourceType(sourceType: string | null | undefined) {
  const normalized = sourceType?.trim().toLowerCase();
  if (!normalized) return "Event";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatDateLabel(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(date);
}

function formatTimeLabel(value: string | null | undefined, timeZone: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  })
    .format(date)
    .replace(/\s/g, "");
}

function instanceOverlapsDay(
  instance: CreatorScheduleWidgetSourceInstance,
  dayStart: Date,
  dayEnd: Date
) {
  const startMs = instance.start_utc ? Date.parse(instance.start_utc) : NaN;
  const endMs = instance.end_utc ? Date.parse(instance.end_utc) : NaN;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;

  return startMs < dayEnd.getTime() && endMs > dayStart.getTime();
}

function toWidgetEvent(
  instance: CreatorScheduleWidgetSourceInstance,
  timeZone: string
): CreatorScheduleWidgetEvent {
  return {
    id: instance.id,
    title: readTitle(instance),
    startAt: instance.start_utc,
    endAt: instance.end_utc,
    startLabel: formatTimeLabel(instance.start_utc, timeZone),
    endLabel: formatTimeLabel(instance.end_utc, timeZone),
    sourceType: formatSourceType(instance.source_type),
    icon: instance.skillIcon?.trim() || null,
    status: readStatus(instance.status),
    timeBlockId: instance.time_block_id ?? null,
    dayTypeTimeBlockId: instance.day_type_time_block_id ?? null,
    windowId: instance.window_id ?? null,
  };
}

function timeBlockOverlapsDay(
  timeBlock: CreatorScheduleWidgetSourceTimeBlock,
  dayStart: Date,
  dayEnd: Date
) {
  const startMs = timeBlock.start_utc ? Date.parse(timeBlock.start_utc) : NaN;
  const endMs = timeBlock.end_utc ? Date.parse(timeBlock.end_utc) : NaN;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;

  return startMs < dayEnd.getTime() && endMs > dayStart.getTime();
}

function readTimeBlockTitle(timeBlock: CreatorScheduleWidgetSourceTimeBlock) {
  return (
    timeBlock.title?.trim() ||
    timeBlock.name?.trim() ||
    timeBlock.label?.trim() ||
    "Time Block"
  );
}

function toWidgetTimeBlock(
  timeBlock: CreatorScheduleWidgetSourceTimeBlock,
  timeZone: string
): CreatorScheduleWidgetTimeBlock | null {
  if (!timeBlock.start_utc || !timeBlock.end_utc) return null;
  const startMs = Date.parse(timeBlock.start_utc);
  const endMs = Date.parse(timeBlock.end_utc);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }

  const title = readTimeBlockTitle(timeBlock);

  return {
    id: timeBlock.id,
    title,
    name: title,
    startAt: timeBlock.start_utc,
    endAt: timeBlock.end_utc,
    startLabel: formatTimeLabel(timeBlock.start_utc, timeZone),
    endLabel: formatTimeLabel(timeBlock.end_utc, timeZone),
    kind: timeBlock.kind ?? timeBlock.window_kind ?? null,
    window_kind: timeBlock.window_kind ?? timeBlock.kind ?? null,
    timeBlockId: timeBlock.time_block_id ?? null,
    dayTypeTimeBlockId: timeBlock.day_type_time_block_id ?? null,
    windowId: timeBlock.window_id ?? null,
  };
}

export function buildScheduleWidgetPayload(
  instances: CreatorScheduleWidgetSourceInstance[],
  timeBlocks: CreatorScheduleWidgetSourceTimeBlock[] = [],
  options: BuildScheduleWidgetPayloadOptions = {}
): CreatorScheduleWidgetPayload {
  const timeZone =
    options.timeZone?.trim() ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC";
  const now = options.now ?? new Date();
  const date = options.date ?? now;
  const dayStart = startOfDayInTimeZone(date, timeZone);
  const dayEnd = addDaysInTimeZone(dayStart, 1, timeZone);
  const todayInstances = instances.filter((instance) =>
    instanceOverlapsDay(instance, dayStart, dayEnd)
  );
  const todayTimeBlocks = timeBlocks
    .filter((timeBlock) => timeBlockOverlapsDay(timeBlock, dayStart, dayEnd))
    .map((timeBlock) => toWidgetTimeBlock(timeBlock, timeZone))
    .filter(
      (
        timeBlock
      ): timeBlock is CreatorScheduleWidgetTimeBlock => timeBlock !== null
    )
    .sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt));

  const counts = todayInstances.reduce(
    (nextCounts, instance) => {
      const status = readStatus(instance.status);
      if (status === "scheduled") nextCounts.scheduled += 1;
      if (status === "completed") nextCounts.completed += 1;
      if (status === "missed") nextCounts.missed += 1;
      return nextCounts;
    },
    { scheduled: 0, completed: 0, missed: 0 }
  );

  const widgetEvents = todayInstances
    .sort((left, right) => {
      const leftMs = left.start_utc ? Date.parse(left.start_utc) : 0;
      const rightMs = right.start_utc ? Date.parse(right.start_utc) : 0;
      return leftMs - rightMs;
    })
    .map((instance) => toWidgetEvent(instance, timeZone));

  return {
    generatedAt: now.toISOString(),
    dateLabel: formatDateLabel(date, timeZone),
    currentTimeZone: timeZone,
    counts,
    timeBlocks: todayTimeBlocks,
    events: widgetEvents,
  };
}

export async function syncScheduleWidgetPayload(
  instances: CreatorScheduleWidgetSourceInstance[],
  timeBlocks: CreatorScheduleWidgetSourceTimeBlock[] = [],
  options: BuildScheduleWidgetPayloadOptions = {}
): Promise<{ ok: true; payload: CreatorScheduleWidgetPayload } | { ok: false; reason: string }> {
  const payload = buildScheduleWidgetPayload(instances, timeBlocks, options);
  const availability = getCreatorWidgetPluginAvailability();

  console.info(`${CREATOR_WIDGET_SYNC_LOG} js_payload_built`, {
    inputCount: instances.length,
    inputTimeBlockCount: timeBlocks.length,
    writtenTimeBlockCount: payload.timeBlocks.length,
    writtenEventCount: payload.events.length,
    scheduledCount: payload.counts.scheduled,
    completedCount: payload.counts.completed,
    missedCount: payload.counts.missed,
    availability,
  });

  if (!availability.canUse) {
    console.warn(`${CREATOR_WIDGET_SYNC_LOG} native_plugin_unavailable`, {
      availability,
    });
    return { ok: false, reason: "plugin_unavailable" };
  }

  try {
    await CreatorWidget.writeSchedulePayload({
      payload: JSON.stringify(payload),
    });
    console.info(`${CREATOR_WIDGET_SYNC_LOG} native_write_succeeded`, {
      writtenTimeBlockCount: payload.timeBlocks.length,
      writtenEventCount: payload.events.length,
    });

    try {
      const readback = await CreatorWidget.readSchedulePayload();
      console.info(`${CREATOR_WIDGET_SYNC_LOG} native_readback`, {
        exists: readback.exists === true,
        byteCount: readback.byteCount ?? 0,
      });
    } catch (readbackError) {
      console.warn(`${CREATOR_WIDGET_SYNC_LOG} native_readback_failed`, {
        message:
          readbackError instanceof Error
            ? readbackError.message
            : String(readbackError),
      });
    }
  } catch (error) {
    console.warn(`${CREATOR_WIDGET_SYNC_LOG} native_write_failed`, {
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  return { ok: true, payload };
}

export function scheduleWidgetStatusLabel(status: CreatorScheduleWidgetStatus) {
  return STATUS_LABELS[status];
}
