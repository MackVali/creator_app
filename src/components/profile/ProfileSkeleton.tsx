"use client";

import { SourceListingCardSkeleton } from "./SourceListingCard";

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`bg-white/10 ${className}`} />;
}

function StatSkeleton({ width }: { width: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-0">
      <SkeletonBlock className={`h-[0.72rem] rounded-full ${width}`} />
      <SkeletonBlock className="h-3 w-12 rounded-full bg-white/8" />
    </div>
  );
}

export function ProfileContentCardsSkeleton() {
  return (
    <section className="animate-pulse">
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={`profile-content-card-skeleton-${index}`}
            className="relative aspect-square overflow-hidden rounded-[32px] border border-white/10 bg-black/30"
          >
            <div className="absolute inset-0 bg-white/5" />
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 via-black/45 to-transparent" />
            <div className="relative z-10 flex h-full items-end justify-center px-5 pb-5">
              <SkeletonBlock className="h-3.5 w-3/4 rounded-full bg-white/12" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ProfileListingSectionSkeleton({ titleWidth }: { titleWidth: string }) {
  return (
    <section className="animate-pulse space-y-2 text-white">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-1">
          <SkeletonBlock className={`h-3 rounded-full bg-white/12 ${titleWidth}`} />
        </div>
        <SkeletonBlock className="h-3 w-14 rounded-full bg-white/8" />
      </div>

      <div className="flex flex-wrap items-start justify-start gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <SourceListingCardSkeleton key={`profile-listing-skeleton-${titleWidth}-${index}`} />
        ))}
      </div>
    </section>
  );
}

function FollowedBySkeleton() {
  return (
    <div className="flex w-full items-center gap-2.5 pt-0">
      <div className="flex shrink-0 -space-x-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <SkeletonBlock
            key={`profile-followed-by-avatar-skeleton-${index}`}
            className="h-6 w-6 rounded-full border-2 border-black bg-white/12 ring-1 ring-white/10"
          />
        ))}
      </div>
      <SkeletonBlock className="h-3.5 min-w-0 flex-1 rounded-full bg-white/10" />
    </div>
  );
}

