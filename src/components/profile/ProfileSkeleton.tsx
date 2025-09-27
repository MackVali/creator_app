"use client";

export function ProfileSkeleton() {
  return (
    <div className="relative min-h-screen bg-slate-950 pb-[env(safe-area-inset-bottom)]">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-20%] h-96 w-96 -translate-x-1/2 rounded-full bg-neutral-500/15 blur-[160px]" />
        <div className="absolute bottom-[-25%] right-[-15%] h-80 w-80 rounded-full bg-neutral-800/15 blur-[180px]" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-4 pt-14">
        <div className="overflow-hidden rounded-[44px] border border-white/12 bg-black/60 backdrop-blur-2xl shadow-[0_60px_120px_-40px_rgba(2,6,23,0.85)]">
          <div className="h-20 w-full bg-black/40" />

          <div className="grid gap-10 px-8 pb-12 pt-10 sm:px-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-8">
                <div className="mx-auto h-32 w-32 rounded-[32px] bg-white/10 lg:mx-0" />
                <div className="flex-1 space-y-5 text-center lg:text-left">
                  <div className="mx-auto h-8 w-48 rounded-full bg-white/10 sm:mx-0" />
                  <div className="mx-auto h-4 w-40 rounded-full bg-white/10 sm:mx-0" />
                  <div className="mx-auto h-20 w-full max-w-md rounded-[24px] bg-white/5 sm:mx-0" />
                </div>
              </div>

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

            <div className="hidden h-full rounded-[34px] bg-white/5 lg:block" />
          </div>
        </div>
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
