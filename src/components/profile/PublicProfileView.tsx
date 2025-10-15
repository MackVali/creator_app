"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useToastHelpers } from "@/components/ui/toast";
import { getCurrentUserId } from "@/lib/auth";
import { emitProfileHeroEvent } from "@/lib/analytics";
import type { PublicProfileReadModel } from "@/lib/types";

import HeroHeader from "./HeroHeader";
import { buildProfileModules } from "./modules/buildProfileModules";
import { ProfileModules } from "./modules/ProfileModules";

interface PublicProfileViewProps {
  readModel: PublicProfileReadModel;
}

export default function PublicProfileView({ readModel }: PublicProfileViewProps) {
  const router = useRouter();
  const toast = useToastHelpers();
  const [isOwner, setIsOwner] = useState(false);

  const profile = readModel.profile;
  const profileId = profile.id ?? profile.user_id;

  useEffect(() => {
    let active = true;

    getCurrentUserId()
      .then((currentUserId) => {
        if (!active) return;
        setIsOwner(Boolean(currentUserId && currentUserId === profile.user_id));
      })
      .catch((error) => {
        console.error("Failed to determine viewer ownership", error);
      });

    return () => {
      active = false;
    };
  }, [profile.user_id]);

  const socialMap = useMemo(() => {
    const map: Record<string, string | undefined> = {};

    for (const link of readModel.socialLinks ?? []) {
      if (!link?.url || link.is_active === false) continue;
      map[link.platform.toLowerCase()] = link.url;
    }

    return map;
  }, [readModel.socialLinks]);

  const stats = useMemo(() => {
    const linkCount = (readModel.contentCards ?? []).filter(
      (card) => card && card.is_active !== false,
    ).length;
    const socialCount = (readModel.socialLinks ?? []).filter(
      (link) => link && link.is_active !== false && !!link.url,
    ).length;

    return { linkCount, socialCount };
  }, [readModel.contentCards, readModel.socialLinks]);

  const modules = useMemo(
    () =>
      buildProfileModules({
        profile,
        contentCards: readModel.contentCards ?? [],
        socialLinks: readModel.socialLinks ?? [],
      }),
    [profile, readModel.contentCards, readModel.socialLinks],
  );

  const handleShare = useCallback(async () => {
    if (typeof window === "undefined") {
      return;
    }

    const shareUrl = window.location.href;
    const sharePayload = {
      title: profile.name ?? `${profile.username}'s Creator Profile`,
      text:
        profile.tagline ??
        profile.bio ??
        "Explore this creator's latest drops, offers, and socials on Creator App.",
      url: shareUrl,
    } satisfies ShareData;

    try {
      if (navigator.share) {
        await navigator.share(sharePayload);
        toast.success("Profile shared", "Spread the word — your link is on the way.");
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Link copied", "Share it anywhere you connect with your audience.");
      } else {
        throw new Error("Share API not supported");
      }

      emitProfileHeroEvent({
        profileId,
        action: "share",
        label: shareUrl,
      });
    } catch (error: unknown) {
      const isAbort =
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        (error as { name: string }).name === "AbortError";

      if (isAbort) {
        return;
      }

      console.error("Failed to share public profile", error);
      toast.error("Unable to share right now");
    }
  }, [profile.bio, profile.name, profile.tagline, profile.username, profileId, toast]);

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }

    emitProfileHeroEvent({
      profileId,
      action: "back",
    });
  }, [profileId, router]);

  return (
    <div className="relative min-h-screen bg-slate-950 pb-[env(safe-area-inset-bottom)]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-18%] h-96 w-96 -translate-x-1/2 rounded-full bg-neutral-500/15 blur-[160px]" />
        <div className="absolute bottom-[-20%] right-[-10%] h-80 w-80 rounded-full bg-neutral-800/15 blur-[180px]" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-4 pt-14">
        <HeroHeader
          profile={profile}
          socials={socialMap}
          stats={stats}
          onShare={handleShare}
          onBack={handleBack}
        />
      </div>

      <div className="relative mx-auto mt-12 w-full max-w-6xl px-4 pb-16">
        <ProfileModules modules={modules} isOwner={isOwner} />
      </div>
    </div>
  );
}
