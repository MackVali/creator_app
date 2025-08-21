'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AuthCallback() {
  const router = useRouter()
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    (async () => {
      const mod = await import('@/lib/supabase')
      const supabase = (mod as any).getSupabaseBrowser?.()
      if (!supabase) { setErr('Supabase not initialized'); return }
      const { error } = await supabase.auth.exchangeCodeForSession()
      if (error) { setErr(error.message); return }
      setDone(true)
      router.replace('/dashboard')
    })()
  }, [router])

  return (
    <div style={{display:'grid',placeItems:'center',height:'100dvh',color:'#ddd',background:'#0a0a0a'}}>
      {err ? <div>Auth error: {err}</div> : (done ? 'Redirecting…' : 'Signing you in…')}
    </div>
  )
}
