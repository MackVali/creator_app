import {
  FITNESS_ACTIVE_PLAN_WEEKDAYS,
  type FitnessActivePlanWeekday,
} from "@/lib/fitness/activePlan";
import type { FitnessRoutineTemplate } from "@/lib/fitness/routineTemplates";

export type FitnessPlanTrajectoryEntry = {
  weekday: FitnessActivePlanWeekday;
  routine: FitnessRoutineTemplate;
  routineIndex: number;
};

export type FitnessPlanTrajectoryWeek = {
  week: number;
  entries: FitnessPlanTrajectoryEntry[];
};

export function resolveFitnessPlanTrainingTrajectory({
  routines,
  weekdays,
  startRoutineIndex = 0,
  weeks = 2,
}: {
  routines: readonly FitnessRoutineTemplate[];
  weekdays: readonly FitnessActivePlanWeekday[];
  startRoutineIndex?: number;
  weeks?: number;
}): FitnessPlanTrajectoryWeek[] {
  const normalizedStartIndex = Math.max(0, Math.trunc(startRoutineIndex));
  const normalizedWeeks = Math.max(0, Math.trunc(weeks));
  const selectedWeekdays = FITNESS_ACTIVE_PLAN_WEEKDAYS.filter((weekday) =>
    weekdays.includes(weekday),
  );

  return Array.from({ length: normalizedWeeks }, (_, weekIndex) => ({
    week: weekIndex + 1,
    entries: selectedWeekdays.flatMap((weekday, weekdayIndex) => {
      if (routines.length === 0) return [];
      const sequenceOffset = weekIndex * selectedWeekdays.length + weekdayIndex;
      const routineIndex = normalizedStartIndex + sequenceOffset;
      const routine = routines[routineIndex % routines.length];
      return routine ? [{ weekday, routine, routineIndex }] : [];
    }),
  }));
}
