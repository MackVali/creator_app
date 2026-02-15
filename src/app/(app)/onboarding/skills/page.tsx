"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function OnboardingSkillsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const redirectParam = searchParams.get("redirect");
    const redirectTarget =
      redirectParam && redirectParam.startsWith("/")
        ? redirectParam
        : "/dashboard";
    router.replace(redirectTarget);
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F0F12] text-zinc-200">
      <p className="text-center text-lg">Redirecting to your dashboard…</p>
    </div>
  );
}
