"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function OnboardingSkillsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const redirectParam = searchParams.get("redirect");
    const params = new URLSearchParams();
    if (redirectParam && redirectParam.startsWith("/")) {
      params.set("redirect", redirectParam);
    }
    const query = params.toString();
    router.replace(query ? `/onboarding?${query}` : "/onboarding");
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F0F12] text-zinc-200">
      <p className="text-center text-lg">Redirecting to CREATOR setup...</p>
    </div>
  );
}
