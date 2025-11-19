import {
  createBrowserClient,
  createServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import type { Database } from "@/types/supabase";

function normalize(value?: string): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

let envWarningLogged = false;
function getEnv() {
  const url =
    normalize(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
    normalize(process.env.SUPABASE_URL) ||
    normalize(process.env.VITE_SUPABASE_URL);
  const key =
    normalize(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
    normalize(process.env.SUPABASE_ANON_KEY) ||
    normalize(process.env.SUPABASE_PUBLIC_ANON_KEY) ||
    normalize(process.env.VITE_SUPABASE_ANON_KEY);

  if (!url || !key) {
    if (!envWarningLogged) {
      console.error("Missing Supabase environment variables:", {
        NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        SUPABASE_URL: !!process.env.SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
      });
      envWarningLogged = true;
    }
    return { url: null, key: null };
  }

  return { url, key };
}

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function getSupabaseBrowser() {
  const { url, key } = getEnv();
  if (!url || !key) return null;
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(url, key);
  }
  return browserClient;
}

type CookieStore = {
  get(name: string): { name: string; value: string } | undefined;
  set?: (name: string, value: string, options: CookieOptions) => void;
};

export function getSupabaseServer(cookies: CookieStore) {
  const { url, key } = getEnv();
  if (!url || !key) return null;
  return createServerClient<Database>(url, key, {
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
