'use client'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const runtime = 'nodejs'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AuthCallback() {
  const router = useRouter()
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const run = async () => {
      // Lazy import to avoid SSR/init at build time
      const mod = await import('@/lib/supabase')
      const getSupabaseBrowser = (mod as any).getSupabaseBrowser as (() => any) | undefined
      const supabase = getSupabaseBrowser?.()
      if (!supabase) {
        setErr('Supabase not initialized: missing NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY')
        return
      }
      const { error } = await supabase.auth.exchangeCodeForSession()
      if (error) { setErr(error.message); return }
      setDone(true)
      router.replace('/dashboard')
    }
    void run()
  }, [router])

  return (
    <div style={{display:'grid',placeItems:'center',height:'100dvh',color:'#ddd',background:'#0a0a0a'}}>
      {err ? <div>Auth error: {err}</div> : (done ? 'Redirecting…' : 'Signing you in…')}
    </div>
  )
}
