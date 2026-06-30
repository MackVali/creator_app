import type { createSupabaseServerClient } from "@/lib/supabase-server";
import { isCreatorOnboardingComplete } from "@/lib/onboarding/creatorSetup";

export const MIN_SKILLS = 5;
export const MIN_MONUMENTS = 1;
type Supabase = NonNullable<
  Awaited<ReturnType<typeof createSupabaseServerClient>>
>;

function isProfileSetupIncomplete(profile: {
  name?: string | null;
  username?: string | null;
  dob?: string | null;
} | null) {
  if (!profile) return true;
  return (
    !profile.name?.trim() ||
    !profile.username?.trim() ||
    !profile.dob?.trim()
  );
}

export async function needsCreatorOnboarding(
  supabase: Supabase,
  userId: string
) {
  const [profileResult, skillResult, monumentResult] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "name,username,dob,onboarding_version,onboarding_step,onboarding_completed_at"
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("skills")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("monuments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  if (profileResult.error) {
    throw profileResult.error;
  }

  if (skillResult.error) {
    throw skillResult.error;
  }

  if (monumentResult.error) {
    throw monumentResult.error;
  }

  if (isProfileSetupIncomplete(profileResult.data)) {
    return false;
  }

  if (isCreatorOnboardingComplete(profileResult.data)) {
    return false;
  }

  return (
    (skillResult.count ?? 0) < MIN_SKILLS ||
    (monumentResult.count ?? 0) < MIN_MONUMENTS
  );
}

export async function needsSkillStack(
  supabase: Supabase,
  userId: string
) {
  return needsCreatorOnboarding(supabase, userId);
}
