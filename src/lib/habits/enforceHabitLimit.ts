import type { SupabaseClient } from "@supabase/supabase-js";

const HABIT_FREE_TIER_LIMIT = 20;

export type HabitLimitOptions = {
  supabase: SupabaseClient;
  userId: string;
};

export async function enforceHabitLimit({
  supabase,
  userId,
}: HabitLimitOptions): Promise<void> {
  const { data: entitlement, error: entitlementError } = await supabase
    .from("user_entitlements")
    .select("tier, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (entitlementError) {
    throw entitlementError;
  }

  const tier = (entitlement?.tier ?? "").trim().toUpperCase();
  const isActive = entitlement?.is_active === true;
  const hasUnlimitedAccess =
    tier === "ADMIN" || (tier === "CREATOR PLUS" && isActive);

  if (hasUnlimitedAccess) {
    return;
  }

  const { count, error: habitCountError } = await supabase
    .from("habits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (habitCountError) {
    throw habitCountError;
  }

  if ((count ?? 0) >= HABIT_FREE_TIER_LIMIT) {
    throw new Error(
      `HABIT_LIMIT_REACHED: Free tier users are limited to ${HABIT_FREE_TIER_LIMIT} habits.`
    );
  }
}
