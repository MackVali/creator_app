import { Capacitor } from "@capacitor/core";
import { LiveActivity, type LiveActivityState } from "capacitor-live-activity";

export type FocusPomoLiveActivityMode = "pomo" | "stopwatch";

export type FocusPomoLiveActivityStatus =
  | "running"
  | "paused"
  | "completed"
  | "canceled";

export type FocusPomoLiveActivityPayload = {
  sessionId: string;
  title: string;
  sourceLabel?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  mode: FocusPomoLiveActivityMode;
  startedAt: string;
  pausedAt?: string | null;
  targetEndAt?: string | null;
  plannedDurationSeconds: number;
  remainingSeconds?: number;
  elapsedSeconds?: number;
  status: FocusPomoLiveActivityStatus;
};

export type EndFocusPomoLiveActivityPayload = {
  status: Extract<FocusPomoLiveActivityStatus, "completed" | "canceled">;
  title?: string;
  sessionId?: string;
};

export type StartFocusPomoLiveActivityResult =
  | {
      ok: true;
      attemptedNativeIos: boolean;
      activityId: string;
      isRunning: boolean | null;
      currentActivity: LiveActivityState | null;
      hasCurrentActivity: boolean;
      activities: FocusPomoLiveActivityListItem[] | null;
      activityCount: number | null;
      listActivitiesAvailable: boolean;
    }
  | {
      ok: false;
      reason: string;
      attemptedNativeIos: boolean;
      activityId: string;
      isRunning?: boolean | null;
      currentActivity?: LiveActivityState | null;
      hasCurrentActivity?: boolean;
      activities?: FocusPomoLiveActivityListItem[] | null;
      activityCount?: number | null;
      listActivitiesAvailable?: boolean;
    };

export type UpdateFocusPomoLiveActivityResult = StartFocusPomoLiveActivityResult;

export type EndFocusPomoLiveActivityResult =
  | {
      ok: true;
      attemptedNativeIos: boolean;
    }
  | {
      ok: false;
      reason: string;
      attemptedNativeIos: boolean;
    };

const FOCUS_POMO_ACTIVITY_ID = "focus-pomo-current";
const LIVE_ACTIVITY_PLUGIN_NAME = "LiveActivity";

export type FocusPomoLiveActivityListItem = {
  id: string;
  activityId: string;
  state: string;
};

function warnInDevelopment(message: string, error: unknown) {
  if (process.env.NODE_ENV !== "development") return;

  console.warn(message, error);
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return "unknown error";
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
    sessionId: payload.sessionId,
    sourceType: payload.sourceType ?? "",
    sourceId: payload.sourceId ?? "",
    mode: payload.mode,
  };
}

function buildFocusPomoContentState(
  payload: FocusPomoLiveActivityPayload
): Record<string, string> {
  return {
    sessionId: payload.sessionId,
    title: payload.title,
    sourceLabel: payload.sourceLabel ?? "",
    mode: payload.mode,
    status: payload.status,
    startedAt: payload.startedAt,
    pausedAt: payload.pausedAt ?? "",
    targetEndAt: payload.targetEndAt ?? "",
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
    sessionId: payload?.sessionId ?? "",
    title: payload?.title ?? "Focus Pomo",
    status: payload?.status ?? "canceled",
  };
}

async function readFocusPomoNativeState(): Promise<{
  activityId: string;
  isRunning: boolean | null;
  currentActivity: LiveActivityState | null;
  hasCurrentActivity: boolean;
  activities: FocusPomoLiveActivityListItem[] | null;
  activityCount: number | null;
  listActivitiesAvailable: boolean;
}> {
  let isRunning: boolean | null = null;
  let currentActivity: LiveActivityState | null = null;
  let activities: FocusPomoLiveActivityListItem[] | null = null;
  let listActivitiesAvailable = false;

  try {
    const running = await LiveActivity.isRunning({ id: FOCUS_POMO_ACTIVITY_ID });
    isRunning = running.value;
  } catch (error) {
    warnInDevelopment("Unable to check FocusPomo Live Activity running state.", error);
  }

  try {
    currentActivity =
      (await LiveActivity.getCurrentActivity({
        id: FOCUS_POMO_ACTIVITY_ID,
      })) ?? null;
  } catch (error) {
    warnInDevelopment("Unable to read current FocusPomo Live Activity.", error);
  }

  if (typeof LiveActivity.listActivities === "function") {
    listActivitiesAvailable = true;

    try {
      const listedActivities = await LiveActivity.listActivities();
      activities = listedActivities.items;
    } catch (error) {
      warnInDevelopment("Unable to list FocusPomo Live Activities.", error);
    }
  }

  return {
    activityId: FOCUS_POMO_ACTIVITY_ID,
    isRunning,
    currentActivity,
    hasCurrentActivity: Boolean(currentActivity),
    activities,
    activityCount: activities?.length ?? null,
    listActivitiesAvailable,
  };
}

