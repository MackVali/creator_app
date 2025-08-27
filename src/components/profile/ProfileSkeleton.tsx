"use client";

export function ProfileSkeleton() {
  return (
    <div className="min-h-screen bg-slate-900 pb-[env(safe-area-inset-bottom)]">
      {/* Hero Header Skeleton */}
      <div className="relative">
        {/* Cover Block Skeleton */}
        <div className="relative h-[200px] overflow-hidden rounded-2xl mx-4 mt-4">
          <div className="w-full h-full bg-slate-800 animate-pulse" />
        </div>

        {/* Top Row Skeleton */}
        <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
          <div className="w-10 h-10 rounded-full bg-black/20 animate-pulse" />
          <div className="flex items-center space-x-2">
            <div className="w-20 h-4 bg-white/20 rounded animate-pulse" />
            <div className="w-4 h-4 bg-white/20 rounded animate-pulse" />
          </div>
          <div className="w-10 h-10 rounded-full bg-black/20 animate-pulse" />
        </div>

        {/* Profile Info Container Skeleton */}
        <div className="px-4 -mt-14 relative z-10">
          {/* Avatar Skeleton */}
          <div className="flex justify-center mb-4">
            <div className="w-[84px] h-[84px] rounded-full bg-slate-800 animate-pulse" />
          </div>

          {/* Name and Handle Skeleton */}
          <div className="text-center mb-3">
            <div className="flex items-center justify-center space-x-2 mb-1">
              <div className="w-32 h-8 bg-white/20 rounded animate-pulse" />
              <div className="w-5 h-5 rounded-full bg-blue-500 animate-pulse" />
            </div>
            <div className="w-24 h-6 bg-white/20 rounded animate-pulse mx-auto" />
          </div>

          {/* Tagline Skeleton */}
          <div className="text-center mb-6">
            <div className="w-48 h-4 bg-white/20 rounded animate-pulse mx-auto" />
          </div>
        </div>
      </div>

      {/* Social Pills Row Skeleton */}
      <div className="px-4 -mt-8">
        <div className="flex justify-center space-x-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="w-11 h-11 rounded-full bg-white/10 animate-pulse"
            />
          ))}
        </div>
      </div>

      {/* Link Grid Skeleton */}
      <div className="mt-8 px-4">
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="aspect-square rounded-2xl bg-white/5 animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
