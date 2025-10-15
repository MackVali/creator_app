import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function SkillCardSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-900/60 ring-1 ring-white/10 shadow-[inset_0_1px_rgba(255,255,255,0.05),0_6px_18px_rgba(0,0,0,0.35)]">
      <Skeleton className="h-9 w-9 rounded bg-white/5" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-2 w-full" />
      </div>
      <div className="flex flex-col items-end gap-1">
        <Skeleton className="h-4 w-12 rounded-full" />
        <Skeleton className="h-3 w-8" />
      </div>
    </div>
  );
}

export default SkillCardSkeleton;

