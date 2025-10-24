// @ts-nocheck
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../../types/supabase'

export type ScheduleInstance = Database['public']['Tables']['schedule_instances']['Row']
export type ScheduleInstanceStatus = Database['public']['Enums']['schedule_instance_status']
export type ScheduleInstanceSourceType =
  Database['public']['Enums']['schedule_instance_source_type']

type Client = SupabaseClient<Database>

function scheduleInstances(client: Client) {
  return (client as unknown as {
    from: (table: string) => ReturnType<Client['from']>
  }).from('schedule_instances')
}

export async function fetchInstancesForRange(
  client: Client,
  userId: string,
  startUTC: string,
  endUTC: string,
) {
  const base = scheduleInstances(client)
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

export async function fetchScheduledProjectIds(
  client: Client,
  userId: string,
): Promise<string[]> {
  const { data, error } = await scheduleInstances(client)
    .select('source_id')
    .eq('user_id', userId)
    .eq('source_type', 'PROJECT')
    .in('status', ['scheduled', 'completed', 'missed'])

  if (error) throw error

  const ids = new Set<string>()
  for (const record of (data ?? []) as Array<Pick<ScheduleInstance, 'source_id'>>) {
    if (record.source_id) ids.add(record.source_id)
  }
  return Array.from(ids)
}

export async function createInstance(
  client: Client,
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
) {
  const sourceType = input.sourceType ?? 'PROJECT'
  return await scheduleInstances(client)
    .insert({
      user_id: input.userId,
      source_type: sourceType,
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

export async function createInstancesBatch(
  client: Client,
  inputs: Array<{
    userId: string
    sourceId: string
    sourceType?: ScheduleInstanceSourceType
    windowId?: string | null
    startUTC: string
    endUTC: string
    durationMin: number
    weightSnapshot: number
    energyResolved: string
  }>,
) {
  if (!inputs.length) {
    return { data: [] as ScheduleInstance[], error: null }
  }

  const rows = inputs.map(input => ({
    user_id: input.userId,
    source_type: input.sourceType ?? 'PROJECT',
    source_id: input.sourceId,
    window_id: input.windowId ?? null,
    start_utc: input.startUTC,
    end_utc: input.endUTC,
    duration_min: input.durationMin,
    status: 'scheduled',
    weight_snapshot: input.weightSnapshot,
    energy_resolved: input.energyResolved,
  }))

  return await scheduleInstances(client).insert(rows).select('*')
}

export async function rescheduleInstance(
  client: Client,
  id: string,
  input: {
    windowId?: string | null
    startUTC: string
    endUTC: string
    durationMin: number
    weightSnapshot: number
    energyResolved: string
  },
) {
  return await scheduleInstances(client)
    .update({
      window_id: input.windowId ?? null,
      start_utc: input.startUTC,
      end_utc: input.endUTC,
      duration_min: input.durationMin,
      status: 'scheduled',
      weight_snapshot: input.weightSnapshot,
      energy_resolved: input.energyResolved,
      completed_at: null,
    })
    .eq('id', id)
    .select('*')
    .single()
}

export async function updateInstanceStatus(
  client: Client,
  id: string,
  status: 'completed' | 'canceled' | 'scheduled',
  completedAtUTC?: string,
) {
  const completedAt =
    status === 'completed' ? completedAtUTC ?? new Date().toISOString() : null
  return await scheduleInstances(client)
    .update({
      status,
      completed_at: completedAt,
    })
    .eq('id', id)
}

export async function fetchBacklogNeedingSchedule(
  client: Client,
  userId: string,
) {
  return await scheduleInstances(client)
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'missed')
    .order('weight_snapshot', { ascending: false })
}
