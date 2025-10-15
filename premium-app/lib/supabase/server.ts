import { createSupabaseServerClient } from "../supabase-server";

export async function createClient() {
  return await createSupabaseServerClient();
}

export type { CookieOptions } from "../supabase-server";
