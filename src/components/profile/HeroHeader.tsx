"use client";

import {
  Calendar,
  ChevronLeft,
  ExternalLink,
  MapPin,
  Share2,
  Sparkles,
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
    <section className="relative mx-auto w-full max-w-6xl px-4">
      <div className="absolute inset-x-0 -top-36 -z-10 flex justify-center">
        <div className="h-72 w-72 rounded-full bg-gradient-to-br from-neutral-500/35 via-neutral-900/20 to-transparent blur-[160px]" />
      </div>

      <article className="relative overflow-hidden rounded-[44px] border border-white/12 bg-gradient-to-br from-[#050505] via-[#101010] to-[#1d1d1d] shadow-[0_60px_120px_-35px_rgba(2,6,23,0.9)]">
        <div className="absolute inset-0">
          <div className="absolute -left-12 -top-20 h-64 w-64 rounded-full bg-gradient-to-br from-white/10 via-white/0 to-transparent blur-[120px]" />
          <div className="absolute right-[-15%] top-16 h-72 w-72 rounded-full bg-gradient-to-bl from-white/8 via-transparent to-transparent blur-[160px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),_transparent_58%)]" />
        </div>

        <div className="relative flex flex-col gap-12 px-6 pb-12 pt-10 sm:px-10 md:px-14 md:pt-12">
          <header className="flex flex-wrap items-center justify-between gap-4 text-white/80">
            <div className="inline-flex items-center gap-3 rounded-full bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.4em]">
              <Sparkles className="h-4 w-4 text-white/50" aria-hidden="true" />
              <span>Creator Spotlight</span>
            </div>

            <div className="flex items-center gap-3">
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white transition-colors hover:border-white/30 hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-200 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">Back</span>
                </button>
              ) : null}

              {onShare ? (
                <button
                  type="button"
                  onClick={onShare}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white transition-colors hover:border-white/30 hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-200 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                >
                  <Share2 className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">Share profile</span>
                </button>
              ) : null}
            </div>
          </header>

          <div className="grid gap-10 text-white lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start">
            <div className="flex flex-col gap-10">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-10">
                <div className="relative mx-auto aspect-square w-36 overflow-hidden rounded-[32px] border border-white/15 bg-black shadow-[0_40px_90px_rgba(2,6,23,0.65)] lg:mx-0">
                  {profile.avatar_url ? (
                    <Image
                      src={profile.avatar_url}
                      alt={`${displayName}'s avatar`}
                      fill
                      sizes="(min-width: 1024px) 144px, (min-width: 640px) 160px, 144px"
                      unoptimized
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-800 via-neutral-900 to-black text-4xl font-semibold text-white">
                      {initials}
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-0 rounded-[32px] ring-1 ring-white/10" />
                </div>

                <div className="flex-1 text-center lg:text-left">
                  <div className="flex flex-col items-center gap-4 lg:items-start">
                    <div className="flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                      <h1 className="text-3xl font-semibold sm:text-4xl">{displayName}</h1>
                      {profile.verified ? (
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-black/80 shadow-[0_12px_30px_rgba(2,6,23,0.55)]">
                          <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </span>
                      ) : null}
                    </div>

                    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm font-medium text-white/80 shadow-[0_14px_32px_rgba(15,23,42,0.45)]">
                      <ExternalLink className="h-4 w-4 text-white/40" aria-hidden="true" />
                      @{profile.username}
                    </span>
                  </div>

                  <p className="mt-6 text-base leading-relaxed text-white/70">{tagline}</p>

                  <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm text-white/65 lg:justify-start">
                    {profile.city ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                        <MapPin className="h-4 w-4 text-white/55" aria-hidden="true" />
                        <span>{profile.city}</span>
                      </span>
                    ) : null}

                    {joinedDate ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                        <Calendar className="h-4 w-4 text-white/55" aria-hidden="true" />
                        <span>Joined {joinedDate}</span>
                      </span>
                    ) : null}
                  </div>

                  {bioSegments.length ? (
                    <div className="mt-7 flex flex-wrap justify-center gap-2 lg:justify-start">
                      {bioSegments.slice(0, 4).map((segment) => (
                        <span
                          key={segment}
                          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.25em] text-white/55"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                          {segment}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <div className="flex flex-wrap justify-center gap-4 lg:justify-start">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  >
                    Follow
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-medium text-white/80 transition-all duration-200 hover:border-white/35 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-200 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  >
                    Message
                  </button>
                </div>

                <SocialPillsRow socials={socials || {}} />
              </div>
            </div>

            <aside className="relative overflow-hidden rounded-[34px] border border-white/12 bg-gradient-to-br from-white/6 via-white/2 to-transparent px-8 py-9 shadow-[0_30px_60px_-25px_rgba(2,6,23,0.7)]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.15),_transparent_70%)]" />
              <div className="relative flex flex-col gap-8">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-white/45">Snapshot</p>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-white/50">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" />
                    Live
                  </span>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div className="rounded-3xl border border-white/10 bg-black/60 px-5 py-6 text-center">
                    <span className="text-xs font-semibold uppercase tracking-[0.35em] text-white/45">Featured</span>
                    <p className="mt-3 text-4xl font-semibold text-white">{linkCount}</p>
                    <p className="text-xs text-white/55">
                      {linkCount === 1 ? "Curated link" : "Curated links"}
                    </p>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-black/60 px-5 py-6 text-center">
                    <span className="text-xs font-semibold uppercase tracking-[0.35em] text-white/45">Networks</span>
                    <p className="mt-3 text-4xl font-semibold text-white">{socialCount}</p>
                    <p className="text-xs text-white/55">
                      {socialCount === 1 ? "Social channel" : "Social channels"}
                    </p>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-black/50 px-6 py-5 text-sm leading-relaxed text-white/70">
                  <p>
                    {profile.bio
                      ? profile.bio
                      : "Add a longer story in your bio to help visitors understand your craft, mission, and offerings."}
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </article>
    </section>
  );
}
