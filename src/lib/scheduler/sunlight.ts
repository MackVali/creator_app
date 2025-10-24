// @ts-nocheck
import SunCalc from 'suncalc'

import { addDaysInTimeZone, setTimeInTimeZone } from './timezone'

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

export function resolveSunlightBounds(
  date: Date,
  timeZone: string,
  coordinates?: GeoCoordinates | null,
): SunlightBounds {
  if (coordinates && isFiniteNumber(coordinates.latitude) && isFiniteNumber(coordinates.longitude)) {
    try {
      const times = SunCalc.getTimes(date, coordinates.latitude, coordinates.longitude)
      return {
        sunrise: times.sunriseEnd ?? times.sunrise ?? null,
        sunset: times.sunset ?? null,
        dawn: times.sunrise ?? null,
        dusk: times.dusk ?? times.sunset ?? null,
      }
    } catch (error) {
      console.warn('SunCalc failed to resolve sunlight bounds', error)
    }
  }

  const sunrise = setTimeInTimeZone(date, timeZone, 6, 0)
  const sunset = setTimeInTimeZone(date, timeZone, 18, 0)
  const dawn = setTimeInTimeZone(date, timeZone, 5, 30)
  const dusk = setTimeInTimeZone(date, timeZone, 18, 30)
  return { sunrise, sunset, dawn, dusk }
}

export function resolveSunlightSpan(
  date: Date,
  timeZone: string,
  coordinates?: GeoCoordinates | null,
): { previous: SunlightBounds; current: SunlightBounds; next: SunlightBounds } {
  const current = resolveSunlightBounds(date, timeZone, coordinates)
  const previousDate = addDaysInTimeZone(date, -1, timeZone)
  const nextDate = addDaysInTimeZone(date, 1, timeZone)
  const previous = resolveSunlightBounds(previousDate, timeZone, coordinates)
  const next = resolveSunlightBounds(nextDate, timeZone, coordinates)
  return { previous, current, next }
}
