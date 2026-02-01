import SunCalc from 'suncalc'

import {
  addDaysInTimeZone,
  getDateTimeParts,
  setTimeInTimeZone,
} from './timezone'
import { log } from '@/lib/utils/logGate'

export type GeoCoordinates = {
  latitude: number
  longitude: number
}

export type SunlightBounds = {
  sunrise: Date | null
  sunset: Date | null
  dawn: Date | null
  dusk: Date | null
}

type SunlightBoundsOptions = {
  offsetMinutes?: number | null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function normalizeCoordinates(
  input?: GeoCoordinates | { latitude?: number | null; longitude?: number | null } | null,
): GeoCoordinates | null {
  if (!input) return null
  const lat = 'latitude' in input ? input.latitude : null
  const lng = 'longitude' in input ? input.longitude : null
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null
  return { latitude: lat, longitude: lng }
}

function hasValidOffset(value?: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function buildMiddayReference(date: Date, offsetMs: number) {
  const parts = getDateTimeParts(date, 'UTC')
  const base = Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0)
  return new Date(base - offsetMs)
}

export function resolveSunlightBounds(
  date: Date,
  timeZone: string,
  coordinates?: GeoCoordinates | null,
  options?: SunlightBoundsOptions,
): SunlightBounds {
  const offsetCandidate = options?.offsetMinutes
  const offsetMinutes = hasValidOffset(offsetCandidate) ? offsetCandidate : null
  const useOffset = offsetMinutes !== null && timeZone === 'UTC'
  const offsetMs = offsetMinutes !== null ? offsetMinutes * 60000 : 0

  if (coordinates && isFiniteNumber(coordinates.latitude) && isFiniteNumber(coordinates.longitude)) {
    try {
      const referenceDate = useOffset
        ? buildMiddayReference(date, offsetMs)
        : setTimeInTimeZone(date, timeZone, 12, 0)
      const times = SunCalc.getTimes(
        referenceDate,
        coordinates.latitude,
        coordinates.longitude,
      )
      const normalize = (value: Date | null | undefined) => {
        if (!value) return null
        if (useOffset) {
          return new Date(value.getTime())
        }
        const parts = getDateTimeParts(value, timeZone)
        const normalized = setTimeInTimeZone(
          value,
          timeZone,
          parts.hour,
          parts.minute,
        )
        normalized.setSeconds(parts.second, value.getMilliseconds())
        return normalized
      }
      return {
        sunrise: normalize(times.sunriseEnd ?? times.sunrise ?? null),
        sunset: normalize(times.sunset ?? null),
        dawn: normalize(times.sunrise ?? null),
        dusk: normalize(times.dusk ?? times.sunset ?? null),
      }
    } catch (error) {
      log('warn', 'SunCalc failed to resolve sunlight bounds', error)
    }
  }

  const adjustForOffset = (value: Date) =>
    useOffset ? new Date(value.getTime() - offsetMs) : value

  const sunrise = adjustForOffset(setTimeInTimeZone(date, timeZone, 6, 0))
  const sunset = adjustForOffset(setTimeInTimeZone(date, timeZone, 18, 0))
  const dawn = adjustForOffset(setTimeInTimeZone(date, timeZone, 5, 30))
  const dusk = adjustForOffset(setTimeInTimeZone(date, timeZone, 18, 30))
  return { sunrise, sunset, dawn, dusk }
}

export function resolveSunlightSpan(
  date: Date,
  timeZone: string,
  coordinates?: GeoCoordinates | null,
  options?: SunlightBoundsOptions,
): { previous: SunlightBounds; current: SunlightBounds; next: SunlightBounds } {
  const current = resolveSunlightBounds(date, timeZone, coordinates, options)
  const previousDate = addDaysInTimeZone(date, -1, timeZone)
  const nextDate = addDaysInTimeZone(date, 1, timeZone)
  const previous = resolveSunlightBounds(previousDate, timeZone, coordinates, options)
  const next = resolveSunlightBounds(nextDate, timeZone, coordinates, options)
  return { previous, current, next }
}
