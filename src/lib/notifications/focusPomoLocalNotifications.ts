import { Capacitor } from "@capacitor/core";
import type { PermissionState } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

const NOTIFICATION_TYPE = "focus_pomo_completion";
const NOTIFICATION_ID = 1_972_625_661;

export type FocusPomoCompletionNotificationPayload = {
  sessionId: string;
  title: string;
  targetEndAt: string;
};

type FocusPomoNotificationResult =
  | { ok: true; permission?: PermissionState }
  | {
      ok: false;
      reason:
        | "not_browser"
        | "not_native_platform"
        | "plugin_unavailable"
        | "permission_check_failed"
        | "schedule_in_past"
        | "schedule_failed"
        | "cancel_failed";
    };

export async function scheduleFocusPomoCompletionNotification(
  payload: FocusPomoCompletionNotificationPayload
): Promise<FocusPomoNotificationResult> {
  const targetEndDate = new Date(payload.targetEndAt);
  if (!Number.isFinite(targetEndDate.getTime()) || targetEndDate.getTime() <= Date.now()) {
    return { ok: false, reason: "schedule_in_past" };
  }

  const permission = await resolveNotificationPermission();
  if (!permission.ok) return permission;
  if (permission.permission !== "granted") {
    return { ok: true, permission: permission.permission };
  }

  try {
    await LocalNotifications.cancel({
      notifications: [{ id: NOTIFICATION_ID }],
    });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: NOTIFICATION_ID,
          title: "Focus Pomo complete",
          body: payload.title.trim() || "Your focus session is complete.",
          schedule: {
            at: targetEndDate,
            allowWhileIdle: true,
          },
          extra: {
            type: NOTIFICATION_TYPE,
            sessionId: payload.sessionId,
          },
        },
      ],
    });
  } catch {
    return { ok: false, reason: "schedule_failed" };
  }

  return { ok: true, permission: permission.permission };
}

export async function cancelFocusPomoCompletionNotification(): Promise<FocusPomoNotificationResult> {
  const availability = checkNotificationAvailability();
  if (!availability.ok) return availability;

  try {
    await LocalNotifications.cancel({
      notifications: [{ id: NOTIFICATION_ID }],
    });
  } catch {
    return { ok: false, reason: "cancel_failed" };
  }

  return { ok: true };
}

async function resolveNotificationPermission(): Promise<
  | { ok: true; permission: PermissionState }
  | Extract<FocusPomoNotificationResult, { ok: false }>
> {
  const availability = checkNotificationAvailability();
  if (!availability.ok) return availability;

  try {
    const checked = await LocalNotifications.checkPermissions();
    let permission = checked.display;

    if (permission === "prompt" || permission === "prompt-with-rationale") {
      const requested = await LocalNotifications.requestPermissions();
      permission = requested.display;
    }

    return { ok: true, permission };
  } catch {
    return { ok: false, reason: "permission_check_failed" };
  }
}

function checkNotificationAvailability():
  | { ok: true }
  | Extract<FocusPomoNotificationResult, { ok: false }> {
  if (typeof window === "undefined") {
    return { ok: false, reason: "not_browser" };
  }

  if (!Capacitor.isNativePlatform()) {
    return { ok: false, reason: "not_native_platform" };
  }

  if (!Capacitor.isPluginAvailable("LocalNotifications")) {
    return { ok: false, reason: "plugin_unavailable" };
  }

  return { ok: true };
}
