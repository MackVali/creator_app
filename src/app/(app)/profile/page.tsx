"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useProfileContext } from "@/components/ProfileProvider";
import { ensureProfileExists } from "@/lib/db";

export default function ProfilePage() {
  const router = useRouter();
  const { session, isReady } = useAuth();
  const { profile, loading, refreshProfile } = useProfileContext();
  const existingHandle = profile?.username?.trim();
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    async function redirectToHandleProfile() {
      if (!isReady) {
        return;
      }

      if (loading) {
        return;
      }

      if (!userId) {
        router.push("/auth");
        return;
      }

      try {
        if (existingHandle) {
          router.replace(`/profile/${existingHandle}`);
          return;
        }

        const ensuredProfile = await ensureProfileExists(userId);
        const handle = ensuredProfile?.username?.trim();

        if (handle) {
          await refreshProfile();
          router.replace(`/profile/${handle}`);
          return;
        }

        router.push("/profile/edit");
      } catch (err) {
        console.error("Error loading profile:", err);
        router.push("/profile/edit");
      }
    }

    redirectToHandleProfile();
  }, [isReady, userId, existingHandle, loading, refreshProfile, router]);

  // Show loading while redirecting
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-white/70">Loading your profile...</p>
      </div>
    </div>
  );
}
