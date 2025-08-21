import { createBrowserClient, createServerClient, type CookieOptions } from '@supabase/ssr'

function getEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return { url: null as string|null, key: null as string|null }
  return { url, key }
}

export function getSupabaseBrowser() {
  const { url, key } = getEnv()
  if (!url || !key) return null
  return createBrowserClient(url, key)
}

export function getSupabaseServer(cookies: {
  get(name: string): { name: string; value: string } | undefined
  set(name: string, value: string, options: CookieOptions): void
}) {
  const { url, key } = getEnv()
  if (!url || !key) return null
  return createServerClient(url, key, {
    cookies: {
      get: (name) => cookies.get(name)?.value,
      set: (name, value, options) => cookies.set(name, value, options),
    },
  })
}
