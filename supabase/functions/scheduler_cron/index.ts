import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2?dts'
import type { Database } from '../../../types/supabase.ts'
import {
  markMissedAndQueue,
  scheduleBacklog,
  type ScheduleBacklogResult,
} from '../_shared/scheduler/src/lib/scheduler/core/runScheduler.js'

type Client = SupabaseClient<Database>

type SchedulerResponse = {
  marked: {
    count: number | null
    error: unknown
  }
  schedule: ScheduleBacklogResult
}

serve(async req => {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    if (!userId) {
      return new Response('missing userId', { status: 400 })
    }

    const supabaseUrl =
      Deno.env.get('DENO_ENV_SUPABASE_URL') ??
      Deno.env.get('SUPABASE_URL') ??
      ''
    const serviceRoleKey =
      Deno.env.get('DENO_ENV_SUPABASE_SERVICE_ROLE_KEY') ??
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
      ''

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response('missing supabase credentials', { status: 500 })
    }

    const supabase = createClient<Database>(supabaseUrl, serviceRoleKey)
    const now = new Date()

    const markResult = await markMissedAndQueue(supabase, userId, now)
    if (markResult.error) {
      console.error('markMissedAndQueue error', markResult.error)
      return new Response(
        JSON.stringify(serializeSchedulerResponse(markResult, null)),
        {
          status: 500,
          headers: { 'content-type': 'application/json' },
        },
      )
    }

    const user = await resolveUserProfile(supabase, userId)
    const timeZone = extractUserTimeZone(user)
    const location = extractUserCoordinates(user)

    const scheduleResult = await scheduleBacklog(supabase, userId, now, {
      timeZone,
      location,
      mode: { type: 'REGULAR' },
    })

    const status = scheduleResult.error ? 500 : 200
    const payload = serializeSchedulerResponse(markResult, scheduleResult)

    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  } catch (error) {
    console.error('scheduler_cron failure', error)
    return new Response('internal error', { status: 500 })
  }
})

function serializeSchedulerResponse(
  markResult: { count: number | null; error: unknown },
  schedule: ScheduleBacklogResult | null,
): SchedulerResponse {
  return {
    marked: {
      count: typeof markResult.count === 'number' ? markResult.count : null,
      error: markResult.error ?? null,
    },
    schedule: schedule ?? { placed: [], failures: [], error: null, timeline: [] },
  }
}

type AdminUser = Awaited<ReturnType<Client['auth']['admin']['getUserById']>>['data']['user']

async function resolveUserProfile(client: Client, userId: string): Promise<AdminUser | null> {
  try {
    const { data, error } = await client.auth.admin.getUserById(userId)
    if (error) {
      console.error('resolveUserProfile error', error)
      return null
    }
    return data?.user ?? null
  } catch (error) {
    console.error('resolveUserProfile failure', error)
    return null
  }
}

function extractUserTimeZone(user: AdminUser | null): string | null {
  const metadata = (user?.user_metadata ?? user?.raw_user_meta_data ?? {}) as
    | Record<string, unknown>
    | undefined
    | null
  if (!metadata) return null
  const candidates = [metadata?.timezone, metadata?.timeZone, metadata?.tz]
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }
  return null
}

function extractUserCoordinates(user: AdminUser | null) {
  const metadata = (user?.user_metadata ?? user?.raw_user_meta_data ?? {}) as
    | Record<string, unknown>
    | undefined
    | null
  if (!metadata) return null

  const latitude = pickNumericValue([
    metadata?.latitude,
    metadata?.lat,
    metadata?.coords && (metadata.coords as { latitude?: unknown })?.latitude,
    metadata?.coords && (metadata.coords as { lat?: unknown })?.lat,
    metadata?.location && (metadata.location as { latitude?: unknown })?.latitude,
  ])
  const longitude = pickNumericValue([
    metadata?.longitude,
    metadata?.lng,
    metadata?.lon,
    metadata?.coords && (metadata.coords as { longitude?: unknown })?.longitude,
    metadata?.coords && (metadata.coords as { lng?: unknown })?.lng,
    metadata?.location && (metadata.location as { longitude?: unknown })?.longitude,
  ])

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
