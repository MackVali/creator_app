import { describe, it, expect } from 'vitest'
import {
  buildProjectItems,
  DEFAULT_PROJECT_DURATION_MIN,
  DEFAULT_PROJECT_ENERGY,
} from '../../../src/lib/scheduler/projects'
import type { ProjectLite, TaskLite } from '../../../src/lib/scheduler/weight'

describe('buildProjectItems', () => {
  it('includes projects even without tasks', () => {
    const projects: ProjectLite[] = [
      { id: 'p1', name: 'P1', priority: 'LOW', stage: 'RESEARCH' },
    ]
    const tasks: TaskLite[] = []
    const items = buildProjectItems(projects, tasks)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: 'p1',
      name: 'P1',
      duration_min: DEFAULT_PROJECT_DURATION_MIN,
      energy: DEFAULT_PROJECT_ENERGY,
      taskCount: 0,
    })
  })

  it('aggregates related tasks', () => {
    const projects: ProjectLite[] = [
      { id: 'p1', name: 'P1', priority: 'LOW', stage: 'RESEARCH' },
    ]
    const tasks: TaskLite[] = [
      {
        id: 't1',
        name: 'T1',
        priority: 'LOW',
        stage: 'Prepare',
        duration_min: 30,
        energy: 'LOW',
        project_id: 'p1',
      },
      {
        id: 't2',
        name: 'T2',
        priority: 'LOW',
        stage: 'Prepare',
        duration_min: 60,
        energy: 'MEDIUM',
        project_id: 'p1',
      },
    ]
    const items = buildProjectItems(projects, tasks)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: 'p1',
      duration_min: 90,
      energy: 'MEDIUM',
      taskCount: 2,
    })
  })
})

