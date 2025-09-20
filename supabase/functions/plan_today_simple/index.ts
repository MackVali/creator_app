import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { planTodaySimple } from '../../../lib/scheduler/schedule_daily.ts'

function parseDate(value: string | null): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function jsonResponse(body: Record<string, unknown>, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function resolveUserId(searchParams: URLSearchParams): string | null {
  const direct = searchParams.get('userId')
  if (direct) return direct

  if (typeof Deno !== 'undefined' && typeof Deno.env !== 'undefined') {
    const fallback = Deno.env.get('SCHEDULER_USER_ID')
    if (fallback) return fallback
  }

  return null
}

serve(async req => {
  try {
    const { searchParams } = new URL(req.url)
    const userId = resolveUserId(searchParams)
    if (!userId) {
      return jsonResponse({ error: 'missing userId' }, { status: 400 })
    }

    const overrideDate = parseDate(searchParams.get('date'))
    const dateLocal = overrideDate ?? new Date()

    const instances = await planTodaySimple(userId, dateLocal)
    return jsonResponse({
      userId,
      date: dateLocal.toISOString(),
      scheduledCount: instances.length,
      instanceIds: instances.map(item => item.id),
    })
  } catch (error) {
    console.error('plan_today_simple failure', error)
    return jsonResponse({ error: 'internal error' }, { status: 500 })
  }
})
