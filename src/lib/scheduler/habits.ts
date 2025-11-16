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
  currentStreakDays: number
  longestStreakDays: number
  habitType: string
  windowId: string | null
  energy?: string | null
  recurrence: string | null
  recurrenceDays: number[] | null
  skillId: string | null
  goalId: string | null
  completionTarget: number | null
  locationContextId: string | null
  locationContextValue: string | null
  locationContextName: string | null
  daylightPreference: string | null
  windowEdgePreference: string | null
  nextDueOverride?: string | null
  window: {
    id: string
    label: string | null
    energy: string | null
    startLocal: string
    endLocal: string
    days: number[] | null
    locationContextId: string | null
    locationContextValue: string | null
    locationContextName: string | null
  } | null
}

type HabitRecord = {
  id: string
  name?: string | null
  duration_minutes?: number | null
  created_at?: string | null
  updated_at?: string | null
  last_completed_at?: string | null
  current_streak_days?: number | null
  longest_streak_days?: number | null
  habit_type?: string | null
  window_id?: string | null
  energy?: string | null
  recurrence?: string | null
  recurrence_days?: number[] | null
  skill_id?: string | null
  goal_id?: string | null
  completion_target?: number | null
  location_context_id?: string | null
  location_context?: {
    id?: string | null
    value?: string | null
    label?: string | null
  } | null
  daylight_preference?: string | null
  window_edge_preference?: string | null
  window?: {
    id?: string
    label?: string | null
    energy?: string | null
    start_local?: string | null
    end_local?: string | null
    days?: number[] | null
    location_context_id?: string | null
    location_context?: {
      id?: string | null
      value?: string | null
      label?: string | null
    } | null
  } | null
  next_due_override?: string | null
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

let cachedGoalMetadataSupport: 'unknown' | 'supported' | 'unsupported' = 'unknown'

function isGoalMetadataMissingError(error: PostgrestError | null): boolean {
  if (!error) return false
  if (error.code === '42703') return true
  const haystack = `${error.message ?? ''}`.toLowerCase()
  if (!haystack) return false
  return haystack.includes('goal_id') || haystack.includes('completion_target')
}

export async function fetchHabitsForSchedule(
  userId: string,
  client?: Client
): Promise<HabitScheduleItem[]> {
  if (!userId) return []

  const supabase = ensureClient(client)
  if (!supabase) return []

  const from = (supabase as { from?: (table: string) => unknown }).from
  if (typeof from !== 'function') return []

  const locationJoin = 'location_context:location_contexts(id, value, label)'
  const windowJoin = `window:windows(id, label, energy, start_local, end_local, days, location_context_id, ${locationJoin})`
  const baseColumns =
    `id, name, duration_minutes, created_at, updated_at, last_completed_at, current_streak_days, longest_streak_days, habit_type, window_id, energy, recurrence, recurrence_days, skill_id, location_context_id, ${locationJoin}, daylight_preference, window_edge_preference, next_due_override, ${windowJoin}`
  const extendedColumns =
    `${baseColumns}, goal_id, completion_target`

  let supportsGoalMetadata = cachedGoalMetadataSupport !== 'unsupported'
  let data: HabitRecord[] | null = null

  const emptyResponse = async () =>
    ({ data: [] as HabitRecord[], error: null } satisfies {
      data: HabitRecord[] | null
      error: PostgrestError | null
    })

  const buildQuery = (
    columns: string
  ): Promise<{ data: HabitRecord[] | null; error: PostgrestError | null }> => {
    const table = from.call(supabase, 'habits') as {
      select?: (columns: string) => unknown
    }
    if (!table || typeof table.select !== 'function') {
      return emptyResponse()
    }
    const selected = table.select(columns) as {
      eq?: (column: string, value: string) => unknown
    }
    if (!selected || typeof selected.eq !== 'function') {
      return emptyResponse()
    }
    const filtered = selected.eq('user_id', userId) as {
      order?: (column: string, options: { ascending: boolean }) => Promise<{
        data: HabitRecord[] | null
        error: PostgrestError | null
      }>
    }
    if (!filtered || typeof filtered.order !== 'function') {
      return emptyResponse()
    }
    return filtered.order('updated_at', { ascending: false })
  }

  if (supportsGoalMetadata) {
    const primary = await buildQuery(extendedColumns)
    if (primary.error) {
      if (isGoalMetadataMissingError(primary.error)) {
        if (cachedGoalMetadataSupport !== 'unsupported') {
          console.warn(
            'Failed to load habit schedule metadata with goal fields, falling back',
            primary.error
          )
        }
        cachedGoalMetadataSupport = 'unsupported'
        supportsGoalMetadata = false
      } else {
        throw primary.error
      }
    } else {
      cachedGoalMetadataSupport = 'supported'
      data = primary.data as HabitRecord[] | null
    }
  }

  if (!data) {
    const fallback = await buildQuery(baseColumns)
    if (fallback.error) {
      throw fallback.error
    }
    data = fallback.data as HabitRecord[] | null
    supportsGoalMetadata = false
  }

  return (data ?? []).map((record: HabitRecord) => ({
    id: record.id,
    name: record.name ?? 'Untitled habit',
    durationMinutes: record.duration_minutes ?? null,
    createdAt: record.created_at ?? null,
    updatedAt: record.updated_at ?? null,
    lastCompletedAt: record.last_completed_at ?? null,
    currentStreakDays: Number.isFinite(record.current_streak_days)
      ? Number(record.current_streak_days)
      : 0,
    longestStreakDays: Number.isFinite(record.longest_streak_days)
      ? Number(record.longest_streak_days)
      : 0,
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
    locationContextId: record.location_context_id ?? null,
    locationContextValue: record.location_context?.value
      ? String(record.location_context.value).toUpperCase().trim()
      : null,
    locationContextName:
      record.location_context?.label ??
      (record.location_context?.value
        ? String(record.location_context.value).toUpperCase()
        : null),
    daylightPreference: record.daylight_preference ?? null,
    windowEdgePreference: record.window_edge_preference ?? null,
    nextDueOverride: record.next_due_override ?? null,
    window: record.window
      ? {
          id: record.window.id ?? '',
          label: record.window.label ?? null,
          energy: record.window.energy ?? null,
          startLocal: record.window.start_local ?? '00:00',
          endLocal: record.window.end_local ?? '00:00',
          days: record.window.days ?? null,
          locationContextId: record.window.location_context_id ?? null,
          locationContextValue: record.window.location_context?.value
            ? String(record.window.location_context.value).toUpperCase().trim()
            : null,
          locationContextName:
            record.window.location_context?.label ??
            (record.window.location_context?.value
              ? String(record.window.location_context.value).toUpperCase()
              : null),
        }
      : null,
  }))
}
