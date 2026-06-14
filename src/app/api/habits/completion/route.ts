import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  ensureCompletionEvent,
  isCompletionSchemaMissing,
} from '@/lib/completions/completionEvents'
import { normalizeTimeZone, formatDateKeyInTimeZone } from '@/lib/scheduler/timezone'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { refreshHabitStreak } from '@/lib/streaks'

const completionRequestSchema = z.object({
  habitId: z.string().uuid(),
  completedAt: z.string().datetime().optional(),
  timeZone: z.string().optional(),
  action: z.enum(['complete', 'undo']),
  scheduleInstanceId: z.string().uuid().optional(),
  durationMin: z.number().int().nonnegative().nullable().optional(),
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

    const { habitId, completedAt, timeZone, action, scheduleInstanceId, durationMin } = parsed.data
    const resolvedTimeZone = normalizeTimeZone(timeZone)
    const completedAtDate = completedAt ? new Date(completedAt) : new Date()
    if (Number.isNaN(completedAtDate.getTime())) {
      return NextResponse.json({ error: 'Invalid completedAt timestamp' }, { status: 400 })
    }
    const completionDay = formatDateKeyInTimeZone(completedAtDate, resolvedTimeZone)
    const completionTimestamp = completedAtDate.toISOString()

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

      try {
        await ensureCompletionEvent({
          client: supabase,
          userId: user.id,
          input: {
            action: 'complete',
            sourceType: 'HABIT',
            sourceId: habitId,
            completedAt: completionTimestamp,
            scheduleInstanceId,
            wasScheduled: Boolean(scheduleInstanceId),
            durationMin,
            timeZone: resolvedTimeZone,
          },
        })
      } catch (completionError) {
        if (!isCompletionSchemaMissing(completionError)) {
          console.error('Failed to record habit completion event', completionError)
        }
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

      try {
        await ensureCompletionEvent({
          client: supabase,
          userId: user.id,
          input: {
            action: 'undo',
            sourceType: 'HABIT',
            sourceId: habitId,
            completedAt: completionTimestamp,
            scheduleInstanceId,
            wasScheduled: Boolean(scheduleInstanceId),
            timeZone: resolvedTimeZone,
          },
        })
      } catch (completionError) {
        if (!isCompletionSchemaMissing(completionError)) {
          console.error('Failed to revoke habit completion event', completionError)
        }
      }
    }

    await refreshHabitStreak(supabase, habitId, user.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to persist habit completion metadata', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
