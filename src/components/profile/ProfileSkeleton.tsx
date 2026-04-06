"use client";

import { ProfileModulesSkeleton } from "./modules/ProfileModules";

export function ProfileSkeleton() {
  return (
    <div className="relative min-h-screen bg-black pb-[env(safe-area-inset-bottom)] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-20%] h-96 w-96 -translate-x-1/2 rounded-full bg-white/10 blur-[160px]" />
        <div className="absolute bottom-[-25%] right-[-15%] h-80 w-80 rounded-full bg-neutral-400/10 blur-[180px]" />
      </div>

      <div className="relative mx-auto w-full max-w-5xl px-4 pt-6 sm:pt-8">
        <div className="mx-auto mb-4 h-2 w-[min(84%,540px)] animate-pulse rounded-full bg-white/20" />

        <header className="mb-5 rounded-2xl border border-white/10 bg-black/70 px-4 py-3 shadow-[0_20px_50px_rgba(0,0,0,0.45)] backdrop-blur">
          <div className="flex items-center justify-between">
            <div className="h-10 w-10 animate-pulse rounded-full bg-white/10" />
            <div className="h-6 w-36 animate-pulse rounded-md bg-white/10 sm:w-44" />
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 animate-pulse rounded-full bg-white/10" />
              <div className="h-10 w-10 animate-pulse rounded-full bg-white/10 ring-2 ring-blue-400/40" />
            </div>
          </div>
        </header>

        <article className="relative overflow-hidden rounded-[30px] border border-white/12 bg-black/70 shadow-[0_70px_140px_-45px_rgba(2,6,23,0.9)] backdrop-blur-xl sm:rounded-[36px]">
          <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-white/[0.04] via-white/[0.02] to-black/55" />

          <div className="relative min-h-[560px] px-4 pb-8 pt-5 sm:min-h-[620px] sm:px-6 sm:pt-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-11 w-11 animate-pulse rounded-full bg-black/45" />
                <div className="h-11 w-11 animate-pulse rounded-full bg-black/45" />
              </div>
              <div className="h-8 w-28 animate-pulse rounded-full bg-black/45" />
              <div className="h-8 w-28 animate-pulse rounded-full bg-black/45" />
            </div>

            <div className="relative h-[420px] overflow-hidden rounded-[28px] border border-white/12 bg-neutral-900/70 shadow-[0_35px_90px_-40px_rgba(2,6,23,0.95)] sm:h-[470px]">
              <div className="absolute inset-0 animate-pulse bg-[linear-gradient(160deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.02)_40%,rgba(0,0,0,0.4)_100%)]" />
              <div className="absolute left-4 top-1/2 flex -translate-y-1/2 flex-col gap-3">
                <div className="h-12 w-12 animate-pulse rounded-full bg-black/55" />
                <div className="h-12 w-12 animate-pulse rounded-full bg-black/55" />
              </div>
              <div className="absolute bottom-8 left-1/2 w-full max-w-[86%] -translate-x-1/2 text-center">
                <div className="mx-auto h-12 w-56 animate-pulse rounded-md bg-black/45 sm:w-72" />
                <div className="mx-auto mt-4 h-7 w-[90%] animate-pulse rounded-md bg-black/40" />
              </div>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black/65" />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 sm:gap-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`stat-block-${index}`}
                  className="h-16 animate-pulse rounded-2xl bg-white/8"
                />
              ))}
            </div>

            <div className="mt-6 space-y-4">
              <div className="h-5 w-40 animate-pulse rounded bg-white/10" />
              <div className="h-44 animate-pulse rounded-[24px] bg-white/8" />
              <div className="h-44 animate-pulse rounded-[24px] bg-white/8" />
            </div>
          </div>
        </article>

        <div className="relative mx-auto mt-8 w-full max-w-6xl pb-16">
          <ProfileModulesSkeleton />
        </div>

        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/90 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur">
          <div className="mx-auto flex w-full max-w-lg items-end justify-between gap-3">
            <div className="h-10 w-16 animate-pulse rounded-md bg-white/10" />
            <div className="h-10 w-16 animate-pulse rounded-md bg-white/10" />
            <div className="mb-2 h-14 w-14 animate-pulse rounded-full bg-blue-500/35" />
            <div className="h-10 w-16 animate-pulse rounded-md bg-white/10" />
            <div className="h-10 w-16 animate-pulse rounded-md bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}
