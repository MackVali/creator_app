"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";
import type { ScheduleBlockLocalNotificationInstance } from "@/lib/notifications/scheduleBlockLocalNotifications";
import { addDaysInTimeZone, startOfDayInTimeZone } from "@/lib/scheduler/timezone";

const CREATOR_WIDGET_PLUGIN_NAME = "CreatorWidget";

export type CreatorScheduleWidgetStatus =
  | "scheduled"
  | "completed"
  | "missed"
  | "unscheduled";

export type CreatorScheduleWidgetEvent = {
  id: string;
  title: string;
  startLabel: string;
  endLabel: string;
  sourceType: string;
  icon?: string | null;
  status: CreatorScheduleWidgetStatus;
};

export type CreatorScheduleWidgetPayload = {
  generatedAt: string;
  dateLabel: string;
  counts: {
    scheduled: number;
    completed: number;
    missed: number;
  };
  events: CreatorScheduleWidgetEvent[];
};

type CreatorWidgetPlugin = {
  writeSchedulePayload(options: { payload: string }): Promise<void>;
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

function canUseCreatorWidgetPlugin() {
  return (
    typeof window !== "undefined" &&
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === "ios" &&
    Capacitor.isPluginAvailable(CREATOR_WIDGET_PLUGIN_NAME)
  );
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

function readTitle(instance: ScheduleBlockLocalNotificationInstance) {
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
  instance: ScheduleBlockLocalNotificationInstance,
  dayStart: Date,
  dayEnd: Date
) {
  const startMs = instance.start_utc ? Date.parse(instance.start_utc) : NaN;
  const endMs = instance.end_utc ? Date.parse(instance.end_utc) : NaN;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;

  return startMs < dayEnd.getTime() && endMs > dayStart.getTime();
}

function toWidgetEvent(
  instance: ScheduleBlockLocalNotificationInstance,
  timeZone: string
): CreatorScheduleWidgetEvent {
  return {
    id: instance.id,
    title: readTitle(instance),
    startLabel: formatTimeLabel(instance.start_utc, timeZone),
    endLabel: formatTimeLabel(instance.end_utc, timeZone),
    sourceType: formatSourceType(instance.source_type),
    icon: instance.skillIcon?.trim() || null,
    status: readStatus(instance.status),
  };
}

export function buildScheduleWidgetPayload(
  instances: ScheduleBlockLocalNotificationInstance[],
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

  const upcomingEvents = instances
    .filter((instance) => {
      if (readStatus(instance.status) !== "scheduled") return false;
      const startMs = instance.start_utc ? Date.parse(instance.start_utc) : NaN;
      return Number.isFinite(startMs) && startMs >= now.getTime();
    })
    .sort((left, right) => {
      const leftMs = left.start_utc ? Date.parse(left.start_utc) : 0;
      const rightMs = right.start_utc ? Date.parse(right.start_utc) : 0;
      return leftMs - rightMs;
    })
    .slice(0, 6)
    .map((instance) => toWidgetEvent(instance, timeZone));

  return {
    generatedAt: now.toISOString(),
    dateLabel: formatDateLabel(date, timeZone),
    counts,
    events: upcomingEvents,
  };
}

export async function syncScheduleWidgetPayload(
  instances: ScheduleBlockLocalNotificationInstance[],
  options: BuildScheduleWidgetPayloadOptions = {}
): Promise<{ ok: true; payload: CreatorScheduleWidgetPayload } | { ok: false; reason: string }> {
  const payload = buildScheduleWidgetPayload(instances, options);

  if (!canUseCreatorWidgetPlugin()) {
    return { ok: false, reason: "plugin_unavailable" };
  }

  await CreatorWidget.writeSchedulePayload({
    payload: JSON.stringify(payload),
  });

  return { ok: true, payload };
}

export function scheduleWidgetStatusLabel(status: CreatorScheduleWidgetStatus) {
  return STATUS_LABELS[status];
}