export async function startFocusPomoLiveActivity(
  payload: FocusPomoLiveActivityPayload
): Promise<StartFocusPomoLiveActivityResult> {
  if (typeof window === "undefined") {
    return {
      ok: false,
      reason: "browser/window unavailable",
      attemptedNativeIos: false,
      activityId: FOCUS_POMO_ACTIVITY_ID,
    };
  }

  const attemptedNativeIos =
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

  if (!Capacitor.isNativePlatform()) {
    return {
      ok: false,
      reason: "not native platform",
      attemptedNativeIos,
      activityId: FOCUS_POMO_ACTIVITY_ID,
    };
  }

  if (Capacitor.getPlatform() !== "ios") {
    return {
      ok: false,
      reason: `Live Activities unsupported on ${Capacitor.getPlatform()}`,
      attemptedNativeIos,
      activityId: FOCUS_POMO_ACTIVITY_ID,
    };
  }

  if (!Capacitor.isPluginAvailable(LIVE_ACTIVITY_PLUGIN_NAME)) {
    return {
      ok: false,
      reason: "plugin unavailable",
      attemptedNativeIos,
      activityId: FOCUS_POMO_ACTIVITY_ID,
    };
  }

  try {
    const availability = await LiveActivity.isAvailable();
    if (!availability.value) {
      return {
        ok: false,
        reason: "LiveActivity.isAvailable() false",
        attemptedNativeIos,
        activityId: FOCUS_POMO_ACTIVITY_ID,
      };
    }
  } catch (error) {
    const reason = `LiveActivity.isAvailable() failed: ${readErrorMessage(error)}`;
    warnInDevelopment("Unable to check FocusPomo Live Activity availability.", error);
    return {
      ok: false,
      reason,
      attemptedNativeIos,
      activityId: FOCUS_POMO_ACTIVITY_ID,
    };
  }

  await LiveActivity.endActivity({
    id: FOCUS_POMO_ACTIVITY_ID,
    contentState: buildEndFocusPomoContentState({ status: "canceled" }),
    timestamp: nowLiveActivityTimestamp(),
    dismissalPolicy: "immediate",
  }).catch((error) => {
    warnInDevelopment("Unable to pre-clean FocusPomo Live Activity.", error);
  });

  try {
    await LiveActivity.startActivity({
      id: FOCUS_POMO_ACTIVITY_ID,
      attributes: buildFocusPomoAttributes(payload),
      contentState: buildFocusPomoContentState(payload),
      timestamp: toLiveActivityTimestamp(payload.startedAt),
    });
  } catch (error) {
    warnInDevelopment("Unable to start FocusPomo Live Activity.", error);
    return {
      ok: false,
      reason: `startActivity failed: ${readErrorMessage(error)}`,
      attemptedNativeIos,
      activityId: FOCUS_POMO_ACTIVITY_ID,
    };
  }

  await new Promise((resolve) => window.setTimeout(resolve, 700));

  const nativeState = await readFocusPomoNativeState();

  return {
    ok: true,
    attemptedNativeIos,
    ...nativeState,
  };
}

