import { cookies as nextCookies } from "next/headers";
import { getSupabaseServer } from "./supabase";

// Type-safe cookie options for when set is needed
export type CookieOptions = {
  path?: string;
  domain?: string;
  maxAge?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "strict" | "lax" | "none";
};

type NextCookiesStore = Awaited<ReturnType<typeof nextCookies>>;

function toSupabaseCookieAdapter(cookieStore: NextCookiesStore) {
  const storeWithSet = cookieStore as NextCookiesStore & {
    set?: (name: string, value: string, options: CookieOptions) => void;
  };

  return {
    get: (name: string) => cookieStore.get(name),
    set: (name: string, value: string, options: CookieOptions) => {
      storeWithSet.set?.(name, value, options);
    },
  };
}

export function createSupabaseServerClientFromCookies(cookieStore: NextCookiesStore) {
  return getSupabaseServer(toSupabaseCookieAdapter(cookieStore));
}

// Reusable Supabase server client helper
export async function createSupabaseServerClient() {
  const cookieStore = await nextCookies();
  return createSupabaseServerClientFromCookies(cookieStore);
}

// Helper for when you need to implement set functionality
export async function createSupabaseServerClientWithSet() {
  return createSupabaseServerClient();
}
