import { Capacitor } from "@capacitor/core";
import type { PermissionState } from "@capacitor/core";
import {
  LocalNotifications,
  type LocalNotificationSchema,
  type PendingLocalNotificationSchema,
} from "@capacitor/local-notifications";

export const SCHEDULE_BLOCK_BRIEF_NOTIFICATION_TYPE = "schedule_block_brief";

const FALLBACK_TIME_BLOCK_LABEL = "Time Block";
const FALLBACK_EVENT_NAME = "Scheduled Event";
const REMINDER_LEAD_MS = 5 * 60 * 1000;
const LOOKAHEAD_MS = 48 * 60 * 60 * 1000;
const MAX_NOTIFICATIONS = 64;
const SCHEDULE_BRIEF_ID_OFFSET = 1_000_000_000;
const SCHEDULE_BRIEF_ID_RANGE = 1_000_000_000;
const SCHEDULE_BRIEF_TEST_NOTIFICATION_ID = 2_147_483_646;

export type ScheduleBlockLocalNotificationInstance = {
  id: string;
  event_name: string | null;
  project_name: string | null;
  skillIcon?: string | null;
  skillName?: string | null;
  source_type: string;
  source_id: string;
  start_utc: string | null;
  end_utc: string | null;
  status: string | null;
  time_block_id: string | null;
  day_type_time_block_id: string | null;
  window_id: string | null;
};

export type ScheduleBlockLocalNotificationTimeBlock = {
  id: string;
  label: string | null;
  kind?: string | null;
  start_utc: string | null;
  end_utc: string | null;
  time_block_id: string | null;
  day_type_time_block_id: string | null;
  window_id: string | null;
};

export type ScheduleBlockLocalNotificationOptions = {
  blockLabelByKey?:
    | Map<string, string>
    | Record<string, string | null | undefined>;
  timeBlocks?: ScheduleBlockLocalNotificationTimeBlock[];
  timeZone?: string | null;
  now?: Date;
};

export type ScheduleBlockLocalNotificationResult =
  | {
      ok: true;
      scheduledCount: number;
      canceledCount: number;
      candidateCount: number;
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

export type ScheduleBlockLocalNotificationPendingSummary = {
  totalCount: number;
  scheduleBriefCount: number;
  scheduleBriefNotifications: PendingLocalNotificationSchema[];
};

export type ScheduleBlockBriefTestNotificationPayload = {
  title: string;
  body: string;
  blockKey: string;
  anchorInstanceId: string;
  startUtc: string;
  blockLabel: string;
  blockEventCount: number;
};

type GroupedBlock = {
  blockKey: string;
  anchor: ScheduleBlockLocalNotificationInstance | null;
  timeBlock: ScheduleBlockLocalNotificationTimeBlock | null;
  blockStartMs: number;
  blockEndMs: number | null;
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
      candidateCount: 0,
      permission,
    };
  }

  const pending = await LocalNotifications.getPending().catch(() => null);
  if (!pending) {
    return { ok: false, reason: "pending_lookup_failed" };
  }

  const staleNotifications = pending.notifications
    .filter((notification) =>
      isProductionScheduleBlockBriefExtra(notification.extra)
    )
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
    candidateCount: countScheduleBlockNotificationCandidates(instances, options),
    permission,
  };
}

export async function listPendingScheduleBlockLocalNotifications(): Promise<ScheduleBlockLocalNotificationPendingSummary | null> {
  if (!canUseLocalNotifications()) return null;

  const pending = await LocalNotifications.getPending();
  const scheduleBriefNotifications = pending.notifications.filter(
    (notification) => isScheduleBlockBriefExtra(notification.extra)
  );

  return {
    totalCount: pending.notifications.length,
    scheduleBriefCount: scheduleBriefNotifications.length,
    scheduleBriefNotifications,
  };
}

export async function cancelPendingScheduleBlockLocalNotifications(): Promise<
  number | null
> {
  const summary = await listPendingScheduleBlockLocalNotifications();
  if (!summary) return null;
  if (summary.scheduleBriefNotifications.length === 0) return 0;

  await LocalNotifications.cancel({
    notifications: summary.scheduleBriefNotifications.map((notification) => ({
      id: notification.id,
    })),
  });

  return summary.scheduleBriefNotifications.length;
}

