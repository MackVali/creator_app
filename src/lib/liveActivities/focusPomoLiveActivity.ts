import { Capacitor, registerPlugin } from "@capacitor/core";

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
};

type CreatorLiveActivitiesPlugin = {
  startFocusPomoLiveActivity: (
    payload: FocusPomoLiveActivityPayload
  ) => Promise<void>;
  updateFocusPomoLiveActivity: (
    payload: FocusPomoLiveActivityPayload
  ) => Promise<void>;
  endFocusPomoLiveActivity: (
    payload?: EndFocusPomoLiveActivityPayload
  ) => Promise<void>;
};

const PLUGIN_NAME = "CreatorLiveActivities";

const CreatorLiveActivities =
  registerPlugin<CreatorLiveActivitiesPlugin>(PLUGIN_NAME);

function warnInDevelopment(message: string, error: unknown) {
  if (process.env.NODE_ENV !== "development") return;

  console.warn(message, error);
}

function canUseCreatorLiveActivities() {
  return (
    typeof window !== "undefined" &&
    Capacitor.isNativePlatform() &&
    Capacitor.isPluginAvailable(PLUGIN_NAME)
  );
}

export async function startFocusPomoLiveActivity(
  payload: FocusPomoLiveActivityPayload
): Promise<void> {
  if (!canUseCreatorLiveActivities()) return;

  try {
    await CreatorLiveActivities.startFocusPomoLiveActivity(payload);
  } catch (error) {
    warnInDevelopment("Unable to start FocusPomo Live Activity.", error);
  }
}

export async function updateFocusPomoLiveActivity(
  payload: FocusPomoLiveActivityPayload
): Promise<void> {
  if (!canUseCreatorLiveActivities()) return;

  try {
    await CreatorLiveActivities.updateFocusPomoLiveActivity(payload);
  } catch (error) {
    warnInDevelopment("Unable to update FocusPomo Live Activity.", error);
  }
}

export async function endFocusPomoLiveActivity(
  payload?: EndFocusPomoLiveActivityPayload
): Promise<void> {
  if (!canUseCreatorLiveActivities()) return;

  try {
    await CreatorLiveActivities.endFocusPomoLiveActivity(payload);
  } catch (error) {
    warnInDevelopment("Unable to end FocusPomo Live Activity.", error);
  }
}
