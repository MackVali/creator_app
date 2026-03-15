import type { HabitScheduleItem } from "./habits";
import {
  addDaysInTimeZone,
  addMonthsInTimeZone,
  differenceInCalendarDaysInTimeZone,
  differenceInCalendarMonthsInTimeZone,
  getDatePartsInTimeZone,
  startOfDayInTimeZone,
  weekdayInTimeZone,
} from "./timezone";
import { resolveEveryXDaysInterval } from "@/lib/recurrence";
import { log } from "@/lib/utils/logGate";

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

export function normalizeRecurrence(value: string | null | undefined): string {
  if (!value) return "daily";
  return value.toLowerCase().trim();
}

function parseIsoDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function normalizeDayList(days?: number[] | null): number[] | null {
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

export function resolveRecurrenceInterval(
  recurrence: string,
  recurrenceDays?: number[] | null
): { days: number | null; months: number | null } {
  if (recurrence in DAY_INTERVALS) {
    return { days: DAY_INTERVALS[recurrence], months: null };
  }
  if (recurrence in MONTH_INTERVALS) {
    return { days: null, months: MONTH_INTERVALS[recurrence] };
  }
  const everyDays = resolveCustomDayInterval(recurrence, recurrenceDays);
  if (typeof everyDays === "number" && everyDays > 0) {
    return { days: everyDays, months: null };
  }
  return { days: null, months: null };
}

export type RecurrenceMode = "INTERVAL" | "ANCHORED";
export type AnchorType = "DATE" | "DAY";

const WEEKDAY_NAME_TO_INDEX: Record<string, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

const VALID_ANCHOR_DAY_RANGE = { min: 1, max: 31 };

export function normalizeRecurrenceMode(value?: string | null): RecurrenceMode {
  const normalized = value?.toUpperCase().trim();
  if (normalized === "ANCHORED") return "ANCHORED";
  return "INTERVAL";
}

function parseAnchorType(value?: string | null): AnchorType | null {
  if (!value) return null;
  const normalized = value.toUpperCase().trim();
  if (normalized === "DATE") return "DATE";
  if (normalized === "DAY") return "DAY";
  return null;
}

function parseAnchorValue(
  type: AnchorType | null,
  value: string | number | null | undefined
): number | null {
  if (!type || value === undefined || value === null) return null;
  if (type === "DATE") {
    const normalized = Number(String(value).trim());
    if (Number.isInteger(normalized) && normalized >= VALID_ANCHOR_DAY_RANGE.min) {
      return Math.min(normalized, VALID_ANCHOR_DAY_RANGE.max);
    }
    return null;
  }
  if (type === "DAY") {
    if (typeof value === "number" && Number.isInteger(value)) {
      const delta = value % 7;
      return delta < 0 ? delta + 7 : delta;
    }
    const normalized = String(value).toUpperCase().trim();
    return WEEKDAY_NAME_TO_INDEX[normalized] ?? null;
  }
  return null;
}

function clampDayOfMonth(year: number, month: number, day: number) {
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.min(Math.max(1, day), maxDay);
}

function buildDateAnchorForMonth(
  baseDate: Date,
  dayValue: number,
  timeZone: string
): Date {
  const parts = getDatePartsInTimeZone(baseDate, timeZone);
  const targetDay = clampDayOfMonth(parts.year, parts.month, dayValue);
  const candidate = new Date(Date.UTC(parts.year, parts.month - 1, targetDay));
  return startOfDayInTimeZone(candidate, timeZone);
}

function alignToDateAnchor(
  anchorStart: Date,
  dayValue: number,
  timeZone: string
): Date {
  let cursor = anchorStart;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = buildDateAnchorForMonth(cursor, dayValue, timeZone);
    if (candidate.getTime() >= anchorStart.getTime()) {
      return candidate;
    }
    cursor = addMonthsInTimeZone(cursor, 1, timeZone);
  }
  return buildDateAnchorForMonth(cursor, dayValue, timeZone);
}

function alignToWeekdayAnchor(
  anchorStart: Date,
  weekday: number,
  timeZone: string
): Date {
  let cursor = startOfDayInTimeZone(anchorStart, timeZone);
  for (let step = 0; step < 7; step += 1) {
    if (weekdayInTimeZone(cursor, timeZone) === weekday) {
      return cursor;
    }
    cursor = addDaysInTimeZone(cursor, 1, timeZone);
  }
  return cursor;
}

