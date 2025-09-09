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
    const norm = (e?: string | null): Energy | null => {
      const up = (e ?? '').toUpperCase()
      return ENERGY.LIST.includes(up as Energy) ? (up as Energy) : null
    }
    const energy =
      related.reduce<Energy | null>((acc, t) => {
        const current = norm(t.energy)
        if (!current) return acc
        if (!acc) return current
        return ENERGY.LIST.indexOf(current) > ENERGY.LIST.indexOf(acc)
          ? current
          : acc
      }, norm(p.energy)) ?? DEFAULT_PROJECT_ENERGY
    const relatedWeightSum = related.reduce(
      (sum, t) => sum + taskWeight(t),
      0
    )
    const weight = projectWeight(p, relatedWeightSum)
    const skill_icon = related.find(t => t.skill_icon)?.skill_icon ?? null
    items.push({
      ...p,
      name: p.name ?? '',
      duration_min,
      energy,
      weight,
      taskCount: related.length,
      skill_icon,
    })
  }
  return items
}

