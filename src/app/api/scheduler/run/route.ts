import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { markMissedAndQueue, scheduleBacklog } from '@/lib/scheduler/reschedule'

function generateRunId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json(
      { error: 'supabase client unavailable' },
      { status: 500 }
    )
  }

  let body: any = {}
  try {
    body = await request.json()
  } catch {
    body = {}
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

  const runId = typeof body.runId === 'string' && body.runId.trim() ? body.runId : generateRunId()
  const dryRun = body.dryRun === true
  const lookaheadDays = typeof body.lookaheadDays === 'number' ? body.lookaheadDays : undefined
  const stabilityLockMinutes = typeof body.stabilityLockMinutes === 'number' ? body.stabilityLockMinutes : undefined
  const traceToFile = body.traceToFile ?? !dryRun

  const markResult = await markMissedAndQueue(user.id, now, supabase)
  if (markResult.error) {
    return NextResponse.json(
      { error: markResult.error.message ?? 'failed to mark missed instances' },
      { status: 500 }
    )
  }

  const userTimeZone = extractUserTimeZone(user)
  const scheduleResult = await scheduleBacklog(user.id, now, supabase, {
    timeZone: userTimeZone,
    RUN_ID: runId,
    DRY_RUN: dryRun,
    lookaheadDays,
    stabilityLockMinutes,
    traceToFile,
  })
  const status = scheduleResult.error ? 500 : 200

  return NextResponse.json(
    {
      runId,
      dryRun,
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
