"use client";

export function ProfileSkeleton() {
  return (
    <div className="relative min-h-screen bg-slate-950 pb-[env(safe-area-inset-bottom)]">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-20%] h-96 w-96 -translate-x-1/2 rounded-full bg-blue-500/15 blur-[160px]" />
        <div className="absolute bottom-[-25%] right-[-15%] h-80 w-80 rounded-full bg-purple-500/10 blur-[180px]" />
      </div>

      <div className="relative mx-auto w-full max-w-4xl px-4 pt-12">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-[0_25px_50px_-12px_rgba(15,23,42,0.65)]">
          <div className="h-44 w-full bg-slate-800/70 animate-pulse sm:h-52" />

          <div className="-mt-12 px-6 pb-8 sm:-mt-16">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
              <div className="mx-auto h-24 w-24 rounded-2xl bg-slate-800 animate-pulse sm:mx-0 sm:h-28 sm:w-28" />

              <div className="flex-1 space-y-4 text-center sm:text-left">
                <div className="mx-auto h-8 w-48 rounded-full bg-white/10 animate-pulse sm:mx-0" />
                <div className="mx-auto h-3 w-40 rounded-full bg-white/10 animate-pulse sm:mx-0" />
                <div className="mx-auto h-20 w-full max-w-md rounded-2xl bg-white/5 animate-pulse sm:mx-0" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative mx-auto mt-10 w-full max-w-4xl px-4">
        <div className="flex flex-wrap justify-center gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`social-skeleton-${index}`}
              className="h-10 w-32 rounded-full bg-white/5 animate-pulse"
            />
          ))}
        </div>
      </div>

      <div className="relative mx-auto mt-12 w-full max-w-5xl px-4 pb-16">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`link-card-skeleton-${index}`}
              className="h-44 rounded-3xl bg-white/5 animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
