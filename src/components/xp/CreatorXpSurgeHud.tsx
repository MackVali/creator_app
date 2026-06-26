"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";

export type CreatorXpSurgeSourceType = "TASK" | "HABIT" | "PROJECT" | "GOAL";

export type CreatorXpSurgePayload = {
  sourceType: CreatorXpSurgeSourceType;
  title: string;
  sourceIcon?: string | null;
  displayXp?: number | null;
  progressFrom?: number;
  progressTo?: number;
  topOffsetPx?: number | null;
  levelBreak?: {
    oldLevel?: number | null;
    newLevel?: number | null;
    progressRolloverTo?: number | null;
  } | null;
};

export type CreatorXpSurgeTitleParts = {
  skillName?: string | null;
  monumentTitle?: string | null;
  sourceTitle?: string | null;
};

type CreatorXpSurgeHudData = CreatorXpSurgePayload & {
  id: number;
  progressFrom: number;
  progressTo: number;
};

type CreatorXpSurgeListener = (payload: CreatorXpSurgePayload) => void;

const DEFAULT_TOP_OFFSET_PX = 16;
const DEFAULT_PROGRESS_FROM = 24;
const DEFAULT_PROGRESS_TO = 72;

const listeners = new Set<CreatorXpSurgeListener>();

function subscribeToCreatorXpSurges(listener: CreatorXpSurgeListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resolveCreatorXpSurgeTitle({
  skillName,
  monumentTitle,
  sourceTitle,
}: CreatorXpSurgeTitleParts) {
  const clean = (value?: string | null) => {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : null;
  };

  return (
    clean(skillName) ??
    clean(monumentTitle) ??
    clean(sourceTitle) ??
    "Progress gained"
  );
}

export function showCreatorXpSurge(payload: CreatorXpSurgePayload) {
  listeners.forEach((listener) => listener(payload));
}

const CreatorXpSurgeContext = createContext<{
  showCreatorXpSurge: (payload: CreatorXpSurgePayload) => void;
} | null>(null);

function CreatorXpSurgeHud({
  surge,
  onDismiss,
}: {
  surge: CreatorXpSurgeHudData | null;
  onDismiss: (id: number) => void;
}) {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!surge) return;
    const timeout = window.setTimeout(
      () => onDismiss(surge.id),
      surge.levelBreak ? 1800 : 1550
    );
    return () => window.clearTimeout(timeout);
  }, [onDismiss, surge]);

  const progressFrom = Math.min(Math.max(surge?.progressFrom ?? 0, 0), 100);
  const progressTo = Math.min(Math.max(surge?.progressTo ?? 0, 0), 100);
  const isLevelBreak = Boolean(surge?.levelBreak);
  const fillDuration = isLevelBreak ? 0.62 : 0.52;
  const fillDelay = 0.06;
  const levelLabel =
    surge?.levelBreak?.oldLevel != null && surge.levelBreak.newLevel != null
      ? `${surge.levelBreak.oldLevel} -> ${surge.levelBreak.newLevel}`
      : null;
  const showXpBadge = typeof surge?.displayXp === "number" && surge.displayXp > 0;
  const hasExplicitTopOffset =
    typeof surge?.topOffsetPx === "number" && Number.isFinite(surge.topOffsetPx);
  const topOffsetPx = hasExplicitTopOffset
    ? Math.max(0, surge.topOffsetPx ?? 0)
    : DEFAULT_TOP_OFFSET_PX;
  const topStyle = hasExplicitTopOffset
    ? `${topOffsetPx}px`
    : `calc(env(safe-area-inset-top, 0px) + ${topOffsetPx}px)`;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[2147483638] flex justify-center px-3"
      style={{ top: topStyle }}
      aria-live="polite"
      aria-atomic="true"
    >
      <AnimatePresence mode="wait">
        {surge ? (
          <motion.div
            key={surge.id}
            initial={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: -10, scale: 0.985 }
            }
            animate={
              prefersReducedMotion
                ? { opacity: 1 }
                : { opacity: 1, y: 0, scale: 1 }
            }
            exit={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: -8, scale: 0.99 }
            }
            transition={{ duration: 0.18, ease: [0.22, 0.72, 0.24, 1] }}
            className={clsx(
              "w-full max-w-[min(92vw,390px)] overflow-hidden rounded-xl border bg-[#07080b]/92 text-white shadow-[0_16px_38px_rgba(0,0,0,0.54),inset_0_1px_0_rgba(255,255,255,0.075)] backdrop-blur-xl",
              isLevelBreak
                ? "border-emerald-300/28 ring-1 ring-emerald-300/10"
                : "border-white/10"
            )}
          >
            <div className="relative px-3 py-2">
              <div className="flex items-center gap-2.5">
                <div className="relative grid size-8 shrink-0 place-items-center rounded-full border border-white/10 bg-black/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  {!prefersReducedMotion ? (
                    <motion.span
                      className={clsx(
                        "absolute inset-0 rounded-full border",
                        isLevelBreak
                          ? "border-emerald-300/35"
                          : "border-white/16"
                      )}
                      animate={{
                        scale: isLevelBreak ? [1, 1.34, 1.08] : [1, 1.18, 1],
                        opacity: isLevelBreak ? [0.8, 0, 0] : [0.45, 0, 0],
                      }}
                      transition={{
                        duration: isLevelBreak ? 0.72 : 0.9,
                        ease: [0.22, 0.72, 0.24, 1],
                      }}
                    />
                  ) : null}
                  <span className="text-sm leading-none text-white/90">
                    {surge.sourceIcon ?? "XP"}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold text-white/92">
                        {surge.title}
                      </div>
                    </div>
                    {showXpBadge ? (
                      <div className="shrink-0 rounded-full border border-white/[0.12] bg-white/[0.06] px-2 py-0.5 text-right leading-tight shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                        <div className="text-[12px] font-semibold text-white">
                          +{surge.displayXp} XP
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {isLevelBreak && levelLabel ? (
                    <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100/75">
                      LV {levelLabel}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-2 h-[11px] overflow-hidden rounded-full border border-white/[0.08] bg-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.45),inset_0_2px_5px_rgba(0,0,0,0.62)]">
                <motion.div
                  className="progress-bar-glint relative h-full overflow-hidden rounded-full border border-white/[0.14] bg-gradient-to-r from-white/55 via-zinc-200/75 to-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-1px_0_rgba(0,0,0,0.22)]"
                  initial={{
                    width: `${prefersReducedMotion ? progressTo : progressFrom}%`,
                  }}
                  animate={{ width: `${progressTo}%` }}
                  transition={
                    prefersReducedMotion
                      ? { duration: 0 }
                      : {
                          delay: fillDelay,
                          duration: fillDuration,
                          ease: [0.16, 0.92, 0.22, 1],
                        }
                  }
                >
                  <span
                    className="progress-bar-glint-sweep level-progress-bar-glint-sweep"
                    aria-hidden="true"
                  />
                  <div className="pointer-events-none absolute inset-x-1 top-[1px] z-[4] h-px rounded-full bg-white/35" />
                  <div className="absolute inset-y-0 right-0 z-[5] w-1.5 rounded-full bg-emerald-200/80 shadow-[0_0_8px_rgba(110,231,183,0.42)]" />
                  {!prefersReducedMotion ? (
                    <>
                      <motion.div
                        className="absolute inset-y-[-3px] z-[6] w-10 bg-gradient-to-r from-transparent via-white/55 to-transparent"
                        initial={{ left: "-18%", opacity: 0 }}
                        animate={{ left: "100%", opacity: [0, 0.34, 0] }}
                        transition={{
                          delay: fillDelay + 0.03,
                          duration: fillDuration * 0.82,
                          ease: [0.2, 0.86, 0.22, 1],
                        }}
                      />
                      <motion.div
                        className="absolute -right-1 top-1/2 z-[7] h-4 w-4 -translate-y-1/2 rounded-full bg-emerald-200 shadow-[0_0_14px_rgba(110,231,183,0.58),0_0_5px_rgba(255,255,255,0.82)]"
                        initial={{ opacity: 0, scale: 0.62 }}
                        animate={{
                          opacity: [0, 0.9, 0.72],
                          scale: [0.62, 1.12, 0.88],
                        }}
                        transition={{
                          delay: fillDelay + 0.05,
                          duration: fillDuration,
                          ease: [0.18, 0.78, 0.2, 1],
                        }}
                      />
                      <motion.div
                        className="absolute -right-2 top-1/2 z-[6] h-6 w-6 -translate-y-1/2 rounded-full border border-emerald-200/52"
                        initial={{ opacity: 0, scale: 0.58 }}
                        animate={{
                          opacity: [0, 0, 0.46, 0],
                          scale: [0.58, 0.58, 1.06, 1.58],
                        }}
                        transition={{
                          delay: fillDelay + fillDuration - 0.04,
                          duration: 0.34,
                          ease: [0.16, 0.92, 0.22, 1],
                        }}
                      />
                    </>
                  ) : null}
                </motion.div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function CreatorXpSurgeProvider({ children }: { children: ReactNode }) {
  const sequenceRef = useRef(0);
  const [surge, setSurge] = useState<CreatorXpSurgeHudData | null>(null);

  const show = useCallback((payload: CreatorXpSurgePayload) => {
    sequenceRef.current += 1;
    setSurge({
      ...payload,
      id: sequenceRef.current,
      progressFrom: payload.progressFrom ?? DEFAULT_PROGRESS_FROM,
      progressTo: payload.progressTo ?? DEFAULT_PROGRESS_TO,
    });
  }, []);

  useEffect(() => subscribeToCreatorXpSurges(show), [show]);

  const dismiss = useCallback((id: number) => {
    setSurge((current) => (current?.id === id ? null : current));
  }, []);

  const value = useMemo(() => ({ showCreatorXpSurge: show }), [show]);

  return (
    <CreatorXpSurgeContext.Provider value={value}>
      {children}
      <CreatorXpSurgeHud surge={surge} onDismiss={dismiss} />
    </CreatorXpSurgeContext.Provider>
  );
}

export function useCreatorXpSurge() {
  const context = useContext(CreatorXpSurgeContext);
  if (!context) {
    return { showCreatorXpSurge };
  }
  return context;
}
