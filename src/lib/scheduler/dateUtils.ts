export function parseDateParam(value: string | null): Date | null {
  if (!value) return null
  const [yearPart, monthPart, dayPart] = value.split('-')
  if (!yearPart || !monthPart || !dayPart) return null

  const year = Number.parseInt(yearPart, 10)
  const month = Number.parseInt(monthPart, 10)
  const day = Number.parseInt(dayPart, 10)

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null
  }

  const result = new Date(year, month - 1, day)
  if (
    result.getFullYear() !== year ||
    result.getMonth() !== month - 1 ||
    result.getDate() !== day
  ) {
    return null
  }

  return result
}

export function formatDateParam(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

export function utcDayRange(date: Date): { startUTC: string; endUTC: string } {
  const startLocal = startOfLocalDay(date)
  const endLocal = new Date(startLocal)
  endLocal.setDate(endLocal.getDate() + 1)
  return { startUTC: startLocal.toISOString(), endUTC: endLocal.toISOString() }
}

export function computeTimelinePlacement({
  start,
  end,
  timelineStart,
  timelineEnd,
  pxPerMin,
}: {
  start: Date
  end: Date
  timelineStart: Date
  timelineEnd: Date
  pxPerMin: number
}): { top: number; height: number } {
  const startBound = timelineStart.getTime()
  const endBound = timelineEnd.getTime()
  const startMs = start.getTime()
  const endMs = end.getTime()

  if (endMs <= startBound || startMs >= endBound) {
    return { top: 0, height: 0 }
  }

  const clampedStart = Math.max(startMs, startBound)
  const clampedEnd = Math.min(endMs, endBound)
  const offsetMinutes = (clampedStart - startBound) / 60000
  const durationMinutes = (clampedEnd - clampedStart) / 60000

  return {
    top: Math.max(0, offsetMinutes) * pxPerMin,
    height: Math.max(0, durationMinutes) * pxPerMin,
  }
}
