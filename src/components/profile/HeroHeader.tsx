"use client";

import {
  Calendar,
  ChevronLeft,
  ExternalLink,
  MapPin,
  Share2,
} from "lucide-react";
import Image from "next/image";
import { Profile } from "@/lib/types";
import SocialPillsRow from "./SocialPillsRow";

interface HeroHeaderProps {
  profile: Profile;
  socials?: Record<string, string | undefined>;
  stats?: {
    linkCount: number;
    socialCount: number;
  };
  onShare?: () => void;
  onBack?: () => void;
}

export default function HeroHeader({
  profile,
  socials,
  stats,
  onShare,
  onBack,
}: HeroHeaderProps) {
  const getInitials = (name: string | null, username: string) => {
    if (name) {
      return name
        .split(" ")
        .map((word) => word.charAt(0))
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return username.slice(0, 2).toUpperCase();
  };

  const formatBioSegments = (bio: string | null | undefined) => {
    if (!bio) return [] as string[];

    return bio
      .split(/[\n•|]+/)
      .flatMap((segment) =>
        segment
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean),
      );
  };

  const initials = getInitials(profile.name || null, profile.username);
  const displayName = profile.name?.trim() || profile.username;
  const bioSegments = formatBioSegments(profile.bio);
  const tagline = bioSegments.length
    ? bioSegments.join(" • ")
    : "Share a short introduction so people know what to expect from your world.";

  const joinedDate = profile.created_at
    ? new Intl.DateTimeFormat(undefined, {
        month: "long",
        year: "numeric",
      }).format(new Date(profile.created_at))
    : null;

  const linkCount = stats?.linkCount ?? 0;
  const socialCount = stats?.socialCount ?? 0;

  return (
    <section className="relative mx-auto w-full max-w-5xl px-4">
      <div className="absolute inset-x-0 -top-24 -z-10 flex justify-center">
        <div className="h-56 w-56 rounded-full bg-blue-500/25 blur-[140px]" />
      </div>

      <article className="relative overflow-hidden rounded-[34px] border border-white/10 bg-slate-900/70 shadow-[0_35px_60px_-15px_rgba(15,23,42,0.75)] backdrop-blur-xl">
        <div className="relative h-48 sm:h-60">
          {profile.banner_url ? (
            <Image
              src={profile.banner_url}
              alt="Profile banner"
              fill
              priority
              unoptimized
              sizes="(min-width: 640px) 1024px, 100vw"
              className="object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950" />
          )}

          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/10 via-slate-950/40 to-slate-950/80" />

          <div className="absolute inset-x-6 top-6 flex items-center justify-between text-white">
            <div className="inline-flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.4em] text-white/80">
              <span className="h-2 w-2 rounded-full bg-blue-400" />
              <span>Bio Link</span>
            </div>

            <div className="flex items-center gap-3">
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/35 text-white/80 transition-colors hover:border-white/40 hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">Back</span>
                </button>
              ) : null}

              {onShare ? (
                <button
                  type="button"
                  onClick={onShare}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/35 text-white/80 transition-colors hover:border-white/40 hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                >
                  <Share2 className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">Share profile</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="-mt-14 px-6 pb-10 sm:-mt-20 sm:px-10">
          <div className="flex flex-col gap-7 sm:flex-row sm:items-end">
            <div className="relative mx-auto flex items-center justify-center sm:mx-0">
              <div className="absolute inset-0 -z-10 rounded-[32px] bg-gradient-to-br from-blue-500/40 via-purple-500/30 to-pink-500/30 blur-xl" />
              <div className="relative h-28 w-28 overflow-hidden rounded-[26px] border border-white/20 bg-slate-900 shadow-[0_25px_45px_rgba(15,23,42,0.6)] sm:h-32 sm:w-32">
                {profile.avatar_url ? (
                  <Image
                    src={profile.avatar_url}
                    alt={`${displayName}'s avatar`}
                    fill
                    sizes="(min-width: 640px) 128px, 112px"
                    unoptimized
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-slate-800 text-3xl font-bold text-white">
                    {initials}
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 text-center sm:text-left">
              <div className="mx-auto flex flex-col gap-4 sm:mx-0">
                <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                  <h1 className="text-3xl font-semibold text-white sm:text-4xl">{displayName}</h1>
                  {profile.verified ? (
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-500 shadow-[0_8px_16px_rgba(37,99,235,0.45)]">
                      <svg className="h-3.5 w-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                  ) : null}
                </div>

                <div className="flex justify-center sm:justify-start">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm font-medium text-white/75 shadow-[0_8px_20px_rgba(15,23,42,0.35)]">
                    <ExternalLink className="h-4 w-4 text-white/40" aria-hidden="true" />
                    @{profile.username}
                  </span>
                </div>
              </div>

              <p className="mt-6 mx-auto max-w-3xl text-base leading-relaxed text-white/75 sm:mx-0">
                {tagline}
              </p>

              <div className="mt-5 flex flex-wrap justify-center gap-3 text-sm text-white/65 sm:justify-start">
                {profile.city ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                    <MapPin className="h-4 w-4 text-blue-200" aria-hidden="true" />
                    <span>{profile.city}</span>
                  </span>
                ) : null}

                {joinedDate ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                    <Calendar className="h-4 w-4 text-blue-200" aria-hidden="true" />
                    <span>Joined {joinedDate}</span>
                  </span>
                ) : null}
              </div>

              <div className="mt-7">
                <SocialPillsRow socials={socials || {}} />
              </div>

              <div className="mt-8 flex flex-wrap justify-center gap-4 sm:justify-start">
                <div className="min-w-[160px] rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-left shadow-[0_18px_35px_rgba(15,23,42,0.45)]">
                  <span className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
                    Featured
                  </span>
                  <span className="mt-2 block text-3xl font-semibold text-white">
                    {linkCount}
                  </span>
                  <span className="text-xs text-white/55">
                    {linkCount === 1 ? "live link" : "live links"}
                  </span>
                </div>

                <div className="min-w-[160px] rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-left shadow-[0_18px_35px_rgba(15,23,42,0.45)]">
                  <span className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
                    Networks
                  </span>
                  <span className="mt-2 block text-3xl font-semibold text-white">
                    {socialCount}
                  </span>
                  <span className="text-xs text-white/55">
                    {socialCount === 1 ? "connected account" : "connected accounts"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}
