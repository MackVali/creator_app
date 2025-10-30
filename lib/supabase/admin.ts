import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../types/supabase";

export function createAdminClient() {
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

  try {
    return createClient<Database>(url, serviceKey);
  } catch (error) {
    console.error("Failed to create Supabase admin client", error);
    return null;
  }
}
