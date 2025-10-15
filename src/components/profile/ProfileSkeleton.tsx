"use client";

export function ProfileSkeleton() {
  return (
    <div className="relative min-h-screen bg-slate-950 pb-[env(safe-area-inset-bottom)]">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-20%] h-96 w-96 -translate-x-1/2 rounded-full bg-neutral-500/15 blur-[160px]" />
        <div className="absolute bottom-[-25%] right-[-15%] h-80 w-80 rounded-full bg-neutral-800/15 blur-[180px]" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-4 pt-14">
        <article className="relative overflow-hidden rounded-[30px] border border-white/12 bg-black/70 shadow-[0_70px_140px_-45px_rgba(2,6,23,0.9)] backdrop-blur-xl sm:rounded-[38px] md:rounded-[46px]">
          <div className="absolute inset-0" aria-hidden="true">
            <div className="absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_20%_-10%,rgba(147,197,253,0.3),transparent_55%),radial-gradient(circle_at_90%_10%,rgba(244,114,182,0.28),transparent_62%),linear-gradient(135deg,#020617_0%,#0b1120_45%,#111827_100%)]" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/70" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),_transparent_58%)]" />
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
                <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-10">
                  <div className="relative mx-auto aspect-square w-32 rounded-[26px] border border-white/15 bg-white/10 shadow-[0_40px_90px_rgba(2,6,23,0.65)] sm:w-36 sm:rounded-[32px] lg:mx-0" />

                  <div className="flex-1 space-y-5 text-center lg:text-left">
                    <div className="mx-auto h-8 w-48 rounded-full bg-white/10 sm:mx-0" />
                    <div className="mx-auto h-4 w-40 rounded-full bg-white/10 sm:mx-0" />
                    <div className="mx-auto h-20 w-full max-w-md rounded-[24px] bg-white/5 sm:mx-0" />
                    <div className="mx-auto flex h-8 w-56 items-center justify-center rounded-full bg-white/5 sm:mx-0" />
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
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`link-card-skeleton-${index}`}
              className="h-80 rounded-[38px] border border-white/12 bg-white/5"
            >
              <div className="h-full w-full animate-pulse rounded-[38px] bg-gradient-to-br from-black/40 via-black/30 to-black/20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
