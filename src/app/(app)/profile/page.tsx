"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { ProfileSkeleton } from "@/components/profile/ProfileSkeleton";
import { ensureProfileExists } from "@/lib/db";

export default function ProfilePage() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    async function redirectToHandleProfile() {
      if (!user?.id) {
        router.replace("/auth");
        return;
      }

      try {
        // Ensure profile exists
        const profile = await ensureProfileExists(user.id);
        if (profile?.username) {
          // Redirect to handle-based profile route
          router.replace(`/profile/${profile.username}`);
        } else {
          const params = new URLSearchParams({ onboarding: "1", redirect: "/profile" });
          router.replace(`/profile/edit?${params.toString()}`);
        }
      } catch (err) {
        console.error("Error loading profile:", err);
        router.replace("/dashboard");
      }
    }

    redirectToHandleProfile();
  }, [user, router]);

  // Keep redirect loading state visually consistent with profile loading UI.
  return <ProfileSkeleton />;
}
