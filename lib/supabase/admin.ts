import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

let cachedClient: SupabaseClient<Database, "public", Database["public"]> | null = null;

function resolveEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error("Missing Supabase configuration for service role client", {
      hasUrl: Boolean(url),
      hasServiceRoleKey: Boolean(serviceKey),
    });
    return { url: null, serviceKey: null };
  }

  return { url, serviceKey };
}

export function getSupabaseServiceRoleClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const { url, serviceKey } = resolveEnv();
  if (!url || !serviceKey) {
    return null;
  }

  cachedClient = createClient<Database>(url, serviceKey, {
    auth: {
      persistSession: false,
    },
    global: {
      headers: {
        "X-Client-Info": "creator-app-service-role",
      },
    },
  });

  return cachedClient;
}
