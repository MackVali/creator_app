import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function resolveSupabaseUrl() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    null
  return url ? url.replace(/\/$/, '') : null
}

function resolveSupabaseKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.DENO_ENV_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.DENO_ENV_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    null
  )
}

type SchedulerResponse = {
  placed?: unknown[]
  failures?: unknown[]
  error?: unknown
  detail?: unknown
}

function extractMessage(value: unknown) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const maybeMessage = (value as { message?: string }).message
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
      return maybeMessage
    }
  }
  return null
}

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase client is not configured on the server.' },
        { status: 500 }
      )
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) {
      return NextResponse.json(
        {
          error:
            sessionError.message ?? 'Failed to resolve the current session for the scheduler.',
        },
        { status: 500 }
      )
    }

    if (!session) {
      return NextResponse.json(
        { error: 'You must be signed in to run the scheduler.' },
        { status: 401 }
      )
    }

    const supabaseUrl = resolveSupabaseUrl()
    if (!supabaseUrl) {
      return NextResponse.json(
        { error: 'Supabase URL is not configured.' },
        { status: 500 }
      )
    }

    const supabaseKey = resolveSupabaseKey()
    if (!supabaseKey) {
      return NextResponse.json(
        { error: 'Supabase key is not configured.' },
        { status: 500 }
      )
    }

    const authBearer = session.access_token ?? supabaseKey

    const response = await fetch(`${supabaseUrl}/functions/v1/scheduler_cron`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseKey,
        Authorization: `Bearer ${authBearer}`,
      },
      body: JSON.stringify({ userId: session.user.id }),
      cache: 'no-store',
    })

    const responseText = await response.text()
    let payload: SchedulerResponse | null = null

    if (responseText) {
      try {
        payload = JSON.parse(responseText) as SchedulerResponse
      } catch (parseError) {
        console.warn('Failed to parse scheduler function response', parseError)
        payload = { error: responseText }
      }
    }

    if (!response.ok) {
      const message =
        extractMessage(payload?.error) ??
        extractMessage(payload?.detail) ??
        (response.statusText || '').trim()

      return NextResponse.json(
        {
          error: message && message.length > 0 ? message : 'Scheduler invocation failed.',
          detail: payload,
        },
        { status: response.status }
      )
    }

    const placedValue = payload?.placed
    const failuresValue = payload?.failures

    const placedItems = Array.isArray(placedValue) ? placedValue : []
    const failureItems = Array.isArray(failuresValue) ? failuresValue : []

    return NextResponse.json(
      {
        placed: placedItems,
        failures: failureItems,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Failed to call scheduler function from dev API route', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown server error.' },
      { status: 500 }
    )
  }
}
