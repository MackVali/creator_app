import {
  ENERGY,
  TASK_PRIORITY_WEIGHT,
  TASK_STAGE_WEIGHT,
  type Energy,
} from './config'
import type { TaskLite, ProjectLite } from './weight'
import { taskWeight, projectWeight } from './weight'

export const DEFAULT_PROJECT_DURATION_MIN = 60
export const DEFAULT_PROJECT_ENERGY: Energy = 'NO'

export type ProjectItem = ProjectLite & {
  name: string
  duration_min: number
  energy: Energy
  weight: number
  taskCount: number
  skill_icon?: string | null
  goalWeight: number
}

export type ProjectScheduleCandidate = {
  id: string
  sourceType: 'PROJECT' | 'TASK'
  parentProjectId: string
  parentProjectName: string
  name: string
  duration_min: number
  energy: Energy
  weight: number
  taskCount: number
  skill_icon?: string | null
  goalWeight: number
  goal_id?: string | null
  goal_area_id?: string | null
  globalRank?: number | null
  global_rank?: number | null
  task?: TaskLite
  project: ProjectItem
}

const normEnergy = (e?: string | null): Energy | null => {
  const candidate =
    typeof e === 'string'
      ? e
      : e != null
        ? String(e)
        : ''
  const up = candidate.toUpperCase()
  return ENERGY.LIST.includes(up as Energy) ? (up as Energy) : null
}

const mergeEnergy = (a: Energy | null, b: Energy | null): Energy | null => {
  if (!a) return b ?? null
  if (!b) return a
  return ENERGY.LIST.indexOf(b) > ENERGY.LIST.indexOf(a) ? b : a
}

const normalizeLookupKey = <T extends Record<string, unknown>>(
  lookup: T,
  value?: string | null
): keyof T | null => {
  if (!value) return null
  const direct = value as keyof T
  if (Object.prototype.hasOwnProperty.call(lookup, direct)) return direct
  const normalized = value.trim().toUpperCase()
  const found = Object.keys(lookup).find(
    (key) => key.toUpperCase() === normalized
  )
  return (found as keyof T | undefined) ?? null
}

const lookupNumericWeight = <T extends Record<string, number>>(
  lookup: T,
  value?: string | null
): number => {
  const key = normalizeLookupKey(lookup, value)
  return key ? lookup[key] : 0
}

const isCompletedTask = (task: TaskLite): boolean =>
  typeof task.completed_at === 'string' && task.completed_at.trim().length > 0

function compareTasksForScheduling(a: TaskLite, b: TaskLite): number {
  const stageDelta =
    lookupNumericWeight(TASK_STAGE_WEIGHT, b.stage) -
    lookupNumericWeight(TASK_STAGE_WEIGHT, a.stage)
  if (stageDelta !== 0) return stageDelta

  const priorityDelta =
    lookupNumericWeight(TASK_PRIORITY_WEIGHT, b.priority) -
    lookupNumericWeight(TASK_PRIORITY_WEIGHT, a.priority)
  if (priorityDelta !== 0) return priorityDelta

  const nameDelta = (a.name ?? '').localeCompare(b.name ?? '')
  if (nameDelta !== 0) return nameDelta

  return a.id.localeCompare(b.id)
}

type TaskAggregates = {
  durationSum: number
  weightSum: number
  energy: Energy | null
  skill_icon: string | null
  count: number
}

export function buildProjectItems(
  projects: ProjectLite[],
  tasks: TaskLite[],
  goalWeights: Record<string, number> = {}
): ProjectItem[] {
  const aggregates = new Map<ProjectLite['id'], TaskAggregates>()

  for (const task of tasks) {
    const projectId = task.project_id
    if (projectId == null) continue

    const existing = aggregates.get(projectId) ?? {
      durationSum: 0,
      weightSum: 0,
      energy: null,
      skill_icon: null,
      count: 0,
    }

    const duration = Number(task.duration_min ?? 0)
    const energy = normEnergy(task.energy)
    const skillIcon = existing.skill_icon ?? task.skill_icon ?? null

    const updated: TaskAggregates = {
      durationSum: existing.durationSum + (Number.isFinite(duration) ? duration : 0),
      weightSum: existing.weightSum + taskWeight(task),
      energy: mergeEnergy(existing.energy, energy),
      skill_icon: skillIcon,
      count: existing.count + 1,
    }

    aggregates.set(projectId, updated)
  }

  const items: ProjectItem[] = []
  const getGoalWeight = (goalId: string | null | undefined) => {
    if (!goalId) return 0
    const value = goalWeights[goalId]
    return Number.isFinite(value) ? Number(value) : 0
  }

  for (const p of projects) {
    const related = aggregates.get(p.id)
    const projectDuration = Number(p.duration_min ?? 0)
    let duration_min = Number.isFinite(projectDuration) && projectDuration > 0
      ? projectDuration
      : 0

    if (!duration_min && related) {
      const relatedDuration = related.durationSum
      if (relatedDuration > 0) {
        duration_min = relatedDuration
      }
    }

    if (!duration_min) {
      duration_min = DEFAULT_PROJECT_DURATION_MIN
    }

    const energy =
      mergeEnergy(normEnergy(p.energy), related?.energy ?? null) ??
      DEFAULT_PROJECT_ENERGY

    const weight = projectWeight(p, related?.weightSum ?? 0)
    const skill_icon = related?.skill_icon ?? null
    items.push({
      ...p,
      name: p.name ?? '',
      duration_min,
      energy,
      weight,
      taskCount: related?.count ?? 0,
      skill_icon,
      goal_id: p.goal_id ?? null,
      goalWeight: getGoalWeight(p.goal_id),
    })
  }
  return items
}

export function buildProjectScheduleCandidates(
  projects: ProjectLite[],
  tasks: TaskLite[],
  goalWeights: Record<string, number> = {}
): ProjectScheduleCandidate[] {
  const projectItems = buildProjectItems(projects, tasks, goalWeights)
  const tasksByProjectId = new Map<string, TaskLite[]>()

  for (const task of tasks) {
    const projectId = task.project_id
    if (!projectId) continue
    const existing = tasksByProjectId.get(projectId) ?? []
    existing.push(task)
    tasksByProjectId.set(projectId, existing)
  }

  const candidates: ProjectScheduleCandidate[] = []
  for (const project of projectItems) {
    const projectTasks = tasksByProjectId.get(project.id) ?? []
    if (projectTasks.length === 0) {
      candidates.push({
        ...project,
        id: project.id,
        sourceType: 'PROJECT',
        parentProjectId: project.id,
        parentProjectName: project.name,
        name: project.name,
        project,
      })
      continue
    }

    const unfinishedTasks = projectTasks
      .filter((task) => !isCompletedTask(task))
      .sort(compareTasksForScheduling)

    for (const task of unfinishedTasks) {
      const taskEnergy = normEnergy(task.energy)
      candidates.push({
        ...project,
        id: task.id,
        sourceType: 'TASK',
        parentProjectId: project.id,
        parentProjectName: project.name,
        name: task.name ?? '',
        duration_min: task.duration_min,
        energy: taskEnergy ?? project.energy,
        weight: project.weight,
        taskCount: project.taskCount,
        skill_icon: task.skill_icon ?? project.skill_icon ?? null,
        goalWeight: project.goalWeight,
        goal_id: project.goal_id ?? null,
        goal_area_id: project.goal_area_id ?? null,
        globalRank: project.globalRank ?? project.global_rank ?? null,
        global_rank: project.global_rank ?? project.globalRank ?? null,
        task,
        project,
      })
    }
  }

  return candidates
}
