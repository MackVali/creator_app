import { createClient } from '@/lib/supabase-server'
import { DbError } from '@/lib/db-utils'

export default async function Page() {
  const supabase = await createClient()
  if (!supabase) throw new Error('No supabase client')
  const { data: { user } } = await supabase.auth.getUser()

  // Tiny probe: try selecting 1 row from each table (safe for empty tables)
  const probe = async (table: string) => {
    const { data: _data, error, count } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
    if (error) throw new DbError(table, error)
    return { table, count }
  }

  try {
    const results = await Promise.allSettled([
      probe('goals'),
      probe('skills'),
      probe('monuments'),
    ])
    return (
      <main style={{padding:24,fontFamily:'ui-sans-serif,system-ui'}}>
        <h1 style={{fontSize:20,fontWeight:700}}>RSC Debug</h1>
        <pre style={{marginTop:12,padding:12,border:'1px solid #e5e7eb',borderRadius:8,overflow:'auto'}}>
{JSON.stringify({
  env: process.env.VERCEL_ENV ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
  authed: !!user,
  results
}, null, 2)}
        </pre>
      </main>
    )
  } catch (e: unknown) {
    const err = e as { message?: string; table?: string; code?: string; details?: string | null; hint?: string | null }
    console.error('RSC debug failed', { message: err?.message, table: err?.table, code: err?.code, details: err?.details, hint: err?.hint })
    throw e
  }
}
