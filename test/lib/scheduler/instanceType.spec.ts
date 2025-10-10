import { describe, expect, it } from 'vitest'

const loadHelpers = async () =>
  await import(new URL('../../../src/lib/scheduler/instanceType.ts', import.meta.url).href)

const makeInstance = (overrides: Partial<{ source_type: unknown; source_id: unknown }>) => ({
  source_type: null,
  source_id: null,
  ...overrides,
})

describe('instance source type helpers', () => {
  it('normalizes mixed-case values', async () => {
    const { normalizeInstanceSourceType } = await loadHelpers()
    expect(normalizeInstanceSourceType('project')).toBe('PROJECT')
    expect(normalizeInstanceSourceType('Task')).toBe('TASK')
    expect(normalizeInstanceSourceType('focus')).toBeNull()
  })

  it('infers tasks from the task map when type is missing', async () => {
    const { resolveInstanceSourceType } = await loadHelpers()
    const instance = makeInstance({ source_id: 'task-1' })
    const taskMap = { 'task-1': { id: 'task-1' } }
    expect(resolveInstanceSourceType(instance, { taskMap })).toBe('TASK')
  })

  it('infers projects from the project map when type is missing', async () => {
    const { resolveInstanceSourceType } = await loadHelpers()
    const instance = makeInstance({ source_id: 'project-1' })
    const projectMap = { 'project-1': { id: 'project-1' } }
    expect(resolveInstanceSourceType(instance, { projectMap })).toBe('PROJECT')
  })

  it('falls back to project when requested and no task metadata exists', async () => {
    const { resolveInstanceSourceType } = await loadHelpers()
    const instance = makeInstance({ source_id: 'mystery' })
    expect(
      resolveInstanceSourceType(instance, {
        taskMap: {},
        preferProjectWhenUnknown: true,
      }),
    ).toBe('PROJECT')
  })

  it('prioritizes task inference even when preferring projects', async () => {
    const { resolveInstanceSourceType } = await loadHelpers()
    const instance = makeInstance({ source_id: 'task-2' })
    const taskMap = { 'task-2': { id: 'task-2' } }
    expect(
      resolveInstanceSourceType(instance, {
        taskMap,
        preferProjectWhenUnknown: true,
      }),
    ).toBe('TASK')
  })
})
