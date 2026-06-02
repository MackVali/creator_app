"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
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
  const prestigeBadges = progress?.badges ?? [];
  const hasBadges = prestigeBadges.length > 0;

  const renderedBadges = loading && !progress ? (
    <span className="text-xs font-medium uppercase tracking-[0.2em] text-white/50">Syncing…</span>
  ) : hasBadges ? (
    prestigeBadges.map((badge) => (
      <span
        key={badge.id}
        role="img"
        aria-label={badge.label}
        title={badge.label}
        className="drop-shadow-[0_0_6px_rgba(255,255,255,0.35)]"
      >
        {badge.emoji}
      </span>
    ))
  ) : null;

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
      <div className="relative z-[1] mb-4 flex flex-wrap items-center gap-3 text-white">
        <span
          role="img"
          aria-label="Level mark"
          className="flex h-5 w-5 items-center justify-center text-lg text-zinc-200 drop-shadow-[0_0_6px_rgba(255,255,255,0.35)]"
        >
          💠
        </span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-lg leading-none">{renderedBadges}</div>
          <span className="font-extrabold text-[20px] tracking-wide text-white">LEVEL {levelLabel}</span>
        </div>
        <span className="text-xs font-medium text-white/60">
          {remainingLabel === "--" ? "Loading" : `${remainingLabel} XP to next level`}
        </span>
      </div>
      <div className="relative z-[1]">
        <div className="h-[15px] w-full overflow-hidden rounded-full border border-white/[0.08] bg-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.45)] backdrop-blur-sm">
          <motion.div
            className="relative h-full rounded-full border border-white/[0.16] bg-gradient-to-r from-white/55 via-zinc-200/75 to-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-1px_0_rgba(0,0,0,0.22)]"
            initial={{ width: "0%" }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <div className="pointer-events-none absolute inset-x-1 top-[2px] h-[3px] rounded-full bg-white/35" />
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US");
}
