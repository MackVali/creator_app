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
      <div className="relative flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-[-20%] h-[320px] w-[320px] -translate-x-1/2 rounded-full bg-blue-500/10 blur-[160px]" />
          <div className="absolute bottom-[-25%] right-[-15%] h-[260px] w-[260px] rounded-full bg-purple-500/10 blur-[200px]" />
        </div>

        <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/70 p-8 text-center shadow-[0_25px_45px_rgba(15,23,42,0.45)] backdrop-blur">
          <h1 className="text-2xl font-semibold text-white">{error || "Profile not found"}</h1>
          <p className="mt-3 text-sm text-white/60">
            Something went wrong while loading this profile. Try again or head back to your dashboard.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-6 inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-white/80 transition-colors hover:border-white/25 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
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
    <div className="relative min-h-screen bg-slate-950 pb-[env(safe-area-inset-bottom)] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-24 h-[360px] w-[360px] rounded-full bg-gradient-to-br from-blue-500/30 via-purple-500/20 to-transparent blur-[140px]" />
        <div className="absolute -top-32 right-[-10%] h-[300px] w-[300px] rounded-full bg-gradient-to-bl from-pink-500/25 via-purple-500/20 to-transparent blur-[160px]" />
        <div className="absolute left-1/2 top-[15%] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-blue-500/10 blur-[170px]" />
        <div className="absolute bottom-[-25%] right-[-15%] h-[360px] w-[360px] rounded-full bg-purple-500/15 blur-[200px]" />
      </div>

      <main className="relative z-10 py-14">
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
                <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
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
