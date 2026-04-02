"use client";

import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  ChevronLeft,
  Share2,
  ShieldCheck,
  Sparkles,
  Handshake,
  Headphones,
  MapPin,
  PlayCircle,
  ShoppingBag,
} from "lucide-react";
import Image from "next/image";
import {
  useCallback,
  useId,
  useRef,
  type ChangeEvent,
  type MouseEvent,
} from "react";

import { Profile } from "@/lib/types";

import SocialPillsRow from "./SocialPillsRow";

const QUICK_ACTION_ICON_MAP: Record<string, LucideIcon> = {
  watch: PlayCircle,
  view: PlayCircle,
  read: BookOpen,
  article: BookOpen,
  listen: Headphones,
  shop: ShoppingBag,
  buy: ShoppingBag,
};

const PARTNER_BADGE_ICON_MAP: Record<string, LucideIcon> = {
  verified: BadgeCheck,
  trust: ShieldCheck,
  shield: ShieldCheck,
  partner: Handshake,
  alliance: Handshake,
};

function getQuickActionIcon(name?: string | null) {
  if (!name) return ArrowUpRight;

  const normalized = name.toLowerCase();
  return QUICK_ACTION_ICON_MAP[normalized] ?? ArrowUpRight;
}

function getPartnerBadgeIcon(name?: string | null) {
  if (!name) return ShieldCheck;

  const normalized = name.toLowerCase();
  return PARTNER_BADGE_ICON_MAP[normalized] ?? ShieldCheck;
}

interface HeroHeaderProps {
  profile: Profile;
  socials?: Record<string, string | undefined>;
  onShare?: () => void;
  onBack?: () => void;
  isOwner?: boolean;
  onAvatarChange?: (file: File) => Promise<void> | void;
  isAvatarUploading?: boolean;
}

