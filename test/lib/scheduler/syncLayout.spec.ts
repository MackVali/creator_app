import { describe, expect, it } from 'vitest'

import { computeTimelineLayoutForSyncHabits } from '@/lib/scheduler/syncLayout'

function minutesFromStart(minutes: number) {
  const base = new Date(Date.UTC(2024, 0, 1, 0, 0, 0))
  return new Date(base.getTime() + minutes * 60000)
}

function buildHabit({
  startMinutes,
  endMinutes,
  habitType = 'HABIT',
}: {
  startMinutes: number
  endMinutes: number
  habitType?: 'HABIT' | 'SYNC'
}) {
  return {
    start: minutesFromStart(startMinutes),
    end: minutesFromStart(endMinutes),
    habitType,
  }
}

function buildProject({
  startMinutes,
  endMinutes,
}: {
  startMinutes: number
  endMinutes: number
}) {
  return {
    start: minutesFromStart(startMinutes),
    end: minutesFromStart(endMinutes),
  }
}

describe('computeTimelineLayoutForSyncHabits', () => {
  it('reserves only one partner per sync habit and keeps others available', () => {
    const habitPlacements = [
      buildHabit({ startMinutes: 9 * 60, endMinutes: 9 * 60 + 30 }),
      buildHabit({ startMinutes: 9 * 60 + 20, endMinutes: 9 * 60 + 50 }),
      buildHabit({ startMinutes: 9 * 60 + 5, endMinutes: 9 * 60 + 40, habitType: 'SYNC' }),
      buildHabit({ startMinutes: 9 * 60 + 45, endMinutes: 10 * 60 + 15, habitType: 'SYNC' }),
    ]

    const { habitLayouts } = computeTimelineLayoutForSyncHabits({
      habitPlacements,
      projectInstances: [],
    })

    expect(habitLayouts).toEqual([
      'paired-left',
      'paired-left',
      'paired-right',
      'paired-right',
    ])
  })

  it('prefers candidates with the smallest start gap when overlaps begin together', () => {
    const habitPlacements = [
      buildHabit({ startMinutes: 9 * 60 - 60, endMinutes: 9 * 60 + 30 }),
      buildHabit({ startMinutes: 9 * 60 - 10, endMinutes: 9 * 60 + 20 }),
      buildHabit({ startMinutes: 9 * 60, endMinutes: 9 * 60 + 40, habitType: 'SYNC' }),
    ]

    const { habitLayouts } = computeTimelineLayoutForSyncHabits({
      habitPlacements,
      projectInstances: [],
    })

    expect(habitLayouts).toEqual(['full', 'paired-left', 'paired-right'])
  })

  it('pairs sync habits with overlapping project instances when no habit is available', () => {
    const habitPlacements = [
      buildHabit({ startMinutes: 9 * 60, endMinutes: 9 * 60 + 45, habitType: 'SYNC' }),
    ]
    const projectInstances = [
      buildProject({ startMinutes: 9 * 60 + 5, endMinutes: 9 * 60 + 35 }),
    ]

    const { habitLayouts, projectLayouts } = computeTimelineLayoutForSyncHabits({
      habitPlacements,
      projectInstances,
    })

    expect(habitLayouts).toEqual(['paired-right'])
    expect(projectLayouts).toEqual(['paired-left'])
  })
})
