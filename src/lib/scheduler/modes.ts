export type SchedulerModeType =
  | 'REGULAR'
  | 'RUSH'
  | 'MONUMENTAL'
  | 'SKILLED'
  | 'REST'

export type SchedulerModePayload =
  | { type: 'REGULAR' }
  | { type: 'RUSH' }
  | { type: 'REST' }
  | { type: 'MONUMENTAL'; monumentId: string }
  | { type: 'SKILLED'; skillIds: string[] }

export type SchedulerModeSelection =
  | { type: 'REGULAR' }
  | { type: 'RUSH' }
  | { type: 'REST' }
  | { type: 'MONUMENTAL'; monumentId: string | null }
  | { type: 'SKILLED'; skillIds: string[] }

export function normalizeSchedulerModePayload(
  input: unknown
): SchedulerModePayload {
  if (!input || typeof input !== 'object') {
    return { type: 'REGULAR' }
  }

  const record = input as Partial<
    SchedulerModePayload & { type?: string | null }
  >
  const type = typeof record.type === 'string' ? record.type.toUpperCase() : 'REGULAR'

  switch (type) {
    case 'RUSH':
      return { type: 'RUSH' }
    case 'REST':
      return { type: 'REST' }
    case 'MONUMENTAL': {
      const monumentId =
        record && typeof (record as { monumentId?: unknown }).monumentId === 'string'
          ? ((record as { monumentId?: string }).monumentId ?? '').trim()
          : ''
      if (monumentId.length === 0) {
        return { type: 'REGULAR' }
      }
      return { type: 'MONUMENTAL', monumentId }
    }
    case 'SKILLED': {
      const rawSkillIds =
        record && Array.isArray((record as { skillIds?: unknown }).skillIds)
          ? ((record as { skillIds?: unknown }).skillIds as unknown[])
          : []
      const skillIds = rawSkillIds
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        .map(id => id.trim())
      if (skillIds.length === 0) {
        return { type: 'REGULAR' }
      }
      const unique = Array.from(new Set(skillIds))
      return { type: 'SKILLED', skillIds: unique }
    }
    case 'REGULAR':
    default:
      return { type: 'REGULAR' }
  }
}

export function schedulerModeLabel(mode: SchedulerModePayload): string {
  switch (mode.type) {
    case 'RUSH':
      return 'Rush'
    case 'REST':
      return 'Rest'
    case 'MONUMENTAL':
      return 'Monumental'
    case 'SKILLED':
      return 'Skilled'
    case 'REGULAR':
    default:
      return 'Regular'
  }
}

export function isConfiguredMode(mode: SchedulerModePayload): boolean {
  if (mode.type === 'MONUMENTAL') {
    return mode.monumentId.trim().length > 0
  }
  if (mode.type === 'SKILLED') {
    return mode.skillIds.length > 0
  }
  return true
}

export function selectionToSchedulerModePayload(
  selection: SchedulerModeSelection
): SchedulerModePayload {
  switch (selection.type) {
    case 'RUSH':
      return { type: 'RUSH' }
    case 'REST':
      return { type: 'REST' }
    case 'MONUMENTAL':
      return selection.monumentId && selection.monumentId.trim().length > 0
        ? { type: 'MONUMENTAL', monumentId: selection.monumentId.trim() }
        : { type: 'REGULAR' }
    case 'SKILLED': {
      const unique = Array.from(
        new Set(selection.skillIds.filter(id => typeof id === 'string' && id.trim().length > 0).map(id => id.trim()))
      )
      return unique.length > 0
        ? { type: 'SKILLED', skillIds: unique }
        : { type: 'REGULAR' }
    }
    case 'REGULAR':
    default:
      return { type: 'REGULAR' }
  }
}
