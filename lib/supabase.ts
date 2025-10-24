import {
  createBrowserClient,
  createServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

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

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowser() {
  if (browserClient) {
    return browserClient;
  }

  const { url, key } = getEnv();
  if (!url || !key) return null;

  browserClient = createBrowserClient(url, key);
  return browserClient;
}

type CookieStore = {
  get(name: string): { name: string; value: string } | undefined;
  set?: (name: string, value: string, options: CookieOptions) => void;
};

export function getSupabaseServer(cookies: CookieStore) {
  const { url, key } = getEnv();
  if (!url || !key) return null;
  return createServerClient(url, key, {
    cookies: {
      get: (name) => cookies.get(name)?.value,
      set: (name, value, options) => {
        if (typeof cookies.set === "function") {
          cookies.set(name, value, options);
        }
      },
    },
  });
}
