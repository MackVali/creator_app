import { Capacitor } from "@capacitor/core";
import { LiveActivity } from "capacitor-live-activity";
import type { LiveActivityState } from "capacitor-live-activity";

export type FocusPomoLiveActivityMode = "pomo" | "stopwatch";

export type FocusPomoLiveActivityStatus =
  | "running"
  | "paused"
  | "completed"
  | "canceled";

export type FocusPomoLiveActivityPayload = {
  sessionId: string;
  title: string;
  skillIcon?: string | null;
  sourceLabel?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  mode: FocusPomoLiveActivityMode;
  startedAt: string;
  pausedAt?: string | null;
  endsAt?: string | null;
  targetEndAt?: string | null;
  plannedDurationSeconds: number;
  remainingSeconds?: number;
  elapsedSeconds?: number;
  scheduleInstanceId?: string | null;
  status: FocusPomoLiveActivityStatus;
};

export type EndFocusPomoLiveActivityPayload = {
  status: Extract<FocusPomoLiveActivityStatus, "completed" | "canceled">;
  title?: string;
  sessionId?: string;
};

type FocusPomoLiveActivityDiagnostics = {
  isRunning?: boolean | null;
  currentActivity?: LiveActivityState | null;
  hasCurrentActivity?: boolean | null;
  activityCount?: number | null;
};

export type StartFocusPomoLiveActivityResult =
  | ({
      ok: true;
      attemptedNativeIos: true;
      activityId: string;
    } & FocusPomoLiveActivityDiagnostics)
  | ({
      ok: false;
      reason: string;
      attemptedNativeIos: boolean;
      activityId: string;
    } & FocusPomoLiveActivityDiagnostics);

type StartFocusPomoLiveActivityResultInput =
  | ({
      ok: true;
      attemptedNativeIos: true;
    } & FocusPomoLiveActivityDiagnostics)
  | ({
      ok: false;
      reason: string;
      attemptedNativeIos: boolean;
    } & FocusPomoLiveActivityDiagnostics);

type FocusPomoLiveActivityEligibility =
  | { ok: true; attemptedNativeIos: true }
  | { ok: false; reason: string; attemptedNativeIos: boolean };

const FOCUS_POMO_ACTIVITY_ID = "focus-pomo-current";
const LIVE_ACTIVITY_PLUGIN_NAME = "LiveActivity";

function warnInDevelopment(message: string, error: unknown) {
  if (process.env.NODE_ENV !== "development") return;

  console.warn(message, error);
}

function createLiveActivityResult(
  result: StartFocusPomoLiveActivityResultInput
): StartFocusPomoLiveActivityResult {
  return {
    activityId: FOCUS_POMO_ACTIVITY_ID,
    ...result,
  };
}

async function canUseLiveActivity(): Promise<FocusPomoLiveActivityEligibility> {
  if (typeof window === "undefined") {
    return { ok: false, reason: "not_browser", attemptedNativeIos: false };
  }

  if (!Capacitor.isNativePlatform()) {
    return {
      ok: false,
      reason: "not_native_platform",
      attemptedNativeIos: false,
    };
  }

  const platform = Capacitor.getPlatform();
  if (platform !== "ios") {
    return {
      ok: false,
      reason: "not_native_ios",
      attemptedNativeIos: false,
    };
  }

  if (!Capacitor.isPluginAvailable(LIVE_ACTIVITY_PLUGIN_NAME)) {
    return { ok: false, reason: "plugin_unavailable", attemptedNativeIos: true };
  }

  try {
    const availability = await LiveActivity.isAvailable();
    if (!availability.value) {
      return {
        ok: false,
        reason: "live_activity_unavailable",
        attemptedNativeIos: true,
      };
    }
  } catch (error) {
    warnInDevelopment(
      "Unable to check FocusPomo Live Activity availability.",
      error
    );
    return {
      ok: false,
      reason: "availability_check_failed",
      attemptedNativeIos: true,
    };
  }

  return { ok: true, attemptedNativeIos: true };
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
    scheduleInstanceId: payload.scheduleInstanceId ?? "",
  };
}

