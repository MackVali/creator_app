"use client";

import * as React from "react";
import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  useId,
  type HTMLAttributes,
  type RefObject,
  type UIEvent,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  useMotionTemplate,
  useDragControls,
  animate,
  useReducedMotion,
  type PanInfo,
} from "framer-motion";
import {
  Check,
  Clock,
  Filter,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import FlameEmber, {
  type FlameEmberProps,
  type FlameLevel,
} from "@/components/FlameEmber";
import { EventModal } from "./EventModal";
import { NoteModal } from "./NoteModal";
import { ComingSoonModal } from "./ComingSoonModal";
import { PostModal } from "./PostModal";
import { cn } from "@/lib/utils";
import { DayTimeline } from "@/components/schedule/DayTimeline";
import {
  DayType24hPreview,
  type DayType24hPreviewBlock,
} from "@/components/schedule/DayType24hPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useSelectContext,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToastHelpers } from "./toast";
import { getSupabaseBrowser } from "@/lib/supabase";
import { getGoalsForUser, type Goal } from "@/lib/queries/goals";
import { getSkillsForUser, type Skill } from "@/lib/queries/skills";
import { getProjectsForUser, type Project } from "@/lib/queries/projects";
import { getMonumentsForUser, type Monument } from "@/lib/queries/monuments";
import { getCatsForUser } from "@/lib/data/cats";
import type { CatRow } from "@/lib/types/cat";
import { normalizeHabitType } from "@/lib/scheduler/habits";
import { useProjectedGlobalRank } from "@/lib/hooks/useProjectedGlobalRank";
import {
  HABIT_RECURRENCE_OPTIONS,
  HABIT_TYPE_OPTIONS,
} from "@/components/habits/habit-form-fields";
import { SCHEDULER_PRIORITY_LABELS } from "@/lib/types/ai";
import type {
  AiIntent,
  AiIntentResponse,
  AiScope,
  AiSchedulerOp,
  AiThreadPayload,
} from "@/lib/types/ai";

function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const [err, setErr] = React.useState<Error | null>(null);
  if (err) {
    return (
      <div className="mt-2 rounded-md border border-red-500/50 bg-red-500/10 p-2 text-xs">
        <div className="font-semibold">Render error:</div>
        <pre className="whitespace-pre-wrap break-words">
          {String(err?.message || err)}
        </pre>
      </div>
    );
  }
  return (
    <React.Suspense
      fallback={<div className="text-xs opacity-60">Loading…</div>}
    >
      <BoundarySetter onError={setErr}>{children}</BoundarySetter>
    </React.Suspense>
  );
}

function BoundarySetter({
  onError,
  children,
}: {
  onError: (e: Error) => void;
  children: React.ReactNode;
}) {
  try {
    return <>{children}</>;
  } catch (e: any) {
    onError(e);
    return null;
  }
}

function DebugPanel({
  expanded,
  selected,
}: {
  expanded: boolean;
  selected: string | null;
}) {
  return (
    <div className="pointer-events-none absolute right-2 top-2 rounded bg-black/50 px-2 py-1 text-[10px] leading-none">
      <span>expanded:</span> {String(expanded)}{" "}
      <span className="ml-2">selected:</span> {selected ?? "null"}
    </div>
  );
}

interface FabProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
  menuVariant?: "default" | "timeline";
  swipeUpToOpen?: boolean;
}

type FabSearchResult = {
  id: string;
  name: string;
  type: "PROJECT" | "HABIT";
  nextScheduledAt: string | null;
  scheduleInstanceId: string | null;
  durationMinutes: number | null;
  nextDueAt: string | null;
  completedAt: string | null;
  isCompleted: boolean;
  global_rank?: number | null;
  habitType?: string | null;
  goalId?: string | null;
  goalName?: string | null;
  energy?: string | null;
  skillId?: string | null;
  skill_id?: string | null;
  monumentId?: string | null;
  monument_id?: string | null;
  priority?: string | null;
  priority_label?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
  goalMonumentId?: string | null;
};
type OverlaySortMode =
  | "recent"
  | "alphabetical"
  | "priority"
  | "global_rank"
  | "scheduled";
type OverlayEventTypeFilter = "ALL" | "PROJECT" | "HABIT";
const OVERLAY_SORT_OPTIONS: { value: OverlaySortMode; label: string }[] = [
  { value: "recent", label: "Recently updated" },
  { value: "alphabetical", label: "Alphabetical" },
  { value: "priority", label: "Priority" },
  { value: "global_rank", label: "Global rank" },
  { value: "scheduled", label: "Scheduled order" },
];

type FabSearchCursor = {
  startUtc: string;
  sourceType: "PROJECT" | "HABIT";
  sourceId: string;
};

const FAB_PAGES = ["primary", "secondary", "nexus"] as const;

const FLAME_LEVELS: FlameLevel[] = [
  "NO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "ULTRA",
  "EXTREME",
];

const normalizeFlameLevel = (value?: string | null): FlameLevel => {
  const normalized = String(value ?? "MEDIUM")
    .trim()
    .toUpperCase();
  return FLAME_LEVELS.includes(normalized as FlameLevel)
    ? (normalized as FlameLevel)
    : "MEDIUM";
};

const AUTO_SCOPE_CREATION_KEYWORDS = ["goal", "project", "task"];
const AUTO_SCOPE_SCHEDULE_KEYWORDS = [
  "day type",
  "time block",
  "priority",
  "reschedule",
  "move",
];

type ScopeSelection = AiScope | "auto";

const SCOPE_OPTIONS: ScopeSelection[] = [
  "auto",
  "read_only",
  "draft_creation",
  "schedule_edit",
];

const SCOPE_LABELS: Record<ScopeSelection, string> = {
  auto: "AUTO",
  read_only: "Read only",
  draft_creation: "Draft creation",
  schedule_edit: "Schedule edit",
};

const QUICK_START_PROMPTS = [
  "What should I do right now?",
  "Help me create a goal",
  "Set my day type tomorrow to Workday",
  "Help me create a new day type",
  "Create a task for today",
  "Show my top priorities",
  "Plan my next 2 hours",
] as const;

const DRAFT_PROPOSAL_TYPES: AiIntent["type"][] = [
  "DRAFT_CREATE_GOAL",
  "DRAFT_CREATE_PROJECT",
  "DRAFT_CREATE_TASK",
];

const PROPOSAL_CARD_TYPES: AiIntent["type"][] = [
  ...DRAFT_PROPOSAL_TYPES,
  "DRAFT_SCHEDULER_INPUT_OPS",
];

type ProposalOverrides = {
  draft?: Record<string, string>;
  schedulerOps?: AiSchedulerOp[];
};

type AiThreadTextMessage = {
  id: string;
  role: "user" | "assistant";
  kind: "text";
  content: string;
  ts: number;
};

type AiThreadProposalMessage = {
  id: string;
  role: "assistant";
  kind: "proposal";
  ai: AiIntentResponse;
  overrides?: ProposalOverrides;
  ts: number;
};

type LocalAiThreadMessage = AiThreadTextMessage | AiThreadProposalMessage;

const isTextThreadMessage = (
  message: LocalAiThreadMessage,
): message is AiThreadTextMessage => message.kind === "text";

const createThreadMessageId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `msg-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

const buildInitialProposalFormValues = (
  draft?: Record<string, unknown>,
  overrides?: Record<string, string>,
  intentType?: AiIntent["type"],
) => {
  const keys = new Set<string>([
    ...Object.keys(draft ?? {}),
    ...Object.keys(overrides ?? {}),
  ]);
  const values: Record<string, string> = {};
  keys.forEach((key) => {
    if (overrides && overrides[key] !== undefined) {
      values[key] = overrides[key];
      return;
    }
    const baseValue = draft ? draft[key] : undefined;
    values[key] =
      baseValue === undefined || baseValue === null ? "" : String(baseValue);
  });
  if (intentType === "DRAFT_CREATE_GOAL") {
    values.monument_id ??= "";
    values.due_date ??= "";
  }
  if (intentType === "DRAFT_CREATE_PROJECT") {
    values.goal_id ??= "";
    values.skill_ids ??= "";
    values.stage ??= "";
  }
  return values;
};

const DEFAULT_OVERLAY_DURATION_MINUTES = 180;
const TIMELINE_TICK_INTERVAL_MINUTES = 15;
const MIN_OVERLAY_DURATION_MS = TIMELINE_TICK_INTERVAL_MINUTES * 60 * 1000;
const MAX_OVERLAY_DURATION_MS = 24 * 60 * 60 * 1000;
const OVERLAY_DRAG_SNAP_INTERVAL_MINUTES = 5;
const OVERLAY_PLACEMENT_DEFAULT_DURATION_MINUTES = 30;

type OverlayPlacement = {
  id: string;
  type: "PROJECT" | "HABIT";
  name: string;
  start: Date;
  end: Date;
  locked: true;
  habitType?: string | null;
  goalName?: string | null;
  energy?: string | null;
  sourceId: string;
};

const createOverlayPlacementId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `overlay-place-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

const roundToNearestMinutes = (date: Date, step = 5): Date => {
  const msStep = step * 60 * 1000;
  const rounded = Math.round(date.getTime() / msStep) * msStep;
  return new Date(rounded);
};

const formatTimeInputValue = (date: Date) =>
  `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;

const formatDurationLabel = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours > 0 && mins > 0) {
    return `${hours}h ${mins}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${mins}m`;
};

const formatTimelinePlacementRange = (start: Date, end: Date) => {
  try {
    const formatter = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${formatter.format(start)} – ${formatter.format(end)}`;
  } catch (error) {
    console.warn("Unable to format timeline placement range", error);
    const fallbackOptions: Intl.DateTimeFormatOptions = {
      hour: "numeric",
      minute: "2-digit",
    };
    return `${start.toLocaleTimeString(undefined, fallbackOptions)} – ${end.toLocaleTimeString(
      undefined,
      fallbackOptions,
    )}`;
  }
};

const overlayDateToMinutes = (date: Date, overlayStartTime: Date) =>
  Math.max(
    0,
    Math.round((date.getTime() - overlayStartTime.getTime()) / 60000),
  );

const overlayMinutesToDate = (minutes: number, overlayStartTime: Date) =>
  new Date(overlayStartTime.getTime() + minutes * 60000);

const snapMinutesToFive = (value: number) =>
  Math.round(value / OVERLAY_DRAG_SNAP_INTERVAL_MINUTES) *
  OVERLAY_DRAG_SNAP_INTERVAL_MINUTES;

const clampOverlayPlacementStart = (
  startMinutes: number,
  durationMinutes: number,
  totalWindowMinutes: number,
) => {
  const maxStart = Math.max(0, totalWindowMinutes - durationMinutes);
  return Math.min(maxStart, Math.max(0, startMinutes));
};

const sortOverlayPlacements = (placements: OverlayPlacement[]) =>
  [...placements].sort((a, b) => a.start.getTime() - b.start.getTime());

const isSyncOverlayPlacement = (placement: OverlayPlacement) =>
  placement.type === "HABIT" &&
  normalizeHabitType(placement.habitType) === "SYNC";

type OverlayLayoutDirection = "forward" | "backward" | "none";

type PlacementEntry = {
  id: string;
  start: number;
  duration: number;
  isSync: boolean;
  placement: OverlayPlacement;
};

type OccupiedChain = {
  start: number;
  end: number;
  obstacles: PlacementEntry[];
};

type ResolveOverlayLayoutParams = {
  placements: OverlayPlacement[];
  overlayStartTime: Date;
  overlayWindowMinutes: number;
  movingPlacementId: string;
  targetStartMinutes: number;
  rawTargetStartMinutes: number;
  durationMinutes: number;
  direction: OverlayLayoutDirection;
};

const resolveOverlayPlacementLayout = ({
  placements,
  overlayStartTime,
  overlayWindowMinutes,
  movingPlacementId,
  targetStartMinutes,
  rawTargetStartMinutes,
  durationMinutes,
  direction: _direction,
}: ResolveOverlayLayoutParams): OverlayPlacement[] => {
  const entries: PlacementEntry[] = placements.map((placement) => ({
    id: placement.id,
    start: overlayDateToMinutes(placement.start, overlayStartTime),
    duration: Math.max(1, overlayDateToMinutes(placement.end, placement.start)),
    isSync: isSyncOverlayPlacement(placement),
    placement,
  }));

  const clampStart = (entry: PlacementEntry, desired: number) => {
    const min = 0;
    const max = Math.max(0, overlayWindowMinutes - entry.duration);
    return Math.min(max, Math.max(min, desired));
  };

  const movingEntry = entries.find((entry) => entry.id === movingPlacementId);
  if (!movingEntry) {
    return placements;
  }

  movingEntry.duration = durationMinutes;

  const boundsMax = Math.max(0, overlayWindowMinutes - movingEntry.duration);
  const obstacles = entries.filter((entry) => entry.id !== movingPlacementId);
  const clampTarget = (value: number) => clampStart(movingEntry, value);
  const clampedTargetStart = clampTarget(targetStartMinutes);
  const actualMovementStart = clampedTargetStart;
  const atTopBoundary = clampedTargetStart === 0;
  const atBottomBoundary = clampedTargetStart === boundsMax;
  const pushingTop = atTopBoundary && rawTargetStartMinutes < 0;
  const pushingBottom = atBottomBoundary && rawTargetStartMinutes > boundsMax;
  const sortedObstaclesAsc = obstacles
    .slice()
    .sort((a, b) => a.start - b.start);
  const sortedObstaclesDesc = obstacles
    .slice()
    .sort((a, b) => b.start - a.start);
  const firstObstacle = sortedObstaclesAsc[0] ?? null;
  const lastObstacle = sortedObstaclesDesc[0] ?? null;
  const topGapAvailable = firstObstacle
    ? Math.max(0, firstObstacle.start)
    : overlayWindowMinutes;
  const bottomGapAvailable = lastObstacle
    ? Math.max(
        0,
        overlayWindowMinutes - (lastObstacle.start + lastObstacle.duration),
      )
    : overlayWindowMinutes;
  const shouldPushDown =
    atTopBoundary &&
    (pushingTop ||
      (firstObstacle !== null && movingEntry.duration > topGapAvailable));
  const shouldPushUp =
    atBottomBoundary &&
    (pushingBottom ||
      (lastObstacle !== null && movingEntry.duration > bottomGapAvailable));

  const clampMovingCandidate = (value: number) =>
    clampStart(movingEntry, value);
  const findNearestLegalStart = (
    desiredStart: number,
    opts?: { boundarySlotsOnly?: boolean },
  ) => {
    const gaps: { start: number; end: number }[] = [];
    let cursor = 0;
    for (const obstacle of sortedObstaclesAsc) {
      if (obstacle.start > cursor) {
        gaps.push({ start: cursor, end: obstacle.start });
      }
      cursor = Math.max(cursor, obstacle.start + obstacle.duration);
    }
    if (overlayWindowMinutes - cursor >= movingEntry.duration) {
      gaps.push({ start: cursor, end: overlayWindowMinutes });
    }

    if (gaps.length === 0) {
      return clampMovingCandidate(desiredStart);
    }

    const candidates: {
      start: number;
      distance: number;
      directionMatch: boolean;
    }[] = [];

    const evaluateCandidate = (
      gapMin: number,
      gapMax: number,
      baseValue: number,
    ) => {
      if (gapMax < gapMin) return;
      const snapped = snapMinutesToFive(baseValue);
      const bounded = Math.min(gapMax, Math.max(gapMin, snapped));
      const clamped = clampMovingCandidate(bounded);
      const distance = Math.abs(clamped - desiredStart);
      const directionMatch =
        _direction === "forward"
          ? clamped >= desiredStart
          : _direction === "backward"
            ? clamped <= desiredStart
            : true;
      candidates.push({ start: clamped, distance, directionMatch });
    };

    for (const gap of gaps) {
      const gapMin = gap.start;
      const gapMax = gap.end - movingEntry.duration;
      if (gapMax < gapMin) continue;
      if (opts?.boundarySlotsOnly) {
        evaluateCandidate(gapMin, gapMax, gapMin);
        evaluateCandidate(gapMin, gapMax, gapMax);
      } else {
        evaluateCandidate(
          gapMin,
          gapMax,
          Math.min(gapMax, Math.max(gapMin, desiredStart)),
        );
      }
    }

    if (candidates.length === 0) {
      return clampMovingCandidate(desiredStart);
    }

    let bestCandidate = candidates[0];
    for (const candidate of candidates.slice(1)) {
      if (candidate.distance < bestCandidate.distance) {
        bestCandidate = candidate;
        continue;
      }
      if (
        candidate.distance === bestCandidate.distance &&
        Number(candidate.directionMatch) > Number(bestCandidate.directionMatch)
      ) {
        bestCandidate = candidate;
      }
    }
    return bestCandidate.start;
  };

  const pushObstaclesDownward = () => {
    const ordered = obstacles.slice().sort((a, b) => a.start - b.start);
    let prevEnd = movingEntry.start + movingEntry.duration;
    for (const obstacle of ordered) {
      const desired = Math.max(prevEnd, obstacle.start);
      const clamped = clampStart(obstacle, desired);
      if (clamped !== obstacle.start) {
        obstacle.start = clamped;
      }
      prevEnd = obstacle.start + obstacle.duration;
    }
  };

  const pushObstaclesUpward = () => {
    const ordered = obstacles.slice().sort((a, b) => b.start - a.start);
    let prevStart = movingEntry.start;
    for (const obstacle of ordered) {
      const desired = Math.min(prevStart - obstacle.duration, obstacle.start);
      const clamped = clampStart(obstacle, desired);
      if (clamped !== obstacle.start) {
        obstacle.start = clamped;
      }
      prevStart = obstacle.start;
    }
  };

  const startFitsWithoutOverlap = (start: number) => {
    const end = start + movingEntry.duration;
    return !obstacles.some(
      (obstacle) =>
        start < obstacle.start + obstacle.duration && end > obstacle.start,
    );
  };

  const buildOccupiedChains = (): OccupiedChain[] => {
    const chains: OccupiedChain[] = [];
    for (const obstacle of sortedObstaclesAsc) {
      const obstacleEnd = obstacle.start + obstacle.duration;
      const lastChain = chains[chains.length - 1];
      if (lastChain && obstacle.start <= lastChain.end) {
        lastChain.end = Math.max(lastChain.end, obstacleEnd);
        lastChain.obstacles.push(obstacle);
      } else {
        chains.push({
          start: obstacle.start,
          end: obstacleEnd,
          obstacles: [obstacle],
        });
      }
    }
    return chains;
  };

  const occupiedChains = buildOccupiedChains();

  const findChainForMovement = (start: number) => {
    for (const chain of occupiedChains) {
      if (start < chain.end && start + movingEntry.duration > chain.start) {
        return chain;
      }
    }
    return null;
  };

  const selectSeamStartForChain = (
    chain: OccupiedChain,
    pointerStart: number,
  ) => {
    const candidates = Array.from(
      new Set(
        chain.obstacles.map((obstacle) =>
          clampMovingCandidate(snapMinutesToFive(obstacle.start)),
        ),
      ),
    ).sort((a, b) => a - b);
    if (candidates.length === 0) {
      return null;
    }
    const matchesDirection = (value: number) =>
      _direction === "forward"
        ? value >= pointerStart
        : _direction === "backward"
          ? value <= pointerStart
          : true;
    let best = candidates[0];
    let bestDistance = Math.abs(best - pointerStart);
    let bestDirectionMatch = matchesDirection(best);

    for (const candidate of candidates) {
      const distance = Math.abs(candidate - pointerStart);
      const directionMatch = matchesDirection(candidate);
      if (
        distance < bestDistance ||
        (distance === bestDistance &&
          Number(directionMatch) > Number(bestDirectionMatch))
      ) {
        best = candidate;
        bestDistance = distance;
        bestDirectionMatch = directionMatch;
      }
    }
    return best;
  };

  const tryMiddleInsertion = (targetStart: number) => {
    const insertionTargetStart = targetStart;
    const downstreamObstacles = sortedObstaclesAsc.filter(
      (obstacle) => obstacle.start + obstacle.duration > insertionTargetStart,
    );
    const obstacleStartBackup = new Map<string, number>();
    obstacles.forEach((obstacle) => {
      obstacleStartBackup.set(obstacle.id, obstacle.start);
    });
    const movingStartBackup = movingEntry.start;

    movingEntry.start = insertionTargetStart;
    let prevEnd = movingEntry.start + movingEntry.duration;
    let pushedDownstream = false;
    for (const obstacle of downstreamObstacles) {
      const desired = Math.max(prevEnd, obstacle.start);
      const clamped = clampStart(obstacle, desired);
      if (clamped !== obstacle.start) {
        obstacle.start = clamped;
        pushedDownstream = true;
      }
      prevEnd = obstacle.start + obstacle.duration;
    }

    const fitsInWindow = prevEnd <= overlayWindowMinutes;

    if (fitsInWindow) {
      return { success: true, pushedDownstream };
    }

    obstacles.forEach((obstacle) => {
      const original = obstacleStartBackup.get(obstacle.id);
      if (original !== undefined) {
        obstacle.start = original;
      }
    });
    movingEntry.start = movingStartBackup;
    return { success: false, pushedDownstream };
  };

  type PlacementLog = {
    mode: "direct-fit" | "seam-insert" | "fallback-gap";
    chosenStart: number;
    pushed: boolean;
  };
  let placementLog: PlacementLog | null = null;

  if (shouldPushDown) {
    movingEntry.start = 0;
    pushObstaclesDownward();
  } else if (shouldPushUp) {
    movingEntry.start = boundsMax;
    pushObstaclesUpward();
  } else {
    if (startFitsWithoutOverlap(actualMovementStart)) {
      movingEntry.start = actualMovementStart;
      placementLog = {
        mode: "direct-fit",
        chosenStart: movingEntry.start,
        pushed: false,
      };
    } else {
      const chain = findChainForMovement(actualMovementStart);
      if (chain) {
        const seamStart = selectSeamStartForChain(chain, actualMovementStart);
        if (seamStart !== null) {
          const insertionResult = tryMiddleInsertion(seamStart);
          if (insertionResult.success) {
            placementLog = {
              mode: "seam-insert",
              chosenStart: movingEntry.start,
              pushed: insertionResult.pushedDownstream,
            };
          }
        }
      }
      if (!placementLog) {
        movingEntry.start = findNearestLegalStart(actualMovementStart);
        placementLog = {
          mode: "fallback-gap",
          chosenStart: movingEntry.start,
          pushed: false,
        };
      }
    }
  }

  const hasOverlap = obstacles.some((obstacle) => {
    const movingEnd = movingEntry.start + movingEntry.duration;
    return (
      movingEntry.start < obstacle.start + obstacle.duration &&
      movingEnd > obstacle.start
    );
  });
  if (hasOverlap) {
    movingEntry.start = findNearestLegalStart(actualMovementStart, {
      boundarySlotsOnly: true,
    });
    placementLog = {
      mode: "fallback-gap",
      chosenStart: movingEntry.start,
      pushed: false,
    };
  }

  if (placementLog && process.env.NODE_ENV !== "production") {
    console.debug("[Fab] overlay drag resolve", movingPlacementId, {
      actualMovementStart,
      chosenStart: placementLog.chosenStart,
      mode: placementLog.mode,
      downstreamPush: placementLog.pushed,
    });
  }

  const startMap = new Map<string, number>();
  const durationMap = new Map<string, number>();
  entries.forEach((entry) => {
    const sanitized = clampStart(entry, entry.start);
    startMap.set(entry.id, sanitized);
    durationMap.set(entry.id, entry.duration);
  });

  return placements.map((placement) => {
    const startMinutes = startMap.get(placement.id);
    const duration = durationMap.get(placement.id);
    if (startMinutes === undefined || duration === undefined) {
      return placement;
    }
    return {
      ...placement,
      start: overlayMinutesToDate(startMinutes, overlayStartTime),
      end: overlayMinutesToDate(startMinutes + duration, overlayStartTime),
    };
  });
};

const OVERLAY_DRAG_AXIS_THRESHOLD_PX = 8;
const OVERLAY_DRAG_HORIZONTAL_AXIS_SWITCH_RATIO = 1.35;
const OVERLAY_DRAG_SNAP_HYSTERESIS_MINUTES =
  OVERLAY_DRAG_SNAP_INTERVAL_MINUTES / 2;

type OverlayDragMode = "reorder" | "remove" | null;

type OverlayDragCandidate = {
  placementId: string;
  startMinutes: number;
  durationMinutes: number;
  baseStartMinutes: number;
};

type OverlayDragIntent = {
  axis: "vertical" | "horizontal" | null;
  startPoint: { x: number; y: number } | null;
  lastSnappedMinutes: number | null;
};

type OverlayDragMeta = {
  baseStartMinutes: number;
  durationMinutes: number;
};

const applyOverlayDragHysteresis = (
  rawMinutes: number,
  lastSnap: number | null,
) => {
  const snapped = snapMinutesToFive(rawMinutes);
  if (lastSnap === null) return snapped;
  if (snapped === lastSnap) return lastSnap;

  const direction = rawMinutes - lastSnap;
  if (direction > 0) {
    return rawMinutes >= lastSnap + OVERLAY_DRAG_SNAP_HYSTERESIS_MINUTES
      ? snapped
      : lastSnap;
  }
  if (direction < 0) {
    return rawMinutes <= lastSnap - OVERLAY_DRAG_SNAP_HYSTERESIS_MINUTES
      ? snapped
      : lastSnap;
  }
  return lastSnap;
};

const normalizeOverlayPlacements = (
  placements: OverlayPlacement[],
  overlayStartTime: Date,
  overlayEndTime: Date,
): OverlayPlacement[] => {
  if (placements.length === 0) return [];
  const windowMinutes = Math.max(
    1,
    overlayDateToMinutes(overlayEndTime, overlayStartTime),
  );
  let cursorMinutes = 0;
  return sortOverlayPlacements(placements).map((placement) => {
    const durationMinutes = Math.max(
      1,
      overlayDateToMinutes(placement.end, placement.start),
    );
    const earliestStart = Math.max(cursorMinutes, 0);
    const desiredStart = overlayDateToMinutes(
      placement.start,
      overlayStartTime,
    );
    const candidateStart = Math.max(desiredStart, earliestStart);
    const normalizedStartMinutes = clampOverlayPlacementStart(
      candidateStart,
      durationMinutes,
      windowMinutes,
    );
    const normalizedEndMinutes = normalizedStartMinutes + durationMinutes;
    cursorMinutes = Math.max(cursorMinutes, normalizedEndMinutes);
    return {
      ...placement,
      start: overlayMinutesToDate(normalizedStartMinutes, overlayStartTime),
      end: overlayMinutesToDate(normalizedEndMinutes, overlayStartTime),
    };
  });
};

const removeOverlayPlacement = (
  placements: OverlayPlacement[],
  id: string,
  overlayStartTime: Date,
  overlayEndTime: Date,
) =>
  normalizeOverlayPlacements(
    placements.filter((placement) => placement.id !== id),
    overlayStartTime,
    overlayEndTime,
  );

const getNextSequentialStartMinutes = (
  placements: OverlayPlacement[],
  overlayStartTime: Date,
  windowMinutes: number,
  durationMinutes: number,
) => {
  if (placements.length === 0) return 0;
  const sorted = sortOverlayPlacements(placements);
  const last = sorted[sorted.length - 1];
  const lastEndMinutes = overlayDateToMinutes(last.end, overlayStartTime);
  return clampOverlayPlacementStart(
    lastEndMinutes,
    durationMinutes,
    windowMinutes,
  );
};

const OVERLAY_BORDER_COLOR = "rgba(0, 0, 0, 0.95)";
const OVERLAY_PROJECT_BACKGROUND = `radial-gradient(circle at 0% 0%, rgba(120, 126, 138, 0.28), transparent 58%), linear-gradient(140deg, rgba(8, 8, 10, 0.96) 0%, rgba(22, 22, 26, 0.94) 42%, rgba(88, 90, 104, 0.6) 100%)`;
const HABIT_TYPE_BACKGROUND_MAP: Record<string, string> = {
  HABIT: `radial-gradient(circle at 0% 0%, rgba(120, 126, 138, 0.28), transparent 58%), linear-gradient(140deg, rgba(8, 8, 10, 0.96) 0%, rgba(22, 22, 26, 0.94) 42%, rgba(88, 90, 104, 0.6) 100%)`,
  CHORE: `radial-gradient(circle at 10% -25%, rgba(248, 113, 113, 0.32), transparent 58%), linear-gradient(135deg, rgba(67, 26, 26, 0.9) 0%, rgba(127, 29, 29, 0.85) 45%, rgba(220, 38, 38, 0.72) 100%)`,
  RELAXER: `radial-gradient(circle at 8% -18%, rgba(16, 185, 129, 0.32), transparent 60%), linear-gradient(138deg, rgba(4, 56, 33, 0.94) 0%, rgba(4, 120, 87, 0.88) 46%, rgba(16, 185, 129, 0.78) 100%)`,
  PRACTICE: `radial-gradient(circle at 6% -14%, rgba(54, 57, 66, 0.38), transparent 60%), linear-gradient(142deg, rgba(4, 4, 6, 0.98) 0%, rgba(18, 18, 22, 0.95) 44%, rgba(68, 72, 92, 0.72) 100%)`,
  SYNC: `radial-gradient(circle at 12% -20%, rgba(209, 213, 219, 0.32), transparent 58%), linear-gradient(135deg, rgba(39, 42, 48, 0.92) 0%, rgba(107, 114, 128, 0.82) 45%, rgba(209, 213, 219, 0.7) 100%)`,
  MEMO: `radial-gradient(circle at 8% -18%, rgba(192, 132, 252, 0.34), transparent 60%), linear-gradient(138deg, rgba(59, 7, 100, 0.94) 0%, rgba(99, 37, 141, 0.88) 46%, rgba(168, 85, 247, 0.74) 100%)`,
};

const getOverlayPlacementTheme = (
  placement: OverlayPlacement,
): OverlayPlacementTheme => {
  if (placement.type === "PROJECT") {
    return {
      background: OVERLAY_PROJECT_BACKGROUND,
      borderColor: OVERLAY_BORDER_COLOR,
    };
  }

  const habitTypeKey = normalizeHabitType(placement.habitType);
  return {
    background:
      HABIT_TYPE_BACKGROUND_MAP[habitTypeKey] ??
      HABIT_TYPE_BACKGROUND_MAP.HABIT,
    borderColor: OVERLAY_BORDER_COLOR,
  };
};

type OverlayPlacementTheme = {
  background: string;
  borderColor: string;
};

const humanizeFieldLabel = (key: string) =>
  key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase())
    .trim();

function determineAutoScopeFromPrompt(prompt: string): AiScope {
  const normalized = prompt.toLowerCase();
  const mentionsCreate =
    (normalized.includes("create") ||
      normalized.includes("draft") ||
      normalized.includes("add") ||
      normalized.includes("make")) &&
    (AUTO_SCOPE_CREATION_KEYWORDS.some((keyword) =>
      normalized.includes(keyword),
    ) ||
      /\b(goal|project|task|day\s*type|habit)\b/.test(normalized) ||
      normalized.includes("help me create"));

  if (mentionsCreate) {
    return "draft_creation";
  }

  if (
    AUTO_SCOPE_SCHEDULE_KEYWORDS.some((keyword) => normalized.includes(keyword))
  ) {
    return "schedule_edit";
  }

  return "read_only";
}

// Keeps taps single-action on iOS by acting on pointerup and ignoring the
// synthetic click that follows; real clicks (keyboard/AT) still fire onClick.
function useTapHandler(onTap: () => void, opts?: { disabled?: boolean }) {
  const sawPointerUpRef = React.useRef(false);

  const onPointerUp = React.useCallback(
    (e: React.PointerEvent) => {
      if (opts?.disabled) return;
      // Only primary button
      // (pointerup.button may be 0 or -1 on some mobile UAs; don't over-filter)
      if ((e as any).button != null && (e as any).button !== 0) return;

      // Act immediately on pointerup for mouse & touch
      sawPointerUpRef.current = true;
      onTap();
      // Reset flag soon so keyboard click later still works
      setTimeout(() => {
        sawPointerUpRef.current = false;
      }, 0);
    },
    [onTap, opts?.disabled],
  );

  const onClick = React.useCallback(
    (e: React.MouseEvent) => {
      if (opts?.disabled) return;
      // Ignore synthetic click that follows our pointerup (iOS)
      if (sawPointerUpRef.current) {
        return;
      }
      onTap(); // allow keyboard/AT-triggered clicks
    },
    [onTap, opts?.disabled],
  );

  return { onPointerUp, onClick };
}

const isTourActive = () => Boolean((window as any).__CREATOR_TOUR_ACTIVE__);

