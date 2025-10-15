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

export function toLocal(isoUTC: string): Date {
  if (typeof isoUTC === 'string') {
    const parsed = new Date(isoUTC)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed
    }
  }

  return new Date(isoUTC)
}

export function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
