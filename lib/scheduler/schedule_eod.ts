import type { Database } from '../../types/supabase'
import { getServiceSupabaseClient } from './service_client'

type ScheduleInstanceRow = Database['public']['Tables']['schedule_instances']['Row']

function toISOString(date: Date): string {
  return new Date(date.getTime()).toISOString()
}

export async function finalizeTodaySimple(
  userId: string,
  dateLocal: Date
): Promise<ScheduleInstanceRow[]> {
  if (!userId) throw new Error('userId is required')
  if (!(dateLocal instanceof Date) || Number.isNaN(dateLocal.getTime())) {
    throw new Error('dateLocal must be a valid Date')
  }

  const client = await getServiceSupabaseClient()

  const dayStart = new Date(dateLocal)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart)
  dayEnd.setHours(23, 59, 59, 999)

  const startISO = toISOString(dayStart)
  const endISO = toISOString(dayEnd)

  const { data, error } = await client
    .from('schedule_instances')
    .update({ status: 'missed', completed_at: null })
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .gte('end_utc', startISO)
    .lte('end_utc', endISO)
    .select('*')

  if (error) throw error

  return data ?? []
}
