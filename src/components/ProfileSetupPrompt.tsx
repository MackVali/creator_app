"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useProfileContext } from "@/components/ProfileProvider";
import { isProfileSetupIncomplete } from "@/lib/profile/setup";

const DISMISS_PREFIX = "profile-setup-prompt-dismissed";

export default function ProfileSetupPrompt() {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, userId, loading } = useProfileContext();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const needsProfileSetup = useMemo(
    () => isProfileSetupIncomplete(profile),
    [profile]
  );

  useEffect(() => {
    if (!userId) {
      setDismissed(false);
      return;
    }

    try {
      const key = `${DISMISS_PREFIX}:${userId}`;
      setDismissed(localStorage.getItem(key) === "1");
    } catch {
      setDismissed(false);
    }
  }, [userId]);

  useEffect(() => {
    if (loading || !userId) {
      setOpen(false);
      return;
    }

    const onProfileEditPage = pathname.startsWith("/profile/edit");
    setOpen(needsProfileSetup && !onProfileEditPage && !dismissed);
  }, [dismissed, loading, needsProfileSetup, pathname, userId]);

  const handleSetUpNow = () => {
    const params = new URLSearchParams({ onboarding: "1" });
    if (pathname?.startsWith("/")) {
      params.set("redirect", pathname);
    }
    router.push(`/profile/edit?${params.toString()}`);
  };

  const handleLater = () => {
    if (userId) {
      try {
        localStorage.setItem(`${DISMISS_PREFIX}:${userId}`, "1");
      } catch {
        // no-op: localStorage unavailable
      }
    }
    setOpen(false);
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#121317] p-6 shadow-2xl">
        <h2 className="text-xl font-semibold text-white">Set up your profile</h2>
        <p className="mt-2 text-sm text-zinc-300">
          Finish your profile to personalize your experience and unlock your public creator page.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={handleLater}>
            Later
          </Button>
          <Button onClick={handleSetUpNow}>Go to profile setup</Button>
        </div>
      </div>
    </div>
  );
}

