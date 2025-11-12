"use client";

interface EmptyStateProps {
  onCreate(): void;
}

export function EmptyState({ onCreate }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center space-y-6 py-16 text-center">
      <div className="relative">
        <div className="absolute inset-0 rounded-3xl border border-fuchsia-400/40 blur-[6px]" />
        <div className="grid h-24 w-24 place-items-center rounded-3xl border border-white/15 bg-white/5 text-4xl">
          <span role="img" aria-label="satellite">
            🛰️
          </span>
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-lg font-medium text-white">No goals online</p>
        <p className="text-sm text-white/60">
          Deploy your first mission to unlock the neon deck and start swiping through progress.
        </p>
      </div>
      <button
        onClick={onCreate}
        className="inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-gradient-to-r from-cyan-500/40 to-fuchsia-500/30 px-6 py-2 text-sm font-semibold text-white transition hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        Launch goal
      </button>
    </div>
  );
}
