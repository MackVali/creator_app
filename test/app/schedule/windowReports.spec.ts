import { describe, expect, it, vi } from 'vitest'

import type { RepoWindow } from '../../../src/lib/scheduler/repo'
import type { ProjectItem } from '../../../src/lib/scheduler/projects'
import type { ScheduleInstance } from '../../../src/lib/scheduler/instanceRepo'

const loadWindowReports = async () =>
  await import(new URL('../../../src/lib/scheduler/windowReports.ts', import.meta.url).href)

const makeDate = (iso: string) => new Date(iso)
const loadDayWindowReports = async () =>
  await import('../../../src/lib/scheduler/dayWindowReports.ts')

const makeWindow = (id: string, start: string, end: string): RepoWindow => ({
  id,
  label: `Window ${id}`,
  energy: 'NO',
  start_local: start,
  end_local: end,
  days: null,
  location_context_id: null,
  location_context_value: null,
  location_context_name: null,
  window_kind: 'DEFAULT',
  allowAllHabitTypes: true,
  allowAllSkills: true,
  allowAllMonuments: true,
  dayTypeTimeBlockId: null,
  dayTypeStartUtcMs: null,
  dayTypeEndUtcMs: null,
})

const makeProject = (id: string): ProjectItem => ({
  id,
  name: `Project ${id}`,
  priority: 'NORMAL',
  stage: 'BUILD',
  energy: 'NO',
  duration_min: 60,
  weight: 1,
  taskCount: 0,
  goalWeight: 0,
  goal_id: null,
  due_date: null,
  dueDate: null,
  effective_duration_min: null,
  globalRank: null,
})

const makeInstance = (
  id: string,
  windowId: string,
  start: string,
  end: string
): ScheduleInstance => ({
  id,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  user_id: 'test-user',
  source_type: 'PROJECT',
  source_id: `proj-${id}`,
  window_id: windowId,
  day_type_time_block_id: null,
  time_block_id: null,
  start_utc: start,
  end_utc: end,
  duration_min: Math.max(
    0,
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
  ),
  status: 'scheduled',
  weight_snapshot: 1,
  energy_resolved: 'NO',
  canceled_reason: null,
  completed_at: null,
  locked: false,
  event_name: null,
  practice_context_monument_id: null,
})

const buildReportPayload = () => {
  const windows = [
    makeWindow('win-1', '09:00', '12:00'),
    makeWindow('win-2', '12:00', '16:00'),
  ]
  const instances = [
    makeInstance('inst-1', 'win-1', '2026-02-01T10:00:00Z', '2026-02-01T11:00:00Z'),
    makeInstance('inst-2', 'win-2', '2026-02-01T15:00:00Z', '2026-02-01T16:00:00Z'),
  ]
  const projects = [makeProject('proj-1'), makeProject('proj-2')]
  const projectInstances = [
    {
      instance: instances[0],
      project: projects[0],
      start: new Date('2026-02-01T10:00:00Z'),
      end: new Date('2026-02-01T11:00:00Z'),
      assignedWindow: windows[0],
    },
    {
      instance: instances[1],
      project: projects[1],
      start: new Date('2026-02-01T15:00:00Z'),
      end: new Date('2026-02-01T16:00:00Z'),
      assignedWindow: windows[1],
    },
  ] as any
  const occupiedSegments = projectInstances.map(({ start, end }) => ({ start, end }))

  return {
    windows,
    projectInstances,
    occupiedSegments,
    unscheduledProjects: [] as ProjectItem[],
    schedulerFailureByProjectId: {},
    schedulerDebug: null,
    schedulerTimelinePlacements: [] as [],
    habitPlacements: [] as [],
    currentDate: new Date('2026-02-01T00:00:00Z'),
    timeZone: 'UTC',
    modelStartHour: 0,
  }
}