function buildFocusPomoContentState(
  payload: FocusPomoLiveActivityPayload
): Record<string, string> {
  const skillIcon = payload.skillIcon?.trim();

  return {
    sessionId: payload.sessionId,
    title: payload.title,
    ...(skillIcon ? { skillIcon } : {}),
    sourceLabel: payload.sourceLabel ?? "",
    mode: payload.mode,
    status: payload.status,
    startedAt: payload.startedAt,
    pausedAt: payload.pausedAt ?? "",
    endsAt: payload.endsAt ?? payload.targetEndAt ?? "",
    targetEndAt: payload.targetEndAt ?? "",
    plannedDurationSeconds: String(payload.plannedDurationSeconds),
    scheduleInstanceId: payload.scheduleInstanceId ?? "",
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

async function readFocusPomoLiveActivityDiagnostics(): Promise<FocusPomoLiveActivityDiagnostics> {
  const [isRunning, currentActivity, activityCount] = await Promise.all([
    LiveActivity.isRunning({ id: FOCUS_POMO_ACTIVITY_ID })
      .then((result) => result.value)
      .catch(() => null),
    LiveActivity.getCurrentActivity({ id: FOCUS_POMO_ACTIVITY_ID }).catch(
      () => null
    ),
    LiveActivity.listActivities()
      .then((result) => result.activities.length)
      .catch(() => null),
  ]);

  return {
    isRunning,
    currentActivity,
    hasCurrentActivity: currentActivity === null ? null : Boolean(currentActivity),
    activityCount,
  };
}

export async function startFocusPomoLiveActivity(
  payload: FocusPomoLiveActivityPayload
): Promise<StartFocusPomoLiveActivityResult> {
  const eligibility = await canUseLiveActivity();

  if (!eligibility.ok) {
    return createLiveActivityResult({
      ok: false,
      reason: eligibility.reason,
      attemptedNativeIos: eligibility.attemptedNativeIos,
    });
  }

  try {
    await LiveActivity.endActivity({
      id: FOCUS_POMO_ACTIVITY_ID,
      contentState: buildEndFocusPomoContentState({ status: "canceled" }),
      timestamp: nowLiveActivityTimestamp(),
      dismissalPolicy: "immediate",
    }).catch(() => undefined);

    await LiveActivity.startActivity({
      id: FOCUS_POMO_ACTIVITY_ID,
      attributes: buildFocusPomoAttributes(payload),
      contentState: buildFocusPomoContentState(payload),
      timestamp: toLiveActivityTimestamp(payload.startedAt),
    });

    const diagnostics = await readFocusPomoLiveActivityDiagnostics();

    return createLiveActivityResult({
      ok: true,
      attemptedNativeIos: true,
      ...diagnostics,
    });
  } catch (error) {
    warnInDevelopment("Unable to start FocusPomo Live Activity.", error);
    return createLiveActivityResult({
      ok: false,
      reason: "start_activity_failed",
      attemptedNativeIos: true,
    });
  }
}

export async function updateFocusPomoLiveActivity(
  payload: FocusPomoLiveActivityPayload
): Promise<StartFocusPomoLiveActivityResult> {
  const eligibility = await canUseLiveActivity();

  if (!eligibility.ok) {
    return createLiveActivityResult({
      ok: false,
      reason: eligibility.reason,
      attemptedNativeIos: eligibility.attemptedNativeIos,
    });
  }

  try {
    await LiveActivity.updateActivity({
      id: FOCUS_POMO_ACTIVITY_ID,
      contentState: buildFocusPomoContentState(payload),
      timestamp: nowLiveActivityTimestamp(),
    });

    const diagnostics = await readFocusPomoLiveActivityDiagnostics();

    return createLiveActivityResult({
      ok: true,
      attemptedNativeIos: true,
      ...diagnostics,
    });
  } catch (error) {
    warnInDevelopment("Unable to update FocusPomo Live Activity.", error);
    return createLiveActivityResult({
      ok: false,
      reason: "update_activity_failed",
      attemptedNativeIos: true,
    });
  }
}

export async function endFocusPomoLiveActivity(
  payload?: EndFocusPomoLiveActivityPayload
): Promise<StartFocusPomoLiveActivityResult> {
  const eligibility = await canUseLiveActivity();

  if (!eligibility.ok) {
    return createLiveActivityResult({
      ok: false,
      reason: eligibility.reason,
      attemptedNativeIos: eligibility.attemptedNativeIos,
    });
  }

  try {
    await LiveActivity.endActivity({
      id: FOCUS_POMO_ACTIVITY_ID,
      contentState: buildEndFocusPomoContentState(payload),
      timestamp: nowLiveActivityTimestamp(),
      dismissalPolicy: "immediate",
    });

    return createLiveActivityResult({
      ok: true,
      attemptedNativeIos: true,
    });
  } catch (error) {
    warnInDevelopment("Unable to end FocusPomo Live Activity.", error);
    return createLiveActivityResult({
      ok: false,
      reason: "end_activity_failed",
      attemptedNativeIos: true,
    });
  }
}
