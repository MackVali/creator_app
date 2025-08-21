import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export const runtime = 'nodejs'

export default async function AuthCallbackPage() {
  const supabase = createServerClient(
    process.env.NEXT_SUPABASE_URL!,
    process.env.NEXT_SUPABASE_ANON_KEY!,
    {
      serviceKey: process.env.SUPABASE_SERVICE_KEY,
      cookies: {
        serviceKey: process.env.SUPABASE_SERVICE_KEY,
      },
    },
  )

  const {
    data: { session },
    error,
  } = await supabase.auth.exchangeCodeForSession()

  if (error) {
    return redirect(`/auth/login?error=${error.message}`)
  }

  return redirect('/dashboard')
}
