"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { Profile, SocialLink, ContentCard } from "@/lib/types";
import { getProfileByHandle, getProfileLinks } from "@/lib/db";
import { getSocialLinks } from "@/lib/db/profile-management";
import HeroHeader from "@/components/profile/HeroHeader";
import SocialPillsRow from "@/components/profile/SocialPillsRow";
import LinkGrid from "@/components/profile/LinkGrid";
import { ProfileSkeleton } from "@/components/profile/ProfileSkeleton";

export default function ProfileByHandlePage() {
  const params = useParams();
  const router = useRouter();
  const { session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [contentCards, setContentCards] = useState<ContentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handle = params.handle as string;

  useEffect(() => {
    async function loadProfileData() {
      if (!handle) {
        router.push("/dashboard");
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Load profile by handle
        const userProfile = await getProfileByHandle(handle);
        if (!userProfile) {
          setError("Profile not found");
          return;
        }

        setProfile(userProfile);

        // Load social links and content cards
        const [links, cards] = await Promise.all([
          getSocialLinks(userProfile.user_id),
          getProfileLinks(userProfile.user_id),
        ]);

        setSocialLinks(links);
        setContentCards(cards);
      } catch (err) {
        console.error("Error loading profile:", err);
        setError("Failed to load profile");
      } finally {
        setLoading(false);
      }
    }

    loadProfileData();
  }, [handle, router]);

  // Handle share functionality
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${profile?.name || profile?.username}'s Bio Link`,
          url: window.location.href,
        });
      } catch (error) {
        console.log("Share cancelled");
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(window.location.href);
        // You could add a toast notification here
        console.log("URL copied to clipboard");
      } catch (error) {
        console.error("Failed to copy URL");
      }
    }
  };

  // Handle back navigation
  const handleBack = () => {
    if (session?.user?.id === profile?.user_id) {
      // If viewing own profile, go to dashboard
      router.push("/dashboard");
    } else {
      // If viewing someone else's profile, go back
      router.back();
    }
  };

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">
            {error || "Profile not found"}
          </h1>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-3 bg-slate-800 text-white rounded-2xl hover:bg-slate-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Prepare social links data for SocialPillsRow
  const socialsData: Record<string, string | undefined> = {};
  socialLinks.forEach((link) => {
    if (link.is_active && link.url) {
      socialsData[link.platform.toLowerCase()] = link.url;
    }
  });

  return (
    <div className="min-h-screen bg-slate-900 pb-[env(safe-area-inset-bottom)]">
      <HeroHeader profile={profile} onShare={handleShare} onBack={handleBack} />

      <div className="px-4 -mt-8">
        <SocialPillsRow socials={socialsData} />
      </div>

      <div className="mt-8">
        <LinkGrid links={contentCards} />
      </div>
    </div>
  );
}
