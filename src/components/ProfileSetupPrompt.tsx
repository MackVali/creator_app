"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useProfileContext } from "@/components/ProfileProvider";
import { isProfileSetupIncomplete } from "@/lib/profile/setup";

export default function ProfileSetupPrompt() {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, userId, loading } = useProfileContext();
  const needsProfileSetup = isProfileSetupIncomplete(profile);

  useEffect(() => {
    if (loading || !userId || !needsProfileSetup) {
      return;
    }

    const normalizedPathname = pathname ?? "";
    const allowedPrefixes = ["/profile/edit", "/auth", "/logout"];
    if (allowedPrefixes.some((prefix) => normalizedPathname.startsWith(prefix))) {
      return;
    }

    const params = new URLSearchParams({ onboarding: "1" });
    if (normalizedPathname.startsWith("/")) {
      params.set("redirect", normalizedPathname);
    }

    router.replace(`/profile/edit?${params.toString()}`);
  }, [loading, needsProfileSetup, pathname, router, userId]);

  return null;
}
