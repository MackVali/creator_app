import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseBrowser } from '@/lib/supabase'
import { createClient as createServerClient } from '@/lib/supabase/server'
import type { Database } from '../../../types/supabase'

export type ScheduleInstance = Database['public']['Tables']['schedule_instances']['Row']
export type ScheduleInstanceStatus = Database['public']['Enums']['schedule_instance_status']

type Client = SupabaseClient<Database>

async function ensureClient(client?: Client): Promise<Client> {
  if (client) return client

  if (typeof window === 'undefined') {
    const supabase = await createServerClient()
    if (!supabase) {
      throw new Error('Supabase server client not available')
    }
    return supabase as Client
  }

  const supabase = getSupabaseBrowser?.()
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
  const base = supabase
    .from('schedule_instances')
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'canceled')

  const startParam = startUTC
  const endParam = endUTC

  return await base
    .or(
      `and(start_utc.gte.${startParam},start_utc.lt.${endParam}),and(start_utc.lt.${startParam},end_utc.gt.${startParam})`
    )
    .order('start_utc', { ascending: true })
}

export async function createInstance(
  input: {
    userId: string
    sourceType: 'PROJECT' | 'TASK'
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
      source_type: input.sourceType,
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
  status: 'completed' | 'canceled',
  completedAtUTC?: string,
  client?: Client
) {
  const supabase = await ensureClient(client)
  const completedAt =
    status === 'completed' ? completedAtUTC ?? new Date().toISOString() : null
  return await supabase
    .from('schedule_instances')
    .update({
      status,
      completed_at: completedAt,
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
