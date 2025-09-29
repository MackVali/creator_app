"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
} from "react";
import { motion, useAnimationControls } from "framer-motion";
import { Check, Sparkles, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { particleBurst } from "@/components/ParticleBurst";
import { Shimmer } from "@/components/Shimmer";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

const PARTICLE_COLORS = ["#1a6b52", "#22c55e", "#9ae6b4"];

export interface ProjectCardProps {
  id: string;
  title: string;
  timeRange?: string;
  completedAt?: string | null;
  completed?: boolean;
  onComplete?: (id: string) => void;
  onUndo?: (id: string) => void;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function ProjectCard({
  id,
  title,
  timeRange,
  completedAt,
  completed,
  onComplete,
  onUndo,
  disabled = false,
  className,
  style,
}: ProjectCardProps) {
  const checkboxRef = useRef<HTMLInputElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const controls = useAnimationControls();
  const prefersReducedMotion = usePrefersReducedMotion();

  const completedFromProps = useMemo(() => {
    if (typeof completed === "boolean") return completed;
    return Boolean(completedAt);
  }, [completed, completedAt]);

  const [optimisticCompleted, setOptimisticCompleted] = useState<boolean | null>(
    () => (completedFromProps ? true : null)
  );
  const [isCompleting, setIsCompleting] = useState(false);
  const [showShimmer, setShowShimmer] = useState(false);
  const [showStaticSparkle, setShowStaticSparkle] = useState(false);
  const [showUndo, setShowUndo] = useState(false);

  const isCompleted = (optimisticCompleted ?? completedFromProps) === true;
  const isInteractionLocked = disabled || isCompleting;

  useEffect(() => {
    if (optimisticCompleted === null) return;
    if (completedFromProps === optimisticCompleted) {
      setOptimisticCompleted(null);
    }
  }, [completedFromProps, optimisticCompleted]);

  useEffect(() => {
    controls.set({ scale: 1, rotate: 0 });
  }, [controls]);

  useEffect(() => {
    if (isCompleted && prefersReducedMotion) {
      setShowStaticSparkle(true);
    }
    if (!isCompleted) {
      setShowStaticSparkle(false);
      setShowShimmer(false);
    }
  }, [isCompleted, prefersReducedMotion]);

  useEffect(() => {
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    if (isCompleted) {
      setShowUndo(true);
      undoTimerRef.current = window.setTimeout(() => {
        setShowUndo(false);
        undoTimerRef.current = null;
      }, 2000);
    } else {
      setShowUndo(false);
    }

    return () => {
      if (undoTimerRef.current) {
        window.clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }
    };
  }, [isCompleted]);

  const runCompletionSequence = useCallback(async () => {
    if (isInteractionLocked || isCompleted) return;

    setIsCompleting(true);
    setOptimisticCompleted(true);

    try {
      if (prefersReducedMotion) {
        setShowStaticSparkle(true);
      }

      const cardEl = cardRef.current;
      const checkboxEl = checkboxRef.current;
      const cardRect = cardEl?.getBoundingClientRect();

      if (!prefersReducedMotion) {
        await controls.start({
          scale: 0.98,
          transition: { duration: 0.08, ease: [0.42, 0, 1, 1] },
        });
      }

      setShowShimmer(!prefersReducedMotion);
      onComplete?.(id);

      if (!prefersReducedMotion && cardEl && cardRect) {
        const checkboxRect = checkboxEl?.getBoundingClientRect();
        const originRect = checkboxRect ?? cardRect;
        void particleBurst({
          container: cardEl,
          origin: {
            x: originRect.left + originRect.width / 2,
            y: originRect.top + originRect.height / 2,
          },
          palette: PARTICLE_COLORS,
          reducedMotion: prefersReducedMotion,
        });

        await controls.start({
          scale: 1.04,
          transition: { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
        });
        await controls.start({
          scale: 1,
          transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
        });
      }
    } finally {
      setIsCompleting(false);
    }
  }, [
    controls,
    id,
    isCompleted,
    isInteractionLocked,
    prefersReducedMotion,
    onComplete,
  ]);

  const handleUndo = useCallback(() => {
    if (!isCompleted || disabled) return;

    setOptimisticCompleted(false);
    setShowStaticSparkle(false);
    setShowShimmer(false);
    setShowUndo(false);

    if (!prefersReducedMotion) {
      void controls
        .start({
          scale: 0.94,
          rotate: -3,
          transition: { duration: 0.12, ease: [0.4, 0, 1, 1] },
        })
        .then(() =>
          controls.start({
            scale: 1,
            rotate: 0,
            transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
          })
        );
    }

    onUndo?.(id);
  }, [controls, disabled, id, isCompleted, onUndo, prefersReducedMotion]);

  const handleCheckboxChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (event.target.checked) {
        void runCompletionSequence();
      } else {
        handleUndo();
      }
    },
    [handleUndo, runCompletionSequence]
  );

  const baseCardClasses = cn(
    "relative isolate flex w-full items-center gap-3 overflow-hidden rounded-xl border px-3 py-2 shadow-[0_14px_32px_rgba(11,24,18,0.38)] transition-colors duration-200",
    "focus-within:ring-1 focus-within:ring-emerald-400/60",
    isCompleted
      ? "border-[#1a6b52]/60 bg-gradient-to-br from-[#0e3b2e] to-[#1a6b52] text-[#E6F4EF]"
      : "border-white/10 bg-zinc-900/70 text-white hover:border-emerald-400/40",
    disabled ? "opacity-70" : "",
    className
  );

  const timeClass = cn(
    "text-xs",
    isCompleted ? "text-[#E6F4EF]/80" : "text-zinc-300/70"
  );

  return (
    <motion.div
      ref={cardRef}
      data-testid="project-card"
      data-completed={isCompleted ? "true" : "false"}
      role="group"
      className={baseCardClasses}
      style={style}
      animate={controls}
      initial={false}
    >
      <label
        className={cn(
          "relative flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border transition-colors",
          isCompleted
            ? "border-[#E6F4EF]/40 bg-emerald-400/20"
            : "border-emerald-400/30 bg-black/40",
          disabled
            ? "cursor-not-allowed"
            : "cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-emerald-300/80"
        )}
      >
        <input
          ref={checkboxRef}
          type="checkbox"
          className="peer sr-only"
          aria-label={`Mark ${title} complete`}
          checked={isCompleted}
          onChange={handleCheckboxChange}
          disabled={isInteractionLocked}
        />
        <motion.span
          className="pointer-events-none absolute inset-0 rounded-md"
          initial={false}
          animate={{
            backgroundColor: isCompleted ? "rgba(34,197,94,0.35)" : "rgba(12,24,20,0.65)",
          }}
          transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
        />
        <motion.span
          className="pointer-events-none text-[#E6F4EF]"
          initial={false}
          animate={{ scale: isCompleted ? [0.6, 1.05, 1] : 0.8, opacity: isCompleted ? 1 : 0 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        >
          <Check className="h-4 w-4" strokeWidth={2.5} />
        </motion.span>
      </label>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">{title}</p>
        {timeRange ? <p className={timeClass}>{timeRange}</p> : null}
      </div>

      {showStaticSparkle && (
        <Sparkles
          aria-hidden
          className="h-4 w-4 flex-shrink-0 text-[#E6F4EF]/80"
        />
      )}

      {showUndo && (
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            handleUndo();
          }}
          className="flex items-center gap-1 rounded-full bg-black/30 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-100/90 shadow-inner shadow-emerald-500/20 transition-opacity hover:opacity-100"
        >
          <Undo2 className="h-3 w-3" />
          Undo
        </button>
      )}

      {showShimmer && !prefersReducedMotion ? (
        <Shimmer onComplete={() => setShowShimmer(false)} />
      ) : null}
    </motion.div>
  );
}

export default ProjectCard;
