import { Capacitor } from "@capacitor/core";
import { LiveActivity } from "capacitor-live-activity";

export type FocusPomoLiveActivityMode = "pomo" | "stopwatch";

export type FocusPomoLiveActivityStatus =
  | "running"
  | "completed"
  | "canceled";

export type FocusPomoLiveActivityPayload = {
  title: string;
  sourceType: string;
  sourceId: string;
  mode: FocusPomoLiveActivityMode;
  startedAt: string;
  plannedDurationSeconds: number;
  remainingSeconds?: number;
  elapsedSeconds?: number;
  status: FocusPomoLiveActivityStatus;
};

export type EndFocusPomoLiveActivityPayload = {
  status: Extract<FocusPomoLiveActivityStatus, "completed" | "canceled">;
  title?: string;
};

const FOCUS_POMO_ACTIVITY_ID = "focus-pomo-current";
const LIVE_ACTIVITY_PLUGIN_NAME = "LiveActivity";

function warnInDevelopment(message: string, error: unknown) {
  if (process.env.NODE_ENV !== "development") return;

  console.warn(message, error);
}

async function canUseLiveActivity() {
  if (typeof window === "undefined") return false;
  if (!Capacitor.isNativePlatform()) return false;
  if (!Capacitor.isPluginAvailable(LIVE_ACTIVITY_PLUGIN_NAME)) return false;

  const availability = await LiveActivity.isAvailable();
  return availability.value;
}

function toLiveActivityTimestamp(value?: string): number | undefined {
  if (!value) return undefined;

  const timestamp = Math.floor(new Date(value).getTime() / 1000);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function nowLiveActivityTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

function buildFocusPomoAttributes(
  payload: FocusPomoLiveActivityPayload
): Record<string, string> {
  return {
    id: FOCUS_POMO_ACTIVITY_ID,
    sourceType: payload.sourceType,
    sourceId: payload.sourceId,
    mode: payload.mode,
  };
}

function buildFocusPomoContentState(
  payload: FocusPomoLiveActivityPayload
): Record<string, string> {
  return {
    title: payload.title,
    status: payload.status,
    startedAt: payload.startedAt,
    plannedDurationSeconds: String(payload.plannedDurationSeconds),
    ...(payload.remainingSeconds != null
      ? { remainingSeconds: String(payload.remainingSeconds) }
      : {}),
    ...(payload.elapsedSeconds != null
      ? { elapsedSeconds: String(payload.elapsedSeconds) }
      : {}),
  };
}

function buildEndFocusPomoContentState(
  payload?: EndFocusPomoLiveActivityPayload
): Record<string, string> {
  return {
    title: payload?.title ?? "FocusPomo",
    status: payload?.status ?? "canceled",
  };
}

export async function startFocusPomoLiveActivity(
  payload: FocusPomoLiveActivityPayload
): Promise<void> {
  try {
    if (!(await canUseLiveActivity())) return;

    await LiveActivity.startActivity({
      id: FOCUS_POMO_ACTIVITY_ID,
      attributes: buildFocusPomoAttributes(payload),
      contentState: buildFocusPomoContentState(payload),
      timestamp: toLiveActivityTimestamp(payload.startedAt),
    });
  } catch (error) {
    warnInDevelopment("Unable to start FocusPomo Live Activity.", error);
  }
}

export async function updateFocusPomoLiveActivity(
  payload: FocusPomoLiveActivityPayload
): Promise<void> {
  try {
    if (!(await canUseLiveActivity())) return;

    await LiveActivity.updateActivity({
      id: FOCUS_POMO_ACTIVITY_ID,
      contentState: buildFocusPomoContentState(payload),
      timestamp: nowLiveActivityTimestamp(),
    });
  } catch (error) {
    warnInDevelopment("Unable to update FocusPomo Live Activity.", error);
  }
}

export async function endFocusPomoLiveActivity(
  payload?: EndFocusPomoLiveActivityPayload
): Promise<void> {
  try {
    if (!(await canUseLiveActivity())) return;

    await LiveActivity.endActivity({
      id: FOCUS_POMO_ACTIVITY_ID,
      contentState: buildEndFocusPomoContentState(payload),
      timestamp: nowLiveActivityTimestamp(),
    });
  } catch (error) {
    warnInDevelopment("Unable to end FocusPomo Live Activity.", error);
  }
}
