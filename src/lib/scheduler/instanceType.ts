import type { ScheduleInstance } from './instanceRepo'
import type { TaskLite } from './weight'

export type InstanceSourceType = 'PROJECT' | 'TASK'

export function normalizeInstanceSourceType(value: unknown): InstanceSourceType | null {
  if (typeof value !== 'string') return null
  const upper = value.trim().toUpperCase()
  return upper === 'PROJECT' || upper === 'TASK' ? (upper as InstanceSourceType) : null
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

  if (preferProjectWhenUnknown) {
    return 'PROJECT'
  }

  return null
}
