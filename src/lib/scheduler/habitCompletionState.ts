import type { ScheduleInstance } from "@/lib/scheduler/instanceRepo";
import { dayKeyFromUtc } from "../time/tz";

export type HabitCompletionState = Record<string, Record<string, "completed">>;

export function mergeHabitCompletionStateFromInstances(
  prevState: HabitCompletionState,
  instances: ScheduleInstance[] | null | undefined,
  timeZone: string
): HabitCompletionState {
  if (!instances || instances.length === 0) {
    return prevState;
  }

  const completedByDate = new Map<string, Set<string>>();
  const datesWithHabitInstances = new Set<string>();

  for (const instance of instances) {
    if (!instance || instance.source_type !== "HABIT" || !instance.source_id) continue;
    const dateKey = dayKeyFromUtc(instance.start_utc ?? "", timeZone);
    datesWithHabitInstances.add(dateKey);
    if ((instance.status ?? "").toLowerCase() === "completed") {
      let completedIds = completedByDate.get(dateKey);
      if (!completedIds) {
        completedIds = new Set();
        completedByDate.set(dateKey, completedIds);
      }
      completedIds.add(instance.source_id);
    }
  }

  if (datesWithHabitInstances.size === 0) {
    return prevState;
  }

  let changed = false;
  const nextState: HabitCompletionState = { ...prevState };

  for (const dateKey of datesWithHabitInstances) {
    const completedIds = completedByDate.get(dateKey) ?? new Set<string>();
    const nextDay: Record<string, "completed"> = {};
    completedIds.forEach((habitId) => {
      nextDay[habitId] = "completed";
    });

    const prevDay = prevState[dateKey];
    const nextDayKeys = Object.keys(nextDay);
    if (nextDayKeys.length === 0) {
      if (prevDay) {
        delete nextState[dateKey];
        changed = true;
      }
      continue;
    }

    const prevKeys = Object.keys(prevDay ?? {});
    const keysChanged =
      prevKeys.length !== nextDayKeys.length ||
      nextDayKeys.some((key) => prevDay?.[key] !== nextDay[key]);

    if (keysChanged) {
      nextState[dateKey] = nextDay;
      changed = true;
    }
  }

  return changed ? nextState : prevState;
}