export async function updateFocusPomoLiveActivity(
  payload: FocusPomoLiveActivityPayload
): Promise<UpdateFocusPomoLiveActivityResult> {
  if (typeof window === "undefined") {
    return {
      ok: false,
      reason: "browser/window unavailable",
      attemptedNativeIos: false,
      activityId: FOCUS_POMO_ACTIVITY_ID,
    };
  }

  const attemptedNativeIos =
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

  if (!Capacitor.isNativePlatform()) {
    return {
      ok: false,
      reason: "not native platform",
      attemptedNativeIos,
      activityId: FOCUS_POMO_ACTIVITY_ID,
    };
  }

  if (Capacitor.getPlatform() !== "ios") {
    return {
      ok: false,
      reason: `Live Activities unsupported on ${Capacitor.getPlatform()}`,
      attemptedNativeIos,
      activityId: FOCUS_POMO_ACTIVITY_ID,
    };
  }

  if (!Capacitor.isPluginAvailable(LIVE_ACTIVITY_PLUGIN_NAME)) {
    return {
      ok: false,
      reason: "plugin unavailable",
      attemptedNativeIos,
      activityId: FOCUS_POMO_ACTIVITY_ID,
    };
  }

  try {
    const availability = await LiveActivity.isAvailable();
    if (!availability.value) {
      return {
        ok: false,
        reason: "LiveActivity.isAvailable() false",
        attemptedNativeIos,
        activityId: FOCUS_POMO_ACTIVITY_ID,
      };
    }
  } catch (error) {
    const reason = `LiveActivity.isAvailable() failed: ${readErrorMessage(error)}`;
    warnInDevelopment("Unable to check FocusPomo Live Activity availability.", error);
    return {
      ok: false,
      reason,
      attemptedNativeIos,
      activityId: FOCUS_POMO_ACTIVITY_ID,
    };
  }

  try {
    await LiveActivity.updateActivity({
      id: FOCUS_POMO_ACTIVITY_ID,
      contentState: buildFocusPomoContentState(payload),
      timestamp: nowLiveActivityTimestamp(),
    });
  } catch (error) {
    warnInDevelopment("Unable to update FocusPomo Live Activity.", error);
    return {
      ok: false,
      reason: `updateActivity failed: ${readErrorMessage(error)}`,
      attemptedNativeIos,
      activityId: FOCUS_POMO_ACTIVITY_ID,
    };
  }

  const nativeState = await readFocusPomoNativeState();

  if (nativeState.isRunning === false) {
    return {
      ok: false,
      reason: "Live Activity failed: iOS reports no running activity after update",
      attemptedNativeIos,
      ...nativeState,
    };
  }

  return {
    ok: true,
    attemptedNativeIos,
    ...nativeState,
  };
}

export async function endFocusPomoLiveActivity(
  payload?: EndFocusPomoLiveActivityPayload
): Promise<EndFocusPomoLiveActivityResult> {
  if (typeof window === "undefined") {
    return {
      ok: false,
      reason: "browser/window unavailable",
      attemptedNativeIos: false,
    };
  }

  const attemptedNativeIos =
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

  if (!Capacitor.isNativePlatform()) {
    return {
      ok: false,
      reason: "not native platform",
      attemptedNativeIos,
    };
  }

  if (Capacitor.getPlatform() !== "ios") {
    return {
      ok: false,
      reason: `Live Activities unsupported on ${Capacitor.getPlatform()}`,
      attemptedNativeIos,
    };
  }

  if (!Capacitor.isPluginAvailable(LIVE_ACTIVITY_PLUGIN_NAME)) {
    return {
      ok: false,
      reason: "plugin unavailable",
      attemptedNativeIos,
    };
  }

  try {
    const availability = await LiveActivity.isAvailable();
    if (!availability.value) {
      return {
        ok: false,
        reason: "LiveActivity.isAvailable() false",
        attemptedNativeIos,
      };
    }

    await LiveActivity.endActivity({
      id: FOCUS_POMO_ACTIVITY_ID,
      contentState: buildEndFocusPomoContentState(payload),
      timestamp: nowLiveActivityTimestamp(),
      dismissalPolicy: "immediate",
    });

    return { ok: true, attemptedNativeIos };
  } catch (error) {
    warnInDevelopment("Unable to end FocusPomo Live Activity.", error);
    return {
      ok: false,
      reason: `endActivity failed: ${readErrorMessage(error)}`,
      attemptedNativeIos,
    };
  }
}
