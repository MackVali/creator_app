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

  const habitIdsByDate = new Map<string, Set<string>>();
  const completedByDate = new Map<string, Set<string>>();
  const instanceMetaByDate = new Map<
    string,
    Map<
      string,
      {
        instanceId: string | null;
        habitId: string;
        status: ScheduleInstance["status"] | null | undefined;
        completedAt: string | null | undefined;
      }
    >
  >();

  for (const instance of instances) {
    if (!instance || instance.source_type !== "HABIT") continue;
    const habitId = instance.source_id;
    if (!habitId) continue;
    const dateKey = dayKeyFromUtc(instance.start_utc ?? "", timeZone);
    let instanceMeta = instanceMetaByDate.get(dateKey);
    if (!instanceMeta) {
      instanceMeta = new Map();
      instanceMetaByDate.set(dateKey, instanceMeta);
    }
    instanceMeta.set(habitId, {
      instanceId: instance.id ?? null,
      habitId,
      status: instance.status,
      completedAt: instance.completed_at,
    });
    let allIds = habitIdsByDate.get(dateKey);
    if (!allIds) {
      allIds = new Set();
      habitIdsByDate.set(dateKey, allIds);
    }
    allIds.add(habitId);
    if ((instance.status ?? "").toLowerCase() === "completed") {
      let completedIds = completedByDate.get(dateKey);
      if (!completedIds) {
        completedIds = new Set();
        completedByDate.set(dateKey, completedIds);
      }
      completedIds.add(habitId);
    }
  }

  if (habitIdsByDate.size === 0) {
    return prevState;
  }

  let changed = false;
  const nextState: HabitCompletionState = { ...prevState };

  for (const [dateKey, habitIds] of habitIdsByDate) {
    const prevDay = nextState[dateKey];
    const nextDay = prevDay ? { ...prevDay } : {};
    let dayChanged = false;
    const completedIds = completedByDate.get(dateKey) ?? new Set<string>();
    habitIds.forEach((habitId) => {
      const wasCompleted = prevDay?.[habitId] === "completed";
      const isCompleted = completedIds.has(habitId);
      let action: "add" | "remove" | "noop" = "noop";
      if (isCompleted && !wasCompleted) {
        action = "add";
      } else if (!isCompleted && wasCompleted) {
        action = "remove";
      }
      if (completedIds.has(habitId)) {
        if (nextDay[habitId] !== "completed") {
          nextDay[habitId] = "completed";
          dayChanged = true;
        }
      }
      // Intentionally do not remove completions - user-confirmed habit completion
      // must never be undone by merge/reconciliation logic. Only explicit undo
      // actions may remove completions.
      const meta = instanceMetaByDate.get(dateKey)?.get(habitId);
      console.log("[HABIT_COMPLETION][MERGE_INSTANCE]", {
        instanceId: meta?.instanceId ?? null,
        habitId,
        status: meta?.status ?? null,
        completedAt: meta?.completedAt ?? null,
        dayKey: dateKey,
        action,
      });
    });
    if (dayChanged) {
      changed = true;
      if (Object.keys(nextDay).length === 0) {
        delete nextState[dateKey];
      } else {
        nextState[dateKey] = nextDay;
      }
    }
  }

  return changed ? nextState : prevState;
}
