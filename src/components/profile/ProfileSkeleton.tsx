"use client";

import { ProfileModulesSkeleton } from "./modules/ProfileModules";

export function ProfileSkeleton() {
  return (
    <div className="relative min-h-screen pb-[env(safe-area-inset-bottom)] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-24 h-[360px] w-[360px] rounded-full bg-gradient-to-br from-neutral-700/30 via-neutral-900/25 to-transparent blur-[140px]" />
        <div className="absolute -top-32 right-[-10%] h-[300px] w-[300px] rounded-full bg-gradient-to-bl from-neutral-800/30 via-neutral-950/25 to-transparent blur-[160px]" />
        <div className="absolute left-1/2 top-[15%] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-neutral-500/15 blur-[170px]" />
        <div className="absolute bottom-[-25%] right-[-15%] h-[360px] w-[360px] rounded-full bg-neutral-800/20 blur-[200px]" />
      </div>

      <main className="relative z-10 pb-14 pt-0">
        <section className="w-full bg-black text-white mt-0">
          <div className="mx-auto flex max-w-6xl flex-col gap-0 px-5 pb-6 pt-0 sm:px-8 sm:pb-8 sm:pt-0">
            <div className="relative w-full max-w-6xl">
              <div className="relative w-full overflow-hidden rounded-[32px] border border-white/10 bg-black/40 shadow-[0_25px_60px_rgba(2,6,23,0.55)]">
                <div className="relative h-[55vh] min-h-[360px] max-h-[560px] sm:h-[58vh] lg:h-[52vh]">
                  <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-neutral-900 via-black to-neutral-800" />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent" />

                  <header className="pointer-events-none absolute left-4 top-4 z-20 flex items-center justify-start gap-3 sm:left-6 sm:top-6">
                    {Array.from({ length: 2 }).map((_, index) => (
                      <div
                        key={`hero-action-${index}`}
                        className="h-10 w-10 rounded-full border border-white/15 bg-white/10 sm:h-11 sm:w-11"
                      />
                    ))}
                  </header>

                  <div className="pointer-events-none absolute left-4 top-1/2 z-20 -translate-y-1/2 sm:left-6">
                    <div className="flex flex-col gap-2">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <div
                          key={`hero-social-${index}`}
                          className="h-9 w-24 rounded-full border border-white/15 bg-white/10"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="pointer-events-none absolute right-4 top-4 z-20 flex items-center gap-2 sm:right-6 sm:top-6">
                    <div className="h-8 w-32 rounded-full border border-white/15 bg-white/10" />
                  </div>

                  <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center sm:top-5">
                    <span className="inline-flex h-6 w-32 items-center justify-center rounded-full bg-white/10" />
                  </div>

                  <div className="absolute inset-x-0 bottom-0 z-10 flex w-full flex-col items-center gap-3 px-6 pb-6 text-center text-white sm:px-8">
                    <div className="h-8 w-48 rounded-full bg-white/15 sm:h-10 sm:w-56" />
                    <div className="mx-auto h-4 w-full max-w-3xl rounded-full bg-white/10 sm:h-5" />
                    <div className="mx-auto h-4 w-2/3 max-w-2xl rounded-full bg-white/10 sm:h-5" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="px-6 sm:px-8">
                <div className="mx-auto h-10 w-full max-w-[420px] rounded-full border border-white/12 bg-white/5">
                  <div className="h-full w-full animate-pulse rounded-full bg-gradient-to-r from-white/10 via-white/5 to-transparent" />
                </div>
              </div>
              <section className="flex flex-col space-y-2 px-6 py-3 text-center text-white sm:px-8">
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <div
                      key={`hero-pronoun-${index}`}
                      className="h-7 w-24 rounded-full border border-white/15 bg-white/10"
                    />
                  ))}
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={`hero-badge-${index}`}
                      className="h-9 w-36 rounded-full border border-white/15 bg-white/10"
                    />
                  ))}
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={`hero-action-pill-${index}`}
                      className="h-9 w-32 rounded-full border border-white/15 bg-white/10"
                    />
                  ))}
                </div>
              </section>
            </div>
          </div>
        </section>

        <div className="mx-auto mt-6 w-full max-w-5xl space-y-12 bg-black px-4 pb-20">
          <ProfileModulesSkeleton />
        </div>
      </main>
    </div>
  );
}