function getAnchorPivot(habit: HabitScheduleItem, timeZone: string): Date | null {
  const rawAnchor = habit.anchorStartDate;
  if (!rawAnchor) return null;
  const parsed = parseIsoDate(rawAnchor);
  if (!parsed) return null;
  const anchorStart = startOfDayInTimeZone(parsed, timeZone);
  const anchorType = parseAnchorType(habit.anchorType);
  const anchorValue = parseAnchorValue(anchorType, habit.anchorValue);
  if (anchorType === "DATE" && anchorValue !== null) {
    return alignToDateAnchor(anchorStart, anchorValue, timeZone);
  }
  if (anchorType === "DAY" && anchorValue !== null) {
    return alignToWeekdayAnchor(anchorStart, anchorValue, timeZone);
  }
  return anchorStart;
}

type AnchoredOccurrence = {
  due: Date;
  next: Date;
};

function getAnchoredOccurrence(
  pivot: Date,
  intervalDays: number | null,
  intervalMonths: number | null,
  referenceDate: Date,
  timeZone: string
): AnchoredOccurrence | null {
  if (intervalDays && intervalDays > 0) {
    const dayDelta = differenceInCalendarDaysInTimeZone(
      pivot,
      referenceDate,
      timeZone
    );
    const steps = Math.max(0, Math.floor(dayDelta / intervalDays));
    const due = addDaysInTimeZone(pivot, steps * intervalDays, timeZone);
    return {
      due,
      next: addDaysInTimeZone(due, intervalDays, timeZone),
    };
  }
  if (intervalMonths && intervalMonths > 0) {
    const monthDelta = differenceInCalendarMonthsInTimeZone(
      pivot,
      referenceDate,
      timeZone
    );
    const steps = Math.max(0, Math.floor(monthDelta / intervalMonths));
    const due = addMonthsInTimeZone(pivot, steps * intervalMonths, timeZone);
    return {
      due,
      next: addMonthsInTimeZone(due, intervalMonths, timeZone),
    };
  }
  return null;
}

type AnchoredRequest = {
  habit: HabitScheduleItem;
  referenceDate: Date;
  timeZone: string;
};

function getActiveAnchoredOccurrence(
  params: AnchoredRequest
): AnchoredOccurrence | null {
  const { habit, referenceDate, timeZone } = params;
  const pivot = getAnchorPivot(habit, timeZone);
  if (!pivot) return null;
  const recurrence = normalizeRecurrence(habit.recurrence ?? "");
  const { days, months } = resolveRecurrenceInterval(
    recurrence,
    habit.recurrenceDays
  );
  return getAnchoredOccurrence(pivot, days, months, referenceDate, timeZone);
}

export function nextOnOrAfterAllowedWeekday(
  startLocalDay: Date,
  allowedWeekdays: number[],
  tz: string
): Date {
  const normalizedDays = normalizeDayList(allowedWeekdays);
  if (!normalizedDays || normalizedDays.length === 0) {
    return startOfDayInTimeZone(startLocalDay, tz);
  }
  let cursor = startOfDayInTimeZone(startLocalDay, tz);
  const allowed = new Set(normalizedDays);
  for (let guard = 0; guard < 14; guard += 1) {
    const weekday = weekdayInTimeZone(cursor, tz);
    if (allowed.has(weekday)) {
      return cursor;
    }
    cursor = addDaysInTimeZone(cursor, 1, tz);
  }
  return cursor;
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

type EvaluateAnchoredParams = {
  habit: HabitScheduleItem;
  date: Date;
  timeZone: string;
  windowDays?: number[] | null;
  lastScheduledStart?: Date | null;
};

function evaluateAnchoredHabitDueOnDate(
  params: EvaluateAnchoredParams
): HabitDueEvaluation {
  const { habit, date, timeZone, windowDays, lastScheduledStart } = params;
  const zone = timeZone || "UTC";
  const dayStart = startOfDayInTimeZone(date, zone);
  const recurrence = normalizeRecurrence(habit.recurrence);
  const anchorOccurrence = getActiveAnchoredOccurrence({
    habit,
    referenceDate: dayStart,
    timeZone: zone,
  });
  if (!anchorOccurrence) {
    return { isDue: false, dueStart: null, debugTag: "ANCHOR_CONFIG_MISSING" };
  }
  const dueStart = anchorOccurrence.due;
  if (dayStart.getTime() < dueStart.getTime()) {
    return {
      isDue: false,
      dueStart,
      debugTag: "ANCHOR_NOT_REACHED",
    };
  }
  if (lastScheduledStart) {
    const lastScheduledDay = startOfDayInTimeZone(lastScheduledStart, zone);
    if (lastScheduledDay.getTime() === dayStart.getTime()) {
      return {
        isDue: false,
        dueStart: null,
        debugTag: "LAST_SCHEDULED_TODAY",
      };
    }
  }
  const lastCompletionDate = parseIsoDate(habit.lastCompletedAt ?? null);
  const lastCompletionStart = lastCompletionDate
    ? startOfDayInTimeZone(lastCompletionDate, zone)
    : null;
  if (
    lastCompletionStart &&
    lastCompletionStart.getTime() >= dueStart.getTime()
  ) {
    return {
      isDue: false,
      dueStart: null,
      debugTag: "ANCHOR_ALREADY_COMPLETED",
    };
  }
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
          debugTag: "ANCHOR_DAY_MISMATCH",
        };
      }
    }
  }
  return {
    isDue: true,
    dueStart,
    debugTag:
      dayStart.getTime() === dueStart.getTime()
        ? "ANCHOR_DUE_ON_DAY"
        : "ANCHOR_OVERDUE",
  };
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

  const result = (() => {
    const zone = timeZone || "UTC";
    const recurrence = normalizeRecurrence(habit.recurrence);
    const dayStart = startOfDayInTimeZone(date, zone);
    const nextDueOverrideStart = nextDueOverride
      ? startOfDayInTimeZone(nextDueOverride, zone)
      : null;
    if (nextDueOverrideStart) {
      const overrideMs = nextDueOverrideStart.getTime();
      const dayMs = dayStart.getTime();
      if (dayMs < overrideMs) {
        return {
          isDue: false,
          dueStart: nextDueOverrideStart,
          debugTag: "NEXT_DUE_OVERRIDE_FUTURE",
        };
      }
      if (dayMs === overrideMs) {
        return {
          isDue: true,
          dueStart: nextDueOverrideStart,
          debugTag: "NEXT_DUE_OVERRIDE_SLOT",
        };
      }
    }
    const recurrenceMode = normalizeRecurrenceMode(habit.recurrenceMode);
    if (recurrenceMode === "ANCHORED") {
      return evaluateAnchoredHabitDueOnDate({
        habit,
        date,
        timeZone: zone,
        windowDays,
        lastScheduledStart,
      });
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
  })();

  // Debug logging guarded by env flag
  if (process.env.DEBUG_LAST_COMPLETED_AT === "true") {
    log("debug", "LAST_COMPLETED_AT_DEBUG", {
      habitId: habit.id,
      lastCompletedAtMerged: habit.lastCompletedAt,
      evalDate: date.toISOString(),
      userTz: timeZone,
      tag: result.debugTag,
      dueStartIso: result.dueStart?.toISOString() ?? null,
    });
  }

  return result;
}

