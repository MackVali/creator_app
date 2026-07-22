import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  completionProductivityDayKey,
  ensureCompletionEvent,
  isCompletionSchemaMissing,
} from '@/lib/completions/completionEvents'
import { normalizeTimeZone } from '@/lib/scheduler/timezone'
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
    const completionDay = completionProductivityDayKey(completedAtDate, resolvedTimeZone)
    const completionTimestamp = completedAtDate.toISOString()

    const { data: lifecycleRows, error: lifecycleError } = await supabase.rpc(
      'set_habit_completion_day',
      {
        p_habit_id: habitId,
        p_completion_day: completionDay,
        p_completed_at: completionTimestamp,
        p_is_complete: action === 'complete',
      }
    )

    if (lifecycleError) {
      return NextResponse.json(
        { error: lifecycleError.message ?? 'Failed to update completion' },
        { status: 500 }
      )
    }

    if (action === 'complete') {

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

    const lifecycle = lifecycleRows?.[0] ?? null
    return NextResponse.json({
      success: true,
      completionCount: lifecycle?.completion_count ?? null,
      completionTarget: lifecycle?.completion_target ?? null,
      lifecycleStatus: lifecycle?.finished_at ? 'finished' : 'active',
    })
  } catch (error) {
    console.error('Failed to persist habit completion metadata', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
