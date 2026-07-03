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
import {
  dispatchCreatorXpBurstStatus,
  subscribeToCreatorXpBurstArrivals,
} from "@/lib/effects/creatorXpBurstBus";

export type CreatorXpSurgeSourceType =
  | "TASK"
  | "HABIT"
  | "PROJECT"
  | "GOAL"
  | "EVENT";

export type CreatorXpSurgePayload = {
  sourceType: CreatorXpSurgeSourceType;
  title: string;
  sourceIcon?: string | null;
  displayXp?: number | null;
  currentLevel?: number | null;
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

export const CREATOR_XP_SURGE_DISPLAY_XP_BY_SOURCE_TYPE = {
  TASK: 1,
  HABIT: 1,
  PROJECT: 3,
  GOAL: 5,
  EVENT: 1,
} as const satisfies Record<CreatorXpSurgeSourceType, number>;

export type CreatorXpSurgeBuildInput = CreatorXpSurgeTitleParts & {
  sourceType?: string | null;
  sourceIcon?: string | null;
  currentLevel?: number | null;
};

export type ScheduledEventCreatorXpSurgeInput = CreatorXpSurgeBuildInput & {
  scheduleInstanceId?: string | null;
  completedAt?: string | null;
  topOffsetPx?: number | null;
} & Partial<
    Pick<
      CreatorXpSurgePayload,
      | "title"
      | "displayXp"
      | "currentLevel"
      | "progressFrom"
      | "progressTo"
      | "levelBreak"
    >
  >;

type CreatorXpSurgeHudData = CreatorXpSurgePayload & {
  id: number;
  progressFrom: number;
  progressTo: number;
};

type CreatorXpSurgeListener = (payload: CreatorXpSurgePayload) => void;

const DEFAULT_TOP_OFFSET_PX = 16;
const DEFAULT_PROGRESS_FROM = 24;
const DEFAULT_PROGRESS_TO = 72;
const SCHEDULED_EVENT_SURGE_DEDUPE_TTL_MS = 5 * 60 * 1000;
const CREATOR_XP_HEX_FILL_DURATION_MS = 1900;
const CREATOR_XP_HEX_IGNITION_DURATION_MS = 720;
const CREATOR_XP_HEX_ACTIVE_COLOR = "rgb(74, 222, 128)";
const CREATOR_XP_HEX_GAIN_EPSILON = 0.35;
const CREATOR_XP_HEX_POINTS = [
  { x: 50, y: 4 },
  { x: 91, y: 27 },
  { x: 91, y: 73 },
  { x: 50, y: 96 },
  { x: 9, y: 73 },
  { x: 9, y: 27 },
] as const;
const CREATOR_XP_HEX_PATH = "M50 4 L91 27 L91 73 L50 96 L9 73 L9 27 Z";

const listeners = new Set<CreatorXpSurgeListener>();
const recentScheduledEventSurgeKeys = new Map<string, number>();

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
    "Skill XP"
  );
}

function normalizeCreatorXpSurgeSourceType(
  sourceType?: string | null
): CreatorXpSurgeSourceType {
  const normalized = sourceType?.trim().toUpperCase();
  return normalized === "TASK" ||
    normalized === "HABIT" ||
    normalized === "PROJECT" ||
    normalized === "GOAL" ||
    normalized === "EVENT"
    ? normalized
    : "TASK";
}

export function buildCreatorXpSurgePayload({
  sourceType,
  sourceIcon,
  currentLevel,
  skillName,
  monumentTitle,
  sourceTitle,
}: CreatorXpSurgeBuildInput): CreatorXpSurgePayload {
  const normalizedSourceType = normalizeCreatorXpSurgeSourceType(sourceType);
  const normalizedLevel =
    typeof currentLevel === "number" && Number.isFinite(currentLevel)
      ? currentLevel
      : null;

  return {
    sourceType: normalizedSourceType,
    title: resolveCreatorXpSurgeTitle({
      skillName,
      monumentTitle,
      sourceTitle,
    }),
    sourceIcon: sourceIcon?.trim() || null,
    currentLevel: normalizedLevel,
    displayXp:
      CREATOR_XP_SURGE_DISPLAY_XP_BY_SOURCE_TYPE[normalizedSourceType] ?? null,
    progressFrom: normalizedSourceType === "PROJECT" ? 18 : 24,
    progressTo: normalizedSourceType === "PROJECT" ? 78 : 72,
    levelBreak: null,
  };
}

export function showCreatorXpSurge(payload: CreatorXpSurgePayload) {
  listeners.forEach((listener) => listener(payload));
}

function pruneScheduledEventSurgeKeys(now: number) {
  recentScheduledEventSurgeKeys.forEach((timestamp, key) => {
    if (now - timestamp > SCHEDULED_EVENT_SURGE_DEDUPE_TTL_MS) {
      recentScheduledEventSurgeKeys.delete(key);
    }
  });
}

