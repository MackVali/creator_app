"use client";

import { ProfileModulesSkeleton } from "./modules/ProfileModules";

export function ProfileSkeleton() {
  return (
    <div className="relative min-h-screen bg-black pb-[env(safe-area-inset-bottom)]">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-20%] h-96 w-96 -translate-x-1/2 rounded-full bg-white/10 blur-[160px]" />
        <div className="absolute bottom-[-25%] right-[-15%] h-80 w-80 rounded-full bg-neutral-400/10 blur-[180px]" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-4 pt-14">
        <article className="relative overflow-hidden rounded-[30px] border border-white/12 bg-black/70 shadow-[0_70px_140px_-45px_rgba(2,6,23,0.9)] backdrop-blur-xl sm:rounded-[38px] md:rounded-[46px]">
          <div className="absolute inset-0" aria-hidden="true">
            <div className="absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_20%_-10%,rgba(255,255,255,0.2),transparent_55%),radial-gradient(circle_at_90%_10%,rgba(156,163,175,0.18),transparent_62%),linear-gradient(140deg,#030303_0%,#0f0f0f_45%,#171717_100%)]" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/25 to-black/75" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),_transparent_58%)]" />
          </div>

          <div className="absolute left-1/2 top-6 h-2 w-[min(72%,520px)] -translate-x-1/2 overflow-hidden rounded-full border border-white/15 bg-white/5">
            <div className="relative h-full w-2/5 rounded-full bg-gradient-to-r from-white/80 via-white to-white/80" />
            <div className="pointer-events-none absolute inset-0 animate-pulse bg-[linear-gradient(110deg,transparent_18%,rgba(255,255,255,0.45)_50%,transparent_82%)]" />
          </div>

          <div className="relative flex flex-col gap-10 px-5 pb-10 pt-24 sm:gap-12 sm:px-8 sm:pb-12 sm:pt-28 md:px-12 md:pt-32">
            <header className="flex flex-col gap-3 text-white/80 sm:flex-row sm:items-center sm:justify-between">
              <div className="inline-flex h-9 w-48 items-center justify-center rounded-full bg-white/10" />

              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full border border-white/15 bg-black/40" />
                <div className="h-11 w-11 rounded-full border border-white/15 bg-black/40" />
              </div>
            </header>

            <div className="grid gap-8 text-white sm:gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start">
            <div className="flex flex-col gap-8 sm:gap-10">
              <div className="relative isolate -mt-12 flex flex-col gap-6 sm:-mt-16 sm:gap-8 lg:-mt-20">
                <div
                  className="pointer-events-none absolute inset-x-2 top-14 h-36 rounded-full bg-black/45 blur-[80px] sm:inset-x-6 sm:top-16 sm:h-40 lg:inset-x-10 lg:h-48"
                  aria-hidden="true"
                />

                <div className="relative flex flex-col items-center gap-6 overflow-hidden rounded-[30px] border border-white/12 bg-black/65 px-6 py-8 text-center shadow-[0_45px_120px_-45px_rgba(2,6,23,0.85)] backdrop-blur-2xl sm:rounded-[36px] sm:px-8 sm:py-9 lg:flex-row lg:items-start lg:gap-10 lg:px-10 lg:py-10 lg:text-left">
                  <div className="relative mx-auto w-32 sm:w-36 lg:mx-0">
                    <div className="pointer-events-none absolute inset-0 -z-10 scale-[1.18] rounded-full bg-[conic-gradient(from_140deg,_rgba(255,255,255,0.35)_0%,_rgba(212,212,216,0.2)_45%,_rgba(161,161,170,0.16)_75%,_transparent_100%)] blur-3xl" />
                    <div className="relative aspect-square overflow-hidden rounded-[26px] border border-white/15 bg-white/10 shadow-[0_40px_90px_rgba(2,6,23,0.65)] sm:rounded-[32px]">
                      <div className="h-full w-full animate-pulse bg-gradient-to-br from-white/10 via-white/5 to-white/0" />
                      <div className="pointer-events-none absolute inset-0 rounded-[26px] ring-1 ring-white/10 sm:rounded-[32px]" />
                    </div>
                  </div>

                  <div className="flex-1 space-y-5 text-center text-white/80 lg:text-left">
                    <div className="mx-auto h-8 w-48 rounded-full bg-white/12 sm:mx-0 sm:h-9" />
                    <div className="mx-auto flex flex-wrap items-center justify-center gap-2 sm:mx-0">
                      <div className="h-8 w-32 rounded-full bg-white/10" />
                      <div className="h-8 w-28 rounded-full bg-white/10" />
                      <div className="h-8 w-28 rounded-full bg-white/10" />
                    </div>
                    <div className="mx-auto h-20 w-full max-w-md rounded-[24px] bg-white/5 sm:mx-0 sm:h-24" />
                    <div className="mx-auto flex w-full max-w-2xl flex-wrap justify-center gap-2 sm:mx-0 lg:justify-start">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <div key={`bio-pill-${index}`} className="h-8 w-28 rounded-full bg-white/10" />
                      ))}
                    </div>
                    <div className="mx-auto flex w-full max-w-2xl flex-wrap justify-center gap-2 sm:mx-0 lg:justify-start">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <div key={`badge-pill-${index}`} className="h-9 w-40 rounded-full bg-white/12" />
                      ))}
                    </div>
                    <div className="mx-auto flex w-full max-w-2xl flex-wrap justify-center gap-3 sm:mx-0 lg:justify-start">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <div key={`quick-action-${index}`} className="h-10 w-40 rounded-full bg-white/15" />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

                <div className="flex flex-col gap-5 sm:gap-6">
                  <div className="mx-auto h-12 w-full max-w-sm rounded-full bg-white/5 lg:mx-0" />

                  <div className="flex flex-wrap justify-center gap-4 lg:justify-start">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div
                        key={`social-chip-${index}`}
                        className="h-12 w-36 rounded-full bg-white/5"
                      />
                    ))}
                  </div>
                </div>
              </div>

              <aside className="hidden h-full rounded-[34px] border border-white/12 bg-white/5 lg:block" />
            </div>
          </div>
        </article>
      </div>

      <div className="relative mx-auto mt-12 w-full max-w-6xl px-4 pb-16">
        <ProfileModulesSkeleton />
      </div>
    </div>
  );
}
