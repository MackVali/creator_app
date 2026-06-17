import type { ScheduleInstance } from "@/lib/scheduler/instanceRepo";

export type HabitCompletionStatus = "scheduled" | "completed";

export type HabitCompletionByDate = Record<
  string,
  Record<string, HabitCompletionStatus>
>;

export type HabitCompletionResolver = (
  dateKey: string,
  habitId: string
) => HabitCompletionStatus;

export type HabitPlacementIdentifiers = {
  habitId: string;
  instanceId: string | null;
};

export function getHabitCompletionStateKey(placement: HabitPlacementIdentifiers) {
  return placement.instanceId ? `instance:${placement.instanceId}` : placement.habitId;
}

export function resolveHabitCompletionStatus({
  placement,
  dayViewDateKey,
  instanceStatusById,
  getHabitCompletionStatus,
}: {
  placement: HabitPlacementIdentifiers;
  dayViewDateKey: string;
  instanceStatusById: Record<string, ScheduleInstance["status"] | null>;
  getHabitCompletionStatus: HabitCompletionResolver;
}): boolean {
  if (placement.instanceId) {
    const instanceStatus = instanceStatusById[placement.instanceId];
    if (instanceStatus === "completed") return true;
    if (instanceStatus) return false;
  }

  return (
    getHabitCompletionStatus(
      dayViewDateKey,
      getHabitCompletionStateKey(placement)
    ) === "completed"
  );
}
