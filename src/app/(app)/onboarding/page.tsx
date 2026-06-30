import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  fetchCreatorSkillCatalog,
  isCreatorOnboardingComplete,
} from "@/lib/onboarding/creatorSetup";
import CreatorOnboardingClient from "./CreatorOnboardingClient";

export const runtime = "nodejs";

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#05070c] px-4 text-white">
        <div className="max-w-sm rounded-2xl border border-red-400/25 bg-red-950/20 p-5 text-sm text-red-100">
          Supabase is not configured.
        </div>
      </main>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth?redirect=/onboarding");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("onboarding_version,onboarding_step,onboarding_completed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("[onboarding] Failed to load profile", profileError);
  }

  if (isCreatorOnboardingComplete(profile)) {
    redirect("/dashboard");
  }

  let catalog;
  try {
    catalog = await fetchCreatorSkillCatalog(supabase);
  } catch (error) {
    console.error("[onboarding] Failed to load creator Skill catalog", error);
    catalog = { categories: [], popularSkills: [], skills: [] };
  }

  return <CreatorOnboardingClient catalog={catalog} />;
}