export async function scheduleScheduleBlockBriefTestNotification(
  payload: ScheduleBlockBriefTestNotificationPayload,
): Promise<void> {
  if (!canUseLocalNotifications()) {
    throw new Error("Local notifications are unavailable.");
  }

  const permission = await resolveNotificationPermission();
  if (permission !== "granted") {
    throw new Error("Local notification permission is not granted.");
  }

  await LocalNotifications.cancel({
    notifications: [{ id: SCHEDULE_BRIEF_TEST_NOTIFICATION_ID }],
  });
  await LocalNotifications.schedule({
    notifications: [
      {
        id: SCHEDULE_BRIEF_TEST_NOTIFICATION_ID,
        title: payload.title,
        body: payload.body,
        schedule: {
          at: new Date(Date.now() + 10_000),
          allowWhileIdle: true,
        },
        sound: "default",
        threadIdentifier: "creator-schedule-briefs",
        extra: {
          type: SCHEDULE_BLOCK_BRIEF_NOTIFICATION_TYPE,
          blockKey: payload.blockKey,
          anchorInstanceId: payload.anchorInstanceId,
          startUtc: payload.startUtc,
          blockLabel: payload.blockLabel,
          blockEventCount: payload.blockEventCount,
          test: true,
        },
      },
    ],
  });
}

function canUseLocalNotifications() {
  return (
    typeof window !== "undefined" &&
    Capacitor.isNativePlatform() &&
    Capacitor.isPluginAvailable("LocalNotifications")
  );
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

  return Array.from(
    groupUpcomingScheduleBlocks(
      instances,
      options.timeBlocks ?? [],
      nowMs,
      horizonMs,
      options.timeZone
    ).values()
  )
    .sort((a, b) => a.blockStartMs - b.blockStartMs)
    .slice(0, MAX_NOTIFICATIONS)
    .map((group) => {
      const label =
        pickText(group.timeBlock?.label) ??
        resolveBlockLabel(group.blockKey, options.blockLabelByKey) ??
        FALLBACK_TIME_BLOCK_LABEL;
      const startUtc = new Date(group.blockStartMs).toISOString();
      const fireAt = new Date(group.blockStartMs - REMINDER_LEAD_MS);
      const anchor = group.anchor;
      const timeBlock = group.timeBlock;

      return {
        id: stableNotificationId(group.blockKey, startUtc),
        title: `${label} starts in 5 min`,
        body: buildNotificationBody(group),
        schedule: {
          at: fireAt,
          allowWhileIdle: true,
        },
        sound: "default",
        threadIdentifier: "creator-schedule-briefs",
        extra: {
          type: SCHEDULE_BLOCK_BRIEF_NOTIFICATION_TYPE,
          test: false,
          blockKey: group.blockKey,
          blockLabel: label,
          blockEventCount: group.instances.length,
          anchorInstanceId: anchor?.id ?? null,
          sourceType: anchor?.source_type ?? null,
          sourceId: anchor?.source_id ?? null,
          startUtc,
          timeBlockId: timeBlock?.time_block_id ?? anchor?.time_block_id ?? null,
          dayTypeTimeBlockId:
            timeBlock?.day_type_time_block_id ??
            anchor?.day_type_time_block_id ??
            null,
          windowId: timeBlock?.window_id ?? anchor?.window_id ?? null,
        },
      };
    });
}

function countScheduleBlockNotificationCandidates(
  instances: ScheduleBlockLocalNotificationInstance[],
  options: ScheduleBlockLocalNotificationOptions,
) {
  const nowMs = options.now?.getTime() ?? Date.now();
  const horizonMs = nowMs + LOOKAHEAD_MS;
  return groupUpcomingScheduleBlocks(
    instances,
    options.timeBlocks ?? [],
    nowMs,
    horizonMs,
    options.timeZone
  ).size;
}

