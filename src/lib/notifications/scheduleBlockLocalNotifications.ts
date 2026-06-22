import { Capacitor } from "@capacitor/core";
import type { PermissionState } from "@capacitor/core";
import {
  LocalNotifications,
  type LocalNotificationSchema,
} from "@capacitor/local-notifications";

const NOTIFICATION_TYPE = "schedule_block_brief";
const FALLBACK_BLOCK_LABEL = "Scheduled block";
const FALLBACK_EVENT_NAME = "Scheduled event";
const REMINDER_LEAD_MS = 5 * 60 * 1000;
const LOOKAHEAD_MS = 48 * 60 * 60 * 1000;
const MAX_NOTIFICATIONS = 64;
const MAX_NOTIFICATION_ID = 2_147_483_647;

const SKIPPED_STATUSES = new Set(["canceled", "cancelled", "missed", "completed"]);

export type ScheduleBlockLocalNotificationInstance = {
  id: string;
  event_name: string | null;
  project_name: string | null;
  source_type: string;
  source_id: string;
  start_utc: string | null;
  end_utc: string | null;
  status: string | null;
  time_block_id: string | null;
  day_type_time_block_id: string | null;
  window_id: string | null;
};

export type ScheduleBlockLocalNotificationOptions = {
  blockLabelByKey?: Map<string, string> | Record<string, string | null | undefined>;
  now?: Date;
};

export type ScheduleBlockLocalNotificationResult =
  | {
      ok: true;
      scheduledCount: number;
      canceledCount: number;
      permission: PermissionState;
    }
  | {
      ok: false;
      reason:
        | "not_browser"
        | "not_native_platform"
        | "plugin_unavailable"
        | "permission_check_failed"
        | "pending_lookup_failed"
        | "cancel_failed"
        | "schedule_failed";
    };

type GroupedBlock = {
  blockKey: string;
  anchor: ScheduleBlockLocalNotificationInstance;
  anchorStartMs: number;
  instances: ScheduleBlockLocalNotificationInstance[];
};

export async function syncScheduleBlockLocalNotifications(
  instances: ScheduleBlockLocalNotificationInstance[],
  options: ScheduleBlockLocalNotificationOptions = {},
): Promise<ScheduleBlockLocalNotificationResult> {
  if (typeof window === "undefined") {
    return { ok: false, reason: "not_browser" };
  }

  if (!Capacitor.isNativePlatform()) {
    return { ok: false, reason: "not_native_platform" };
  }

  if (!Capacitor.isPluginAvailable("LocalNotifications")) {
    return { ok: false, reason: "plugin_unavailable" };
  }

  const permission = await resolveNotificationPermission();
  if (!permission) {
    return { ok: false, reason: "permission_check_failed" };
  }

  if (permission !== "granted") {
    return {
      ok: true,
      scheduledCount: 0,
      canceledCount: 0,
      permission,
    };
  }

  const pending = await LocalNotifications.getPending().catch(() => null);
  if (!pending) {
    return { ok: false, reason: "pending_lookup_failed" };
  }

  const staleNotifications = pending.notifications
    .filter((notification) => isScheduleBlockBriefExtra(notification.extra))
    .map((notification) => ({ id: notification.id }));

  if (staleNotifications.length > 0) {
    try {
      await LocalNotifications.cancel({ notifications: staleNotifications });
    } catch {
      return { ok: false, reason: "cancel_failed" };
    }
  }

  const notifications = buildScheduleBlockNotifications(instances, options);

  if (notifications.length > 0) {
    try {
      await LocalNotifications.schedule({ notifications });
    } catch {
      return { ok: false, reason: "schedule_failed" };
    }
  }

  return {
    ok: true,
    scheduledCount: notifications.length,
    canceledCount: staleNotifications.length,
    permission,
  };
}

async function resolveNotificationPermission(): Promise<PermissionState | null> {
  try {
    const checked = await LocalNotifications.checkPermissions();
    let permission = checked.display;

    if (permission === "prompt" || permission === "prompt-with-rationale") {
      const requested = await LocalNotifications.requestPermissions();
      permission = requested.display;
    }

    return permission;
  } catch {
    return null;
  }
}

