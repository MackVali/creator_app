import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '../../types/supabase'

export type ServiceSupabaseClient = SupabaseClient<Database>

let cachedClient: ServiceSupabaseClient | null = null

type SupabaseModule = typeof import('@supabase/supabase-js')

const DENO_SUPABASE_SPECIFIER =
  'https://esm.sh/v135/@supabase/supabase-js@2?target=deno'

async function loadSupabaseModule(): Promise<SupabaseModule> {
  if (typeof Deno !== 'undefined') {
    const mod = await import(DENO_SUPABASE_SPECIFIER)
    return mod as SupabaseModule
  }

  return (await import('@supabase/supabase-js')) as SupabaseModule
}

export async function getServiceSupabaseClient(): Promise<ServiceSupabaseClient> {
  if (cachedClient) return cachedClient

  const isDeno = typeof Deno !== 'undefined' && typeof Deno.env !== 'undefined'
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'

  if (isBrowser) {
    throw new Error('Service role Supabase client is not available in the browser')
  }

  const { createClient } = await loadSupabaseModule()

  if (isDeno) {
    const supabaseUrl =
      Deno.env.get('DENO_ENV_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey =
      Deno.env.get('DENO_ENV_SUPABASE_SERVICE_ROLE_KEY') ??
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
      ''

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing Supabase service credentials for scheduler helpers')
    }

    cachedClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    return cachedClient
  }

  const supabaseUrl =
    process.env.DENO_ENV_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    ''
  const serviceRoleKey =
    process.env.DENO_ENV_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    ''

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase service credentials for scheduler helpers')
  }

  cachedClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cachedClient
}

export function resetCachedServiceSupabaseClient() {
  cachedClient = null
}
