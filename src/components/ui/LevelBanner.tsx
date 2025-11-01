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

  const clampedPercent = Math.min(100, Math.max(0, progressPercent));

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
  ) : (
    <span className="text-[10px] font-medium uppercase tracking-[0.28em] text-white/35">No badges yet</span>
  );

  return (
    <div
      className={cn(
        "relative mx-4 mt-6 overflow-hidden rounded-[30px] border border-white/12 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_rgba(15,23,42,0.9))] p-6 text-white shadow-[0_32px_80px_rgba(8,12,25,0.55)] backdrop-blur-2xl",
        className,
      )}
      aria-live="polite"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.18] via-white/[0.04] to-transparent opacity-60" />
      <div className="pointer-events-none absolute -right-12 top-8 h-48 w-48 rounded-full bg-purple-500/30 blur-3xl" />
      <div className="pointer-events-none absolute -left-12 bottom-[-40px] h-44 w-44 rounded-full bg-sky-500/25 blur-[120px]" />

      <div className="relative z-[1] flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.08] shadow-[0_12px_22px_rgba(15,17,32,0.45)]">
              <Sparkles className="h-5 w-5 text-cyan-200" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 text-lg leading-none text-white drop-shadow-[0_4px_12px_rgba(15,18,38,0.45)]">
                  {renderedBadges}
                </div>
                <span className="text-[13px] font-semibold uppercase tracking-[0.3em] text-white/70">Current level</span>
              </div>
              <p className="mt-2 text-[28px] font-black tracking-[0.08em] text-white">Level {levelLabel}</p>
            </div>
          </div>

          <div className="flex flex-col items-end text-right text-sm text-white/70">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">Next milestone</span>
            <span className="mt-2 text-lg font-semibold text-white">
              {remainingLabel === "--" ? "Loading" : `${remainingLabel} XP`}
            </span>
            <span className="text-xs text-white/60">to reach the next level</span>
          </div>
        </div>

        <div className="relative">
          <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-sky-400 to-purple-400 shadow-[0_0_30px_rgba(192,219,255,0.6)]"
              initial={{ width: "0%" }}
              animate={{ width: `${clampedPercent}%` }}
              transition={{ duration: 0.9, ease: "easeOut" }}
            >
              <div className="pointer-events-none h-full w-full rounded-full bg-white/30 opacity-70 mix-blend-screen" />
            </motion.div>
          </div>

          <div className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80 shadow-[0_10px_25px_rgba(8,10,20,0.45)]">
            {progressLabel}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US");
}
