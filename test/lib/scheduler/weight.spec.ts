import { describe, it, expect } from 'vitest'
import {
  taskWeight,
  projectWeight,
  goalWeight,
  type TaskLite,
  type ProjectLite,
  type GoalLite,
} from '../../../src/lib/scheduler/weight'
import {
  TASK_STAGE_WEIGHT,
  TASK_PRIORITY_WEIGHT,
  PROJECT_PRIORITY_WEIGHT,
  PROJECT_STAGE_WEIGHT,
  GOAL_PRIORITY_WEIGHT,
} from '../../../src/lib/scheduler/config'

describe('scheduler weight helpers', () => {
  it.each([
    ['PREPARE', TASK_STAGE_WEIGHT.PREPARE],
    ['PRODUCE', TASK_STAGE_WEIGHT.PRODUCE],
    ['PERFECT', TASK_STAGE_WEIGHT.PERFECT],
  ])('taskWeight handles uppercase stage %s', (stage, expectedStageWeight) => {
    const task: TaskLite = {
      id: 't-' + stage,
      name: 'Task ' + stage,
      priority: 'CRITICAL',
      stage,
      duration_min: 15,
      energy: null,
    }

    const weight = taskWeight(task)
    expect(weight).toBe(
      TASK_PRIORITY_WEIGHT.CRITICAL + expectedStageWeight
    )
  })

  it('projectWeight handles ULTRA-CRITICAL priority', () => {
    const project: ProjectLite = {
      id: 'p1',
      name: 'Project',
      priority: 'ULTRA-CRITICAL',
      stage: 'BUILD',
    }

    const weight = projectWeight(project, 0)
    expect(weight).toBe(
      PROJECT_PRIORITY_WEIGHT['ULTRA-CRITICAL'] + PROJECT_STAGE_WEIGHT.BUILD
    )
  })

  it('goalWeight handles CRITICAL priority', () => {
    const goal: GoalLite = {
      id: 'g1',
      priority: 'CRITICAL',
    }

    const weight = goalWeight(goal, 0)
    expect(weight).toBe(GOAL_PRIORITY_WEIGHT.CRITICAL)
  })
})
