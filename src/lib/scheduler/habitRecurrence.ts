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

export type HabitDueEvaluation = {
  isDue: boolean
  dueStart: Date | null
}

type EvaluateParams = {
  habit: HabitScheduleItem
  date: Date
  timeZone: string
  windowDays?: number[] | null
}

const DAILY_RECURRENCES = new Set(['daily', 'none', 'everyday', ''])
const DAY_INTERVALS: Record<string, number> = {
  weekly: 7,
  'bi-weekly': 14,
}
const MONTH_INTERVALS: Record<string, number> = {
  monthly: 1,
  'bi-monthly': 2,
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

const RECURRENCE_DAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

function resolveRecurrenceDays(days?: string[] | null) {
  if (!days || days.length === 0) return null
  const normalized = Array.from(
    new Set(
      days
        .map(day => (typeof day === 'string' ? day.toLowerCase().trim() : ''))
        .map(day => RECURRENCE_DAY_INDEX[day] ?? null)
        .filter((value): value is number => typeof value === 'number' && value >= 0 && value <= 6),
    ),
  )
  return normalized.length > 0 ? normalized : null
}

function parseEveryDays(value: string) {
  const match = /^every\s+(\d+)\s+days?/i.exec(value.trim())
  if (!match) return null
  const raw = Number(match[1])
  return Number.isFinite(raw) && raw > 0 ? raw : null
}

function isDailyRecurrence(recurrence: string) {
  return DAILY_RECURRENCES.has(recurrence)
}

function computeChoreDueStart(
  lastCompletedStart: Date,
  recurrence: string,
  timeZone: string,
) {
  const dayInterval = DAY_INTERVALS[recurrence] ?? parseEveryDays(recurrence)
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
  const { habit, date, timeZone, windowDays } = params
  const zone = timeZone || 'UTC'
  const recurrence = normalizeRecurrence(habit.recurrence)
  const dayStart = startOfDayInTimeZone(date, zone)
  const habitType = (habit.habitType ?? 'HABIT').toUpperCase()
  const resolvedWindowDays = resolveWindowDays(windowDays ?? habit.window?.days ?? null)
  const resolvedRecurrenceDays = resolveRecurrenceDays(habit.recurrenceDays)
  const weekday = weekdayInTimeZone(dayStart, zone)

  if (
    (resolvedRecurrenceDays && !resolvedRecurrenceDays.includes(weekday)) ||
    (resolvedWindowDays && !resolvedWindowDays.includes(weekday))
  ) {
    return { isDue: false, dueStart: null }
  }

  const dayInterval = DAY_INTERVALS[recurrence] ?? parseEveryDays(recurrence)
  const monthInterval = MONTH_INTERVALS[recurrence]
  const requiresCompletionInterval =
    habitType === 'CHORE' &&
    !isDailyRecurrence(recurrence) &&
    ((typeof dayInterval === 'number' && dayInterval > 1) || typeof monthInterval === 'number')

  if (requiresCompletionInterval) {
    const lastCompletionRaw =
      habit.lastCompletedAt ?? habit.updatedAt ?? habit.createdAt ?? null
    const lastCompletionDate = parseIsoDate(lastCompletionRaw)
    const lastStart = lastCompletionDate
      ? startOfDayInTimeZone(lastCompletionDate, zone)
      : null

    if (!lastStart) {
      return { isDue: true, dueStart: dayStart }
    }

    const dueStart = computeChoreDueStart(lastStart, recurrence, zone)
    if (!dueStart) {
      return { isDue: true, dueStart: dayStart }
    }

    const isDue = dayStart.getTime() >= dueStart.getTime()
    return { isDue, dueStart }
  }

  if (isDailyRecurrence(recurrence)) {
    return { isDue: true, dueStart: dayStart }
  }

  const anchorRaw = habit.createdAt ?? habit.updatedAt ?? null
  const anchorDate = parseIsoDate(anchorRaw)
  const anchorStart = anchorDate ? startOfDayInTimeZone(anchorDate, zone) : null
  if (!anchorStart) {
    return { isDue: true, dueStart: dayStart }
  }

  switch (recurrence) {
    case 'weekly': {
      if (
        (!resolvedWindowDays || resolvedWindowDays.length === 0) &&
        (!resolvedRecurrenceDays || resolvedRecurrenceDays.length === 0)
      ) {
        const anchorWeekday = weekdayInTimeZone(anchorStart, zone)
        if (weekday !== anchorWeekday) {
          return { isDue: false, dueStart: null }
        }
      }
      return { isDue: true, dueStart: dayStart }
    }
    case 'bi-weekly': {
      const diffDays = differenceInCalendarDaysInTimeZone(anchorStart, dayStart, zone)
      if (diffDays < 0 || diffDays % 14 !== 0) {
        return { isDue: false, dueStart: null }
      }
      if (
        (!resolvedWindowDays || resolvedWindowDays.length === 0) &&
        (!resolvedRecurrenceDays || resolvedRecurrenceDays.length === 0)
      ) {
        const anchorWeekday = weekdayInTimeZone(anchorStart, zone)
        if (weekday !== anchorWeekday) {
          return { isDue: false, dueStart: null }
        }
      }
      return { isDue: true, dueStart: dayStart }
    }
    case 'monthly':
    case 'bi-monthly':
    case 'yearly': {
      const monthsDiff = differenceInCalendarMonthsInTimeZone(anchorStart, dayStart, zone)
      if (monthsDiff < 0) {
        return { isDue: false, dueStart: null }
      }
      const interval = recurrence === 'monthly' ? 1 : recurrence === 'bi-monthly' ? 2 : 12
      if (monthsDiff % interval !== 0) {
        return { isDue: false, dueStart: null }
      }
      const anchorParts = getDatePartsInTimeZone(anchorStart, zone)
      const targetParts = getDatePartsInTimeZone(dayStart, zone)
      const expectedDay = Math.min(anchorParts.day, daysInMonth(targetParts.year, targetParts.month))
      if (targetParts.day !== expectedDay) {
        return { isDue: false, dueStart: null }
      }
      return { isDue: true, dueStart: dayStart }
    }
    default: {
      const everyDays = parseEveryDays(recurrence)
      if (typeof everyDays === 'number' && everyDays > 1) {
        const diffDays = differenceInCalendarDaysInTimeZone(anchorStart, dayStart, zone)
        if (diffDays < 0 || diffDays % everyDays !== 0) {
          return { isDue: false, dueStart: null }
        }
        return { isDue: true, dueStart: dayStart }
      }
      return { isDue: true, dueStart: dayStart }
    }
  }
}
