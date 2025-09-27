"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { Profile, SocialLink, ContentCard } from "@/lib/types";
import { getProfileByHandle, getProfileLinks } from "@/lib/db";
import { getSocialLinks } from "@/lib/db/profile-management";
import HeroHeader from "@/components/profile/HeroHeader";
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
        console.log("Share cancelled", error);
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(window.location.href);
        // You could add a toast notification here
        console.log("URL copied to clipboard");
      } catch (error) {
        console.error("Failed to copy URL", error);
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
      <div className="relative flex min-h-screen items-center justify-center bg-[#050505] px-4 text-white">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-black/60 p-8 text-center shadow-[0_25px_45px_rgba(15,23,42,0.45)]">
          <h1 className="text-2xl font-semibold text-white">{error || "Profile not found"}</h1>
          <p className="mt-3 text-sm text-white/60">
            Something went wrong while loading this profile. Try again or head back to your dashboard.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-6 inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-white/80 transition-colors hover:border-white/20 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050505]"
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

  const activeSocialCount = socialLinks.filter(
    (link) => link.is_active && !!link.url,
  ).length;
  const activeLinkCount = contentCards.filter((card) => card.is_active).length;

  return (
    <div className="relative min-h-screen bg-[#050505] pb-[env(safe-area-inset-bottom)] text-white">
      <main className="py-14">
        <HeroHeader
          profile={profile}
          socials={socialsData}
          stats={{ linkCount: activeLinkCount, socialCount: activeSocialCount }}
          onShare={handleShare}
          onBack={handleBack}
        />

        <section className="mx-auto mt-14 w-full max-w-5xl px-4 pb-20">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-white">Featured links</h2>
              <p className="mt-1 text-sm text-white/55">
                {activeLinkCount > 0
                  ? "Curated highlights from across this creator's world."
                  : "Links you add will appear here for your audience."}
              </p>
            </div>

            {activeLinkCount > 0 ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm font-medium text-white/75 shadow-[0_10px_25px_rgba(15,23,42,0.45)]">
                <span className="inline-block h-2 w-2 rounded-full bg-white/60" />
                {activeLinkCount} {activeLinkCount === 1 ? "link" : "links"}
              </span>
            ) : null}
          </div>

          <div className="mt-8">
            <LinkGrid links={contentCards} />
          </div>
        </section>
      </main>
    </div>
  );
}
