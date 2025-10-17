"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { ensureProfileExists } from "@/lib/db";

export default function ProfilePage() {
  const router = useRouter();
  const { session, loading } = useAuth();

  const metadataHandle = useMemo(() => {
    const rawMetadata = (session?.user?.user_metadata ?? {}) as Record<
      string,
      unknown
    >;

    const getCandidate = (key: string) => {
      const value = rawMetadata[key];
      return typeof value === "string" ? value.trim() : "";
    };

    const candidate =
      getCandidate("username") ||
      getCandidate("handle") ||
      getCandidate("preferred_username");

    return candidate || undefined;
  }, [session?.user?.user_metadata]);

  useEffect(() => {
    async function redirectToHandleProfile() {
      if (loading) {
        return;
      }

      if (!session?.user?.id) {
        router.push("/auth");
        return;
      }

      const redirect = (handle: string) => {
        router.replace(`/profile/${encodeURIComponent(handle)}`);
      };

      const fallbackToDashboard = () => {
        router.replace("/dashboard");
      };

      if (metadataHandle) {
        redirect(metadataHandle);
        return;
      }

      try {
        // Ensure profile exists
        const profile = await ensureProfileExists(session.user.id);
        if (profile?.username?.trim()) {
          // Redirect to handle-based profile route
          redirect(profile.username.trim());
          return;
        }

        // Attempt to synthesize a default handle if Supabase created one on the fly
        if (profile?.user_id) {
          redirect(`user_${profile.user_id.slice(0, 8)}`);
          return;
        }

        fallbackToDashboard();
      } catch (err) {
        console.error("Error loading profile:", err);
        fallbackToDashboard();
      }
    }

    redirectToHandleProfile();
  }, [session, router, loading, metadataHandle]);

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
