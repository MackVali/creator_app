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
  return placement.instanceId
    ? instanceStatusById[placement.instanceId] === "completed"
    : getHabitCompletionStatus(dayViewDateKey, placement.habitId) ===
        "completed";
}
