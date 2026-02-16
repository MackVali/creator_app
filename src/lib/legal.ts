import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { Database } from "@/types/supabase";

export async function hasAcceptedLegal(
  userId: string,
  supabase?: SupabaseClient<Database>
): Promise<boolean> {
  const client =
    supabase ?? (await createSupabaseServerClient().catch(() => null));

  if (!client) {
    console.error("hasAcceptedLegal: Supabase client unavailable");
    return false;
  }

  const { data, error } = await client
    .from("user_legal_acceptances")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("hasAcceptedLegal: query failed", error);
    return false;
  }

  return Boolean(data);
}
