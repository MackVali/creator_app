import { DateTime } from 'luxon'

export function localWindowToUTC(dateLocalISO: string, timeZone: string): string {
  if (!dateLocalISO) throw new Error('Expected local ISO string')
  const dt = DateTime.fromISO(dateLocalISO, { zone: timeZone })
  if (!dt.isValid) throw new Error('Invalid local ISO string')
  const iso = dt.toUTC().toISO()
  if (!iso) throw new Error('Failed to convert local time to UTC')
  return iso
}

export function toZonedDateTime(isoUTC: string, timeZone: string): DateTime {
  return DateTime.fromISO(isoUTC, { zone: 'utc' }).setZone(timeZone)
}

export function zonedDateTimeToDate(dt: DateTime): Date {
  return new Date(
    dt.year,
    dt.month - 1,
    dt.day,
    dt.hour,
    dt.minute,
    dt.second,
    dt.millisecond
  )
}

export function getUtcDayRange(date: Date, timeZone: string) {
  const dt = DateTime.fromObject(
    {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
    },
    { zone: timeZone }
  )

  const start = dt.startOf('day').toUTC().toISO()
  const end = dt.plus({ days: 1 }).startOf('day').toUTC().toISO()
  if (!start || !end) throw new Error('Failed to compute UTC range for date')
  return { startUTC: start, endUTC: end }
}

export function nowInZone(timeZone: string): DateTime {
  return DateTime.now().setZone(timeZone)
}
