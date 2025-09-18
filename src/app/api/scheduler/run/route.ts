import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { markMissedAndQueue, scheduleBacklog } from '@/lib/scheduler/reschedule'

export const runtime = 'nodejs'

export async function POST() {
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

  const now = new Date()

  const markResult = await markMissedAndQueue(user.id, now, supabase)
  if (markResult.error) {
    return NextResponse.json(
      { error: markResult.error.message ?? 'failed to mark missed instances' },
      { status: 500 }
    )
  }

  const scheduleResult = await scheduleBacklog(user.id, now, supabase)
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
