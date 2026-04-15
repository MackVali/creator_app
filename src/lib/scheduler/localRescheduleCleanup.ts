import { safeDate } from "./safeDate";
import {
  passesTimeBlockConstraints,
  type ConstraintItem,
} from "./constraints";
import {
  addDaysInTimeZone,
  formatDateKeyInTimeZone,
  setTimeInTimeZone,
  startOfDayInTimeZone,
} from "./timezone";
import type { ScheduleInstance } from "./instanceRepo";
import type { WindowLite } from "./repo";

export const LOCAL_RESCHEDULE_CANCEL_REASON =
  "RESCHEDULE_LOCAL_REVALIDATION";

export function resolveLocalizedRescheduleScope(params: {
  pivotStart: string;
  pivotEnd: string;
  timeZone: string;
}) {
  const pivotStartDate = new Date(params.pivotStart);
  const pivotEndDate = new Date(params.pivotEnd);
  if (
    Number.isNaN(pivotStartDate.getTime()) ||
    Number.isNaN(pivotEndDate.getTime())
  ) {
    return null;
  }

  const scopeStartDay = startOfDayInTimeZone(pivotStartDate, params.timeZone);
  const scopeEndDay = startOfDayInTimeZone(pivotEndDate, params.timeZone);
  const scopeStart = addDaysInTimeZone(scopeStartDay, -2, params.timeZone);
  const scopeEnd = addDaysInTimeZone(scopeEndDay, 2, params.timeZone);

  return {
    scopeStartDay,
    scopeEndDay,
    scopeStart,
    scopeEnd,
  };
}

export type LocalRescheduleCleanupWindow = Pick<
  WindowLite,
  | "id"
  | "start_local"
  | "end_local"
  | "window_kind"
  | "dayTypeTimeBlockId"
  | "dayTypeStartUtcMs"
  | "dayTypeEndUtcMs"
>;

export type LocalRescheduleCleanupInstance = Pick<
  ScheduleInstance,
  | "id"
  | "source_id"
  | "source_type"
  | "start_utc"
  | "end_utc"
  | "locked"
  | "weight_snapshot"
  | "updated_at"
  | "window_id"
  | "day_type_time_block_id"
  | "time_block_id"
  | "practice_context_monument_id"
>;

export type LocalRescheduleCleanupSourceContext = Pick<
  ConstraintItem,
  | "habitType"
  | "skillId"
  | "skillIds"
  | "monumentId"
  | "skillMonumentId"
  | "monumentIds"
> & {
  practiceContextId?: string | null;
};

type Candidate = {
  instance: LocalRescheduleCleanupInstance;
  startMs: number;
  endMs: number;
  windowRank: number;
  projectWeight: number;
  updatedAtMs: number;
  protectedFromOverlap: boolean;
};

type WindowLookup = Map<string, LocalRescheduleCleanupWindow[]>;