function ActionRowsSkeleton({ actionLayout }: { actionLayout: ProfileSkeletonActionLayout }) {
  return (
    <div className="flex flex-col gap-2">
      {actionLayout === "owner" ? (
        <div className="flex min-h-[3.4rem] w-full flex-col items-start justify-center rounded-md border border-black bg-white/[0.14] px-3 py-2">
          <SkeletonBlock className="h-3.5 w-40 max-w-[55%] rounded-full bg-white/14" />
          <SkeletonBlock className="mt-1.5 h-2.5 w-32 max-w-[45%] rounded-full bg-white/10" />
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <SkeletonBlock className="h-9 rounded-md border border-black bg-white/14" />
        <SkeletonBlock className="h-9 rounded-md border border-black bg-white/10" />
      </div>
    </div>
  );
}

function RelationshipExtrasSkeleton() {
  return (
    <section className="flex flex-col space-y-1 px-6 py-3 text-center text-white sm:px-8">
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-white/70">
        <SkeletonBlock className="h-6 w-20 rounded-full border border-white/10 bg-white/10" />
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <SkeletonBlock className="h-8 w-28 rounded-full border border-white/10 bg-white/10" />
        <SkeletonBlock className="h-8 w-24 rounded-full border border-white/10 bg-white/10" />
      </div>
    </section>
  );
}

export function SocialPillsSkeleton() {
  return (
    <div className="-mx-2 flex snap-x snap-mandatory items-center gap-1.5 overflow-x-auto overflow-y-visible px-2 pb-2 sm:mx-0 sm:flex-wrap sm:justify-start sm:overflow-visible sm:px-0">
      {Array.from({ length: 3 }).map((_, index) => (
        <SkeletonBlock
          key={`profile-social-pill-skeleton-${index}`}
          className="h-11 w-11 shrink-0 rounded-full border border-white/10 bg-white/[0.06]"
        />
      ))}
    </div>
  );
}

type ProfileSkeletonActionLayout = "viewer" | "owner";

export function ProfileSkeleton({
  actionLayout = "viewer",
  showRelationshipExtras = false,
  showSocialLinks = true,
}: {
  actionLayout?: ProfileSkeletonActionLayout;
  showRelationshipExtras?: boolean;
  showSocialLinks?: boolean;
}) {
  return (
    <div className="relative min-h-screen bg-black pb-[env(safe-area-inset-bottom)] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-24 h-[360px] w-[360px] rounded-full bg-gradient-to-br from-neutral-700/25 via-neutral-900/20 to-transparent blur-[140px]" />
        <div className="absolute -top-32 right-[-10%] h-[300px] w-[300px] rounded-full bg-gradient-to-bl from-neutral-800/25 via-neutral-950/20 to-transparent blur-[160px]" />
        <div className="absolute left-1/2 top-[15%] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-neutral-500/10 blur-[170px]" />
      </div>
      <main className="relative z-10 pb-14 pt-0">
        <section className="mt-0 w-full bg-black text-white">
          <div className="mx-auto flex max-w-5xl flex-col px-4 pb-6 pt-[calc(env(safe-area-inset-top,0px)+0.25rem)] sm:px-6 sm:pb-8">
            <div className="flex min-h-[3.125rem] w-full items-center justify-between gap-3 py-1 text-white/75 sm:min-h-[3.625rem]">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <SkeletonBlock className="h-[2.375rem] w-[2.375rem] shrink-0 rounded-full bg-white/8" />
                <SkeletonBlock className="h-5 w-28 max-w-[45vw] rounded-full bg-white/12 sm:h-5 sm:w-36" />
              </div>
              <SkeletonBlock className="h-[2.375rem] w-[2.375rem] shrink-0 rounded-full bg-white/8" />
            </div>

            <div className="animate-pulse pt-2 sm:pt-3">
              <div className="grid grid-cols-[5.75rem_minmax(0,1fr)] items-center gap-x-3.5 gap-y-3 min-[420px]:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-x-5">
                <SkeletonBlock className="h-[5.75rem] w-[5.75rem] rounded-full bg-white/12 min-[420px]:h-[6.5rem] min-[420px]:w-[6.5rem]" />

                <div className="flex min-w-0 flex-col items-start text-left">
                  <SkeletonBlock className="relative -top-1 ml-[1.125rem] h-4 w-32 max-w-[70%] rounded-full bg-white/14 min-[420px]:ml-5 sm:h-[1.0625rem] sm:w-40" />

                  <div className="mt-2.5 flex w-full max-w-full items-stretch gap-1.5 min-[420px]:gap-2">
                    <StatSkeleton width="w-8" />
                    <StatSkeleton width="w-9" />
                    <StatSkeleton width="w-7" />
                  </div>
                </div>
              </div>

              <div className="mt-2.5 space-y-1.5">
                <SkeletonBlock className="h-3.5 w-full rounded-full bg-white/10 sm:h-[0.95rem]" />
                <SkeletonBlock className="h-3.5 w-3/4 rounded-full bg-white/8 sm:h-[0.95rem]" />
              </div>
            </div>

            <div className="animate-pulse flex flex-col gap-1 pt-2.5 sm:pt-3">
              {showRelationshipExtras ? <RelationshipExtrasSkeleton /> : null}
              {actionLayout === "viewer" ? <FollowedBySkeleton /> : null}
              <div className={actionLayout === "viewer" ? "pt-3" : "pt-0"}>
                <ActionRowsSkeleton actionLayout={actionLayout} />
              </div>

              {showSocialLinks ? (
                <div className="mt-1 w-full">
                  <SocialPillsSkeleton />
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <div className="mx-auto mt-4 w-full max-w-5xl space-y-12 bg-black px-4 pb-20">
          <ProfileContentCardsSkeleton />
          <ProfileListingSectionSkeleton titleWidth="w-20" />
          <ProfileListingSectionSkeleton titleWidth="w-24" />
        </div>
      </main>
    </div>
  );
}
