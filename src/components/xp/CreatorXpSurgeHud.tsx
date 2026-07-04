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
import { playUiSound } from "@/lib/audio/uiSounds";
import { hapticLevelUp } from "@/lib/haptics/creatorHaptics";

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
const CREATOR_XP_LEVEL_BREAK_FILL_DURATION_MS = 1180;
const CREATOR_XP_HEX_IGNITION_DURATION_MS = 720;
const CREATOR_XP_LEVEL_BREAK_HOLD_MS = 150;
const CREATOR_XP_LEVEL_BREAK_OVERLOAD_MS = 430;
const CREATOR_XP_LEVEL_BREAK_ROLLOVER_MS = 390;
const CREATOR_XP_HEX_ACTIVE_COLOR = "rgb(74, 222, 128)";
const CREATOR_XP_HEX_OVERLOAD_COLOR = "rgb(245, 247, 250)";
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
  const progressTarget = isLevelBreak
    ? 100
    : progressTo < progressFrom
      ? 100
      : progressTo;
  const hasGain =
    progressTarget - progressFrom > CREATOR_XP_HEX_GAIN_EPSILON;
  const initialProgress = prefersReducedMotion ? progressTarget : progressFrom;
  const [animatedProgress, setAnimatedProgress] = useState(initialProgress);
  const [overloadActive, setOverloadActive] = useState(false);
  const [hasRolledOver, setHasRolledOver] = useState(false);
  const [displayLevel, setDisplayLevel] = useState(level);
  const levelBreakFeedbackFiredRef = useRef<number | null>(null);
  const rolloverTarget =
    typeof surge.levelBreak?.progressRolloverTo === "number" &&
    Number.isFinite(surge.levelBreak.progressRolloverTo)
      ? Math.min(Math.max(surge.levelBreak.progressRolloverTo, 0), 100)
      : 0;
  const hasRolloverProgress = rolloverTarget > 0;
  const burnHeadPoint = resolveCreatorXpHexPoint(animatedProgress);
  const baseProgress =
    hasRolledOver || (prefersReducedMotion && isLevelBreak)
      ? animatedProgress
      : prefersReducedMotion
        ? progressTarget
        : progressFrom;
  const baseProgressStrokeOffset = 100 - baseProgress;
  const animatedGainLength = Math.min(
    Math.max(animatedProgress - progressFrom, 0),
    100 - progressFrom
  );
  const showAnimatedGain =
    !prefersReducedMotion &&
    !hasRolledOver &&
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
  const fillDurationMs = isLevelBreak
    ? CREATOR_XP_LEVEL_BREAK_FILL_DURATION_MS
    : CREATOR_XP_HEX_FILL_DURATION_MS;
  const levelBreakNewLevel =
    typeof surge.levelBreak?.newLevel === "number" &&
    Number.isFinite(surge.levelBreak.newLevel)
      ? surge.levelBreak.newLevel
      : level;
  const levelBreakOldLevel =
    typeof surge.levelBreak?.oldLevel === "number" &&
    Number.isFinite(surge.levelBreak.oldLevel)
      ? surge.levelBreak.oldLevel
      : level;
  const fireLevelBreakFeedback = useCallback(() => {
    if (!isLevelBreak || levelBreakFeedbackFiredRef.current === surge.id) {
      return;
    }

    levelBreakFeedbackFiredRef.current = surge.id;
    void hapticLevelUp();
    void playUiSound("taskComplete", { volume: 0.72 });
  }, [isLevelBreak, surge.id]);

  useEffect(() => {
    setOverloadActive(false);
    setHasRolledOver(false);
    setDisplayLevel(isLevelBreak ? levelBreakOldLevel : level);

    if (prefersReducedMotion) {
      setAnimatedProgress(isLevelBreak ? rolloverTarget : progressTarget);
      setHasRolledOver(isLevelBreak);
      setDisplayLevel(isLevelBreak ? levelBreakNewLevel : level);
      fireLevelBreakFeedback();
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
    let overloadStartTimeout = 0;
    let overloadEndTimeout = 0;
    let levelLockTimeout = 0;
    let rolloverTimeout = 0;
    let rolloverFrame = 0;
    const timeout = window.setTimeout(() => {
      frame = window.requestAnimationFrame(function animate(timestamp) {
        startTime ??= timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / fillDurationMs, 1);
        const easedProgress = easeCreatorXpHexFill(progress);
        setAnimatedProgress(
          progressFrom + (progressTarget - progressFrom) * easedProgress
        );

        if (progress < 1) {
          frame = window.requestAnimationFrame(animate);
          return;
        }

        if (!isLevelBreak) return;

        overloadStartTimeout = window.setTimeout(() => {
          setOverloadActive(true);
          setDisplayLevel(levelBreakNewLevel);
          fireLevelBreakFeedback();
        }, CREATOR_XP_LEVEL_BREAK_HOLD_MS);
        overloadEndTimeout = window.setTimeout(() => {
          setOverloadActive(false);
        }, CREATOR_XP_LEVEL_BREAK_HOLD_MS + CREATOR_XP_LEVEL_BREAK_OVERLOAD_MS);
        levelLockTimeout = window.setTimeout(() => {
          setDisplayLevel(levelBreakNewLevel);
        }, CREATOR_XP_LEVEL_BREAK_HOLD_MS + CREATOR_XP_LEVEL_BREAK_OVERLOAD_MS);

        rolloverTimeout = window.setTimeout(() => {
          setHasRolledOver(true);
          setAnimatedProgress(0);

          if (!hasRolloverProgress) {
            return;
          }

          rolloverFrame = window.requestAnimationFrame(() => {
            let rolloverStartTime: number | null = null;
            rolloverFrame = window.requestAnimationFrame(function roll(
              rolloverTimestamp
            ) {
              rolloverStartTime ??= rolloverTimestamp;
              const rolloverElapsed = rolloverTimestamp - rolloverStartTime;
              const rolloverProgress = Math.min(
                rolloverElapsed / CREATOR_XP_LEVEL_BREAK_ROLLOVER_MS,
                1
              );
              const easedRollover = easeCreatorXpHexFill(rolloverProgress);
              setAnimatedProgress(rolloverTarget * easedRollover);

              if (rolloverProgress < 1) {
                rolloverFrame = window.requestAnimationFrame(roll);
                return;
              }

              setAnimatedProgress(rolloverTarget);
            });
          });
        }, CREATOR_XP_LEVEL_BREAK_HOLD_MS + CREATOR_XP_LEVEL_BREAK_OVERLOAD_MS);
      });
    }, fillDelayMs);

    return () => {
      window.clearTimeout(timeout);
      window.clearTimeout(overloadStartTimeout);
      window.clearTimeout(overloadEndTimeout);
      window.clearTimeout(levelLockTimeout);
      window.clearTimeout(rolloverTimeout);
      if (frame) window.cancelAnimationFrame(frame);
      if (rolloverFrame) window.cancelAnimationFrame(rolloverFrame);
    };
  }, [
    burnActive,
    hasGain,
    hasRolloverProgress,
    isLevelBreak,
    level,
    levelBreakNewLevel,
    levelBreakOldLevel,
    prefersReducedMotion,
    fillDurationMs,
    fireLevelBreakFeedback,
    progressFrom,
    progressTarget,
    rolloverTarget,
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
      className="relative size-[118px]"
      data-creator-xp-target="surge-hex"
    >
      {isLevelBreak ? (
        <motion.div
          className="absolute inset-[-10px] rounded-full bg-white/0 blur-xl"
          initial={false}
          animate={
            overloadActive && !prefersReducedMotion
              ? { opacity: [0, 0.36, 0], scale: [0.88, 1.08, 1] }
              : { opacity: 0, scale: 1 }
          }
          transition={{
            duration: CREATOR_XP_LEVEL_BREAK_OVERLOAD_MS / 1000,
            ease: [0.16, 1, 0.3, 1],
          }}
          aria-hidden="true"
        />
      ) : null}
      {isLevelBreak ? (
        <motion.div
          className="absolute inset-[-16px] rounded-full border border-white/35 shadow-[0_0_34px_rgba(255,255,255,0.18)]"
          initial={false}
          animate={
            overloadActive && !prefersReducedMotion
              ? { opacity: [0, 0.78, 0], scale: [0.82, 1.22, 1.34] }
              : { opacity: 0, scale: 0.9 }
          }
          transition={{
            duration: 0.38,
            ease: [0.16, 1, 0.3, 1],
          }}
          aria-hidden="true"
        />
      ) : null}
      <svg
        className="absolute inset-0 h-full w-full overflow-visible"
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        {showHexIgnition ? (
          <motion.g
            initial={{ opacity: 0, scale: 1 }}
            animate={{
              opacity: [0, 1, 0.34, 0],
              scale: [1, 1.012, 1.004, 1],
            }}
            transition={{
              delay: fillDelayMs / 1000,
              duration: CREATOR_XP_HEX_IGNITION_DURATION_MS / 1000,
              ease: [0.22, 1, 0.36, 1],
            }}
            style={{
              transformBox: "fill-box",
              transformOrigin: "center",
            }}
          >
            <motion.path
              d={CREATOR_XP_HEX_PATH}
              pathLength="100"
              fill="none"
              stroke={CREATOR_XP_HEX_ACTIVE_COLOR}
              strokeWidth="6.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="24 76"
              initial={{ strokeDashoffset: -progressFrom }}
              animate={{ strokeDashoffset: -progressFrom - 68 }}
              transition={{
                delay: fillDelayMs / 1000,
                duration: CREATOR_XP_HEX_IGNITION_DURATION_MS / 1000,
                ease: [0.22, 1, 0.36, 1],
              }}
              opacity={ignitionOpacityPeak}
            />
            <path
              d={CREATOR_XP_HEX_PATH}
              pathLength="100"
              fill="none"
              stroke={CREATOR_XP_HEX_ACTIVE_COLOR}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={isLevelBreak ? 0.2 : 0.16}
            />
          </motion.g>
        ) : null}
        <path
          d={CREATOR_XP_HEX_PATH}
          pathLength="100"
          fill="none"
          stroke="rgba(0, 0, 0, 0.42)"
          strokeWidth="7.2"
          strokeLinejoin="round"
        />
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
            opacity="0.28"
          />
        ) : null}
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
            opacity="0.26"
          />
        ) : null}
        {showBurnHead ? (
          <g>
            <circle
              cx={burnHeadPoint.x}
              cy={burnHeadPoint.y}
              r="2.6"
              fill={CREATOR_XP_HEX_ACTIVE_COLOR}
              opacity="0.38"
            />
            <circle
              cx={burnHeadPoint.x}
              cy={burnHeadPoint.y}
              r="1.15"
              fill={CREATOR_XP_HEX_ACTIVE_COLOR}
              opacity="0.82"
            />
          </g>
        ) : null}
        {isLevelBreak ? (
          <motion.g
            initial={false}
            animate={
              overloadActive && !prefersReducedMotion
                ? { opacity: [0, 1, 0.24, 0], scale: [0.96, 1.075, 1.01, 1] }
                : { opacity: 0, scale: 1 }
            }
            transition={{
              duration: CREATOR_XP_LEVEL_BREAK_OVERLOAD_MS / 1000,
              ease: [0.16, 1, 0.3, 1],
            }}
            style={{
              transformBox: "fill-box",
              transformOrigin: "center",
            }}
          >
            <path
              d={CREATOR_XP_HEX_PATH}
              pathLength="100"
              fill="rgba(255, 255, 255, 0.08)"
              stroke={CREATOR_XP_HEX_OVERLOAD_COLOR}
              strokeWidth="9.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.9"
            />
            <path
              d={CREATOR_XP_HEX_PATH}
              pathLength="100"
              fill="none"
              stroke="rgba(255, 255, 255, 0.72)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </motion.g>
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
          <div className="text-[32px] leading-none">
            {skillIcon}
          </div>
          {level != null ? (
            <motion.div
              initial={false}
              animate={
                overloadActive && !prefersReducedMotion
                  ? {
                      color: [
                        "rgb(255, 255, 255)",
                        "rgb(248, 250, 252)",
                        "rgb(255, 255, 255)",
                      ],
                      scale: [1, 1.24, 0.98, 1],
                    }
                  : { color: "rgb(255, 255, 255)", scale: 1 }
              }
              transition={{
                duration: CREATOR_XP_LEVEL_BREAK_OVERLOAD_MS / 1000,
                ease: [0.16, 1, 0.3, 1],
              }}
              className={`mt-1 text-[13px] font-extrabold leading-none text-white ${
                isLevelBreak
                  ? "drop-shadow-[0_0_12px_rgba(255,255,255,0.28)]"
                  : ""
              }`}
            >
              LVL {displayLevel}
            </motion.div>
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
    ...input,
    sourceType: builtPayload.sourceType,
    sourceIcon: input.sourceIcon ?? builtPayload.sourceIcon,
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

            {isLevelBreak ? (
              <motion.div
                initial={
                  prefersReducedMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: 2, scale: 0.98 }
                }
                animate={
                  prefersReducedMotion
                    ? { opacity: 1 }
                    : { opacity: 1, y: 0, scale: 1 }
                }
                transition={{
                  delay: prefersReducedMotion ? 0 : 1.42,
                  duration: 0.22,
                  ease: [0.22, 0.72, 0.24, 1],
                }}
                className="mt-1 rounded-full border border-white/15 bg-white/[0.08] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-white shadow-[0_0_18px_rgba(255,255,255,0.12)]"
              >
                LEVEL UP
              </motion.div>
            ) : null}

            <div className="mt-1 max-w-full text-[13px] font-semibold leading-tight text-white">
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
