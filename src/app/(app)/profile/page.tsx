"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { ensureProfileExists } from "@/lib/db";

export default function ProfilePage() {
  const router = useRouter();
  const { session } = useAuth();

  useEffect(() => {
    async function redirectToHandleProfile() {
      if (!session?.user?.id) {
        router.push("/auth");
        return;
      }

      try {
        // Ensure profile exists
        const profile = await ensureProfileExists(session.user.id);
        if (profile?.username) {
          // Redirect to handle-based profile route
          router.push(`/profile/${profile.username}`);
        } else {
          const params = new URLSearchParams({ onboarding: "1", redirect: "/profile" });
          router.push(`/profile/edit?${params.toString()}`);
        }
      } catch (err) {
        console.error("Error loading profile:", err);
        router.push("/dashboard");
      }
    }

    redirectToHandleProfile();
  }, [session, router]);

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
