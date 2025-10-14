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
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("Missing Supabase environment variables:", {
      hasUrl: !!url,
      hasKey: !!key,
    });
    return { url: null, key: null };
  }

  if (!hasLoggedEnvFallback) {
    const usingFallback = !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (usingFallback && (process.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_ANON_KEY)) {
      console.warn(
        "Falling back to legacy VITE_SUPABASE_* environment variables. Update your configuration to NEXT_PUBLIC_SUPABASE_*.",
      );
      hasLoggedEnvFallback = true;
    }
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
