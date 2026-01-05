import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  normalizeTimeZone,
  formatDateKeyInTimeZone,
  startOfDayInTimeZone,
  addDaysInTimeZone,
} from '@/lib/scheduler/timezone'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { refreshHabitStreak } from '@/lib/streaks'

const completionRequestSchema = z.object({
  habitId: z.string().uuid(),
  completedAt: z.string().datetime().optional(),
  timeZone: z.string().optional(),
  action: z.enum(['complete', 'undo']),
  instanceId: z.string().uuid().optional().nullable(),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase client unavailable' }, { status: 500 })
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const payload = await request.json()
    const parsed = completionRequestSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { habitId, completedAt, timeZone, action, instanceId } = parsed.data
    const resolvedTimeZone = normalizeTimeZone(timeZone)
    const completedAtDate = completedAt ? new Date(completedAt) : new Date()
    if (Number.isNaN(completedAtDate.getTime())) {
      return NextResponse.json({ error: 'Invalid completedAt timestamp' }, { status: 400 })
    }
    const completionDay = formatDateKeyInTimeZone(completedAtDate, resolvedTimeZone)
    const completionTimestamp = completedAtDate.toISOString()
    const scheduleUpdatePayload =
      action === 'complete'
        ? { status: 'completed', completed_at: completionTimestamp }
        : { status: 'scheduled', completed_at: null }

    if (action === 'complete') {
      const { error } = await supabase
        .from('habit_completion_days')
        .upsert(
          {
            habit_id: habitId,
            user_id: user.id,
            completion_day: completionDay,
            completed_at: completionTimestamp,
          },
          { onConflict: 'habit_id,completion_day' }
        )

      if (error) {
        return NextResponse.json({ error: error.message ?? 'Failed to record completion' }, { status: 500 })
      }

      const { error: overrideError } = await supabase
        .from('habits')
        .update({ next_due_override: null })
        .eq('id', habitId)
        .eq('user_id', user.id)
      if (overrideError) {
        console.error('Failed to clear habit due override after completion', overrideError)
      }
    } else {
      const { error } = await supabase
        .from('habit_completion_days')
        .delete()
        .match({
          habit_id: habitId,
          user_id: user.id,
          completion_day: completionDay,
        })

      if (error) {
        return NextResponse.json({ error: error.message ?? 'Failed to remove completion' }, { status: 500 })
      }
    }

    // Keep schedule_instances in sync with completion toggles when possible
    const syncTargets: string[] = []
    if (instanceId) {
      syncTargets.push(instanceId)
    } else {
      const dayStart = startOfDayInTimeZone(completedAtDate, resolvedTimeZone)
      const dayEnd = addDaysInTimeZone(dayStart, 1, resolvedTimeZone)
      const { data: instances, error: fetchError } = await supabase
        .from('schedule_instances')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('source_type', 'HABIT')
        .eq('source_id', habitId)
        .gte('start_utc', dayStart.toISOString())
        .lt('start_utc', dayEnd.toISOString())

      if (!fetchError) {
        for (const instance of instances ?? []) {
          if (
            instance?.id &&
            (instance.status === 'scheduled' || instance.status === 'completed' || instance.status === 'in_progress')
          ) {
            syncTargets.push(instance.id)
          }
        }
      }
    }

    if (syncTargets.length > 0) {
      const { error: syncError } = await supabase
        .from('schedule_instances')
        .update(scheduleUpdatePayload)
        .in('id', syncTargets)
        .eq('user_id', user.id)

      if (syncError) {
        return NextResponse.json({ error: syncError.message ?? 'Failed to sync instance status' }, { status: 500 })
      }
    }

    await refreshHabitStreak(supabase, habitId, user.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to persist habit completion metadata', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
