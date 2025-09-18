import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseBrowser } from '../../../lib/supabase'
import type { Database } from '../../../types/supabase'

export type ScheduleInstance = Database['public']['Tables']['schedule_instances']['Row']
export type ScheduleInstanceStatus = Database['public']['Enums']['schedule_instance_status']

type Client = SupabaseClient<Database>

async function ensureClient(client?: Client): Promise<Client> {
  if (client) return client
  const supabase = getSupabaseBrowser()
  if (!supabase) throw new Error('Supabase client not available')
  return supabase as Client
}

export async function fetchInstancesForRange(
  userId: string,
  startUTC: string,
  endUTC: string,
  client?: Client
) {
  const supabase = await ensureClient(client)
  return await supabase
    .from('schedule_instances')
    .select('*')
    .eq('user_id', userId)
    .lt('start_utc', endUTC)
    .gt('end_utc', startUTC)
    .neq('status', 'canceled')
}

export async function createInstance(
  input: {
    userId: string
    sourceId: string
    windowId?: string | null
    startUTC: string
    endUTC: string
    durationMin: number
    weightSnapshot: number
    energyResolved: string
  },
  client?: Client
) {
  const supabase = await ensureClient(client)
  return await supabase
    .from('schedule_instances')
    .insert({
      user_id: input.userId,
      source_type: 'PROJECT',
      source_id: input.sourceId,
      window_id: input.windowId ?? null,
      start_utc: input.startUTC,
      end_utc: input.endUTC,
      duration_min: input.durationMin,
      status: 'scheduled',
      weight_snapshot: input.weightSnapshot,
      energy_resolved: input.energyResolved,
    })
    .select('*')
    .single()
}

export async function updateInstanceStatus(
  id: string,
  status: 'scheduled' | 'completed' | 'missed' | 'canceled',
  completedAtUTC?: string,
  client?: Client
) {
  const supabase = await ensureClient(client)
  return await supabase
    .from('schedule_instances')
    .update({
      status,
      completed_at: completedAtUTC ?? null,
    })
    .eq('id', id)
}

export async function fetchBacklogNeedingSchedule(
  userId: string,
  client?: Client
) {
  const supabase = await ensureClient(client)
  return await supabase
    .from('schedule_instances')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'missed')
    .order('weight_snapshot', { ascending: false })
}
