import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('Missing Supabase environment variables');
    return null;
  }
  return createBrowserClient(url, key);
}

export { createSupabaseBrowserClient as getSupabaseBrowser };
