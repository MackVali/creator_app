import { createClient } from "@supabase/supabase-js";
import type { SupabaseClientOptions } from "@supabase/supabase-js";
import type { Database } from "../../types/supabase";
import type { SupabaseServerOptions } from "../supabase";

function resolveAdminCredentials() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    process.env.SUPABASE_PROJECT_URL ??
    null;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    null;

  return { url, serviceKey };
}

export function createAdminClient(options?: SupabaseServerOptions) {
  const { url, serviceKey } = resolveAdminCredentials();

  if (!url || !serviceKey) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[supabase/admin] Admin client unavailable. Set SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)."
      );
    }
    return null;
  }

  const utilsOptions: SupabaseClientOptions = {};
  const fetchOverride =
    options?.fetch ?? (typeof globalThis.fetch === "function" ? globalThis.fetch : undefined);
  if (fetchOverride) {
    utilsOptions.global = { fetch: fetchOverride };
  }
  try {
    return createClient<Database>(url, serviceKey, utilsOptions);
  } catch (error) {
    console.error("Failed to create Supabase admin client", error);
    return null;
  }
}
