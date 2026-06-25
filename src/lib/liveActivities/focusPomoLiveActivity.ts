import { Capacitor } from "@capacitor/core";
import { LiveActivity } from "capacitor-live-activity";

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
      isRunning?: boolean;
      hasCurrentActivity?: boolean;
    }
  | {
      ok: false;
      reason: string;
      attemptedNativeIos: boolean;
      isRunning?: boolean;
      hasCurrentActivity?: boolean;
    };

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

export async function startFocusPomoLiveActivity(
  payload: FocusPomoLiveActivityPayload
): Promise<StartFocusPomoLiveActivityResult> {
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
  } catch (error) {
    const reason = `LiveActivity.isAvailable() failed: ${readErrorMessage(error)}`;
    warnInDevelopment("Unable to check FocusPomo Live Activity availability.", error);
    return { ok: false, reason, attemptedNativeIos };
  }

  try {
    await LiveActivity.endActivity({
      id: FOCUS_POMO_ACTIVITY_ID,
      contentState: buildEndFocusPomoContentState({ status: "canceled" }),
      timestamp: nowLiveActivityTimestamp(),
      dismissalPolicy: "immediate",
    });
  } catch (error) {
    const reason = `endActivity pre-cleanup failed: ${readErrorMessage(error)}`;
    warnInDevelopment("Unable to pre-clean FocusPomo Live Activity.", error);
    return { ok: false, reason, attemptedNativeIos };
  }

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
    };
  }

  try {
    const running = await LiveActivity.isRunning({ id: FOCUS_POMO_ACTIVITY_ID });
    if (!running.value) {
      return {
        ok: false,
        reason: "LiveActivity.isRunning() false after startActivity",
        attemptedNativeIos,
        isRunning: false,
      };
    }

    return {
      ok: true,
      attemptedNativeIos,
      isRunning: running.value,
    };
  } catch (error) {
    warnInDevelopment("Unable to verify FocusPomo Live Activity.", error);

    try {
      const currentActivity = await LiveActivity.getCurrentActivity({
        id: FOCUS_POMO_ACTIVITY_ID,
      });
      if (!currentActivity?.id) {
        return {
          ok: false,
          reason: "getCurrentActivity() empty after startActivity",
          attemptedNativeIos,
          hasCurrentActivity: false,
        };
      }

      return {
        ok: true,
        attemptedNativeIos,
        hasCurrentActivity: Boolean(currentActivity?.id),
      };
    } catch (currentActivityError) {
      warnInDevelopment(
        "Unable to read current FocusPomo Live Activity.",
        currentActivityError
      );
      return { ok: true, attemptedNativeIos };
    }
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
