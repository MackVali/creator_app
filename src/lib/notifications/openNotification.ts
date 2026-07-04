import {
  SCHEDULE_BLOCK_BRIEF_NOTIFICATION_TYPE,
  TIME_BLOCK_START_NOTIFICATION_TYPE,
} from "@/lib/notifications/scheduleBlockLocalNotifications";
import {
  OPEN_NUTRITION_LOG_NOTIFICATION_QUERY_PARAM,
  OPEN_NUTRITION_LOG_NOTIFICATION_STORAGE_KEY,
  OPEN_NUTRITION_LOG_NOTIFICATION_TAP_ACTION,
} from "@/lib/notifications/notificationOpenIntents";

type NotificationPayload = Record<string, unknown>;

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readPayload(input: unknown): NotificationPayload | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  return input as NotificationPayload;
}

function readNestedPayload(
  input: NotificationPayload,
  key: string,
): NotificationPayload | null {
  return readPayload(input[key]);
}

function appendParam(
  params: URLSearchParams,
  key: string,
  value: string | null,
) {
  if (value) params.set(key, value);
}

export function focusPomoUrlForNotificationPayload(input: unknown): string | null {
  const payload = readPayload(input);
  if (!payload) return null;

  const type = readString(payload.type);
  const launch = readString(payload.launch);
  if (
    type !== TIME_BLOCK_START_NOTIFICATION_TYPE &&
    launch !== TIME_BLOCK_START_NOTIFICATION_TYPE
  ) {
    return null;
  }

  const params = new URLSearchParams();
  params.set("launch", TIME_BLOCK_START_NOTIFICATION_TYPE);
  appendParam(params, "blockKey", readString(payload.blockKey));
  appendParam(params, "blockLabel", readString(payload.blockLabel));
  appendParam(params, "timeBlockId", readString(payload.timeBlockId));
  appendParam(
    params,
    "dayTypeTimeBlockId",
    readString(payload.dayTypeTimeBlockId),
  );
  appendParam(params, "windowId", readString(payload.windowId));
  appendParam(params, "start", readString(payload.startUtc));
  appendParam(params, "end", readString(payload.endUtc));
  appendParam(params, "localDayKey", readString(payload.localDayKey));
  appendParam(params, "anchorInstanceId", readString(payload.anchorInstanceId));

  return `/focus-pomo?${params.toString()}`;
}

export function scheduleNutritionLogUrlForNotificationPayload(
  input: unknown,
): string | null {
  const payload = readPayload(input);
  if (!payload) return null;

  const type = readString(payload.type);
  const tapAction = readString(payload.tapAction);
  if (
    type !== SCHEDULE_BLOCK_BRIEF_NOTIFICATION_TYPE ||
    tapAction !== OPEN_NUTRITION_LOG_NOTIFICATION_TAP_ACTION
  ) {
    return null;
  }

  const params = new URLSearchParams();
  params.set(OPEN_NUTRITION_LOG_NOTIFICATION_QUERY_PARAM, "1");
  return `/schedule?${params.toString()}`;
}

function storePendingNutritionLogOpenIntent() {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      OPEN_NUTRITION_LOG_NOTIFICATION_STORAGE_KEY,
      "1",
    );
  } catch {
    // The URL query is the fallback handoff when sessionStorage is unavailable.
  }
}

export function openNotificationPayload(input: unknown): boolean {
  const scheduleNutritionLogUrl =
    scheduleNutritionLogUrlForNotificationPayload(input);
  if (scheduleNutritionLogUrl && typeof window !== "undefined") {
    storePendingNutritionLogOpenIntent();
    window.location.assign(scheduleNutritionLogUrl);
    return true;
  }

  const url = focusPomoUrlForNotificationPayload(input);
  if (!url || typeof window === "undefined") return false;

  window.location.assign(url);
  return true;
}

export function readCapacitorNotificationPayload(input: unknown): unknown {
  const payload = readPayload(input);
  if (!payload) return input;

  const notification = readNestedPayload(payload, "notification");
  if (!notification) return input;

  return (
    readNestedPayload(notification, "extra") ??
    readNestedPayload(notification, "data") ??
    notification
  );
}
