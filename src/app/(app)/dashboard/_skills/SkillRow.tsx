"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Skill } from "./useSkillsData";
import type { SkillProgressData } from "./useSkillProgress";

export function computeWidth(percent: number) {
  const clamped = Math.max(0, Math.min(100, percent));
  return `${clamped}%`;
}

export function hasVisibleLevelProgress(
  progress?: Pick<SkillProgressData, "xpIntoLevel" | "progressPercent">,
) {
  return (progress?.xpIntoLevel ?? 0) > 0 && (progress?.progressPercent ?? 0) > 0;
}

interface Props {
  skill: Skill;
  progress?: SkillProgressData;
  onColor: string;
  trackColor: string;
  fillColor: string;
}

const SKILL_OPEN_PREVIEW_PREFIX = "creator.skillOpenPreview.";

export default function SkillRow({ skill, progress, onColor }: Props) {
  const router = useRouter();
  const openingTimerRef = useRef<number | null>(null);
  const [opening, setOpening] = useState(false);
  const level = progress?.level ?? skill.level;
  const prestige = progress?.prestige;
  const badges = progress?.badges ?? [];
  const showLevel = level !== null && level !== undefined;
  const showProgress =
    progress?.xpIntoLevel !== undefined &&
    progress?.xpIntoLevel !== null &&
    progress?.xpRequired !== undefined &&
    progress?.xpRequired !== null &&
    progress.xpRequired > 0;
  const showProgressFill = showProgress && hasVisibleLevelProgress(progress);
  const showPrestige = prestige !== undefined && prestige !== null;

  const badgeContent = badges.map((badge) => (
    <span
      key={badge.id}
      role="img"
      aria-label={badge.label}
      title={badge.label}
      className="drop-shadow-[0_0_4px_rgba(255,255,255,0.25)]"
    >
      {badge.emoji}
    </span>
  ));

  const skillHref = `/skills/${skill.id}`;

  const prefetchSkill = useCallback(() => {
    router.prefetch(skillHref);
  }, [router, skillHref]);

  const storeOpenPreview = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.sessionStorage.setItem(
        `${SKILL_OPEN_PREVIEW_PREFIX}${skill.id}`,
        JSON.stringify({
          id: skill.id,
          name: skill.name,
          icon: skill.emoji || null,
          timestamp: Date.now(),
        })
      );
    } catch (error) {
      console.warn("Unable to store skill open preview", error);
    }
  }, [skill.emoji, skill.id, skill.name]);

  const markOpening = useCallback(() => {
    storeOpenPreview();
    setOpening(true);

    if (openingTimerRef.current !== null) {
      window.clearTimeout(openingTimerRef.current);
    }

    openingTimerRef.current = window.setTimeout(() => {
      setOpening(false);
      openingTimerRef.current = null;
    }, 180);
  }, [storeOpenPreview]);

  return (
    <Link
      href={skillHref}
      className={`rounded-2xl bg-black/15 border border-black/20 px-3 py-2.5 flex items-center gap-3 transition-[transform,filter,box-shadow,background-color,border-color] duration-150 ease-out active:scale-[.985] ${
        opening
          ? "scale-[.985] border-white/25 bg-white/10 brightness-110 shadow-[0_10px_30px_rgba(255,255,255,0.08)] ring-1 ring-white/15"
          : "shadow-none"
      }`}
      draggable={false}
      onPointerEnter={prefetchSkill}
      onFocus={prefetchSkill}
      onTouchStart={() => {
        prefetchSkill();
        markOpening();
      }}
      onPointerDown={markOpening}
      onClick={storeOpenPreview}
      onDragStart={(e) => e.preventDefault()}
      style={{ color: onColor }}
    >
      <div className="size-9 rounded-xl bg-black/25 flex items-center justify-center text-lg">
        {skill.emoji || ""}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate" style={{ color: onColor }}>
          {skill.name}
        </div>
        {showLevel && (
          <div className="mt-1 flex flex-wrap items-center gap-2" style={{ color: onColor }}>
            {showPrestige && badges.length > 0 && (
              <div className="flex items-center gap-1 text-sm leading-none">{badgeContent}</div>
            )}
            <div className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/8 px-1.5 py-0.5 text-[10px]">
              Lv {level}
            </div>
          </div>
        )}
      </div>
      {showProgress && (
        <div className="flex min-w-[24%] flex-col gap-1">
          <div className="h-2.5 w-full overflow-hidden rounded-full border border-white/[0.08] bg-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.45)]">
            {showProgressFill && (
              <div
                className="progress-bar-glint relative h-full rounded-full border border-white/[0.14] bg-gradient-to-r from-white/55 via-zinc-200/75 to-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-1px_0_rgba(0,0,0,0.22)] transition-[width] duration-200"
                style={{ width: computeWidth(progress?.progressPercent ?? 0) }}
              >
                <span className="progress-bar-glint-sweep" aria-hidden="true" />
                <div className="pointer-events-none absolute inset-x-1 top-[1px] z-[4] h-px rounded-full bg-white/35" />
              </div>
            )}
          </div>
          <span className="text-xs text-zinc-500">
            {progress?.xpIntoLevel ?? 0} / {progress?.xpRequired ?? 0} XP
          </span>
        </div>
      )}
    </Link>
  );
}
