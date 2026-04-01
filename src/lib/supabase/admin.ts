import { createClient } from '@supabase/supabase-js';

function resolveAdminCredentials() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    process.env.SUPABASE_PROJECT_URL ??
    null;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    null;

  return { url, serviceKey };
}

export function createAdminClient() {
  const { url, serviceKey } = resolveAdminCredentials();

  if (!url || !serviceKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[supabase/admin] Admin client unavailable. Set SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL).'
      );
    }
    return null;
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