describe('describeEmptyWindowReport', () => {
  it('explains when the scheduler runs mid-window with too little time remaining', async () => {
    const { describeEmptyWindowReport } = await loadWindowReports()
    const runStartedAt = makeDate('2024-05-05T15:30:00Z')
    const windowStart = makeDate('2024-05-05T15:00:00Z')
    const windowEnd = makeDate('2024-05-05T17:00:00Z')
    vi.useFakeTimers()
    vi.setSystemTime(makeDate('2024-05-05T15:00:00Z'))

    let result
    try {
      result = describeEmptyWindowReport({
      windowLabel: 'Evening sprint',
      energyLabel: 'HIGH',
      durationMinutes: 120,
      unscheduledProjects: [],
      schedulerFailureByProjectId: {},
      diagnosticsAvailable: true,
      runStartedAt,
      windowStart,
      windowEnd,
      futurePlacements: [
        {
          projectId: 'proj-a',
          projectName: 'Project A',
          sameDay: true,
          fits: true,
          durationMinutes: 120,
          start: makeDate('2024-05-05T18:00:00Z'),
        },
      ],
      segmentStart: windowStart,
      segmentEnd: windowEnd,
      window: makeWindow('breakable', '15:00', '17:00'),
      })
    } finally {
      vi.useRealTimers()
    }

    expect(result.summary).toMatch(/had only/i)
    expect(result.summary).toMatch(/scheduler ran/i)
    expect(result.details).toHaveLength(1)
    expect(result.details[0]).toContain('Project A')
  })

  it('tells you to take a break for break blocks', async () => {
    const { describeEmptyWindowReport } = await loadWindowReports()
    const windowStart = makeDate('2024-05-05T11:00:00Z')
    const windowEnd = makeDate('2024-05-05T12:00:00Z')
    const wakeWindow = makeWindow('break-window', '11:00', '12:00')
    wakeWindow.window_kind = 'BREAK'

    const result = describeEmptyWindowReport({
      windowLabel: 'Refresh hour',
      energyLabel: 'NO',
      durationMinutes: 60,
      unscheduledProjects: [],
      schedulerFailureByProjectId: {},
      diagnosticsAvailable: false,
      runStartedAt: null,
      windowStart,
      windowEnd,
      futurePlacements: [],
      segmentStart: windowStart,
      segmentEnd: windowEnd,
      window: wakeWindow,
    })

    expect(result.summary).toMatch(/break block/i)
    expect(result.details).toHaveLength(0)
  })

  it('documents constraints for day-type time blocks', async () => {
    const { describeEmptyWindowReport } = await loadWindowReports()
    const windowStart = makeDate('2024-05-05T14:00:00Z')
    const windowEnd = makeDate('2024-05-05T15:00:00Z')
    const constrainedWindow = makeWindow('constraint-window', '14:00', '15:00')
    constrainedWindow.dayTypeTimeBlockId = 'dttb-1'
    constrainedWindow.location_context_name = 'Home office'
    constrainedWindow.allowAllHabitTypes = false
    constrainedWindow.allowedHabitTypes = ['HABIT', 'FOCUS']
    constrainedWindow.allowAllSkills = false
    constrainedWindow.allowedSkillIds = ['skill-a']
    constrainedWindow.allowAllMonuments = false
    constrainedWindow.allowedMonumentIds = ['mon-1']

    const result = describeEmptyWindowReport({
      windowLabel: 'Constraints block',
      energyLabel: 'NO',
      durationMinutes: 60,
      unscheduledProjects: [],
      schedulerFailureByProjectId: {},
      diagnosticsAvailable: false,
      runStartedAt: null,
      windowStart,
      windowEnd,
      futurePlacements: [],
      segmentStart: windowStart,
      segmentEnd: windowEnd,
      window: constrainedWindow,
    })

    expect(result.details.some(detail => detail.includes('Day-type time block constraints'))).toBe(true)
    expect(result.details.some(detail => detail.includes('Requires location context'))).toBe(true)
    expect(result.details.some(detail => detail.includes('Habit types limited to'))).toBe(true)
    expect(result.details.some(detail => detail.includes('Skills must match'))).toBe(true)
      expect(result.details.some(detail => detail.includes('Monuments must match'))).toBe(true)
  })

  it('labels historical windows as past entries', async () => {
    const { describeEmptyWindowReport } = await loadWindowReports()
    const windowStart = makeDate('2024-05-05T08:00:00Z')
    const windowEnd = makeDate('2024-05-05T09:00:00Z')
    const window = makeWindow('history-window', '08:00', '09:00')

    const result = describeEmptyWindowReport({
      windowLabel: 'Morning block',
      energyLabel: 'NO',
      durationMinutes: 60,
      unscheduledProjects: [],
      schedulerFailureByProjectId: {},
      diagnosticsAvailable: false,
      runStartedAt: null,
      windowStart,
      windowEnd,
      futurePlacements: [],
      segmentStart: windowStart,
      segmentEnd: windowEnd,
      window,
    })

    expect(result.summary).toMatch(/past/)
  })
})

describe('computeWindowReportsForDay', () => {
  it('avoids overlapping scheduled instances', async () => {
    const { computeWindowReportsForDay } = await loadDayWindowReports()
    const payload = buildReportPayload()

    const reports = computeWindowReportsForDay(payload)
    const scheduledSegments = payload.projectInstances.map(({ start, end }) => ({
      start,
      end,
    }))

    for (const report of reports) {
      for (const segment of scheduledSegments) {
        const overlaps =
          report.rangeStart < segment.end && report.rangeEnd > segment.start
        expect(overlaps).toBe(false)
      }
    }
  })

  it('generates reports for gaps between scheduled events', async () => {
    const { computeWindowReportsForDay } = await loadDayWindowReports()
    const payload = buildReportPayload()

    const reports = computeWindowReportsForDay(payload)
    const gapStart = new Date('2026-02-01T11:00:00Z').getTime()
    const gapEnd = new Date('2026-02-01T15:00:00Z').getTime()
    const hasGapReport = reports.some(
      (report) =>
        report.rangeStart.getTime() >= gapStart &&
        report.rangeEnd.getTime() <= gapEnd
    )
    expect(hasGapReport).toBe(true)
  })

  it('splits a gap that crosses a window boundary into per-window reports', async () => {
    const { computeWindowReportsForDay } = await loadDayWindowReports()
    const payload = buildReportPayload()

    const reports = computeWindowReportsForDay(payload)
    const firstSegmentEnd = new Date('2026-02-01T12:00:00Z').getTime()
    const secondSegmentStart = firstSegmentEnd

    const first = reports.find(
      (report) =>
        report.rangeEnd.getTime() === firstSegmentEnd &&
        report.window.id === 'win-1'
    )
    const second = reports.find(
      (report) =>
        report.rangeStart.getTime() === secondSegmentStart &&
        report.window.id === 'win-2'
    )
    expect(first).toBeDefined()
    expect(second).toBeDefined()
  })
})
