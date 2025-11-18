import { ENERGY, type Energy } from './config'
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
