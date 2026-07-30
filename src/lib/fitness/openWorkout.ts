export const CREATOR_OPEN_FITNESS_WORKOUT_EVENT =
  "creator:open-fitness-workout";

export type CreatorOpenFitnessWorkoutDetail = {
  requestId: string;
  source: "schedule" | "matrix";
  scheduleInstanceId?: string | null;
  habitId?: string | null;
  fitnessPlanTemplateId?: string | null;
  fitnessRoutineTemplateId?: string | null;
  fitnessRoutineTitle?: string | null;
  fitnessRoutineIndex?: number | null;
  linkedFitnessHabitId?: string | null;
};

export function dispatchOpenFitnessWorkoutEvent(
  detail: Omit<CreatorOpenFitnessWorkoutDetail, "requestId"> & {
    requestId?: string | null;
  },
) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<CreatorOpenFitnessWorkoutDetail>(
      CREATOR_OPEN_FITNESS_WORKOUT_EVENT,
      {
        detail: {
          ...detail,
          requestId:
            detail.requestId?.trim() ||
            `fitness-workout-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        },
      },
    ),
  );
}
