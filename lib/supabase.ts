import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const authConfig = {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
};

const clientOptions = { auth: authConfig };

type EnvSource = "next_public" | "vite" | "missing";

type EnvConfig = {
  url: string | null;
  key: string | null;
  urlSource: EnvSource;
  keySource: EnvSource;
  usedFallback: boolean;
};

let hasLoggedEnvFallback = false;

function resolveEnv(): EnvConfig {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let urlSource: EnvSource = url ? "next_public" : "missing";
  let keySource: EnvSource = key ? "next_public" : "missing";
  let usedFallback = false;

  const fallbackUrl = process.env.VITE_SUPABASE_URL;
  const fallbackKey = process.env.VITE_SUPABASE_ANON_KEY;
  const shouldUseFallback = (!url || !key) && (fallbackUrl || fallbackKey);

  if (shouldUseFallback) {
    if (!url && fallbackUrl) {
      url = fallbackUrl;
      urlSource = "vite";
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        process.env.NEXT_PUBLIC_SUPABASE_URL = fallbackUrl;
      }
      usedFallback = true;
    }

    if (!key && fallbackKey) {
      key = fallbackKey;
      keySource = "vite";
      if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = fallbackKey;
      }
      usedFallback = true;
    }

    if (!hasLoggedEnvFallback && url && key) {
      console.warn(
        "Falling back to legacy VITE_SUPABASE_* environment variables. Update your configuration to NEXT_PUBLIC_SUPABASE_*.",
      );
      hasLoggedEnvFallback = true;
    }
  }

  if (!url) {
    urlSource = "missing";
  }

  if (!key) {
    keySource = "missing";
  }

  if (!url || !key) {
    console.error("Missing Supabase environment variables:", {
      hasUrl: !!url,
      hasKey: !!key,
    });
    return { url: null, key: null, urlSource, keySource, usedFallback };
  }

  return { url, key, urlSource, keySource, usedFallback };
}

const env = resolveEnv();

let browserClient: SupabaseClient | null =
  env.url && env.key ? createClient(env.url, env.key, clientOptions) : null;

export const supabase: SupabaseClient | null = browserClient;

export const supabaseEnvDebug = {
  url: env.url,
  keyPresent: Boolean(env.key),
  urlSource: env.urlSource,
  keySource: env.keySource,
  usedFallback: env.usedFallback,
};

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