function easeCreatorXpHexFill(t: number) {
  const clamped = Math.min(Math.max(t, 0), 1);
  const smooth = clamped * clamped * (3 - 2 * clamped);
  return Math.pow(smooth, 0.82);
}

function resolveCreatorXpHexPoint(progress: number) {
  const clampedProgress = Math.min(Math.max(progress, 0), 100);
  const points = CREATOR_XP_HEX_POINTS;
  const segmentLengths = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    return Math.hypot(next.x - point.x, next.y - point.y);
  });
  const perimeter = segmentLengths.reduce((total, length) => total + length, 0);
  let distance = (clampedProgress / 100) * perimeter;

  for (let index = 0; index < points.length; index += 1) {
    const segmentLength = segmentLengths[index];
    if (distance <= segmentLength || index === points.length - 1) {
      const start = points[index];
      const end = points[(index + 1) % points.length];
      const segmentProgress =
        segmentLength > 0 ? Math.min(Math.max(distance / segmentLength, 0), 1) : 0;
      return {
        x: start.x + (end.x - start.x) * segmentProgress,
        y: start.y + (end.y - start.y) * segmentProgress,
      };
    }
    distance -= segmentLength;
  }

  return points[0];
}

function CreatorXpHexBadge({
  surge,
  progressFrom,
  progressTo,
  isLevelBreak,
  prefersReducedMotion,
  skillIcon,
  level,
  burnActive,
}: {
  surge: CreatorXpSurgeHudData;
  progressFrom: number;
  progressTo: number;
  isLevelBreak: boolean;
  prefersReducedMotion: boolean | null;
  skillIcon: string;
  level: number | null;
  burnActive: boolean;
}) {
  const progressTarget = progressTo < progressFrom ? 100 : progressTo;
  const hasGain =
    progressTarget - progressFrom > CREATOR_XP_HEX_GAIN_EPSILON;
  const initialProgress = prefersReducedMotion ? progressTarget : progressFrom;
  const [animatedProgress, setAnimatedProgress] = useState(initialProgress);
  const burnHeadPoint = resolveCreatorXpHexPoint(animatedProgress);
  const baseProgress = prefersReducedMotion ? progressTarget : progressFrom;
  const baseProgressStrokeOffset = 100 - baseProgress;
  const animatedGainLength = Math.min(
    Math.max(animatedProgress - progressFrom, 0),
    100 - progressFrom
  );
  const showAnimatedGain =
    !prefersReducedMotion &&
    animatedGainLength > CREATOR_XP_HEX_GAIN_EPSILON;
  const showHexIgnition = !prefersReducedMotion && burnActive && hasGain;
  const showBurnHead = showAnimatedGain && animatedProgress > 0;
  const gainStrokeDasharray = `${animatedGainLength} 100`;
  const gainStrokeDashoffset = -progressFrom;
  const burnTailLength = Math.min(8, animatedGainLength);
  const burnTailDasharray = `${burnTailLength} 100`;
  const burnTailDashoffset = -Math.max(
    progressFrom,
    animatedProgress - burnTailLength
  );
  const ignitionOpacityPeak = isLevelBreak ? 0.18 : 0.14;
  const fillDelayMs = 90;

  useEffect(() => {
    if (prefersReducedMotion) {
      setAnimatedProgress(progressTarget);
      return;
    }
    if (!burnActive) {
      setAnimatedProgress(progressFrom);
      return;
    }
    if (!hasGain) {
      setAnimatedProgress(progressTarget);
      return;
    }

    let frame = 0;
    let startTime: number | null = null;
    const timeout = window.setTimeout(() => {
      frame = window.requestAnimationFrame(function animate(timestamp) {
        startTime ??= timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / CREATOR_XP_HEX_FILL_DURATION_MS, 1);
        const easedProgress = easeCreatorXpHexFill(progress);
        setAnimatedProgress(
          progressFrom + (progressTarget - progressFrom) * easedProgress
        );

        if (progress < 1) {
          frame = window.requestAnimationFrame(animate);
        }
      });
    }, fillDelayMs);

    return () => {
      window.clearTimeout(timeout);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [
    burnActive,
    hasGain,
    prefersReducedMotion,
    progressFrom,
    progressTarget,
    surge.id,
  ]);

  return (
    <motion.div
      initial={
        prefersReducedMotion
          ? { opacity: 0 }
          : { opacity: 0, scale: 0.92 }
      }
      animate={
        prefersReducedMotion
          ? { opacity: 1 }
          : { opacity: 1, scale: 1 }
      }
      transition={{ duration: 0.24, ease: [0.22, 0.72, 0.24, 1] }}
      className="relative size-[118px] drop-shadow-[0_18px_34px_rgba(0,0,0,0.58)]"
      data-creator-xp-target="surge-hex"
    >
      <div
        className="absolute inset-[8px] bg-[#050609]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.13),inset_0_-14px_30px_rgba(0,0,0,0.7),inset_0_10px_26px_rgba(255,255,255,0.045)] backdrop-blur-xl"
        style={{
          clipPath:
            "polygon(50% 3%, 91% 26.5%, 91% 73.5%, 50% 97%, 9% 73.5%, 9% 26.5%)",
        }}
      />
      <div
        className="absolute inset-[8px] bg-gradient-to-b from-white/[0.12] via-transparent to-emerald-950/30"
        style={{
          clipPath:
            "polygon(50% 3%, 91% 26.5%, 91% 73.5%, 50% 97%, 9% 73.5%, 9% 26.5%)",
        }}
      />

      <svg
        className="absolute inset-0 h-full w-full overflow-visible"
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        <defs>
          <filter
            id={`creator-xp-hex-glow-${surge.id}`}
            x="-35%"
            y="-35%"
            width="170%"
            height="170%"
          >
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter
            id={`creator-xp-hex-burn-${surge.id}`}
            x="-80%"
            y="-80%"
            width="260%"
            height="260%"
          >
            <feGaussianBlur stdDeviation="2.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter
            id={`creator-xp-hex-ignition-${surge.id}`}
            x="-45%"
            y="-45%"
            width="190%"
            height="190%"
          >
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {showHexIgnition ? (
          <motion.path
            d={CREATOR_XP_HEX_PATH}
            pathLength="100"
            fill="none"
            stroke={CREATOR_XP_HEX_ACTIVE_COLOR}
            strokeWidth="4.8"
            strokeLinejoin="round"
            filter={`url(#creator-xp-hex-ignition-${surge.id})`}
            initial={{ opacity: 0 }}
            animate={{
              opacity: [0, ignitionOpacityPeak, 0.08, 0],
              strokeWidth: [4.8, 7.4, 5.8, 4.8],
            }}
            transition={{
              delay: fillDelayMs / 1000,
              duration: CREATOR_XP_HEX_IGNITION_DURATION_MS / 1000,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
        ) : null}
        <path
          d={CREATOR_XP_HEX_PATH}
          pathLength="100"
          fill="rgba(9, 9, 11, 0.66)"
          stroke="rgba(113, 113, 122, 0.22)"
          strokeWidth="4.2"
          strokeLinejoin="round"
        />
        <path
          d={CREATOR_XP_HEX_PATH}
          pathLength="100"
          fill="none"
          stroke="rgba(34, 197, 94, 0.22)"
          strokeWidth="6.2"
          strokeLinejoin="round"
        />
        <path
          d={CREATOR_XP_HEX_PATH}
          pathLength="100"
          fill="none"
          stroke={CREATOR_XP_HEX_ACTIVE_COLOR}
          strokeWidth="4.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="100"
          strokeDashoffset={baseProgressStrokeOffset}
          opacity="0.72"
        />
        {showAnimatedGain ? (
          <path
            d={CREATOR_XP_HEX_PATH}
            pathLength="100"
            fill="none"
            stroke={CREATOR_XP_HEX_ACTIVE_COLOR}
            strokeWidth="4.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={gainStrokeDasharray}
            strokeDashoffset={gainStrokeDashoffset}
            filter={`url(#creator-xp-hex-glow-${surge.id})`}
            opacity="0.96"
          />
        ) : null}
        {showAnimatedGain ? (
          <path
            d={CREATOR_XP_HEX_PATH}
            pathLength="100"
            fill="none"
            stroke={CREATOR_XP_HEX_ACTIVE_COLOR}
            strokeWidth="6.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={burnTailDasharray}
            strokeDashoffset={burnTailDashoffset}
            filter={`url(#creator-xp-hex-burn-${surge.id})`}
            opacity="0.48"
          />
        ) : null}
        {showBurnHead ? (
          <g filter={`url(#creator-xp-hex-burn-${surge.id})`}>
            <circle
              cx={burnHeadPoint.x}
              cy={burnHeadPoint.y}
              r="3.1"
              fill={CREATOR_XP_HEX_ACTIVE_COLOR}
              opacity="0.72"
            />
            <circle
              cx={burnHeadPoint.x}
              cy={burnHeadPoint.y}
              r="1.35"
              fill={CREATOR_XP_HEX_ACTIVE_COLOR}
              opacity="0.92"
            />
          </g>
        ) : null}
        <path
          d={CREATOR_XP_HEX_PATH}
          fill="none"
          stroke="rgba(255, 255, 255, 0.12)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>

      <div className="absolute inset-0 grid place-items-center px-6">
        <div className="min-w-0 translate-y-0.5">
          <div className="text-[32px] leading-none drop-shadow-[0_2px_10px_rgba(0,0,0,0.72)]">
            {skillIcon}
          </div>
          {level != null ? (
            <div className="mt-1 text-[13px] font-extrabold leading-none text-white">
              LVL {level}
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

export function showScheduledEventCreatorXpSurge({
  scheduleInstanceId,
  completedAt,
  topOffsetPx,
  ...input
}: ScheduledEventCreatorXpSurgeInput) {
  const instanceId = scheduleInstanceId?.trim();
  if (instanceId) {
    const dedupeKey = `${instanceId}:${completedAt?.trim() || "completed"}`;
    const now = Date.now();
    pruneScheduledEventSurgeKeys(now);
    if (recentScheduledEventSurgeKeys.has(dedupeKey)) return;
    recentScheduledEventSurgeKeys.set(dedupeKey, now);
  }

  const builtPayload = buildCreatorXpSurgePayload(input);

  showCreatorXpSurge({
    ...builtPayload,
    title: input.title?.trim() || builtPayload.title,
    displayXp: input.displayXp ?? builtPayload.displayXp,
    currentLevel: input.currentLevel ?? builtPayload.currentLevel,
    progressFrom: input.progressFrom ?? builtPayload.progressFrom,
    progressTo: input.progressTo ?? builtPayload.progressTo,
    levelBreak: input.levelBreak ?? builtPayload.levelBreak,
    topOffsetPx,
  });
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
  const [burnActive, setBurnActive] = useState(false);
  const surgeId = surge?.id ?? null;

  useEffect(() => {
    if (!surge) return;
    const timeout = window.setTimeout(
      () => onDismiss(surge.id),
      surge.levelBreak ? 3400 : 3200
    );
    return () => window.clearTimeout(timeout);
  }, [onDismiss, surge]);

  useEffect(() => {
    if (surgeId === null) {
      setBurnActive(false);
      return;
    }
    if (prefersReducedMotion) {
      setBurnActive(true);
      return;
    }

    setBurnActive(false);
    let hasIgnited = false;
    const ignite = () => {
      if (hasIgnited) return;
      hasIgnited = true;
      setBurnActive(true);
      dispatchCreatorXpBurstStatus("XP: border ignite");
    };
    const fallback = window.setTimeout(ignite, 820);
    const unsubscribe = subscribeToCreatorXpBurstArrivals(() => {
      window.clearTimeout(fallback);
      ignite();
    });

    return () => {
      window.clearTimeout(fallback);
      unsubscribe();
    };
  }, [prefersReducedMotion, surgeId]);

  const progressFrom = Math.min(Math.max(surge?.progressFrom ?? 0, 0), 100);
  const progressTo = Math.min(Math.max(surge?.progressTo ?? 0, 0), 100);
  const isLevelBreak = Boolean(surge?.levelBreak);
  const level =
    surge?.currentLevel ??
    surge?.levelBreak?.newLevel ?? surge?.levelBreak?.oldLevel ?? null;
  const showXpBadge = typeof surge?.displayXp === "number" && surge.displayXp > 0;
  const hasExplicitTopOffset =
    typeof surge?.topOffsetPx === "number" && Number.isFinite(surge.topOffsetPx);
  const topOffsetPx = hasExplicitTopOffset
    ? Math.max(0, surge.topOffsetPx ?? 0)
    : DEFAULT_TOP_OFFSET_PX;
  const topStyle = hasExplicitTopOffset
    ? `${topOffsetPx}px`
    : `calc(env(safe-area-inset-top, 0px) + ${topOffsetPx}px)`;
  const skillIcon = surge?.sourceIcon?.trim() || "✦";
  const skillName = surge?.title?.trim() || "Skill XP";

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
            className="flex w-full max-w-[min(84vw,210px)] flex-col items-center text-center text-white"
          >
            <CreatorXpHexBadge
              key={surge.id}
              surge={surge}
              progressFrom={progressFrom}
              progressTo={progressTo}
              isLevelBreak={isLevelBreak}
              prefersReducedMotion={prefersReducedMotion}
              skillIcon={skillIcon}
              level={level}
              burnActive={burnActive}
            />

            <div className="mt-1 max-w-full rounded-full bg-black/20 px-3 py-1 text-[13px] font-semibold leading-tight text-white shadow-[0_10px_24px_rgba(0,0,0,0.28)] backdrop-blur-md">
              <div className="truncate">{skillName}</div>
              {showXpBadge ? (
                <div className="mt-0.5 text-[11px] font-bold leading-none text-emerald-300">
                  +{surge.displayXp} XP
                </div>
              ) : null}
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
