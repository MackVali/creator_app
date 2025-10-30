import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { markMissedAndQueue, scheduleBacklog } from '@/lib/scheduler/reschedule'
import {
  normalizeSchedulerModePayload,
  type SchedulerModePayload,
} from '@/lib/scheduler/modes'

export const runtime = 'nodejs'

type SchedulerRunContext = {
  localNow: Date | null
  timeZone: string | null
  mode: SchedulerModePayload
}

export async function POST(request: Request) {
  const { localNow, timeZone: requestTimeZone, mode } = await readRunRequestContext(request)
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

  const now = localNow ?? new Date()

  const adminSupabase = createAdminClient()
  const schedulingClient = adminSupabase ?? supabase

  if (!adminSupabase && process.env.NODE_ENV !== 'production') {
    console.warn('Falling back to user-scoped Supabase client for scheduler run')
  }

  const markResult = await markMissedAndQueue(user.id, now, schedulingClient)
  if (markResult.error) {
    return NextResponse.json(
      { error: markResult.error.message ?? 'failed to mark missed instances' },
      { status: 500 }
    )
  }

  const userTimeZone = requestTimeZone ?? extractUserTimeZone(user)
  const coordinates = extractUserCoordinates(user)
  const scheduleResult = await scheduleBacklog(user.id, now, schedulingClient, {
    timeZone: userTimeZone,
    location: coordinates,
    mode,
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

function extractUserCoordinates(user: { user_metadata?: Record<string, unknown> | null }) {
  const metadata = user.user_metadata ?? {}
  const latCandidates: unknown[] = [
    metadata?.latitude,
    metadata?.lat,
    metadata?.coords && (metadata.coords as { latitude?: unknown })?.latitude,
    metadata?.coords && (metadata.coords as { lat?: unknown })?.lat,
    metadata?.location && (metadata.location as { latitude?: unknown })?.latitude,
  ]
  const lonCandidates: unknown[] = [
    metadata?.longitude,
    metadata?.lng,
    metadata?.lon,
    metadata?.coords && (metadata.coords as { longitude?: unknown })?.longitude,
    metadata?.coords && (metadata.coords as { lng?: unknown })?.lng,
    metadata?.location && (metadata.location as { longitude?: unknown })?.longitude,
  ]

  const latitude = pickNumericValue(latCandidates)
  const longitude = pickNumericValue(lonCandidates)
  if (latitude === null || longitude === null) return null
  return { latitude, longitude }
}

function pickNumericValue(values: unknown[]): number | null {
  for (const value of values) {
    const num = typeof value === 'string' ? Number.parseFloat(value) : value
    if (typeof num === 'number' && Number.isFinite(num)) {
      return num
    }
  }
  return null
}

async function readRunRequestContext(request: Request): Promise<SchedulerRunContext> {
  if (!request) {
    return { localNow: null, timeZone: null, mode: { type: 'REGULAR' } }
  }

  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/json')) {
    return { localNow: null, timeZone: null, mode: { type: 'REGULAR' } }
  }

  try {
    const payload = (await request.json()) as {
      localTimeIso?: unknown
      timeZone?: unknown
      mode?: unknown
    }

    let localNow: Date | null = null
    if (payload && typeof payload.localTimeIso === 'string') {
      const parsed = new Date(payload.localTimeIso)
      if (!Number.isNaN(parsed.getTime())) {
        localNow = parsed
      }
    }

    let timeZone: string | null = null
    if (payload && typeof payload.timeZone === 'string' && payload.timeZone.trim()) {
      timeZone = payload.timeZone
    }

    const mode = normalizeSchedulerModePayload(payload?.mode)
    return { localNow, timeZone, mode }
  } catch (error) {
    console.warn('Failed to parse scheduler run payload', error)
    return { localNow: null, timeZone: null, mode: { type: 'REGULAR' } }
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'method not allowed' },
    { status: 405, headers: { Allow: 'POST' } }
  )
}
