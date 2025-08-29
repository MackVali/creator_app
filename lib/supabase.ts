import {
  createBrowserClient,
  createServerClient,
  type CookieOptions,
} from "@supabase/ssr";

function getEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("Missing Supabase environment variables:", {
      hasUrl: !!url,
      hasKey: !!key,
    });
    return { url: null, key: null };
  }

  return { url, key };
}

export function getSupabaseBrowser() {
  const { url, key } = getEnv();
  if (!url || !key) return null;
  return createBrowserClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

export function getSupabaseServer(cookies: {
  get(name: string): { name: string; value: string } | undefined;
  set(name: string, value: string, options: CookieOptions): void;
}) {
  const { url, key } = getEnv();
  if (!url || !key) return null;
  return createServerClient(url, key, {
    cookies: {
      get: (name) => cookies.get(name)?.value,
      set: (name, value, options) => cookies.set(name, value, options),
    },
  });
}