export function getHabitNextDue(params: {
  habit: HabitScheduleItem;
  timeZone: string;
  referenceDate?: Date;
  nextDueOverride?: string | null;
}): Date | null {
  const { habit, timeZone, referenceDate, nextDueOverride } = params;
  const zone = timeZone || "UTC";
  const baseDate = referenceDate ?? new Date();
  const dayStart = startOfDayInTimeZone(baseDate, zone);
  const overrideDate = parseIsoDate(nextDueOverride ?? null);
  if (overrideDate) {
    return startOfDayInTimeZone(overrideDate, zone);
  }

  const recurrence = normalizeRecurrence(habit.recurrence);
  if (recurrence === "none") {
    return null;
  }

  const recurrenceMode = normalizeRecurrenceMode(habit.recurrenceMode);
  if (recurrenceMode === "ANCHORED") {
    const occurrence = getActiveAnchoredOccurrence({
      habit,
      referenceDate: dayStart,
      timeZone: zone,
    });
    if (!occurrence) {
      return null;
    }
    return occurrence.due.getTime() >= dayStart.getTime()
      ? occurrence.due
      : occurrence.next;
  }

  if (isDailyRecurrence(recurrence)) {
    const recurrenceDayList = normalizeDayList(habit.recurrenceDays ?? null);
    const windowDayList = normalizeDayList(habit.window?.days ?? null);
    const activeDayList =
      recurrenceDayList && recurrenceDayList.length > 0
        ? recurrenceDayList
        : windowDayList;
    const normalizedDays = activeDayList ?? [];
    return nextOnOrAfterAllowedWeekday(dayStart, normalizedDays, zone);
  }

  const created = parseIsoDate(habit.createdAt ?? null);
  const updated = parseIsoDate(habit.updatedAt ?? null);
  const anchorDate = created ?? updated ?? null;
  const anchorStart = anchorDate
    ? startOfDayInTimeZone(anchorDate, zone)
    : dayStart;
  const lastCompletionDate = parseIsoDate(habit.lastCompletedAt ?? null);
  const lastCompletionStart = lastCompletionDate
    ? startOfDayInTimeZone(lastCompletionDate, zone)
    : null;
  const lastStart = lastCompletionStart ?? anchorStart ?? dayStart;
  if (!lastStart) {
    return dayStart;
  }
  return resolveDueStartForRecurrence({
    recurrence,
    habit,
    lastStart,
    timeZone: zone,
  });
}
