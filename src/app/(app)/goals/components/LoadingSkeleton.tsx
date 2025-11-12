"use client";

export function LoadingSkeleton() {
  return (
    <div className="space-y-6" data-testid="goals-loading">
      <div className="h-10 w-48 animate-pulse rounded-full bg-white/10" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-36 animate-pulse rounded-[28px] border border-white/10 bg-white/5"
          >
            <div className="h-full w-full rounded-[28px] border border-white/5 bg-white/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
