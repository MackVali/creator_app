// @ts-nocheck
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../../types/supabase'

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
  locationContextId: string | null
  locationContextValue: string | null
  locationContextName: string | null
  daylightPreference: string | null
  windowEdgePreference: string | null
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
}

type Client = SupabaseClient<Database>

function normalizeHabitType(value?: string | null) {
  const raw = (value ?? 'HABIT').toUpperCase()
  if (raw === 'ASYNC') return 'SYNC'
  return raw
}

export async function fetchHabitsForSchedule(client: Client): Promise<HabitScheduleItem[]> {
  const locationJoin = 'location_context:location_contexts(id, value, label)'
  const windowJoin = `window:windows(id, label, energy, start_local, end_local, days, location_context_id, ${locationJoin})`
  const selectColumns =
    `id, name, duration_minutes, created_at, updated_at, habit_type, window_id, energy, recurrence, recurrence_days, skill_id, goal_id, completion_target, location_context_id, ${locationJoin}, daylight_preference, window_edge_preference, ${windowJoin}`
  const fallbackColumns =
    `id, name, duration_minutes, created_at, updated_at, habit_type, window_id, energy, recurrence, recurrence_days, skill_id, location_context_id, ${locationJoin}, daylight_preference, window_edge_preference, ${windowJoin}`

  let supportsGoalMetadata = true
  let data: HabitRecord[] | null = null

  const primary = await client
    .from('habits')
    .select(selectColumns)

  if (primary.error) {
    console.warn(
      'Failed to load habit schedule metadata with goal fields, falling back',
      primary.error,
    )
    supportsGoalMetadata = false
    const fallback = await client.from('habits').select(fallbackColumns)
    if (fallback.error) {
      throw fallback.error
    }
    data = fallback.data as HabitRecord[] | null
  } else {
    data = primary.data as HabitRecord[] | null
  }

  return (data ?? []).map((record: HabitRecord) => {
    const normalizedLocationValue = record.location_context?.value
      ? String(record.location_context.value).toUpperCase().trim()
      : null
    const normalizedLocationName =
      record.location_context?.label ?? normalizedLocationValue
    const completionTarget = supportsGoalMetadata
      ? record.completion_target
      : null

    return {
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
        typeof completionTarget === 'number' && Number.isFinite(completionTarget)
          ? completionTarget
          : null,
      locationContextId: record.location_context_id ?? null,
      locationContextValue: normalizedLocationValue,
      locationContextName: normalizedLocationName,
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
    }
  })
}
