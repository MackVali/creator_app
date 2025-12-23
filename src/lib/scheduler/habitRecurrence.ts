import type { HabitScheduleItem } from './habits'
import {
  addDaysInTimeZone,
  addMonthsInTimeZone,
  differenceInCalendarDaysInTimeZone,
  differenceInCalendarMonthsInTimeZone,
  getDatePartsInTimeZone,
  startOfDayInTimeZone,
  weekdayInTimeZone,
} from './timezone'
import { resolveEveryXDaysInterval } from '@/lib/recurrence'

export type HabitDueEvaluation = {
  isDue: boolean
  dueStart: Date | null
  debugTag?: string
}

type EvaluateParams = {
  habit: HabitScheduleItem
  date: Date
  timeZone: string
  windowDays?: number[] | null
  lastScheduledStart?: Date | null
  nextDueOverride?: Date | null
}

const DAILY_RECURRENCES = new Set(['daily', 'none', 'everyday', ''])
const DAY_INTERVALS: Record<string, number> = {
  weekly: 7,
  'bi-weekly': 14,
}
const MONTH_INTERVALS: Record<string, number> = {
  monthly: 1,
  'bi-monthly': 2,
  'every 6 months': 6,
  yearly: 12,
}

function normalizeRecurrence(value: string | null | undefined) {
  if (!value) return 'daily'
  return value.toLowerCase().trim()
}

