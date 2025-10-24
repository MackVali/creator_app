import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseBrowser } from '@/lib/supabase'
import type { Database } from '../../../types/supabase'
import type {
  ScheduleInstance,
  ScheduleInstanceStatus,
  ScheduleInstanceSourceType,
} from './core/instanceRepo'
import {
  fetchInstancesForRange as fetchInstancesForRangeCore,
  fetchScheduledProjectIds as fetchScheduledProjectIdsCore,
  createInstance as createInstanceCore,
  rescheduleInstance as rescheduleInstanceCore,
  updateInstanceStatus as updateInstanceStatusCore,
  fetchBacklogNeedingSchedule as fetchBacklogNeedingScheduleCore,
} from './core/instanceRepo'

type Client = SupabaseClient<Database>

async function ensureClient(client?: Client): Promise<Client> {
  if (client) return client

  const supabase = getSupabaseBrowser?.()
  if (!supabase) throw new Error('Supabase client not available')
  return supabase as Client
}

export type { ScheduleInstance, ScheduleInstanceStatus, ScheduleInstanceSourceType }

export async function fetchInstancesForRange(
  userId: string,
  startUTC: string,
  endUTC: string,
  client?: Client,
) {
  const supabase = await ensureClient(client)
  return await fetchInstancesForRangeCore(supabase, userId, startUTC, endUTC)
}

export async function fetchScheduledProjectIds(
  userId: string,
  client?: Client,
): Promise<string[]> {
  const supabase = await ensureClient(client)
  return await fetchScheduledProjectIdsCore(supabase, userId)
}

export async function createInstance(
  input: {
    userId: string
    sourceId: string
    sourceType?: ScheduleInstanceSourceType
    windowId?: string | null
    startUTC: string
    endUTC: string
    durationMin: number
    weightSnapshot: number
    energyResolved: string
  },
  client?: Client,
) {
  const supabase = await ensureClient(client)
  return await createInstanceCore(supabase, input)
}

export async function rescheduleInstance(
  id: string,
  input: {
    windowId?: string | null
    startUTC: string
    endUTC: string
    durationMin: number
    weightSnapshot: number
    energyResolved: string
  },
  client?: Client,
) {
  const supabase = await ensureClient(client)
  return await rescheduleInstanceCore(supabase, id, input)
}

export async function updateInstanceStatus(
  id: string,
  status: 'completed' | 'canceled' | 'scheduled',
  completedAtUTC?: string,
  client?: Client,
) {
  const supabase = await ensureClient(client)
  return await updateInstanceStatusCore(supabase, id, status, completedAtUTC)
}

export async function fetchBacklogNeedingSchedule(
  userId: string,
  client?: Client,
) {
  const supabase = await ensureClient(client)
  return await fetchBacklogNeedingScheduleCore(supabase, userId)
}
