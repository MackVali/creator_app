"use client";

export function LoadingSkeleton() {
  return (
    <div className="p-4 space-y-4" data-testid="goals-loading">
      <div className="h-8 w-32 bg-[#2B2B2B] rounded animate-pulse" />
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 rounded-lg bg-[#3C3C3C] animate-pulse" />
        ))}
      </div>
    </div>
  );
}
