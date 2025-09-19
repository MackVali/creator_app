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

const ISO_DATE_TIME_PARTS =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2})(?::(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?)?/

export function toLocal(isoUTC: string): Date {
  if (typeof isoUTC !== 'string') return new Date(isoUTC)
  const trimmed = isoUTC.trim()
  const match = trimmed.match(ISO_DATE_TIME_PARTS)
  if (!match) {
    return new Date(trimmed)
  }

  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr, milliStr] = match

  const year = Number(yearStr)
  const month = Number(monthStr) - 1
  const day = Number(dayStr)
  const hour = Number(hourStr ?? '0')
  const minute = Number(minuteStr ?? '0')
  const second = Number(secondStr ?? '0')
  const millisecond = milliStr
    ? Number(milliStr.slice(0, 3).padEnd(3, '0'))
    : 0

  return new Date(year, month, day, hour, minute, second, millisecond)
}
