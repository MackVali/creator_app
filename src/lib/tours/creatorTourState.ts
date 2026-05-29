export const DASHBOARD_TOUR_COMPLETED_KEY = "dashboardTourCompleted";
export const SCHEDULE_TOUR_COMPLETED_KEY = "tour:schedule:completed";
export const SCHEDULE_TOUR_PENDING_KEY = "tour:schedule:pending";
export const DAY_TYPES_TOUR_COMPLETED_KEY = "tour:day-types:completed";
export const DAY_TYPES_TOUR_PENDING_KEY = "tour:day-types:pending";
export const CREATOR_TOUR_RESTART_PENDING_KEY = "tour:creator:restart-pending";

export type CreatorTourId = "dashboard" | "schedule" | "day-types";

const getStorage = () => {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage;
};

export function clearCreatorTourPendingState() {
  const storage = getStorage();
  if (!storage) return;

  storage.removeItem(SCHEDULE_TOUR_PENDING_KEY);
  storage.removeItem(DAY_TYPES_TOUR_PENDING_KEY);
}

export function resetCreatorTourStateForRestart() {
  const storage = getStorage();
  if (!storage) return;

  storage.removeItem(DASHBOARD_TOUR_COMPLETED_KEY);
  storage.removeItem(SCHEDULE_TOUR_COMPLETED_KEY);
  storage.removeItem(SCHEDULE_TOUR_PENDING_KEY);
  storage.removeItem(DAY_TYPES_TOUR_COMPLETED_KEY);
  storage.removeItem(DAY_TYPES_TOUR_PENDING_KEY);
  storage.removeItem(CREATOR_TOUR_RESTART_PENDING_KEY);
  storage.setItem(DASHBOARD_TOUR_COMPLETED_KEY, "false");
  storage.setItem(CREATOR_TOUR_RESTART_PENDING_KEY, "1");
}

export function completeCreatorTourState(tourId: CreatorTourId) {
  const storage = getStorage();
  if (!storage) return;

  if (tourId === "dashboard") {
    storage.setItem(DASHBOARD_TOUR_COMPLETED_KEY, "true");
    return;
  }

  if (tourId === "schedule") {
    storage.setItem(SCHEDULE_TOUR_COMPLETED_KEY, "1");
    return;
  }

  storage.setItem(DAY_TYPES_TOUR_COMPLETED_KEY, "1");
}

export function resolveCreatorTourIdFromFirstStep(
  firstStepId: string | undefined
): CreatorTourId | null {
  if (firstStepId === "fab-main") return "dashboard";
  if (firstStepId === "schedule-fab") return "schedule";
  if (firstStepId === "day-types-create-time-block") return "day-types";
  return null;
}
