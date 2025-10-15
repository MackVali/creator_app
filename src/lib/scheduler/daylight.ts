import { getDateTimeInTimeZone, normalizeTimeZone } from './timezone'

export type DaylightPreference = 'ALL_DAY' | 'DAY' | 'NIGHT'

const DAY_START_MINUTES = 6 * 60 // 6:00 AM
const DAY_END_MINUTES = 19 * 60 + 30 // 7:30 PM twilight buffer
const NIGHT_START_MINUTES = DAY_END_MINUTES
const NIGHT_END_MINUTES = 5 * 60 + 30 // 5:30 AM

function minutesSinceMidnight(date: Date, timeZone: string) {
  const zoned = getDateTimeInTimeZone(date, timeZone)
  return zoned.hour * 60 + zoned.minute + zoned.second / 60
}

export function isTimeAllowedByDaylight(
  preference: string | null | undefined,
  date: Date,
  timeZone?: string | null,
) {
  const normalizedPreference = (preference ?? 'ALL_DAY').toUpperCase() as DaylightPreference
  if (normalizedPreference === 'ALL_DAY') {
    return true
  }
  const zone = normalizeTimeZone(timeZone)
  const minutes = minutesSinceMidnight(date, zone)
  if (normalizedPreference === 'DAY') {
    return minutes >= DAY_START_MINUTES && minutes <= DAY_END_MINUTES
  }
  // NIGHT preference: allow after twilight through early morning buffer
  return minutes >= NIGHT_START_MINUTES || minutes <= NIGHT_END_MINUTES
}
