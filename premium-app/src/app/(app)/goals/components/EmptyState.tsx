"use client";

interface EmptyStateProps {
  onCreate(): void;
}

export function EmptyState({ onCreate }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center space-y-5 py-16 text-center">
      <div className="grid h-20 w-20 place-items-center rounded-full border border-dashed border-white/20 bg-white/[0.04] text-4xl">
        <span role="img" aria-label="target">
          🎯
        </span>
      </div>
      <div className="space-y-2">
        <p className="text-lg font-medium text-white">No goals yet</p>
        <p className="text-sm text-white/60">
          Start by defining an inspiring milestone and connect projects to bring it to life.
        </p>
      </div>
      <button
        onClick={onCreate}
        className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.04] px-5 py-2 text-sm font-medium text-white transition hover:border-indigo-300/40 hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        Create Goal
      </button>
    </div>
  );
}
