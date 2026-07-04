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
    normalize(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ||
    normalize(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
    normalize(process.env.SUPABASE_ANON_KEY) ||
    normalize(process.env.SUPABASE_PUBLIC_ANON_KEY) ||
    normalize(process.env.VITE_SUPABASE_ANON_KEY);

  if (!url || !key) {
    if (!envWarningLogged) {
      console.error("Missing Supabase environment variables:", {
        NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        SUPABASE_URL: !!process.env.SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
          !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
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

export type SupabaseServerOptions = {
  fetch?: typeof globalThis.fetch;
  accessToken?: string | null;
};

type CookieWithValue = { name: string; value: string };
type MaybePromise<T> = T | Promise<T>;

type CookieStore = {
  get(name: string): MaybePromise<CookieWithValue | null | undefined>;
  set?: (
    name: string,
    value: string,
    options?: CookieOptions
  ) => MaybePromise<void>;
  delete?: (name: string, options?: CookieOptions) => MaybePromise<void>;
  remove?: (name: string, options?: CookieOptions) => MaybePromise<void>;
};

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}

function getCookieValue(
  result: MaybePromise<CookieWithValue | null | undefined>
): MaybePromise<string | null> {
  if (isPromiseLike(result)) {
    return result.then(
      (cookie) => (cookie as CookieWithValue | null | undefined)?.value ?? null
    );
  }
  return result?.value ?? null;
}

export function getSupabaseServer(
  cookieStore: CookieStore,
  options?: SupabaseServerOptions
) {
  const { url, key } = getEnv();
  if (!url || !key) return null;
  const accessToken =
    typeof options?.accessToken === "string" && options.accessToken.length > 0
      ? options.accessToken
      : null;
  const baseFetch = options?.fetch ?? globalThis.fetch;
  const fetchOverride =
    accessToken && baseFetch
      ? ((input, init) => {
          const headers = new Headers(init?.headers);
          if (!headers.has("Authorization")) {
            headers.set("Authorization", `Bearer ${accessToken}`);
          }

          return baseFetch(input, { ...init, headers });
        }) satisfies typeof globalThis.fetch
      : baseFetch;

  return createServerClient<Database>(url, key, {
    cookies: {
      get: (name: string) => getCookieValue(cookieStore.get?.(name) ?? null),
      set: (name: string, value: string, opts?: CookieOptions) => {
        if (typeof cookieStore.set === "function") {
          return cookieStore.set(name, value, opts);
        }
      },
      remove: (name: string, opts?: CookieOptions) => {
        if (typeof cookieStore.delete === "function") {
          return cookieStore.delete(name, opts);
        }
        if (typeof cookieStore.remove === "function") {
          return cookieStore.remove(name, opts);
        }
      },
    },
    ...(fetchOverride ? { global: { fetch: fetchOverride } } : {}),
  });
}
