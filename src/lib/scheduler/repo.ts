import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseBrowser } from '../../../lib/supabase'
import type { Database } from '../../../types/supabase'
import type { TaskLite, ProjectLite } from './weight'
import type { WindowLite } from './core/repo'
import {
  fetchReadyTasks as fetchReadyTasksCore,
  updateTaskStage as updateTaskStageCore,
  fetchWindowsForDate as fetchWindowsForDateCore,
  fetchAllWindows as fetchAllWindowsCore,
  fetchProjectsMap as fetchProjectsMapCore,
  fetchProjectSkillsForProjects as fetchProjectSkillsForProjectsCore,
} from './core/repo'

type Client = SupabaseClient<Database>

function ensureClient(client?: Client): Client {
  if (client) return client
  const supabase = getSupabaseBrowser()
  if (!supabase) throw new Error('Supabase client not available')
  return supabase as Client
}

export type { WindowLite }

export async function fetchReadyTasks(client?: Client): Promise<TaskLite[]> {
  const supabase = ensureClient(client)
  return await fetchReadyTasksCore(supabase)
}

export async function updateTaskStage(
  taskId: string,
  stage: TaskLite['stage'],
  client?: Client,
) {
  const supabase = ensureClient(client)
  return await updateTaskStageCore(supabase, taskId, stage)
}

export async function fetchWindowsForDate(
  date: Date,
  client?: Client,
  timeZone?: string | null,
): Promise<WindowLite[]> {
  const supabase = ensureClient(client)
  return await fetchWindowsForDateCore(supabase, date, timeZone)
}

export async function fetchAllWindows(client?: Client): Promise<WindowLite[]> {
  const supabase = ensureClient(client)
  return await fetchAllWindowsCore(supabase)
}

export async function fetchProjectsMap(
  client?: Client,
): Promise<Record<string, ProjectLite>> {
  const supabase = ensureClient(client)
  return await fetchProjectsMapCore(supabase)
}

export async function fetchProjectSkillsForProjects(
  projectIds: string[],
  client?: Client,
): Promise<Record<string, string[]>> {
  if (projectIds.length === 0) return {}
  const supabase = ensureClient(client)
  return await fetchProjectSkillsForProjectsCore(supabase, projectIds)
}
