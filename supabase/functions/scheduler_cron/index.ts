import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { Database } from '../../../types/supabase.ts'
import {
  markMissedAndQueue,
  scheduleBacklog,
} from '../../../src/lib/scheduler/reschedule.ts'

const SUPABASE_URL =
  Deno.env.get('DENO_ENV_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_KEY =
  Deno.env.get('DENO_ENV_SUPABASE_SERVICE_ROLE_KEY') ??
  Deno.env.get('DENO_ENV_SUPABASE_ANON_KEY') ??
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  ''

serve(async req => {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  if (!userId) {
    return new Response('missing userId', { status: 400 })
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return new Response('missing supabase credentials', { status: 500 })
  }

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY)
  const now = new Date()

  await markMissedAndQueue(userId, now, supabase)
  await scheduleBacklog(userId, now, supabase)

  return new Response('ok', { status: 200 })
})
