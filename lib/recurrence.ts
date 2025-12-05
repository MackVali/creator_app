const EVERY_X_DAYS_PATTERN = /^every\s+(\d+)\s+days?/i

export const DEFAULT_EVERY_X_DAYS_INTERVAL = 2

function coercePositiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.round(value)
    return normalized > 0 ? normalized : null
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      const normalized = Math.round(parsed)
      return normalized > 0 ? normalized : null
    }
  }
  return null
}

export function ensureEveryXDaysInterval(value: unknown): number | null {
  return coercePositiveInteger(value)
}

export function parseEveryXDaysInterval(
  recurrence: string | null | undefined,
): number | null {
  if (!recurrence) return null
  const match = EVERY_X_DAYS_PATTERN.exec(recurrence.trim())
  if (!match) return null
  return coercePositiveInteger(match[1])
}

export function normalizeEveryXDaysFromList(
  recurrenceDays?: number[] | null,
): number | null {
  if (!Array.isArray(recurrenceDays)) return null
  for (const entry of recurrenceDays) {
    const normalized = coercePositiveInteger(entry)
    if (normalized) {
      return normalized
    }
  }
  return null
}

export function resolveEveryXDaysInterval(
  recurrence: string | null | undefined,
  recurrenceDays?: number[] | null,
): number | null {
  return normalizeEveryXDaysFromList(recurrenceDays) ?? parseEveryXDaysInterval(recurrence)
}
