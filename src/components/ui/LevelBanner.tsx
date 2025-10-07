"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

import { useProfile } from "@/lib/hooks/useProfile";
import { useUserProgress } from "@/lib/hooks/useUserProgress";
import { calculateLevelProgress } from "@/lib/leveling";
import { cn } from "@/lib/utils";

type LevelBannerProps = {
  className?: string;
};

export function LevelBanner({ className }: LevelBannerProps) {
  const { userId } = useProfile();
  const { progress, loading } = useUserProgress(userId, {
    subscribe: true,
  });

  const { level, xpIntoLevel, xpForNextLevel, xpToNextLevel, progressPercent } = useMemo(() => {
    const total = progress?.totalDarkXp ?? 0;
    return calculateLevelProgress(total);
  }, [progress?.totalDarkXp]);

  const levelLabel = loading && !progress ? "--" : level.toString();
  const remainingLabel = loading && !progress ? "--" : formatNumber(xpToNextLevel);
  const progressLabel =
    loading && !progress
      ? "--"
      : `${formatNumber(xpIntoLevel)} / ${formatNumber(xpForNextLevel)} XP`;

  return (
    <div
      className={cn(
        "card relative mx-4 mt-4 overflow-hidden p-4",
        "border border-white/10 bg-black/60",
        className,
      )}
      aria-live="polite"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-zinc-500/20 via-zinc-400/10 to-zinc-500/20 blur-2xl" />
      <div className="relative z-[1] mb-3 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-zinc-200" />
        <div className="flex items-baseline gap-2">
          <span className="font-extrabold text-[18px] tracking-wide">LEVEL {levelLabel}</span>
          <span className="text-xs font-medium text-white/60">
            {remainingLabel === "--" ? "Loading" : `${remainingLabel} XP to next level`}
          </span>
        </div>
      </div>
      <div className="relative z-[1]">
        <div className="h-[12px] w-full rounded-full bg-[#0c0f14] inner-hair" />
        <motion.div
          className="absolute left-0 top-0 h-[12px] rounded-full bg-gradient-to-r from-zinc-200 via-zinc-300 to-zinc-400 shadow-[0_0_15px_-2px_rgba(161,161,170,0.6)]"
          initial={{ width: "0%" }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <div className="pointer-events-none absolute right-0 top-1/2 h-5 w-5 -translate-y-1/2 translate-x-1/2 rounded-full bg-zinc-200/40 blur-md" />
        </motion.div>
        <div className="absolute right-1 -top-6 rounded-full border border-white/10 bg-[#0c0f14] px-2 py-[2px] text-[11px]">
          {progressLabel}
        </div>
      </div>
    </div>
  );
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US");
}
