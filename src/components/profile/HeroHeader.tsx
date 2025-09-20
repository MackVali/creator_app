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

interface HeroHeaderProps {
  profile: Profile;
  onShare?: () => void;
  onBack?: () => void;
}

export default function HeroHeader({
  profile,
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

  return (
    <section className="relative mx-auto w-full max-w-4xl px-4">
      <div className="absolute inset-0 -z-10 flex justify-center">
        <div className="h-48 w-48 rounded-full bg-blue-500/20 blur-[120px]" />
      </div>

      <article className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/70 shadow-[0_25px_50px_-12px_rgba(15,23,42,0.65)] backdrop-blur-xl">
        <div className="relative h-44 sm:h-52">
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

          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />

          <div className="absolute inset-x-6 top-6 flex items-center gap-3 text-white">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 rounded-full bg-black/40 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Back</span>
              </button>
            ) : null}

            <div className="flex flex-1 justify-center">
              <div className="flex flex-col items-center text-[0.7rem] font-semibold uppercase tracking-[0.35em] text-white/60">
                <span>Profile</span>
                <div className="mt-2 h-px w-12 bg-white/30" />
              </div>
            </div>

            {onShare ? (
              <button
                type="button"
                onClick={onShare}
                className="inline-flex items-center gap-2 rounded-full bg-black/40 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                <span className="hidden sm:inline">Share</span>
                <Share2 className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="-mt-12 px-6 pb-8 sm:-mt-16">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
            <div className="relative mx-auto sm:mx-0">
              <div className="relative h-24 w-24 overflow-hidden rounded-2xl border border-white/20 bg-slate-800 shadow-[0_10px_40px_rgba(15,23,42,0.6)] sm:h-28 sm:w-28">
                {profile.avatar_url ? (
                  <Image
                    src={profile.avatar_url}
                    alt={`${displayName}'s avatar`}
                    fill
                    sizes="(min-width: 640px) 112px, 96px"
                    unoptimized
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-slate-700 text-3xl font-bold text-white">
                    {initials}
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 text-center sm:text-left">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="mx-auto flex flex-col gap-3 sm:mx-0">
                  <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    <h1 className="text-3xl font-semibold text-white sm:text-4xl">
                      {displayName}
                    </h1>
                    {profile.verified && (
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-500">
                        <svg
                          className="h-3 w-3 text-white"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </span>
                    )}
                  </div>

                  <div className="flex justify-center sm:justify-start">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm font-medium text-white/70">
                      <ExternalLink className="h-4 w-4 text-white/40" aria-hidden="true" />
                      @{profile.username}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <p className="mx-auto max-w-2xl text-base leading-relaxed text-white/70 sm:mx-0">
                  {tagline}
                </p>

                <div className="flex flex-wrap justify-center gap-3 text-sm text-white/60 sm:justify-start">
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
              </div>
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}
