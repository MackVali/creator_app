"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";

import LavaCrackOverlay, {
  type LavaCrackOverlayHandle,
} from "@/components/effects/LavaCrackOverlay";
import fireConfettiBurst from "@/components/effects/ConfettiBurst";
import usePrefersReducedMotion from "@/hooks/usePrefersReducedMotion";

export interface ProjectCardProps {
  id: string;
  title: string;
  completedAt?: string;
  onComplete?: (id: string) => void;
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const SHIMMER_DURATION = 260;
const REDUCED_MOTION_TIMEOUT = 140;

export const ProjectCard: React.FC<ProjectCardProps> = ({
  id,
  title,
  completedAt,
  onComplete,
}) => {
  const [isCompleted, setCompleted] = useState(Boolean(completedAt));
  const [isAnimating, setAnimating] = useState(false);
  const [showShimmer, setShowShimmer] = useState(false);
  const [shimmerKey, setShimmerKey] = useState(0);
  const [announce, setAnnounce] = useState<string | null>(null);
  const [motionState, setMotionState] = useState<
    "idle" | "anticipate" | "explode" | "completed"
  >(Boolean(completedAt) ? "completed" : "idle");

  const cardRef = useRef<HTMLDivElement | null>(null);
  const checkboxRef = useRef<HTMLInputElement | null>(null);
  const overlayRef = useRef<LavaCrackOverlayHandle | null>(null);

  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    setCompleted(Boolean(completedAt));
    if (completedAt) {
      setMotionState("completed");
    }
  }, [completedAt]);

  useEffect(() => {
    return () => {
      overlayRef.current?.teardown();
    };
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      overlayRef.current?.teardown();
      overlayRef.current = null;
    }
  }, [reducedMotion]);

  const triggerShimmer = useCallback(() => {
    setShowShimmer(true);
    setShimmerKey((value) => value + 1);
    const timeout = window.setTimeout(() => {
      setShowShimmer(false);
    }, SHIMMER_DURATION + 120);
    return () => window.clearTimeout(timeout);
  }, []);

  const calculateOrigins = useCallback(() => {
    const cardEl = cardRef.current;
    if (!cardEl) {
      return {
        overlayOrigin: { x: 0, y: 0 },
        confettiOrigin: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
      };
    }

    const rect = cardEl.getBoundingClientRect();
    return {
      overlayOrigin: { x: rect.width / 2, y: rect.height / 2 },
      confettiOrigin: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    };
  }, []);

  const handleComplete = useCallback(async () => {
    if (isCompleted || isAnimating) {
      return;
    }

    setAnnounce(null);

    if (reducedMotion) {
      setCompleted(true);
      setMotionState("completed");
      setAnnounce("Completed");
      await wait(REDUCED_MOTION_TIMEOUT);
      onComplete?.(id);
      return;
    }

    setAnimating(true);
    setMotionState("anticipate");

    const overlay = overlayRef.current;
    const { overlayOrigin, confettiOrigin } = calculateOrigins();

    await wait(80);
    await overlay?.playCrack();

    setMotionState("explode");

    await Promise.all([
      overlay?.explode(overlayOrigin),
      fireConfettiBurst({
        originClient: confettiOrigin,
        count: 64,
      }),
    ]);

    setMotionState("completed");
    setCompleted(true);
    triggerShimmer();
    setAnnounce("Completed");
    setAnimating(false);
    onComplete?.(id);
  }, [
    calculateOrigins,
    id,
    isAnimating,
    isCompleted,
    onComplete,
    reducedMotion,
    triggerShimmer,
  ]);

  const onCheckboxChange = useCallback(() => {
    void handleComplete();
  }, [handleComplete]);

  useEffect(() => {
    if (isCompleted && checkboxRef.current && !checkboxRef.current.checked) {
      checkboxRef.current.checked = true;
    }
  }, [isCompleted]);

  const cardVariants = useMemo(
    () => ({
      idle: { scale: 1 },
      anticipate: {
        scale: 0.98,
        transition: { duration: 0.09, ease: [0.4, 0, 0.2, 1] },
      },
      explode: {
        scale: 1.02,
        transition: { duration: 0.16, ease: [0.2, 0.8, 0.2, 1] },
      },
      completed: {
        scale: 1,
        transition: { duration: 0.24, ease: [0.16, 0.84, 0.44, 1] },
      },
    }),
    []
  );

  return (
    <motion.div
      ref={cardRef}
      data-testid="project-card"
      data-completed={isCompleted ? "true" : "false"}
      className={clsx(
        "relative overflow-hidden rounded-2xl p-5 transition-colors duration-300",
        "shadow-[inset_0_-1px_0_rgba(0,0,0,0.35)]",
        isCompleted
          ? "bg-pine-gradient text-[#E6F4EF]"
          : "bg-rock-surface text-[#E6F4EF]"
      )}
      variants={cardVariants}
      animate={motionState}
      initial={motionState}
      role="group"
    >
      <div className="relative z-10 flex items-start gap-4">
        <input
          ref={checkboxRef}
          id={`project-card-${id}`}
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0 appearance-none rounded-md border border-emerald-400 bg-black/40 outline-none ring-emerald-300 transition-transform duration-150 checked:bg-emerald-400"
          onChange={onCheckboxChange}
          disabled={isAnimating || isCompleted}
          aria-checked={isCompleted}
          aria-label={`Complete ${title}`}
        />
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <p className="text-base font-semibold text-white/90">{title}</p>
            {isCompleted ? (
              <motion.span
                key="checkmark"
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.25, ease: [0.16, 0.84, 0.44, 1] }}
                className="text-emerald-200"
                aria-hidden
              >
                ✓
              </motion.span>
            ) : null}
          </div>
          <p className="text-sm text-white/60">
            {isCompleted
              ? "Completed"
              : "Tap the check to trigger the molten completion sequence."}
          </p>
        </div>
      </div>

      {!reducedMotion ? (
        <LavaCrackOverlay
          ref={(instance) => {
            if (!instance && overlayRef.current) {
              overlayRef.current.teardown();
            }
            overlayRef.current = instance ?? null;
          }}
          className="pointer-events-none"
        />
      ) : null}

      <AnimatePresence mode="wait">
        {showShimmer && !reducedMotion ? (
          <motion.div
            key={shimmerKey}
            className="pointer-events-none absolute inset-0 z-20"
            initial={{ opacity: 0 }}
            animate={{
              opacity: [0, 0.3, 0],
              x: ["-30%", "130%"],
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeInOut" }}
            style={{
              background:
                "linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.12) 45%, rgba(255,255,255,0.2) 50%, transparent 75%)",
            }}
          />
        ) : null}
      </AnimatePresence>

      {reducedMotion && isCompleted ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-emerald-200">
          ✨
        </div>
      ) : null}

      <div role="status" aria-live="polite" className="sr-only">
        {announce}
      </div>
    </motion.div>
  );
};

ProjectCard.displayName = "ProjectCard";

export default ProjectCard;
