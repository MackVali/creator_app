import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseBrowser } from '@/lib/supabase'
import type { Database } from '../../../types/supabase'

export const DEFAULT_HABIT_DURATION_MIN = 15

export type HabitScheduleItem = {
  id: string
  name: string
  durationMinutes: number | null
  createdAt: string | null
  updatedAt: string | null
  lastCompletedAt: string | null
  habitType: string
  windowId: string | null
  recurrence: string | null
  recurrenceDays: string[] | null
  skillId: string | null
  window: {
    id: string
    label: string | null
    energy: string | null
    startLocal: string
    endLocal: string
    days: number[] | null
  } | null
}

type Client = SupabaseClient<Database>

function ensureClient(client?: Client): Client {
  if (client) return client
  const supabase = getSupabaseBrowser()
  if (!supabase) throw new Error('Supabase client not available')
  return supabase as Client
}

export async function fetchHabitsForSchedule(client?: Client): Promise<HabitScheduleItem[]> {
  const supabase = ensureClient(client)

  const { data, error } = await supabase
    .from('habits')
    .select(
      `id, name, duration_minutes, created_at, updated_at, habit_type, window_id, recurrence, recurrence_days, skill_id, window:windows(id, label, energy, start_local, end_local, days)`
    )

  if (error) throw error

  type HabitRecord = {
    id: string
    name?: string | null
    duration_minutes?: number | null
    created_at?: string | null
    updated_at?: string | null
    habit_type?: string | null
    window_id?: string | null
    recurrence?: string | null
    recurrence_days?: string[] | null
    skill_id?: string | null
    window?: {
      id?: string
      label?: string | null
      energy?: string | null
      start_local?: string | null
      end_local?: string | null
      days?: number[] | null
    } | null
  }

  return (data ?? []).map((record: HabitRecord) => ({
    id: record.id,
    name: record.name ?? 'Untitled habit',
    durationMinutes: record.duration_minutes ?? null,
    createdAt: record.created_at ?? null,
    updatedAt: record.updated_at ?? null,
    lastCompletedAt: record.updated_at ?? record.created_at ?? null,
    habitType: (record.habit_type ?? 'HABIT').toUpperCase(),
    windowId: record.window_id ?? null,
    recurrence: record.recurrence ?? null,
    recurrenceDays: record.recurrence_days ?? null,
    skillId: record.skill_id ?? null,
    window: record.window
      ? {
          id: record.window.id ?? '',
          label: record.window.label ?? null,
          energy: record.window.energy ?? null,
          startLocal: record.window.start_local ?? '00:00',
          endLocal: record.window.end_local ?? '00:00',
          days: record.window.days ?? null,
        }
      : null,
  }))
}
