import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { markMissedAndQueue, scheduleBacklog } from '@/lib/scheduler/reschedule'

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

  let timezoneOffsetMinutes = 0
  const contentType = request.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    try {
      const body = await request.json()
      const candidate = body?.timezoneOffset
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        timezoneOffsetMinutes = candidate
      }
    } catch (error) {
      console.warn('Failed to parse scheduler run payload', error)
    }
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
    timezoneOffsetMinutes
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

export async function GET() {
  return NextResponse.json(
    { error: 'method not allowed' },
    { status: 405, headers: { Allow: 'POST' } }
  )
}
