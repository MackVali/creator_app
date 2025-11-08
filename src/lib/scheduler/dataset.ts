import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import {
  fetchProjectsMap,
  fetchProjectSkillsForProjects,
  fetchGoalsForUser,
  fetchReadyTasks,
  fetchWindowsSnapshot,
  type WindowLite,
  type GoalSummary,
} from './repo'
import {
  fetchHabitsForSchedule,
  type HabitScheduleItem,
} from './habits'
import {
  fetchInstancesForRange,
  fetchScheduledProjectIds,
  type ScheduleInstance,
} from './instanceRepo'
import { addDaysInTimeZone, normalizeTimeZone, startOfDayInTimeZone } from './timezone'
import type { TaskLite, ProjectLite } from './weight'
import type { SkillRow } from '@/lib/types/skill'
import type { Monument } from '@/lib/queries/monuments'

type Client = SupabaseClient<Database>

export type ScheduleEventDataset = {
  generatedAt: string
  rangeStartUTC: string
  rangeEndUTC: string
  lookaheadDays: number
  windowSnapshot: WindowLite[]
  tasks: TaskLite[]
  projects: ProjectLite[]
  projectSkillIds: Record<string, string[]>
  projectGoalRelations: ProjectGoalRelations
  habits: HabitScheduleItem[]
  skills: SkillRow[]
  monuments: Monument[]
  scheduledProjectIds: string[]
  instances: ScheduleInstance[]
}

export type ProjectGoalRelations = Record<
  string,
  {
    goalId: string
    goalName: string | null
  }
>

const COMPLETED_LOOKBACK_DAYS = 3

export async function buildScheduleEventDataset({
  userId,
  client,
  baseDate = new Date(),
  timeZone,
  lookaheadDays = 365,
}: {
  userId: string
  client: Client
  baseDate?: Date
  timeZone?: string | null
  lookaheadDays?: number
}): Promise<ScheduleEventDataset> {
  const normalizedTz = normalizeTimeZone(timeZone)
  const futureRangeAnchor = startOfDayInTimeZone(baseDate, normalizedTz)
  const rangeStart = startOfDayInTimeZone(
    addDaysInTimeZone(baseDate, -COMPLETED_LOOKBACK_DAYS, normalizedTz),
    normalizedTz
  )
  const rangeEnd = addDaysInTimeZone(futureRangeAnchor, lookaheadDays, normalizedTz)
  const nowMs = baseDate.getTime()
  const retentionCutoffMs = rangeStart.getTime()

  const [
    windowSnapshot,
    tasks,
    projectMap,
    habits,
    skills,
    monuments,
    scheduledProjectIds,
    goals,
  ] = await Promise.all([
    fetchWindowsSnapshot(userId, client),
    fetchReadyTasks(client),
    fetchProjectsMap(client),
    fetchHabitsForSchedule(userId, client),
    fetchSkillsForUser(userId, client),
    fetchMonumentsForUser(userId, client),
    fetchScheduledProjectIds(userId, client),
    fetchGoalsForUser(userId, client),
  ])

  const projectIds = Object.keys(projectMap)
  const projectSkillIds = projectIds.length
    ? await fetchProjectSkillsForProjects(projectIds, client)
    : {}

  const { data: instanceRows, error: instanceError } = await fetchInstancesForRange(
    userId,
    rangeStart.toISOString(),
    rangeEnd.toISOString(),
    client
  )
  if (instanceError) {
    throw instanceError
  }

  const filteredInstances = (instanceRows ?? []).filter(instance => {
    if (instance.status !== 'completed') return true
    const startMs = new Date(instance.start_utc ?? '').getTime()
    const endMs = new Date(instance.end_utc ?? '').getTime()
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      return false
    }
    if (startMs > nowMs && endMs > nowMs) {
      return false
    }
    if (endMs < retentionCutoffMs) {
      return false
    }
    return true
  })

  const projectList = Object.values(projectMap)
  const goalNameById = new Map<string, GoalSummary['name']>(
    goals.map(goal => [goal.id, goal.name ?? null])
  )
  const projectGoalRelations: ProjectGoalRelations = {}
  for (const project of projectList) {
    const goalId = project.goal_id ?? null
    if (!goalId) continue
    if (!project.id) continue
    projectGoalRelations[project.id] = {
      goalId,
      goalName: goalNameById.get(goalId) ?? null,
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    rangeStartUTC: rangeStart.toISOString(),
    rangeEndUTC: rangeEnd.toISOString(),
    lookaheadDays,
    windowSnapshot,
    tasks,
    projects: projectList,
    projectSkillIds,
    projectGoalRelations,
    habits,
    skills,
    monuments,
    scheduledProjectIds,
    instances: filteredInstances,
  }
}

async function fetchSkillsForUser(userId: string, client: Client): Promise<SkillRow[]> {
  const { data, error } = await client
    .from('skills')
    .select(
      'id, user_id, name, icon, cat_id, monument_id, level, created_at, updated_at'
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as SkillRow[]
}

async function fetchMonumentsForUser(userId: string, client: Client): Promise<Monument[]> {
  const { data, error } = await client
    .from('monuments')
    .select('id, title, emoji')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map(row => ({
    id: row.id,
    title: row.title,
    emoji: row.emoji ?? null,
  }))
}
