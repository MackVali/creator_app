import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { markMissedAndQueue, scheduleBacklog } from '@/lib/scheduler/reschedule'
import { normalizeTimeZone, toZonedDate } from '@/lib/scheduler/timezone'

export const runtime = 'nodejs'

type SchedulerRunRequest = {
  timeZone?: string | null
  localNow?: string | null
  offsetMinutes?: number | null
}

function parseSchedulerRunBody(body: unknown): SchedulerRunRequest | null {
  if (!body || typeof body !== 'object') return null
  const payload = body as Record<string, unknown>
  const result: SchedulerRunRequest = {}
  if (typeof payload.timeZone === 'string') {
    result.timeZone = payload.timeZone
  }
  if (typeof payload.localNow === 'string') {
    result.localNow = payload.localNow
  }
  if (typeof payload.offsetMinutes === 'number' && Number.isFinite(payload.offsetMinutes)) {
    result.offsetMinutes = payload.offsetMinutes
  }
  return result
}

export async function POST(request: Request) {
  let requestPayload: SchedulerRunRequest | null = null
  if (request.headers.get('content-type')?.includes('application/json')) {
    try {
      const rawBody = await request.json()
      requestPayload = parseSchedulerRunBody(rawBody)
    } catch (error) {
      console.warn('Failed to parse scheduler run payload', error)
    }
  }

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

  const candidateTimeZone = requestPayload?.timeZone ?? extractUserTimeZone(user)
  const timeZone = normalizeTimeZone(candidateTimeZone)

  let baseNow = new Date()
  if (requestPayload?.localNow) {
    const parsed = new Date(requestPayload.localNow)
    if (!Number.isNaN(parsed.getTime())) {
      baseNow = parsed
    }
  } else if (typeof requestPayload?.offsetMinutes === 'number') {
    const offsetMinutes = requestPayload.offsetMinutes
    const serverOffsetMinutes = -baseNow.getTimezoneOffset()
    const diffMinutes = offsetMinutes - serverOffsetMinutes
    if (Math.abs(diffMinutes) > 0) {
      baseNow = new Date(baseNow.getTime() + diffMinutes * 60_000)
    }
  }

  const now = toZonedDate(baseNow, timeZone)

  const markResult = await markMissedAndQueue(user.id, now, supabase)
  if (markResult.error) {
    return NextResponse.json(
      { error: markResult.error.message ?? 'failed to mark missed instances' },
      { status: 500 }
    )
  }

  const scheduleResult = await scheduleBacklog(user.id, now, supabase, {
    timeZone,
  })
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

function extractUserTimeZone(user: { user_metadata?: Record<string, unknown> | null }) {
  const metadata = user.user_metadata ?? {}
  const candidates = [
    metadata?.timezone,
    metadata?.timeZone,
    metadata?.tz,
  ]
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }
  return null
}

export async function GET() {
  return NextResponse.json(
    { error: 'method not allowed' },
    { status: 405, headers: { Allow: 'POST' } }
  )
}
