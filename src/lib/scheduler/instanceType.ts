import type { ScheduleInstance } from './instanceRepo'
import type { TaskLite } from './weight'

export type InstanceSourceType = 'PROJECT' | 'TASK'

const PROJECT_ID_HINTS = ['PROJ', 'PROJECT']
const TASK_ID_HINTS = ['TASK']

export function normalizeInstanceSourceType(value: unknown): InstanceSourceType | null {
  if (typeof value !== 'string') return null
  const upper = value.trim().toUpperCase()
  if (upper === 'PROJECT' || upper === 'TASK') {
    return upper as InstanceSourceType
  }

  if (upper.includes('PROJECT')) {
    return 'PROJECT'
  }

  if (upper.includes('TASK')) {
    return 'TASK'
  }

  return null
}

function inferTypeFromSourceId(sourceId: string | null): InstanceSourceType | null {
  if (!sourceId) return null
  const upper = sourceId.trim().toUpperCase()
  if (!upper) return null

  if (TASK_ID_HINTS.some(hint => upper.startsWith(hint))) {
    return 'TASK'
  }

  if (PROJECT_ID_HINTS.some(hint => upper.startsWith(hint))) {
    return 'PROJECT'
  }

  return null
}

type ResolveOptions = {
  taskMap?: Record<string, TaskLite | undefined>
  projectMap?: Record<string, { id?: string } | null | undefined>
  preferProjectWhenUnknown?: boolean
}

export function resolveInstanceSourceType(
  instance: Pick<ScheduleInstance, 'source_type' | 'source_id'>,
  options: ResolveOptions = {},
): InstanceSourceType | null {
  const normalized = normalizeInstanceSourceType(instance.source_type)
  if (normalized) return normalized

  const sourceId = typeof instance.source_id === 'string' ? instance.source_id : null
  if (!sourceId) return null

  const { taskMap, projectMap, preferProjectWhenUnknown } = options

  if (taskMap && taskMap[sourceId]) {
    return 'TASK'
  }

  if (projectMap && projectMap[sourceId]) {
    return 'PROJECT'
  }

  const idHint = inferTypeFromSourceId(sourceId)
  if (idHint) {
    return idHint
  }

  if (preferProjectWhenUnknown) {
    return 'PROJECT'
  }

  return null
}
