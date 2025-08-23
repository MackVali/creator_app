export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase-server'

async function probe(table: string) {
  const supabase = await createClient()
  if (!supabase) {
    return {
      table,
      ok: false,
      error: { message: 'No supabase client', code: undefined, details: null, hint: null },
    }
  }
  const { error, count } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
  if (error) {
    const err = error as {
      code?: string
      details?: string | null
      hint?: string | null
    }
    return {
      table,
      ok: false,
      error: {
        message: error.message,
        code: err.code,
        details: err.details ?? null,
        hint: err.hint ?? null,
      },
    }
  }
  return { table, ok: true, count }
}

export default async function Page() {
  const supabase = await createClient()
  if (!supabase) {
    return (
      <main style={{ padding: 24, fontFamily: 'ui-sans-serif, system-ui' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>RSC Debug</h1>
        <p>Failed to create Supabase client</p>
      </main>
    )
  }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const results = await Promise.all([
    probe('goals'),
    probe('skills'),
    probe('monuments'),
  ])
  return (
    <main style={{ padding: 24, fontFamily: 'ui-sans-serif, system-ui' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>RSC Debug</h1>
      <pre style={{ marginTop: 12, padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'auto' }}>
{JSON.stringify({
  env: process.env.VERCEL_ENV ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
  authed: !!user,
  results,
}, null, 2)}
      </pre>
      <p style={{ marginTop: 12, opacity: .7 }}>If any item shows <code>ok:false</code>, it’s likely an RLS policy or table permission issue. Fix Supabase policies for the signed-in user.</p>
    </main>
  )
}
