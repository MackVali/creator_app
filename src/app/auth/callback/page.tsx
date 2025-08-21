'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AuthCallback() {
  const router = useRouter()
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    (async () => {
      const mod = await import('@/lib/supabase')
      const supabase = (mod as any).getSupabaseBrowser?.()
      if (!supabase) { setErr('Supabase not initialized'); return }
      const { error } = await supabase.auth.exchangeCodeForSession()
      if (error) { setErr(error.message); return }
      router.replace('/dashboard')
    })()
  }, [router])
  return <div style={{display:'grid',placeItems:'center',height:'100dvh',color:'#ddd'}}> {err ? `Auth error: ${err}` : 'Signing you in…'} </div>
}
