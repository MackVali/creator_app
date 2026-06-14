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
  PlayCircle,
  ShoppingBag,
  User,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
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

export type FollowedByPreviewUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export type ProfileHeaderActionButtons = {
  primaryLabel: string;
  primaryAriaLabel?: string;
  primaryDisabled?: boolean;
  primaryBusy?: boolean;
  onPrimaryClick: () => void;
  secondaryLabel: string;
  secondaryAriaLabel?: string;
  secondaryDisabled?: boolean;
  onSecondaryClick: () => void;
};

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
  followedByUsers?: FollowedByPreviewUser[];
  followedByTotalCount?: number;
  actionButtons?: ProfileHeaderActionButtons;
  relationshipStatsLoading?: boolean;
  followedByPreviewLoading?: boolean;
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
  followedByUsers = [],
  followedByTotalCount = 0,
  actionButtons,
  relationshipStatsLoading = false,
  followedByPreviewLoading = false,
}: HeroHeaderProps) {
  const router = useRouter();
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
  const heroImageSizes = "(min-width: 420px) 104px, 92px";
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
  const followedByPreviewUsers = followedByUsers.slice(0, 3);
  const followedByNameUsers = followedByPreviewUsers.slice(0, 2);
  const followedByTotal = Math.max(followedByTotalCount, followedByPreviewUsers.length);
  const followedByOtherCount = Math.max(followedByTotal - followedByNameUsers.length, 0);
  const hasFollowedByPreview = !isOwner && followedByPreviewUsers.length > 0;
  const showFollowedByPreview = hasFollowedByPreview || (!isOwner && followedByPreviewLoading);
  const actionButtonBaseClass =
    "inline-flex h-9 min-w-0 flex-1 items-center justify-center rounded-md px-3 text-[0.82rem] font-semibold leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-45";
  const actionButtonClass =
    `${actionButtonBaseClass} border border-black bg-white/[0.14] text-white/90 hover:border-black hover:bg-white/[0.2] disabled:hover:border-black disabled:hover:bg-white/[0.14]`;
  const professionalDashboardButtonClass =
    "inline-flex min-h-[3.4rem] w-full flex-col items-start justify-center rounded-md border border-black bg-white/[0.14] px-3 py-2 text-left transition hover:border-black hover:bg-white/[0.2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45 focus-visible:ring-offset-2 focus-visible:ring-offset-black";

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

  const handleFollowedByPreviewClick = useCallback(() => {
    onProfileStatSelect?.("followers");
  }, [onProfileStatSelect]);

  const handleProfessionalDashboardClick = useCallback(() => {
    router.push("/dashboard");
  }, [router]);

  return (
    <section className="w-full bg-black text-white mt-0">
      <div className="mx-auto flex max-w-5xl flex-col px-4 pb-6 pt-[calc(env(safe-area-inset-top,0px)+0.25rem)] sm:px-6 sm:pb-8">
        <div className="flex min-h-[3.125rem] w-full items-center justify-between gap-3 py-1 text-white/75 sm:min-h-[3.625rem]">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex h-[2.375rem] w-[2.375rem] shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              >
                <ChevronLeft className="h-[1.3rem] w-[1.3rem]" aria-hidden="true" />
                <span className="sr-only">Back</span>
              </button>
            ) : null}
            <div className="flex min-w-0 items-center whitespace-nowrap">
              <p className="min-w-0 shrink truncate text-[1.0625rem] font-semibold leading-tight text-white/95 sm:text-[1.15rem]">
                @{profile.username}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {topRightSlot ? topRightSlot : null}
            {onShare ? (
              <button
                type="button"
                onClick={onShare}
                className="inline-flex h-[2.375rem] w-[2.375rem] shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              >
                <Share2 className="h-[1.3rem] w-[1.3rem]" aria-hidden="true" />
                <span className="sr-only">Share profile</span>
              </button>
            ) : null}
          </div>
        </div>

        <div className="pt-2 sm:pt-3">
          <div className="grid grid-cols-[5.75rem_minmax(0,1fr)] items-center gap-x-3.5 gap-y-3 min-[420px]:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-x-5">
            <div className="relative h-[5.75rem] w-[5.75rem] overflow-hidden rounded-full min-[420px]:h-[6.5rem] min-[420px]:w-[6.5rem]">
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
              <h1 className="relative -top-1 max-w-full truncate pl-[1.125rem] text-base font-semibold leading-tight tracking-tight text-white min-[420px]:pl-5 sm:text-[1.0625rem]">
                {displayName}
              </h1>

              <div className="mt-2.5 w-full max-w-full">
                <RelationshipViewBar
                  value={null}
                  onChange={onProfileStatSelect}
                  counts={relationshipCounts}
                  loading={relationshipStatsLoading}
                  items={PROFILE_STAT_ITEMS}
                  className="!w-full max-w-full !items-stretch !gap-1.5 !rounded-none !bg-transparent !px-0 !py-0 min-[420px]:!gap-2"
                  itemClassName="!flex-1 !items-center !gap-0.5 !rounded-none !bg-transparent !px-1 !py-0 text-center hover:!bg-transparent"
                  countClassName="!text-[0.95rem] !font-semibold !leading-none !tracking-normal text-white sm:!text-base"
                  labelClassName="text-[0.62rem] font-medium leading-tight normal-case tracking-normal text-white/55 sm:text-[0.66rem]"
                  uppercaseLabels={false}
                />
              </div>
            </div>
          </div>

          {bioText ? (
            <p className="mt-2.5 w-full text-left text-sm font-medium leading-relaxed tracking-tight text-white/60 sm:text-[0.95rem]">
              {bioText}
            </p>
          ) : null}

        </div>

        <div className="flex flex-col gap-1 pt-2.5 sm:pt-3">
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

          {showFollowedByPreview ? (
            hasFollowedByPreview ? (
              <button
                type="button"
                onClick={handleFollowedByPreviewClick}
                className="group flex w-full items-center gap-2.5 pt-0 text-left text-[0.78rem] font-medium leading-snug text-white/70 transition hover:text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45 focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:text-[0.82rem]"
                aria-label={`Open ${displayName}'s followers`}
              >
                <span className="flex shrink-0 -space-x-2">
                  {followedByPreviewUsers.map((follower) => {
                    const fallbackInitials = (follower.displayName || follower.username)
                      .trim()
                      .slice(0, 2)
                      .toUpperCase();

                    return (
                      <span
                        key={follower.id}
                        className="relative block h-6 w-6 overflow-hidden rounded-full border-2 border-black bg-zinc-900 ring-1 ring-white/10 transition group-hover:z-10 group-hover:ring-white/35"
                        aria-hidden="true"
                      >
                        {follower.avatarUrl ? (
                          <Image
                            src={follower.avatarUrl}
                            alt=""
                            fill
                            sizes="24px"
                            unoptimized
                            className="rounded-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center bg-zinc-900 text-[0.58rem] font-semibold text-white/50">
                            {fallbackInitials || <User className="h-3 w-3" aria-hidden="true" />}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </span>
                <span className="min-w-0 flex-1">
                  <span>Followed by </span>
                  {followedByNameUsers.map((follower, index) => {
                    const separator =
                      index === 0 ? "" : followedByOtherCount > 0 ? ", " : " and ";

                    return (
                      <span key={follower.id}>
                        {separator}
                        <span className="font-semibold text-white/88">
                          {follower.username}
                        </span>
                      </span>
                    );
                  })}
                  {followedByOtherCount > 0 ? (
                    <span>{` and ${followedByOtherCount} ${followedByOtherCount === 1 ? "other" : "others"}`}</span>
                  ) : null}
                </span>
              </button>
            ) : (
              <div
                className="flex w-full animate-pulse items-center gap-2.5 pt-0"
                aria-hidden="true"
              >
                <span className="flex shrink-0 -space-x-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <span
                      key={`followed-by-loading-${index}`}
                      className="block h-6 w-6 rounded-full border-2 border-black bg-white/12 ring-1 ring-white/10"
                    />
                  ))}
                </span>
                <span className="h-3.5 min-w-0 flex-1 rounded-full bg-white/10" />
              </div>
            )
          ) : null}

          {actionButtons ? (
            <div className={`flex flex-col gap-2 ${isOwner ? "pt-0" : "pt-3"}`}>
              {isOwner ? (
                <button
                  type="button"
                  onClick={handleProfessionalDashboardClick}
                  aria-label="Open professional dashboard"
                  className={professionalDashboardButtonClass}
                >
                  <span className="text-[0.86rem] font-semibold leading-tight text-white/95">
                    Professional dashboard
                  </span>
                  <span className="mt-0.5 text-[0.68rem] font-medium leading-tight text-white/52">
                    0 views in the last 30 days
                  </span>
                </button>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={actionButtons.onPrimaryClick}
                  disabled={actionButtons.primaryDisabled || actionButtons.primaryBusy}
                  aria-label={actionButtons.primaryAriaLabel ?? actionButtons.primaryLabel}
                  aria-busy={actionButtons.primaryBusy || undefined}
                  className={actionButtonClass}
                >
                  {actionButtons.primaryLabel}
                </button>
                <button
                  type="button"
                  onClick={actionButtons.onSecondaryClick}
                  disabled={actionButtons.secondaryDisabled}
                  aria-label={actionButtons.secondaryAriaLabel ?? actionButtons.secondaryLabel}
                  className={actionButtonClass}
                >
                  {actionButtons.secondaryLabel}
                </button>
              </div>
            </div>
          ) : null}

          {hasSocialLinks ? (
            <div className="mt-1 w-full [&>div]:!justify-start">
              <SocialPillsRow socials={socials || {}} />
            </div>
          ) : null}

        </div>
      </div>
    </section>
  );
}
