export type DateParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  millisecond: number
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

const FALLBACK_TIMEZONES = [
  'UTC',
  'Etc/UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Madrid',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Australia/Sydney',
]

export function localWindowToUTC(dateLocalISO: string): string {
  if (!dateLocalISO) throw new Error('Expected local ISO string')
  const [datePart, timePart = '00:00:00'] = dateLocalISO.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour = 0, minute = 0, second = 0] = timePart
    .split(':')
    .map(value => Number(value))
  const localDate = new Date(year, (month ?? 1) - 1, day ?? 1, hour, minute, second)
  return localDate.toISOString()
}

export function getResolvedTimeZone(): string | null {
  if (typeof Intl === 'undefined' || typeof Intl.DateTimeFormat !== 'function') {
    return null
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null
  } catch (error) {
    console.warn('Failed to resolve user timezone', error)
    return null
  }
}

export function listTimeZones(): string[] {
  if (typeof Intl !== 'undefined' && typeof (Intl as any).supportedValuesOf === 'function') {
    try {
      return (Intl as any).supportedValuesOf('timeZone') as string[]
    } catch (error) {
      console.warn('Intl.supportedValuesOf(timeZone) failed', error)
    }
  }
  return [...FALLBACK_TIMEZONES]
}

export function formatTimeZoneLabel(timeZone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
    })
    const parts = formatter.formatToParts(new Date())
    const tzName = parts.find(part => part.type === 'timeZoneName')?.value ?? ''
    const clean = tzName.replace('GMT', 'UTC')
    return clean ? `${timeZone} (${clean})` : timeZone
  } catch (error) {
    console.warn('Failed to format timezone label', timeZone, error)
    return timeZone
  }
}

export function toLocal(isoUTC: string, timeZone?: string | null): Date {
  const utcDate = new Date(isoUTC)
  if (!timeZone || Number.isNaN(utcDate.getTime())) return utcDate
  try {
    const parts = getZonedDateParts(utcDate, timeZone)
    return new Date(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    )
  } catch (error) {
    console.warn('Failed to convert UTC to local timezone', { isoUTC, timeZone, error })
    return utcDate
  }
}

export function getLocalDateKey(
  isoUTC: string,
  timeZone?: string | null,
): string {
  const date = new Date(isoUTC)
  if (!timeZone || Number.isNaN(date.getTime())) {
    return isoUTC.slice(0, 10)
  }
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    return formatter.format(date)
  } catch (error) {
    console.warn('Failed to format local date key', { isoUTC, timeZone, error })
    return isoUTC.slice(0, 10)
  }
}

export function parseDateKey(
  dateKey: string,
  timeZone?: string | null,
): Date {
  if (!dateKey) return new Date(NaN)
  const [yearStr, monthStr, dayStr] = dateKey.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  if (!timeZone) {
    return new Date(year, (month || 1) - 1, day || 1)
  }
  const utcDate = zonedDateTimeToUTC({
    year,
    month,
    day,
    hour: 12,
    minute: 0,
    second: 0,
    millisecond: 0,
  }, timeZone)
  return utcDate
}

export function addDaysToKey(
  dateKey: string,
  amount: number,
  timeZone?: string | null,
): string {
  if (!Number.isFinite(amount) || amount === 0) return dateKey
  const date = parseDateKey(dateKey, timeZone)
  if (Number.isNaN(date.getTime())) return dateKey
  date.setDate(date.getDate() + amount)
  return getLocalDateKey(date.toISOString(), timeZone)
}

export function getWeekdayFromKey(
  dateKey: string,
  timeZone?: string | null,
): number {
  const [yearStr, monthStr, dayStr] = dateKey.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  if (!timeZone) {
    return new Date(year, (month || 1) - 1, day || 1).getDay()
  }
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const parts = formatter.formatToParts(new Date(Date.UTC(year, (month || 1) - 1, day || 1)))
    const weekdayName =
      parts.find(part => part.type === 'weekday')?.value ?? formatter.format(new Date())
    return WEEKDAY_INDEX[weekdayName] ?? new Date(year, (month || 1) - 1, day || 1).getDay()
  } catch (error) {
    console.warn('Failed to resolve weekday for key', { dateKey, timeZone, error })
    return new Date(year, (month || 1) - 1, day || 1).getDay()
  }
}

export function getUTCDateRangeForKey(
  dateKey: string,
  timeZone?: string | null,
): { startUTC: string; endUTC: string } {
  const [yearStr, monthStr, dayStr] = dateKey.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  if (!timeZone) {
    const startUTC = new Date(Date.UTC(year, (month || 1) - 1, day || 1, 0, 0, 0, 0))
    const endUTC = new Date(Date.UTC(year, (month || 1) - 1, (day || 1) + 1, 0, 0, 0, 0))
    return { startUTC: startUTC.toISOString(), endUTC: endUTC.toISOString() }
  }
  const start = zonedDateTimeToUTC({
    year,
    month,
    day,
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  }, timeZone)
  const end = zonedDateTimeToUTC({
    year,
    month,
    day: day + 1,
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  }, timeZone)
  return { startUTC: start.toISOString(), endUTC: end.toISOString() }
}

export function getLocalTimeParts(
  isoUTC: string,
  timeZone?: string | null,
): DateParts {
  const date = new Date(isoUTC)
  if (Number.isNaN(date.getTime())) {
    return {
      year: Number.NaN,
      month: Number.NaN,
      day: Number.NaN,
      hour: Number.NaN,
      minute: Number.NaN,
      second: Number.NaN,
      millisecond: Number.NaN,
    }
  }

  if (!timeZone) {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
      millisecond: date.getUTCMilliseconds(),
    }
  }

  try {
    return getZonedDateParts(date, timeZone)
  } catch (error) {
    console.warn('Failed to resolve local time parts', { isoUTC, timeZone, error })
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
      millisecond: date.getUTCMilliseconds(),
    }
  }
}

function getZonedDateParts(date: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const read = (type: Intl.DateTimeFormatPartTypes, fallback: number) => {
    const value = parts.find(part => part.type === type)?.value
    return value !== undefined ? Number(value) : fallback
  }
  const fractional = parts.find(part => part.type === 'fractionalSecond')?.value ?? '0'
  const millisecond = Number(fractional.padEnd(3, '0').slice(0, 3))
  return {
    year: read('year', date.getUTCFullYear()),
    month: read('month', date.getUTCMonth() + 1),
    day: read('day', date.getUTCDate()),
    hour: read('hour', date.getUTCHours()),
    minute: read('minute', date.getUTCMinutes()),
    second: read('second', date.getUTCSeconds()),
    millisecond,
  }
}

function getTimeZoneOffsetMilliseconds(date: Date, timeZone: string): number {
  const parts = getZonedDateParts(date, timeZone)
  const asUTC = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  )
  return asUTC - date.getTime()
}

export function zonedDateTimeToUTC(
  parts: DateParts,
  timeZone: string,
): Date {
  const base = new Date(
    Date.UTC(
      parts.year,
      (parts.month || 1) - 1,
      parts.day || 1,
      parts.hour || 0,
      parts.minute || 0,
      parts.second || 0,
      parts.millisecond || 0,
    ),
  )
  const offset = getTimeZoneOffsetMilliseconds(base, timeZone)
  return new Date(base.getTime() - offset)
}
