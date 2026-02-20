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
  return getSupabaseServer(cookieStore, options);
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
  return getSupabaseServer(cookieStore, options);
}