export default function HeroHeader({
  profile,
  socials,
  onShare,
  onBack,
  isOwner = false,
  onAvatarChange,
  isAvatarUploading = false,
}: HeroHeaderProps) {
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

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

  const pronouns = profile.pronouns?.trim() || null;
  const locationDisplay = (profile.location_display ?? profile.city)?.trim() || null;
  const heroHeightClasses = "h-[55vh] min-h-[360px] max-h-[560px] sm:h-[58vh] lg:h-[52vh]";
  const heroImageSizes =
    "(min-width: 1024px) 192px, (min-width: 768px) 176px, (min-width: 640px) 160px, 80vw";
  const partnerBadges = (profile.partner_badges ?? [])
    .filter((badge) => badge && badge.label?.trim())
    .map((badge) => ({
      ...badge,
      label: badge.label!.trim(),
    }));
  const quickActions = (profile.quick_action_badges ?? [])
    .filter((action) => action && action.label?.trim())
    .map((action) => ({
      ...action,
      label: action.label!.trim(),
    }));
  const hasPartnerBadges = partnerBadges.length > 0;
  const hasQuickActions = quickActions.length > 0;
  const tooltipIdBase = useId();
  const avatarButtonClass =
    "absolute inset-0 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black transition duration-200 disabled:cursor-not-allowed disabled:opacity-70";
  const avatarOverlayVisibilityClass = isAvatarUploading
    ? "opacity-100"
    : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100";

  const joinedDate = profile.created_at
    ? new Intl.DateTimeFormat(undefined, {
        month: "long",
        year: "numeric",
      }).format(new Date(profile.created_at))
    : null;

  const handleAvatarClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (isAvatarUploading) return;
      if (!onAvatarChange) return;
      avatarInputRef.current?.click();
    },
    [isAvatarUploading, onAvatarChange],
  );

  const handleAvatarInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !onAvatarChange) {
        event.target.value = "";
        return;
      }
      onAvatarChange(file);
      event.target.value = "";
    },
    [onAvatarChange],
  );

  return (
    <section className="w-full bg-black text-white mt-0">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 pb-10 pt-0 sm:px-8 sm:pb-12 sm:pt-0">
        <div className="relative w-full max-w-6xl">
          <div className="relative w-full overflow-hidden rounded-[32px] border border-white/10 bg-black/40 shadow-[0_25px_60px_rgba(2,6,23,0.55)]">
            <div className={`relative ${heroHeightClasses}`}>
              <div className="absolute inset-0">
                {profile.avatar_url ? (
                  <Image
                    src={profile.avatar_url}
                    alt={`${displayName}'s avatar`}
                    fill
                    sizes={heroImageSizes}
                    unoptimized
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-800 via-neutral-900 to-black text-5xl font-semibold text-white">
                    <span aria-hidden="true">{initials}</span>
                    <span className="sr-only">{`${displayName}'s initials`}</span>
                  </div>
                )}
              </div>

              {(onBack || onShare) && (
                <header className="pointer-events-auto absolute left-4 top-4 z-20 flex items-center justify-start gap-3 text-white/80 sm:left-6 sm:top-6">
                  {onBack ? (
                    <button
                      type="button"
                      onClick={onBack}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white transition-colors hover:border-white/30 hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-200 focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:h-11 sm:w-11"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">Back</span>
                    </button>
                  ) : null}
                  {onShare ? (
                    <button
                      type="button"
                      onClick={onShare}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white transition-colors hover:border-white/30 hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-200 focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:h-11 sm:w-11"
                    >
                      <Share2 className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">Share profile</span>
                    </button>
                  ) : null}
                </header>
              )}
              {isOwner && (
                <>
                  <button
                    type="button"
                    onClick={handleAvatarClick}
                    disabled={isAvatarUploading}
                    aria-label="Change profile photo"
                    aria-busy={isAvatarUploading}
                    className={`${avatarButtonClass}`}
                  />
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    aria-hidden="true"
                    onChange={handleAvatarInputChange}
                  />
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-x-6 bottom-6 z-10 rounded-full border border-white/20 bg-black/60 px-5 py-2 text-[0.65rem] font-semibold tracking-[0.35em] text-white transition-opacity duration-200 ${avatarOverlayVisibilityClass}`}
                  >
                    {isAvatarUploading ? (
                      "Uploading..."
                    ) : (
                      <span className="flex items-center gap-2">
                        <Sparkles className="h-3 w-3" aria-hidden="true" />
                        Edit
                      </span>
                    )}
                  </span>
                </>
              )}

              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent" />
              <div className="pointer-events-auto absolute left-4 top-1/2 z-20 -translate-y-1/2 sm:left-6">
                <SocialPillsRow socials={socials || {}} layout="vertical" />
              </div>
              <div className="absolute inset-x-0 bottom-0 z-10 flex w-full flex-col items-center gap-3 px-6 pb-6 text-center text-white pointer-events-none sm:px-8">
                <h1 className="text-3xl font-semibold sm:text-4xl md:text-5xl">{displayName}</h1>
                <p className="text-sm font-medium text-white/80">@{profile.username}</p>
              </div>
            </div>
          </div>
        </div>


        <div className="flex flex-col gap-8">
          <section className="space-y-6 rounded-[32px] border border-white/10 bg-white/5 px-6 py-8 text-center text-white/90 shadow-[0_20px_50px_rgba(2,6,23,0.55)] sm:px-8">
            <div className="space-y-3">
              <p className="text-base leading-relaxed text-white/90">{tagline}</p>
              {joinedDate ? (
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-white/50">
                  Joined {joinedDate}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-white/70">
              {pronouns ? (
                <span
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em]"
                  aria-label={`Pronouns ${pronouns}`}
                >
                  {pronouns}
                </span>
              ) : null}
              {locationDisplay ? (
                <span
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-1 text-xs font-medium text-white/70"
                  aria-label={`Located in ${locationDisplay}`}
                >
                  <MapPin className="h-4 w-4 text-white/70" aria-hidden="true" />
                  <span>{locationDisplay}</span>
                </span>
              ) : null}
            </div>

            {bioSegments.length ? (
              <div className="flex flex-wrap justify-center gap-2">
                {bioSegments.slice(0, 4).map((segment) => (
                  <span
                    key={segment}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.25em] text-white/70"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-white/45" aria-hidden="true" />
                    {segment}
                  </span>
                ))}
              </div>
            ) : null}

            {hasPartnerBadges ? (
              <ul role="list" className="flex flex-wrap justify-center gap-2">
                {partnerBadges.map((badge, index) => {
                  const Icon = getPartnerBadgeIcon(badge.icon);
                  const tooltipId = `${tooltipIdBase}-badge-${index}`;

                  return (
                    <li key={badge.id ?? `${badge.label}-${index}`} role="listitem" className="group relative">
                      <span
                        tabIndex={0}
                        role="button"
                        aria-label={`${badge.label}${badge.description ? `. ${badge.description}` : ""}`}
                        aria-describedby={badge.description ? tooltipId : undefined}
                        className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white/85 shadow-[0_14px_32px_rgba(15,23,42,0.35)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                      >
                        <Icon className="h-4 w-4 text-white/65" aria-hidden="true" />
                        <span>{badge.label}</span>
                      </span>
                      {badge.description ? (
                        <div
                          id={tooltipId}
                          role="tooltip"
                          className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-2xl border border-white/10 bg-black/90 px-4 py-3 text-left text-[0.7rem] leading-snug text-white/85 opacity-0 shadow-xl transition-opacity duration-150 ease-out group-focus-within:opacity-100 group-hover:opacity-100"
                        >
                          <p>{badge.description}</p>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {hasQuickActions ? (
              <ul role="list" className="flex flex-wrap justify-center gap-3">
                {quickActions.map((action, index) => {
                  const Icon = getQuickActionIcon(action.icon);
                  const key = action.id ?? `${action.label}-${index}`;
                  const ariaLabel = action.aria_label?.trim() || `${action.label} quick action`;
                  const commonClasses =
                    "group inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/12 px-4 py-2 text-xs font-semibold text-white/90 shadow-[0_14px_32px_rgba(15,23,42,0.35)] transition-all hover:border-white/40 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black";

                  return (
                    <li key={key} role="listitem">
                      {action.href ? (
                        <a href={action.href ?? undefined} className={commonClasses} aria-label={ariaLabel}>
                          <Icon className="h-4 w-4 text-white/70" aria-hidden="true" />
                          <span>{action.label}</span>
                          <ArrowUpRight
                            className="h-4 w-4 text-white/60 transition-transform duration-150 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                            aria-hidden="true"
                          />
                        </a>
                      ) : (
                        <span tabIndex={0} role="button" aria-label={ariaLabel} className={`${commonClasses} cursor-default`}>
                          <Icon className="h-4 w-4 text-white/70" aria-hidden="true" />
                          <span>{action.label}</span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>

          <section className="rounded-[28px] border border-white/12 bg-gradient-to-br from-white/5 via-white/2 to-transparent px-6 py-8 shadow-[0_30px_60px_-25px_rgba(2,6,23,0.7)] sm:px-7 sm:py-9">
            <div className="rounded-3xl border border-white/10 bg-black/50 px-5 py-5 text-sm leading-relaxed text-white/85 sm:px-6">
              <p className="text-[0.925rem] leading-relaxed text-white/85 sm:text-sm">
                {profile.bio
                  ? profile.bio
                  : "Add a longer story in your bio to help visitors understand your craft, mission, and offerings."}
              </p>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
