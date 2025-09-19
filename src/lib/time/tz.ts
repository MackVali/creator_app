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

const parseIntegerOrZero = (value: string | undefined): number => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isNaN(parsed) ? 0 : parsed
}

export function toLocal(isoUTC: string): Date {
  if (typeof isoUTC !== 'string' || isoUTC.length === 0) {
    return new Date(isoUTC)
  }

  const [datePart, timeAndOffset = ''] = isoUTC.split('T')
  if (!datePart) return new Date(isoUTC)

  const dateSegments = datePart.split('-')
  if (dateSegments.length < 3) return new Date(isoUTC)

  const [yearRaw, monthRaw, dayRaw] = dateSegments
  const year = Number.parseInt(yearRaw, 10)
  const month = Number.parseInt(monthRaw, 10)
  const day = Number.parseInt(dayRaw, 10)

  if ([year, month, day].some(Number.isNaN)) {
    return new Date(isoUTC)
  }

  const [timePartRaw = ''] = timeAndOffset.split(/Z|[+-]/)
  const [hourPart, minutePart, secondAndFractionPart] = timePartRaw.split(':')
  const secondPart = secondAndFractionPart
    ? secondAndFractionPart.split('.')[0]
    : secondAndFractionPart

  const hour = parseIntegerOrZero(hourPart)
  const minute = parseIntegerOrZero(minutePart)
  const second = parseIntegerOrZero(secondPart)

  return new Date(year, month - 1, day, hour, minute, second)
}

export function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
