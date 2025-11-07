import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import {
  fetchProjectsMap,
  fetchProjectSkillsForProjects,
  fetchReadyTasks,
  fetchWindowsSnapshot,
  type WindowLite,
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
  habits: HabitScheduleItem[]
  skills: SkillRow[]
  monuments: Monument[]
  scheduledProjectIds: string[]
  instances: ScheduleInstance[]
}

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
  const rangeStart = startOfDayInTimeZone(baseDate, normalizedTz)
  const rangeEnd = addDaysInTimeZone(rangeStart, lookaheadDays, normalizedTz)

  const [
    windowSnapshot,
    tasks,
    projectMap,
    habits,
    skills,
    monuments,
    scheduledProjectIds,
  ] = await Promise.all([
    fetchWindowsSnapshot(userId, client),
    fetchReadyTasks(client),
    fetchProjectsMap(client),
    fetchHabitsForSchedule(userId, client),
    fetchSkillsForUser(userId, client),
    fetchMonumentsForUser(userId, client),
    fetchScheduledProjectIds(userId, client),
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

  return {
    generatedAt: new Date().toISOString(),
    rangeStartUTC: rangeStart.toISOString(),
    rangeEndUTC: rangeEnd.toISOString(),
    lookaheadDays,
    windowSnapshot,
    tasks,
    projects: Object.values(projectMap),
    projectSkillIds,
    habits,
    skills,
    monuments,
    scheduledProjectIds,
    instances: instanceRows ?? [],
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