function buildScheduleBlockNotifications(
  instances: ScheduleBlockLocalNotificationInstance[],
  options: ScheduleBlockLocalNotificationOptions,
): LocalNotificationSchema[] {
  const nowMs = options.now?.getTime() ?? Date.now();
  const horizonMs = nowMs + LOOKAHEAD_MS;

  return Array.from(groupUpcomingInstances(instances, nowMs, horizonMs).values())
    .sort((a, b) => a.anchorStartMs - b.anchorStartMs)
    .slice(0, MAX_NOTIFICATIONS)
    .map((group) => {
      const label = resolveBlockLabel(group.blockKey, options.blockLabelByKey);
      const startUtc = new Date(group.anchorStartMs).toISOString();

      return {
        id: stableNotificationId(group.blockKey, startUtc),
        title: `${label ?? FALLBACK_BLOCK_LABEL} starts in 5 min`,
        body: buildNotificationBody(group.instances),
        schedule: {
          at: new Date(group.anchorStartMs - REMINDER_LEAD_MS),
          allowWhileIdle: true,
        },
        extra: {
          type: NOTIFICATION_TYPE,
          blockKey: group.blockKey,
          anchorInstanceId: group.anchor.id,
          startUtc,
        },
      };
    });
}

function groupUpcomingInstances(
  instances: ScheduleBlockLocalNotificationInstance[],
  nowMs: number,
  horizonMs: number,
) {
  const groups = new Map<string, GroupedBlock>();

  for (const instance of instances) {
    if (shouldSkipInstance(instance)) continue;

    const startMs = parseUtcMs(instance.start_utc);
    if (startMs === null) continue;
    if (startMs > horizonMs) continue;

    const notificationMs = startMs - REMINDER_LEAD_MS;
    if (notificationMs <= nowMs) continue;

    const blockKey = blockKeyForInstance(instance);
    const occurrenceKey = blockOccurrenceKeyForInstance(instance, startMs);
    const existing = groups.get(occurrenceKey);

    if (!existing) {
      groups.set(occurrenceKey, {
        blockKey,
        anchor: instance,
        anchorStartMs: startMs,
        instances: [instance],
      });
      continue;
    }

    existing.instances.push(instance);

    if (startMs < existing.anchorStartMs) {
      existing.anchor = instance;
      existing.anchorStartMs = startMs;
    }
  }

  for (const group of groups.values()) {
    group.instances.sort((a, b) => {
      const aStart = parseUtcMs(a.start_utc) ?? Number.POSITIVE_INFINITY;
      const bStart = parseUtcMs(b.start_utc) ?? Number.POSITIVE_INFINITY;
      return aStart - bStart;
    });
  }

  return groups;
}

function shouldSkipInstance(instance: ScheduleBlockLocalNotificationInstance) {
  return SKIPPED_STATUSES.has(instance.status?.trim().toLowerCase() ?? "");
}

function parseUtcMs(value: string | null) {
  if (!value) return null;

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function blockKeyForInstance(instance: ScheduleBlockLocalNotificationInstance) {
  return (
    pickText(instance.time_block_id) ??
    pickText(instance.day_type_time_block_id) ??
    pickText(instance.window_id) ??
    instance.id
  );
}

function blockOccurrenceKeyForInstance(
  instance: ScheduleBlockLocalNotificationInstance,
  startMs: number,
) {
  const occurrenceDate = new Date(startMs).toISOString().slice(0, 10);
  return `${blockKeyForInstance(instance)}:${occurrenceDate}`;
}

function resolveBlockLabel(
  blockKey: string,
  lookup: ScheduleBlockLocalNotificationOptions["blockLabelByKey"],
) {
  if (!lookup) return null;

  const value =
    lookup instanceof Map ? lookup.get(blockKey) : lookup[blockKey];

  return pickText(value);
}

function buildNotificationBody(
  instances: ScheduleBlockLocalNotificationInstance[],
) {
  const names = instances.map(eventName);
  const count = names.length;

  if (count === 1) {
    return `1 scheduled: ${names[0]}`;
  }

  if (count <= 3) {
    return `${count} scheduled: ${names.join(" · ")}`;
  }

  return `${count} scheduled: ${names[0]} · ${names[1]} · +${count - 2} more`;
}

function eventName(instance: ScheduleBlockLocalNotificationInstance) {
  return (
    pickText(instance.event_name) ??
    pickText(instance.project_name) ??
    FALLBACK_EVENT_NAME
  );
}

function pickText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function stableNotificationId(blockKey: string, startUtc: string) {
  const input = `${blockKey}:${startUtc}`;
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0) % MAX_NOTIFICATION_ID || 1;
}

function isScheduleBlockBriefExtra(extra: unknown) {
  if (!extra || typeof extra !== "object") return false;

  return (extra as { type?: unknown }).type === NOTIFICATION_TYPE;
}
