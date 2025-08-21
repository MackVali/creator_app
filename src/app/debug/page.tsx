export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { cookies as nextCookies } from 'next/headers'
import { getSupabaseServer } from '@/lib/supabase'

export default async function Page() {
  const supabase = getSupabaseServer(nextCookies() as any)
  const { data: { user } } = await supabase?.auth.getUser() ?? { data: { user: null } }
  const { data: stats, error } = supabase
    ? await supabase.from('user_stats_v').select('level,xp_current,xp_max').maybeSingle()
    : { data: null, error: { message: 'no supabase server' } }
  return (
    <pre style={{padding:16,color:'#ddd',background:'#0a0a0a',border:'1px solid #333',borderRadius:12}}>
      {JSON.stringify({ user: !!user, stats, error: error?.message ?? null }, null, 2)}
    </pre>
  )
}
