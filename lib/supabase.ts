import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const authConfig = {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
};

const clientOptions = { auth: authConfig };

type EnvConfig = {
  url: string | null;
  key: string | null;
};

let hasLoggedEnvFallback = false;

function resolveEnv(): EnvConfig {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const fallbackUrl = process.env.VITE_SUPABASE_URL;
  const fallbackKey = process.env.VITE_SUPABASE_ANON_KEY;
  const shouldUseFallback = (!url || !key) && (fallbackUrl || fallbackKey);

  if (shouldUseFallback) {
    if (!url && fallbackUrl) {
      url = fallbackUrl;
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        process.env.NEXT_PUBLIC_SUPABASE_URL = fallbackUrl;
      }
    }

    if (!key && fallbackKey) {
      key = fallbackKey;
      if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = fallbackKey;
      }
    }

    if (!hasLoggedEnvFallback && url && key) {
      console.warn(
        "Falling back to legacy VITE_SUPABASE_* environment variables. Update your configuration to NEXT_PUBLIC_SUPABASE_*.",
      );
      hasLoggedEnvFallback = true;
    }
  }

  if (!url || !key) {
    console.error("Missing Supabase environment variables:", {
      hasUrl: !!url,
      hasKey: !!key,
    });
    return { url: null, key: null };
  }

  return { url, key };
}

const env = resolveEnv();

let browserClient: SupabaseClient | null =
  env.url && env.key ? createClient(env.url, env.key, clientOptions) : null;

export const supabase: SupabaseClient | null = browserClient;

export function getSupabaseBrowser() {
  return browserClient;
}

type CookieStore = {
  get(name: string): { name: string; value: string } | undefined;
  set?: (name: string, value: string, options: CookieOptions) => void;
};

export function getSupabaseServer(cookies: CookieStore) {
  if (!env.url || !env.key) return null;
  return createServerClient(env.url, env.key, {
    auth: authConfig,
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