function parseIsoDate(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function normalizeDayList(days?: number[] | null) {
  if (!days || days.length === 0) return null
  const normalized = Array.from(
    new Set(
      days
        .map(day => Number(day))
        .filter(day => Number.isFinite(day))
        .map(day => {
          const remainder = day % 7
          return remainder < 0 ? remainder + 7 : remainder
        }),
    ),
  )
  return normalized.length > 0 ? normalized : null
}

function parseEveryDays(value: string) {
  const match = /^every\s+(\d+)\s+days?/i.exec(value)
  if (!match) return null
  const raw = Number(match[1])
  return Number.isFinite(raw) && raw > 0 ? raw : null
}

function resolveCustomDayInterval(
  recurrence: string,
  recurrenceDays?: number[] | null,
) {
  if (recurrence === 'every x days') {
    return resolveEveryXDaysInterval(recurrence, recurrenceDays)
  }
  return parseEveryDays(recurrence)
}

function isDailyRecurrence(recurrence: string) {
  return DAILY_RECURRENCES.has(recurrence)
}

function computeChoreDueStart(
  lastCompletedStart: Date,
  recurrence: string,
  timeZone: string,
  recurrenceDays?: number[] | null,
) {
  const dayInterval =
    DAY_INTERVALS[recurrence] ?? resolveCustomDayInterval(recurrence, recurrenceDays)
  if (typeof dayInterval === 'number' && dayInterval > 0) {
    return addDaysInTimeZone(lastCompletedStart, dayInterval, timeZone)
  }
  const monthInterval = MONTH_INTERVALS[recurrence]
  if (typeof monthInterval === 'number' && monthInterval > 0) {
    return addMonthsInTimeZone(lastCompletedStart, monthInterval, timeZone)
  }
  return addDaysInTimeZone(lastCompletedStart, 1, timeZone)
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function evaluateHabitDueOnDate(params: EvaluateParams): HabitDueEvaluation {
  const { habit, date, timeZone, windowDays, lastScheduledStart, nextDueOverride } = params
  const zone = timeZone || 'UTC'
  const recurrence = normalizeRecurrence(habit.recurrence)
  const dayStart = startOfDayInTimeZone(date, zone)
  const nextDueOverrideStart = nextDueOverride
    ? startOfDayInTimeZone(nextDueOverride, zone)
    : null
  if (nextDueOverrideStart) {
    if (nextDueOverrideStart.getTime() > dayStart.getTime()) {
      return {
        isDue: false,
        dueStart: nextDueOverrideStart,
        debugTag: 'NEXT_DUE_OVERRIDE_FUTURE',
      }
    }
    return {
      isDue: true,
      dueStart: nextDueOverrideStart,
      debugTag: 'NEXT_DUE_OVERRIDE_REACHED',
    }
  }
  const scheduleAnchorOverride =
    lastScheduledStart ? startOfDayInTimeZone(lastScheduledStart, zone) : null
  const lastCompletionRaw = habit.lastCompletedAt ?? null
  const lastCompletionDate = parseIsoDate(lastCompletionRaw)
  const lastCompletionStart =
    lastCompletionDate !== null ? startOfDayInTimeZone(lastCompletionDate, zone) : null
  if (scheduleAnchorOverride && scheduleAnchorOverride.getTime() === dayStart.getTime()) {
    return { isDue: false, dueStart: null, debugTag: 'LAST_SCHEDULED_TODAY' }
  }
  if (lastCompletionStart && lastCompletionStart.getTime() === dayStart.getTime()) {
    return { isDue: false, dueStart: null, debugTag: 'LAST_COMPLETED_TODAY' }
  }
  const habitType = (habit.habitType ?? 'HABIT').toUpperCase()
  const resolvedRecurrenceDays = normalizeDayList(habit.recurrenceDays ?? null)
  const resolvedWindowDays = normalizeDayList(windowDays ?? habit.window?.days ?? null)
  const activeDayList =
    resolvedRecurrenceDays && resolvedRecurrenceDays.length > 0
      ? resolvedRecurrenceDays
      : resolvedWindowDays

  const dayInterval =
    DAY_INTERVALS[recurrence] ?? resolveCustomDayInterval(recurrence, habit.recurrenceDays)
  const monthInterval = MONTH_INTERVALS[recurrence]
  const requiresCompletionInterval =
    habitType === 'CHORE' &&
    !isDailyRecurrence(recurrence) &&
    ((typeof dayInterval === 'number' && dayInterval > 1) || typeof monthInterval === 'number')

  if (requiresCompletionInterval) {
    const lastCompletionRaw =
      habit.lastCompletedAt ?? habit.updatedAt ?? habit.createdAt ?? null
    const lastCompletionDate = parseIsoDate(lastCompletionRaw)
    const completionStart = lastCompletionDate
      ? startOfDayInTimeZone(lastCompletionDate, zone)
      : null
    const lastStart =
      scheduleAnchorOverride &&
      (!completionStart || scheduleAnchorOverride.getTime() > completionStart.getTime())
        ? scheduleAnchorOverride
        : completionStart

    if (!lastStart) {
      return { isDue: true, dueStart: dayStart, debugTag: 'CHORE_NO_ANCHOR' }
    }

    const dueStart = computeChoreDueStart(lastStart, recurrence, zone, habit.recurrenceDays)
    if (!dueStart) {
      return { isDue: true, dueStart: dayStart, debugTag: 'CHORE_NO_DUE_START' }
    }

    const isDue = dayStart.getTime() >= dueStart.getTime()
    return {
      isDue,
      dueStart,
      debugTag: isDue ? 'CHORE_INTERVAL_REACHED' : 'CHORE_INTERVAL_NOT_REACHED',
    }
  }

  if (activeDayList && activeDayList.length > 0) {
    const weekday = weekdayInTimeZone(dayStart, zone)
    if (!activeDayList.includes(weekday)) {
      return { isDue: false, dueStart: null, debugTag: 'RECURRENCE_DAY_MISMATCH' }
    }
  }

  if (isDailyRecurrence(recurrence)) {
    return { isDue: true, dueStart: dayStart, debugTag: 'DUE_DAILY' }
  }

  const anchorRaw = habit.createdAt ?? habit.updatedAt ?? null
  const anchorDate = parseIsoDate(anchorRaw)
  let anchorStart = scheduleAnchorOverride
  if (!anchorStart) {
    anchorStart = anchorDate ? startOfDayInTimeZone(anchorDate, zone) : null
  }
  if (!anchorStart) {
    return { isDue: true, dueStart: dayStart, debugTag: 'DUE_NO_ANCHOR' }
  }

  switch (recurrence) {
    case 'weekly': {
      const diffDays = differenceInCalendarDaysInTimeZone(anchorStart, dayStart, zone)
      if (diffDays < 0 || diffDays % 7 !== 0) {
        return { isDue: false, dueStart: null, debugTag: 'WEEKLY_INTERVAL_NOT_REACHED' }
      }
      const weekday = weekdayInTimeZone(dayStart, zone)
      if (activeDayList && activeDayList.length > 0) {
        if (!activeDayList.includes(weekday)) {
          return { isDue: false, dueStart: null, debugTag: 'WEEKLY_DAY_MISMATCH' }
        }
      } else {
        const anchorWeekday = weekdayInTimeZone(anchorStart, zone)
        if (weekday !== anchorWeekday) {
          return { isDue: false, dueStart: null, debugTag: 'WEEKLY_DAY_MISMATCH' }
        }
      }
      return { isDue: true, dueStart: dayStart, debugTag: 'DUE_WEEKLY' }
    }
    case 'bi-weekly': {
      const diffDays = differenceInCalendarDaysInTimeZone(anchorStart, dayStart, zone)
      if (diffDays < 0 || diffDays % 14 !== 0) {
        return {
          isDue: false,
          dueStart: null,
          debugTag: 'BIWEEKLY_INTERVAL_NOT_REACHED',
        }
      }
      const weekday = weekdayInTimeZone(dayStart, zone)
      if (activeDayList && activeDayList.length > 0) {
        if (!activeDayList.includes(weekday)) {
          return { isDue: false, dueStart: null, debugTag: 'BIWEEKLY_DAY_MISMATCH' }
        }
      } else {
        const anchorWeekday = weekdayInTimeZone(anchorStart, zone)
        if (weekday !== anchorWeekday) {
          return { isDue: false, dueStart: null, debugTag: 'BIWEEKLY_DAY_MISMATCH' }
        }
      }
      return { isDue: true, dueStart: dayStart, debugTag: 'DUE_BIWEEKLY' }
    }
    case 'monthly':
    case 'bi-monthly':
    case 'every 6 months':
    case 'yearly': {
      const monthsDiff = differenceInCalendarMonthsInTimeZone(anchorStart, dayStart, zone)
      if (monthsDiff < 0) {
        return { isDue: false, dueStart: null, debugTag: 'MONTHLY_INTERVAL_NOT_REACHED' }
      }
      const interval = MONTH_INTERVALS[recurrence] ?? 12
      if (monthsDiff % interval !== 0) {
        return { isDue: false, dueStart: null, debugTag: 'MONTHLY_INTERVAL_NOT_REACHED' }
      }
      const anchorParts = getDatePartsInTimeZone(anchorStart, zone)
      const targetParts = getDatePartsInTimeZone(dayStart, zone)
      const expectedDay = Math.min(anchorParts.day, daysInMonth(targetParts.year, targetParts.month))
      if (targetParts.day !== expectedDay) {
        return { isDue: false, dueStart: null, debugTag: 'MONTHLY_DAY_MISMATCH' }
      }
      return { isDue: true, dueStart: dayStart, debugTag: 'DUE_MONTHLY' }
    }
    default: {
      const everyDays = resolveCustomDayInterval(recurrence, habit.recurrenceDays)
      if (typeof everyDays === 'number' && everyDays > 1) {
        const diffDays = differenceInCalendarDaysInTimeZone(anchorStart, dayStart, zone)
        if (diffDays < 0 || diffDays % everyDays !== 0) {
          return {
            isDue: false,
            dueStart: null,
            debugTag: 'EVERY_X_DAYS_INTERVAL_NOT_REACHED',
          }
        }
        return { isDue: true, dueStart: dayStart, debugTag: 'DUE_EVERY_X_DAYS' }
      }
      return { isDue: true, dueStart: dayStart, debugTag: 'DUE_FALLBACK' }
    }
  }
}
