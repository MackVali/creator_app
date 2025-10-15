const dtfCache = new Map<string, Intl.DateTimeFormat>()

function getFormatter(timeZone: string) {
  let formatter = dtfCache.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    dtfCache.set(timeZone, formatter)
  }
  return formatter
}

type DateParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function getDateTimeParts(date: Date, timeZone: string): DateParts {
  const formatter = getFormatter(timeZone)
  const parts = formatter.formatToParts(date)
  const result: Partial<DateParts> = {}

  for (const part of parts) {
    if (part.type === 'literal') continue
    const value = Number(part.value)
    if (Number.isNaN(value)) continue
    if (part.type === 'year') result.year = value
    else if (part.type === 'month') result.month = value
    else if (part.type === 'day') result.day = value
    else if (part.type === 'hour') result.hour = value
    else if (part.type === 'minute') result.minute = value
    else if (part.type === 'second') result.second = value
  }
  const year = result.year ?? date.getUTCFullYear()
  const month = result.month ?? date.getUTCMonth() + 1
  const day = result.day ?? date.getUTCDate()
  let hour = result.hour ?? date.getUTCHours()
  const minute = result.minute ?? date.getUTCMinutes()
  const second = result.second ?? date.getUTCSeconds()

  if (hour === 24) {
    hour = 0
  }

  return { year, month, day, hour, minute, second }
}

function getTimeZoneOffset(date: Date, timeZone: string) {
  const parts = getDateTimeParts(date, timeZone)
  const utc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  return utc - date.getTime()
}

type ZonedDateInput = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second?: number
  millisecond?: number
}

function makeZonedDate(input: ZonedDateInput, timeZone: string) {
  const {
    year,
    month,
    day,
    hour,
    minute,
    second = 0,
    millisecond = 0,
  } = input
  const utc = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond))
  const offset = getTimeZoneOffset(utc, timeZone)
  return new Date(utc.getTime() - offset)
}

export function normalizeTimeZone(timeZone?: string | null) {
  if (!timeZone) return 'UTC'
  const trimmed = String(timeZone).trim()
  if (!trimmed) return 'UTC'
  try {
    // validate
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed })
    return trimmed
  } catch {
    return 'UTC'
  }
}

export function startOfDayInTimeZone(date: Date, timeZone: string) {
  const parts = getDateTimeParts(date, timeZone)
  return makeZonedDate(
    { year: parts.year, month: parts.month, day: parts.day, hour: 0, minute: 0, second: 0 },
    timeZone,
  )
}

export function addDaysInTimeZone(date: Date, amount: number, timeZone: string) {
  if (amount === 0) return new Date(date)
  const parts = getDateTimeParts(date, timeZone)
  const noon = makeZonedDate(
    { year: parts.year, month: parts.month, day: parts.day, hour: 12, minute: 0, second: 0 },
    timeZone,
  )
  noon.setUTCDate(noon.getUTCDate() + amount)
  return startOfDayInTimeZone(noon, timeZone)
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function addMonthsInTimeZone(date: Date, amount: number, timeZone: string) {
  if (amount === 0) {
    return startOfDayInTimeZone(date, timeZone)
  }

  const parts = getDatePartsInTimeZone(date, timeZone)
  const baseMonthIndex = parts.month - 1
  const targetMonthIndex = baseMonthIndex + amount
  const targetYear = parts.year + Math.floor(targetMonthIndex / 12)
  let normalizedMonthIndex = targetMonthIndex % 12
  if (normalizedMonthIndex < 0) {
    normalizedMonthIndex += 12
  }
  const targetMonth = normalizedMonthIndex + 1
  const maxDay = daysInMonth(targetYear, targetMonth)
  const targetDay = Math.min(parts.day, maxDay)

  return makeDateInTimeZone(
    { year: targetYear, month: targetMonth, day: targetDay, hour: 0, minute: 0 },
    timeZone,
  )
}

export function setTimeInTimeZone(date: Date, timeZone: string, hours: number, minutes: number) {
  const parts = getDateTimeParts(date, timeZone)
  return makeZonedDate(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: hours,
      minute: minutes,
      second: 0,
    },
    timeZone,
  )
}

export function differenceInCalendarDaysInTimeZone(
  base: Date,
  target: Date,
  timeZone: string,
) {
  const baseParts = getDateTimeParts(base, timeZone)
  const targetParts = getDateTimeParts(target, timeZone)
  const baseMid = makeZonedDate(
    { year: baseParts.year, month: baseParts.month, day: baseParts.day, hour: 12, minute: 0, second: 0 },
    timeZone,
  )
  const targetMid = makeZonedDate(
    { year: targetParts.year, month: targetParts.month, day: targetParts.day, hour: 12, minute: 0, second: 0 },
    timeZone,
  )
  const diffMs = targetMid.getTime() - baseMid.getTime()
  return Math.round(diffMs / (24 * 60 * 60 * 1000))
}

export function differenceInCalendarMonthsInTimeZone(
  base: Date,
  target: Date,
  timeZone: string,
) {
  const baseParts = getDatePartsInTimeZone(base, timeZone)
  const targetParts = getDatePartsInTimeZone(target, timeZone)
  return (targetParts.year - baseParts.year) * 12 + (targetParts.month - baseParts.month)
}

export function getDatePartsInTimeZone(date: Date, timeZone: string) {
  const parts = getDateTimeParts(date, timeZone)
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
  }
}

export function getDateTimeInTimeZone(date: Date, timeZone: string) {
  const parts = getDateTimeParts(date, timeZone)
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  }
}

export function weekdayInTimeZone(date: Date, timeZone: string) {
  const parts = getDateTimeParts(date, timeZone)
  const utcMidnight = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0))
  return utcMidnight.getUTCDay()
}

export function makeDateInTimeZone(
  input: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string,
) {
  return makeZonedDate({ ...input, second: 0, millisecond: 0 }, timeZone)
}
