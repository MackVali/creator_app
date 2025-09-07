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
}

export function buildProjectItems(
  projects: ProjectLite[],
  tasks: TaskLite[]
): ProjectItem[] {
  const items: ProjectItem[] = []
  for (const p of projects) {
    const related = tasks.filter(t => t.project_id === p.id)
    const duration_min =
      related.reduce((sum, t) => sum + t.duration_min, 0) ||
      DEFAULT_PROJECT_DURATION_MIN
    const energy =
      related.reduce<Energy | null>((acc, t) => {
        if (!t.energy) return acc
        const current = t.energy as Energy
        if (!acc) return current
        return ENERGY.LIST.indexOf(current) > ENERGY.LIST.indexOf(acc)
          ? current
          : acc
      }, null) ?? DEFAULT_PROJECT_ENERGY
    const relatedWeightSum = related.reduce(
      (sum, t) => sum + taskWeight(t),
      0
    )
    const weight = projectWeight(p, relatedWeightSum)
    items.push({
      ...p,
      name: p.name ?? '',
      duration_min,
      energy,
      weight,
      taskCount: related.length,
    })
  }
  return items
}

