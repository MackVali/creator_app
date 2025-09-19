import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { markMissedAndQueue, scheduleBacklog } from '@/lib/scheduler/reschedule'
import type { Database } from '../../../../../types/supabase'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json(
      { error: 'supabase client unavailable' },
      { status: 500 }
    )
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) {
    return NextResponse.json(
      { error: authError.message },
      { status: 500 }
    )
  }

  if (!user) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
  }

  let timezoneOffsetMinutes: number | null = null
  let hasRequestTimezone = false
  const contentType = request.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    try {
      const body = await request.json()
      const candidate = body?.timezoneOffset
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        timezoneOffsetMinutes = candidate
        hasRequestTimezone = true
      }
    } catch (error) {
      console.warn('Failed to parse scheduler run payload', error)
    }
  }

  if (!hasRequestTimezone) {
    const storedOffset = await fetchStoredTimezoneOffset(supabase, user.id)
    if (storedOffset !== null) {
      timezoneOffsetMinutes = storedOffset
    }
  }

  const resolvedTimezoneOffset =
    typeof timezoneOffsetMinutes === 'number' && Number.isFinite(timezoneOffsetMinutes)
      ? timezoneOffsetMinutes
      : 0

  if (hasRequestTimezone) {
    await persistTimezoneOffset(supabase, user.id, resolvedTimezoneOffset)
  }

  const now = new Date()

  const markResult = await markMissedAndQueue(user.id, now, supabase)
  if (markResult.error) {
    return NextResponse.json(
      { error: markResult.error.message ?? 'failed to mark missed instances' },
      { status: 500 }
    )
  }

  const scheduleResult = await scheduleBacklog(
    user.id,
    now,
    supabase,
    resolvedTimezoneOffset
  )
  const status = scheduleResult.error ? 500 : 200

  return NextResponse.json(
    {
      marked: {
        count: markResult.count ?? null,
        error: markResult.error ?? null,
      },
      schedule: scheduleResult,
    },
    { status }
  )
}

async function fetchStoredTimezoneOffset(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('timezone_offset_minutes')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.warn('Failed to read stored timezone offset', error)
    return null
  }

  const raw = data?.timezone_offset_minutes
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
}

async function persistTimezoneOffset(
  supabase: SupabaseClient<Database>,
  userId: string,
  offset: number
) {
  const { error } = await supabase
    .from('profiles')
    .update({ timezone_offset_minutes: offset })
    .eq('user_id', userId)

  if (error) {
    console.warn('Failed to persist timezone offset', error)
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'method not allowed' },
    { status: 405, headers: { Allow: 'POST' } }
  )
}
