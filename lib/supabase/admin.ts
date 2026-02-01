import { createClient } from "@supabase/supabase-js";
import type { SupabaseClientOptions } from "@supabase/supabase-js";
import type { Database } from "../../types/supabase";
import type { SupabaseServerOptions } from "../supabase";

export function createAdminClient(options?: SupabaseServerOptions) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "Supabase admin client unavailable: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
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