function parseWindowTime(value: string | null | undefined) {
  const [hourRaw, minuteRaw] = (value ?? "00:00").split(":");
  const hour = Number.parseInt(hourRaw ?? "0", 10);
  const minute = Number.parseInt(minuteRaw ?? "0", 10);
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function resolveWindowBounds(
  window: LocalRescheduleCleanupWindow,
  localDay: Date,
  timeZone: string
) {
  if (
    typeof window.dayTypeStartUtcMs === "number" &&
    Number.isFinite(window.dayTypeStartUtcMs) &&
    typeof window.dayTypeEndUtcMs === "number" &&
    Number.isFinite(window.dayTypeEndUtcMs)
  ) {
    const start = new Date(window.dayTypeStartUtcMs);
    const end = new Date(window.dayTypeEndUtcMs);
    if (end.getTime() > start.getTime()) {
      return { start, end };
    }
  }

  const { hour: startHour, minute: startMinute } = parseWindowTime(
    window.start_local
  );
  const { hour: endHour, minute: endMinute } = parseWindowTime(
    window.end_local
  );
  const start = setTimeInTimeZone(localDay, timeZone, startHour, startMinute);
  let end = setTimeInTimeZone(localDay, timeZone, endHour, endMinute);
  if (end.getTime() <= start.getTime()) {
    end = setTimeInTimeZone(
      addDaysInTimeZone(localDay, 1, timeZone),
      timeZone,
      endHour,
      endMinute
    );
  }
  return { start, end };
}

function windowContainsInstance(
  instance: LocalRescheduleCleanupInstance,
  window: LocalRescheduleCleanupWindow,
  localDay: Date,
  timeZone: string
) {
  const bounds = resolveWindowBounds(window, localDay, timeZone);
  return (
    bounds.end.getTime() > bounds.start.getTime() &&
    instanceWithinBounds(instance, bounds)
  );
}

function findContainingBreakWindowInWindows(
  instance: LocalRescheduleCleanupInstance,
  windows: LocalRescheduleCleanupWindow[],
  localDay: Date,
  timeZone: string
) {
  return (
    windows.find(
      (window) =>
        window.window_kind === "BREAK" &&
        windowContainsInstance(instance, window, localDay, timeZone)
    ) ?? null
  );
}

function findContainingBreakWindowByExplicitBounds(
  instance: LocalRescheduleCleanupInstance,
  windowsByDayKey: WindowLookup,
  localDay: Date,
  timeZone: string
) {
  for (const windows of windowsByDayKey.values()) {
    const match = windows.find((window) => {
      if (window.window_kind !== "BREAK") return false;
      if (
        typeof window.dayTypeStartUtcMs !== "number" ||
        !Number.isFinite(window.dayTypeStartUtcMs) ||
        typeof window.dayTypeEndUtcMs !== "number" ||
        !Number.isFinite(window.dayTypeEndUtcMs)
      ) {
        return false;
      }
      return windowContainsInstance(instance, window, localDay, timeZone);
    });
    if (match) return match;
  }
  return null;
}

function findContainingBreakWindow(
  instance: LocalRescheduleCleanupInstance,
  windowsByDayKey: WindowLookup,
  localDay: Date,
  timeZone: string
) {
  const explicitBoundsMatch = findContainingBreakWindowByExplicitBounds(
    instance,
    windowsByDayKey,
    localDay,
    timeZone
  );
  if (explicitBoundsMatch) return explicitBoundsMatch;

  const sameDayKey = formatDateKeyInTimeZone(localDay, timeZone);
  const sameDayWindows = windowsByDayKey.get(sameDayKey) ?? [];
  const sameDayMatch = findContainingBreakWindowInWindows(
    instance,
    sameDayWindows,
    localDay,
    timeZone
  );
  if (sameDayMatch) return sameDayMatch;

  const prevLocalDay = addDaysInTimeZone(localDay, -1, timeZone);
  const prevDayKey = formatDateKeyInTimeZone(prevLocalDay, timeZone);
  const prevDayWindows = windowsByDayKey.get(prevDayKey) ?? [];
  return (
    findContainingBreakWindowInWindows(
      instance,
      prevDayWindows,
      prevLocalDay,
      timeZone
    ) ?? null
  );
}

function findMatchingWindow(
  instance: LocalRescheduleCleanupInstance,
  windows: LocalRescheduleCleanupWindow[],
  localDay: Date,
  timeZone: string
) {
  const invalid = { window: null, valid: false };

  const dayTypeId = instance.day_type_time_block_id ?? null;
  if (dayTypeId) {
    const matched = windows.find(
      (window) => window.dayTypeTimeBlockId === dayTypeId
    );
    if (!matched) return invalid;
    return {
      window: matched,
      valid: windowContainsInstance(instance, matched, localDay, timeZone),
    };
  }

  const timeBlockId = instance.time_block_id ?? instance.window_id ?? null;
  if (!timeBlockId) {
    const containedWindow = windows.find((window) =>
      windowContainsInstance(instance, window, localDay, timeZone)
    );
    if (!containedWindow) return invalid;
    return { window: containedWindow, valid: true };
  }

  const matched = windows.find((window) => window.id === timeBlockId);
  if (!matched) {
    return invalid;
  }
  return {
    window: matched,
    valid: windowContainsInstance(instance, matched, localDay, timeZone),
  };
}

function instanceWithinBounds(
  instance: LocalRescheduleCleanupInstance,
  bounds: { start: Date; end: Date }
) {
  const start = safeDate(instance.start_utc ?? null);
  const end = safeDate(instance.end_utc ?? null);
  if (!start || !end) return false;
  const startMs = start.getTime();
  const endMs = end.getTime();
  return startMs >= bounds.start.getTime() && endMs <= bounds.end.getTime();
}

function buildConstraintItem(
  instance: LocalRescheduleCleanupInstance,
  context: LocalRescheduleCleanupSourceContext | null
): ConstraintItem {
  const resolvedPracticeContext =
    context?.practiceContextId ?? instance.practice_context_monument_id ?? null;

  if (instance.source_type === "PROJECT") {
    return {
      skillId: context?.skillId ?? null,
      skillIds: context?.skillIds ?? null,
      monumentId: context?.monumentId ?? null,
      skillMonumentId: context?.skillMonumentId ?? null,
      monumentIds: context?.monumentIds ?? null,
      isProject: true,
    };
  }

  return {
    habitType: context?.habitType ?? null,
    skillId: context?.skillId ?? null,
    skillIds: context?.skillIds ?? null,
    monumentId: context?.monumentId ?? resolvedPracticeContext,
    skillMonumentId: context?.skillMonumentId ?? resolvedPracticeContext,
    monumentIds: context?.monumentIds ?? null,
    isProject: instance.source_type === "PROJECT",
  };
}

function compareCandidates(a: Candidate, b: Candidate) {
  if (a.windowRank !== b.windowRank) {
    return a.windowRank - b.windowRank;
  }
  if (a.projectWeight !== b.projectWeight) {
    return a.projectWeight - b.projectWeight;
  }
  if (a.updatedAtMs !== b.updatedAtMs) {
    return a.updatedAtMs - b.updatedAtMs;
  }
  if (a.startMs !== b.startMs) {
    return b.startMs - a.startMs;
  }
  return (b.instance.id ?? "").localeCompare(a.instance.id ?? "");
}

export function resolveLocalizedRescheduleCleanup(params: {
  instances: LocalRescheduleCleanupInstance[];
  windowsByDayKey: WindowLookup;
  timeZone: string;
  protectedInstanceId?: string | null;
  resolveSourceContext?: (
    instance: LocalRescheduleCleanupInstance
  ) => LocalRescheduleCleanupSourceContext | null;
}) {
  const protectedId = params.protectedInstanceId ?? null;
  const candidates: Candidate[] = [];
  const loserIds = new Set<string>();

  for (const instance of params.instances) {
    const instanceId = instance.id ?? "";
    if (!instanceId) continue;
    if (instance.status && instance.status !== "scheduled") {
      continue;
    }
    if (instance.locked === true) {
      continue;
    }
    const start = safeDate(instance.start_utc ?? null);
    const end = safeDate(instance.end_utc ?? null);
    if (!start || !end) {
      loserIds.add(instanceId);
      continue;
    }
    const startMs = start.getTime();
    const endMs = end.getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      loserIds.add(instanceId);
      continue;
    }

    const localDay = startOfDayInTimeZone(start, params.timeZone);
    const dayKey = formatDateKeyInTimeZone(localDay, params.timeZone);
    const windows = params.windowsByDayKey.get(dayKey) ?? [];
    if (
      findContainingBreakWindow(
        instance,
        params.windowsByDayKey,
        localDay,
        params.timeZone
      )
    ) {
      loserIds.add(instanceId);
      continue;
    }

    const { window, valid } = findMatchingWindow(
      instance,
      windows,
      localDay,
      params.timeZone
    );
    if (!window || !valid) {
      loserIds.add(instanceId);
      continue;
    }

    const constraintItem = buildConstraintItem(
      instance,
      params.resolveSourceContext?.(instance) ?? null
    );
    if (!passesTimeBlockConstraints(constraintItem, window)) {
      loserIds.add(instanceId);
      continue;
    }

    candidates.push({
      instance,
      startMs,
      endMs,
      windowRank: 2,
      projectWeight:
        instance.source_type === "PROJECT" &&
        typeof instance.weight_snapshot === "number" &&
          Number.isFinite(instance.weight_snapshot)
          ? instance.weight_snapshot
          : 0,
      updatedAtMs: safeDate(instance.updated_at ?? null)?.getTime() ?? 0,
      protectedFromOverlap: instanceId === protectedId,
    });
  }

  candidates.sort((a, b) => {
    if (a.startMs !== b.startMs) return a.startMs - b.startMs;
    if (a.endMs !== b.endMs) return a.endMs - b.endMs;
    return (a.instance.id ?? "").localeCompare(b.instance.id ?? "");
  });

  const active: Candidate[] = [];
  for (const current of candidates) {
    const currentId = current.instance.id ?? "";
    if (!currentId || loserIds.has(currentId)) continue;

    for (let index = active.length - 1; index >= 0; index -= 1) {
      const other = active[index];
      if (other.endMs <= current.startMs) {
        active.splice(index, 1);
        continue;
      }
      if (current.endMs <= other.startMs) continue;

      if (current.protectedFromOverlap !== other.protectedFromOverlap) {
        const loser = current.protectedFromOverlap ? other : current;
        const loserId = loser.instance.id ?? "";
        if (!loserId || loserId === protectedId) continue;
        loserIds.add(loserId);
        if (loserId === currentId) {
          break;
        }
        active.splice(index, 1);
        continue;
      }

      const loser = compareCandidates(current, other) < 0 ? current : other;
      const loserId = loser.instance.id ?? "";
      if (!loserId || loserId === protectedId) continue;
      loserIds.add(loserId);
      if (loserId === currentId) {
        break;
      }
      active.splice(index, 1);
    }

    if (!loserIds.has(currentId)) {
      active.push(current);
    }
  }

  return {
    loserIds: Array.from(loserIds),
  };
}
