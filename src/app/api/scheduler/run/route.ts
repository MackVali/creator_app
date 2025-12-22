import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { markMissedAndQueue, scheduleBacklog } from '@/lib/scheduler/reschedule'
import { filterIllegalOverlapsForRender } from '@/lib/scheduler/overlapFilter'
import {
  normalizeSchedulerModePayload,
  type SchedulerModePayload,
} from '@/lib/scheduler/modes'
import type { Database } from '@/types/supabase'
import type { Database } from '@/types/supabase'

export const runtime = 'nodejs'

type SchedulerRunContext = {
  localNow: Date | null
  timeZone: string | null
  utcOffsetMinutes: number | null
  mode: SchedulerModePayload
  writeThroughDays: number | null
}

export async function POST(request: Request) {
  const {
    localNow,
    timeZone: requestTimeZone,
    utcOffsetMinutes,
    mode,
    writeThroughDays,
  } = await readRunRequestContext(request)
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

  const profileTimeZone = await resolveProfileTimeZone(
    schedulingClient,
    user.id,
  )
  const metadataTimeZone = extractUserTimeZone(user)
  const userTimeZone =
    requestTimeZone ?? profileTimeZone ?? metadataTimeZone
  const coordinates = extractUserCoordinates(user)
  let scheduleResult;
  try {
    scheduleResult = await scheduleBacklog(user.id, now, schedulingClient, {
      timeZone: userTimeZone,
      location: coordinates,
      utcOffsetMinutes,
      mode,
      writeThroughDays,
    })
    if (scheduleResult.placed?.length) {
      const filtered = filterIllegalOverlapsForRender(scheduleResult.placed)
      const droppedIds = filtered.droppedIds
      if (droppedIds.length > 0) {
        await schedulingClient
          .from('schedule_instances')
          .update({
            status: 'canceled',
            canceled_reason: 'ILLEGAL_OVERLAP_LEGACY',
          } as Record<string, unknown>)
          .in('id', droppedIds)
        scheduleResult.placed = filtered.kept
        scheduleResult.timeline = (scheduleResult.timeline ?? []).filter(entry => {
          if (entry.type === 'PROJECT') {
            const instanceId = entry.instance?.id ?? null
            return !instanceId || !droppedIds.includes(instanceId)
          }
          if (entry.type === 'HABIT') {
            const instanceId = entry.instanceId ?? null
            return !instanceId || !droppedIds.includes(instanceId)
          }
          return true
        })
      }
    }
  } catch (_error) {
    return NextResponse.json(
      { error: 'SCHEDULER_SOFT_FAIL', skipped: true },
      { status: 200 }
    )
  }
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
    return { localNow: null, timeZone: null, mode: { type: 'REGULAR' }, writeThroughDays: null }
  }

  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/json')) {
    return { localNow: null, timeZone: null, mode: { type: 'REGULAR' }, writeThroughDays: null }
  }

  try {
    const payload = (await request.json()) as {
      localTimeIso?: unknown
      timeZone?: unknown
      utcOffsetMinutes?: unknown
      mode?: unknown
      writeThroughDays?: unknown
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

    let writeThroughDays: number | null = null
    const candidate = payload?.writeThroughDays
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      writeThroughDays = candidate
    } else if (typeof candidate === 'string') {
      const parsed = Number.parseFloat(candidate)
      if (Number.isFinite(parsed)) {
        writeThroughDays = parsed
      }
    }

    let utcOffsetMinutes: number | null = null
    const offsetCandidate = payload?.utcOffsetMinutes
    if (typeof offsetCandidate === 'number' && Number.isFinite(offsetCandidate)) {
      utcOffsetMinutes = offsetCandidate
    } else if (typeof offsetCandidate === 'string') {
      const parsed = Number.parseFloat(offsetCandidate)
      if (Number.isFinite(parsed)) {
        utcOffsetMinutes = parsed
      }
    }

    return { localNow, timeZone, utcOffsetMinutes, mode, writeThroughDays }
  } catch (error) {
    console.warn('Failed to parse scheduler run payload', error)
    return { localNow: null, timeZone: null, mode: { type: 'REGULAR' }, writeThroughDays: null }
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'method not allowed' },
    { status: 405, headers: { Allow: 'POST' } }
  )
}

async function resolveProfileTimeZone(
  client: SupabaseClient<Database> | null,
  userId: string,
) {
  if (!client) return null
  try {
    const { data, error } = await client
      .from('profiles')
      .select('timezone')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) {
      console.warn('Failed to resolve profile timezone', error)
      return null
    }
    const timezone = typeof data?.timezone === 'string' ? data.timezone.trim() : ''
    if (timezone) return timezone
  } catch (error) {
    console.warn('Failed to resolve profile timezone', error)
  }
  return null
}
