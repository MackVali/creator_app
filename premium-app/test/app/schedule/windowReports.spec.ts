import { describe, expect, it } from 'vitest'

const loadWindowReports = async () =>
  await import(new URL('../../../src/lib/scheduler/windowReports.ts', import.meta.url).href)

const makeDate = (iso: string) => new Date(iso)

describe('describeEmptyWindowReport', () => {
  it('explains when the scheduler runs mid-window with too little time remaining', async () => {
    const { describeEmptyWindowReport } = await loadWindowReports()
    const runStartedAt = makeDate('2024-05-05T15:30:00Z')
    const windowStart = makeDate('2024-05-05T15:00:00Z')
    const windowEnd = makeDate('2024-05-05T17:00:00Z')

    const result = describeEmptyWindowReport({
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
    })

    expect(result.summary).toMatch(/had only/i)
    expect(result.summary).toMatch(/scheduler ran/i)
    expect(result.details).toHaveLength(1)
    expect(result.details[0]).toContain('Project A')
  })
})