function groupUpcomingScheduleBlocks(
  instances: ScheduleBlockLocalNotificationInstance[],
  timeBlocks: ScheduleBlockLocalNotificationTimeBlock[],
  nowMs: number,
  horizonMs: number,
  timeZone?: string | null,
) {
  const groups = new Map<string, GroupedBlock>();

  for (const timeBlock of timeBlocks) {
    const startMs = parseUtcMs(timeBlock.start_utc);
    if (startMs === null) continue;
    if (startMs > horizonMs) continue;
    const endMs = parseUtcMs(timeBlock.end_utc);

    const notificationMs = startMs - REMINDER_LEAD_MS;
    if (notificationMs <= nowMs) continue;

    const blockKey = blockKeyForTimeBlock(timeBlock);
    const occurrenceKey = blockOccurrenceKey(blockKey, startMs, timeZone);
    const existing = groups.get(occurrenceKey);

    if (!existing) {
      groups.set(occurrenceKey, {
        blockKey,
        anchor: null,
        timeBlock,
        blockStartMs: startMs,
        blockEndMs: endMs,
        instances: [],
      });
      continue;
    }

    existing.timeBlock ??= timeBlock;
    existing.blockStartMs = Math.min(existing.blockStartMs, startMs);
    existing.blockEndMs =
      existing.blockEndMs === null || endMs === null
        ? (existing.blockEndMs ?? endMs)
        : Math.max(existing.blockEndMs, endMs);
  }

  for (const instance of instances) {
    if (shouldSkipInstance(instance)) continue;

    const startMs = parseUtcMs(instance.start_utc);
    if (startMs === null) continue;
    if (startMs > horizonMs) continue;

    const notificationMs = startMs - REMINDER_LEAD_MS;
    if (notificationMs <= nowMs) continue;

    const blockKey = blockKeyForInstance(instance);
    const occurrenceKey = blockOccurrenceKey(blockKey, startMs, timeZone);
    const existing =
      findSeededTimeBlockGroup(groups, blockKey, startMs) ??
      groups.get(occurrenceKey);

    if (!existing) {
      groups.set(occurrenceKey, {
        blockKey,
        anchor: instance,
        timeBlock: null,
        blockStartMs: startMs,
        blockEndMs: null,
        instances: [instance],
      });
      continue;
    }

    existing.instances.push(instance);

    const anchorStartMs = existing.anchor
      ? parseUtcMs(existing.anchor.start_utc)
      : null;
    if (anchorStartMs === null || startMs < anchorStartMs) {
      existing.anchor = instance;
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

function findSeededTimeBlockGroup(
  groups: Map<string, GroupedBlock>,
  blockKey: string,
  instanceStartMs: number,
) {
  for (const group of groups.values()) {
    if (group.blockKey !== blockKey || !group.timeBlock) continue;
    if (instanceStartMs < group.blockStartMs) continue;
    if (group.blockEndMs !== null && instanceStartMs >= group.blockEndMs) {
      continue;
    }
    return group;
  }

  return null;
}

function shouldSkipInstance(instance: ScheduleBlockLocalNotificationInstance) {
  return instance.status?.trim().toLowerCase() !== "scheduled";
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

function blockKeyForTimeBlock(block: ScheduleBlockLocalNotificationTimeBlock) {
  return (
    pickText(block.time_block_id) ??
    pickText(block.day_type_time_block_id) ??
    pickText(block.window_id) ??
    block.id
  );
}

function blockOccurrenceKey(
  blockKey: string,
  startMs: number,
  timeZone?: string | null,
) {
  const occurrenceDate = localDateKeyForMs(startMs, timeZone);
  return `${blockKey}:${occurrenceDate}`;
}

function localDateKeyForMs(startMs: number, timeZone?: string | null) {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date(startMs));
      const year = parts.find((part) => part.type === "year")?.value;
      const month = parts.find((part) => part.type === "month")?.value;
      const day = parts.find((part) => part.type === "day")?.value;
      if (year && month && day) return `${year}-${month}-${day}`;
    } catch {
      // Fall through to the browser-local day instead of grouping by raw UTC.
    }
  }

  const date = new Date(startMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function buildNotificationBody(group: GroupedBlock) {
  if (isBreakTimeBlock(group.timeBlock) || group.instances.length === 0) {
    return "Take a break.";
  }

  const instances = group.instances;
  const count = instances.length;
  const previews = instances.slice(0, 3).map(formatEventPreview);
  const remaining = count - previews.length;

  if (remaining > 0) {
    previews.push(`+${remaining} more`);
  }

  return [`${count} scheduled`, previews.join(", ")].join("\n");
}

function isBreakTimeBlock(
  block: ScheduleBlockLocalNotificationTimeBlock | null,
) {
  return block?.kind?.trim().toUpperCase() === "BREAK";
}

function formatEventPreview(instance: ScheduleBlockLocalNotificationInstance) {
  const name = eventName(instance);
  const prefix = eventSkillPrefix(instance);
  return prefix ? `${prefix}\u00A0${name}` : name;
}

function eventName(instance: ScheduleBlockLocalNotificationInstance) {
  return (
    pickText(instance.event_name) ??
    pickText(instance.project_name) ??
    FALLBACK_EVENT_NAME
  );
}

function eventSkillPrefix(instance: ScheduleBlockLocalNotificationInstance) {
  return pickText(instance.skillIcon) ?? pickText(instance.skillName);
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

  return SCHEDULE_BRIEF_ID_OFFSET + ((hash >>> 0) % SCHEDULE_BRIEF_ID_RANGE);
}

function isScheduleBlockBriefExtra(extra: unknown) {
  if (!extra || typeof extra !== "object") return false;

  return (
    (extra as { type?: unknown }).type === SCHEDULE_BLOCK_BRIEF_NOTIFICATION_TYPE
  );
}

function isProductionScheduleBlockBriefExtra(extra: unknown) {
  if (!isScheduleBlockBriefExtra(extra)) return false;

  return (extra as { test?: unknown }).test !== true;
}