function useOverhangLT(
  ref: React.RefObject<HTMLElement>,
  deps: any[] = [],
  opts?: { listenVisualViewport?: boolean; listenScroll?: boolean },
) {
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    const update = () => {
      const el = ref.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();

      const OVERHANG = 12; // vertical overhang only
      const BTN = 48;
      const GAP = 12;
      const GROUP_W = BTN * 2 + GAP;
      const GROUP_H = BTN;
      const SHIFT_LEFT = 0; // keep right edge flush to panel

      const safeBottom =
        Number.parseFloat(
          getComputedStyle(document.documentElement)
            .getPropertyValue("--sat-safe-bottom")
            .trim() || "0",
        ) || 0;

      // Use visualViewport for mobile keyboard compatibility, fallback to window
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const viewportHeight =
        window.visualViewport?.height ?? window.innerHeight;

      // Align group's right edge to panel's right (no horizontal overhang).
      let left = Math.round(rect.right - GROUP_W - SHIFT_LEFT);
      const minLeft = 8;
      const maxLeft = viewportWidth - GROUP_W - 8;
      left = Math.min(Math.max(left, minLeft), maxLeft);

      let top = Math.round(rect.bottom + OVERHANG - GROUP_H);
      const maxTop = viewportHeight - safeBottom - GROUP_H - 8;
      top = Math.min(top, maxTop);
      top = Math.max(top, 8);

      setPos({ left, top });
    };

    update();
    // Listen to visualViewport resize for mobile keyboard compatibility
    const listenVisualViewport = opts?.listenVisualViewport ?? true;
    const listenScroll = opts?.listenScroll ?? true;
    const visualViewport = window.visualViewport;
    if (listenVisualViewport) {
      if (visualViewport) {
        visualViewport.addEventListener("resize", update);
      } else {
        // Fallback for browsers without visualViewport support
        window.addEventListener("resize", update);
      }
    }
    if (listenScroll) {
      window.addEventListener("scroll", update, { passive: true });
    }
    return () => {
      if (listenVisualViewport) {
        if (visualViewport) {
          visualViewport.removeEventListener("resize", update);
        } else {
          window.removeEventListener("resize", update);
        }
      }
      if (listenScroll) {
        window.removeEventListener("scroll", update);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return pos;
}

const formatSchedulerPriorityLabel = (value: number) => {
  const index = Math.max(
    0,
    Math.min(value - 1, SCHEDULER_PRIORITY_LABELS.length - 1),
  );
  return SCHEDULER_PRIORITY_LABELS[index] ?? "NO";
};

const describeSchedulerOp = (op: AiSchedulerOp) => {
  switch (op.type) {
    case "SET_DAY_TYPE_ASSIGNMENT":
      return `Set day type for ${op.date} to ${op.day_type_name}`;
    case "SET_GOAL_PRIORITY_BY_NAME":
      return `Set goal "${op.goal_title}" priority to ${formatSchedulerPriorityLabel(
        op.priority,
      )} (${op.priority})`;
    case "SET_PROJECT_PRIORITY_BY_NAME":
      return `Set project "${op.project_title}" priority to ${formatSchedulerPriorityLabel(
        op.priority,
      )} (${op.priority})`;
    case "UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL":
      return `Update time block "${op.block_label}" for day type "${op.day_type_name}"`;
  }
};

type DayTypePreviewBlock = {
  id: string;
  label?: string;
  startLabel?: string;
  endLabel?: string;
  startMinutes?: number;
  endMinutes?: number;
  start_local?: string;
  end_local?: string;
  opIndex: number;
  opType: AiSchedulerOp["type"];
  hasConstraints?: boolean;
};

const buildDayTypePreviewBlocks = (
  ops: AiSchedulerOp[],
): DayTypePreviewBlock[] => {
  const blocks: DayTypePreviewBlock[] = [];

  ops.forEach((op, index) => {
    if (op.type === "CREATE_DAY_TYPE_TIME_BLOCK") {
      blocks.push({
        id: `create-${op.day_type_name}-${op.label}-${index}`,
        label: op.label,
        startLabel: op.start_local,
        endLabel: op.end_local,
        start_local: op.start_local,
        end_local: op.end_local,
        startMinutes: parseTimeToMinutes(op.start_local) ?? undefined,
        endMinutes: parseTimeToMinutes(op.end_local) ?? undefined,
        opIndex: index,
        opType: op.type,
        hasConstraints:
          Boolean(op.constraints) && Object.keys(op.constraints).length > 0,
      });
      return;
    }

    if (op.type === "UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL") {
      const { start_local, end_local, constraints } = op.patch;
      if (!start_local && !end_local) return;

      blocks.push({
        id: `update-${op.day_type_name}-${op.block_label}-${index}`,
        label: op.block_label,
        startLabel: start_local,
        endLabel: end_local,
        start_local: start_local ?? undefined,
        end_local: end_local ?? undefined,
        startMinutes: start_local
          ? (parseTimeToMinutes(start_local) ?? undefined)
          : undefined,
        endMinutes: end_local
          ? (parseTimeToMinutes(end_local) ?? undefined)
          : undefined,
        opIndex: index,
        opType: op.type,
        hasConstraints:
          Boolean(constraints) && Object.keys(constraints).length > 0,
      });
    }
  });

  return blocks.sort(
    (a, b) =>
      (a.startMinutes ?? Number.MAX_SAFE_INTEGER) -
      (b.startMinutes ?? Number.MAX_SAFE_INTEGER),
  );
};

const MINUTES_PER_DAY = 24 * 60;

const formatTimeLabel = (minutes: number) => {
  if (minutes >= MINUTES_PER_DAY) {
    return "24:00";
  }
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const parseTimeToMinutes = (value?: string | null) => {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 24 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  if (hour === 24 && minute !== 0) {
    return null;
  }
  return hour === 24 ? MINUTES_PER_DAY : hour * 60 + minute;
};

type DayTypePreviewSegment = {
  id: string;
  label: string;
  dayTypeName: string;
  blockType?: string;
  energy?: string;
  topPercent: number;
  heightPercent: number;
  startMin: number;
  endMin: number;
  timeRange: string;
};

type ProposalFormValues = Record<string, unknown>;

const cloneSchedulerOp = (op: AiSchedulerOp): AiSchedulerOp => {
  if (op.type === "UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL") {
    const clonedPatch = { ...op.patch };
    if (clonedPatch.constraints) {
      clonedPatch.constraints = { ...clonedPatch.constraints };
    }
    return {
      ...op,
      patch: clonedPatch,
    };
  }
  if (op.type === "CREATE_DAY_TYPE_TIME_BLOCK") {
    return {
      ...op,
      constraints: op.constraints ? { ...op.constraints } : undefined,
    };
  }
  return { ...op };
};

const normalizeSchedulerOps = (
  ops?: AiSchedulerOp[] | null,
): AiSchedulerOp[] => (Array.isArray(ops) ? ops : []);

export function Fab({
  className = "",
  menuVariant = "default",
  swipeUpToOpen = false,
  ...wrapperProps
}: FabProps) {
  const [isOpen, setIsOpen] = useState(false);
  const toast = useToastHelpers();
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiScope, setAiScope] = useState<AiScope>("read_only");
  const [scopeSelection, setScopeSelection] = useState<ScopeSelection>("auto");
  const [autoModeActive, setAutoModeActive] = useState(true);
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  const scopeMenuRef = useRef<HTMLDivElement | null>(null);
  const scopeToggleRef = useRef<HTMLButtonElement | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResponse, setAiResponse] = useState<AiIntentResponse | null>(null);
  const rawQuotaPercent = aiResponse?.quota?.percent_used;
  const quotaPercentValue =
    typeof rawQuotaPercent === "number" && Number.isFinite(rawQuotaPercent)
      ? rawQuotaPercent
      : 0;
  const quotaDisplayPercent = Math.max(0, Math.round(quotaPercentValue));
  const quotaExceeded = quotaPercentValue >= 100;
  const [aiShowSnapshot, setAiShowSnapshot] = useState(false);
  const [aiThread, setAiThread] = useState<LocalAiThreadMessage[]>([]);
  const [proposalFormState, setProposalFormState] = useState<
    Record<string, ProposalFormValues>
  >({});
  const [opsPreviewOpenById, setOpsPreviewOpenById] = useState<
    Record<string, boolean>
  >({});
  const followUps = useMemo(() => {
    const values = aiResponse?.follow_ups;
    if (!Array.isArray(values)) return [];
    return values
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }, [aiResponse?.follow_ups]);
  const clarificationQuestions = useMemo(() => {
    if (aiResponse?.intent.type !== "NEEDS_CLARIFICATION") return [];
    const values = aiResponse.intent.questions;
    if (!Array.isArray(values)) return [];
    return values
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }, [aiResponse?.intent]);
  const chipSuggestions =
    clarificationQuestions.length > 0 ? clarificationQuestions : followUps;
  const scopeLabel = useMemo(() => {
    let label: string;
    switch (aiScope) {
      case "draft_creation":
        label = "Draft creation";
        break;
      case "schedule_edit":
        label = "Schedule edit";
        break;
      default:
        label = "Read only";
    }
    return autoModeActive ? `${label} (AUTO)` : label;
  }, [aiScope, autoModeActive]);
  const shouldShowWelcomePanel =
    aiThread.length === 0 && aiPrompt.trim().length === 0;
  const resetAiHelperState = useCallback(() => {
    setAiThread([]);
    setAiResponse(null);
    setAiError(null);
    setAiShowSnapshot(false);
    setAiPrompt("");
    setAiScope("read_only");
    setScopeSelection("auto");
    setAutoModeActive(true);
    setScopeMenuOpen(false);
    setProposalFormState({});
    setOpsPreviewOpenById({});
    setAiLoading(false);
  }, []);
  const closeAiOverlay = useCallback(() => {
    resetAiHelperState();
    setAiOpen(false);
  }, [resetAiHelperState]);
  const aiOverlayRef = useRef<HTMLDivElement | null>(null);
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [aiThread]);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<
    "GOAL" | "PROJECT" | "TASK" | "HABIT" | null
  >(null);
  const initialOverlayStart = useMemo(
    () => roundToNearestMinutes(new Date(), 5),
    [],
  );
  const [overlayStartTime, setOverlayStartTime] =
    useState<Date>(initialOverlayStart);
  const [overlayEndTime, setOverlayEndTime] = useState<Date>(
    () =>
      new Date(
        initialOverlayStart.getTime() +
          DEFAULT_OVERLAY_DURATION_MINUTES * 60000,
      ),
  );
  const [overlayStartInputValue, setOverlayStartInputValue] = useState(
    formatTimeInputValue(initialOverlayStart),
  );
  const [overlayEndInputValue, setOverlayEndInputValue] = useState(() =>
    formatTimeInputValue(
      new Date(
        initialOverlayStart.getTime() +
          DEFAULT_OVERLAY_DURATION_MINUTES * 60000,
      ),
    ),
  );
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayPickerOpen, setOverlayPickerOpen] = useState(false);
  const [overlayPickerSelected, setOverlayPickerSelected] =
    useState<FabSearchResult | null>(null);
  const [overlayPlacedItems, setOverlayPlacedItems] = useState<
    OverlayPlacement[]
  >([]);
  const [isSavingLiveOverlay, setIsSavingLiveOverlay] = useState(false);
  const [overlaySaveError, setOverlaySaveError] = useState<string | null>(null);
  const overlayTimelineRef = useRef<HTMLDivElement | null>(null);
  const [overlayRemovalCandidateId, setOverlayRemovalCandidateId] = useState<
    string | null
  >(null);
  const [activeOverlayDragId, setActiveOverlayDragId] = useState<string | null>(
    null,
  );
  const [overlayDragMode, setOverlayDragMode] = useState<OverlayDragMode>(null);
  const overlayDragModeRef = useRef<OverlayDragMode>(null);
  const overlayDragIntentRef = useRef<OverlayDragIntent>({
    axis: null,
    startPoint: null,
    lastSnappedMinutes: null,
  });
  const overlayDragMetaRef = useRef<OverlayDragMeta | null>(null);
  const [overlayDragCandidate, setOverlayDragCandidate] =
    useState<OverlayDragCandidate | null>(null);
  const lastResolvedOverlayLayoutRef = useRef<OverlayPlacement[] | null>(null);
  const overlayWindowMinutes = Math.max(
    overlayDateToMinutes(overlayEndTime, overlayStartTime),
    1,
  );
  const overlayDurationMinutes = Math.max(overlayWindowMinutes, 15);
  const overlayDurationLabel = formatDurationLabel(overlayDurationMinutes);
  const overlayTimelineHeightPx = 280;
  const overlayTimelineDurationForLayout = Math.max(1, overlayDurationMinutes);
  const overlayTimelinePxPerMin = Math.max(
    0.9,
    Math.min(3.2, overlayTimelineHeightPx / overlayTimelineDurationForLayout),
  );
  const overlayTimelineStartHour =
    overlayStartTime.getHours() + overlayStartTime.getMinutes() / 60;
  const overlayTimelineEndHour =
    overlayTimelineStartHour + overlayTimelineDurationForLayout / 60;
  const overlayIntervalValid =
    overlayEndTime.getTime() > overlayStartTime.getTime();
  const minutesToTimelineStyle = (minutes: number) =>
    `calc(var(--timeline-minute-unit) * ${Math.max(0, minutes)})`;
  const renderOverlayPlacements = useMemo(() => {
    if (!overlayDragCandidate) {
      return overlayPlacedItems;
    }
    const delta =
      overlayDragCandidate.startMinutes - overlayDragCandidate.baseStartMinutes;
    const direction: OverlayLayoutDirection =
      delta > 0 ? "forward" : delta < 0 ? "backward" : "none";
    return resolveOverlayPlacementLayout({
      placements: overlayPlacedItems,
      overlayStartTime,
      overlayWindowMinutes,
      movingPlacementId: overlayDragCandidate.placementId,
      durationMinutes: overlayDragCandidate.durationMinutes,
      targetStartMinutes: overlayDragCandidate.startMinutes,
      rawTargetStartMinutes: overlayDragCandidate.startMinutes,
      direction,
    });
  }, [
    overlayDragCandidate,
    overlayPlacedItems,
    overlayStartTime,
    overlayWindowMinutes,
  ]);
  useEffect(() => {
    if (overlayDragCandidate) {
      lastResolvedOverlayLayoutRef.current = renderOverlayPlacements;
    } else {
      lastResolvedOverlayLayoutRef.current = null;
    }
  }, [overlayDragCandidate, renderOverlayPlacements]);
  const overlayDragCandidatePlacement = overlayDragCandidate
    ? renderOverlayPlacements.find(
        (placement) => placement.id === overlayDragCandidate.placementId,
      )
    : null;
  const overlayDragCandidatePlacementStartMinutes =
    overlayDragCandidatePlacement !== null
      ? Math.max(
          0,
          (overlayDragCandidatePlacement.start.getTime() -
            overlayStartTime.getTime()) /
            60000,
        )
      : null;
  const setOverlayDragModeWithRef = useCallback(
    (mode: OverlayDragMode) => {
      overlayDragModeRef.current = mode;
      setOverlayDragMode(mode);
    },
    [setOverlayDragMode],
  );
  const [startInputFocused, setStartInputFocused] = useState(false);
  const [endInputFocused, setEndInputFocused] = useState(false);
  useEffect(() => {
    setOverlayStartInputValue(formatTimeInputValue(overlayStartTime));
  }, [overlayStartTime]);
  useEffect(() => {
    setOverlayEndInputValue(formatTimeInputValue(overlayEndTime));
  }, [overlayEndTime]);
  useEffect(() => {
    if (!overlayOpen) {
      setOverlayRemovalCandidateId(null);
      setActiveOverlayDragId(null);
      setOverlayDragCandidate(null);
      setOverlayDragModeWithRef(null);
      overlayDragIntentRef.current = {
        axis: null,
        startPoint: null,
        lastSnappedMinutes: null,
      };
      overlayDragMetaRef.current = null;
    }
  }, [overlayOpen, setOverlayDragModeWithRef]);

  const resetOverlayDraft = useCallback(() => {
    const nextStart = roundToNearestMinutes(new Date(), 5);
    const nextEnd = new Date(
      nextStart.getTime() + DEFAULT_OVERLAY_DURATION_MINUTES * 60000,
    );
    setOverlayStartTime(nextStart);
    setOverlayEndTime(nextEnd);
    setOverlayStartInputValue(formatTimeInputValue(nextStart));
    setOverlayEndInputValue(formatTimeInputValue(nextEnd));
    setOverlayPlacedItems([]);
    setOverlayPickerSelected(null);
    setOverlayPickerOpen(false);
  }, []);

  useEffect(() => {
    if (!overlayOpen) {
      setOverlaySaveError(null);
    }
  }, [overlayOpen]);
  const isPointerOverTrashZone = useCallback(
    (point: { x: number; y: number } | null) => {
      if (!point) return false;
      const rect = overlayNexusDropRef.current?.getBoundingClientRect();
      if (!rect) return false;
      const scrollX = typeof window !== "undefined" ? window.scrollX : 0;
      const scrollY = typeof window !== "undefined" ? window.scrollY : 0;
      const viewportPoint = {
        x: point.x - scrollX,
        y: point.y - scrollY,
      };
      const margin = 12;
      return (
        viewportPoint.x >= rect.left - margin &&
        viewportPoint.x <= rect.right + margin &&
        viewportPoint.y >= rect.top - margin &&
        viewportPoint.y <= rect.bottom + margin
      );
    },
    [],
  );
  const handleOverlayDrag = useCallback(
    (placement: OverlayPlacement, info: PanInfo) => {
      const intent = overlayDragIntentRef.current;
      const meta = overlayDragMetaRef.current;
      if (!intent.startPoint || !meta) return;

      const deltaX = info.point.x - intent.startPoint.x;
      const deltaY = info.point.y - intent.startPoint.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (!intent.axis) {
        if (
          absX > OVERLAY_DRAG_AXIS_THRESHOLD_PX ||
          absY > OVERLAY_DRAG_AXIS_THRESHOLD_PX
        ) {
          intent.axis = absY >= absX ? "vertical" : "horizontal";
        }
      } else {
        const shouldSwitchToHorizontal =
          absX > OVERLAY_DRAG_AXIS_THRESHOLD_PX &&
          absX > absY * OVERLAY_DRAG_HORIZONTAL_AXIS_SWITCH_RATIO;
        const shouldSwitchToVertical =
          absY > OVERLAY_DRAG_AXIS_THRESHOLD_PX &&
          absY > absX * OVERLAY_DRAG_HORIZONTAL_AXIS_SWITCH_RATIO;

        if (intent.axis === "vertical" && shouldSwitchToHorizontal) {
          intent.axis = "horizontal";
        } else if (intent.axis === "horizontal" && shouldSwitchToVertical) {
          intent.axis = "vertical";
        }
      }

      const overTrashZone = isPointerOverTrashZone(info.point);
      const nextMode: OverlayDragMode = overTrashZone ? "remove" : "reorder";
      if (nextMode !== overlayDragModeRef.current) {
        setOverlayRemovalCandidateId(
          nextMode === "remove" ? placement.id : null,
        );
        setOverlayDragModeWithRef(nextMode);
      }
      if (nextMode === "remove") {
        return;
      }

      const pxPerMin = Math.max(0.01, overlayTimelinePxPerMin);
      const rawMinutes = meta.baseStartMinutes + info.offset.y / pxPerMin;
      const maxDragStart = Math.max(
        0,
        overlayWindowMinutes - meta.durationMinutes,
      );
      const boundedRawMinutes = Math.min(Math.max(rawMinutes, 0), maxDragStart);
      const hysteresisMinutes = applyOverlayDragHysteresis(
        boundedRawMinutes,
        intent.lastSnappedMinutes,
      );
      const clampedMinutes = clampOverlayPlacementStart(
        hysteresisMinutes,
        meta.durationMinutes,
        overlayWindowMinutes,
      );
      const direction: OverlayLayoutDirection =
        clampedMinutes > meta.baseStartMinutes
          ? "forward"
          : clampedMinutes < meta.baseStartMinutes
            ? "backward"
            : "none";
      const preview = resolveOverlayPlacementLayout({
        placements: overlayPlacedItems,
        overlayStartTime,
        overlayWindowMinutes,
        movingPlacementId: placement.id,
        durationMinutes: meta.durationMinutes,
        targetStartMinutes: clampedMinutes,
        rawTargetStartMinutes: rawMinutes,
        direction,
      });
      const previewPlacement = preview.find(
        (entry) => entry.id === placement.id,
      );
      const previewStartMinutes = previewPlacement
        ? overlayDateToMinutes(previewPlacement.start, overlayStartTime)
        : clampedMinutes;
      const snappedChanged = intent.lastSnappedMinutes !== previewStartMinutes;
      intent.lastSnappedMinutes = previewStartMinutes;
      if (snappedChanged) {
        setOverlayDragCandidate({
          placementId: placement.id,
          startMinutes: previewStartMinutes,
          durationMinutes: meta.durationMinutes,
          baseStartMinutes: meta.baseStartMinutes,
        });
      }
    },
    [
      overlayTimelinePxPerMin,
      overlayWindowMinutes,
      setOverlayDragModeWithRef,
      isPointerOverTrashZone,
      overlayPlacedItems,
      overlayStartTime,
    ],
  );
  const startTimeInputId = useId();
  const endTimeInputId = useId();
  const PROJECT_STAGE_OPTIONS_LOCAL = [
    { value: "RESEARCH", label: "RESEARCH" },
    { value: "TEST", label: "TEST" },
    { value: "BUILD", label: "BUILD" },
    { value: "REFINE", label: "REFINE" },
    { value: "RELEASE", label: "RELEASE" },
  ];
  const PRIORITY_OPTIONS_LOCAL = [
    { value: "NO", label: "NO" },
    { value: "LOW", label: "LOW" },
    { value: "MEDIUM", label: "MEDIUM" },
    { value: "HIGH", label: "HIGH" },
    { value: "CRITICAL", label: "CRITICAL" },
    { value: "ULTRA-CRITICAL", label: "ULTRA-CRITICAL" },
  ];
  const PRIORITY_ICON_MAP: Record<string, string | null> = {
    NO: null,
    LOW: null,
    MEDIUM: "!",
    HIGH: "!!",
    CRITICAL: "!!!",
    "ULTRA-CRITICAL": "⚠️",
  };
  const ENERGY_OPTIONS_LOCAL = [
    { value: "NO", label: "No" },
    { value: "LOW", label: "Low" },
    { value: "MEDIUM", label: "Medium" },
    { value: "HIGH", label: "High" },
    { value: "ULTRA", label: "Ultra" },
    { value: "EXTREME", label: "Extreme" },
  ];
  const TASK_STAGE_OPTIONS_LOCAL = [
    { value: "RESEARCH", label: "Research" },
    { value: "PLAN", label: "Plan" },
    { value: "PRODUCE", label: "Produce" },
    { value: "QA", label: "QA" },
    { value: "SHIP", label: "Ship" },
  ];
  const defaultHabitType = HABIT_TYPE_OPTIONS[0]?.value ?? "";
  const defaultHabitRecurrence =
    HABIT_RECURRENCE_OPTIONS.find((option) => option.value === "weekly")
      ?.value ??
    HABIT_RECURRENCE_OPTIONS[0]?.value ??
    "";
  const [projectName, setProjectName] = useState("");
  const [projectStage, setProjectStage] = useState<string>("RESEARCH");
  const [projectDuration, setProjectDuration] = useState<number | "">("");
  const [projectPriority, setProjectPriority] = useState<string>("MEDIUM");
  const [projectEnergy, setProjectEnergy] = useState<string>("MEDIUM");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [monumentEmojiMap, setMonumentEmojiMap] = useState<
    Map<string, string | null>
  >(new Map());
  useEffect(() => {
    if (typeof document === "undefined") return;
    const styleId = "goal-link-pulse-style";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes goalLinkPulse {
        0%, 100% { opacity: 0.8; }
        50% { opacity: 0.72; }
      }
    `;
    document.head.appendChild(style);
  }, []);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillCategories, setSkillCategories] = useState<CatRow[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [goalFilterSkillId, setGoalFilterSkillId] = useState("");
  const [goalFilterMonumentId, setGoalFilterMonumentId] = useState("");
  const [goalFilterEnergy, setGoalFilterEnergy] = useState("");
  const [goalFilterPriority, setGoalFilterPriority] = useState("");
  const [goalSort, setGoalSort] = useState<"recent" | "oldest" | "weight">(
    "recent",
  );
  const [goalSearch, setGoalSearch] = useState("");
  const [skillSearch, setSkillSearch] = useState("");
  const [skillFilterMonumentId, setSkillFilterMonumentId] = useState("");
  const [showSkillFilters, setShowSkillFilters] = useState(false);
  const [taskProjectSearch, setTaskProjectSearch] = useState("");
  const [taskProjectFilterStage, setTaskProjectFilterStage] = useState("");
  const [taskProjectFilterPriority, setTaskProjectFilterPriority] =
    useState("");
  const [showTaskProjectFilters, setShowTaskProjectFilters] = useState(false);
  const [taskProjects, setTaskProjects] = useState<Project[]>([]);
  const [taskProjectsLoading, setTaskProjectsLoading] = useState(false);
  const filteredGoals = useMemo(() => {
    const query = goalSearch.trim().toLowerCase();
    let list = goals;
    if (query) {
      list = list.filter((goal) =>
        (goal.name ?? "").toLowerCase().includes(query),
      );
    }
    if (goalFilterEnergy) {
      list = list.filter(
        (goal) =>
          (goal.energy_code ?? goal.energy ?? "").toLowerCase() ===
          goalFilterEnergy.toLowerCase(),
      );
    }
    if (goalFilterPriority) {
      list = list.filter(
        (goal) =>
          (goal.priority ?? "").toLowerCase() ===
          goalFilterPriority.toLowerCase(),
      );
    }
    if (goalFilterMonumentId) {
      list = list.filter(
        (goal) => (goal.monument_id ?? "") === goalFilterMonumentId,
      );
    }
    if (goalFilterSkillId) {
      const skillName =
        skills.find((s) => s.id === goalFilterSkillId)?.name?.toLowerCase() ??
        "";
      list = list.filter((goal) => {
        const goalAny = goal as any;
        const skillIds: string[] | undefined = goalAny.skills;
        const matchesId = Array.isArray(skillIds)
          ? skillIds.includes(goalFilterSkillId)
          : false;
        const matchesName =
          skillName.length > 0 &&
          (goal.name ?? "").toLowerCase().includes(skillName);
        return matchesId || matchesName;
      });
    }
    const sorter =
      goalSort === "recent"
        ? (a: Goal, b: Goal) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        : goalSort === "oldest"
          ? (a: Goal, b: Goal) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()
          : (a: Goal, b: Goal) => (b.weight ?? 0) - (a.weight ?? 0);
    return [...list].sort(sorter);
  }, [
    goalFilterEnergy,
    goalFilterMonumentId,
    goalFilterPriority,
    goalFilterSkillId,
    goalSearch,
    goalSort,
    goals,
    skills,
  ]);
  const filteredSkills = useMemo(() => {
    const term = skillSearch.trim().toLowerCase();
    let list = skills;
    if (term) {
      list = list.filter((skill) =>
        (skill.name ?? "").toLowerCase().includes(term),
      );
    }
    if (skillFilterMonumentId) {
      list = list.filter(
        (skill) => (skill.monument_id ?? "") === skillFilterMonumentId,
      );
    }
    const categoryOrder = new Map(
      skillCategories.map((cat, index) => [cat.id, index]),
    );
    const getCategoryIndex = (catId?: string | null) =>
      catId && categoryOrder.has(catId)
        ? (categoryOrder.get(catId) ?? Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER;
    return [...list].sort((a, b) => {
      const catA = getCategoryIndex(a.cat_id ?? null);
      const catB = getCategoryIndex(b.cat_id ?? null);
      if (catA !== catB) return catA - catB;
      const nameA = (a.name ?? "").toLowerCase();
      const nameB = (b.name ?? "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [skillCategories, skillFilterMonumentId, skillSearch, skills]);
  const goalsById = useMemo(() => {
    const map = new Map<string, Goal>();
    goals.forEach((goal) => {
      if (goal.id) {
        map.set(goal.id, goal);
      }
    });
    return map;
  }, [goals]);
  const filteredTaskProjects = useMemo(() => {
    let list = taskProjects;
    if (taskProjectFilterStage) {
      const stage = taskProjectFilterStage.toLowerCase();
      list = list.filter(
        (project) => (project.stage ?? "").toLowerCase() === stage,
      );
    }
    if (taskProjectFilterPriority) {
      const priority = taskProjectFilterPriority.toLowerCase();
      list = list.filter(
        (project) => (project.priority ?? "").toLowerCase() === priority,
      );
    }
    const term = taskProjectSearch.trim().toLowerCase();
    if (!term) return list;
    return list.filter((project) =>
      (project.name ?? "").toLowerCase().includes(term),
    );
  }, [
    taskProjectFilterPriority,
    taskProjectFilterStage,
    taskProjectSearch,
    taskProjects,
  ]);
  const resetSkillLookupState = useCallback(() => {
    setSkillSearch("");
    setSkillFilterMonumentId("");
    setShowSkillFilters(false);
  }, []);
  const handleSkillDropdownOpenChange = useCallback(
    (open: boolean) => {
      if (!open) return;
      if (skillSearch || skillFilterMonumentId || filteredSkills.length === 0) {
        resetSkillLookupState();
      }
    },
    [
      filteredSkills.length,
      resetSkillLookupState,
      skillFilterMonumentId,
      skillSearch,
    ],
  );
  useEffect(() => {
    resetSkillLookupState();
  }, [resetSkillLookupState, selected]);
  useEffect(() => {
    if (selected !== "TASK") {
      setTaskProjectSearch("");
      setTaskProjectFilterStage("");
      setTaskProjectFilterPriority("");
      setShowTaskProjectFilters(false);
      setShowTaskDurationPicker(false);
      setTaskDurationPosition(null);
    }
  }, [selected]);
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const durationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const durationPickerRef = useRef<HTMLDivElement | null>(null);
  const [durationPosition, setDurationPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [showTaskDurationPicker, setShowTaskDurationPicker] = useState(false);
  const taskDurationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const taskDurationPickerRef = useRef<HTMLDivElement | null>(null);
  const [taskDurationPosition, setTaskDurationPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [showHabitDurationPicker, setShowHabitDurationPicker] = useState(false);
  const habitDurationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const habitDurationPickerRef = useRef<HTMLDivElement | null>(null);
  const [habitDurationPosition, setHabitDurationPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const normalizedProjectDuration =
    typeof projectDuration === "number" && Number.isFinite(projectDuration)
      ? projectDuration
      : 0;
  const updateDurationPosition = useCallback(() => {
    if (!showDurationPicker) return;
    const trigger = durationTriggerRef.current;
    if (
      !trigger ||
      typeof window === "undefined" ||
      typeof document === "undefined"
    ) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const estimatedHeight = 150;
    const margin = 8;
    const spaceBelow = viewportHeight - rect.bottom;
    const placeBelow =
      spaceBelow > estimatedHeight + margin || rect.top < estimatedHeight;
    const top = placeBelow
      ? rect.bottom + margin + window.scrollY
      : Math.max(margin, rect.top - estimatedHeight) + window.scrollY;
    const desiredWidth = Math.max(rect.width, 320);
    const width = Math.min(desiredWidth, viewportWidth - margin * 2);
    let left = rect.left;
    if (left + width > viewportWidth - margin) {
      left = viewportWidth - width - margin;
    }
    if (left < margin) left = margin;
    setDurationPosition({ top, left: left + window.scrollX, width });
  }, [showDurationPicker]);

  const updateTaskDurationPosition = useCallback(() => {
    if (!showTaskDurationPicker) return;
    const trigger = taskDurationTriggerRef.current;
    if (
      !trigger ||
      typeof window === "undefined" ||
      typeof document === "undefined"
    ) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const estimatedHeight = 150;
    const margin = 8;
    const spaceBelow = viewportHeight - rect.bottom;
    const placeBelow =
      spaceBelow > estimatedHeight + margin || rect.top < estimatedHeight;
    const top = placeBelow
      ? rect.bottom + margin + window.scrollY
      : Math.max(margin, rect.top - estimatedHeight) + window.scrollY;
    const desiredWidth = Math.max(rect.width, 320);
    const width = Math.min(desiredWidth, viewportWidth - margin * 2);
    let left = rect.left;
    if (left + width > viewportWidth - margin) {
      left = viewportWidth - width - margin;
    }
    if (left < margin) left = margin;
    setTaskDurationPosition({ top, left: left + window.scrollX, width });
  }, [showTaskDurationPicker]);
  useEffect(() => {
    if (!showDurationPicker) return;
    updateDurationPosition();
    const handle = () => updateDurationPosition();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [showDurationPicker, updateDurationPosition]);

  useEffect(() => {
    if (!showDurationPicker) return;
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (isTourActive()) return;
      const target = event.target as Node | null;
      if (
        !target ||
        fabRootRef.current?.contains(target) ||
        durationPickerRef.current?.contains(target) ||
        durationTriggerRef.current?.contains(target)
      ) {
        return;
      }
      setShowDurationPicker(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [showDurationPicker]);

  useEffect(() => {
    if (!showTaskDurationPicker) return;
    updateTaskDurationPosition();
    const handle = () => updateTaskDurationPosition();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [showTaskDurationPicker, updateTaskDurationPosition]);

  useEffect(() => {
    if (!showTaskDurationPicker) return;
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (isTourActive()) return;
      const target = event.target as Node | null;
      if (
        !target ||
        fabRootRef.current?.contains(target) ||
        taskDurationPickerRef.current?.contains(target) ||
        taskDurationTriggerRef.current?.contains(target)
      ) {
        return;
      }
      setShowTaskDurationPicker(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [showTaskDurationPicker]);
  const toggleDurationPicker = () => {
    setShowDurationPicker((prev) => {
      const next = !prev;
      if (
        next &&
        (projectDuration === "" || !Number.isFinite(projectDuration))
      ) {
        setProjectDuration(30);
      }
      // Defer position calculation to allow layout to settle.
      requestAnimationFrame(() => updateDurationPosition());
      return next;
    });
  };

  const toggleTaskDurationPicker = () => {
    setShowTaskDurationPicker((prev) => {
      const next = !prev;
      if (
        next &&
        (!taskDuration || !Number.isFinite(Number.parseInt(taskDuration, 10)))
      ) {
        setTaskDuration("30");
      }
      requestAnimationFrame(() => updateTaskDurationPosition());
      return next;
    });
  };

  const adjustProjectDuration = (delta: number) => {
    const next = Math.max(0, normalizedProjectDuration + delta);
    setProjectDuration(next);
  };

  const adjustTaskDuration = (delta: number) => {
    const current = Number.parseInt(taskDuration || "30", 10);
    const next = Math.max(1, current + delta);
    setTaskDuration(next.toString());
  };

  const updateHabitDurationPosition = useCallback(() => {
    if (!showHabitDurationPicker) return;
    const trigger = habitDurationTriggerRef.current;
    if (
      !trigger ||
      typeof window === "undefined" ||
      typeof document === "undefined"
    ) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const estimatedHeight = 150;
    const margin = 8;
    const spaceBelow = viewportHeight - rect.bottom;
    const placeBelow =
      spaceBelow > estimatedHeight + margin || rect.top < estimatedHeight;
    const top = placeBelow
      ? rect.bottom + margin + window.scrollY
      : Math.max(margin, rect.top - estimatedHeight) + window.scrollY;
    const desiredWidth = Math.max(rect.width, 320);
    const width = Math.min(desiredWidth, viewportWidth - margin * 2);
    let left = rect.left;
    if (left + width > viewportWidth - margin) {
      left = viewportWidth - width - margin;
    }
    if (left < margin) left = margin;
    setHabitDurationPosition({ top, left: left + window.scrollX, width });
  }, [showHabitDurationPicker]);

  useEffect(() => {
    if (!showHabitDurationPicker) return;
    updateHabitDurationPosition();
    const handle = () => updateHabitDurationPosition();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [showHabitDurationPicker, updateHabitDurationPosition]);

  useEffect(() => {
    if (!showHabitDurationPicker) return;
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (isTourActive()) return;
      const target = event.target as Node | null;
      if (
        !target ||
        fabRootRef.current?.contains(target) ||
        habitDurationPickerRef.current?.contains(target) ||
        habitDurationTriggerRef.current?.contains(target)
      ) {
        return;
      }
      setShowHabitDurationPicker(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [showHabitDurationPicker]);

  const toggleHabitDurationPicker = () => {
    setShowHabitDurationPicker((prev) => {
      const next = !prev;
      if (
        next &&
        (!habitDuration || !Number.isFinite(Number.parseInt(habitDuration, 10)))
      ) {
        setHabitDuration("15");
      }
      // Defer position calculation to allow layout to settle.
      requestAnimationFrame(() => updateHabitDurationPosition());
      return next;
    });
  };

  const adjustHabitDuration = (delta: number) => {
    const current = Number.parseInt(habitDuration || "15", 10);
    const next = Math.max(1, current + delta);
    setHabitDuration(next.toString());
  };

  const projectDurationTapHandlers = useTapHandler(() =>
    toggleDurationPicker(),
  );
  const taskDurationTapHandlers = useTapHandler(() =>
    toggleTaskDurationPicker(),
  );
  const habitDurationTapHandlers = useTapHandler(() =>
    toggleHabitDurationPicker(),
  );
  const projectDurationMinusTapHandlers = useTapHandler(() =>
    adjustProjectDuration(-5),
  );
  const taskDurationMinusTapHandlers = useTapHandler(() =>
    adjustTaskDuration(-5),
  );
  const projectDurationPlusTapHandlers = useTapHandler(() =>
    adjustProjectDuration(5),
  );
  const taskDurationPlusTapHandlers = useTapHandler(() =>
    adjustTaskDuration(5),
  );
  const habitDurationMinusTapHandlers = useTapHandler(() =>
    adjustHabitDuration(-5),
  );
  const habitDurationPlusTapHandlers = useTapHandler(() =>
    adjustHabitDuration(5),
  );
  const [projectSkillIds, setProjectSkillIds] = useState<string[]>([]);
  const [projectGoalId, setProjectGoalId] = useState<string | null>(null);
  const [showGoalFilters, setShowGoalFilters] = useState(false);
  const projectedRankState = useProjectedGlobalRank({
    goalId: projectGoalId,
    priority: projectPriority,
    stage: projectStage,
  });
  const [projectWhy, setProjectWhy] = useState("");
  const [goalName, setGoalName] = useState("");
  const [goalMonumentId, setGoalMonumentId] = useState<string | "">("");
  const [goalPriority, setGoalPriority] = useState("MEDIUM");
  const [goalEnergy, setGoalEnergy] = useState("MEDIUM");
  const [goalWhy, setGoalWhy] = useState("");
  const [goalDue, setGoalDue] = useState<string | null>(null);
  const [monuments, setMonuments] = useState<Monument[]>([]);
  const [monumentsLoading, setMonumentsLoading] = useState(false);
  const [taskName, setTaskName] = useState("");
  const [taskStage, setTaskStage] = useState("PRODUCE");
  const [taskDuration, setTaskDuration] = useState<string>("");
  const [taskPriority, setTaskPriority] = useState("MEDIUM");
  const [taskEnergy, setTaskEnergy] = useState("MEDIUM");
  const [taskProjectId, setTaskProjectId] = useState<string | "">("");
  const [taskSkillId, setTaskSkillId] = useState<string | "">("");
  const [taskNotes, setTaskNotes] = useState("");
  const [habitName, setHabitName] = useState("");
  const [habitType, setHabitType] = useState(defaultHabitType);
  const [habitRecurrence, setHabitRecurrence] = useState(
    defaultHabitRecurrence,
  );
  const [habitDuration, setHabitDuration] = useState<string>("15");
  const [habitEnergy, setHabitEnergy] = useState("LOW");
  const [habitGoalId, setHabitGoalId] = useState<string | "">("");
  const [habitSkillId, setHabitSkillId] = useState<string | "">("");
  const [habitWhy, setHabitWhy] = useState("");
  const [habitRoutineId, setHabitRoutineId] = useState<string | "">("");
  const [habitRoutines, setHabitRoutines] = useState<
    { id: string; name: string; description?: string | null }[]
  >([]);
  const [habitRoutinesLoading, setHabitRoutinesLoading] = useState(false);
  const [isCreatingHabitRoutineInline, setIsCreatingHabitRoutineInline] =
    useState(false);
  const [habitInlineRoutineName, setHabitInlineRoutineName] = useState("");
  const [habitInlineRoutineDescription, setHabitInlineRoutineDescription] =
    useState("");
  const findSkillById = useCallback(
    (id: string | null | undefined) =>
      id ? (skills.find((s) => s.id === id) ?? null) : null,
    [skills],
  );

  const getNextFabEnergyValue = (currentValue?: string | null) => {
    if (ENERGY_OPTIONS_LOCAL.length === 0) {
      return currentValue ?? "MEDIUM";
    }
    const currentIndex = ENERGY_OPTIONS_LOCAL.findIndex(
      (option) => option.value === currentValue,
    );
    if (currentIndex === -1) {
      return ENERGY_OPTIONS_LOCAL[0]?.value ?? "MEDIUM";
    }
    return (
      ENERGY_OPTIONS_LOCAL[(currentIndex + 1) % ENERGY_OPTIONS_LOCAL.length]
        ?.value ?? "MEDIUM"
    );
  };

  const renderGroupedSkillItems = useCallback(() => {
    const UNCATEGORIZED_SKILL_GROUP_ID = "__uncategorized_skill_group__";
    const UNCATEGORIZED_SKILL_GROUP_LABEL = "Uncategorized";
    const groups = new Map<
      string,
      { id: string; label: string; skills: Skill[] }
    >();

    filteredSkills.forEach((skill) => {
      const groupId = skill.cat_id ?? UNCATEGORIZED_SKILL_GROUP_ID;
      const categoryLabel =
        skillCategories
          .find((category) => category.id === groupId)
          ?.name?.trim() || UNCATEGORIZED_SKILL_GROUP_LABEL;
      const group = groups.get(groupId) ?? {
        id: groupId,
        label:
          groupId === UNCATEGORIZED_SKILL_GROUP_ID
            ? UNCATEGORIZED_SKILL_GROUP_LABEL
            : categoryLabel,
        skills: [],
      };
      group.skills.push(skill);
      groups.set(groupId, group);
    });

    const orderedGroups: Array<{ id: string; label: string; skills: Skill[] }> =
      [];
    const seen = new Set<string>();

    skillCategories.forEach((category) => {
      const group = groups.get(category.id);
      if (!group) return;
      orderedGroups.push({
        ...group,
        label: category.name?.trim() || group.label,
      });
      seen.add(category.id);
    });

    const uncategorizedGroup = groups.get(UNCATEGORIZED_SKILL_GROUP_ID);
    if (uncategorizedGroup) {
      orderedGroups.push(uncategorizedGroup);
      seen.add(UNCATEGORIZED_SKILL_GROUP_ID);
    }

    groups.forEach((group, groupId) => {
      if (!seen.has(groupId)) {
        orderedGroups.push(group);
      }
    });

    return orderedGroups.map((group) => (
      <div key={group.id} className="space-y-2 px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">
          {group.label}
        </div>
        <div className="grid gap-1">
          {group.skills.map((skill) => (
            <SelectItem key={skill.id} value={skill.id}>
              <div className="flex items-center gap-2">
                <span className="text-lg">{skill.icon ?? "🛠️"}</span>
                <span>{skill.name}</span>
              </div>
            </SelectItem>
          ))}
        </div>
      </div>
    ));
  }, [filteredSkills, skillCategories]);

  function EnergyCycleButton({
    value,
    onChange,
    ariaLabel,
    size = "md",
    className,
  }: {
    value?: string | null;
    onChange: (value: string) => void;
    ariaLabel: string;
    size?: FlameEmberProps["size"];
    className?: string;
  }) {
    const resolvedLevel = normalizeFlameLevel(value);
    return (
      <button
        type="button"
        onClick={() => onChange(getNextFabEnergyValue(resolvedLevel))}
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-md border border-white/15 bg-white/[0.06] text-white transition hover:border-white/30 hover:bg-white/10",
          className,
        )}
        aria-label={ariaLabel}
        title={`${ariaLabel} (${resolvedLevel})`}
      >
        <FlameEmber
          level={resolvedLevel}
          size={size}
          className="pointer-events-none -translate-y-[3px]"
        />
      </button>
    );
  }

  function SkillTrigger({
    selectedId,
    onClearSelection,
  }: {
    selectedId: string | null;
    onClearSelection?: () => void;
  }) {
    const { isOpen, setIsOpen } = useSelectContext();
    const selectedSkill = findSkillById(selectedId);
    const backspaceTapRef = React.useRef<{ count: number; last: number }>({
      count: 0,
      last: 0,
    });
    const handlePointerDown = (event: React.PointerEvent<HTMLInputElement>) => {
      if (!isOpen) {
        event.preventDefault();
        setIsOpen?.(true);
      }
    };
    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      setIsOpen?.(true);
      if (event.key !== "Backspace") {
        backspaceTapRef.current = { count: 0, last: 0 };
        return;
      }
      const now = Date.now();
      const { last, count } = backspaceTapRef.current;
      const isRapidBackspace = now - last < 600;
      const nextCount = isRapidBackspace ? count + 1 : 1;
      backspaceTapRef.current = { count: nextCount, last: now };
      if (skillSearch.length > 0 && nextCount >= 2) {
        event.preventDefault();
        setSkillSearch("");
        backspaceTapRef.current = { count: 0, last: now };
        return;
      }
      if (
        event.key === "Backspace" &&
        skillSearch.trim().length === 0 &&
        selectedId
      ) {
        onClearSelection?.();
        setSkillSearch("");
      }
    };
    return (
      <div className="flex h-12 md:h-14 w-full items-center gap-3 rounded-md border border-white/10 bg-white/[0.05] px-3 text-sm text-white/80 shadow-[0_0_0_1px_rgba(148,163,184,0.08)] transition focus-within:border-blue-400/60">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-white/[0.08] text-lg">
          {selectedSkill?.icon ?? "🛠️"}
        </span>
        <Input
          value={skillSearch}
          readOnly={false}
          onPointerDown={handlePointerDown}
          onFocus={() => setIsOpen?.(true)}
          onChange={(e) => setSkillSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={selectedSkill?.name ?? "Search skills…"}
          className="h-full flex-1 border-none bg-transparent p-0 text-base font-semibold text-white placeholder:text-white/60 focus-visible:ring-0"
        />
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            setShowSkillFilters((v) => !v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              setShowSkillFilters((v) => !v);
            }
          }}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-md text-white/70 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
            showSkillFilters && "text-white",
          )}
          aria-label="Filter skills"
        >
          <Filter className="h-4 w-4" />
        </div>
      </div>
    );
  }
  const [modalEventType, setModalEventType] = useState<
    "GOAL" | "PROJECT" | "TASK" | "HABIT" | null
  >(null);
  const [showNote, setShowNote] = useState(false);
  const [showPost, setShowPost] = useState(false);
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  const pages = FAB_PAGES;
  const pageCount = FAB_PAGES.length;
  const [activeFabPage, setActiveFabPage] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTargetPage, setDragTargetPage] = useState<number | null>(null);
  const [dragDirection, setDragDirection] = useState<1 | -1 | null>(null);
  const [, setIsAnimatingPageChange] = useState(false);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FabSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchCursor, setSearchCursor] = useState<FabSearchCursor | null>(
    null,
  );
  const [overlayFilterMonumentId, setOverlayFilterMonumentId] =
    useState<string>("");
  const [overlayFilterSkillId, setOverlayFilterSkillId] = useState<string>("");
  const [overlayFilterEventType, setOverlayFilterEventType] =
    useState<OverlayEventTypeFilter>("ALL");
  const [overlaySortMode, setOverlaySortMode] =
    useState<OverlaySortMode>("scheduled");
  const [rescheduleTarget, setRescheduleTarget] =
    useState<FabSearchResult | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isSavingReschedule, setIsSavingReschedule] = useState(false);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSavingFab, setIsSavingFab] = useState(false);
  const fabSavePendingRef = useRef(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const fabRootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const overlayButtonRef = useRef<HTMLButtonElement | null>(null);
  const overlayNexusDropRef = useRef<HTMLButtonElement | null>(null);
  const isDraggingOverlay = Boolean(activeOverlayDragId);
  const searchAbortRef = useRef<AbortController | null>(null);
  const overlayPickerResults = useMemo(() => {
    const matchesMonument = overlayFilterMonumentId.trim().length > 0;
    const matchesSkill = overlayFilterSkillId.trim().length > 0;
    const matchesEventType = overlayFilterEventType !== "ALL";

    const resolveMonumentId = (result: FabSearchResult): string | null => {
      const explicit =
        result.monumentId ??
        result.monument_id ??
        result.goalMonumentId ??
        null;
      if (explicit) {
        return explicit;
      }
      if (result.goalId) {
        const goal = goalsById.get(result.goalId);
        if (goal?.monument_id) {
          return goal.monument_id;
        }
      }
      return null;
    };

    const resolveSkillId = (result: FabSearchResult): string | null =>
      result.skillId ?? result.skill_id ?? null;

    const normalizePriorityValue = (value?: string | null): string | null => {
      if (!value) return null;
      return value
        .trim()
        .toUpperCase()
        .replace(/[\s_]+/g, "-");
    };

    const getPriorityIndex = (result: FabSearchResult): number => {
      const goal = result.goalId ? goalsById.get(result.goalId) : undefined;
      const candidate =
        result.priority ?? result.priority_label ?? goal?.priority ?? null;
      const normalized = normalizePriorityValue(candidate);
      if (!normalized) return -1;
      const index = SCHEDULER_PRIORITY_LABELS.findIndex(
        (label) => label === normalized,
      );
      return index >= 0 ? index : -1;
    };

    const getUpdatedTimestamp = (result: FabSearchResult): number => {
      const value =
        result.updatedAt ??
        result.updated_at ??
        result.nextScheduledAt ??
        result.completedAt ??
        null;
      if (!value) return Number.NEGATIVE_INFINITY;
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
    };

    const parseGlobalRank = (value: unknown): number | null => {
      if (value === null || value === undefined) return null;
      const numeric = typeof value === "number" ? value : Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    };

    const compareByName = (a: FabSearchResult, b: FabSearchResult) =>
      (a.name ?? "").toLowerCase().localeCompare((b.name ?? "").toLowerCase());
    const compareResults = (a: FabSearchResult, b: FabSearchResult) => {
      switch (overlaySortMode) {
        case "recent": {
          return getUpdatedTimestamp(b) - getUpdatedTimestamp(a);
        }
        case "alphabetical": {
          return (a.name ?? "")
            .toLowerCase()
            .localeCompare((b.name ?? "").toLowerCase());
        }
        case "priority": {
          const priorityA = getPriorityIndex(a);
          const priorityB = getPriorityIndex(b);
          if (priorityA !== priorityB) {
            return priorityB - priorityA;
          }
          return 0;
        }
        case "global_rank": {
          const rankA = parseGlobalRank(a.global_rank ?? null);
          const rankB = parseGlobalRank(b.global_rank ?? null);
          if (rankA !== null && rankB !== null) {
            return rankA - rankB;
          }
          if (rankA === null && rankB === null) {
            return 0;
          }
          return rankA === null ? 1 : -1;
        }
        case "scheduled": {
          const aHas = !!a.nextScheduledAt;
          const bHas = !!b.nextScheduledAt;
          if (aHas !== bHas) {
            return aHas ? -1 : 1;
          }
          if (a.nextScheduledAt && b.nextScheduledAt) {
            if (a.nextScheduledAt !== b.nextScheduledAt) {
              return a.nextScheduledAt < b.nextScheduledAt ? -1 : 1;
            }
          }
          return compareByName(a, b);
        }
        default:
          return 0;
      }
    };

    let filtered = searchResults;
    if (matchesMonument) {
      filtered = filtered.filter(
        (result) => resolveMonumentId(result) === overlayFilterMonumentId,
      );
    }
    if (matchesSkill) {
      filtered = filtered.filter(
        (result) => resolveSkillId(result) === overlayFilterSkillId,
      );
    }
    if (matchesEventType) {
      filtered = filtered.filter(
        (result) => result.type === overlayFilterEventType,
      );
    }

    const indexed = filtered.map((result, index) => ({
      result,
      index,
    }));
    indexed.sort((a, b) => {
      const diff = compareResults(a.result, b.result);
      if (diff !== 0) return diff;
      return a.index - b.index;
    });
    return indexed.map(({ result }) => result);
  }, [
    goalsById,
    overlayFilterMonumentId,
    overlayFilterSkillId,
    overlayFilterEventType,
    overlaySortMode,
    searchResults,
  ]);
  const goalFilterMenuRef = useRef<HTMLDivElement | null>(null);
  const skillFilterMenuRef = useRef<HTMLDivElement | null>(null);
  const taskProjectFilterMenuRef = useRef<HTMLDivElement | null>(null);
  const [menuWidth, setMenuWidth] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageWidth, setStageWidth] = useState(0);
  const pageX = useMotionValue(0);
  const pageDragControls = useDragControls();
  const prefersReducedMotion = useReducedMotion();
  const router = useRouter();
  const VERTICAL_WHEEL_TRIGGER = 20;
  const DRAG_THRESHOLD_PX = 80;
  const EDGE_SWIPE_ZONE_RATIO = 0.12;
  const nexusInputRef = useRef<HTMLInputElement | null>(null);
  const overhangPos = useOverhangLT(panelRef, [expanded, selected], {
    listenVisualViewport: !expanded,
  });
  const [stableViewportHeight, setStableViewportHeight] = useState<
    number | null
  >(null);
  const [stableSafeBottom, setStableSafeBottom] = useState(0);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [keyboardLift, setKeyboardLift] = useState(0);
  const [isTextInputFocused, setIsTextInputFocused] = useState(false);
  const isKeyboardVisible = useMemo(() => {
    if (!expanded) return false;
    if (keyboardLift <= 12) return false;
    if (stableViewportHeight && viewportHeight) {
      const shrink = stableViewportHeight - viewportHeight;
      return shrink > 80;
    }
    return keyboardLift > 24;
  }, [expanded, keyboardLift, stableViewportHeight, viewportHeight]);
  const shouldHideOverhangButtons =
    expanded && (isKeyboardVisible || isTextInputFocused);

  useEffect(() => {
    if (!expanded) return;
    const measureOnce = () => {
      if (typeof window === "undefined") return;
      const height = Math.max(
        window.innerHeight,
        window.visualViewport?.height ?? 0,
      );
      setStableViewportHeight((prev) => prev ?? height);
      setViewportHeight(
        (prev) => prev ?? window.visualViewport?.height ?? window.innerHeight,
      );
      const safeBottom =
        Number.parseFloat(
          getComputedStyle(document.documentElement)
            .getPropertyValue("--sat-safe-bottom")
            .trim() || "0",
        ) || 0;
      setStableSafeBottom((prev) => prev || safeBottom);
    };
    const handleResize = () => {
      if (typeof window === "undefined") return;
      const nextHeight = window.innerHeight;
      setStableViewportHeight((prev) => {
        if (prev === null) return nextHeight;
        // Ignore shrinkage (likely keyboard); allow growth (rotation/fullscreen).
        if (nextHeight > prev * 0.98) return nextHeight;
        return prev;
      });
    };
    measureOnce();
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", measureOnce);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", measureOnce);
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded) {
      setKeyboardLift(0);
      setIsTextInputFocused(false);
      return;
    }
    const updateLift = () => {
      if (typeof window === "undefined") return;
      const viewport = window.visualViewport;
      if (!viewport) {
        setKeyboardLift(0);
        return;
      }
      const viewportH = viewport.height ?? window.innerHeight;
      if (viewportH) {
        setViewportHeight(viewportH);
      }
      const heightLoss = Math.max(0, window.innerHeight - viewport.height);
      const offsetTop = viewport.offsetTop ?? 0;
      const lift = Math.max(0, heightLoss - offsetTop - stableSafeBottom);
      setKeyboardLift(lift);
    };
    updateLift();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", updateLift);
    viewport?.addEventListener("scroll", updateLift);
    window.addEventListener("orientationchange", updateLift);
    return () => {
      viewport?.removeEventListener("resize", updateLift);
      viewport?.removeEventListener("scroll", updateLift);
      window.removeEventListener("orientationchange", updateLift);
    };
  }, [expanded, stableSafeBottom]);

  useEffect(() => {
    if (!expanded) {
      setIsTextInputFocused(false);
      return;
    }
    const isTextEntryElement = (el: Element | null) => {
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      const editable = (el as HTMLElement).isContentEditable;
      return (
        editable ||
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLInputElement &&
          el.type !== "button" &&
          el.type !== "submit" &&
          el.type !== "reset")
      );
    };
    const handleFocusIn = (event: FocusEvent) => {
      setIsTextInputFocused(isTextEntryElement(event.target as Element));
    };
    const handleFocusOut = () => {
      setIsTextInputFocused(isTextEntryElement(document.activeElement));
    };
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);
    return () => {
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("focusout", handleFocusOut, true);
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded) {
      setGoalSearch("");
      setGoalFilterEnergy("");
      setGoalFilterMonumentId("");
      setGoalFilterPriority("");
      setGoalFilterSkillId("");
      setGoalSort("recent");
      setShowGoalFilters(false);
      setSkillSearch("");
      setSkillFilterMonumentId("");
      setShowSkillFilters(false);
    }
  }, [expanded]);

  useEffect(() => {
    if (!showGoalFilters) return;
    const handleClick = (event: MouseEvent) => {
      if (isTourActive()) return;
      const target = event.target as Node | null;
      if (
        !target ||
        fabRootRef.current?.contains(target) ||
        !goalFilterMenuRef.current
      ) {
        return;
      }
      if (!goalFilterMenuRef.current.contains(target)) {
        setShowGoalFilters(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showGoalFilters]);

  useEffect(() => {
    if (!showSkillFilters) return;
    const handleClick = (event: MouseEvent) => {
      if (isTourActive()) return;
      const target = event.target as Node | null;
      if (
        !target ||
        fabRootRef.current?.contains(target) ||
        !skillFilterMenuRef.current
      ) {
        return;
      }
      if (!skillFilterMenuRef.current.contains(target)) {
        setShowSkillFilters(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSkillFilters]);
  useEffect(() => {
    if (!showTaskProjectFilters) return;
    const handleClick = (event: MouseEvent) => {
      if (isTourActive()) return;
      const target = event.target as Node | null;
      if (
        !target ||
        fabRootRef.current?.contains(target) ||
        !taskProjectFilterMenuRef.current
      ) {
        return;
      }
      if (!taskProjectFilterMenuRef.current.contains(target)) {
        setShowTaskProjectFilters(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showTaskProjectFilters]);

  const formatDateInput = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(date.getDate()).padStart(2, "0")}`;

  const formatTimeInput = (date: Date) =>
    `${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes(),
    ).padStart(2, "0")}`;

  const fetchNextScheduledInstance = useCallback(
    async (sourceId: string, sourceType: "PROJECT" | "HABIT") => {
      const params = new URLSearchParams({ sourceId, sourceType });
      const response = await fetch(
        `/api/schedule/instances/next?${params.toString()}`,
      );
      if (!response.ok) {
        return null;
      }
      const payload = (await response.json().catch(() => null)) as {
        instanceId: string | null;
        startUtc: string | null;
        durationMinutes?: number | null;
      } | null;
      return payload ?? null;
    },
    [],
  );

  const buildSearchUrl = useCallback(
    (cursor: FabSearchCursor | null) => {
      const trimmed = searchQuery.trim();
      const params = new URLSearchParams();
      if (trimmed.length > 0) {
        params.set("q", trimmed);
      }
      params.set("sort", overlaySortMode);
      if (cursor) {
        params.set("cursorStartUtc", cursor.startUtc);
        params.set("cursorSourceType", cursor.sourceType);
        params.set("cursorSourceId", cursor.sourceId);
      }
      return `/api/schedule/search?${params.toString()}`;
    },
    [overlaySortMode, searchQuery],
  );

  const runSearch = useCallback(
    async ({
      cursor,
      append,
      signal,
    }: {
      cursor: FabSearchCursor | null;
      append: boolean;
      signal?: AbortSignal;
    }) => {
      const response = await fetch(buildSearchUrl(cursor), { signal });
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }
      const payload = (await response.json()) as {
        results?: FabSearchResult[];
        nextCursor?: {
          startUtc?: string | null;
          sourceType?: "PROJECT" | "HABIT" | null;
          sourceId?: string | null;
        } | null;
      };
      const nextCursor =
        payload.nextCursor?.startUtc &&
        payload.nextCursor?.sourceType &&
        payload.nextCursor?.sourceId
          ? {
              startUtc: payload.nextCursor.startUtc,
              sourceType: payload.nextCursor.sourceType,
              sourceId: payload.nextCursor.sourceId,
            }
          : null;
      if (!signal?.aborted) {
        setSearchResults((prev) =>
          append
            ? [...prev, ...(payload.results ?? [])]
            : (payload.results ?? []),
        );
        setSearchCursor(nextCursor);
      }
    },
    [buildSearchUrl],
  );

  const notifySchedulerOfChange = useCallback(async () => {
    try {
      const timeZone =
        typeof Intl !== "undefined"
          ? (Intl.DateTimeFormat().resolvedOptions().timeZone ?? null)
          : null;
      const payload = {
        localNow: new Date().toISOString(),
        timeZone,
        utcOffsetMinutes: -new Date().getTimezoneOffset(),
        mode: { type: "REGULAR" },
        writeThroughDays: 1,
      };
      await fetch("/api/scheduler/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error("Failed to notify scheduler", error);
    }
  }, []);

  const resetSearchState = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
    setSearchCursor(null);
    setSearchError(null);
    setIsSearching(false);
    setIsLoadingMore(false);
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
      searchAbortRef.current = null;
    }
  }, []);

  const resetFabFormState = useCallback(() => {
    setProjectName("");
    setProjectStage("RESEARCH");
    setProjectDuration("");
    setProjectPriority("MEDIUM");
    setProjectEnergy("MEDIUM");
    setProjectWhy("");
    setProjectSkillIds([]);
    setProjectGoalId(null);

    setGoalName("");
    setGoalMonumentId("");
    setGoalPriority("MEDIUM");
    setGoalEnergy("MEDIUM");
    setGoalWhy("");
    setGoalDue(null);

    setTaskName("");
    setTaskStage("PRODUCE");
    setTaskDuration("");
    setTaskPriority("MEDIUM");
    setTaskEnergy("MEDIUM");
    setTaskProjectId("");
    setTaskSkillId("");
    setTaskNotes("");

    setHabitName("");
    setHabitType(defaultHabitType);
    setHabitRecurrence(defaultHabitRecurrence);
    setHabitDuration("15");
    setHabitEnergy("LOW");
    setHabitGoalId("");
    setHabitSkillId("");
    setHabitWhy("");
    setHabitRoutineId("");
    setIsCreatingHabitRoutineInline(false);
    setHabitInlineRoutineName("");
    setHabitInlineRoutineDescription("");

    setSaveError(null);
  }, [defaultHabitRecurrence, defaultHabitType]);

  type MenuPalette = {
    base: [number, number, number];
    highlight: [number, number, number];
    lowlight: [number, number, number];
  };

  const MENU_PALETTES: readonly MenuPalette[] = [
    {
      base: [55, 65, 81],
      highlight: [90, 110, 135],
      lowlight: [25, 30, 40],
    },
    {
      base: [8, 17, 28],
      highlight: [50, 80, 120],
      lowlight: [2, 4, 10],
    },
    {
      base: [10, 12, 24],
      highlight: [86, 60, 140],
      lowlight: [4, 6, 18],
    },
  ];

  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

  const getMenuPalette = (pageIndex: number): MenuPalette =>
    MENU_PALETTES[pageIndex];

  const lerp = (start: number, end: number, t: number) =>
    start + (end - start) * t;

  const createPaletteBackground = (palette: MenuPalette) => {
    const [r, g, b] = palette.base;
    const [hr, hg, hb] = palette.highlight;
    const [lr, lg, lb] = palette.lowlight;
    return `radial-gradient(circle at top, rgba(${hr}, ${hg}, ${hb}, 0.65), rgba(${r}, ${g}, ${b}, 0.15) 45%), linear-gradient(160deg, rgba(${hr}, ${hg}, ${hb}, 0.95) 0%, rgba(${r}, ${g}, ${b}, 0.97) 50%, rgba(${lr}, ${lg}, ${lb}, 0.98) 100%)`;
  };

  const createPaletteBorderColor = (palette: MenuPalette) =>
    `rgba(${palette.highlight[0]}, ${palette.highlight[1]}, ${palette.highlight[2]}, 0.35)`;

  const MENU_BOX_SHADOW =
    "0 18px 36px rgba(15, 23, 42, 0.55), 0 8px 18px rgba(15, 23, 42, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08)";

  const menuConfigs = {
    default: {
      primary: [
        {
          label: "GOAL",
          eventType: "GOAL" as const,
          color: "hover:bg-gray-600",
        },
        {
          label: "PROJECT",
          eventType: "PROJECT" as const,
          color: "hover:bg-gray-600",
        },
        {
          label: "TASK",
          eventType: "TASK" as const,
          color: "hover:bg-gray-600",
        },
        {
          label: "HABIT",
          eventType: "HABIT" as const,
          color: "hover:bg-gray-600",
        },
      ],
      secondary: [
        { label: "SERVICE" },
        { label: "PRODUCT" },
        { label: "POST" },
        { label: "NOTE" },
      ],
      menuClassName: "left-1/2 -translate-x-1/2",
      itemAlignmentClass: "text-left",
    },
    timeline: {
      primary: [
        {
          label: "GOAL",
          eventType: "GOAL" as const,
          color: "hover:bg-gray-600",
        },
        {
          label: "PROJECT",
          eventType: "PROJECT" as const,
          color: "hover:bg-gray-600",
        },
        {
          label: "TASK",
          eventType: "TASK" as const,
          color: "hover:bg-gray-600",
        },
        {
          label: "HABIT",
          eventType: "HABIT" as const,
          color: "hover:bg-gray-600",
        },
      ],
      secondary: [
        { label: "NOTE" },
        { label: "POST" },
        { label: "SERVICE" },
        { label: "PRODUCT" },
      ],
      menuClassName: "right-0 origin-bottom-right text-left",
      itemAlignmentClass: "text-left",
    },
  } as const;

  const { primary, secondary, menuClassName, itemAlignmentClass } =
    menuConfigs[menuVariant];
  const menuContainerHeight = primary.length * 56;
  const shouldRenderTimelineOverlayButton =
    !expanded && isOpen && menuVariant === "timeline";
  const getOverlayPlacementDurationMinutes = useCallback(
    (result: FabSearchResult | null) =>
      Math.max(
        1,
        Math.min(
          overlayWindowMinutes,
          result?.durationMinutes ?? OVERLAY_PLACEMENT_DEFAULT_DURATION_MINUTES,
        ),
      ),
    [overlayWindowMinutes],
  );
  const overlayPlacementDurationMinutes = getOverlayPlacementDurationMinutes(
    overlayPickerSelected,
  );
  const handleAddFromNexusClick = () => {
    setOverlayPickerOpen(true);
    setOverlayPickerSelected(null);
    setSearchError(null);
  };

  const handleOverlayPickerResult = (result: FabSearchResult) => {
    const durationMinutes = getOverlayPlacementDurationMinutes(result);
    setOverlayPlacedItems((previous) => {
      const sequentialStartMinutes = getNextSequentialStartMinutes(
        previous,
        overlayStartTime,
        overlayWindowMinutes,
        durationMinutes,
      );
      const placementStart = overlayMinutesToDate(
        sequentialStartMinutes,
        overlayStartTime,
      );
      const placementEnd = overlayMinutesToDate(
        sequentialStartMinutes + durationMinutes,
        overlayStartTime,
      );
      return normalizeOverlayPlacements(
        [
          ...previous,
          {
            id: createOverlayPlacementId(),
            type: result.type,
            name: result.name,
            start: placementStart,
            end: placementEnd,
            locked: true,
            habitType: result.habitType ?? null,
            goalName: result.goalName ?? null,
            energy: result.energy ?? null,
            sourceId: result.id,
          },
        ],
        overlayStartTime,
        overlayEndTime,
      );
    });
    setOverlayPickerSelected(null);
    setOverlayPickerOpen(false);
  };

  const handleOverlayPickerClose = () => {
    setOverlayPickerOpen(false);
  };

  const handlePlacementCancel = () => {
    setOverlayPickerSelected(null);
  };

  const handleTimelineClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!overlayPickerSelected || overlayDurationMinutes <= 0) return;
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const clickRatio = Math.max(
      0,
      Math.min(1, (event.clientY - rect.top) / rect.height),
    );
    const rawMinutes = clickRatio * overlayDurationMinutes;
    const snappedMinutes = snapMinutesToFive(rawMinutes);
    const placementDurationMinutes = overlayPlacementDurationMinutes;
    const clampedMinutes = clampOverlayPlacementStart(
      snappedMinutes,
      placementDurationMinutes,
      overlayWindowMinutes,
    );
    const placementStart = overlayMinutesToDate(
      clampedMinutes,
      overlayStartTime,
    );
    const placementEnd = overlayMinutesToDate(
      clampedMinutes + placementDurationMinutes,
      overlayStartTime,
    );
    setOverlayPlacedItems((previous) =>
      normalizeOverlayPlacements(
        [
          ...previous,
          {
            id: `${overlayPickerSelected.id}-${placementStart.getTime()}`,
            type: overlayPickerSelected.type,
            name: overlayPickerSelected.name,
            start: placementStart,
            end: placementEnd,
            locked: true,
            habitType: overlayPickerSelected.habitType ?? null,
            sourceId: overlayPickerSelected.id,
          },
        ],
        overlayStartTime,
        overlayEndTime,
      ),
    );
    setOverlayPickerSelected(null);
  };
  const handleLiveOverlaySave = useCallback(async () => {
    if (isSavingLiveOverlay) return;
    if (overlayEndTime.getTime() <= overlayStartTime.getTime()) {
      setOverlaySaveError("Overlay end time must be after the start time.");
      return;
    }
    setOverlaySaveError(null);
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setOverlaySaveError("Unable to reach Supabase.");
      return;
    }
    setIsSavingLiveOverlay(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("You must be signed in to save overlays.");
      const scheduleDate = `${overlayStartTime.getFullYear()}-${String(
        overlayStartTime.getMonth() + 1,
      ).padStart(
        2,
        "0",
      )}-${String(overlayStartTime.getDate()).padStart(2, "0")}`;
      const { data: overlayRow, error: overlayError } = await supabase
        .from("overlay_windows" as any)
        .insert({
          user_id: user.id,
          schedule_date: scheduleDate,
          start_utc: overlayStartTime.toISOString(),
          end_utc: overlayEndTime.toISOString(),
          label: null,
        })
        .select("id")
        .single();
      if (overlayError) throw overlayError;
      const overlayWindowId = overlayRow?.id;
      if (!overlayWindowId) throw new Error("Overlay window id missing.");
      if (overlayPlacedItems.length > 0) {
        const savedItems: {
          placement: OverlayPlacement;
          scheduleInstanceId: string;
        }[] = [];
        for (const placement of overlayPlacedItems) {
          const startUTC = placement.start.toISOString();
          const endUTC = placement.end.toISOString();
          const durationMin = Math.max(
            1,
            Math.round(
              (placement.end.getTime() - placement.start.getTime()) / 60000,
            ),
          );
          const { data: scheduleRow, error: scheduleError } = await supabase
            .from("schedule_instances" as any)
            .insert({
              user_id: user.id,
              source_type: placement.type,
              source_id: placement.sourceId,
              start_utc: startUTC,
              end_utc: endUTC,
              duration_min: durationMin,
              status: "scheduled",
              locked: true,
              event_name: placement.name,
              overlay_window_id: overlayWindowId,
              weight_snapshot: 0,
              energy_resolved: placement.energy ?? "NO",
            })
            .select("id")
            .single();
          if (scheduleError) throw scheduleError;
          const scheduleInstanceId = scheduleRow?.id;
          if (!scheduleInstanceId) {
            throw new Error("Schedule instance id missing.");
          }
          savedItems.push({ placement, scheduleInstanceId });
        }
        const { error: itemsError } = await supabase
          .from("overlay_window_items" as any)
          .insert(
            savedItems.map(({ placement, scheduleInstanceId }) => ({
              overlay_window_id: overlayWindowId,
              user_id: user.id,
              source_type: placement.type,
              source_id: placement.sourceId ?? null,
              start_utc: placement.start.toISOString(),
              end_utc: placement.end.toISOString(),
              locked: true,
              event_name: placement.name,
              schedule_instance_id: scheduleInstanceId,
            })),
          );
        if (itemsError) throw itemsError;
      }
      resetOverlayDraft();
      setOverlayOpen(false);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("schedule:overlay-windows-updated"),
        );
      }
    } catch (error) {
      const supabaseErrorMessage = (() => {
        if (error && typeof error === "object") {
          const payload = error as Record<string, unknown>;
          const parts: string[] = [];
          const add = (value: unknown) => {
            if (typeof value === "string" && value.trim().length > 0) {
              parts.push(value.trim());
            }
          };
          add(payload.message);
          add(payload.details);
          add(payload.hint);
          if (parts.length > 0) {
            return parts.join(" ");
          }
        }
        return null;
      })();
      const message =
        supabaseErrorMessage ??
        (error instanceof Error ? error.message : null) ??
        "Unable to save overlay.";
      console.error("Failed to save overlay window", message, error);
      setOverlaySaveError(message);
    } finally {
      setIsSavingLiveOverlay(false);
    }
  }, [
    isSavingLiveOverlay,
    overlayEndTime,
    overlayPlacedItems,
    overlayStartTime,
    resetOverlayDraft,
  ]);
  const handleOverlayDragStart = useCallback(
    (placement: OverlayPlacement, event: PointerEvent, info: PanInfo) => {
      setActiveOverlayDragId(placement.id);
      setOverlayRemovalCandidateId(null);
      setOverlayDragModeWithRef("reorder");
      const startMinutes = overlayDateToMinutes(
        placement.start,
        overlayStartTime,
      );
      const durationMinutes = Math.max(
        1,
        overlayDateToMinutes(placement.end, placement.start),
      );
      const clampedStartMinutes = clampOverlayPlacementStart(
        startMinutes,
        durationMinutes,
        overlayWindowMinutes,
      );
      overlayDragMetaRef.current = {
        baseStartMinutes: clampedStartMinutes,
        durationMinutes,
      };
      overlayDragIntentRef.current = {
        axis: null,
        startPoint: { x: info.point.x, y: info.point.y },
        lastSnappedMinutes: clampedStartMinutes,
      };
      setOverlayDragCandidate({
        placementId: placement.id,
        startMinutes: clampedStartMinutes,
        durationMinutes,
        baseStartMinutes: clampedStartMinutes,
      });
    },
    [
      overlayStartTime,
      overlayWindowMinutes,
      overlayTimelinePxPerMin,
      setOverlayDragModeWithRef,
    ],
  );

  const handleOverlayDragEnd = useCallback(
    (placement: OverlayPlacement, info: PanInfo) => {
      const intent = overlayDragIntentRef.current;
      const currentMode = overlayDragModeRef.current;
      const candidate = overlayDragCandidate;
      const meta = overlayDragMetaRef.current;
      const overTrashZone = isPointerOverTrashZone(info.point);
      const previewResolvedLayout = lastResolvedOverlayLayoutRef.current;

      setActiveOverlayDragId(null);
      setOverlayRemovalCandidateId(null);
      setOverlayDragCandidate(null);
      setOverlayDragModeWithRef(null);
      overlayDragIntentRef.current = {
        axis: null,
        startPoint: null,
        lastSnappedMinutes: null,
      };
      overlayDragMetaRef.current = null;

      if (currentMode === "remove" && overTrashZone) {
        setOverlayPlacedItems((previous) =>
          removeOverlayPlacement(
            previous,
            placement.id,
            overlayStartTime,
            overlayEndTime,
          ),
        );
        setOverlayRemovalCandidateId(null);
        return;
      }

      const durationMinutes =
        meta?.durationMinutes ??
        Math.max(
          1,
          (placement.end.getTime() - placement.start.getTime()) / 60000,
        );
      const desiredStartMinutes =
        candidate?.startMinutes ??
        overlayDateToMinutes(placement.start, overlayStartTime);
      const clampedMinutes = clampOverlayPlacementStart(
        desiredStartMinutes,
        durationMinutes,
        overlayWindowMinutes,
      );
      const direction: OverlayLayoutDirection =
        clampedMinutes > (meta?.baseStartMinutes ?? desiredStartMinutes)
          ? "forward"
          : clampedMinutes < (meta?.baseStartMinutes ?? desiredStartMinutes)
            ? "backward"
            : "none";
      setOverlayPlacedItems((previous) => {
        const resolved =
          previewResolvedLayout ??
          resolveOverlayPlacementLayout({
            placements: previous,
            overlayStartTime,
            overlayWindowMinutes,
            movingPlacementId: placement.id,
            durationMinutes,
            targetStartMinutes: clampedMinutes,
            rawTargetStartMinutes:
              overlayDragCandidate?.startMinutes ?? desiredStartMinutes,
            direction,
          });
        return resolved;
      });
    },
    [
      overlayEndTime,
      overlayStartTime,
      overlayWindowMinutes,
      setOverlayDragModeWithRef,
      overlayDragCandidate,
      isPointerOverTrashZone,
    ],
  );
  const parseTimeValue = (value: string) => {
    const [hoursStr, minutesStr] = value.split(":");
    if (hoursStr === undefined || minutesStr === undefined) {
      return null;
    }
    const hours = Number(hoursStr);
    const minutes = Number(minutesStr);
    if (
      Number.isNaN(hours) ||
      Number.isNaN(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return null;
    }
    return { hours, minutes };
  };
  const handleStartTimeInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setOverlayStartInputValue(event.target.value);
    const parsed = parseTimeValue(event.target.value);
    if (!parsed) return;
    const { hours, minutes } = parsed;
    const nextStart = new Date(overlayStartTime);
    nextStart.setHours(hours, minutes, 0, 0);
    const currentDurationMs = Math.max(
      MIN_OVERLAY_DURATION_MS,
      overlayEndTime.getTime() - overlayStartTime.getTime(),
    );
    const clampedDurationMs = Math.min(
      MAX_OVERLAY_DURATION_MS,
      currentDurationMs,
    );
    setOverlayStartTime(nextStart);
    setOverlayEndTime(new Date(nextStart.getTime() + clampedDurationMs));
  };
  const handleEndTimeInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setOverlayEndInputValue(event.target.value);
    const parsed = parseTimeValue(event.target.value);
    if (!parsed) return;
    const { hours, minutes } = parsed;
    const nextEnd = new Date(overlayStartTime);
    nextEnd.setHours(hours, minutes, 0, 0);
    if (nextEnd.getTime() <= overlayStartTime.getTime()) {
      nextEnd.setDate(nextEnd.getDate() + 1);
    }
    const desiredDurationMs = nextEnd.getTime() - overlayStartTime.getTime();
    const clampedDurationMs = Math.min(
      MAX_OVERLAY_DURATION_MS,
      Math.max(MIN_OVERLAY_DURATION_MS, desiredDurationMs),
    );
    setOverlayEndTime(new Date(overlayStartTime.getTime() + clampedDurationMs));
  };

  const menuVariants = {
    closed: {
      opacity: 0,
      clipPath: "inset(100% 0% 0% 0%)",
      transition: { type: "tween", ease: "easeInOut", duration: 0.2 },
    },
    open: {
      opacity: 1,
      clipPath: "inset(0% 0% 0% 0%)",
      transition: {
        type: "tween",
        ease: "easeOut",
        duration: 0.25,
        staggerChildren: 0.05,
        delayChildren: 0.1,
      },
    },
  } as const;

  const itemVariants = {
    closed: {
      opacity: 0,
      y: 10,
      transition: { type: "tween", ease: "easeIn", duration: 0.15 },
    },
    open: {
      opacity: 1,
      y: 0,
      transition: { type: "tween", ease: "easeOut", duration: 0.15 },
    },
  } as const;

  const pageVariants = {
    closed: {},
    open: {},
  } as const;

  const normalizedStageWidth = Math.max(stageWidth, 1);
  const dragProgress = useTransform(pageX, (latest) => {
    const width = normalizedStageWidth;
    const ratio = Math.abs(latest) / (width || 1);
    return clamp01(ratio);
  });
  const incomingFromRight = useTransform(pageX, (latest) => {
    const width = normalizedStageWidth;
    const clamped = Math.max(-width, Math.min(0, latest));
    return width + clamped;
  });
  const incomingFromLeft = useTransform(pageX, (latest) => {
    const width = normalizedStageWidth;
    const clamped = Math.max(0, Math.min(width, latest));
    return -width + clamped;
  });

  const renderPrimaryPage = () => (
    <div className={cn("flex w-full flex-col", expanded ? "p-0" : "px-4 py-2")}>
      {!expanded &&
        primary.map((event) => (
          <motion.button
            key={event.label}
            variants={itemVariants}
            onClick={() => handleEventClick(event.eventType)}
            className={cn(
              "w-full px-6 py-3 text-white font-medium transition-colors duration-200 border-b border-gray-700 last:border-b-0 whitespace-nowrap",
              itemAlignmentClass,
              event.color,
            )}
          >
            <span className="text-sm opacity-80">add</span>{" "}
            <span className="text-lg font-bold">{event.label}</span>
          </motion.button>
        ))}
      <AnimatePresence>
        {expanded ? (
          <motion.div
            key="fab-expanded-placeholder"
            className="relative mt-0 bg-black/80"
            aria-label="Expanded placeholder"
          >
            <div
              className="relative grid gap-4 p-4 pb-4 md:p-8 md:pb-6"
              style={{
                paddingBottom: `calc(0.5rem + env(safe-area-inset-bottom, 0px) + ${keyboardLift}px)`,
                scrollPaddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${keyboardLift + 16}px)`,
              }}
            >
              {selected === "GOAL" && (
                <>
                  <div className="grid gap-2">
                    <Select
                      value={goalMonumentId ?? ""}
                      onValueChange={setGoalMonumentId}
                      hideChevron
                      triggerClassName={cn(
                        "h-auto border-0 bg-transparent p-0 text-xs font-semibold shadow-none underline decoration-dotted underline-offset-4",
                        goalMonumentId
                          ? "text-white/80 hover:text-blue-200"
                          : "text-red-400/80 drop-shadow-[0_0_4px_rgba(248,113,113,0.15)] animate-[goalLinkPulse_4.4s_ease-in-out_infinite]",
                      )}
                      trigger={
                        <span>
                          {goalMonumentId
                            ? (monuments.find((m) => m.id === goalMonumentId)
                                ?.title ?? "Link to existing MONUMENT +")
                            : "Link to existing MONUMENT +"}
                        </span>
                      }
                    >
                      <SelectContent className="min-w-[220px]">
                        <SelectItem value="">No monument</SelectItem>
                        {monumentsLoading ? (
                          <SelectItem value="__loading" disabled>
                            Loading monuments…
                          </SelectItem>
                        ) : monuments.length > 0 ? (
                          monuments.map((monument) => (
                            <SelectItem key={monument.id} value={monument.id}>
                              <div className="flex items-center gap-2">
                                <span className="text-lg">
                                  {monument.emoji ?? "🏛️"}
                                </span>
                                <span>{monument.title}</span>
                              </div>
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="__empty" disabled>
                            No monuments yet
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-4 gap-4 md:grid-cols-[3fr_1fr]">
                    <div className="grid gap-2 col-span-3">
                      <Label htmlFor="goal-name" className="sr-only">
                        Goal name
                      </Label>
                      <Input
                        id="goal-name"
                        value={goalName}
                        onChange={(e) =>
                          setGoalName(e.target.value.toUpperCase())
                        }
                        placeholder="Name your GOAL"
                        className="h-12 md:h-14 rounded-md !border-white/10 bg-white/[0.05] text-lg md:text-xl font-extrabold leading-tight placeholder:font-extrabold focus:!border-blue-400/60 focus-visible:ring-0"
                      />
                    </div>
                    <div className="grid gap-2 col-span-1">
                      <Label className="sr-only">Energy</Label>
                      <EnergyCycleButton
                        value={goalEnergy}
                        onChange={setGoalEnergy}
                        ariaLabel="Goal energy"
                        className="h-12 w-full md:h-14"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="grid gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        PRIORITY
                      </Label>
                      <Select
                        value={goalPriority}
                        onValueChange={setGoalPriority}
                        triggerClassName="h-12 md:h-14 rounded-md text-[11px] uppercase tracking-[0.12em]"
                        contentWrapperClassName="min-w-[240px] sm:min-w-[280px]"
                        placeholder="Priority"
                      >
                        <SelectContent>
                          {PRIORITY_OPTIONS_LOCAL.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        DUE
                      </Label>
                      <input
                        id="goal-due"
                        type="datetime-local"
                        className="h-12 md:h-14 w-full rounded-md border border-white/10 bg-white/[0.05] px-3 text-sm text-white/80 focus:!border-blue-400/60 focus-visible:ring-0"
                        value={goalDue ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setGoalDue(value === "" ? null : value);
                        }}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="goal-why" className="text-zinc-500">
                      WHY (optional)
                    </Label>
                    <Textarea
                      id="goal-why"
                      value={goalWhy}
                      onChange={(e) => setGoalWhy(e.target.value)}
                      placeholder="Motivation…"
                      className="border border-white/10 bg-white/[0.05] focus:border-blue-400/60 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-none"
                    />
                  </div>
                </>
              )}

              {selected === "PROJECT" && (
                <>
                  <div className="grid grid-cols-[2fr_1fr] gap-4">
                    <div className="grid gap-2">
                      <Label className="sr-only">Goal</Label>
                      <Select
                        value={projectGoalId ?? ""}
                        onValueChange={(v) => setProjectGoalId(v)}
                        hideChevron
                        triggerClassName={cn(
                          "h-auto border-0 bg-transparent p-0 text-xs font-semibold shadow-none underline decoration-dotted underline-offset-4",
                          projectGoalId
                            ? "text-white/80 hover:text-blue-200"
                            : "text-red-400/80 drop-shadow-[0_0_4px_rgba(248,113,113,0.15)] animate-[goalLinkPulse_4.4s_ease-in-out_infinite]",
                        )}
                        trigger={
                          <span>
                            {projectGoalId
                              ? (goals.find((g) => g.id === projectGoalId)
                                  ?.name ?? "Link to existing GOAL +")
                              : "Link to existing GOAL +"}
                          </span>
                        }
                      >
                        <SelectContent className="relative min-w-[220px]">
                          <div className="sticky top-0 z-10 bg-black/80 p-2 backdrop-blur border-b border-white/5">
                            <div className="relative flex items-center gap-2">
                              <Input
                                value={goalSearch}
                                onChange={(e) => setGoalSearch(e.target.value)}
                                placeholder="Search goals…"
                                className="h-9 text-sm border-white/10 bg-white/[0.05] text-white placeholder:text-white/60 focus:border-blue-400/60 focus-visible:ring-0"
                              />
                              <button
                                type="button"
                                onClick={() => setShowGoalFilters((v) => !v)}
                                className={cn(
                                  "flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/70 transition hover:border-white/30 hover:text-white",
                                  showGoalFilters &&
                                    "border-blue-400/60 text-white",
                                )}
                                aria-label="Filter goals"
                              >
                                <Filter className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          {showGoalFilters ? (
                            <div
                              ref={goalFilterMenuRef}
                              className="absolute inset-0 z-30 flex flex-col bg-black/95 backdrop-blur-md"
                            >
                              <div className="flex items-center justify-between border-b border-white/10 px-3 py-3 text-white">
                                <span className="text-sm font-semibold">
                                  Filter & Sort Goals
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setShowGoalFilters(false)}
                                  className="text-xs text-white/80 underline-offset-4 hover:underline"
                                >
                                  Close
                                </button>
                              </div>
                              <div className="flex-1 overflow-auto px-3 py-3 text-sm text-white/85">
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-3">
                                    <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                      Filter
                                    </div>
                                    <div className="space-y-2">
                                      <select
                                        value={goalFilterSkillId}
                                        onChange={(e) =>
                                          setGoalFilterSkillId(e.target.value)
                                        }
                                        className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                      >
                                        <option value="">
                                          {goalFilterSkillId
                                            ? "Skill (clear)"
                                            : "Skill (any)"}
                                        </option>
                                        {skills.map((skill) => (
                                          <option
                                            key={skill.id}
                                            value={skill.id}
                                          >
                                            {skill.name}
                                          </option>
                                        ))}
                                      </select>
                                      <select
                                        value={goalFilterMonumentId}
                                        onChange={(e) =>
                                          setGoalFilterMonumentId(
                                            e.target.value,
                                          )
                                        }
                                        className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                      >
                                        <option value="">
                                          {goalFilterMonumentId
                                            ? "Monument (clear)"
                                            : "Monument (any)"}
                                        </option>
                                        {monuments.map((m) => (
                                          <option key={m.id} value={m.id}>
                                            {(m.emoji ?? "✨") +
                                              " " +
                                              (m.title ?? "Monument")}
                                          </option>
                                        ))}
                                      </select>
                                      <select
                                        value={goalFilterEnergy}
                                        onChange={(e) =>
                                          setGoalFilterEnergy(e.target.value)
                                        }
                                        className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                      >
                                        <option value="">
                                          {goalFilterEnergy
                                            ? "Energy (clear)"
                                            : "Energy (any)"}
                                        </option>
                                        {ENERGY_OPTIONS_LOCAL.map((o) => (
                                          <option key={o.value} value={o.value}>
                                            {o.label}
                                          </option>
                                        ))}
                                      </select>
                                      <select
                                        value={goalFilterPriority}
                                        onChange={(e) =>
                                          setGoalFilterPriority(e.target.value)
                                        }
                                        className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                      >
                                        <option value="">
                                          {goalFilterPriority
                                            ? "Priority (clear)"
                                            : "Priority (any)"}
                                        </option>
                                        {PRIORITY_OPTIONS_LOCAL.map((o) => (
                                          <option key={o.value} value={o.value}>
                                            {o.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                  <div className="space-y-3">
                                    <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                      Sort
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setGoalSort("recent")}
                                        className={cn(
                                          "w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30",
                                          goalSort === "recent" &&
                                            "border-blue-400/60 bg-blue-500/10 text-white",
                                        )}
                                      >
                                        Recently updated
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setGoalSort("oldest")}
                                        className={cn(
                                          "w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30",
                                          goalSort === "oldest" &&
                                            "border-blue-400/60 bg-blue-500/10 text-white",
                                        )}
                                      >
                                        Oldest updated
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setGoalSort("weight")}
                                        className={cn(
                                          "w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30",
                                          goalSort === "weight" &&
                                            "border-blue-400/60 bg-blue-500/10 text-white",
                                        )}
                                      >
                                        Highest weight
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}
                          {goalsLoading ? (
                            <SelectItem value="" disabled>
                              Loading goals…
                            </SelectItem>
                          ) : goals.length > 0 ? (
                            filteredGoals.length > 0 ? (
                              filteredGoals.map((goal) => (
                                <SelectItem key={goal.id} value={goal.id}>
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg">
                                      {goal.emoji ??
                                        goal.monumentEmoji ??
                                        monumentEmojiMap.get(
                                          (goal as any).monument_id ??
                                            (goal as any).monumentId ??
                                            "",
                                        ) ??
                                        "✨"}
                                    </span>
                                    <span>{goal.name}</span>
                                  </div>
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value="" disabled>
                                No goals match your search
                              </SelectItem>
                            )
                          ) : (
                            <SelectItem value="" disabled>
                              No goals yet
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-start justify-end text-right">
                      {projectedRankState.status === "incomplete" ? (
                        <p className="text-sm font-semibold tracking-wide text-zinc-500">
                          ∞
                        </p>
                      ) : projectedRankState.status === "loading" ? (
                        <div className="flex items-center gap-2 text-[10px] text-white/70">
                          <Loader2 className="h-3 w-3 animate-spin text-white/70" />
                          <span>Calculating…</span>
                        </div>
                      ) : projectedRankState.status === "error" ? (
                        <p className="text-[10px] text-red-300">
                          Couldn&apos;t calculate rank:{" "}
                          {projectedRankState.message}
                        </p>
                      ) : (
                        <p className="text-sm font-semibold tracking-wide text-zinc-500">
                          #{projectedRankState.data.rank}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-4 md:grid-cols-[3fr_1fr]">
                    <div className="grid gap-2 col-span-3">
                      <Label htmlFor="project-name" className="sr-only">
                        Project name
                      </Label>
                      <Input
                        id="project-name"
                        value={projectName}
                        onChange={(e) =>
                          setProjectName(e.target.value.toUpperCase())
                        }
                        placeholder="Name your PROJECT"
                        className="h-12 md:h-14 rounded-md !border-white/10 bg-white/[0.05] text-lg md:text-xl font-extrabold leading-tight placeholder:font-extrabold focus:!border-blue-400/60 focus-visible:ring-0"
                      />
                    </div>
                    <div className="grid gap-2 col-span-1">
                      <Label className="sr-only">Energy</Label>
                      <EnergyCycleButton
                        value={projectEnergy}
                        onChange={setProjectEnergy}
                        ariaLabel="Project energy"
                        className="h-12 w-full md:h-14"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-[1.6fr_1.2fr_1fr] gap-4">
                    <div className="grid gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        PRIORITY
                      </Label>
                      <Select
                        value={projectPriority}
                        onValueChange={setProjectPriority}
                        triggerClassName="h-12 md:h-14 rounded-md text-[11px] uppercase tracking-[0.12em]"
                        contentWrapperClassName="min-w-[240px] sm:min-w-[280px]"
                        placeholder="Priority"
                      >
                        <SelectContent>
                          {PRIORITY_OPTIONS_LOCAL.map((o) => (
                            <SelectItem
                              key={o.value}
                              value={o.value}
                              label={o.label}
                            >
                              <div className="flex w-full items-center justify-between gap-3">
                                <span>{o.label}</span>
                                <span className="w-10 text-right text-red-400">
                                  {PRIORITY_ICON_MAP[o.value] ?? ""}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        STAGE
                      </Label>
                      <Select
                        value={projectStage}
                        onValueChange={setProjectStage}
                        triggerClassName="h-12 md:h-14 rounded-md text-[11px] uppercase tracking-[0.12em]"
                        placeholder="Stage"
                      >
                        <SelectContent>
                          {PROJECT_STAGE_OPTIONS_LOCAL.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2 items-end">
                      <div className="relative">
                        <button
                          type="button"
                          {...projectDurationTapHandlers}
                          ref={durationTriggerRef}
                          className="flex h-12 md:h-14 w-full items-center gap-3 rounded-md border border-white/10 bg-white/[0.05] px-3 text-sm text-white/80 shadow-[0_0_0_1px_rgba(148,163,184,0.08)] transition hover:border-white/20 touch-manipulation"
                          aria-haspopup="dialog"
                          aria-expanded={showDurationPicker}
                          aria-controls="project-duration-picker"
                          layout
                          layoutTransition={{
                            type: "spring",
                            stiffness: 600,
                            damping: 60,
                          }}
                        >
                          <span className="flex h-12 w-12 flex-col items-center justify-center rounded-md bg-white/[0.08]">
                            <Clock className="h-6 w-6 text-white/80" />
                            <span className="mt-1 text-[10px] font-semibold leading-none text-white/80">
                              {normalizedProjectDuration || 30}m
                            </span>
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                  {showDurationPicker && durationPosition
                    ? createPortal(
                        <div
                          data-fab-overlay
                          id="project-duration-picker"
                          ref={durationPickerRef}
                          className="z-[2147483652] rounded-md border border-white/10 bg-black/90 p-3 shadow-xl backdrop-blur"
                          style={{
                            position: "absolute",
                            top: durationPosition.top,
                            left: durationPosition.left,
                            width: durationPosition.width,
                            touchAction: "manipulation",
                          }}
                          onTouchStart={(event) => event.stopPropagation()}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <button
                              type="button"
                              {...projectDurationMinusTapHandlers}
                              className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-lg font-bold text-white hover:border-white/30 touch-manipulation"
                            >
                              -
                            </button>
                            <div className="text-lg font-semibold text-white">
                              {normalizedProjectDuration || 30} min
                            </div>
                            <button
                              type="button"
                              {...projectDurationPlusTapHandlers}
                              className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-lg font-bold text-white hover:border-white/30 touch-manipulation"
                            >
                              +
                            </button>
                          </div>
                        </div>,
                        document.body,
                      )
                    : null}
                  {showHabitDurationPicker && habitDurationPosition
                    ? createPortal(
                        <div
                          data-fab-overlay
                          id="habit-duration-picker"
                          ref={habitDurationPickerRef}
                          className="z-[2147483652] rounded-md border border-white/10 bg-black/90 p-3 shadow-xl backdrop-blur"
                          style={{
                            position: "absolute",
                            top: habitDurationPosition.top,
                            left: habitDurationPosition.left,
                            width: habitDurationPosition.width,
                            touchAction: "manipulation",
                          }}
                          onTouchStart={(event) => event.stopPropagation()}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <button
                              type="button"
                              {...habitDurationMinusTapHandlers}
                              className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-lg font-bold text-white hover:border-white/30 touch-manipulation"
                            >
                              -
                            </button>
                            <div className="text-lg font-semibold text-white">
                              {habitDuration || 15} min
                            </div>
                            <button
                              type="button"
                              {...habitDurationPlusTapHandlers}
                              className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-lg font-bold text-white hover:border-white/30 touch-manipulation"
                            >
                              +
                            </button>
                          </div>
                        </div>,
                        document.body,
                      )
                    : null}
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                      SKILL
                    </Label>
                    <Select
                      value={projectSkillIds[0] ?? ""}
                      onOpenChange={handleSkillDropdownOpenChange}
                      onValueChange={(value) => {
                        setProjectSkillIds(value ? [value] : []);
                        const skill = findSkillById(value);
                        setSkillSearch(skill?.name ?? "");
                        setShowSkillFilters(false);
                      }}
                      placeholder="Link a skill"
                      triggerClassName="!h-12 md:!h-14 !border-none !bg-transparent !p-0 shadow-none focus-visible:ring-0"
                      contentWrapperClassName="w-full max-h-[150px] overflow-y-auto overscroll-contain"
                      maxHeight={150}
                      openOnTriggerFocus
                      trigger={
                        <SkillTrigger
                          selectedId={projectSkillIds[0] ?? null}
                          onClearSelection={() => {
                            setProjectSkillIds([]);
                            setSkillSearch("");
                          }}
                        />
                      }
                    >
                      <SelectContent className="relative min-w-[220px] w-full max-h-none overflow-y-auto overscroll-contain">
                        {showSkillFilters ? (
                          <div
                            ref={skillFilterMenuRef}
                            className="absolute inset-0 z-30 flex flex-col bg-black/95 backdrop-blur-md"
                          >
                            <div className="flex items-center justify-between border-b border-white/10 px-3 py-3 text-white">
                              <span className="text-sm font-semibold">
                                Filter Skills
                              </span>
                              <button
                                type="button"
                                onClick={() => setShowSkillFilters(false)}
                                className="text-xs text-white/80 underline-offset-4 hover:underline"
                              >
                                Close
                              </button>
                            </div>
                            <div className="flex-1 overflow-auto px-3 py-3 text-sm text-white/85">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-3">
                                  <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                    Filter
                                  </div>
                                  <div className="space-y-2">
                                    <select
                                      value={skillFilterMonumentId}
                                      onChange={(e) =>
                                        setSkillFilterMonumentId(e.target.value)
                                      }
                                      className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                    >
                                      <option value="">
                                        {skillFilterMonumentId
                                          ? "Monument (clear)"
                                          : "Monument (any)"}
                                      </option>
                                      {monuments.map((m) => (
                                        <option key={m.id} value={m.id}>
                                          {(m.emoji ?? "✨") +
                                            " " +
                                            (m.title ?? "Monument")}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                    Quick actions
                                  </div>
                                  <div className="grid grid-cols-1 gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setSkillSearch("")}
                                      className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                    >
                                      Reset search
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSkillFilterMonumentId("")
                                      }
                                      className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                    >
                                      Clear filters
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                        {skillsLoading ? (
                          <SelectItem value="__loading" disabled>
                            Loading skills…
                          </SelectItem>
                        ) : filteredSkills.length > 0 ? (
                          renderGroupedSkillItems()
                        ) : (
                          <SelectItem value="__empty" disabled>
                            No skills found
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="project-why" className="text-zinc-500">
                      WHY (optional)
                    </Label>
                    <Textarea
                      id="project-why"
                      value={projectWhy}
                      onChange={(e) => setProjectWhy(e.target.value)}
                      placeholder="Add context…"
                      className="border border-white/10 bg-white/[0.05] focus:border-blue-400/60 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-none"
                    />
                  </div>
                </>
              )}

              {selected === "TASK" && (
                <>
                  <div className="grid gap-2">
                    <Select
                      value={taskProjectId ?? ""}
                      onValueChange={setTaskProjectId}
                      onOpenChange={(open) => {
                        if (!open) {
                          setShowTaskProjectFilters(false);
                        }
                      }}
                      hideChevron
                      triggerClassName={cn(
                        "h-auto border-0 bg-transparent p-0 text-xs font-semibold shadow-none underline decoration-dotted underline-offset-4",
                        taskProjectId
                          ? "text-white/80 hover:text-blue-200"
                          : "text-red-400/80 drop-shadow-[0_0_4px_rgba(248,113,113,0.15)] animate-[goalLinkPulse_4.4s_ease-in-out_infinite]",
                      )}
                      trigger={
                        <span>
                          {taskProjectId
                            ? (taskProjects.find((p) => p.id === taskProjectId)
                                ?.name ?? "Link to existing PROJECT +")
                            : "Link to existing PROJECT +"}
                        </span>
                      }
                    >
                      <SelectContent className="relative min-w-[220px]">
                        <div className="sticky top-0 z-10 bg-black/80 p-2 backdrop-blur border-b border-white/5">
                          <div className="relative flex items-center gap-2">
                            <Input
                              value={taskProjectSearch}
                              onChange={(e) =>
                                setTaskProjectSearch(e.target.value)
                              }
                              placeholder="Search projects…"
                              className="h-9 text-sm border-white/10 bg-white/[0.05] text-white placeholder:text-white/60 focus:border-blue-400/60 focus-visible:ring-0"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setShowTaskProjectFilters((v) => !v)
                              }
                              className={cn(
                                "flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/70 transition hover:border-white/30 hover:text-white",
                                showTaskProjectFilters &&
                                  "border-blue-400/60 text-white",
                              )}
                              aria-label="Filter projects"
                            >
                              <Filter className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        {showTaskProjectFilters ? (
                          <div
                            ref={taskProjectFilterMenuRef}
                            className="absolute inset-0 z-30 flex flex-col bg-black/95 backdrop-blur-md"
                          >
                            <div className="flex items-center justify-between border-b border-white/10 px-3 py-3 text-white">
                              <span className="text-sm font-semibold">
                                Filter Projects
                              </span>
                              <button
                                type="button"
                                onClick={() => setShowTaskProjectFilters(false)}
                                className="text-xs text-white/80 underline-offset-4 hover:underline"
                              >
                                Close
                              </button>
                            </div>
                            <div className="flex-1 overflow-auto px-3 py-3 text-sm text-white/85">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-3">
                                  <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                    Filter
                                  </div>
                                  <div className="space-y-2">
                                    <select
                                      value={taskProjectFilterStage}
                                      onChange={(e) =>
                                        setTaskProjectFilterStage(
                                          e.target.value,
                                        )
                                      }
                                      className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                    >
                                      <option value="">
                                        {taskProjectFilterStage
                                          ? "Stage (clear)"
                                          : "Stage (any)"}
                                      </option>
                                      {PROJECT_STAGE_OPTIONS_LOCAL.map(
                                        (stage) => (
                                          <option
                                            key={stage.value}
                                            value={stage.value}
                                          >
                                            {stage.label}
                                          </option>
                                        ),
                                      )}
                                    </select>
                                    <select
                                      value={taskProjectFilterPriority}
                                      onChange={(e) =>
                                        setTaskProjectFilterPriority(
                                          e.target.value,
                                        )
                                      }
                                      className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                    >
                                      <option value="">
                                        {taskProjectFilterPriority
                                          ? "Priority (clear)"
                                          : "Priority (any)"}
                                      </option>
                                      {PRIORITY_OPTIONS_LOCAL.map((p) => (
                                        <option key={p.value} value={p.value}>
                                          {p.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                    Quick actions
                                  </div>
                                  <div className="grid grid-cols-1 gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setTaskProjectSearch("")}
                                      className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                    >
                                      Reset search
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setTaskProjectFilterStage("");
                                        setTaskProjectFilterPriority("");
                                      }}
                                      className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                    >
                                      Clear filters
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                        {taskProjectsLoading ? (
                          <SelectItem value="__loading" disabled>
                            Loading projects…
                          </SelectItem>
                        ) : filteredTaskProjects.length > 0 ? (
                          filteredTaskProjects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {project.name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="__empty" disabled>
                            {taskProjectSearch.trim().length > 0
                              ? "No projects found"
                              : "No projects yet"}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-4 gap-4 md:grid-cols-[3fr_1fr]">
                    <div className="grid gap-2 col-span-3">
                      <Label htmlFor="task-name" className="sr-only">
                        Task name
                      </Label>
                      <Input
                        id="task-name"
                        value={taskName}
                        onChange={(e) =>
                          setTaskName(e.target.value.toUpperCase())
                        }
                        placeholder="Name your TASK"
                        className="h-12 md:h-14 rounded-md !border-white/10 bg-white/[0.05] text-lg md:text-xl font-extrabold leading-tight placeholder:font-extrabold focus:!border-blue-400/60 focus-visible:ring-0"
                      />
                    </div>
                    <div className="grid gap-2 col-span-1">
                      <Label className="sr-only">Energy</Label>
                      <EnergyCycleButton
                        value={taskEnergy}
                        onChange={setTaskEnergy}
                        ariaLabel="Task energy"
                        className="h-12 w-full md:h-14"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-[1.6fr_1.2fr_1fr] gap-4">
                    <div className="grid gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        PRIORITY
                      </Label>
                      <Select
                        value={taskPriority}
                        onValueChange={setTaskPriority}
                        triggerClassName="h-12 md:h-14 rounded-md text-[11px] uppercase tracking-[0.12em]"
                        contentWrapperClassName="min-w-[240px] sm:min-w-[280px]"
                        placeholder="Priority"
                      >
                        <SelectContent>
                          {PRIORITY_OPTIONS_LOCAL.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        STAGE
                      </Label>
                      <Select
                        value={taskStage}
                        onValueChange={setTaskStage}
                        triggerClassName="h-12 md:h-14 rounded-md text-[11px] uppercase tracking-[0.12em]"
                        placeholder="Stage"
                      >
                        <SelectContent>
                          {TASK_STAGE_OPTIONS_LOCAL.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        DURATION
                      </Label>
                      <button
                        type="button"
                        {...taskDurationTapHandlers}
                        ref={taskDurationTriggerRef}
                        className="flex h-12 md:h-14 w-full items-center gap-3 rounded-md border border-white/10 bg-white/[0.05] px-3 text-sm text-white/80 shadow-[0_0_0_1px_rgba(148,163,184,0.08)] transition hover:border-white/20 touch-manipulation"
                        aria-haspopup="dialog"
                        aria-expanded={showTaskDurationPicker}
                        aria-controls="task-duration-picker"
                      >
                        <span className="flex h-12 w-12 flex-col items-center justify-center rounded-md bg-white/[0.08]">
                          <Clock className="h-6 w-6 text-white/80" />
                          <span className="mt-1 text-[10px] font-semibold leading-none text-white/80">
                            {taskDuration || 30}m
                          </span>
                        </span>
                      </button>
                    </div>
                  </div>
                  {showTaskDurationPicker && taskDurationPosition
                    ? createPortal(
                        <div
                          data-fab-overlay
                          id="task-duration-picker"
                          ref={taskDurationPickerRef}
                          className="z-[2147483652] rounded-md border border-white/10 bg-black/90 p-3 shadow-xl backdrop-blur"
                          style={{
                            position: "absolute",
                            top: taskDurationPosition.top,
                            left: taskDurationPosition.left,
                            width: taskDurationPosition.width,
                            touchAction: "manipulation",
                          }}
                          onTouchStart={(event) => event.stopPropagation()}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <button
                              type="button"
                              {...taskDurationMinusTapHandlers}
                              className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-lg font-bold text-white hover:border-white/30 touch-manipulation"
                            >
                              -
                            </button>
                            <div className="text-lg font-semibold text-white">
                              {Number.parseInt(taskDuration || "30", 10)} min
                            </div>
                            <button
                              type="button"
                              {...taskDurationPlusTapHandlers}
                              className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-lg font-bold text-white hover:border-white/30 touch-manipulation"
                            >
                              +
                            </button>
                          </div>
                        </div>,
                        document.body,
                      )
                    : null}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="grid gap-2">
                      <Label>Skill</Label>
                      <Select
                        value={taskSkillId ?? ""}
                        onOpenChange={handleSkillDropdownOpenChange}
                        onValueChange={(value) => {
                          setTaskSkillId(value);
                          const skill = findSkillById(value);
                          setSkillSearch(skill?.name ?? "");
                          setShowSkillFilters(false);
                        }}
                        placeholder="Link a skill"
                        triggerClassName="!h-12 md:!h-14 !border-none !bg-transparent !p-0 shadow-none focus-visible:ring-0"
                        contentWrapperClassName="w-full max-h-[150px] overflow-y-auto overscroll-contain"
                        maxHeight={150}
                        openOnTriggerFocus
                        trigger={
                          <SkillTrigger
                            selectedId={taskSkillId ?? null}
                            onClearSelection={() => {
                              setTaskSkillId("");
                              setSkillSearch("");
                            }}
                          />
                        }
                      >
                        <SelectContent className="relative min-w-[220px] w-full max-h-none overflow-y-auto overscroll-contain">
                          {showSkillFilters ? (
                            <div
                              ref={skillFilterMenuRef}
                              className="absolute inset-0 z-30 flex flex-col bg-black/95 backdrop-blur-md"
                            >
                              <div className="flex items-center justify-between border-b border-white/10 px-3 py-3 text-white">
                                <span className="text-sm font-semibold">
                                  Filter Skills
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setShowSkillFilters(false)}
                                  className="text-xs text-white/80 underline-offset-4 hover:underline"
                                >
                                  Close
                                </button>
                              </div>
                              <div className="flex-1 overflow-auto px-3 py-3 text-sm text-white/85">
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-3">
                                    <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                      Filter
                                    </div>
                                    <div className="space-y-2">
                                      <select
                                        value={skillFilterMonumentId}
                                        onChange={(e) =>
                                          setSkillFilterMonumentId(
                                            e.target.value,
                                          )
                                        }
                                        className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                      >
                                        <option value="">
                                          {skillFilterMonumentId
                                            ? "Monument (clear)"
                                            : "Monument (any)"}
                                        </option>
                                        {monuments.map((m) => (
                                          <option key={m.id} value={m.id}>
                                            {(m.emoji ?? "✨") +
                                              " " +
                                              (m.title ?? "Monument")}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                  <div className="space-y-3">
                                    <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                      Quick actions
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setSkillSearch("")}
                                        className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                      >
                                        Reset search
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setSkillFilterMonumentId("")
                                        }
                                        className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                      >
                                        Clear filters
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}
                          {skillsLoading ? (
                            <SelectItem value="__loading" disabled>
                              Loading skills…
                            </SelectItem>
                          ) : filteredSkills.length > 0 ? (
                            renderGroupedSkillItems()
                          ) : (
                            <SelectItem value="__empty" disabled>
                              No skills found
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2 md:col-span-2">
                      <Label htmlFor="task-notes">Notes (optional)</Label>
                      <Textarea
                        id="task-notes"
                        value={taskNotes}
                        onChange={(e) => setTaskNotes(e.target.value)}
                        placeholder="Context…"
                        className="border border-white/10 bg-white/[0.05] focus:border-blue-400/60 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-none"
                      />
                    </div>
                  </div>
                </>
              )}

              {selected === "HABIT" && (
                <>
                  <div className="grid gap-2">
                    <Select
                      value={habitRoutineId ?? ""}
                      onValueChange={(value) => {
                        if (value === "__create__") {
                          setHabitRoutineId("");
                          setIsCreatingHabitRoutineInline(true);
                          setHabitInlineRoutineName("");
                          setHabitInlineRoutineDescription("");
                          return;
                        }
                        setIsCreatingHabitRoutineInline(false);
                        setHabitInlineRoutineName("");
                        setHabitInlineRoutineDescription("");
                        setHabitRoutineId(value);
                      }}
                      hideChevron
                      triggerClassName={cn(
                        "h-auto border-0 bg-transparent p-0 text-xs font-semibold shadow-none underline decoration-dotted underline-offset-4",
                        habitRoutineId
                          ? "text-white/80 hover:text-blue-200"
                          : "text-zinc-600/90 drop-shadow-[0_0_4px_rgba(39,39,42,0.32)] animate-[goalLinkPulse_4.4s_ease-in-out_infinite]",
                      )}
                      trigger={
                        <span>
                          {habitRoutineId
                            ? (habitRoutines.find(
                                (r) => r.id === habitRoutineId,
                              )?.name ?? "Link to existing ROUTINE +")
                            : "Link to existing ROUTINE +"}
                        </span>
                      }
                    >
                      <SelectContent className="min-w-[220px]">
                        <SelectItem value="__create__">
                          <div className="flex items-center gap-2 text-white">
                            <Plus className="h-4 w-4" />
                            <span>Create new routine</span>
                          </div>
                        </SelectItem>
                        {habitRoutinesLoading ? (
                          <SelectItem value="__loading" disabled>
                            Loading routines…
                          </SelectItem>
                        ) : habitRoutines.length > 0 ? (
                          habitRoutines.map((routine) => (
                            <SelectItem key={routine.id} value={routine.id}>
                              <div className="flex flex-col">
                                <span className="font-medium">
                                  {routine.name}
                                </span>
                                {routine.description ? (
                                  <span className="text-xs text-white/60">
                                    {routine.description}
                                  </span>
                                ) : null}
                              </div>
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="__empty" disabled>
                            No routines yet
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {isCreatingHabitRoutineInline && (
                      <div className="grid gap-2">
                        <Label htmlFor="habit-inline-routine-name">
                          Routine name
                        </Label>
                        <Input
                          id="habit-inline-routine-name"
                          value={habitInlineRoutineName}
                          onChange={(event) =>
                            setHabitInlineRoutineName(event.target.value)
                          }
                          placeholder="Name the routine"
                          className="h-12 md:h-12 rounded-md !border-white/10 bg-white/[0.05] focus:!border-blue-400/60 focus-visible:ring-0"
                        />
                        <Label htmlFor="habit-inline-routine-description">
                          Description
                        </Label>
                        <Textarea
                          id="habit-inline-routine-description"
                          value={habitInlineRoutineDescription}
                          onChange={(event) =>
                            setHabitInlineRoutineDescription(event.target.value)
                          }
                          placeholder="Describe what this routine does (optional)"
                          rows={2}
                          className="min-h-[68px] rounded-md border border-white/10 bg-white/[0.05] focus-visible:ring-0"
                        />
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-4 md:grid-cols-[3fr_1fr]">
                    <div className="grid gap-2 col-span-3">
                      <Label htmlFor="habit-name" className="sr-only">
                        Habit name
                      </Label>
                      <Input
                        id="habit-name"
                        value={habitName}
                        onChange={(e) =>
                          setHabitName(e.target.value.toUpperCase())
                        }
                        placeholder="Name your HABIT"
                        className="h-12 md:h-14 rounded-md !border-white/10 bg-white/[0.05] text-lg md:text-xl font-extrabold leading-tight placeholder:font-extrabold focus:!border-blue-400/60 focus-visible:ring-0"
                      />
                    </div>
                    <div className="grid gap-2 col-span-1">
                      <Label className="sr-only">Energy</Label>
                      <EnergyCycleButton
                        value={habitEnergy}
                        onChange={setHabitEnergy}
                        ariaLabel="Habit energy"
                        className="h-12 w-full md:h-14"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-[1.6fr_1.2fr_1fr] gap-4">
                    <div className="grid gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        TYPE
                      </Label>
                      <Select
                        value={habitType}
                        onValueChange={setHabitType}
                        triggerClassName="h-12 md:h-14 rounded-md text-[11px] uppercase tracking-[0.12em]"
                        placeholder="Type"
                      >
                        <SelectContent>
                          {HABIT_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        RECURRENCE
                      </Label>
                      <Select
                        value={habitRecurrence}
                        onValueChange={setHabitRecurrence}
                        triggerClassName="h-12 md:h-14 rounded-md text-[11px] uppercase tracking-[0.12em]"
                        placeholder="Recurrence"
                      >
                        <SelectContent>
                          {HABIT_RECURRENCE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2 items-end">
                      <div className="relative">
                        <button
                          type="button"
                          {...habitDurationTapHandlers}
                          ref={habitDurationTriggerRef}
                          className="flex h-12 md:h-14 w-full items-center gap-3 rounded-md border border-white/10 bg-white/[0.05] px-3 text-sm text-white/80 shadow-[0_0_0_1px_rgba(148,163,184,0.08)] transition hover:border-white/20 touch-manipulation"
                          aria-haspopup="dialog"
                          aria-expanded={showHabitDurationPicker}
                          aria-controls="habit-duration-picker"
                        >
                          <span className="flex h-12 w-12 flex-col items-center justify-center rounded-md bg-white/[0.08]">
                            <Clock className="h-6 w-6 text-white/80" />
                            <span className="mt-1 text-[10px] font-semibold leading-none text-white/80">
                              {Number.parseInt(habitDuration || "15", 10)}m
                            </span>
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                      SKILL
                    </Label>
                    <Select
                      value={habitSkillId ?? ""}
                      onOpenChange={handleSkillDropdownOpenChange}
                      onValueChange={(value) => {
                        setHabitSkillId(value);
                        const skill = findSkillById(value);
                        setSkillSearch(skill?.name ?? "");
                        setShowSkillFilters(false);
                      }}
                      placeholder="Link a skill"
                      triggerClassName="!h-12 md:!h-14 !border-none !bg-transparent !p-0 shadow-none focus-visible:ring-0"
                      contentWrapperClassName="w-full max-h-[150px] overflow-y-auto overscroll-contain"
                      maxHeight={150}
                      openOnTriggerFocus
                      trigger={
                        <SkillTrigger
                          selectedId={habitSkillId ?? null}
                          onClearSelection={() => {
                            setHabitSkillId("");
                            setSkillSearch("");
                          }}
                        />
                      }
                    >
                      <SelectContent className="relative min-w-[220px] w-full max-h-none overflow-y-auto overscroll-contain">
                        {showSkillFilters ? (
                          <div
                            ref={skillFilterMenuRef}
                            className="absolute inset-0 z-30 flex flex-col bg-black/95 backdrop-blur-md"
                          >
                            <div className="flex items-center justify-between border-b border-white/10 px-3 py-3 text-white">
                              <span className="text-sm font-semibold">
                                Filter Skills
                              </span>
                              <button
                                type="button"
                                onClick={() => setShowSkillFilters(false)}
                                className="text-xs text-white/80 underline-offset-4 hover:underline"
                              >
                                Close
                              </button>
                            </div>
                            <div className="flex-1 overflow-auto px-3 py-3 text-sm text-white/85">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-3">
                                  <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                    Filter
                                  </div>
                                  <div className="space-y-2">
                                    <select
                                      value={skillFilterMonumentId}
                                      onChange={(e) =>
                                        setSkillFilterMonumentId(e.target.value)
                                      }
                                      className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                    >
                                      <option value="">
                                        {skillFilterMonumentId
                                          ? "Monument (clear)"
                                          : "Monument (any)"}
                                      </option>
                                      {monuments.map((m) => (
                                        <option key={m.id} value={m.id}>
                                          {(m.emoji ?? "✨") +
                                            " " +
                                            (m.title ?? "Monument")}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                    Quick actions
                                  </div>
                                  <div className="grid grid-cols-1 gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setSkillSearch("")}
                                      className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                    >
                                      Reset search
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSkillFilterMonumentId("")
                                      }
                                      className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                    >
                                      Clear filters
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                        {skillsLoading ? (
                          <SelectItem value="__loading" disabled>
                            Loading skills…
                          </SelectItem>
                        ) : filteredSkills.length > 0 ? (
                          renderGroupedSkillItems()
                        ) : (
                          <SelectItem value="__empty" disabled>
                            No skills found
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {showHabitDurationPicker && habitDurationPosition
                    ? createPortal(
                        <div
                          id="habit-duration-picker"
                          className="z-[2147483652] rounded-md border border-white/10 bg-black/90 p-3 shadow-xl backdrop-blur"
                          style={{
                            position: "absolute",
                            top: habitDurationPosition.top,
                            left: habitDurationPosition.left,
                            width: habitDurationPosition.width,
                            touchAction: "manipulation",
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <button
                              type="button"
                              {...habitDurationMinusTapHandlers}
                              className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-lg font-bold text-white hover:border-white/30 touch-manipulation"
                            >
                              -
                            </button>
                            <div className="text-lg font-semibold text-white">
                              {habitDuration || 15} min
                            </div>
                            <button
                              type="button"
                              {...habitDurationPlusTapHandlers}
                              className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-lg font-bold text-white hover:border-white/30 touch-manipulation"
                            >
                              +
                            </button>
                          </div>
                        </div>,
                        document.body,
                      )
                    : null}
                </>
              )}
            </div>

            {saveError ? (
              <p className="text-xs text-red-300">{saveError}</p>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );

  const renderSecondaryPage = () => (
    <div className="flex w-full flex-col px-4 py-2">
      {secondary.map((event) => (
        <motion.button
          key={event.label}
          variants={itemVariants}
          onClick={() => handleExtraClick(event.label)}
          className={cn(
            "w-full px-6 py-3 text-white font-medium transition-colors duration-200 border-b border-gray-700 last:border-b-0 hover:bg-gray-800 whitespace-nowrap",
            itemAlignmentClass,
          )}
        >
          <span className="text-sm opacity-80">add</span>{" "}
          <span className="text-lg font-bold">{event.label}</span>
        </motion.button>
      ))}
    </div>
  );

  const renderNexusPage = () => (
    <FabNexus
      query={searchQuery}
      onQueryChange={setSearchQuery}
      results={searchResults}
      isSearching={isSearching}
      isLoadingMore={isLoadingMore}
      error={searchError}
      hasMore={Boolean(searchCursor)}
      onLoadMore={handleLoadMoreResults}
      onSelectResult={handleOpenReschedule}
      inputRef={nexusInputRef}
    />
  );

  const renderPage = (pageIndex: number) => {
    const page = pages[pageIndex];
    if (page === "primary") {
      return renderPrimaryPage();
    }
    if (page === "secondary") {
      return renderSecondaryPage();
    }
    return renderNexusPage();
  };

  const handleEventClick = (
    eventType: "GOAL" | "PROJECT" | "TASK" | "HABIT",
  ) => {
    // Ensure any in-progress drag state cannot leave the neighbor overlay visible.
    setIsDragging(false);
    setDragTargetPage(null);
    setDragDirection(null);
    pageX.set(0);

    if (expanded) {
      setSelected(eventType);
      return;
    }
    setExpanded(true);
    setSelected(eventType);
  };

  const handleExtraClick = (label: string) => {
    setIsOpen(false);
    if (label === "NOTE") {
      setShowNote(true);
    } else if (label === "POST") {
      setShowPost(true);
    } else if (label === "SERVICE" || label === "PRODUCT") {
      router.push(`/source?create=${label.toLowerCase()}`);
    } else {
      setComingSoon(label);
    }
  };

  const handleFabButtonClick = () => {
    if (!isOpen) {
      setIsOpen(true);
      return;
    }
    setAiOpen(true);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as any).__CREATOR_FAB_IS_OPEN__ = isOpen;
    if (!isOpen) return;
    window.dispatchEvent(new CustomEvent("tour:fab-opened"));
  }, [isOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as any).__CREATOR_FAB_AI_IS_OPEN__ = aiOpen;
    if (!aiOpen) return;
    window.dispatchEvent(new CustomEvent("tour:fab-ai-opened"));
  }, [aiOpen]);

  useEffect(() => {
    if (!scopeMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (isTourActive()) return;
      const target = event.target as Node | null;
      if (
        !target ||
        fabRootRef.current?.contains(target) ||
        scopeMenuRef.current?.contains(target) ||
        scopeToggleRef.current?.contains(target)
      ) {
        return;
      }
      setScopeMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [scopeMenuOpen]);

  const handleRunAi = async (prompt?: string) => {
    const rawPrompt = typeof prompt === "string" ? prompt : aiPrompt;
    const trimmedPrompt = rawPrompt.trim();
    if (!trimmedPrompt) return;
    if (quotaExceeded) return;

    const isForced = typeof prompt === "string";
    const isAutoMode = isForced
      ? autoModeActive
      : autoModeActive || scopeSelection === "auto";
    const effectiveScope: AiScope = isForced
      ? aiScope
      : isAutoMode
        ? determineAutoScopeFromPrompt(trimmedPrompt)
        : (scopeSelection as AiScope);

    if (!isForced) {
      if (isAutoMode) {
        setScopeSelection("auto");
      } else {
        setScopeSelection(effectiveScope);
      }
      setAiScope(effectiveScope);
      setAutoModeActive(isAutoMode);
    }

    const userThreadMessage: AiThreadTextMessage = {
      id: createThreadMessageId(),
      role: "user",
      kind: "text",
      content: trimmedPrompt,
      ts: Date.now(),
    };
    const nextThread = [...aiThread, userThreadMessage];
    setAiThread(nextThread);
    const threadPayload: AiThreadPayload[] = nextThread
      .filter(isTextThreadMessage)
      .slice(-10)
      .map(({ role, content }) => ({ role, content }));

    setAiLoading(true);
    setAiError(null);
    setAiResponse(null);
    setAiPrompt("");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch("/api/ai/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          scope: effectiveScope,
          thread: threadPayload,
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      console.log("ILAV payload debug:", {
        singleIntentType: payload?.intent?.type,
        intentsCount: Array.isArray(payload?.intents)
          ? payload.intents.length
          : null,
        intentTypes: Array.isArray(payload?.intents)
          ? payload.intents.map((i) => i.type)
          : null,
      });
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to fetch AI intent");
      }
      setAiResponse(payload);
      const assistantTextMessage = payload?.assistant_message
        ? {
            id: createThreadMessageId(),
            role: "assistant",
            kind: "text",
            content: payload.assistant_message,
            ts: Date.now(),
          }
        : null;
      const intents =
        Array.isArray(payload?.intents) && payload.intents.length
          ? payload.intents
          : payload?.intent
            ? [payload.intent]
            : [];
      const proposalIntents = intents.filter((intent) =>
        PROPOSAL_CARD_TYPES.includes(intent.type),
      );
      const proposalMessages =
        payload && proposalIntents.length
          ? proposalIntents.map((intent) => ({
              id: createThreadMessageId(),
              role: "assistant",
              kind: "proposal",
              ai: { ...payload, intent },
              ts: Date.now(),
            }))
          : [];

      setAiThread((prev) => {
        const updated = [...prev];
        if (assistantTextMessage) {
          updated.push(assistantTextMessage);
        }
        if (proposalMessages.length) {
          updated.push(...proposalMessages);
        }
        return updated;
      });
      if (proposalMessages.length) {
        setProposalFormState((prev) => {
          const updated = { ...prev };
          proposalMessages.forEach((proposalMessage) => {
            updated[proposalMessage.id] = buildInitialProposalFormValues(
              proposalMessage.ai.intent.draft ?? undefined,
              undefined,
              proposalMessage.ai.intent.type,
            );
          });
          return updated;
        });
      }
    } catch (error) {
      const isAbort =
        (error instanceof DOMException && error.name === "AbortError") ||
        (error as any)?.name === "AbortError";
      if (isAbort) {
        console.error("ILAV overlay timeout", error);
        setAiError("ILAV timed out. Try again (or send a shorter message).");
      } else {
        console.error("ILAV overlay error", error);
        setAiError(
          error instanceof Error ? error.message : "Unable to reach ILAV",
        );
      }
    } finally {
      window.clearTimeout(timeoutId);
      setAiLoading(false);
    }
  };

  const handleProposalFieldChange = (
    messageId: string,
    field: string,
    value: string,
  ) => {
    setProposalFormState((prev) => ({
      ...prev,
      [messageId]: {
        ...(prev[messageId] ?? {}),
        [field]: value,
      },
    }));
  };

  const handleSchedulerOpsOverridesChange = useCallback(
    (messageId: string, ops: AiSchedulerOp[] | undefined) => {
      setProposalFormState((prev) => {
        const updated = { ...prev };
        const entry = { ...(updated[messageId] ?? {}) };
        const opsArr = normalizeSchedulerOps(ops);
        if (opsArr.length > 0) {
          entry.schedulerOpsOverrides = opsArr.map(cloneSchedulerOp);
        } else {
          delete entry.schedulerOpsOverrides;
        }
        updated[messageId] = entry;
        return updated;
      });
    },
    [],
  );

  const getDraftValuesForMessage = (
    message: AiThreadProposalMessage,
  ): Record<string, string> => {
    const baseDraft = message.ai.intent.draft ?? {};
    const overrideDraft = message.overrides?.draft ?? {};
    const formDraft = proposalFormState[message.id] ?? {};
    const keys = new Set<string>([
      ...Object.keys(baseDraft),
      ...Object.keys(overrideDraft),
      ...Object.keys(formDraft),
    ]);
    const finalDraft: Record<string, string> = {};
    keys.forEach((key) => {
      const formValue = formDraft[key];
      if (typeof formValue === "string") {
        finalDraft[key] = formValue;
        return;
      }
      if (overrideDraft[key] !== undefined) {
        finalDraft[key] = overrideDraft[key];
        return;
      }
      const baseValue = baseDraft[key];
      finalDraft[key] =
        baseValue === undefined || baseValue === null ? "" : String(baseValue);
    });
    return finalDraft;
  };

  const getSchedulerOpsOverridesForMessage = (
    messageId: string,
  ): AiSchedulerOp[] | undefined => {
    const entry = proposalFormState[messageId];
    if (!entry) return undefined;
    const candidate = entry.schedulerOpsOverrides;
    if (!Array.isArray(candidate)) return undefined;
    return candidate as AiSchedulerOp[];
  };

  const handleSaveProposalEdits = (message: AiThreadProposalMessage) => {
    const finalDraft = getDraftValuesForMessage(message);
    const overrideOpsCandidate = message.overrides?.schedulerOps;
    const overrideOpsFromMessage = Array.isArray(overrideOpsCandidate)
      ? overrideOpsCandidate
      : undefined;
    const overrideOps =
      getSchedulerOpsOverridesForMessage(message.id) ?? overrideOpsFromMessage;
    setAiThread((prev) =>
      prev.map((entry) => {
        if (entry.kind !== "proposal" || entry.id !== message.id) {
          return entry;
        }
        const nextOverrides = {
          ...entry.overrides,
          draft: finalDraft,
        };
        if (overrideOps && overrideOps.length > 0) {
          nextOverrides.schedulerOps = overrideOps;
        } else {
          nextOverrides.schedulerOps = undefined;
        }
        return {
          ...entry,
          overrides: nextOverrides,
        };
      }),
    );
  };

  const handleSendEditedProposal = (message: AiThreadProposalMessage) => {
    const finalDraft = getDraftValuesForMessage(message);
    const payload: Record<string, unknown> = {
      type: message.ai.intent.type,
    };
    if (Object.keys(finalDraft).length > 0) {
      payload.draft = finalDraft;
    }
    const overrideOpsCandidate = message.overrides?.schedulerOps;
    const overrideOpsFromMessage = Array.isArray(overrideOpsCandidate)
      ? overrideOpsCandidate
      : undefined;
    const overrideOps =
      getSchedulerOpsOverridesForMessage(message.id) ?? overrideOpsFromMessage;
    const intentOps = normalizeSchedulerOps(message.ai.intent.ops);
    const ops = overrideOps ?? intentOps;
    if (ops.length > 0) {
      payload.ops = ops;
    }
    const approvedPrompt = `APPROVED_PROPOSAL_JSON: ${JSON.stringify(payload)}`;
    void handleRunAi(approvedPrompt);
  };

  const toggleOpsPreview = (messageId: string) => {
    setOpsPreviewOpenById((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  };

  const interpretWheelGesture = (deltaY: number) => {
    if (deltaY < -VERTICAL_WHEEL_TRIGGER) {
      setIsOpen(true);
      return true;
    }
    return false;
  };

  const handleFabButtonTouchStart = (
    event: React.TouchEvent<HTMLButtonElement>,
  ) => {
    if (!swipeUpToOpen) return;
    setTouchStartY(event.touches[0].clientY);
  };

  const handleFabButtonTouchEnd = (
    event: React.TouchEvent<HTMLButtonElement>,
  ) => {
    if (!swipeUpToOpen || touchStartY === null) return;
    const diffY = event.changedTouches[0].clientY - touchStartY;
    setTouchStartY(null);
    if (diffY < -40 && !isOpen) {
      setIsOpen(true);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
  };

  const handleFabButtonTouchCancel = () => {
    if (!swipeUpToOpen) return;
    setTouchStartY(null);
  };

  const handleFabButtonWheel = (event: React.WheelEvent<HTMLButtonElement>) => {
    if (!swipeUpToOpen) return;
    if (interpretWheelGesture(event.deltaY)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handleOpenReschedule = (result: FabSearchResult) => {
    if (result.type === "PROJECT" && result.isCompleted) {
      return;
    }
    setRescheduleTarget(result);
    setDeleteError(null);
    setRescheduleError(
      result.scheduleInstanceId
        ? null
        : "This event has no upcoming scheduled time.",
    );
    const baseDate = result.nextScheduledAt
      ? new Date(result.nextScheduledAt)
      : new Date();
    if (Number.isNaN(baseDate.getTime())) {
      const now = new Date();
      setRescheduleDate(formatDateInput(now));
      setRescheduleTime(formatTimeInput(now));
      return;
    }
    setRescheduleDate(formatDateInput(baseDate));
    setRescheduleTime(formatTimeInput(baseDate));
  };

  const handleMenuWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!swipeUpToOpen) return;
    if (interpretWheelGesture(event.deltaY)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handleExpandedPointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!expanded) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;

      // Skip most touch/pencil interactions to avoid iOS Safari suppressing the subsequent click,
      // but still focus text inputs so they respond on the first tap.
      const pt = (event as any).pointerType as string | undefined;
      // Only help text inputs on desktop; never programmatically focus buttons.
      const tag = target.tagName;
      const isTextInput =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable;

      if (pt && pt !== "mouse") {
        if (isTextInput) {
          target.focus({ preventScroll: true });
        }
        return;
      }

      if (isTextInput) {
        target.focus({ preventScroll: true });
      }
    },
    [expanded],
  );

  useEffect(() => {
    if (selected !== "PROJECT") return;
    let cancelled = false;
    const loadGoals = async () => {
      try {
        setGoalsLoading(true);
        const supabase = getSupabaseBrowser();
        if (!supabase) return;
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const [goalsData, monumentsResp] = await Promise.all([
          getGoalsForUser(user.id),
          supabase
            .from("monuments")
            .select("id, emoji")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false }),
        ]);
        if (!cancelled) {
          const map = new Map<string, string | null>();
          monumentsResp.data?.forEach((m) => {
            if (m.id) {
              map.set(m.id, m.emoji ?? null);
            }
          });
          setMonumentEmojiMap(map);
          setGoals(
            goalsData.map((goal) => ({
              ...goal,
              monumentEmoji:
                goal.monumentEmoji ??
                map.get(
                  (goal as any).monument_id ?? (goal as any).monumentId ?? "",
                ) ??
                null,
            })),
          );
        }
      } catch (error) {
        console.error("Failed to load goals", error);
        if (!cancelled) {
          setGoals([]);
          setMonumentEmojiMap(new Map());
        }
      } finally {
        if (!cancelled) {
          setGoalsLoading(false);
        }
      }
    };
    void loadGoals();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    const shouldLoadMonuments =
      selected === "GOAL" ||
      overlayOpen ||
      overlayPickerOpen ||
      FAB_PAGES[activeFabPage] === "nexus";
    if (!shouldLoadMonuments) return;
    let cancelled = false;
    const loadMonuments = async () => {
      try {
        setMonumentsLoading(true);
        const supabase = getSupabaseBrowser();
        if (!supabase) {
          setMonumentsLoading(false);
          return;
        }
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setMonumentsLoading(false);
          return;
        }
        const monumentsData = await getMonumentsForUser(user.id);
        if (!cancelled) {
          setMonuments(monumentsData);
          setGoalMonumentId((current) =>
            current && monumentsData.some((m) => m.id === current)
              ? current
              : "",
          );
        }
      } catch (error) {
        console.error("Failed to load monuments", error);
        if (!cancelled) {
          setMonuments([]);
        }
      } finally {
        if (!cancelled) {
          setMonumentsLoading(false);
        }
      }
    };
    void loadMonuments();
    return () => {
      cancelled = true;
    };
  }, [activeFabPage, overlayOpen, overlayPickerOpen, selected]);

  useEffect(() => {
    if (selected !== "TASK") return;
    let cancelled = false;
    const loadProjects = async () => {
      try {
        setTaskProjectsLoading(true);
        const supabase = getSupabaseBrowser();
        if (!supabase) {
          setTaskProjectsLoading(false);
          return;
        }
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setTaskProjectsLoading(false);
          return;
        }
        const projectsData = await getProjectsForUser(user.id);
        if (!cancelled) {
          setTaskProjects(projectsData ?? []);
          setTaskProjectId((current) =>
            current && projectsData.some((p) => p.id === current)
              ? current
              : "",
          );
        }
      } catch (error) {
        console.error("Failed to load projects for tasks", error);
        if (!cancelled) {
          setTaskProjects([]);
        }
      } finally {
        if (!cancelled) {
          setTaskProjectsLoading(false);
        }
      }
    };
    void loadProjects();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    const shouldLoadSkills =
      selected === "HABIT" ||
      selected === "PROJECT" ||
      selected === "TASK" ||
      overlayOpen ||
      overlayPickerOpen ||
      FAB_PAGES[activeFabPage] === "nexus";
    if (!shouldLoadSkills) return;
    let cancelled = false;
    const loadSkills = async () => {
      try {
        setSkillsLoading(true);
        const supabase = getSupabaseBrowser();
        if (!supabase) return;
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) {
            setSkillCategories([]);
          }
          return;
        }
        const [skillsData, categoriesData] = await Promise.all([
          getSkillsForUser(user.id),
          getCatsForUser(user.id, supabase).catch((err) => {
            console.error("Failed to load skill categories", err);
            return [] as CatRow[];
          }),
        ]);
        if (!cancelled) {
          setSkills(skillsData);
          setSkillCategories(categoriesData);
        }
      } catch (error) {
        console.error("Failed to load skills", error);
        if (!cancelled) {
          setSkills([]);
          setSkillCategories([]);
        }
      } finally {
        if (!cancelled) {
          setSkillsLoading(false);
        }
      }
    };
    void loadSkills();
    return () => {
      cancelled = true;
    };
  }, [activeFabPage, overlayOpen, overlayPickerOpen, selected]);

  useEffect(() => {
    if (selected !== "HABIT") return;
    let cancelled = false;
    const loadRoutines = async () => {
      try {
        setHabitRoutinesLoading(true);
        const supabase = getSupabaseBrowser();
        if (!supabase) {
          setHabitRoutinesLoading(false);
          return;
        }
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setHabitRoutinesLoading(false);
          return;
        }
        const { data, error } = await supabase
          .from("habit_routines")
          .select("id, name, description")
          .eq("user_id", user.id)
          .order("name", { ascending: true });
        if (error) throw error;
        if (cancelled) return;
        const routines = data ?? [];
        setHabitRoutines(routines);
        setHabitRoutineId((current) =>
          current && routines.some((r) => r.id === current) ? current : "",
        );
      } catch (error) {
        console.error("Failed to load habit routines", error);
        if (!cancelled) {
          setHabitRoutines([]);
        }
      } finally {
        if (!cancelled) {
          setHabitRoutinesLoading(false);
        }
      }
    };
    void loadRoutines();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const getNextIndex = useCallback(
    (index: number) => (index + 1) % pageCount,
    [pageCount],
  );

  const getPrevIndex = useCallback(
    (index: number) => (index - 1 + pageCount) % pageCount,
    [pageCount],
  );

  const animateToPage = useCallback(
    async (
      targetPage: number,
      options?: { fromDrag?: boolean; direction?: 1 | -1 },
    ) => {
      if (targetPage === activeFabPage) {
        pageX.set(0);
        setDragTargetPage(null);
        setDragDirection(null);
        setIsAnimatingPageChange(false);
        return;
      }
      const width = stageWidth > 0 ? stageWidth : 280;
      const resolvedDirection =
        options?.direction ??
        (targetPage === getNextIndex(activeFabPage) ? 1 : -1);
      if (dragTargetPage === null) {
        setDragTargetPage(targetPage);
      }
      setIsAnimatingPageChange(true);
      if (!options?.fromDrag) {
        pageX.set(0);
      }
      if (prefersReducedMotion) {
        setActiveFabPage(targetPage);
        pageX.set(0);
        setDragTargetPage(null);
        setDragDirection(null);
        setIsAnimatingPageChange(false);
        return;
      }
      const controls = animate(
        pageX,
        resolvedDirection === 1 ? -width : width,
        {
          duration: 0.25,
          ease: "easeOut",
        },
      );
      try {
        await controls.finished;
      } catch {
        // Ignore interruptions
      }
      setActiveFabPage(targetPage);
      pageX.set(0);
      setDragTargetPage(null);
      setDragDirection(null);
      setIsAnimatingPageChange(false);
      if (options?.fromDrag && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("tour:fab-swiped"));
      }
    },
    [
      activeFabPage,
      dragTargetPage,
      getNextIndex,
      pageX,
      prefersReducedMotion,
      stageWidth,
    ],
  );

  const handlePageDragStart = useCallback(() => {
    if (!isOpen || stageWidth <= 0) {
      return;
    }
    setIsDragging(true);
    setDragDirection(null);
    setIsAnimatingPageChange(false);
  }, [isOpen, stageWidth]);

  const isPointerInEdgeZone = useCallback((clientX: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) {
      return true;
    }
    const edgeZone = rect.width * EDGE_SWIPE_ZONE_RATIO;
    const offsetX = clientX - rect.left;
    return offsetX <= edgeZone || offsetX >= rect.width - edgeZone;
  }, []);

  const handlePagePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isOpen) return;
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      const isNexusPageActive = pages[activeFabPage] === "nexus";
      if (isNexusPageActive && !isPointerInEdgeZone(event.clientX)) {
        return;
      }
      pageDragControls.start(event);
    },
    [activeFabPage, isOpen, isPointerInEdgeZone, pageDragControls, pages],
  );

  const handlePageDrag = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (!isDragging) {
        return;
      }
      const limit = stageWidth > 0 ? stageWidth : DRAG_THRESHOLD_PX;
      const nextX = Math.max(-limit, Math.min(limit, info.offset.x));
      pageX.set(nextX);
      let nextTarget: number | null = null;
      let nextDirection: 1 | -1 | null = null;
      if (nextX < 0) {
        nextTarget = getNextIndex(activeFabPage);
        nextDirection = 1;
      } else if (nextX > 0) {
        nextTarget = getPrevIndex(activeFabPage);
        nextDirection = -1;
      }
      if (nextTarget !== dragTargetPage) {
        setDragTargetPage(nextTarget);
      }
      if (nextDirection !== null && nextDirection !== dragDirection) {
        setDragDirection(nextDirection);
      } else if (nextDirection === null && dragDirection !== null) {
        setDragDirection(null);
      }
    },
    [
      activeFabPage,
      dragDirection,
      dragTargetPage,
      getNextIndex,
      getPrevIndex,
      isDragging,
      pageX,
      stageWidth,
    ],
  );

  const handlePageDragEnd = useCallback(
    async (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (!isDragging) {
        setDragTargetPage(null);
        setDragDirection(null);
        return;
      }
      setIsDragging(false);
      const target = dragTargetPage;
      const width = stageWidth > 0 ? stageWidth : 0;
      const threshold = width > 0 ? width * 0.33 : 120;
      const distance = Math.abs(pageX.get());
      const shouldCommit =
        target !== null &&
        (distance > threshold || Math.abs(info.velocity.x) > 600);
      if (shouldCommit && target !== null) {
        const direction = dragDirection ?? (pageX.get() < 0 ? 1 : -1);
        await animateToPage(target, { fromDrag: true, direction });
        return;
      }
      setIsAnimatingPageChange(true);
      try {
        await animate(pageX, 0, {
          duration: 0.2,
          ease: "easeOut",
        }).finished;
      } catch {
        // Ignore interruptions
      }
      pageX.set(0);
      setDragTargetPage(null);
      setDragDirection(null);
      setIsAnimatingPageChange(false);
    },
    [
      animateToPage,
      dragDirection,
      dragTargetPage,
      isDragging,
      pageX,
      stageWidth,
    ],
  );

  const handleCloseReschedule = () => {
    if (isSavingReschedule || isDeletingEvent) return;
    setRescheduleTarget(null);
    setRescheduleError(null);
    setDeleteError(null);
  };

  useEffect(() => {
    if (!isOpen) {
      setActiveFabPage(0);
      setDragTargetPage(null);
      setDragDirection(null);
      setIsDragging(false);
      setIsAnimatingPageChange(false);
      if (
        typeof document !== "undefined" &&
        document.activeElement === nexusInputRef.current
      ) {
        nexusInputRef.current?.blur();
      }
      pageX.set(0);
      resetSearchState();
      resetFabFormState();
      setRescheduleTarget(null);
      setDeleteError(null);
      setIsDeletingEvent(false);
      searchAbortRef.current?.abort();
    }
  }, [isOpen, pageX, resetSearchState, resetFabFormState]);

  useEffect(() => {
    return () => {
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const node = menuRef.current;
    if (!node) return;
    const frame = requestAnimationFrame(() => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0) {
        setMenuWidth(rect.width);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, primary.length, secondary.length]);

  useEffect(() => {
    if (!isOpen) {
      setStageWidth(0);
      return;
    }
    const node = stageRef.current;
    if (!node) {
      return;
    }
    const updateWidth = () => setStageWidth(node.clientWidth || 0);
    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => {
        window.removeEventListener("resize", updateWidth);
      };
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [isOpen]);

  useEffect(() => {
    const shouldSearch =
      (isOpen && pages[activeFabPage] === "nexus") || overlayPickerOpen;
    if (!shouldSearch) {
      return;
    }
    if (typeof window === "undefined") return;

    const controller = new AbortController();
    searchAbortRef.current?.abort();
    searchAbortRef.current = controller;

    setIsSearching(true);
    setIsLoadingMore(false);
    setSearchError(null);
    setSearchResults([]);
    setSearchCursor(null);

    const timer = window.setTimeout(async () => {
      try {
        await runSearch({
          cursor: null,
          append: false,
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("FAB menu search failed", error);
        setSearchError("Unable to load results");
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
      setIsSearching(false);
    };
  }, [
    activeFabPage,
    isOpen,
    overlayPickerOpen,
    pages,
    runSearch,
    searchQuery,
    overlaySortMode,
  ]);

  const handleLoadMoreResults = useCallback(async () => {
    if (!searchCursor || isSearching || isLoadingMore) {
      return;
    }
    setIsLoadingMore(true);
    setSearchError(null);
    try {
      await runSearch({ cursor: searchCursor, append: true });
    } catch (error) {
      console.error("FAB menu search pagination failed", error);
      if (searchResults.length === 0) {
        setSearchError("Unable to load results");
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    isLoadingMore,
    isSearching,
    runSearch,
    searchCursor,
    searchResults.length,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (pages[activeFabPage] === "nexus" || overlayPickerOpen) {
      const frame = requestAnimationFrame(() => {
        nexusInputRef.current?.focus();
      });
      return () => cancelAnimationFrame(frame);
    }
    if (
      typeof document !== "undefined" &&
      document.activeElement === nexusInputRef.current
    ) {
      nexusInputRef.current?.blur();
    }
  }, [activeFabPage, isOpen, overlayPickerOpen, pages]);

  const handleRescheduleSave = useCallback(async () => {
    if (isDeletingEvent) {
      return;
    }
    if (!rescheduleTarget || !rescheduleDate || !rescheduleTime) {
      setRescheduleError("Select both date and time");
      return;
    }
    if (!rescheduleTarget.scheduleInstanceId) {
      setRescheduleError("No scheduled instance available to update.");
      return;
    }
    const parsed = new Date(`${rescheduleDate}T${rescheduleTime}`);
    if (Number.isNaN(parsed.getTime())) {
      setRescheduleError("Invalid date or time");
      return;
    }
    setIsSavingReschedule(true);
    setRescheduleError(null);
    try {
      const response = await fetch(
        `/api/schedule/instances/${rescheduleTarget.scheduleInstanceId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startUtc: parsed.toISOString() }),
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Unable to update schedule");
      }
      const payload = (await response.json().catch(() => null)) as {
        startUtc?: string | null;
      } | null;
      let nextStart = payload?.startUtc ?? parsed.toISOString();
      let nextInstanceId = rescheduleTarget.scheduleInstanceId;
      let nextDuration = rescheduleTarget.durationMinutes;

      if (rescheduleTarget.type === "HABIT") {
        const refreshed = await fetchNextScheduledInstance(
          rescheduleTarget.id,
          "HABIT",
        );
        if (refreshed) {
          nextStart = refreshed.startUtc ?? nextStart;
          nextInstanceId = refreshed.instanceId ?? nextInstanceId;
          if (
            typeof refreshed.durationMinutes === "number" &&
            Number.isFinite(refreshed.durationMinutes)
          ) {
            nextDuration = refreshed.durationMinutes;
          }
        }
      }

      setSearchResults((prev) =>
        prev.map((item) =>
          item.id === rescheduleTarget.id && item.type === rescheduleTarget.type
            ? {
                ...item,
                nextScheduledAt: nextStart,
                scheduleInstanceId: nextInstanceId,
                durationMinutes: nextDuration,
              }
            : item,
        ),
      );
      void notifySchedulerOfChange();
      setIsSavingReschedule(false);
      setRescheduleTarget(null);
      setDeleteError(null);
    } catch (error) {
      console.error("Failed to reschedule", error);
      setRescheduleError(
        error instanceof Error ? error.message : "Unable to update schedule",
      );
      setIsSavingReschedule(false);
    }
  }, [
    fetchNextScheduledInstance,
    isDeletingEvent,
    rescheduleDate,
    rescheduleTime,
    rescheduleTarget,
    notifySchedulerOfChange,
  ]);

  const isSaveDisabled = useMemo(() => {
    if (isSavingFab || !selected) return true;
    if (selected === "GOAL") {
      if (goalName.trim().length === 0) return true;
      if (!goalMonumentId) return true;
      if (!goalEnergy) return true;
      if (!goalPriority) return true;
      return false;
    }
    if (selected === "PROJECT") {
      if (projectName.trim().length === 0) return true;
      if (!projectGoalId) return true;
      if (projectSkillIds.length === 0) return true;
      return false;
    }
    if (selected === "TASK") {
      if (taskName.trim().length === 0) return true;
      if (!taskProjectId) return true;
      if (!taskSkillId) return true;
      return false;
    }
    if (selected === "HABIT") {
      if (habitName.trim().length === 0) return true;
      if (!habitEnergy) return true;
      if (!habitRecurrence) return true;
      if (!habitType) return true;
      if (!habitSkillId) return true;
      return false;
    }
    return habitName.trim().length === 0;
  }, [
    goalEnergy,
    goalMonumentId,
    goalName,
    goalPriority,
    habitName,
    habitRecurrence,
    habitSkillId,
    habitType,
    isSavingFab,
    projectGoalId,
    projectName,
    projectSkillIds,
    selected,
    taskName,
    taskProjectId,
    taskSkillId,
  ]);

  const handleFabSave = useCallback(async () => {
    if (fabSavePendingRef.current || isSavingFab || !selected) return;
    const createdType = selected;
    fabSavePendingRef.current = true;
    try {
      setSaveError(null);
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        setSaveError("Supabase client not available.");
        return;
      }
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) {
        setSaveError("Unable to resolve user.");
        return;
      }
      if (!user) {
        setSaveError("You need to be signed in to save.");
        return;
      }
      const trimmedName =
        selected === "GOAL"
          ? goalName.trim()
          : selected === "PROJECT"
            ? projectName.trim()
            : selected === "TASK"
              ? taskName.trim()
              : habitName.trim();
      if (trimmedName.length === 0) {
        setSaveError("Please enter a name.");
        return;
      }
      if (selected === "GOAL") {
        if (!goalMonumentId) {
          setSaveError("Link this goal to a monument before saving.");
          return;
        }
        if (!goalEnergy) {
          setSaveError("Select an energy level before saving.");
          return;
        }
        if (!goalPriority) {
          setSaveError("Select a priority before saving.");
          return;
        }
      }
      if (selected === "PROJECT") {
        if (!projectGoalId) {
          setSaveError("Link this project to a goal before saving.");
          return;
        }
        if (projectSkillIds.length === 0) {
          setSaveError("Link at least one skill before saving.");
          return;
        }
      }
      if (selected === "TASK") {
        if (!taskProjectId) {
          setSaveError("Link this task to a project before saving.");
          return;
        }
        if (!taskSkillId) {
          setSaveError("Link this task to a skill before saving.");
          return;
        }
      }
      if (selected === "HABIT") {
        if (!habitEnergy) {
          setSaveError("Select an energy level before saving.");
          return;
        }
        if (!habitRecurrence) {
          setSaveError("Select a recurrence before saving.");
          return;
        }
        if (!habitType) {
          setSaveError("Select a habit type before saving.");
          return;
        }
        if (!habitSkillId) {
          setSaveError("Link this habit to a skill before saving.");
          return;
        }
      }
      setIsSavingFab(true);
      try {
        if (selected === "GOAL") {
          const { error } = await supabase.from("goals").insert({
            user_id: user.id,
            name: trimmedName,
            priority: goalPriority,
            energy: goalEnergy,
            why: goalWhy?.trim() || null,
            monument_id: goalMonumentId || null,
            due_date: goalDue ?? null,
          });
          if (error) throw error;
        } else if (selected === "PROJECT") {
          const { data: projectData, error } = await supabase
            .from("projects")
            .insert({
              user_id: user.id,
              name: trimmedName,
              goal_id: projectGoalId || null,
              priority: projectPriority,
              energy: projectEnergy,
              stage: projectStage,
              why: projectWhy?.trim() || null,
              duration_min:
                typeof projectDuration === "number" &&
                Number.isFinite(projectDuration)
                  ? projectDuration
                  : normalizedProjectDuration || null,
            })
            .select("id")
            .single();
          if (error) throw error;
          if (projectData?.id && projectSkillIds.length > 0) {
            const { error: projectSkillsError } = await supabase
              .from("project_skills")
              .insert(
                projectSkillIds.map((skillId) => ({
                  project_id: projectData.id,
                  skill_id: skillId,
                })),
              );
            if (projectSkillsError) throw projectSkillsError;
          }
        } else if (selected === "TASK") {
          const { error } = await supabase.from("tasks").insert({
            user_id: user.id,
            name: trimmedName,
            project_id: taskProjectId || null,
            stage: taskStage,
            skill_id: taskSkillId || null,
          });
          if (error) throw error;
        } else if (selected === "HABIT") {
          const parsedDuration = Number.parseInt(habitDuration || "0", 10);
          const duration = Number.isFinite(parsedDuration)
            ? parsedDuration
            : null;
          let routineIdToUse: string | null = habitRoutineId || null;
          if (isCreatingHabitRoutineInline) {
            const trimmedRoutineName = habitInlineRoutineName.trim();
            if (!trimmedRoutineName) {
              setSaveError("Please name the routine before saving.");
              return;
            }
            const trimmedRoutineDescription =
              habitInlineRoutineDescription.trim();
            const { data: routineData, error: routineError } = await supabase
              .from("habit_routines")
              .insert({
                user_id: user.id,
                name: trimmedRoutineName,
                description:
                  trimmedRoutineDescription.length > 0
                    ? trimmedRoutineDescription
                    : null,
              })
              .select("id")
              .single();
            if (routineError) throw routineError;
            routineIdToUse = routineData?.id ?? null;
          }
          const { error } = await supabase.from("habits").insert({
            user_id: user.id,
            name: trimmedName,
            type: habitType,
            habit_type: habitType,
            recurrence: habitRecurrence,
            duration_minutes: duration,
            energy: habitEnergy,
            skill_id: habitSkillId || null,
            routine_id: routineIdToUse,
            goal_id: habitGoalId || null,
          });
          if (error) throw error;
          await notifySchedulerOfChange();
        }
        resetFabFormState();
        setExpanded(false);
        setSelected(null);
        setIsOpen(false);
        const successLabel =
          createdType === "GOAL"
            ? "Goal"
            : createdType === "PROJECT"
              ? "Project"
              : createdType === "TASK"
                ? "Task"
                : createdType === "HABIT"
                  ? "Habit"
                  : "Item";
        toast.success(`${successLabel} created`);
      } catch (error: any) {
        console.error("Failed to save item", error);
        const errorMessage =
          error?.message ||
          error?.error?.message ||
          "Unable to save right now.";
        setSaveError(errorMessage);
      } finally {
        setIsSavingFab(false);
      }
    } finally {
      fabSavePendingRef.current = false;
    }
  }, [
    habitDuration,
    habitEnergy,
    habitGoalId,
    habitInlineRoutineDescription,
    habitInlineRoutineName,
    habitRecurrence,
    habitRoutineId,
    habitSkillId,
    habitType,
    habitWhy,
    habitName,
    isCreatingHabitRoutineInline,
    isSavingFab,
    goalDue,
    goalEnergy,
    goalMonumentId,
    goalName,
    goalPriority,
    goalWhy,
    normalizedProjectDuration,
    notifySchedulerOfChange,
    projectDuration,
    projectEnergy,
    projectGoalId,
    projectName,
    projectPriority,
    projectSkillIds,
    projectStage,
    projectWhy,
    selected,
    taskName,
    taskProjectId,
    taskSkillId,
    taskStage,
    resetFabFormState,
    toast,
  ]);

  const overhangCancelTapHandlers = useTapHandler(() => {
    setExpanded(false);
    setSelected(null);
    setIsOpen(false);
  });
  const overhangSaveTapHandlers = useTapHandler(() => handleFabSave(), {
    disabled: isSaveDisabled,
  });
  const handleDeleteEvent = useCallback(async () => {
    if (isDeletingEvent) {
      return;
    }
    const target = rescheduleTarget;
    if (!target) {
      return;
    }
    setDeleteError(null);
    setIsDeletingEvent(true);
    try {
      const typeSegment = target.type === "HABIT" ? "habit" : "project";
      const response = await fetch(
        `/api/schedule/events/${typeSegment}/${target.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Unable to delete this event");
      }
      setSearchResults((prev) =>
        prev.filter(
          (item) => !(item.id === target.id && item.type === target.type),
        ),
      );
      setRescheduleTarget(null);
      setRescheduleDate("");
      setRescheduleTime("");
      setRescheduleError(null);
      setDeleteError(null);
      void notifySchedulerOfChange();
    } catch (error) {
      console.error("Failed to delete schedule event", error);
      setDeleteError(
        error instanceof Error ? error.message : "Unable to delete this event",
      );
    } finally {
      setIsDeletingEvent(false);
    }
  }, [isDeletingEvent, notifySchedulerOfChange, rescheduleTarget]);

  // Close menu when clicking outside
  useEffect(() => {
    if (rescheduleTarget) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (isTourActive()) return;
      const target = event.target as Node | null;
      if (
        !target ||
        fabRootRef.current?.contains(target) ||
        !menuRef.current ||
        !buttonRef.current
      ) {
        return;
      }

      if (
        isOpen &&
        !menuRef.current.contains(target) &&
        !buttonRef.current.contains(target) &&
        !overlayButtonRef.current?.contains(target)
      ) {
        if (expanded) return;
        if (aiOpen && aiOverlayRef.current?.contains(target)) {
          return;
        }
        setIsOpen(false);
        if (aiOpen) {
          closeAiOverlay();
        } else {
          setAiOpen(false);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [expanded, isOpen, rescheduleTarget, aiOpen, closeAiOverlay]);

  useEffect(() => {
    if (isOpen) return;
    setExpanded(false);
    setSelected(null);
    if (aiOpen) {
      closeAiOverlay();
    }
  }, [isOpen, aiOpen, closeAiOverlay]);

  const shouldRenderNeighbor = isDragging && dragTargetPage !== null;
  const neighborPage = shouldRenderNeighbor ? dragTargetPage : null;
  const neighborDirection =
    neighborPage !== null
      ? (dragDirection ?? (pageX.get() < 0 ? 1 : -1))
      : null;

  const restingPalette = getMenuPalette(activeFabPage);
  const staticBackgroundImage = createPaletteBackground(restingPalette);
  const staticBorderColor = createPaletteBorderColor(restingPalette);
  const targetPalette =
    isDragging && dragTargetPage !== null
      ? getMenuPalette(dragTargetPage)
      : restingPalette;
  const baseR = useTransform(dragProgress, (value) =>
    lerp(restingPalette.base[0], targetPalette.base[0], value),
  );
  const baseG = useTransform(dragProgress, (value) =>
    lerp(restingPalette.base[1], targetPalette.base[1], value),
  );
  const baseB = useTransform(dragProgress, (value) =>
    lerp(restingPalette.base[2], targetPalette.base[2], value),
  );
  const highlightR = useTransform(dragProgress, (value) =>
    lerp(restingPalette.highlight[0], targetPalette.highlight[0], value),
  );
  const highlightG = useTransform(dragProgress, (value) =>
    lerp(restingPalette.highlight[1], targetPalette.highlight[1], value),
  );
  const highlightB = useTransform(dragProgress, (value) =>
    lerp(restingPalette.highlight[2], targetPalette.highlight[2], value),
  );
  const lowlightR = useTransform(dragProgress, (value) =>
    lerp(restingPalette.lowlight[0], targetPalette.lowlight[0], value),
  );
  const lowlightG = useTransform(dragProgress, (value) =>
    lerp(restingPalette.lowlight[1], targetPalette.lowlight[1], value),
  );
  const lowlightB = useTransform(dragProgress, (value) =>
    lerp(restingPalette.lowlight[2], targetPalette.lowlight[2], value),
  );
  // Background blends from drag motion value so color transitions stay continuous during interactive paging.
  const blendedBackgroundImage = useMotionTemplate`
    radial-gradient(circle at top, rgba(${highlightR}, ${highlightG}, ${highlightB}, 0.65), rgba(${baseR}, ${baseG}, ${baseB}, 0.15) 45%),
    linear-gradient(160deg, rgba(${highlightR}, ${highlightG}, ${highlightB}, 0.95) 0%, rgba(${baseR}, ${baseG}, ${baseB}, 0.97) 50%, rgba(${lowlightR}, ${lowlightG}, ${lowlightB}, 0.98) 100%)
  `;
  const blendedBorderColor = useMotionTemplate`
    rgba(${highlightR}, ${highlightG}, ${highlightB}, 0.35)
  `;
  const isBlendingGradient = isDragging && dragTargetPage !== null;
  const dragConstraintLeft = -normalizedStageWidth;
  const dragConstraintRight = normalizedStageWidth;
  const effectiveViewportHeight =
    expanded && (viewportHeight || stableViewportHeight)
      ? (viewportHeight ?? stableViewportHeight)
      : null;
  const minHeightExpanded = expanded
    ? effectiveViewportHeight
      ? Math.round(effectiveViewportHeight * 0.58)
      : "58vh"
    : undefined;
  const maxHeightExpanded = expanded
    ? effectiveViewportHeight
      ? Math.round(effectiveViewportHeight * 0.9 - 8 - stableSafeBottom)
      : "calc(90vh - env(safe-area-inset-bottom, 0px) - 8px)"
    : undefined;

  return (
    <div
      className={cn("relative", className)}
      ref={fabRootRef}
      {...wrapperProps}
    >
      {/* AddEvents Menu */}
      <AnimatePresence>
        {isOpen && (
          <>
            {expanded
              ? createPortal(
                  <div
                    data-fab-overlay
                    className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
                    style={{ touchAction: "manipulation" }}
                    onWheel={(event) => event.preventDefault()}
                    onTouchMove={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  />,
                  document.body,
                )
              : null}
            <div
              className={cn(
                "bottom-20 mb-2 z-[2147483650] flex flex-col items-stretch",
                expanded ? "fixed" : "absolute",
                menuClassName,
              )}
            >
              <motion.div
                data-fab-overlay
                ref={(node) => {
                  menuRef.current = node;
                  panelRef.current = node;
                }}
                className={cn(
                  "border rounded-lg shadow-2xl bg-[var(--surface-elevated)]",
                  expanded ? "w-[92vw] max-w-[920px]" : "min-w-[200px]",
                )}
                layout={!expanded}
                onTouchStart={(event) => event.stopPropagation()}
                onPointerDownCapture={handleExpandedPointerDownCapture}
                style={{
                  boxShadow: MENU_BOX_SHADOW,
                  borderColor: isBlendingGradient
                    ? blendedBorderColor
                    : staticBorderColor,
                  transition: "border-color 0.1s linear, transform 0.2s ease",
                  transformOrigin:
                    menuVariant === "timeline"
                      ? "bottom right"
                      : "bottom center",
                  minHeight: expanded ? minHeightExpanded : menuContainerHeight,
                  maxHeight: expanded ? maxHeightExpanded : menuContainerHeight,
                  y: 0,
                  height: expanded ? undefined : menuContainerHeight,
                  minWidth: expanded ? undefined : (menuWidth ?? undefined),
                  width: expanded ? undefined : (menuWidth ?? undefined),
                  maxWidth: expanded ? undefined : (menuWidth ?? undefined),
                  touchAction: expanded ? "manipulation" : undefined,
                  overflowY: expanded ? "auto" : "hidden",
                  overflowX: "hidden",
                  overscrollBehavior: expanded ? "contain" : undefined,
                }}
                initial={{ opacity: 0, y: 8 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: { type: "tween", ease: "easeOut", duration: 0.2 },
                }}
                exit={{
                  opacity: 0,
                  y: 8,
                  transition: { type: "tween", ease: "easeIn", duration: 0.2 },
                }}
                onWheel={handleMenuWheel}
              >
                <>
                  <motion.div
                    className="relative h-full w-full"
                    style={{
                      backgroundImage: isBlendingGradient
                        ? blendedBackgroundImage
                        : staticBackgroundImage,
                      borderRadius: "inherit",
                    }}
                  >
                    <div
                      ref={stageRef}
                      data-tour="fab-swipe"
                      className="relative h-full w-full rounded-[inherit]"
                    >
                      <motion.div
                        className="absolute inset-0 flex"
                        drag="x"
                        dragListener={false}
                        dragControls={pageDragControls}
                        dragElastic={0}
                        dragMomentum={false}
                        dragConstraints={{
                          left: dragConstraintLeft,
                          right: dragConstraintRight,
                        }}
                        style={{ x: pageX }}
                        onPointerDown={
                          !expanded ? handlePagePointerDown : undefined
                        }
                        onDragStart={handlePageDragStart}
                        onDrag={handlePageDrag}
                        onDragEnd={handlePageDragEnd}
                        dragPropagation
                      >
                        <motion.div
                          className="absolute inset-0 z-10 flex"
                          variants={pageVariants}
                          initial="open"
                          animate="open"
                          style={{ borderRadius: "inherit" }}
                        >
                          {renderPage(activeFabPage)}
                        </motion.div>
                      </motion.div>
                      {neighborPage !== null &&
                        neighborDirection !== null &&
                        !expanded && (
                          <motion.div
                            className="pointer-events-none absolute inset-0 z-0 flex"
                            style={{
                              x:
                                neighborDirection === 1
                                  ? incomingFromRight
                                  : incomingFromLeft,
                            }}
                          >
                            <motion.div
                              className="absolute inset-0 flex overflow-hidden"
                              variants={pageVariants}
                              initial="open"
                              animate="open"
                              style={{ borderRadius: "inherit" }}
                            >
                              {renderPage(neighborPage)}
                            </motion.div>
                          </motion.div>
                        )}
                    </div>
                  </motion.div>
                </>
              </motion.div>
              {shouldRenderTimelineOverlayButton && (
                <motion.button
                  ref={overlayButtonRef}
                  type="button"
                  aria-label="Add overlay"
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-gradient-to-br from-[#111111] via-[#0d0d0d] to-[#050505] px-6 py-3 text-white shadow-[0_25px_60px_rgba(0,0,0,0.85)] ring-1 ring-black/40 transition hover:ring-black/60 pointer-events-auto"
                  onPointerDown={(event) => event.stopPropagation()}
                  onTouchStart={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleOverlayPickerClose();
                    setOverlayOpen(true);
                  }}
                >
                  <span className="text-sm opacity-80">add</span>
                  <span className="text-lg font-bold">OVERLAY</span>
                </motion.button>
              )}
            </div>
            {expanded && !shouldHideOverhangButtons
              ? createPortal(
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: 4 }}
                    transition={{
                      type: "tween",
                      duration: 0.18,
                      ease: "easeOut",
                    }}
                    className="pointer-events-auto fixed flex w-[108px] items-center gap-3"
                    style={{
                      left: overhangPos?.left,
                      top: overhangPos?.top,
                      right: overhangPos ? undefined : 12,
                      bottom: overhangPos
                        ? undefined
                        : "calc(12px + env(safe-area-inset-bottom, 0px))",
                      zIndex: 2147483651,
                      transition:
                        "top 0.18s ease, left 0.18s ease, right 0.18s ease, bottom 0.18s ease, transform 0.18s ease",
                      transform:
                        expanded && keyboardLift > 0
                          ? `translateY(${-keyboardLift}px)`
                          : undefined,
                    }}
                  >
                    <Button
                      type="button"
                      aria-label="Discard"
                      variant="cancelSquare"
                      size="iconSquare"
                      className="drop-shadow-xl shrink-0 transform-none hover:scale-100 active:translate-y-0 transition-none touch-manipulation"
                      {...overhangCancelTapHandlers}
                    >
                      <X
                        className="h-5 w-5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
                        aria-hidden="true"
                      />
                    </Button>

                    <Button
                      type="button"
                      aria-label="Save"
                      variant="confirmSquare"
                      size="iconSquare"
                      disabled={isSaveDisabled}
                      className={cn(
                        "drop-shadow-xl shrink-0 transform-none hover:scale-100 active:translate-y-0 transition-none touch-manipulation bg-white/10 text-white transition hover:bg-white/20",
                        isSaveDisabled ? "opacity-50" : "",
                      )}
                      {...overhangSaveTapHandlers}
                    >
                      <Check
                        className="h-5 w-5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
                        aria-hidden="true"
                      />
                    </Button>
                  </motion.div>,
                  document.body,
                )
              : null}
          </>
        )}
      </AnimatePresence>

      {/* FAB Button - Restored to your original styling */}
      <motion.button
        data-tour="fab"
        ref={buttonRef}
        onClick={handleFabButtonClick}
        aria-label={isOpen ? "Open ILAV" : "Add new item"}
        className={`relative flex items-center justify-center h-14 w-14 rounded-full text-white shadow-lg hover:scale-110 transition ${
          isOpen ? "rotate-45" : ""
        }`}
        onTouchStart={handleFabButtonTouchStart}
        onTouchEnd={handleFabButtonTouchEnd}
        onTouchCancel={handleFabButtonTouchCancel}
        onWheel={handleFabButtonWheel}
        whileTap={{ scale: 0.9 }}
        transition={{ type: "spring", stiffness: 500, damping: 25 }}
        style={{
          background:
            "linear-gradient(145deg, #1f2937 0%, #0f172a 60%, #020617 100%)",
          boxShadow:
            "0 18px 36px rgba(0, 0, 0, 0.65), 0 8px 18px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
        }}
      >
        {isOpen ? (
          <Sparkles className="h-8 w-8" aria-hidden="true" />
        ) : (
          <Plus className="h-8 w-8" aria-hidden="true" />
        )}
      </motion.button>

      {/* Event Creation Modal */}
      <EventModal
        isOpen={modalEventType !== null}
        onClose={() => setModalEventType(null)}
        eventType={modalEventType!}
      />
      <NoteModal isOpen={showNote} onClose={() => setShowNote(false)} />
      <PostModal isOpen={showPost} onClose={() => setShowPost(false)} />
      <ComingSoonModal
        isOpen={comingSoon !== null}
        onClose={() => setComingSoon(null)}
        label={comingSoon || ""}
      />
      {overlayOpen &&
        createPortal(
          <div className="fixed inset-0 z-[2147483662] flex items-center justify-center px-4 py-6 overflow-y-auto">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setOverlayOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="relative w-full max-w-[520px] max-h-[calc(100vh-3rem)] overflow-y-auto rounded-3xl border border-black/60 bg-gradient-to-br from-[#020202] via-[#050505] to-[#0b0b0b] p-6 text-white shadow-[0_30px_80px_rgba(0,0,0,0.85)]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-white/70">
                    OVERLAY
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Save overlay"
                    onClick={handleLiveOverlaySave}
                    disabled={!overlayIntervalValid || isSavingLiveOverlay}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full border border-transparent bg-gradient-to-br from-emerald-700 via-emerald-600 to-emerald-500 p-0 text-white transition hover:from-emerald-600 hover:via-emerald-500 hover:to-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300",
                      (!overlayIntervalValid || isSavingLiveOverlay) &&
                        "cursor-not-allowed opacity-60",
                    )}
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Close overlay draft"
                    className="rounded-full border border-black/80 bg-white/5 p-2 text-white transition hover:border-black/60"
                    onClick={() => setOverlayOpen(false)}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    htmlFor={startTimeInputId}
                    className="text-[9px] font-semibold uppercase tracking-[0.4em] text-white/70"
                  >
                    Start
                  </label>
                  <input
                    id={startTimeInputId}
                    type="time"
                    aria-label="Set overlay start time"
                    className="flex-1 min-w-[96px] h-8 rounded-md border border-black bg-white/5 px-1 text-[0.65rem] font-semibold text-white outline-none transition focus:border-gray-300 focus-visible:border-gray-300 focus-visible:ring-2 focus-visible:ring-gray-400/30 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent"
                    value={overlayStartInputValue}
                    onChange={handleStartTimeInputChange}
                    onFocus={() => setStartInputFocused(true)}
                    onBlur={() => setStartInputFocused(false)}
                    style={
                      startInputFocused ? { borderColor: "#d1d5db" } : undefined
                    }
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    htmlFor={endTimeInputId}
                    className="text-[9px] font-semibold uppercase tracking-[0.4em] text-white/70"
                  >
                    End
                  </label>
                  <input
                    id={endTimeInputId}
                    type="time"
                    aria-label="Set overlay end time"
                    className="flex-1 min-w-[96px] h-8 rounded-md border border-black bg-white/5 px-1 text-[0.65rem] font-semibold text-white outline-none transition focus:border-gray-300 focus-visible:border-gray-300 focus-visible:ring-2 focus-visible:ring-gray-400/30 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent"
                    value={overlayEndInputValue}
                    onChange={handleEndTimeInputChange}
                    onFocus={() => setEndInputFocused(true)}
                    onBlur={() => setEndInputFocused(false)}
                    style={
                      endInputFocused ? { borderColor: "#d1d5db" } : undefined
                    }
                  />
                </div>
              </div>
              <div className="mt-1 text-[9px] uppercase tracking-[0.4em] text-white/40">
                {overlayDurationLabel} window
              </div>

              {overlaySaveError ? (
                <p className="mt-3 text-xs text-rose-400">{overlaySaveError}</p>
              ) : null}

              {overlayPickerSelected && !overlayPickerOpen ? (
                <div className="mt-3 flex items-center gap-3 text-[10px] uppercase tracking-[0.3em] text-white/70">
                  <span className="truncate">
                    Placing {overlayPickerSelected.name}
                  </span>
                  <button
                    type="button"
                    className="ml-auto rounded-full border border-white/20 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.3em] text-white transition hover:border-white/40"
                    onClick={handlePlacementCancel}
                  >
                    Cancel
                  </button>
                </div>
              ) : null}

              {overlayPickerOpen ? (
                <div className="mt-4 relative">
                  <div className="relative h-[360px] w-full overflow-hidden rounded-3xl border border-black/60 bg-gradient-to-b from-[#0a0a0a] to-[#020202]">
                    <FabNexus
                      query={searchQuery}
                      onQueryChange={setSearchQuery}
                      results={overlayPickerResults}
                      isSearching={isSearching}
                      isLoadingMore={isLoadingMore}
                      error={searchError}
                      hasMore={Boolean(searchCursor)}
                      onLoadMore={handleLoadMoreResults}
                      onSelectResult={handleOverlayPickerResult}
                      inputRef={nexusInputRef}
                      filterMonumentId={overlayFilterMonumentId}
                      onFilterMonumentChange={setOverlayFilterMonumentId}
                      filterSkillId={overlayFilterSkillId}
                      onFilterSkillChange={setOverlayFilterSkillId}
                      filterEventType={overlayFilterEventType}
                      onFilterEventTypeChange={setOverlayFilterEventType}
                      sortMode={overlaySortMode}
                      onSortModeChange={setOverlaySortMode}
                      availableMonuments={monuments}
                      availableSkills={skills}
                      availableSkillCategories={skillCategories}
                      showToolbar
                    />
                    <button
                      type="button"
                      aria-label="Close Nexus"
                      className="absolute bottom-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-[#111111] via-[#0d0d0d] to-[#050505] text-white shadow-[0_10px_20px_rgba(0,0,0,0.5)] transition hover:scale-[1.05] focus-visible:border-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                      onClick={handleOverlayPickerClose}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 relative">
                  <div
                    ref={overlayTimelineRef}
                    className={cn(
                      "mt-0 w-full -mx-6 pb-0 relative",
                      overlayPickerSelected
                        ? "cursor-pointer"
                        : "cursor-default",
                    )}
                    onClick={handleTimelineClick}
                  >
                    <DayTimeline
                      className="w-full !rounded-none !border-0 !shadow-none !backdrop-blur-none"
                      style={{
                        background: "transparent",
                        borderRadius: 0,
                        "--timeline-right-gutter": "0px",
                        "--timeline-grid-right": "0px",
                        "--timeline-card-right": "0px",
                      }}
                      date={overlayStartTime}
                      startHour={overlayTimelineStartHour}
                      endHour={overlayTimelineEndHour}
                      pxPerMin={overlayTimelinePxPerMin}
                    >
                      {renderOverlayPlacements.map((placement) => {
                        const startMinutes = Math.max(
                          0,
                          (placement.start.getTime() -
                            overlayStartTime.getTime()) /
                            60000,
                        );
                        const durationMinutes = Math.max(
                          1,
                          (placement.end.getTime() -
                            placement.start.getTime()) /
                            60000,
                        );
                        const normalizedStartMinutes =
                          clampOverlayPlacementStart(
                            startMinutes,
                            durationMinutes,
                            overlayWindowMinutes,
                          );
                        const placementTheme =
                          getOverlayPlacementTheme(placement);
                        const overlayIsDragging = Boolean(activeOverlayDragId);
                        const isDragging = activeOverlayDragId === placement.id;
                        const isRemovalCandidate =
                          overlayRemovalCandidateId === placement.id;
                        const removalStyle = isRemovalCandidate
                          ? {
                              borderColor: "rgba(248, 113, 113, 0.9)",
                              boxShadow:
                                "0 0 0 10px rgba(248, 113, 113, 0.25),0 18px 38px rgba(6,6,10,0.48),0 8px 16px rgba(0,0,0,0.35)",
                            }
                          : {};
                        const staticCardStyle = {
                          top: minutesToTimelineStyle(normalizedStartMinutes),
                          height: minutesToTimelineStyle(durationMinutes),
                          left: "var(--timeline-card-left)",
                          right: "var(--timeline-card-right)",
                          background: placementTheme.background,
                          borderColor: placementTheme.borderColor,
                          outline: "1px solid rgba(255, 255, 255, 0.08)",
                          outlineOffset: "-1px",
                        };
                        const baseShadow = isDragging
                          ? "0 0 60px rgba(0,0,0,0.55),0 12px 30px rgba(0,0,0,0.45)"
                          : "0 0 30px rgba(0,0,0,0.35),0 6px 14px rgba(0,0,0,0.30)";
                        const filterValue = isDragging
                          ? "brightness(1.09)"
                          : overlayIsDragging
                            ? "brightness(0.92)"
                            : undefined;
                        const opacityValue =
                          overlayIsDragging && !isDragging ? 0.82 : 1;
                        const zValue = isDragging
                          ? 32
                          : isRemovalCandidate
                            ? 10
                            : 2;
                        const transitionStyle = isDragging
                          ? "top 0.15s ease, filter 0.2s ease, opacity 0.2s ease"
                          : "top 0.15s ease, box-shadow 0.25s ease, filter 0.2s ease, opacity 0.2s ease";
                        const activeStyle = staticCardStyle;
                        const dragTransformStyle = isDragging
                          ? { y: 0 }
                          : undefined;

                        return (
                          <motion.div
                            key={placement.id}
                            drag="y"
                            dragDirectionLock
                            dragElastic={0}
                            dragMomentum={false}
                            dragSnapToOrigin={false}
                            dragPropagation={false}
                            dragConstraints={overlayTimelineRef}
                            onDragStart={(event, info) =>
                              handleOverlayDragStart(placement, event, info)
                            }
                            onDrag={(event, info) =>
                              handleOverlayDrag(placement, info)
                            }
                            onDragEnd={(event, info) =>
                              handleOverlayDragEnd(placement, info)
                            }
                            whileDrag={{ scale: 1.02 }}
                            onPointerDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            className={cn(
                              "absolute flex h-full flex-col justify-center overflow-hidden rounded-[var(--schedule-instance-radius)] border px-3 py-2 backdrop-blur-sm text-white select-none touch-none [user-select:none] [-webkit-user-select:none] [-webkit-touch-callout:none] pointer-events-auto cursor-grab active:cursor-grabbing transition-all duration-200 ease-out",
                              isRemovalCandidate && "ring-2 ring-red-400/70",
                            )}
                            style={{
                              ...activeStyle,
                              ...dragTransformStyle,
                              ...removalStyle,
                              zIndex: zValue,
                              boxShadow: baseShadow,
                              filter: filterValue,
                              opacity: opacityValue,
                              transition: transitionStyle,
                              willChange: "transform, opacity, filter",
                            }}
                          >
                            {(() => {
                              const goalLabel =
                                placement.goalName?.trim() || null;
                              const flameLevel =
                                placement.type === "PROJECT"
                                  ? normalizeFlameLevel(placement.energy)
                                  : null;
                              return (
                                <div className="flex w-full items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <span className="block text-sm font-semibold leading-tight text-white break-words">
                                      {placement.name}
                                    </span>
                                  </div>
                                  <div className="flex flex-col items-end justify-start gap-1 text-right self-start">
                                    {goalLabel ? (
                                      <span className="max-w-[180px] truncate text-[9px] font-semibold uppercase tracking-[0.3em] text-white/70">
                                        {goalLabel}
                                      </span>
                                    ) : null}
                                    {flameLevel ? (
                                      <FlameEmber
                                        level={flameLevel}
                                        size="sm"
                                        className="drop-shadow-[0_0_6px_rgba(0,0,0,0.45)]"
                                      />
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })()}
                          </motion.div>
                        );
                      })}
                    </DayTimeline>
                    {(() => {
                      const isTrashMode = overlayDragMode === "remove";
                      const showTrashIcon = isDraggingOverlay || isTrashMode;
                      return (
                        <button
                          ref={overlayNexusDropRef}
                          type="button"
                          aria-label={
                            isTrashMode ? "Remove event" : "Open Nexus"
                          }
                          className={cn(
                            "absolute bottom-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border bg-gradient-to-br from-[#111111] via-[#0d0d0d] to-[#050505] shadow-[0_10px_20px_rgba(0,0,0,0.5)] transition hover:scale-[1.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
                            isTrashMode
                              ? "border-red-500 text-red-100 hover:border-red-400"
                              : "border-white/20 text-white hover:ring-white",
                          )}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!isTrashMode) {
                              handleAddFromNexusClick();
                            }
                          }}
                        >
                          {showTrashIcon ? (
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Plus className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              )}
            </motion.div>
          </div>,
          document.body,
        )}
      {aiOpen
        ? createPortal(
            <div
              ref={aiOverlayRef}
              className="fixed inset-0 z-[2147483655] flex items-center justify-center overflow-hidden bg-black/80 backdrop-blur-sm p-4"
            >
              <div className="relative flex h-full max-h-[85vh] w-full max-w-[min(720px,92vw)] flex-col overflow-hidden rounded-2xl border border-white/20 bg-[#020205]/95 text-white shadow-xl">
                <header className="flex flex-row items-center justify-between border-b border-white/10 px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] leading-tight text-white">
                      ILAV
                    </p>
                    <div className="relative flex flex-col gap-1">
                      <button
                        ref={scopeToggleRef}
                        type="button"
                        onClick={() => setScopeMenuOpen((prev) => !prev)}
                        aria-haspopup="true"
                        aria-expanded={scopeMenuOpen}
                        className="cursor-pointer text-[9px] uppercase tracking-[0.3em] leading-none text-white/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                      >
                        Scope:{" "}
                        <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-white/90">
                          {scopeLabel}
                        </span>
                      </button>
                      <p
                        className={cn(
                          "text-[9px] uppercase tracking-[0.3em]",
                          quotaExceeded ? "text-amber-400" : "text-white/60",
                        )}
                      >
                        AI USED: {quotaDisplayPercent}%
                      </p>
                      {scopeMenuOpen ? (
                        <div
                          ref={scopeMenuRef}
                          className="absolute left-0 top-full z-10 mt-2 w-40 rounded-2xl border border-white/20 bg-[#050507]/95 p-2 shadow-lg"
                        >
                          {SCOPE_OPTIONS.map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => {
                                setScopeSelection(option);
                                if (option === "auto") {
                                  setAutoModeActive(true);
                                } else {
                                  setAutoModeActive(false);
                                  setAiScope(option);
                                }
                                setScopeMenuOpen(false);
                              }}
                              className={cn(
                                "block w-full rounded-xl px-3 py-1 text-left text-xs font-semibold uppercase tracking-[0.3em] transition",
                                option === scopeSelection
                                  ? "border border-white/40 bg-white/10 text-white"
                                  : "text-white/70 hover:text-white",
                              )}
                            >
                              {SCOPE_LABELS[option]}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeAiOverlay}
                    aria-label="Close ILAV"
                    className="rounded-full p-2 text-white/70 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </header>
                <div className="flex h-full flex-1 flex-col overflow-hidden">
                  {/* CHAT REGION (thread only) */}
                  <div className="flex-1 overflow-y-auto overscroll-contain">
                    <div className="px-6 py-4 space-y-5">
                      {shouldShowWelcomePanel ? (
                        <section className="rounded-2xl border border-white/20 bg-gradient-to-br from-[#0f111a]/90 via-[#050507]/80 to-black/70 p-5 shadow-[0_25px_60px_rgba(5,6,18,0.8)] backdrop-blur">
                          <div className="space-y-2">
                            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-white">
                              ILAV
                            </h3>
                            <p className="text-sm text-white/70">
                              What are we doing right now, Mack?
                            </p>
                          </div>
                          <div className="mt-4 space-y-2">
                            <p className="text-[10px] uppercase tracking-[0.35em] text-white/60">
                              Quick starts
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {QUICK_START_PROMPTS.map((prompt) => (
                                <button
                                  key={prompt}
                                  type="button"
                                  onClick={() => setAiPrompt(prompt)}
                                  className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[11px] font-semibold text-white/90 transition hover:border-white/40 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                                >
                                  {prompt}
                                </button>
                              ))}
                            </div>
                          </div>
                        </section>
                      ) : null}
                      {aiError ? (
                        <div className="rounded-2xl border border-white/20 bg-black/60 p-3 text-sm text-white/80 shadow-inner">
                          {aiError}
                        </div>
                      ) : null}
                      {quotaExceeded ? (
                        <div className="rounded-2xl border border-amber-500/60 bg-amber-500/10 p-3 text-sm text-white/80 shadow-inner">
                          Monthly AI quota reached
                        </div>
                      ) : null}
                      {(aiThread.length > 0 ||
                        aiResponse?.assistant_message) && (
                        <section className="space-y-3 pt-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] uppercase tracking-[0.35em] text-white/60">
                              Conversation
                            </p>
                          </div>
                          <div ref={chatLogRef} className="space-y-3">
                            {(() => {
                              const makeKey = (
                                message: (typeof aiThread)[number],
                                fallbackIndex: number,
                              ) =>
                                message.id ??
                                `${message.role}-${message.ts}-${fallbackIndex}`;

                              const renderItems: Array<
                                | {
                                    type: "text";
                                    key: string;
                                    message: (typeof aiThread)[number];
                                  }
                                | {
                                    type: "proposalGroup";
                                    key: string;
                                    proposals: (typeof aiThread)[number][];
                                    startIndex: number;
                                  }
                              > = [];

                              for (
                                let index = 0;
                                index < aiThread.length;
                                index += 1
                              ) {
                                const message = aiThread[index];

                                if (message.kind === "proposal") {
                                  const startIndex = index;
                                  const proposals = [message];
                                  let nextIndex = index + 1;

                                  while (
                                    nextIndex < aiThread.length &&
                                    aiThread[nextIndex].kind === "proposal"
                                  ) {
                                    proposals.push(aiThread[nextIndex]);
                                    nextIndex += 1;
                                  }

                                  const keyParts = proposals.map(
                                    (proposal, offset) =>
                                      makeKey(proposal, startIndex + offset),
                                  );

                                  renderItems.push({
                                    type: "proposalGroup",
                                    key: `proposal-group-${startIndex}-${keyParts.join("-")}`,
                                    proposals,
                                    startIndex,
                                  });

                                  index = nextIndex - 1;
                                  continue;
                                }

                                renderItems.push({
                                  type: "text",
                                  key: makeKey(message, index),
                                  message,
                                });
                              }

                              return renderItems.map((item) => {
                                if (item.type === "text") {
                                  const containerClasses = cn(
                                    "flex gap-2 transition",
                                    item.message.role === "user"
                                      ? "ml-auto justify-end max-w-[80%]"
                                      : "justify-start w-full",
                                  );

                                  return (
                                    <div
                                      key={item.key}
                                      className={containerClasses}
                                    >
                                      <div
                                        className={cn(
                                          "rounded-[20px] px-4 py-3 text-sm leading-relaxed shadow-[0_10px_30px_rgba(0,0,0,0.35)]",
                                          item.message.role === "user"
                                            ? "border border-white/10 bg-white/10 text-white md:rounded-tl-[4px] md:rounded-bl-[20px]"
                                            : "border border-white/5 bg-white/5 text-white/90 md:rounded-tr-[4px] md:rounded-bl-[20px]",
                                        )}
                                      >
                                        <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                                          {item.message.role === "user"
                                            ? "You"
                                            : "ILAV"}
                                        </p>
                                        <p className="mt-1 text-sm text-white/90">
                                          {item.message.content}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                }

                                const firstProposal = item.proposals[0];
                                const containerClasses = cn(
                                  "flex gap-2 transition",
                                  firstProposal.role === "user"
                                    ? "ml-auto justify-end max-w-[80%]"
                                    : "justify-start w-full",
                                );

                                return (
                                  <div
                                    key={item.key}
                                    className={containerClasses}
                                  >
                                    <div className="w-full overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                      <div className="flex gap-3 snap-x snap-mandatory px-1">
                                        {item.proposals.map(
                                          (proposal, proposalIndex) => {
                                            const proposalSlideKey = makeKey(
                                              proposal,
                                              item.startIndex + proposalIndex,
                                            );

                                            return (
                                              <div
                                                key={`proposal-slide-${proposalSlideKey}`}
                                                className="w-full shrink-0 snap-center"
                                              >
                                                <ProposalTimelineCard
                                                  message={proposal}
                                                  formState={
                                                    proposalFormState[
                                                      proposal.id
                                                    ] ?? {}
                                                  }
                                                  onFieldChange={(
                                                    field,
                                                    value,
                                                  ) =>
                                                    handleProposalFieldChange(
                                                      proposal.id,
                                                      field,
                                                      value,
                                                    )
                                                  }
                                                  onSave={() =>
                                                    handleSaveProposalEdits(
                                                      proposal,
                                                    )
                                                  }
                                                  onSend={() =>
                                                    handleSendEditedProposal(
                                                      proposal,
                                                    )
                                                  }
                                                  opsOpen={
                                                    opsPreviewOpenById[
                                                      proposal.id
                                                    ] ?? false
                                                  }
                                                  onToggleOps={() =>
                                                    toggleOpsPreview(
                                                      proposal.id,
                                                    )
                                                  }
                                                  isSending={aiLoading}
                                                  onQueueAiMessage={(
                                                    prompt,
                                                  ) => {
                                                    void handleRunAi(prompt);
                                                  }}
                                                  onSchedulerOpsOverrideChange={
                                                    handleSchedulerOpsOverridesChange
                                                  }
                                                />
                                              </div>
                                            );
                                          },
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </section>
                      )}
                      {chipSuggestions.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-[10px] uppercase tracking-[0.35em] text-white/60">
                            {clarificationQuestions.length > 0
                              ? "Clarification prompts"
                              : "Follow-ups"}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {chipSuggestions.map((value, index) => (
                              <button
                                key={`${value}-${index}`}
                                type="button"
                                onClick={() => {
                                  console.log("chip click", value);
                                  setAiPrompt(value);
                                }}
                                className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
                              >
                                {value}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {aiResponse?.snapshot ? (
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => setAiShowSnapshot((prev) => !prev)}
                            className="text-[10px] uppercase tracking-[0.4em] text-white/60 hover:text-white"
                          >
                            {aiShowSnapshot ? "Hide snapshot" : "Show snapshot"}
                          </button>
                          {aiShowSnapshot ? (
                            <pre className="max-h-[220px] overflow-auto rounded-xl border border-white/10 bg-black/50 p-3 text-[11px] text-white/80 whitespace-pre-wrap">
                              {JSON.stringify(aiResponse.snapshot, null, 2)}
                            </pre>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="border-t border-white/10 px-6 py-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={aiPrompt}
                      onChange={(event) => setAiPrompt(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          handleRunAi();
                        }
                      }}
                      placeholder="Describe what you need help with…"
                      className="flex-1 rounded-full border border-white/20 bg-black/60 px-4 py-2 text-sm text-white placeholder:text-white/50 focus:border-white/40 focus:outline-none"
                    />
                    <button
                      type="button"
                      data-tour="fab-ai"
                      onClick={handleRunAi}
                      disabled={aiLoading || !aiPrompt.trim() || quotaExceeded}
                      className={cn(
                        "rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 disabled:cursor-not-allowed disabled:opacity-60",
                        aiLoading ? "opacity-70" : "",
                      )}
                    >
                      {aiLoading ? "Sending…" : "Send"}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      <FabRescheduleOverlay
        open={Boolean(rescheduleTarget)}
        target={rescheduleTarget}
        dateValue={rescheduleDate}
        timeValue={rescheduleTime}
        error={rescheduleError}
        deleteError={deleteError}
        isSaving={isSavingReschedule}
        isDeleting={isDeletingEvent}
        onDateChange={setRescheduleDate}
        onTimeChange={setRescheduleTime}
        onClose={handleCloseReschedule}
        onSave={handleRescheduleSave}
        onDelete={handleDeleteEvent}
      />
    </div>
  );
}

type ProposalTimelineCardProps = {
  message: AiThreadProposalMessage;
  formState: ProposalFormValues;
  onFieldChange: (field: string, value: string) => void;
  onSave: (message: AiThreadProposalMessage) => void;
  onSend: (message: AiThreadProposalMessage) => void;
  opsOpen: boolean;
  onToggleOps: () => void;
  isSending: boolean;
  onQueueAiMessage: (prompt: string) => void;
  onSchedulerOpsOverrideChange: (
    messageId: string,
    ops: AiSchedulerOp[] | undefined,
  ) => void;
};

function ProposalTimelineCard({
  message,
  formState,
  onFieldChange,
  onSave,
  onSend,
  opsOpen,
  onToggleOps,
  isSending,
  onQueueAiMessage,
  onSchedulerOpsOverrideChange,
}: ProposalTimelineCardProps) {
  const baseDraft = message.ai.intent.draft ?? {};
  const overrideDraft = message.overrides?.draft ?? {};
  const baseKeys = Object.keys(baseDraft);
  const overrideOnlyKeys = Object.keys(overrideDraft).filter(
    (key) => !baseKeys.includes(key),
  );
  const fieldKeys = Array.from(new Set([...baseKeys, ...overrideOnlyKeys]));
  const [detailsOpen, setDetailsOpen] = useState(fieldKeys.length > 0);
  const rawOps = message.overrides?.schedulerOps ?? message.ai.intent.ops ?? [];
  const ops = normalizeSchedulerOps(rawOps);
  const assistantMessage = message.ai.assistant_message ?? "";
  const intentMessage = message.ai.intent.message ?? "";

  const getFieldValue = (key: string) => {
    if (formState[key] !== undefined) {
      return formState[key];
    }
    if (overrideDraft[key] !== undefined) {
      return overrideDraft[key];
    }
    const baseValue = baseDraft[key];
    if (baseValue === undefined || baseValue === null) return "";
    return String(baseValue);
  };

  const isGoalDraft = message.ai.intent.type === "DRAFT_CREATE_GOAL";
  const isProjectDraft = message.ai.intent.type === "DRAFT_CREATE_PROJECT";
  const isSchedulerDraft =
    message.ai.intent.type === "DRAFT_SCHEDULER_INPUT_OPS";

  if (isGoalDraft) {
    return (
      <GoalProposalForm
        message={message}
        fieldKeys={fieldKeys}
        getFieldValue={getFieldValue}
        onFieldChange={onFieldChange}
        onSave={onSave}
        onSend={onSend}
        isSending={isSending}
      />
    );
  }

  if (isProjectDraft) {
    return (
      <ProjectProposalForm
        message={message}
        fieldKeys={fieldKeys}
        getFieldValue={getFieldValue}
        onFieldChange={onFieldChange}
        onSave={onSave}
        onSend={onSend}
        isSending={isSending}
      />
    );
  }

  if (isSchedulerDraft) {
    return (
      <DayTypeProposalForm
        message={message}
        getFieldValue={getFieldValue}
        onFieldChange={onFieldChange}
        onSave={onSave}
        onSend={onSend}
        isSending={isSending}
        ops={ops}
        formState={formState}
        onQueueAiMessage={onQueueAiMessage}
        onSchedulerOpsOverrideChange={(ops) =>
          onSchedulerOpsOverrideChange(message.id, ops)
        }
      />
    );
  }

  const renderField = (key: string) => {
    const lowerKey = key.toLowerCase();
    const value = getFieldValue(key);
    const isPriorityField = lowerKey.includes("priority");
    const isEnergyField = lowerKey.includes("energy");
    const isTextareaField =
      lowerKey.includes("notes") ||
      lowerKey.includes("description") ||
      lowerKey.includes("why");
    const isDateField = lowerKey.includes("due") || lowerKey.includes("date");
    const label = humanizeFieldLabel(key);
    const handleChange = (next: string) => onFieldChange(key, next);

    return (
      <div key={key} className="space-y-1">
        <Label className="text-[10px] uppercase tracking-[0.3em] text-white/60">
          {label}
        </Label>
        {isPriorityField ? (
          <Select value={value} onValueChange={handleChange}>
            <SelectTrigger className="h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white">
              <SelectValue placeholder={`Select ${label}`} />
            </SelectTrigger>
            <SelectContent className="bg-[#050507] border border-white/10">
              {SCHEDULER_PRIORITY_LABELS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : isEnergyField ? (
          <Select value={value} onValueChange={handleChange}>
            <SelectTrigger className="h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white">
              <SelectValue placeholder={`Select ${label}`} />
            </SelectTrigger>
            <SelectContent className="bg-[#050507] border border-white/10">
              {ENERGY_OPTIONS_LOCAL.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : isTextareaField ? (
          <Textarea
            value={value}
            onChange={(event) => handleChange(event.target.value)}
            className="min-h-[120px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/50"
            placeholder={label}
          />
        ) : (
          <Input
            type={isDateField ? "date" : "text"}
            value={value}
            onChange={(event) => handleChange(event.target.value)}
            className="h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/50"
            placeholder={label}
          />
        )}
      </div>
    );
  };

  return (
    <div className="relative space-y-4 rounded-2xl border border-white/10 bg-gradient-to-b from-white/6 via-white/3 to-black/70 p-5 text-white shadow-[0_20px_45px_rgba(0,0,0,0.55)]">
      <div className="space-y-4 pb-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[8px] uppercase tracking-[0.35em] text-white/60">
              PROPOSAL
            </p>
            <p className="mt-1 text-base font-semibold leading-tight text-white">
              {message.ai.intent.title}
            </p>
          </div>
          <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.35em] text-white/70">
            {message.ai.intent.type.replaceAll("_", " ")}
          </span>
        </div>
        {assistantMessage ? (
          <p className="text-sm leading-relaxed text-white">
            {assistantMessage}
          </p>
        ) : null}
        {intentMessage ? (
          <p className="text-[11px] leading-relaxed text-white/70">
            <span className="mr-1 text-[10px] uppercase tracking-[0.25em] text-white/60">
              Notes
            </span>
            {intentMessage}
          </p>
        ) : null}
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">
            Details
          </p>
          <button
            type="button"
            onClick={() => setDetailsOpen((prev) => !prev)}
            className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70 transition hover:text-white"
          >
            {detailsOpen ? "Hide details" : "Edit details"}
          </button>
        </div>
        {detailsOpen ? (
          <div className="space-y-4">
            {fieldKeys.length > 0 ? (
              fieldKeys.map((key) => renderField(key))
            ) : (
              <p className="text-[11px] text-white/60">
                No editable fields detected.
              </p>
            )}
          </div>
        ) : null}
        {ops.length > 0 ? (
          <div className="space-y-2 rounded-2xl border border-white/10 bg-black/35 p-3 text-[11px] text-white/80">
            <button
              type="button"
              onClick={onToggleOps}
              className="flex w-full items-center justify-between rounded-xl border border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.35em] text-white/70 transition hover:border-white/30 hover:text-white"
            >
              <span>Ops preview</span>
              <span className="text-[10px] text-white/40">
                {ops.length} ops
              </span>
            </button>
            {opsOpen ? (
              <div className="space-y-2">
                {ops.map((op, index) => (
                  <div
                    key={`${op.type}-${index}`}
                    className="space-y-1 rounded-xl border border-white/10 bg-white/5 p-3"
                  >
                    <p className="text-[11px] font-semibold leading-tight text-white">
                      {describeSchedulerOp(op) ?? op.type}
                    </p>
                    <pre className="max-h-32 overflow-auto text-[10px] whitespace-pre-wrap text-white/60">
                      {JSON.stringify(op, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="sticky bottom-0 -mx-5 mt-4 border-t border-white/10 bg-[#050507]/80 backdrop-blur px-5 py-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="secondary"
            onClick={() => onSend(message)}
            disabled={isSending}
            className="w-full sm:w-auto"
          >
            {isSending ? "Sending…" : "Send edited to AI"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => onSave(message)}
            className="w-full sm:w-auto"
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

type GoalProposalFormProps = {
  message: AiThreadProposalMessage;
  fieldKeys: string[];
  getFieldValue: (key: string) => string;
  onFieldChange: (field: string, value: string) => void;
  onSave: (message: AiThreadProposalMessage) => void;
  onSend: (message: AiThreadProposalMessage) => void;
  isSending: boolean;
};

function GoalProposalForm({
  message,
  fieldKeys,
  getFieldValue,
  onFieldChange,
  onSave,
  onSend,
  isSending,
}: GoalProposalFormProps) {
  const dueDateKey = fieldKeys.includes("due_date")
    ? "due_date"
    : fieldKeys.includes("dueDate")
      ? "dueDate"
      : null;
  const hasWhyKey = fieldKeys.includes("why");
  const [manualDueValue, setManualDueValue] = useState("");
  const [manualWhyValue, setManualWhyValue] = useState("");

  const labelClassName =
    "text-[10px] font-semibold uppercase tracking-[0.35em] text-white/60";
  const inputClassName =
    "h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 text-[12px] text-white placeholder:text-white/60 placeholder:text-[12px] focus:border-blue-400/60 focus-visible:ring-0";

  const dueValue = dueDateKey ? getFieldValue(dueDateKey) : manualDueValue;
  const handleDueChange = (value: string) => {
    if (dueDateKey) {
      onFieldChange(dueDateKey, value);
      return;
    }
    setManualDueValue(value);
  };

  const whyValue = hasWhyKey ? getFieldValue("why") : manualWhyValue;
  const handleWhyChange = (value: string) => {
    if (hasWhyKey) {
      onFieldChange("why", value);
      return;
    }
    setManualWhyValue(value);
  };

  return (
    <div className="w-full sm:mx-auto sm:max-w-[520px]">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 via-white/10 to-black/80 p-3 sm:p-4 text-white">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#f87171] underline decoration-dotted decoration-white/50 underline-offset-4"
              title="Link to an existing monument"
            >
              LINK TO EXISTING MONUMENT +
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1">
              <Label className={labelClassName}>Name</Label>
              <div className="flex gap-2">
                <Input
                  value={getFieldValue("name")}
                  onChange={(event) =>
                    onFieldChange("name", event.target.value)
                  }
                  placeholder="Name this goal"
                  className={`${inputClassName} flex-1`}
                />
                <button
                  type="button"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] p-2 text-[11px] text-white shadow-[inset_0_1px_4px_rgba(255,255,255,0.08)] transition hover:border-white/30 hover:bg-white/10"
                  aria-label="Goal energy"
                >
                  <FlameEmber
                    level="MEDIUM"
                    size="sm"
                    className="pointer-events-none"
                  />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1 min-w-0">
                <Label className={labelClassName}>Priority</Label>
                <Select
                  value={getFieldValue("priority")}
                  onValueChange={(value) => onFieldChange("priority", value)}
                >
                  <SelectTrigger className={inputClassName}>
                    <SelectValue placeholder="Choose priority" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#050507] border border-white/10">
                    {SCHEDULER_PRIORITY_LABELS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 min-w-0">
                <Label className={labelClassName}>Due</Label>
                <Input
                  type="datetime-local"
                  value={dueValue}
                  onChange={(event) => handleDueChange(event.target.value)}
                  className={inputClassName}
                />
              </div>
            </div>

            <div className="sm:col-span-2 space-y-1">
              <Label className={labelClassName}>Why?</Label>
              <Textarea
                value={whyValue}
                onChange={(event) => handleWhyChange(event.target.value)}
                placeholder="Capture the motivation or vision for this goal"
                className="min-h-[80px] w-full rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-white placeholder:text-white/60 placeholder:text-[12px] focus:border-blue-400/60 focus-visible:ring-0"
              />
            </div>
          </div>

          <div className="mt-1 border-t border-white/10 pt-3">
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onSend(message)}
                disabled={isSending}
                aria-label="Request refinement"
                title="Request refinement"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ef4444] text-white shadow-[0_8px_20px_rgba(239,68,68,0.35)] transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                <X className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onSave(message)}
                disabled={isSending}
                aria-label="Save goal"
                title="Save goal"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-[0_8px_20px_rgba(16,185,129,0.35)] transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const PROJECT_PROPOSAL_STAGE_OPTIONS = [
  { value: "RESEARCH", label: "Research" },
  { value: "TEST", label: "Test" },
  { value: "BUILD", label: "Build" },
  { value: "REFINE", label: "Refine" },
  { value: "RELEASE", label: "Release" },
];

type ProjectProposalFormProps = {
  message: AiThreadProposalMessage;
  fieldKeys: string[];
  getFieldValue: (key: string) => string;
  onFieldChange: (field: string, value: string) => void;
  onSave: (message: AiThreadProposalMessage) => void;
  onSend: (message: AiThreadProposalMessage) => void;
  isSending: boolean;
};

function ProjectProposalForm({
  message,
  fieldKeys,
  getFieldValue,
  onFieldChange,
  onSave,
  onSend,
  isSending,
}: ProjectProposalFormProps) {
  const skillFieldKey =
    fieldKeys.find((key) => key.toLowerCase().includes("skill")) ?? "skill";
  const whyFieldKey = fieldKeys.includes("why")
    ? "why"
    : fieldKeys.includes("description")
      ? "description"
      : "why";
  const labelClassName =
    "text-[10px] font-semibold uppercase tracking-[0.35em] text-white/60";
  const baseInputClassName =
    "h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] text-[12px] text-white placeholder:text-white/60 focus:border-blue-400/60 focus-visible:ring-0";
  const standardInputClassName = `${baseInputClassName} px-4`;
  const energyLevel =
    (getFieldValue("energy") as FlameEmberProps["level"]) || "MEDIUM";

  return (
    <div className="mx-auto w-full max-w-[520px]">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 via-white/10 to-black/80 p-3 sm:p-4 text-white">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#f87171] underline decoration-dotted decoration-white/50 underline-offset-4"
              title="Link to an existing goal"
            >
              LINK TO EXISTING GOAL +
            </button>
          </div>

          <div className="space-y-1">
            <Label className={labelClassName}>Name</Label>
            <div className="flex gap-2">
              <Input
                value={getFieldValue("name")}
                onChange={(event) => onFieldChange("name", event.target.value)}
                placeholder="Name your PROJECT"
                className={`${standardInputClassName} flex-1`}
              />
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] p-2 text-[11px] text-white shadow-[inset_0_1px_4px_rgba(255,255,255,0.08)] transition hover:border-white/30 hover:bg-white/10"
                aria-label="Project energy"
              >
                <FlameEmber
                  level={energyLevel}
                  size="sm"
                  className="pointer-events-none"
                />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1 min-w-0">
              <Label className={labelClassName}>Priority</Label>
              <Select
                value={getFieldValue("priority")}
                onValueChange={(value) => onFieldChange("priority", value)}
              >
                <SelectTrigger className={standardInputClassName}>
                  <SelectValue placeholder="Choose priority" />
                </SelectTrigger>
                <SelectContent className="bg-[#050507] border border-white/10">
                  {SCHEDULER_PRIORITY_LABELS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 min-w-0">
              <Label className={labelClassName}>Stage</Label>
              <Select
                value={getFieldValue("stage")}
                onValueChange={(value) => onFieldChange("stage", value)}
              >
                <SelectTrigger className={standardInputClassName}>
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent className="bg-[#050507] border border-white/10">
                  {PROJECT_PROPOSAL_STAGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className={labelClassName}>Skills</Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                <Search className="h-4 w-4 text-white/40" />
              </span>
              <Input
                value={getFieldValue(skillFieldKey)}
                onChange={(event) =>
                  onFieldChange(skillFieldKey, event.target.value)
                }
                placeholder="Search skills..."
                className={`${baseInputClassName} pl-10 pr-11`}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                <Filter className="h-4 w-4 text-white/40" />
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <Label className={labelClassName}>Why?</Label>
            <Textarea
              value={getFieldValue(whyFieldKey)}
              onChange={(event) =>
                onFieldChange(whyFieldKey, event.target.value)
              }
              placeholder="Capture the motivation or success criteria for this project"
              className="min-h-[80px] w-full rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-white placeholder:text-white/60 placeholder:text-[12px] focus:border-blue-400/60 focus-visible:ring-0"
            />
          </div>

          <div className="mt-1 border-t border-white/10 pt-3">
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onSend(message)}
                disabled={isSending}
                aria-label="Request refinement"
                title="Request refinement"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ef4444] text-white shadow-[0_8px_20px_rgba(239,68,68,0.35)] transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                <X className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onSave(message)}
                disabled={isSending}
                aria-label="Save project"
                title="Save project"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-[0_8px_20px_rgba(16,185,129,0.35)] transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const DAY_TYPE_GENERATE_PROMPT =
  "Generate the full 24-hour time blocks for this day type based on my snapshot.";
const DAY_TYPE_QUESTION_PROMPT =
  "Before you generate blocks, ask me the single most important question.";

type DayTypeProposalFormProps = {
  message: AiThreadProposalMessage;
  getFieldValue: (key: string) => string;
  onFieldChange: (field: string, value: string) => void;
  onSave: (message: AiThreadProposalMessage) => void;
  onSend: (message: AiThreadProposalMessage) => void;
  isSending: boolean;
  ops: AiSchedulerOp[];
  formState: ProposalFormValues;
  onSchedulerOpsOverrideChange: (
    messageId: string,
    ops: AiSchedulerOp[] | undefined,
  ) => void;
  onQueueAiMessage: (prompt: string) => void;
};

function DayTypeProposalForm({
  message,
  getFieldValue,
  onFieldChange,
  onSave,
  onSend,
  isSending,
  ops,
  formState,
  onQueueAiMessage,
  onSchedulerOpsOverrideChange,
}: DayTypeProposalFormProps) {
  const draft = message.ai.intent.draft ?? {};
  const headerName = draft.day_type_name ?? "DAY TYPE";
  const storedOverrideValue = formState["schedulerOpsOverrides"];
  const storedOverrideOps = Array.isArray(storedOverrideValue)
    ? (storedOverrideValue as AiSchedulerOp[])
    : undefined;
  const [editedOps, setEditedOps] = useState<AiSchedulerOp[]>(() =>
    (storedOverrideOps ?? ops).map(cloneSchedulerOp),
  );

  useEffect(() => {
    const source = storedOverrideOps ?? ops;
    setEditedOps(source.map(cloneSchedulerOp));
  }, [storedOverrideOps, ops]);

  useEffect(() => {
    onSchedulerOpsOverrideChange(message.id, editedOps);
  }, [editedOps, message.id, onSchedulerOpsOverrideChange]);

  const previewBlocks = useMemo(
    () => buildDayTypePreviewBlocks(editedOps),
    [editedOps],
  );
  const previewTimelineBlocks = useMemo<DayType24hPreviewBlock[]>(() => {
    return previewBlocks
      .filter(
        (
          block,
        ): block is DayType24hPreviewBlock & {
          start_local: string;
          end_local: string;
        } => Boolean(block.start_local && block.end_local),
      )
      .map((block) => ({
        id: block.id,
        label: block.label,
        start_local: block.start_local,
        end_local: block.end_local,
        opIndex: block.opIndex,
        hasConstraints: block.hasConstraints,
      }));
  }, [previewBlocks]);
  const hasTimelineBlocks = previewTimelineBlocks.length > 0;
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const selectedBlock =
    selectedBlockId === null
      ? null
      : (previewBlocks.find((block) => block.id === selectedBlockId) ?? null);
  const selectedBlockIndex =
    selectedBlock === null
      ? -1
      : previewBlocks.findIndex((block) => block.id === selectedBlock.id);
  const selectedBlockNumber =
    selectedBlockIndex >= 0 ? selectedBlockIndex + 1 : 0;

  useEffect(() => {
    if (!selectedBlockId) return;
    if (!previewBlocks.some((block) => block.id === selectedBlockId)) {
      setSelectedBlockId(null);
    }
  }, [previewBlocks, selectedBlockId]);

  const dayTypeNameValue = getFieldValue("day_type_name");
  const labelClass = "text-[10px] uppercase tracking-[0.35em] text-white/60";
  const inputClass =
    "h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 text-[12px] text-white placeholder:text-white/60 focus:border-blue-400/60 focus-visible:ring-0";

  const selectedOp =
    selectedBlock?.opIndex !== undefined
      ? editedOps[selectedBlock.opIndex]
      : null;
  const [constraintsInput, setConstraintsInput] = useState("");
  const [constraintsError, setConstraintsError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedOp) {
      setConstraintsInput("");
      setConstraintsError(null);
      return;
    }
    const constraintSource =
      selectedOp.type === "CREATE_DAY_TYPE_TIME_BLOCK"
        ? selectedOp.constraints
        : selectedOp.type === "UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL"
          ? selectedOp.patch.constraints
          : undefined;
    if (constraintSource && Object.keys(constraintSource).length > 0) {
      setConstraintsInput(JSON.stringify(constraintSource, null, 2));
    } else {
      setConstraintsInput("");
    }
    setConstraintsError(null);
  }, [selectedBlock?.opIndex]);

  const updateSelectedOp = (updater: (op: AiSchedulerOp) => AiSchedulerOp) => {
    const opIndex = selectedBlock?.opIndex;
    if (opIndex === undefined) return;
    setEditedOps((prev) => {
      const next = [...prev];
      const target = next[opIndex];
      if (!target) return prev;
      next[opIndex] = updater(target);
      return next;
    });
  };

  const handleLabelChange = (value: string) => {
    updateSelectedOp((op) => {
      if (op.type === "CREATE_DAY_TYPE_TIME_BLOCK") {
        return { ...op, label: value };
      }
      if (op.type === "UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL") {
        return { ...op, block_label: value };
      }
      return op;
    });
  };

  const handleTimeChange = (
    field: "start_local" | "end_local",
    value: string,
  ) => {
    updateSelectedOp((op) => {
      if (op.type === "CREATE_DAY_TYPE_TIME_BLOCK") {
        return { ...op, [field]: value };
      }
      if (op.type === "UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL") {
        return {
          ...op,
          patch: {
            ...op.patch,
            [field]: value,
          },
        };
      }
      return op;
    });
  };

  const updateConstraints = (constraints?: Record<string, string>) => {
    updateSelectedOp((op) => {
      if (op.type === "CREATE_DAY_TYPE_TIME_BLOCK") {
        return {
          ...op,
          constraints: constraints ?? undefined,
        };
      }
      if (op.type === "UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL") {
        const nextPatch = { ...op.patch };
        if (constraints && Object.keys(constraints).length > 0) {
          nextPatch.constraints = constraints;
        } else {
          delete nextPatch.constraints;
        }
        return {
          ...op,
          patch: nextPatch,
        };
      }
      return op;
    });
  };

  const handleConstraintsInputChange = (value: string) => {
    setConstraintsInput(value);
    if (!value.trim()) {
      setConstraintsError(null);
      updateConstraints(undefined);
      return;
    }
    try {
      const parsed = JSON.parse(value);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        throw new Error("Constraints must be a JSON object");
      }
      const normalized: Record<string, string> = {};
      Object.entries(parsed).forEach(([key, val]) => {
        if (typeof val !== "string") {
          throw new Error("Constraint values must be strings");
        }
        const trimmedKey = key.trim();
        const trimmedVal = val.trim();
        if (!trimmedKey) {
          throw new Error("Constraint keys must be non-empty");
        }
        normalized[trimmedKey] = trimmedVal;
      });
      if (Object.keys(normalized).length === 0) {
        updateConstraints(undefined);
      } else {
        updateConstraints(normalized);
      }
      setConstraintsError(null);
    } catch (error) {
      setConstraintsError(
        error instanceof Error ? error.message : "Invalid JSON",
      );
    }
  };

  const selectedLabelValue =
    selectedOp?.type === "CREATE_DAY_TYPE_TIME_BLOCK"
      ? selectedOp.label
      : selectedOp?.type === "UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL"
        ? selectedOp.block_label
        : "";
  const selectedStartValue =
    selectedOp?.type === "CREATE_DAY_TYPE_TIME_BLOCK"
      ? selectedOp.start_local
      : selectedOp?.type === "UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL"
        ? (selectedOp.patch.start_local ?? selectedBlock?.start_local ?? "")
        : (selectedBlock?.start_local ?? "");
  const selectedEndValue =
    selectedOp?.type === "CREATE_DAY_TYPE_TIME_BLOCK"
      ? selectedOp.end_local
      : selectedOp?.type === "UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL"
        ? (selectedOp.patch.end_local ?? selectedBlock?.end_local ?? "")
        : (selectedBlock?.end_local ?? "");

  return (
    <div className="mx-auto w-full max-w-[520px]">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 via-white/10 to-black/80 p-3 sm:p-4 text-white">
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-[8px] uppercase tracking-[0.35em] text-white/60">
              DAY TYPE PROPOSAL
            </p>
            <p className="text-[18px] font-bold uppercase tracking-[0.3em] text-white/90 leading-tight">
              {headerName}
            </p>
          </div>

          <div className="space-y-2 rounded-2xl border border-white/10 bg-black/35 p-3 text-white">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/60">
                24H PREVIEW
              </p>
              <span className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                {editedOps.length} ops
              </span>
            </div>

            {previewTimelineBlocks.length > 0 ? (
              <div className="-mx-3 sm:mx-0">
                <DayType24hPreview
                  blocks={previewTimelineBlocks}
                  selectedId={selectedBlockId}
                  onSelect={(id) =>
                    setSelectedBlockId((prev) => (prev === id ? null : id))
                  }
                />
                {selectedBlock ? (
                  <div className="mt-3 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/60">
                        {`EDIT BLOCK ${selectedBlockNumber}`}
                      </p>
                      <button
                        type="button"
                        onClick={() => setSelectedBlockId(null)}
                        className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/70 transition hover:text-white"
                        aria-label="Done editing block"
                      >
                        Done
                      </button>
                    </div>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label className={labelClass}>Label</Label>
                        <Input
                          value={selectedLabelValue}
                          onChange={(event) =>
                            handleLabelChange(event.target.value)
                          }
                          placeholder={selectedBlock.label ?? "Block label"}
                          className={inputClass}
                        />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className={labelClass}>Start</Label>
                          <Input
                            type="time"
                            value={selectedStartValue}
                            onChange={(event) =>
                              handleTimeChange(
                                "start_local",
                                event.target.value,
                              )
                            }
                            placeholder={selectedBlock.start_local}
                            className={inputClass}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className={labelClass}>End</Label>
                          <Input
                            type="time"
                            value={selectedEndValue}
                            onChange={(event) =>
                              handleTimeChange("end_local", event.target.value)
                            }
                            placeholder={selectedBlock.end_local}
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className={labelClass}>Constraints</Label>
                        <Textarea
                          value={constraintsInput}
                          onChange={(event) =>
                            handleConstraintsInputChange(event.target.value)
                          }
                          placeholder='{"skill":"FITNESS","energy":"HIGH"}'
                          className="min-h-[70px] w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white placeholder:text-white/40 focus:border-blue-400/60 focus-visible:ring-0"
                        />
                        {constraintsError ? (
                          <p className="text-[10px] text-rose-200">
                            {constraintsError}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : hasTimelineBlocks ? (
                  <div className="mt-3 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-white/60 text-center">
                    TAP A BLOCK TO EDIT
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3 rounded-2xl border border-dashed border-white/20 bg-white/5 p-3 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/70">
                  NO TIME BLOCKS YET
                </p>
                <p className="text-[11px] text-white/70">
                  I assigned the day type, but haven’t generated the 24-hour
                  blocks.
                </p>
                <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                  <Button
                    type="button"
                    onClick={() => onQueueAiMessage(DAY_TYPE_GENERATE_PROMPT)}
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-white transition hover:border-white/40 hover:bg-white/20"
                  >
                    GENERATE 24H BLOCKS
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onQueueAiMessage(DAY_TYPE_QUESTION_PROMPT)}
                    className="w-full rounded-xl border border-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-white transition hover:border-white/40"
                  >
                    ASK ME 1 QUESTION FIRST
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-white/10 pt-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/60">
                EDIT BLOCKS
              </p>
              <p className="text-[12px] text-white/70">
                Rename it or tweak the blocks below.
              </p>
            </div>

            <div className="space-y-1">
              <Label className={labelClass}>Day type name</Label>
              <Input
                value={dayTypeNameValue}
                onChange={(event) =>
                  onFieldChange("day_type_name", event.target.value)
                }
                placeholder={headerName}
                className={inputClass}
              />
            </div>
          </div>

          <div className="mt-1 border-t border-white/10 pt-3">
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onSend(message)}
                disabled={isSending}
                aria-label="Request refinement"
                title="Request refinement"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ef4444] text-white shadow-[0_8px_20px_rgba(239,68,68,0.35)] transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                <X className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onSave(message)}
                disabled={isSending}
                aria-label="Save day type"
                title="Save day type"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-[0_8px_20px_rgba(16,185,129,0.35)] transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type FabNexusProps = {
  query: string;
  onQueryChange: (value: string) => void;
  results: FabSearchResult[];
  isSearching: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  onSelectResult: (result: FabSearchResult) => void;
  filterMonumentId?: string;
  onFilterMonumentChange?: (value: string) => void;
  filterSkillId?: string;
  onFilterSkillChange?: (value: string) => void;
  filterEventType?: OverlayEventTypeFilter;
  onFilterEventTypeChange?: (value: OverlayEventTypeFilter) => void;
  sortMode?: OverlaySortMode;
  onSortModeChange?: (value: OverlaySortMode) => void;
  availableMonuments?: Monument[];
  availableSkills?: Skill[];
  availableSkillCategories?: CatRow[];
  showToolbar?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
};

function FabNexus({
  query,
  onQueryChange,
  results,
  isSearching,
  isLoadingMore,
  error,
  hasMore,
  onLoadMore,
  onSelectResult,
  filterMonumentId,
  onFilterMonumentChange,
  filterSkillId,
  onFilterSkillChange,
  filterEventType,
  onFilterEventTypeChange,
  sortMode,
  onSortModeChange,
  availableMonuments,
  availableSkills,
  availableSkillCategories,
  showToolbar = false,
  inputRef,
}: FabNexusProps) {
  const [showControls, setShowControls] = useState(false);
  const hasResults = results.length > 0;
  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!hasMore || isLoadingMore) return;
    const target = event.currentTarget;
    const remaining =
      target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remaining < 120) {
      onLoadMore();
    }
  };

  const toolbarMonuments = availableMonuments ?? [];
  const handleMonumentChange = onFilterMonumentChange ?? (() => {});
  const handleSkillChange = onFilterSkillChange ?? (() => {});
  const handleEventTypeChange = onFilterEventTypeChange ?? (() => {});
  const handleSortChange = onSortModeChange ?? (() => {});
  const sortValue = sortMode ?? "scheduled";
  const eventTypeValue = filterEventType ?? "ALL";
  const toolbarSelectClass =
    "h-9 min-w-[120px] rounded-2xl border border-white/10 bg-black/50 px-3 text-[11px] font-semibold text-white/80 focus-visible:border-white/30 focus-visible:ring-0";
  const toolbarContentClass = "bg-black/90 text-white";
  const groupedToolbarSkills = useMemo(() => {
    const skills = availableSkills ?? [];
    const categories = availableSkillCategories ?? [];
    const UNCATEGORIZED_ID = "__uncategorized_skills__";
    const categoryOrder = new Map(
      categories.map((category, index) => [category.id, index]),
    );
    const groups = new Map<
      string,
      {
        id: string;
        label: string;
        order: number;
        skills: Skill[];
      }
    >();

    skills.forEach((skill) => {
      const categoryId = skill.cat_id ?? UNCATEGORIZED_ID;
      const category = categories.find((cat) => cat.id === categoryId);
      const fallbackLabel = categoryId === UNCATEGORIZED_ID ? "Uncategorized" : "Other";
      const label = category?.name?.trim() || fallbackLabel;
      const order =
        categoryId === UNCATEGORIZED_ID
          ? Number.MAX_SAFE_INTEGER
          : (categoryOrder.get(categoryId) ?? Number.MAX_SAFE_INTEGER - 1);
      if (!groups.has(categoryId)) {
        groups.set(categoryId, { id: categoryId, label, order, skills: [] });
      }
      groups.get(categoryId)?.skills.push(skill);
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        skills: [...group.skills].sort((a, b) =>
          (a.name ?? "").localeCompare(b.name ?? ""),
        ),
      }))
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  }, [availableSkillCategories, availableSkills]);

  const formatDateTime = (
    value: string | null,
    options?: Intl.DateTimeFormatOptions,
  ) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    try {
      return new Intl.DateTimeFormat(
        undefined,
        options ?? { dateStyle: "medium", timeStyle: "short" },
      ).format(date);
    } catch {
      return date.toLocaleString();
    }
  };

  const formatDatePart = (value: string | null): string | null =>
    formatDateTime(value, { dateStyle: "medium", timeStyle: undefined });
  const formatTimePart = (value: string | null): string | null =>
    formatDateTime(value, { timeStyle: "short" });

  const getStatusText = (result: FabSearchResult): React.ReactNode => {
    if (result.type === "PROJECT" && result.isCompleted) {
      const completedLabel = formatDateTime(result.completedAt);
      return completedLabel ? `Completed ${completedLabel}` : "Completed";
    }
    if (result.nextScheduledAt) {
      const dateLabel = formatDatePart(result.nextScheduledAt);
      const timeLabel = formatTimePart(result.nextScheduledAt);
      if (dateLabel && timeLabel) {
        return (
          <>
            <span>Scheduled {dateLabel}</span>
            <span>at {timeLabel}</span>
          </>
        );
      }
      if (dateLabel) {
        return <>Scheduled {dateLabel}</>;
      }
      return "Scheduled";
    }
    if (result.type === "HABIT" && result.nextDueAt) {
      const dueLabel = formatDateTime(result.nextDueAt, {
        dateStyle: "medium",
      });
      return dueLabel ? `Due ${dueLabel}` : "Due soon";
    }
    return "No upcoming schedule";
  };

  return (
    <div
      className="flex h-full w-full flex-col text-white"
      style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
    >
      <div className="px-4 pt-4">
        <div className="relative h-10">
          <span className="pointer-events-none absolute left-3 inset-y-0 flex items-center">
            <Search className="h-4 w-4 text-white/30" />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="search NEXUS"
            className="h-10 w-full rounded-lg border border-white/10 bg-black/60 pl-10 pr-14 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
            aria-label="Search NEXUS"
          />
          {showToolbar && (
            <button
              type="button"
              aria-label="Toggle Nexus filters"
              aria-expanded={showControls}
              onClick={() => setShowControls((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/70 transition hover:border-white/40 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
            >
              <Filter className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {showToolbar && showControls ? (
        <div className="px-4 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={filterMonumentId ?? ""}
              onValueChange={handleMonumentChange}
            >
              <SelectTrigger
                aria-label="Filter by monument"
                className={toolbarSelectClass}
              >
                <SelectValue placeholder="Monument" />
              </SelectTrigger>
              <SelectContent className={toolbarContentClass}>
                <SelectItem value="">All monuments</SelectItem>
                {toolbarMonuments.map((monument) => (
                  <SelectItem key={monument.id} value={monument.id}>
                    <span className="text-[10px]">
                      {(monument.emoji ?? "✨") +
                        " " +
                        (monument.title ?? "Monument")}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filterSkillId ?? ""}
              onValueChange={handleSkillChange}
            >
              <SelectTrigger
                aria-label="Filter by skill"
                className={toolbarSelectClass}
              >
                <SelectValue placeholder="Skill" />
              </SelectTrigger>
              <SelectContent className={toolbarContentClass}>
                <SelectItem value="">All skills</SelectItem>
                {groupedToolbarSkills.map((group) => (
                  <React.Fragment key={group.id}>
                    <SelectItem
                      value={`__skill_group__${group.id}`}
                      disabled
                      className="pointer-events-none px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-white/40 hover:bg-transparent"
                    >
                      {group.label}
                    </SelectItem>
                    {group.skills.map((skill) => (
                      <SelectItem key={skill.id} value={skill.id}>
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{skill.icon ?? "🛠️"}</span>
                          <span className="text-[10px]">{skill.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </React.Fragment>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={eventTypeValue}
              onValueChange={(value) =>
                handleEventTypeChange(value as OverlayEventTypeFilter)
              }
            >
              <SelectTrigger
                aria-label="Filter by event type"
                className={toolbarSelectClass}
              >
                <SelectValue placeholder="Event type" />
              </SelectTrigger>
              <SelectContent className={toolbarContentClass}>
                <SelectItem value="ALL">All events</SelectItem>
                <SelectItem value="PROJECT">Projects</SelectItem>
                <SelectItem value="HABIT">Habits</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortValue} onValueChange={handleSortChange}>
              <SelectTrigger
                aria-label="Sort overlay results"
                className={toolbarSelectClass}
              >
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent className={toolbarContentClass}>
                {OVERLAY_SORT_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="text-[10px] uppercase text-white/60"
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}
      <div
        className="flex-1 overflow-y-auto px-4 pb-4 pr-5 pt-3"
        data-fab-nexus-scroll="true"
        onScroll={handleScroll}
      >
        {isSearching ? (
          <div className="flex h-32 items-center justify-center text-white/60">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/20 bg-red-900/40 px-4 py-4 text-center text-sm text-red-100">
            {error}
          </div>
        ) : hasResults ? (
          <div className="flex flex-col">
            {results.map((result) => {
              const isCompletedProject =
                result.type === "PROJECT" && result.isCompleted;
              const isDisabled = isCompletedProject;
              const statusText = getStatusText(result);
              const goalLabel =
                result.type === "PROJECT" && result.goalName
                  ? result.goalName.trim()
                  : null;
              const energyLevel = normalizeFlameLevel(result.energy);
              const cardClassName = cn(
                "relative flex flex-col gap-1 rounded-lg border px-3 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40",
                isCompletedProject
                  ? "border-white/20 bg-white/5 text-white/90 shadow-[0_22px_42px_rgba(0,0,0,0.45)]"
                  : "border-white/5 bg-black/60 text-white/85 hover:bg-black/70",
                isDisabled && "cursor-not-allowed",
              );
              const nameTextClass = "text-white";
              const metaLabelClass =
                "text-[7px] md:text-[9px] uppercase tracking-[0.18em] text-white/70";
              const statusLabelClass =
                "text-[7px] md:text-[8px] uppercase tracking-[0.14em] text-white/60 break-words leading-tight";
              return (
                <button
                  key={`${result.type}-${result.id}`}
                  type="button"
                  onClick={() => {
                    if (isDisabled) return;
                    onSelectResult(result);
                  }}
                  disabled={isDisabled}
                  aria-disabled={isDisabled}
                  className={cardClassName}
                >
                  <div className="flex w-full flex-col gap-1 min-w-0">
                    <div className="flex w-full items-start justify-between gap-3">
                      <div className="flex flex-col gap-1 flex-[3] basis-3/4 min-w-0">
                        <span
                          className={cn(
                            "block line-clamp-2 break-words text-[12px] font-medium leading-snug tracking-wide",
                            nameTextClass,
                          )}
                        >
                          {result.name}
                        </span>
                        {result.type === "PROJECT" &&
                          result.global_rank !== null &&
                          result.global_rank !== undefined && (
                            <span className="text-gray-600 font-bold text-xs leading-none">
                              #{result.global_rank}
                            </span>
                          )}
                      </div>
                      <div className="flex items-start justify-end flex-shrink-0">
                        <span className={metaLabelClass}>
                          {result.type === "PROJECT" ? "Project" : "Habit"}
                        </span>
                      </div>
                    </div>
                    <div className="flex w-full">
                      <span className={statusLabelClass}>{statusText}</span>
                    </div>
                  </div>
                </button>
              );
            })}
            {isLoadingMore ? (
              <div className="flex items-center justify-center py-3 text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-black/50 px-4 py-6 text-center text-sm text-white/60">
            Start typing to search every project and habit.
          </div>
        )}
      </div>
    </div>
  );
}

type FabRescheduleOverlayProps = {
  open: boolean;
  target: FabSearchResult | null;
  dateValue: string;
  timeValue: string;
  error: string | null;
  deleteError: string | null;
  isSaving: boolean;
  isDeleting: boolean;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
};

function FabRescheduleOverlay({
  open,
  target,
  dateValue,
  timeValue,
  error,
  deleteError,
  isSaving,
  isDeleting,
  onDateChange,
  onTimeChange,
  onClose,
  onSave,
  onDelete,
}: FabRescheduleOverlayProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  useEffect(() => {
    setConfirmingDelete(false);
  }, [open, target?.id]);

  if (typeof document === "undefined") return null;
  const combinedErrors = [error, deleteError].filter(
    (message): message is string =>
      typeof message === "string" && message.length > 0,
  );
  const disableActions = isSaving || isDeleting;
  const deleteLabel =
    target?.type === "HABIT"
      ? "Habit"
      : target?.type === "PROJECT"
        ? "Project"
        : "Event";
  const handleDeleteClick = () => {
    if (disableActions || !target) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setConfirmingDelete(false);
    void onDelete();
  };
  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          data-fab-reschedule-overlay
          className="fixed inset-0 z-[2147483647] bg-black/60 backdrop-blur"
          style={{ touchAction: "manipulation" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          onTouchStart={(event) => event.stopPropagation()}
        >
          <motion.div
            className="absolute left-1/2 top-1/2 w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/10 bg-[#050507]/95 p-5 text-white shadow-2xl"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 rounded-full border border-white/10 p-1 text-white/70 transition hover:text-white"
              aria-label="Close reschedule menu"
              disabled={disableActions}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.35em] text-white/40">
                Reschedule
              </p>
              <h3 className="text-lg font-semibold leading-tight">
                {target?.name ?? "Event"}
              </h3>
            </div>
            <div className="mt-4 space-y-4">
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-[0.2em] text-white/55">
                  Due date
                </label>
                <input
                  type="date"
                  value={dateValue}
                  onChange={(event) => onDateChange(event.target.value)}
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                  disabled={disableActions}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-[0.2em] text-white/55">
                  Time due
                </label>
                <input
                  type="time"
                  value={timeValue}
                  onChange={(event) => onTimeChange(event.target.value)}
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                  disabled={disableActions}
                />
              </div>
              {combinedErrors.length > 0 && (
                <div className="rounded-xl border border-red-500/20 bg-red-900/30 px-3 py-2 text-sm text-red-100">
                  {combinedErrors.map((message, index) => (
                    <p key={`${message}-${index}`}>{message}</p>
                  ))}
                </div>
              )}
              <div className="pt-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDeleteClick}
                    onTouchEnd={(event) => {
                      event.stopPropagation();
                      handleDeleteClick();
                    }}
                    disabled={disableActions || !target}
                    className={cn(
                      "bg-red-600 text-white hover:bg-red-500 transition",
                      confirmingDelete && "border border-white/40 bg-red-700",
                    )}
                  >
                    {isDeleting
                      ? "Deleting…"
                      : confirmingDelete
                        ? `Confirm delete ${deleteLabel}`
                        : `Delete ${deleteLabel}`}
                  </Button>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setConfirmingDelete(false);
                        onClose();
                      }}
                      onTouchEnd={(event) => {
                        event.stopPropagation();
                        setConfirmingDelete(false);
                        onClose();
                      }}
                      className="text-white/70 hover:bg-white/10"
                      disabled={disableActions}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={onSave}
                      onTouchEnd={(event) => {
                        event.stopPropagation();
                        onSave();
                      }}
                      disabled={disableActions || !target?.scheduleInstanceId}
                      className="bg-white/90 text-black hover:bg-white"
                    >
                      {isSaving ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
