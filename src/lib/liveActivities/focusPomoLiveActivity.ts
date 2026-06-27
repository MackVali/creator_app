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
  itemKey: string;
  title: string;
  itemType?: string | null;
  itemId?: string | null;
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
  backendUrl?: string | null;
  completeActionId?: string | null;
  completeActionToken?: string | null;
  skipActionId?: string | null;
  skipActionToken?: string | null;
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
// TEMP_FOCUS_POMO_DIAGNOSTICS: remove after one device test.
const FOCUS_POMO_LIVE_ACTIVITY_LOG = "[CREATOR_FOCUS_LIVE_ACTIVITY]";

type NormalizedLiveActivityDate = {
  iso: string;
  epochSeconds: number;
  epochMilliseconds: number;
};

type ValidatedFocusPomoLiveActivityPayload =
  | {
      ok: true;
      payload: FocusPomoLiveActivityPayload;
      startedAt: NormalizedLiveActivityDate;
      endsAt: NormalizedLiveActivityDate | null;
    }
  | {
      ok: false;
      reason: string;
      details: Record<string, unknown>;
    };

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

function nowLiveActivityTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

function normalizeLiveActivityDate(
  value: string | null | undefined
): NormalizedLiveActivityDate | null {
  if (!value) return null;

  const epochMilliseconds = new Date(value).getTime();
  if (!Number.isFinite(epochMilliseconds)) return null;

  return {
    iso: new Date(epochMilliseconds).toISOString(),
    epochSeconds: Math.floor(epochMilliseconds / 1000),
    epochMilliseconds,
  };
}

function validateFocusPomoLiveActivityPayload(
  payload: FocusPomoLiveActivityPayload
): ValidatedFocusPomoLiveActivityPayload {
  const startedAt = normalizeLiveActivityDate(payload.startedAt);
  if (!startedAt) {
    return {
      ok: false,
      reason: "invalid_started_at",
      details: {
        startedAt: payload.startedAt,
        startedAtType: typeof payload.startedAt,
      },
    };
  }

  if (payload.mode === "stopwatch") {
    return {
      ok: true,
      payload: {
        ...payload,
        startedAt: startedAt.iso,
        endsAt: null,
        targetEndAt: null,
      },
      startedAt,
      endsAt: null,
    };
  }

  const endsAt = normalizeLiveActivityDate(
    payload.endsAt ?? payload.targetEndAt ?? null
  );
  if (!endsAt) {
    return {
      ok: false,
      reason: "invalid_countdown_end_at",
      details: {
        startedAt: payload.startedAt,
        startedAtType: typeof payload.startedAt,
        endsAt: payload.endsAt,
        endsAtType: typeof payload.endsAt,
        targetEndAt: payload.targetEndAt,
        targetEndAtType: typeof payload.targetEndAt,
      },
    };
  }

  if (endsAt.epochMilliseconds <= startedAt.epochMilliseconds) {
    return {
      ok: false,
      reason: "reversed_countdown_range",
      details: {
        startedAt: startedAt.iso,
        endsAt: endsAt.iso,
        deltaMilliseconds: endsAt.epochMilliseconds - startedAt.epochMilliseconds,
      },
    };
  }

  return {
    ok: true,
    payload: {
      ...payload,
      startedAt: startedAt.iso,
      endsAt: endsAt.iso,
      targetEndAt: endsAt.iso,
    },
    startedAt,
    endsAt,
  };
}

function logFocusPomoLiveActivityPayload(
  event: string,
  validation: ValidatedFocusPomoLiveActivityPayload,
  payload: FocusPomoLiveActivityPayload
) {
  if (!validation.ok) {
    console.warn(`${FOCUS_POMO_LIVE_ACTIVITY_LOG} ${event}_invalid`, {
      reason: validation.reason,
      ...validation.details,
    });
    return;
  }

  console.info(`${FOCUS_POMO_LIVE_ACTIVITY_LOG} ${event}_payload`, {
    sessionId: validation.payload.sessionId,
    itemKey: validation.payload.itemKey,
    mode: validation.payload.mode,
    status: validation.payload.status,
    scheduleInstanceId: validation.payload.scheduleInstanceId ?? null,
    startedAt: validation.payload.startedAt,
    startedAtType: typeof payload.startedAt,
    startedAtEpochMilliseconds: validation.startedAt.epochMilliseconds,
    endsAt: validation.payload.endsAt ?? null,
    endsAtType: typeof payload.endsAt,
    endsAtEpochMilliseconds: validation.endsAt?.epochMilliseconds ?? null,
    hasCountdownEnd: validation.endsAt !== null,
  });
}

function buildFocusPomoAttributes(
  payload: FocusPomoLiveActivityPayload
): Record<string, string> {
  return {
    id: FOCUS_POMO_ACTIVITY_ID,
    sessionId: payload.sessionId,
    itemKey: payload.itemKey,
    itemType: payload.itemType ?? "",
    itemId: payload.itemId ?? "",
    sourceType: payload.sourceType ?? "",
    sourceId: payload.sourceId ?? "",
    mode: payload.mode,
    scheduleInstanceId: payload.scheduleInstanceId ?? "",
    backendUrl: payload.backendUrl ?? "",
  };
}

function buildFocusPomoContentState(
  payload: FocusPomoLiveActivityPayload
): Record<string, string> {
  const skillIcon = payload.skillIcon?.trim();

  return {
    sessionId: payload.sessionId,
    itemKey: payload.itemKey,
    itemType: payload.itemType ?? "",
    itemId: payload.itemId ?? "",
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
    backendUrl: payload.backendUrl ?? "",
    completeActionId: payload.completeActionId ?? "",
    completeActionToken: payload.completeActionToken ?? "",
    skipActionId: payload.skipActionId ?? "",
    skipActionToken: payload.skipActionToken ?? "",
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

  const validation = validateFocusPomoLiveActivityPayload(payload);
  logFocusPomoLiveActivityPayload("start", validation, payload);
  if (!validation.ok) {
    return createLiveActivityResult({
      ok: false,
      reason: validation.reason,
      attemptedNativeIos: true,
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
      attributes: buildFocusPomoAttributes(validation.payload),
      contentState: buildFocusPomoContentState(validation.payload),
      timestamp: validation.startedAt.epochSeconds,
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

  const validation = validateFocusPomoLiveActivityPayload(payload);
  logFocusPomoLiveActivityPayload("update", validation, payload);
  if (!validation.ok) {
    return createLiveActivityResult({
      ok: false,
      reason: validation.reason,
      attemptedNativeIos: true,
    });
  }

  try {
    await LiveActivity.updateActivity({
      id: FOCUS_POMO_ACTIVITY_ID,
      contentState: buildFocusPomoContentState(validation.payload),
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
