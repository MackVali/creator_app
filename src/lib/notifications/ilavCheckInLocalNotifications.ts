import { Capacitor } from "@capacitor/core";
import type { PermissionState } from "@capacitor/core";
import {
  LocalNotifications,
  type LocalNotificationSchema,
  type PendingLocalNotificationSchema,
} from "@capacitor/local-notifications";
import { resolveCreatorDay, resolveCreatorDayForDate } from "@/lib/creatorDay";
import {
  ILAV_CHECK_IN_NOTIFICATION_TYPE,
  ILAV_CHECK_IN_TYPES,
  ilavCheckInNotificationDate,
  type IlavCheckInType,
} from "@/lib/ai/ilavCheckInSchedule";

const ILAV_CHECK_IN_NOTIFICATION_ID_OFFSET = 1_900_000_000;
const ILAV_CHECK_IN_NOTIFICATION_ID_RANGE = 100_000_000;
const LOOKAHEAD_CREATOR_DAYS = 2;

const CHECK_IN_COPY: Record<IlavCheckInType, { title: string; body: string }> = {
  morning: {
    title: "ILAV morning check-in",
    body: "Morning. Here's what today looks like.",
  },
  midday: {
    title: "ILAV midday check-in",
    body: "How we looking so far?",
  },
  night: {
    title: "ILAV night check-in",
    body: "Alright, what actually happened today?",
  },
};

export type IlavCheckInLocalNotificationResult =
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

function isManagedIlavCheckInExtra(extra: unknown) {
  return (
    Boolean(extra) &&
    typeof extra === "object" &&
    (extra as { type?: unknown }).type === ILAV_CHECK_IN_NOTIFICATION_TYPE
  );
}

function stableNotificationId(input: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (
    ILAV_CHECK_IN_NOTIFICATION_ID_OFFSET +
    ((hash >>> 0) % ILAV_CHECK_IN_NOTIFICATION_ID_RANGE)
  );
}

function shiftDateKey(key: string, days: number) {
  const [year, month, day] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${String(
    shifted.getUTCMonth() + 1
  ).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function buildIlavCheckInNotifications({
  now,
  deviceTimezone,
}: {
  now: Date;
  deviceTimezone?: string | null;
}): LocalNotificationSchema[] {
  const currentCreatorDay = resolveCreatorDay({
    instant: now,
    deviceTimezone,
  });
  const notifications: LocalNotificationSchema[] = [];

  for (let offset = 0; offset < LOOKAHEAD_CREATOR_DAYS; offset += 1) {
    const creatorDayDate = shiftDateKey(currentCreatorDay.creatorDayDate, offset);
    const creatorDay = resolveCreatorDayForDate(
      creatorDayDate,
      currentCreatorDay.timezone,
      currentCreatorDay.timezoneSource
    );

    for (const type of ILAV_CHECK_IN_TYPES) {
      const fireAt = ilavCheckInNotificationDate({
        creatorDayDate: creatorDay.creatorDayDate,
        type,
        timeZone: creatorDay.timezone,
      });
      if (fireAt.getTime() <= now.getTime()) continue;
      const copy = CHECK_IN_COPY[type];
      notifications.push({
        id: stableNotificationId(`${creatorDay.creatorDayDate}:${type}`),
        title: copy.title,
        body: copy.body,
        schedule: {
          at: fireAt,
          allowWhileIdle: true,
        },
        sound: "default",
        threadIdentifier: "creator-ilav-check-ins",
        extra: {
          type: ILAV_CHECK_IN_NOTIFICATION_TYPE,
          checkInType: type,
          creatorDayDate: creatorDay.creatorDayDate,
          test: false,
        },
      });
    }
  }

  return notifications;
}

export async function syncIlavCheckInLocalNotifications({
  now = new Date(),
  deviceTimezone,
}: {
  now?: Date;
  deviceTimezone?: string | null;
} = {}): Promise<IlavCheckInLocalNotificationResult> {
  if (typeof window === "undefined") return { ok: false, reason: "not_browser" };
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, reason: "not_native_platform" };
  }
  if (!Capacitor.isPluginAvailable("LocalNotifications")) {
    return { ok: false, reason: "plugin_unavailable" };
  }

  const permission = await resolveNotificationPermission();
  if (!permission) return { ok: false, reason: "permission_check_failed" };
  if (permission !== "granted") {
    return { ok: true, scheduledCount: 0, canceledCount: 0, permission };
  }

  const pending = await LocalNotifications.getPending().catch(() => null);
  if (!pending) return { ok: false, reason: "pending_lookup_failed" };

  const staleNotifications = pending.notifications
    .filter((notification: PendingLocalNotificationSchema) =>
      isManagedIlavCheckInExtra(notification.extra)
    )
    .map((notification) => ({ id: notification.id }));

  if (staleNotifications.length > 0) {
    try {
      await LocalNotifications.cancel({ notifications: staleNotifications });
    } catch {
      return { ok: false, reason: "cancel_failed" };
    }
  }

  const notifications = buildIlavCheckInNotifications({
    now,
    deviceTimezone,
  });
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
