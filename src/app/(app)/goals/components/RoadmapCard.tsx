"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";
import type { Roadmap } from "@/lib/queries/roadmaps";

import type { Goal } from "../types";
import { GoalCard } from "./GoalCard";

interface RoadmapCardProps {
  roadmap: Roadmap;
  goalCount: number;
  goals: Goal[];
  onClick?(): void;
  variant?: "default" | "compact";
}

function RoadmapCardImpl({
  roadmap,
  goalCount,
  goals,
  onClick,
  variant = "default",
}: RoadmapCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    return () => {
      setOpen(false);
    };
  }, []);

  const handleToggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const hasGoals = goals.length > 0;

  if (variant === "compact") {
    const containerBase =
      "group relative h-full rounded-2xl border-2 border-yellow-400 shimmer-border p-3 text-white min-h-[96px]";
    const containerClass = `${containerBase} shadow-[0_10px_26px_-14px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.06)] aspect-[5/6]`;
    return (
      <div ref={cardRef} className={containerClass} data-variant="compact">
        <div className="pointer-events-none absolute inset-0 rounded-2xl [mask-image:linear-gradient(to_bottom,black,transparent_70%)] bg-[radial-gradient(120%_70%_at_50%_0%,rgba(255,255,255,0.10),transparent_60%)]" />
        <div className="relative z-0 flex h-full min-w-0 flex-col items-stretch">
          <button
            type="button"
            onClick={() => {
              handleToggle();
              onClick?.();
            }}
            className="flex flex-1 flex-col items-center gap-1 min-w-0 text-center"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-base font-semibold shadow-[inset_0_-1px_0_rgba(255,255,255,0.06),_0_6px_12px_rgba(0,0,0,0.35)] bg-white/5 text-white">
              {roadmap.emoji ?? roadmap.title.slice(0, 2)}
            </div>
            <h3
              className="max-w-full px-1 text-center text-[8px] leading-snug font-semibold line-clamp-2 break-words min-h-[2.4em]"
              title={roadmap.title}
              style={{ hyphens: "auto" }}
            >
              {roadmap.title}
            </h3>
            <div className="mt-1 text-[7px] text-white/60">
              {goalCount} {goalCount === 1 ? "goal" : "goals"}
            </div>
          </button>

          {open && hasGoals && (
            <CompactGoalsOverlay
              roadmap={roadmap}
              goals={goals}
              onClose={handleToggle}
              anchorRect={null}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="group relative h-full rounded-[30px] border-2 border-amber-500 bg-white/[0.03] p-4 text-white transition hover:-translate-y-1 hover:border-amber-500/50">
      <div className="relative flex h-full flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <button
            onClick={() => {
              handleToggle();
              onClick?.();
            }}
            className="relative flex flex-1 flex-col gap-2 overflow-hidden text-left"
          >
            <div className="relative z-10 flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 text-xl font-semibold bg-white/5 text-white">
                {roadmap.emoji ?? roadmap.title.slice(0, 2)}
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em]">
                  <span className="flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-white/80">
                    <span className="text-[10px] uppercase tracking-[0.2em]">
                      ROADMAP
                    </span>
                  </span>
                </div>
                <h3 className="mt-2 text-xl font-semibold">{roadmap.title}</h3>
              </div>
              <ChevronDown
                className={`mt-1 h-5 w-5 text-white/60 transition-transform ${
                  open ? "rotate-180" : ""
                }`}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
              <div className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-white/60"
                  aria-hidden="true"
                />
                <span>
                  {goalCount} {goalCount === 1 ? "goal" : "goals"}
                </span>
              </div>
            </div>
          </button>
        </div>

        {open && (
          <div className="flex-1">
            {hasGoals ? (
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {goals.map((goal) => (
                  <div
                    key={goal.id}
                    className="goal-card-wrapper relative z-0 w-full isolate min-w-0"
                  >
                    <GoalCard
                      goal={goal}
                      showWeight={false}
                      showCreatedAt={false}
                      showEmojiPrefix={true}
                      variant="compact"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/20 bg-white/[0.02] px-4 py-6 text-center text-sm text-white/60">
                No goals yet
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type CompactGoalsOverlayProps = {
  roadmap: Roadmap;
  goals: Goal[];
  onClose: () => void;
  anchorRect: DOMRect | null;
};

function CompactGoalsOverlay({
  roadmap,
  goals,
  onClose,
  anchorRect,
}: CompactGoalsOverlayProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const { body } = document;
    if (!body) return;
    const original = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = original;
    };
  }, []);

  if (typeof document === "undefined" || !mounted) return null;

  const regionId = `roadmap-${roadmap.id}`;
  const headingId = `${regionId}-overlay-title`;
  const isMobile =
    typeof window !== "undefined" ? window.innerWidth < 640 : true;
  const computedMaxWidth = anchorRect
    ? Math.min(640, Math.max(anchorRect.width + 64, 300))
    : undefined;

  const header = (
    <div className="flex items-center justify-between px-5 py-4">
      <h4
        id={headingId}
        className="text-xs font-semibold uppercase tracking-[0.28em] text-white/70"
      >
        {roadmap.title}
      </h4>
      <button
        type="button"
        onClick={onClose}
        className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/80 transition hover:border-white/30 hover:text-white"
      >
        Close
      </button>
    </div>
  );

  const goalsContent = (
    <div className="max-h-[60vh] overflow-y-auto px-3 pb-4 sm:max-h-[70vh] sm:px-5">
      <div className="space-y-1">
        {goals.map((goal) => (
          <div
            key={goal.id}
            className="goal-card-wrapper relative z-0 w-full isolate min-w-0"
          >
            <GoalCard
              goal={goal}
              showWeight={false}
              showCreatedAt={false}
              showEmojiPrefix={true}
              variant="compact"
              showEnergyInCompact={true}
            />
          </div>
        ))}
      </div>
    </div>
  );

  const basePanelClass =
    "overflow-hidden rounded-2xl border border-white/15 bg-black shadow-[0_25px_50px_-20px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.05)]";

  if (isMobile || !anchorRect) {
    return createPortal(
      <>
        <button
          type="button"
          className="fixed inset-0 z-[60] bg-black/70"
          aria-label="Close goals overlay"
          onClick={onClose}
        />
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-10">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            className={`w-full max-w-sm ${basePanelClass}`}
            style={
              computedMaxWidth ? { maxWidth: computedMaxWidth } : undefined
            }
          >
            {header}
            {goalsContent}
          </div>
        </div>
      </>,
      document.body
    );
  }

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] bg-black/50"
        aria-label="Close goals overlay"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[70] flex items-center justify-center px-6 py-12">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          className={`w-full max-w-xl ${basePanelClass}`}
          style={computedMaxWidth ? { maxWidth: computedMaxWidth } : undefined}
        >
          {header}
          {goalsContent}
        </div>
      </div>
    </>,
    document.body
  );
}

export const RoadmapCard = memo(RoadmapCardImpl, (prev, next) => {
  return (
    prev.roadmap.id === next.roadmap.id &&
    prev.roadmap.title === next.roadmap.title &&
    prev.goalCount === next.goalCount &&
    prev.variant === next.variant &&
    prev.goals === next.goals
  );
});

export default RoadmapCard;
