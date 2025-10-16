"use client";

export function LoadingSkeleton() {
  return (
    <div className="space-y-6" data-testid="goals-loading">
      <div className="h-10 w-40 rounded-full bg-white/10 animate-pulse" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-32 rounded-2xl border border-white/5 bg-white/[0.04] animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
