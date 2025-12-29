import type { HabitScheduleItem } from "./habits";
import {
  addDaysInTimeZone,
  addMonthsInTimeZone,
  startOfDayInTimeZone,
  weekdayInTimeZone,
} from "./timezone";
import { resolveEveryXDaysInterval } from "@/lib/recurrence";

export type HabitDueEvaluation = {
  isDue: boolean;
  dueStart: Date | null;
  debugTag?: string;
};

type EvaluateParams = {
  habit: HabitScheduleItem;
  date: Date;
  timeZone: string;
  windowDays?: number[] | null;
  lastScheduledStart?: Date | null;
  nextDueOverride?: Date | null;
};

const DAILY_RECURRENCES = new Set(["daily", "none", "everyday", ""]);
const DAY_INTERVALS: Record<string, number> = {
  weekly: 7,
  "bi-weekly": 14,
};
const MONTH_INTERVALS: Record<string, number> = {
  monthly: 1,
  "bi-monthly": 2,
  "every 6 months": 6,
  yearly: 12,
};

function normalizeRecurrence(value: string | null | undefined) {
  if (!value) return "daily";
  return value.toLowerCase().trim();
}

function parseIsoDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizeDayList(days?: number[] | null) {
  if (!days || days.length === 0) return null;
  const normalized = Array.from(
    new Set(
      days
        .map((day) => Number(day))
        .filter((day) => Number.isFinite(day))
        .map((day) => {
          const remainder = day % 7;
          return remainder < 0 ? remainder + 7 : remainder;
        })
    )
  );
  return normalized.length > 0 ? normalized : null;
}

function parseEveryDays(value: string) {
  const match = /^every\s+(\d+)\s+days?/i.exec(value);
  if (!match) return null;
  const raw = Number(match[1]);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

function resolveCustomDayInterval(
  recurrence: string,
  recurrenceDays?: number[] | null
) {
  if (recurrence === "every x days") {
    return resolveEveryXDaysInterval(recurrence, recurrenceDays);
  }
  return parseEveryDays(recurrence);
}

function isDailyRecurrence(recurrence: string) {
  return DAILY_RECURRENCES.has(recurrence);
}

function resolveDueStartForRecurrence(params: {
  recurrence: string;
  habit: HabitScheduleItem;
  lastStart: Date;
  timeZone: string;
}): Date | null {
  const { recurrence, habit, lastStart, timeZone } = params;
  if (recurrence in DAY_INTERVALS) {
    return addDaysInTimeZone(lastStart, DAY_INTERVALS[recurrence], timeZone);
  }
  if (recurrence in MONTH_INTERVALS) {
    return addMonthsInTimeZone(
      lastStart,
      MONTH_INTERVALS[recurrence],
      timeZone
    );
  }
  const everyDays = resolveCustomDayInterval(recurrence, habit.recurrenceDays);
  if (typeof everyDays === "number" && everyDays > 0) {
    return addDaysInTimeZone(lastStart, everyDays, timeZone);
  }
  return null;
}

export function evaluateHabitDueOnDate(
  params: EvaluateParams
): HabitDueEvaluation {
  const {
    habit,
    date,
    timeZone,
    windowDays,
    lastScheduledStart,
    nextDueOverride,
  } = params;
  const zone = timeZone || "UTC";
  const recurrence = normalizeRecurrence(habit.recurrence);
  const dayStart = startOfDayInTimeZone(date, zone);
  const nextDueOverrideStart = nextDueOverride
    ? startOfDayInTimeZone(nextDueOverride, zone)
    : null;
  if (nextDueOverrideStart) {
    const overrideMs = nextDueOverrideStart.getTime();
    const dayMs = dayStart.getTime();
    if (overrideMs === dayMs) {
      return {
        isDue: true,
        dueStart: nextDueOverrideStart,
        debugTag: "NEXT_DUE_OVERRIDE_SLOT",
      };
    }
    if (overrideMs > dayMs) {
      return {
        isDue: false,
        dueStart: nextDueOverrideStart,
        debugTag: "NEXT_DUE_OVERRIDE_FUTURE",
      };
    }
  }
  const lastCompletionRaw = habit.lastCompletedAt ?? null;
  const lastCompletionDate = parseIsoDate(lastCompletionRaw);
  const lastCompletionStart =
    lastCompletionDate !== null
      ? startOfDayInTimeZone(lastCompletionDate, zone)
      : null;
  if (
    lastScheduledStart &&
    startOfDayInTimeZone(lastScheduledStart, zone).getTime() ===
      dayStart.getTime()
  ) {
    return { isDue: false, dueStart: null, debugTag: "LAST_SCHEDULED_TODAY" };
  }
  if (
    lastCompletionStart &&
    lastCompletionStart.getTime() === dayStart.getTime()
  ) {
    return { isDue: false, dueStart: null, debugTag: "LAST_COMPLETED_TODAY" };
  }
  const anchorRaw = habit.createdAt ?? habit.updatedAt ?? null;
  const anchorDate = parseIsoDate(anchorRaw);
  const anchorStart = anchorDate
    ? startOfDayInTimeZone(anchorDate, zone)
    : null;
  // Recurrence anchor must advance ONLY on completion
  const lastStart = lastCompletionStart ?? anchorStart;
  const hasCompletion = lastCompletionStart !== null;
  if (isDailyRecurrence(recurrence)) {
    const resolvedRecurrenceDays = normalizeDayList(
      habit.recurrenceDays ?? null
    );
    const resolvedWindowDays = normalizeDayList(
      windowDays ?? habit.window?.days ?? null
    );
    const activeDayList =
      resolvedRecurrenceDays && resolvedRecurrenceDays.length > 0
        ? resolvedRecurrenceDays
        : resolvedWindowDays;
    if (activeDayList && activeDayList.length > 0) {
      const weekday = weekdayInTimeZone(dayStart, zone);
      if (!activeDayList.includes(weekday)) {
        return {
          isDue: false,
          dueStart: null,
          debugTag: "RECURRENCE_DAY_MISMATCH",
        };
      }
    }
    return { isDue: true, dueStart: dayStart, debugTag: "DUE_DAILY" };
  }

  const resolvedDueStart = hasCompletion
    ? lastStart
      ? resolveDueStartForRecurrence({
          recurrence,
          habit,
          lastStart,
          timeZone: zone,
        }) ?? lastStart
      : dayStart
    : dayStart;
  if (dayStart.getTime() < resolvedDueStart.getTime()) {
    return {
      isDue: false,
      dueStart: resolvedDueStart,
      debugTag: "INTERVAL_NOT_REACHED",
    };
  }
  if (lastScheduledStart) {
    const lastScheduledDay = startOfDayInTimeZone(lastScheduledStart, zone);
    if (lastScheduledDay.getTime() === dayStart.getTime()) {
      return {
        isDue: false,
        dueStart: resolvedDueStart,
        debugTag: "ALREADY_SCHEDULED_TODAY",
      };
    }
  }
  if (!lastStart) {
    return { isDue: true, dueStart: dayStart, debugTag: "DUE_NO_ANCHOR" };
  }
  return { isDue: true, dueStart: resolvedDueStart, debugTag: "DUE_OVERDUE" };
}
