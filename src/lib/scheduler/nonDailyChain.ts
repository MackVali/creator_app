import type { HabitScheduleItem } from "./habits";
import {
  normalizeRecurrence,
  resolveRecurrenceInterval,
} from "./habitRecurrence";
import { safeDate } from "./safeDate";
import { getDateTimeParts, makeZonedDate, normalizeTimeZone } from "./timezone";

export type NonDailyRole = "PRIMARY" | "FORECAST";

export type NonDailyAnchor = {
  completedAtUtc: string;
};

export type NonDailyChainPlan = {
  anchor: NonDailyAnchor;
  primary: { dueAtUtc: string; minStartUtc: string };
  forecast: { dueAtUtc: string };
};

const DEFAULT_TIME_ZONE = "America/Chicago";

const normalizeIso = (
  value: string | Date | null | undefined,
  fallback: Date
): string => {
  const parsed =
    value instanceof Date
      ? value
      : value
      ? safeDate(value) ?? fallback
      : fallback;
  return parsed.toISOString();
};

const addDaysKeepingWallClock = (
  value: Date,
  days: number,
  timeZone: string
) => {
  if (!Number.isFinite(days) || days === 0) return new Date(value);
  const parts = getDateTimeParts(value, timeZone);
  const start = makeZonedDate(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: parts.hour,
      minute: parts.minute,
      second: parts.second,
    },
    timeZone
  );
  start.setUTCDate(start.getUTCDate() + days);
  return start;
};

const addMonthsKeepingWallClock = (
  value: Date,
  months: number,
  timeZone: string
) => {
  if (!Number.isFinite(months) || months === 0) return new Date(value);
  const parts = getDateTimeParts(value, timeZone);
  const baseMonthIndex = parts.month - 1;
  let targetMonthIndex = baseMonthIndex + months;
  const targetYear = parts.year + Math.floor(targetMonthIndex / 12);
  targetMonthIndex %= 12;
  if (targetMonthIndex < 0) {
    targetMonthIndex += 12;
  }
  const targetMonth = targetMonthIndex + 1;
  const daysInTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth, 0)
  ).getUTCDate();
  const targetDay = Math.min(parts.day, daysInTargetMonth);
  return makeZonedDate(
    {
      year: targetYear,
      month: targetMonth,
      day: targetDay,
      hour: parts.hour,
      minute: parts.minute,
      second: parts.second,
    },
    timeZone
  );
};

export function computeNonDailyAnchor(
  habit: HabitScheduleItem,
  timeZone = DEFAULT_TIME_ZONE
): NonDailyAnchor {
  const zone = normalizeTimeZone(timeZone ?? DEFAULT_TIME_ZONE);
  const fallback = makeZonedDate(
    {
      year: 1970,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
    },
    zone
  );
  const anchorIso = normalizeIso(
    habit.lastCompletedAt ??
      habit.createdAt ??
      habit.updatedAt ??
      new Date().toISOString(),
    fallback
  );
  return { completedAtUtc: anchorIso };
}

export function addRecurrenceIntervalUtc(
  dateUtc: string,
  habit: HabitScheduleItem,
  timeZone = DEFAULT_TIME_ZONE
): string {
  const zone = normalizeTimeZone(timeZone ?? DEFAULT_TIME_ZONE);
  const baseRaw = safeDate(dateUtc) ?? new Date(dateUtc);
  const base =
    Number.isNaN(baseRaw.getTime()) || !Number.isFinite(baseRaw.getTime())
      ? new Date()
      : baseRaw;
  const recurrence = normalizeRecurrence(habit.recurrence);
  const interval = resolveRecurrenceInterval(
    recurrence,
    habit.recurrenceDays ?? null
  );
  const hasDayInterval =
    typeof interval.days === "number" && Number.isFinite(interval.days);
  const hasMonthInterval =
    typeof interval.months === "number" && Number.isFinite(interval.months);
  const fallbackDays = hasDayInterval || hasMonthInterval ? 0 : 1;
  if (hasDayInterval && interval.days !== null) {
    return addDaysKeepingWallClock(base, interval.days, zone).toISOString();
  }
  if (hasMonthInterval && interval.months !== null) {
    return addMonthsKeepingWallClock(base, interval.months, zone).toISOString();
  }
  return addDaysKeepingWallClock(base, fallbackDays, zone).toISOString();
}

export function computeNonDailyChainPlan(
  habit: HabitScheduleItem,
  nowUtc: string,
  timeZone = DEFAULT_TIME_ZONE
): NonDailyChainPlan {
  const zone = normalizeTimeZone(timeZone ?? DEFAULT_TIME_ZONE);
  const anchor = computeNonDailyAnchor(habit, zone);
  const primaryDueAtUtc = addRecurrenceIntervalUtc(
    anchor.completedAtUtc,
    habit,
    zone
  );
  const dueDateRaw = safeDate(primaryDueAtUtc) ?? new Date(primaryDueAtUtc);
  const dueDate =
    Number.isNaN(dueDateRaw.getTime()) || !Number.isFinite(dueDateRaw.getTime())
      ? new Date()
      : dueDateRaw;
  const nowRaw = safeDate(nowUtc) ?? new Date(nowUtc);
  const nowDate =
    Number.isNaN(nowRaw.getTime()) || !Number.isFinite(nowRaw.getTime())
      ? new Date()
      : nowRaw;
  const minStartDate =
    dueDate && nowDate
      ? new Date(Math.max(dueDate.getTime(), nowDate.getTime()))
      : dueDate ?? nowDate ?? new Date();

  const forecastDueAtUtc = addRecurrenceIntervalUtc(
    primaryDueAtUtc,
    habit,
    zone
  );

  return {
    anchor,
    primary: {
      dueAtUtc: dueDate.toISOString(),
      minStartUtc: minStartDate.toISOString(),
    },
    forecast: { dueAtUtc: forecastDueAtUtc },
  };
}

export function computeForecastDueAt(
  primaryPlacedStartUtc: string,
  habit: HabitScheduleItem,
  timeZone = DEFAULT_TIME_ZONE
): string {
  const zone = normalizeTimeZone(timeZone ?? DEFAULT_TIME_ZONE);
  return addRecurrenceIntervalUtc(primaryPlacedStartUtc, habit, zone);
}
