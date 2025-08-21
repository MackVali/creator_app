// lib/supabase.ts
import {
  createBrowserClient,
  createServerClient,
  type CookieOptions,
} from "@supabase/ssr";

function getEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if ((!url || !key) && process.env.NODE_ENV !== "production") {
    console.warn("Supabase env missing: NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY");
  }
  // never throw here
  return { url: url ?? "", key: key ?? "" };
}

export function getSupabaseBrowser() {
  const { url, key } = getEnv();
  return createBrowserClient(url, key);
}

export function getSupabaseServer(cookies: {
  get(name: string): { name: string; value: string } | undefined;
  set(name: string, value: string, options: CookieOptions): void;
}) {
  const { url, key } = getEnv();
  return createServerClient(url, key, {
    cookies: {
      get: (name) => cookies.get(name)?.value,
      set: (name, value, options) => cookies.set(name, value, options),
    },
  });
}
