import type { ScheduleInstance } from '@/lib/scheduler/instanceRepo'
import { formatLocalDateKey, toLocal } from '../time/tz'

export type HabitCompletionState = Record<string, Record<string, 'completed'>>

export function mergeHabitCompletionStateFromInstances(
  prevState: HabitCompletionState,
  instances: ScheduleInstance[] | null | undefined
): HabitCompletionState {
  if (!instances || instances.length === 0) {
    return prevState
  }

  const habitIdsByDate = new Map<string, Set<string>>()
  const completedByDate = new Map<string, Set<string>>()

  for (const instance of instances) {
    if (!instance || instance.source_type !== 'HABIT') continue
    const habitId = instance.source_id
    if (!habitId) continue
    const start = toLocal(instance.start_utc ?? '')
    if (!(start instanceof Date) || Number.isNaN(start.getTime())) continue
    const dateKey = formatLocalDateKey(start)
    let allIds = habitIdsByDate.get(dateKey)
    if (!allIds) {
      allIds = new Set()
      habitIdsByDate.set(dateKey, allIds)
    }
    allIds.add(habitId)
    if ((instance.status ?? '').toLowerCase() === 'completed') {
      let completedIds = completedByDate.get(dateKey)
      if (!completedIds) {
        completedIds = new Set()
        completedByDate.set(dateKey, completedIds)
      }
      completedIds.add(habitId)
    }
  }

  if (habitIdsByDate.size === 0) {
    return prevState
  }

  let changed = false
  const nextState: HabitCompletionState = { ...prevState }

  for (const [dateKey, habitIds] of habitIdsByDate) {
    const prevDay = nextState[dateKey]
    const nextDay = prevDay ? { ...prevDay } : {}
    let dayChanged = false
    const completedIds = completedByDate.get(dateKey) ?? new Set<string>()
    habitIds.forEach(habitId => {
      if (completedIds.has(habitId)) {
        if (nextDay[habitId] !== 'completed') {
          nextDay[habitId] = 'completed'
          dayChanged = true
        }
      } else if (habitId in nextDay) {
        delete nextDay[habitId]
        dayChanged = true
      }
    })
    if (dayChanged) {
      changed = true
      if (Object.keys(nextDay).length === 0) {
        delete nextState[dateKey]
      } else {
        nextState[dateKey] = nextDay
      }
    }
  }

  return changed ? nextState : prevState
}
