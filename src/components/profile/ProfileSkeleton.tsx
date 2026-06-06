"use client";

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`bg-white/[0.075] ${className}`} />;
}

function LinkCardSkeleton({
  className = "",
  titleWidth = "w-1/2",
}: {
  className?: string;
  titleWidth?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[32px] border border-white/10 bg-black/30 ${className}`}
    >
      <div className="absolute inset-0 bg-neutral-900/70" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/55 to-transparent" />
      <div className="relative z-10 flex h-full items-end justify-center px-5 pb-5">
        <SkeletonBlock className={`h-4 rounded-full ${titleWidth}`} />
      </div>
    </div>
  );
}

function CarouselSkeleton({ labelWidth }: { labelWidth: string }) {
  return (
    <section className="space-y-3 rounded-3xl border border-white/5 bg-black p-4 text-white shadow-[0_25px_80px_rgba(2,6,23,0.45)]">
      <div className="flex items-end justify-between gap-4">
        <SkeletonBlock className={`h-3 rounded-full ${labelWidth}`} />
      </div>

      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 pt-1">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={`profile-carousel-skeleton-${labelWidth}-${index}`}
            className="snap-center min-w-[220px] animate-pulse rounded-2xl border border-white/10 bg-slate-900/60 p-3"
          >
            <SkeletonBlock className="mb-3 h-32 w-full rounded-xl bg-white/10" />
            <SkeletonBlock className="h-3 w-28 rounded-full bg-white/20" />
            <SkeletonBlock className="mt-2 h-3 w-20 rounded-full bg-white/10" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="relative min-h-screen bg-black pb-[env(safe-area-inset-bottom)] text-white">
      <main className="relative z-10 pb-14 pt-0">
        <section className="mt-0 w-full bg-black text-white">
          <div className="mx-auto flex max-w-6xl flex-col gap-0 px-5 pb-6 pt-0 sm:px-8 sm:pb-8 sm:pt-0">
            <div className="relative w-full max-w-6xl">
              <div className="relative w-full overflow-hidden rounded-[32px] border border-white/10 bg-black/40 shadow-[0_25px_60px_rgba(2,6,23,0.55)]">
                <div className="relative h-[55vh] min-h-[360px] max-h-[560px] sm:h-[58vh] lg:h-[52vh]">
                  <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-neutral-800 via-neutral-950 to-black" />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent" />

                  <header className="pointer-events-none absolute left-4 top-4 z-20 flex items-center justify-start gap-3 sm:left-6 sm:top-6">
                    <SkeletonBlock className="h-10 w-10 rounded-full border border-white/15 bg-black/40 sm:h-11 sm:w-11" />
                    <SkeletonBlock className="h-10 w-10 rounded-full border border-white/15 bg-black/40 sm:h-11 sm:w-11" />
                  </header>

                  <div className="pointer-events-none absolute left-4 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-3 sm:left-6">
                    <SkeletonBlock className="h-11 w-11 rounded-full border border-white/15 bg-black/45" />
                    <SkeletonBlock className="h-11 w-11 rounded-full border border-white/15 bg-black/45" />
                    <SkeletonBlock className="h-11 w-11 rounded-full border border-white/15 bg-black/45" />
                  </div>

                  <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center sm:top-5">
                    <SkeletonBlock className="h-7 w-28 rounded-full bg-black/65 shadow-[0_12px_40px_rgba(0,0,0,0.6)]" />
                  </div>

                  <div className="pointer-events-none absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
                    <SkeletonBlock className="h-7 w-24 rounded-full border border-white/20 bg-black/50 shadow-[0_12px_40px_rgba(0,0,0,0.6)]" />
                  </div>

                  <div className="absolute inset-x-0 bottom-0 z-10 flex w-full flex-col items-center gap-2 px-6 pb-6 text-center text-white sm:px-8">
                    <SkeletonBlock className="h-10 w-56 rounded-full sm:h-12 sm:w-72 md:h-14 md:w-80" />
                    <div className="flex w-full max-w-3xl flex-col items-center gap-2">
                      <SkeletonBlock className="h-4 w-full max-w-xl rounded-full sm:h-5" />
                      <SkeletonBlock className="h-4 w-2/3 max-w-md rounded-full sm:h-5" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="px-6 sm:px-8">
                <SkeletonBlock className="mx-auto h-10 w-full max-w-[420px] rounded-full border border-white/10 bg-white/[0.06]" />
              </div>
              <section className="flex flex-col space-y-1 px-6 py-3 text-center text-white sm:px-8">
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <SkeletonBlock className="h-7 w-24 rounded-full border border-white/15 bg-black/30" />
                  <SkeletonBlock className="h-8 w-32 rounded-full border border-white/15 bg-white/10" />
                </div>
              </section>
            </div>
          </div>
        </section>

        <div className="mx-auto mt-6 w-full max-w-5xl space-y-12 bg-black px-4 pb-20">
          <section className="animate-pulse">
            <div className="grid grid-cols-2 gap-4">
              <LinkCardSkeleton className="aspect-square" titleWidth="w-2/3" />
              <LinkCardSkeleton className="aspect-square" titleWidth="w-1/2" />
              <LinkCardSkeleton
                className="col-span-2 min-h-[220px] sm:aspect-[5/2]"
                titleWidth="w-56 max-w-[70%]"
              />
            </div>
          </section>

          <CarouselSkeleton labelWidth="w-24" />
          <CarouselSkeleton labelWidth="w-24" />

          <section className="relative overflow-hidden rounded-[36px] border border-white/12 bg-black/50 shadow-[0_60px_120px_-50px_rgba(15,23,42,0.85)]">
            <div className="relative z-10 grid gap-6 px-6 py-8 sm:px-9 sm:py-10">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="animate-pulse space-y-2">
                  <SkeletonBlock className="h-6 w-40 rounded-full" />
                  <SkeletonBlock className="h-4 w-56 rounded-full" />
                </div>
                <SkeletonBlock className="h-4 w-28 rounded-full" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <LinkCardSkeleton className="aspect-square" titleWidth="w-2/3" />
                <LinkCardSkeleton className="aspect-square" titleWidth="w-1/2" />
                <LinkCardSkeleton
                  className="col-span-2 min-h-[220px] sm:aspect-[5/2]"
                  titleWidth="w-52 max-w-[70%]"
                />
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
