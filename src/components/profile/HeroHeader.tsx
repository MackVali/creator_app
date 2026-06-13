"use client";

import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  ChevronLeft,
  Share2,
  ShieldCheck,
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
  type ReactNode,
} from "react";

import { Profile } from "@/lib/types";

import RelationshipViewBar, {
  RelationshipViewCounts,
  type RelationshipStatItem,
} from "@/components/friends/RelationshipViewBar";
import SocialPillsRow from "./SocialPillsRow";

type ProfileStatView = "following" | "followers" | "offers";

const PROFILE_STAT_ITEMS: readonly RelationshipStatItem<ProfileStatView>[] = [
  { value: "following", label: "Following" },
  { value: "followers", label: "Followers" },
  { value: "offers", label: "Offers" },
];

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
  topRightSlot?: ReactNode;
  isOwner?: boolean;
  onAvatarChange?: (file: File) => Promise<void> | void;
  isAvatarUploading?: boolean;
  relationshipCounts?: RelationshipViewCounts;
  onProfileStatSelect?: (view: ProfileStatView) => void;
}

export default function HeroHeader({
  profile,
  socials,
  onShare,
  onBack,
  topRightSlot,
  isOwner = false,
  onAvatarChange,
  isAvatarUploading = false,
  relationshipCounts,
  onProfileStatSelect,
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
  const bioText = bioSegments.length ? bioSegments.join(" • ") : null;

  const pronouns = profile.pronouns?.trim() || null;
  const locationDisplay = (profile.location_display ?? profile.city)?.trim() || null;
  const heroImageSizes =
    "(min-width: 1024px) 176px, (min-width: 640px) 160px, (min-width: 420px) 128px, 96px";
  const hasSocialLinks = Object.values(socials ?? {}).some((url) => url && url !== "#");
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
  const hasRelationshipExtras = pronouns || hasPartnerBadges || hasQuickActions;
  const tooltipIdBase = useId();
  const avatarButtonClass =
    "absolute inset-0 z-10 rounded-full transition duration-200 disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black";

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
      <div className="mx-auto flex max-w-5xl flex-col px-4 pb-6 pt-2 sm:px-6 sm:pb-8">
        <div className="flex min-h-11 w-full items-center justify-between gap-3 text-white/75">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Back</span>
              </button>
            ) : null}
            <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
              <p className="min-w-0 shrink truncate text-sm font-semibold leading-tight text-white/90">
                @{profile.username}
              </p>
              {locationDisplay ? (
                <>
                  <span className="h-1 w-1 shrink-0 rounded-full bg-white/35" aria-hidden="true" />
                  <p
                    className="flex min-w-0 shrink items-center gap-1 text-[0.68rem] font-medium uppercase leading-tight tracking-[0.16em] text-white/55"
                    aria-label={`Located in ${locationDisplay}`}
                  >
                    <MapPin className="h-3 w-3 shrink-0 text-white/45" aria-hidden="true" />
                    <span className="min-w-0 truncate">{locationDisplay}</span>
                  </p>
                </>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {topRightSlot ? topRightSlot : null}
            {onShare ? (
              <button
                type="button"
                onClick={onShare}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              >
                <Share2 className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Share profile</span>
              </button>
            ) : null}
          </div>
        </div>

        <div className="pt-4 sm:pt-6">
          <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-4 min-[420px]:grid-cols-[8rem_minmax(0,1fr)] sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-x-6 lg:grid-cols-[11rem_minmax(0,1fr)]">
            <div className="relative h-24 w-24 overflow-hidden rounded-full min-[420px]:h-32 min-[420px]:w-32 sm:h-40 sm:w-40 lg:h-44 lg:w-44">
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
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-800 via-neutral-900 to-black text-4xl font-semibold text-white sm:text-5xl">
                  <span aria-hidden="true">{initials}</span>
                  <span className="sr-only">{`${displayName}'s initials`}</span>
                </div>
              )}
              {isOwner && (
                <>
                  <button
                    type="button"
                    onClick={handleAvatarClick}
                    disabled={isAvatarUploading}
                    aria-label="Change profile photo"
                    aria-busy={isAvatarUploading}
                    className={avatarButtonClass}
                  />
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    aria-hidden="true"
                    onChange={handleAvatarInputChange}
                  />
                </>
              )}
            </div>

            <div className="flex min-w-0 flex-col items-start text-left">
              <h1 className="max-w-full truncate text-2xl font-semibold leading-tight tracking-tight text-white sm:text-3xl">
                {displayName}
              </h1>
              <div className="mt-1.5 flex max-w-full flex-wrap items-center justify-start gap-x-2 gap-y-1 text-sm text-white/60">
                <span className="max-w-full truncate font-medium text-white/75">
                  @{profile.username}
                </span>
                {locationDisplay ? (
                  <>
                    <span className="h-1 w-1 rounded-full bg-white/35" aria-hidden="true" />
                    <span
                      className="inline-flex min-w-0 items-center gap-1"
                      aria-label={`Located in ${locationDisplay}`}
                    >
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-white/45" aria-hidden="true" />
                      <span className="min-w-0 truncate">{locationDisplay}</span>
                    </span>
                  </>
                ) : null}
              </div>

              {hasSocialLinks ? (
                <div className="mt-3 w-full max-w-full">
                  <SocialPillsRow socials={socials || {}} />
                </div>
              ) : null}

              <div className="mt-4 w-full max-w-2xl">
                <RelationshipViewBar
                  value={null}
                  onChange={onProfileStatSelect}
                  counts={relationshipCounts}
                  items={PROFILE_STAT_ITEMS}
                  className="w-full border border-white/10"
                  itemClassName="px-1.5 sm:px-4"
                  countClassName="text-white"
                  labelClassName="text-[0.62rem] font-medium normal-case tracking-normal text-white/55 sm:text-[0.68rem]"
                  uppercaseLabels={false}
                />
              </div>
              {bioText ? (
                <p className="mt-3 max-w-2xl text-left text-sm font-semibold leading-relaxed tracking-tight text-white/60 sm:text-base">
                  {bioText}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1 pt-5 sm:pt-6">
          {hasRelationshipExtras ? (
            <section className="flex flex-col space-y-1 px-6 py-3 text-center text-white sm:px-8">

            <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-white/70">
              {pronouns ? (
                <span
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em]"
                  aria-label={`Pronouns ${pronouns}`}
                >
                  {pronouns}
                </span>
              ) : null}
            </div>

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
          ) : null}

        </div>
      </div>
    </section>
  );
}
