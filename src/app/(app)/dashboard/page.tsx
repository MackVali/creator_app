import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { needsCreatorOnboarding } from "@/lib/onboarding/needsSkillStack";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  let shouldRedirectToOnboarding = false;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      try {
        shouldRedirectToOnboarding = await needsCreatorOnboarding(
          supabase,
          user.id,
        );
      } catch (error) {
        console.error(
          "[dashboard] Failed to evaluate CREATOR onboarding state",
          error,
        );
      }
    }
  }

  if (shouldRedirectToOnboarding) {
    redirect("/onboarding");
  }

  return <DashboardClient />;
}
