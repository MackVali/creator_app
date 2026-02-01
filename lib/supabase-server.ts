import { cookies as nextCookies } from "next/headers";
import {
  getSupabaseServer,
  type SupabaseServerOptions,
} from "./supabase";

// Reusable Supabase server client helper
export async function createSupabaseServerClient(
  options?: SupabaseServerOptions
) {
  const cookieStore = await nextCookies();
  return getSupabaseServer({
    get: (name: string) => cookieStore.get(name),
    set: () => {}, // No-op for server-side operations
  }, options);
}

// Type-safe cookie options for when set is needed
export type CookieOptions = {
  path?: string;
  domain?: string;
  maxAge?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "strict" | "lax" | "none";
};

// Helper for when you need to implement set functionality
export async function createSupabaseServerClientWithSet(
  options?: SupabaseServerOptions
) {
  const cookieStore = await nextCookies();
  return getSupabaseServer({
    get: (name: string) => cookieStore.get(name),
    set: (_name: string, _value: string, _options: CookieOptions) => {
      void _name;
      void _value;
      void _options;
      // Implement if needed for specific use cases
    },
  }, options);
}
