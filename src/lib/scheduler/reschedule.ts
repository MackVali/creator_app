import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import type { Database } from '../../../types/supabase'
import type { GeoCoordinates } from './sunlight'
import type { SchedulerModePayload } from './modes'
import {
  markMissedAndQueue as markMissedAndQueueCore,
  scheduleBacklog as scheduleBacklogCore,
  type SchedulerProgressLogger,
} from './core/runScheduler'

export type {
  ScheduleInstance,
  ScheduleInstanceStatus,
  ScheduleInstanceSourceType,
} from './core/instanceRepo'
export type {
  ScheduleBacklogResult,
  ScheduleDraftPlacement,
  ProjectDraftPlacement,
  HabitDraftPlacement,
  ScheduleFailure,
  SchedulerProgressEvent,
  SchedulerProgressLogger,
} from './core/runScheduler'

type Client = SupabaseClient<Database>

async function ensureClient(client?: Client): Promise<Client> {
  if (client) return client

  const supabase = await createServerClient()
  if (!supabase) {
    throw new Error('Supabase server client not available')
  }
  return supabase as Client
}

export async function markMissedAndQueue(
  userId: string,
  now = new Date(),
  client?: Client,
) {
  const supabase = await ensureClient(client)
  return await markMissedAndQueueCore(supabase, userId, now)
}

export async function scheduleBacklog(
  userId: string,
  baseDate = new Date(),
  client?: Client,
  options?: {
    timeZone?: string | null
    location?: GeoCoordinates | null
    mode?: SchedulerModePayload | null
    progressLogger?: SchedulerProgressLogger
  },
) {
  const supabase = await ensureClient(client)
  return await scheduleBacklogCore(supabase, userId, baseDate, options)
}
