export type SchedulerModeType =
  | 'regular'
  | 'rush'
  | 'monumental'
  | 'skilled'
  | 'rest'

export type SchedulerModePayload =
  | { type: 'regular' }
  | { type: 'rush' }
  | { type: 'rest' }
  | { type: 'monumental'; monumentId: string }
  | { type: 'skilled'; skillIds: string[] }

export function normalizeSchedulerModePayload(
  value: unknown
): SchedulerModePayload | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const raw = value as { type?: unknown }
  if (typeof raw.type !== 'string') {
    return null
  }

  const type = raw.type.toLowerCase() as SchedulerModeType

  if (type === 'rush' || type === 'regular' || type === 'rest') {
    return { type }
  }

  if (type === 'monumental') {
    const monumentId =
      typeof (raw as { monumentId?: unknown }).monumentId === 'string'
        ? ((raw as { monumentId: string }).monumentId || '').trim()
        : ''
    if (!monumentId) {
      return null
    }
    return { type, monumentId }
  }

  if (type === 'skilled') {
    const skillIdsRaw = (raw as { skillIds?: unknown }).skillIds
    if (!Array.isArray(skillIdsRaw)) {
      return null
    }
    const skillIds = Array.from(
      new Set(
        skillIdsRaw
          .map(id => (typeof id === 'string' ? id.trim() : ''))
          .filter((id): id is string => id.length > 0)
      )
    )
    if (skillIds.length === 0) {
      return null
    }
    return { type, skillIds }
  }

  return null
}

export function isSpecialSchedulerMode(
  mode: SchedulerModePayload
): mode is Exclude<SchedulerModePayload, { type: 'regular' }> {
  return mode.type !== 'regular'
}
