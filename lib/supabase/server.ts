import { createSupabaseServerClient } from "../supabase-server";
import type { SupabaseServerOptions } from "../supabase";

export async function createClient(options?: SupabaseServerOptions) {
  return await createSupabaseServerClient(options);
}

export type { CookieOptions } from "../supabase-server";
