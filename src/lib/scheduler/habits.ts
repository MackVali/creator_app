import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
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
  energy?: string | null
  recurrence: string | null
  recurrenceDays: number[] | null
  skillId: string | null
  goalId: string | null
  completionTarget: number | null
  locationContext: string | null
  daylightPreference: string | null
  windowEdgePreference: string | null
  window: {
    id: string
    label: string | null
    energy: string | null
    startLocal: string
    endLocal: string
    days: number[] | null
    locationContext: string | null
  } | null
}

type HabitRecord = {
  id: string
  name?: string | null
  duration_minutes?: number | null
  created_at?: string | null
  updated_at?: string | null
  habit_type?: string | null
  window_id?: string | null
  energy?: string | null
  recurrence?: string | null
  recurrence_days?: number[] | null
  skill_id?: string | null
  goal_id?: string | null
  completion_target?: number | null
  location_context?: string | null
  daylight_preference?: string | null
  window_edge_preference?: string | null
  window?: {
    id?: string
    label?: string | null
    energy?: string | null
    start_local?: string | null
    end_local?: string | null
    days?: number[] | null
    location_context?: string | null
  } | null
}

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

function normalizeHabitType(value?: string | null) {
  const raw = (value ?? 'HABIT').toUpperCase()
  if (raw === 'ASYNC') return 'SYNC'
  return raw
}

export async function fetchHabitsForSchedule(client?: Client): Promise<HabitScheduleItem[]> {
  const supabase = ensureClient(client)
  if (!supabase) return []

  const from = (supabase as { from?: (table: string) => unknown }).from
  if (typeof from !== 'function') return []

  const selectColumns =
    'id, name, duration_minutes, created_at, updated_at, habit_type, window_id, energy, recurrence, recurrence_days, skill_id, goal_id, completion_target, location_context, daylight_preference, window_edge_preference, window:windows(id, label, energy, start_local, end_local, days, location_context)'
  const fallbackColumns =
    'id, name, duration_minutes, created_at, updated_at, habit_type, window_id, energy, recurrence, recurrence_days, skill_id, location_context, daylight_preference, window_edge_preference, window:windows(id, label, energy, start_local, end_local, days, location_context)'

  const select = from.call(supabase, 'habits') as {
    select?: (
      columns: string
    ) => Promise<{ data: HabitRecord[] | null; error: PostgrestError | null }>
  }

  if (!select || typeof select.select !== 'function') {
    return []
  }

  let supportsGoalMetadata = true
  let data: HabitRecord[] | null = null

  const primary = await select.select(selectColumns)

  if (primary.error) {
    console.warn('Failed to load habit schedule metadata with goal fields, falling back', primary.error)
    supportsGoalMetadata = false
    const fallbackQuery = from.call(supabase, 'habits') as {
      select?: (
        columns: string
      ) => Promise<{ data: HabitRecord[] | null; error: PostgrestError | null }>
    }
    if (!fallbackQuery || typeof fallbackQuery.select !== 'function') {
      throw primary.error
    }
    const fallback = await fallbackQuery.select(fallbackColumns)
    if (fallback.error) {
      throw fallback.error
    }
    data = fallback.data as HabitRecord[] | null
  } else {
    data = primary.data as HabitRecord[] | null
  }

  return (data ?? []).map((record: HabitRecord) => ({
    id: record.id,
    name: record.name ?? 'Untitled habit',
    durationMinutes: record.duration_minutes ?? null,
    createdAt: record.created_at ?? null,
    updatedAt: record.updated_at ?? null,
    lastCompletedAt: record.updated_at ?? record.created_at ?? null,
    habitType: normalizeHabitType(record.habit_type),
    windowId: record.window_id ?? null,
    energy: record.energy ?? record.window?.energy ?? null,
    recurrence: record.recurrence ?? null,
    recurrenceDays: record.recurrence_days ?? null,
    skillId: record.skill_id ?? null,
    goalId: supportsGoalMetadata ? record.goal_id ?? null : null,
    completionTarget:
      supportsGoalMetadata && typeof record.completion_target === 'number' && Number.isFinite(record.completion_target)
        ? record.completion_target
        : null,
    locationContext: record.location_context ?? null,
    daylightPreference: record.daylight_preference ?? null,
    windowEdgePreference: record.window_edge_preference ?? null,
    window: record.window
      ? {
          id: record.window.id ?? '',
          label: record.window.label ?? null,
          energy: record.window.energy ?? null,
          startLocal: record.window.start_local ?? '00:00',
          endLocal: record.window.end_local ?? '00:00',
          days: record.window.days ?? null,
          locationContext: record.window.location_context ?? null,
        }
      : null,
  }))
}
