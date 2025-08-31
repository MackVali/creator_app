"use client"

export function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-6 bg-[#2B2B2B] rounded" />
      <div className="h-6 bg-[#2B2B2B] rounded" />
      <div className="h-6 bg-[#2B2B2B] rounded" />
    </div>
  )
}
