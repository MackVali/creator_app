import { describe, expect, it } from 'vitest'

import type { ScheduleInstance } from '@/lib/scheduler/instanceRepo'
import { mergeHabitCompletionStateFromInstances } from '@/lib/scheduler/habitCompletionState'

function formatDayKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildInstance(
  overrides: Partial<ScheduleInstance> & {
    source_id: string
    start_utc: string
    end_utc?: string
    status?: ScheduleInstance['status']
  }
): ScheduleInstance {
  return {
    id: overrides.id ?? `${overrides.source_id}-${overrides.start_utc}`,
    created_at: overrides.created_at ?? overrides.start_utc,
    updated_at: overrides.updated_at ?? overrides.start_utc,
    user_id: overrides.user_id ?? 'user',
    source_id: overrides.source_id,
    source_type: overrides.source_type ?? 'HABIT',
    status: overrides.status ?? 'scheduled',
    start_utc: overrides.start_utc,
    end_utc:
      overrides.end_utc ??
      new Date(new Date(overrides.start_utc).getTime() + 30 * 60000).toISOString(),
    duration_min: overrides.duration_min ?? 30,
    window_id: overrides.window_id ?? 'window',
    energy_resolved: overrides.energy_resolved ?? 'NO',
    energy: overrides.energy ?? 'NO',
    project_id: overrides.project_id ?? null,
    task_id: overrides.task_id ?? null,
    day_start_utc: overrides.day_start_utc ?? overrides.start_utc,
    coverage_source: overrides.coverage_source ?? null,
    coverage_start_utc: overrides.coverage_start_utc ?? null,
    coverage_end_utc: overrides.coverage_end_utc ?? null,
    source_campaign_id: overrides.source_campaign_id ?? null,
    mode: overrides.mode ?? null,
    rest_mode: overrides.rest_mode ?? null,
    rest_offset: overrides.rest_offset ?? null,
    notes: overrides.notes ?? null,
    metadata: overrides.metadata ?? null,
  }
}

describe('mergeHabitCompletionStateFromInstances', () => {
  it('records completed instances by habit and date', () => {
    const start = new Date('2024-03-27T15:00:00Z')
    const dayKey = formatDayKey(start)
    const instances: ScheduleInstance[] = [
      buildInstance({
        source_id: 'habit-1',
        start_utc: start.toISOString(),
        status: 'completed',
      }),
    ]

    const next = mergeHabitCompletionStateFromInstances({}, instances, "UTC")
    expect(next).toEqual({
      [dayKey]: {
        'habit-1': 'completed',
      },
    })
  })

  it('removes stale completion flags when server no longer reports completion', () => {
    const start = new Date('2024-03-28T09:00:00Z')
    const dayKey = formatDayKey(start)
    const prev = {
      [dayKey]: {
        'habit-keep': 'completed',
        'habit-clear': 'completed',
      },
      memoDay: {
        memoHabit: 'completed',
      },
    }
    const instances: ScheduleInstance[] = [
      buildInstance({
        source_id: 'habit-keep',
        start_utc: start.toISOString(),
        status: 'completed',
      }),
      buildInstance({
        source_id: 'habit-clear',
        start_utc: start.toISOString(),
        status: 'scheduled',
      }),
    ]

    const next = mergeHabitCompletionStateFromInstances(prev, instances, "UTC")
    expect(next).toEqual({
      [dayKey]: {
        'habit-keep': 'completed',
      },
      memoDay: {
        memoHabit: 'completed',
      },
    })
  })

  it('ignores non-habit instances and missing data', () => {
    const prev = {
      '2024-03-29': {
        'habit-1': 'completed',
      },
    }
    const instances: ScheduleInstance[] = [
      buildInstance({
        source_type: 'PROJECT',
        source_id: 'project',
        start_utc: new Date('2024-03-29T12:00:00Z').toISOString(),
        status: 'completed',
      }),
    ]

    const next = mergeHabitCompletionStateFromInstances(prev, instances, "UTC")
    expect(next).toBe(prev)
  })
})
