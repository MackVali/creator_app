"use client";

export function LoadingSkeleton() {
  return (
    <div className="space-y-6" data-testid="goals-loading">
      <div className="h-10 w-48 animate-pulse rounded-full bg-[var(--subtle-surface)]" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="app-panel h-36 animate-pulse rounded-[28px]"
          >
            <div className="h-full w-full rounded-[28px] border border-[var(--border)] bg-[var(--subtle-surface)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
