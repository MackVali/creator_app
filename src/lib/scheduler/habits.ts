import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseBrowser } from '@/lib/supabase'
import type { Database } from '../../../types/supabase'
import type { HabitScheduleItem } from './core/habits'
import {
  fetchHabitsForSchedule as fetchHabitsForScheduleCore,
  DEFAULT_HABIT_DURATION_MIN,
} from './core/habits'

export { DEFAULT_HABIT_DURATION_MIN }
export type { HabitScheduleItem }

type Client = SupabaseClient<Database>

function ensureClient(client?: Client): Client | null {
  if (client && typeof (client as { from?: unknown }).from === 'function') {
    return client
  }
  const supabase = getSupabaseBrowser()
  if (supabase && typeof (supabase as { from?: unknown }).from === 'function') {
    return supabase as Client
  }
  return null
}

export async function fetchHabitsForSchedule(client?: Client): Promise<HabitScheduleItem[]> {
  const supabase = ensureClient(client)
  if (!supabase) return []
  return await fetchHabitsForScheduleCore(supabase)
}
