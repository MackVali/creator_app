"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { Check, ChevronDown, MoreVertical, Plus, X } from "lucide-react";
import { createPortal } from "react-dom";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import {
  saveCampaignGoalOrder,
  updateCampaignDetails,
  type Roadmap,
} from "@/lib/queries/roadmaps";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { FabEditTarget } from "@/components/ui/Fab";
import { useFabCreation } from "@/components/ui/FabCreationContext";
import { normalizeGoalStatus } from "@/lib/goals/status";
import { hapticErrorPattern } from "@/lib/haptics/creatorHaptics";
import { useToastHelpers } from "@/components/ui/toast";
import { teardownFabViewportState } from "@/components/ui/fabViewportCleanup";
import { CREATOR_MATRIX_XP_DEBUG_STORAGE_KEY } from "@/lib/effects/creatorXpBurstBus";

import type { Goal, Project, Task } from "../types";
import { GoalCard } from "./GoalCard";
import {
  ProjectRowTaskInteractionsProvider,
  type ProjectCardMorphOrigin,
} from "./ProjectRow";
import { ProjectsDropdown } from "./ProjectsDropdown";
import {
  campaignDrawerGoalLayoutId,
  campaignDrawerGoalRowKey,
  campaignDrawerProjectRowKey,
  campaignDrawerRowOverrideCompleted,
  campaignDrawerTaskRowKey,
  type CampaignDrawerRowLifecycle,
  type CampaignDrawerRowLifecycleById,
} from "./campaignDrawerRowState";

const cardSpringTransition = {
  type: "spring",
  stiffness: 480,
  damping: 36,
  mass: 0.75,
} as const;

const revealMotion = {
  hidden: { opacity: 0, scale: 0.985, y: 6 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: cardSpringTransition,
  },
  exit: {
    opacity: 0,
    scale: 0.985,
    y: 6,
    transition: { duration: 0.14, ease: "easeOut" },
  },
} as const;

const shellContentMotion = {
  hidden: { opacity: 0, y: 4, scale: 0.99 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: 0.04,
      duration: 0.16,
      ease: "easeOut",
    },
  },
  exit: {
    opacity: 0,
    y: 4,
    scale: 0.99,
    transition: { duration: 0.12, ease: "easeOut" },
  },
} as const;

const goalExpansionTransition = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1],
} as const;

const campaignDrawerRowTransition = {
  duration: 0.34,
  ease: [0.22, 1, 0.36, 1],
} as const;

const collapsedGoalMotion = {
  hidden: {
    opacity: 0,
    y: -3,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.18, ease: "easeOut" },
  },
  exit: {
    opacity: 0,
    y: -2,
    transition: { duration: 0.12, ease: "easeOut" },
  },
} as const;

const openedGoalMotion = {
  hidden: {
    opacity: 0,
    height: 0,
    y: 4,
  },
  visible: {
    opacity: 1,
    height: "auto",
    y: 0,
    transition: goalExpansionTransition,
  },
  exit: {
    opacity: 0,
    height: 0,
    y: 3,
    transition: { duration: 0.18, ease: "easeOut" },
  },
} as const;

const campaignDrawerOpenedGoalMotion = {
  hidden: {
    opacity: 0,
    height: 0,
    y: 3,
  },
  visible: {
    opacity: 1,
    height: "auto",
    y: 0,
    transition: campaignDrawerRowTransition,
  },
  exit: {
    opacity: 0,
    height: 0,
    y: 2,
    transition: campaignDrawerRowTransition,
  },
} as const;

const completedDrawerGoalActiveExitMotion = {
  opacity: 0,
  height: 0,
  x: 14,
  y: -8,
  transition: {
    height: { duration: 0.34, ease: [0.33, 0, 0.2, 1] },
    opacity: { duration: 0.22, ease: "easeOut" },
    x: { duration: 0.34, ease: [0.33, 0, 0.2, 1] },
    y: { duration: 0.34, ease: [0.33, 0, 0.2, 1] },
  },
} as const;

const COMPLETED_DRAWER_GOAL_EXIT_DELAY_MS = 1150;
const REDUCED_MOTION_COMPLETED_DRAWER_GOAL_EXIT_DELAY_MS = 900;

const newCampaignGoalRevealTransition = {
  duration: 0.56,
  ease: [0.16, 1, 0.3, 1],
} as const;

const goalManualCompleteRejectClass =
  "goal-manual-complete-reject !border-red-400/80 shadow-[0_0_0_1px_rgba(248,113,113,0.65),0_12px_28px_-22px_rgba(248,113,113,0.65)]";
const campaignDrawerNoSelectClass =
  "select-none [-webkit-user-select:none] [-webkit-touch-callout:none]";
const focusPomoCompleteSurfaceClass =
  "shimmer-border-complete focus-pomo-start-glint relative isolate z-0 overflow-hidden border-green-900/45 bg-[linear-gradient(155deg,rgba(34,197,94,0.94)_0%,rgba(22,163,74,0.97)_48%,rgba(21,128,61,0.98)_100%)] text-white shadow-[0_22px_38px_rgba(0,0,0,0.34),0_9px_18px_rgba(3,83,45,0.22),inset_0_1px_0_rgba(255,255,255,0.045),inset_0_-2px_8px_rgba(0,0,0,0.11),inset_0_0_0_1px_rgba(0,0,0,0.08)] ring-1 ring-green-900/45 outline outline-1 outline-green-900/40";
const campaignDrawerCompletedSurfaceClass =
  focusPomoCompleteSurfaceClass;
const campaignDrawerCompletingSurfaceClass =
  focusPomoCompleteSurfaceClass;

type CompletionMutationResult = boolean | void;
type CampaignDrawerGoalBucket = "active" | "hold" | "completed-hidden";

function reportCampaignDrawerXpTiming(
  label: string,
  detail: Record<string, unknown>
) {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") {
    return;
  }
  if (window.localStorage.getItem(CREATOR_MATRIX_XP_DEBUG_STORAGE_KEY) !== "1") {
    return;
  }
  console.info(`Campaign drawer XP timing: ${label}`, detail);
}

const closeGoalDetailAfterFabOpen = (closeGoalDetail: () => void) => {
  if (typeof window === "undefined") {
    closeGoalDetail();
    return;
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(closeGoalDetail);
  });
};

const queueFabViewportTeardown = () => {
  if (typeof window === "undefined") {
    teardownFabViewportState();
    return;
  }

  teardownFabViewportState();
  window.requestAnimationFrame(() => {
    teardownFabViewportState();
  });
  window.setTimeout(() => {
    teardownFabViewportState();
  }, 320);
};

type CampaignDetails = {
  id: string;
  name: string;
  emoji: string | null;
};

type NewProjectRevealMarker = {
  goalId: string;
  projectId: string;
  campaignId?: string | null;
};

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isCampaignDrawerGoalCompleted(goal: Goal): boolean {
  return normalizeGoalStatus(goal.status, goal.active) === "COMPLETED";
}

function getProjectCompletedTimestamp(project: Project) {
  const projectWithCompletion = project as Project & {
    completedAt?: string | null;
    completed_at?: string | null;
  };

  return (
    projectWithCompletion.completedAt ?? projectWithCompletion.completed_at ?? null
  );
}

function isCampaignDrawerProjectCompleted(project: Project): boolean {
  return (
    Boolean(getProjectCompletedTimestamp(project)) ||
    project.status === "Done" ||
    project.stage === "RELEASE" ||
    Number(project.progress ?? 0) >= 100
  );
}

function isCampaignDrawerTaskCompleted(task: Task): boolean {
  return Boolean(task.completedAt) || task.stage === "PERFECT";
}

function getCampaignDrawerGoalBucket(
  goal: Goal,
  lifecycle: CampaignDrawerRowLifecycle | undefined,
  pendingExit: boolean
): CampaignDrawerGoalBucket {
  if (pendingExit) return "hold";

  switch (lifecycle?.status) {
    case "completing":
    case "completed":
    case "rewarding":
    case "exiting":
      return "hold";
    case "completed-hidden":
      return "completed-hidden";
    case "active":
    case "undoing":
      return "active";
    default:
      return isCampaignDrawerGoalCompleted(goal)
        ? "completed-hidden"
        : "active";
  }
}

function getCampaignDrawerTaskActiveStage(task: Task) {
  return task.stage === "PERFECT" ? "PRODUCE" : task.stage;
}

function getCampaignDrawerIncompleteProjectProgress(project: Project) {
  if (project.tasks.length === 0) return 0;

  const completedCount = project.tasks.filter((task) =>
    Boolean(task.completedAt)
  ).length;
  const progress = Math.round((completedCount / project.tasks.length) * 100);

  return Math.min(progress, 99);
}

function isCampaignDrawerProjectCompletionUpdate(updates: Partial<Project>) {
  const completion = updates as Partial<Project> & {
    completedAt?: string | null;
    completed_at?: string | null;
  };

  return (
    updates.status === "Done" ||
    updates.stage === "RELEASE" ||
    Number(updates.progress ?? Number.NaN) >= 100 ||
    Boolean(completion.completedAt) ||
    Boolean(completion.completed_at)
  );
}

function getCampaignDrawerTaskCompletedAt(
  goals: Goal[],
  goalId: string,
  projectId: string,
  taskId: string
) {
  return (
    goals
      .find((goal) => goal.id === goalId)
      ?.projects.find((project) => project.id === projectId)
      ?.tasks.find((task) => task.id === taskId)?.completedAt ?? null
  );
}

function applyCampaignDrawerTaskCompletion(
  goals: Goal[],
  goalId: string,
  projectId: string,
  taskId: string,
  completedAt: string | null
) {
  return goals.map((goal) =>
    goal.id === goalId
      ? {
          ...goal,
          projects: goal.projects.map((project) => {
            if (project.id !== projectId) return project;
            const tasks = project.tasks.map((task) =>
              task.id === taskId
                ? {
                    ...task,
                    completedAt,
                    stage: completedAt
                      ? task.stage
                      : getCampaignDrawerTaskActiveStage(task),
                  }
                : task
            );
            const done = tasks.filter((task) => Boolean(task.completedAt)).length;
            const progress = tasks.length
              ? Math.round((done / tasks.length) * 100)
              : project.progress;

            return {
              ...project,
              tasks,
              progress,
            };
          }),
        }
      : goal
  );
}

function getFinitePriorityRank(goal: Goal): number | null {
  return typeof goal.priorityRank === "number" &&
    Number.isFinite(goal.priorityRank)
    ? goal.priorityRank
    : null;
}

function DraggableGoalCard({
  goal,
  index,
  isOpen,
  onOpenChange,
  onGoalEdit,
  onGoalToggleActive,
  onGoalDelete,
  onProjectEditOpen,
  onProjectUpdated,
  onTaskToggleCompletion,
  campaignDrawerRowOverrides,
  monumentContext,
  hideEnergyPill,
  campaignDrawerRow = false,
  onGoalManualComplete,
  onGoalManualUndo,
  suppressReadyToast = false,
  sourceCampaignId = null,
  newGoalRevealId = null,
  newProjectRevealId = null,
  onNewGoalRevealComplete,
  onNewProjectRevealComplete,
}: {
  goal: Goal;
  index: number;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onGoalEdit?: (goal: Goal) => void;
  onGoalToggleActive?: (goal: Goal) => void;
  onGoalDelete?: (goal: Goal) => void;
  onGoalManualComplete?: (
    goal: Goal,
    sourceRect?: DOMRect | null
  ) => CompletionMutationResult | Promise<CompletionMutationResult>;
  onGoalManualUndo?: (goal: Goal) => CompletionMutationResult | Promise<CompletionMutationResult>;
  onProjectUpdated?: (
    goalId: string,
    projectId: string,
    updates: Partial<Project>
  ) => void;
  onTaskToggleCompletion?: (
    goalId: string,
    projectId: string,
    taskId: string,
    currentCompletedAt: string | null,
    sourceRect?: DOMRect | null
  ) => CompletionMutationResult | Promise<CompletionMutationResult>;
  campaignDrawerRowOverrides?: CampaignDrawerRowLifecycleById;
  onProjectEditOpen?: (
    target: FabEditTarget,
    projectId: string,
    goalId: string,
    origin: ProjectCardMorphOrigin | null
  ) => void;
  monumentContext?: boolean;
  hideEnergyPill?: boolean;
  campaignDrawerRow?: boolean;
  suppressReadyToast?: boolean;
  sourceCampaignId?: string | null;
  newGoalRevealId?: string | null;
  newProjectRevealId?: string | null;
  onNewGoalRevealComplete?: (goalId: string) => void;
  onNewProjectRevealComplete?: (goalId: string, projectId: string) => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: goal.id });
  const wasDraggingRef = useRef(false);
  const goalElementRef = useRef<HTMLDivElement | null>(null);
  const rowClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRowLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const closedRowLongPressTriggeredRef = useRef(false);
  const lastRowClickAtRef = useRef(0);
  const rejectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goalCompletionTapStartedAtRef = useRef<number | null>(null);
  const readyToastShownGoalIdsRef = useRef<Set<string>>(new Set());
  const [manualCompleteRejected, setManualCompleteRejected] = useState(false);
  const [localCompleting, setLocalCompleting] = useState(false);
  const toast = useToastHelpers();
  const fabCreation = useFabCreation();

  // Debug logging for drag start
  useEffect(() => {
    if (isDragging) {
      console.log(`🎯 Drag started for goal: ${goal.id}`);
      wasDraggingRef.current = true;
    } else if (wasDraggingRef.current) {
      window.setTimeout(() => {
        wasDraggingRef.current = false;
      }, 0);
    }
  }, [isDragging, goal.id]);

  const displayEmoji =
    typeof (goal.emoji ?? goal.monumentEmoji) === "string" &&
    (goal.emoji ?? goal.monumentEmoji)?.trim().length
      ? (goal.emoji ?? goal.monumentEmoji)!.trim()
      : goal.title.slice(0, 2).toUpperCase();
  const allProjectsCompleted =
    goal.projects.length === 0 ||
    goal.projects.every((project) => {
      const overrideCompleted = campaignDrawerRowOverrideCompleted(
        campaignDrawerRowOverrides?.[campaignDrawerProjectRowKey(project.id)]
      );
      return overrideCompleted ?? isCampaignDrawerProjectCompleted(project);
    });
  const normalizedStatus = normalizeGoalStatus(goal.status, goal.active);
  const isCompleted =
    (campaignDrawerRowOverrideCompleted(
      campaignDrawerRowOverrides?.[campaignDrawerGoalRowKey(goal.id)]
    ) ??
      (normalizedStatus === "COMPLETED")) ||
    localCompleting;
  const isReadyToComplete = allProjectsCompleted && !isCompleted;
  const shellMotionProps = prefersReducedMotion
    ? {}
    : {
        whileTap: { scale: 0.97, y: 1 },
        transition: cardSpringTransition,
      };
  const rowLayoutTransition = campaignDrawerRow
    ? campaignDrawerRowTransition
    : goalExpansionTransition;
  const openedGoalVariants = campaignDrawerRow
    ? campaignDrawerOpenedGoalMotion
    : openedGoalMotion;
  const isNewGoalReveal = newGoalRevealId === goal.id;
  const shouldSuppressProjectRevealParentMotion =
    newProjectRevealId !== null && isOpen === true;
  const [shouldRenderOpenGoal, setShouldRenderOpenGoal] = useState(Boolean(isOpen));
  const [controlledGoalOpen, setControlledGoalOpen] = useState(Boolean(isOpen));
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setShouldRenderOpenGoal(true);
      setControlledGoalOpen(true);
      return;
    }

    setControlledGoalOpen(false);
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
      if (rowClickTimerRef.current !== null) {
        window.clearTimeout(rowClickTimerRef.current);
      }
      if (closedRowLongPressTimerRef.current !== null) {
        window.clearTimeout(closedRowLongPressTimerRef.current);
      }
      if (rejectTimerRef.current !== null) {
        window.clearTimeout(rejectTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (suppressReadyToast) {
      return;
    }
    if (!isReadyToComplete) {
      readyToastShownGoalIdsRef.current.delete(goal.id);
      return;
    }
    if (readyToastShownGoalIdsRef.current.has(goal.id)) return;
    readyToastShownGoalIdsRef.current.add(goal.id);
    toast.info("Goal ready to complete");
  }, [goal.id, isReadyToComplete, suppressReadyToast, toast]);

  useEffect(() => {
    if (normalizedStatus !== "COMPLETED") {
      setLocalCompleting(false);
    }
  }, [normalizedStatus]);

  const triggerManualCompleteRejection = useCallback(() => {
    setManualCompleteRejected(true);
    if (rejectTimerRef.current !== null) {
      clearTimeout(rejectTimerRef.current);
    }
    rejectTimerRef.current = setTimeout(() => {
      rejectTimerRef.current = null;
      setManualCompleteRejected(false);
    }, 460);
    void hapticErrorPattern();
    toast.error("Complete all projects first");
  }, [toast]);

  const setGoalNodeRef = useCallback(
    (node: HTMLDivElement | null) => {
      goalElementRef.current = node;
      setNodeRef(node);
    },
    [setNodeRef]
  );

  const handleManualCompleteAttempt = useCallback(() => {
    if (isCompleted && onGoalManualUndo) {
      void onGoalManualUndo(goal);
      return;
    }
    if (isReadyToComplete) {
      const tapTime = performance.now();
      goalCompletionTapStartedAtRef.current = tapTime;
      const sourceRect = goalElementRef.current?.getBoundingClientRect() ?? null;
      reportCampaignDrawerXpTiming("goal tap", {
        goalId: goal.id,
        action: "complete",
        tapTime,
      });
      reportCampaignDrawerXpTiming("goal source rect captured", {
        goalId: goal.id,
        capturedAt: performance.now(),
        elapsedMs: performance.now() - tapTime,
        hasRect: Boolean(sourceRect),
      });
      setLocalCompleting(true);
      void Promise.resolve(onGoalManualComplete?.(goal, sourceRect)).then((result) => {
        reportCampaignDrawerXpTiming("goal xp response", {
          goalId: goal.id,
          responseAt: performance.now(),
          elapsedMs: performance.now() - tapTime,
          ok: result !== false,
        });
        if (result === false) {
          setLocalCompleting(false);
        }
      });
      return;
    }
    if (!isCompleted) {
      triggerManualCompleteRejection();
    }
  }, [
    goal,
    isCompleted,
    isReadyToComplete,
    onGoalManualComplete,
    onGoalManualUndo,
    triggerManualCompleteRejection,
  ]);

  const handleClosedRowClick = useCallback(() => {
    if (wasDraggingRef.current) return;

    const nextOpen = !isOpen;

    if (!onGoalManualComplete) {
      onOpenChange?.(nextOpen);
      return;
    }

    const now = Date.now();
    const isDoubleTap = now - lastRowClickAtRef.current <= 320;
    lastRowClickAtRef.current = now;

    if (isDoubleTap) {
      if (rowClickTimerRef.current !== null) {
        clearTimeout(rowClickTimerRef.current);
        rowClickTimerRef.current = null;
      }
      handleManualCompleteAttempt();
      return;
    }

    if (rowClickTimerRef.current !== null) {
      clearTimeout(rowClickTimerRef.current);
    }
    rowClickTimerRef.current = setTimeout(() => {
      rowClickTimerRef.current = null;
      onOpenChange?.(nextOpen);
    }, 330);
  }, [handleManualCompleteAttempt, isOpen, onGoalManualComplete, onOpenChange]);

  const handleOpenedGoalChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        if (closeTimerRef.current !== null) {
          clearTimeout(closeTimerRef.current);
          closeTimerRef.current = null;
        }
        setShouldRenderOpenGoal(true);
        setControlledGoalOpen(true);
        onOpenChange?.(true);
        return;
      }

      setControlledGoalOpen(false);

      const closeDelay = prefersReducedMotion
        ? 140
        : campaignDrawerRow
          ? 1500
          : 520;

      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current);
      }

      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null;
        setShouldRenderOpenGoal(false);
        onOpenChange?.(false);
      }, closeDelay);
    },
    [campaignDrawerRow, onOpenChange, prefersReducedMotion]
  );

  const handleGoalEdit = useCallback(() => {
    if (!onGoalEdit) return;
    onGoalEdit(goal);
    closeGoalDetailAfterFabOpen(() => handleOpenedGoalChange(false));
  }, [goal, handleOpenedGoalChange, onGoalEdit]);

  const cancelClosedRowLongPress = useCallback(() => {
    if (closedRowLongPressTimerRef.current === null) return;
    clearTimeout(closedRowLongPressTimerRef.current);
    closedRowLongPressTimerRef.current = null;
  }, []);

  const handleClosedRowPointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (!onGoalEdit) return;
      if (
        event.target instanceof Element &&
        event.target.closest("[data-goal-drag-handle='true']")
      ) {
        return;
      }

      cancelClosedRowLongPress();
      closedRowLongPressTriggeredRef.current = false;
      closedRowLongPressTimerRef.current = setTimeout(() => {
        closedRowLongPressTimerRef.current = null;
        closedRowLongPressTriggeredRef.current = true;
        if (rowClickTimerRef.current !== null) {
          clearTimeout(rowClickTimerRef.current);
          rowClickTimerRef.current = null;
        }
        handleGoalEdit();
      }, 520);
    },
    [cancelClosedRowLongPress, handleGoalEdit, onGoalEdit]
  );

  const handleClosedRowPointerRelease = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      cancelClosedRowLongPress();
      if (!closedRowLongPressTriggeredRef.current) return;
      event.preventDefault();
      event.stopPropagation();
    },
    [cancelClosedRowLongPress]
  );

  const handleClosedRowClickEvent = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (closedRowLongPressTriggeredRef.current) {
        closedRowLongPressTriggeredRef.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      handleClosedRowClick();
    },
    [handleClosedRowClick]
  );

  const isCampaignGoalRowHoused = campaignDrawerRow;
  const campaignGoalContainerClass = `relative overflow-hidden rounded-lg border text-white transition hover:border-white/18 sm:rounded-xl ${
    campaignDrawerRow ? campaignDrawerNoSelectClass : ""
  } ${
      manualCompleteRejected
        ? goalManualCompleteRejectClass
      : isCompleted
      ? localCompleting
        ? campaignDrawerCompletingSurfaceClass
        : campaignDrawerCompletedSurfaceClass
      : "border-white/8 bg-[linear-gradient(180deg,rgba(66,66,66,0.18)_0%,rgba(28,28,28,0.74)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
  }`;

  const compactGoalRow = (
    <motion.button
      type="button"
      aria-expanded={campaignDrawerRow ? Boolean(isOpen) : undefined}
      onPointerDown={handleClosedRowPointerDown}
      onPointerUp={handleClosedRowPointerRelease}
      onPointerCancel={handleClosedRowPointerRelease}
      onPointerLeave={handleClosedRowPointerRelease}
      onClick={handleClosedRowClickEvent}
      className={`relative flex w-full items-center gap-2 px-2 py-1.5 text-left text-white transition hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 sm:gap-2.5 sm:px-2.5 sm:py-2 ${
        campaignDrawerRow ? campaignDrawerNoSelectClass : ""
      } ${
        isCampaignGoalRowHoused
          ? "rounded-lg border border-transparent bg-transparent shadow-none sm:rounded-xl"
          : manualCompleteRejected
          ? goalManualCompleteRejectClass
          : isCompleted
          ? focusPomoCompleteSurfaceClass
          : "rounded-lg border border-white/8 bg-[linear-gradient(180deg,rgba(66,66,66,0.18)_0%,rgba(28,28,28,0.74)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-white/18 sm:rounded-xl"
      }`}
      {...shellMotionProps}
      layout={
        prefersReducedMotion || shouldSuppressProjectRevealParentMotion
          ? undefined
          : "size"
      }
      variants={
        prefersReducedMotion || shouldSuppressProjectRevealParentMotion
          ? undefined
          : collapsedGoalMotion
      }
      initial={
        shouldSuppressProjectRevealParentMotion
          ? false
          : prefersReducedMotion
            ? { opacity: 0 }
            : "hidden"
      }
      animate={
        shouldSuppressProjectRevealParentMotion
          ? undefined
          : prefersReducedMotion
            ? { opacity: 1 }
            : "visible"
      }
      exit={
        shouldSuppressProjectRevealParentMotion
          ? undefined
          : prefersReducedMotion
            ? { opacity: 0 }
            : "exit"
      }
      transition={
        prefersReducedMotion
          ? { duration: 0.12 }
          : { layout: goalExpansionTransition }
      }
    >
      <div
        className={`flex h-7 w-7 shrink-0 touch-none items-center justify-center rounded-lg text-[10px] font-semibold shadow-[inset_0_-1px_0_rgba(255,255,255,0.05)] cursor-grab active:cursor-grabbing sm:h-8 sm:w-8 sm:text-[11px] ${
          isCompleted
            ? "border border-emerald-50/24 bg-emerald-950/18 text-emerald-50"
            : "border border-white/12 bg-black/35 text-white/82"
        }`}
        {...attributes}
        {...listeners}
        data-goal-drag-handle="true"
        aria-label="Drag goal to reorder"
        onClickCapture={(event) => {
          if (!wasDraggingRef.current) return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {isCompleted ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : displayEmoji}
      </div>

      <p
        className={`min-w-0 flex-1 truncate text-[12px] font-medium leading-tight sm:text-[13px] ${
          isCompleted ? "text-emerald-50/92" : "text-white/84"
        }`}
        title={goal.title}
      >
        {goal.title}
      </p>

      <ChevronDown
        aria-hidden="true"
        className={`h-4 w-4 shrink-0 text-white/45 transition-transform duration-200 ${
          isOpen ? "rotate-180" : ""
        }`}
      />

      <span
        className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] sm:px-2 sm:text-[9px] ${
          isCompleted
            ? "border-emerald-50/20 bg-emerald-950/18 text-emerald-50/78"
            : "border-white/10 bg-black/35 text-white/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        }`}
      >
        {index + 1}
      </span>
    </motion.button>
  );

  return (
    <motion.div
      ref={setGoalNodeRef}
      data-creator-xp-source={
        campaignDrawerRow ? "campaign-drawer-card" : undefined
      }
      data-creator-xp-kind={campaignDrawerRow ? "goal" : undefined}
      exit={
        campaignDrawerRow
          ? prefersReducedMotion
            ? { opacity: 0, height: 0 }
            : completedDrawerGoalActiveExitMotion
          : undefined
      }
      transition={campaignDrawerRow && prefersReducedMotion ? { duration: 0.16 } : undefined}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition,
      }}
      className={`relative ${isDragging ? "scale-105 shadow-2xl z-50" : ""}`}
      layout={
        campaignDrawerRow && !prefersReducedMotion ? "position" : undefined
      }
      layoutId={
        campaignDrawerRow && !prefersReducedMotion
          ? campaignDrawerGoalLayoutId(goal.id)
          : undefined
      }
    >
      {/* Goal Card with inline expansion */}
      <motion.div
        className="overflow-hidden"
        layout={
          prefersReducedMotion || shouldSuppressProjectRevealParentMotion
            ? undefined
            : "size"
        }
        initial={
          isNewGoalReveal
            ? prefersReducedMotion
              ? { opacity: 0 }
              : { opacity: 0, height: 0, y: -6 }
            : false
        }
        animate={
          isNewGoalReveal
            ? prefersReducedMotion
              ? { opacity: 1 }
              : {
                  opacity: 1,
                  height: "auto",
                  y: 0,
                  transition: newCampaignGoalRevealTransition,
                }
            : undefined
        }
        onAnimationComplete={() => {
          if (isNewGoalReveal) {
            onNewGoalRevealComplete?.(goal.id);
          }
        }}
        transition={
          prefersReducedMotion
            ? { duration: 0.01 }
            : { layout: rowLayoutTransition }
        }
      >
        {campaignDrawerRow ? (
          <motion.div
            className={campaignGoalContainerClass}
            layout={
              prefersReducedMotion || shouldSuppressProjectRevealParentMotion
                ? undefined
                : "size"
            }
            transition={
              prefersReducedMotion
                ? { duration: 0.12 }
                : { layout: rowLayoutTransition }
            }
          >
            {compactGoalRow}
            <AnimatePresence initial={false}>
              {isOpen ? (
                <motion.div
                  className="overflow-hidden border-t border-white/8"
                  layout={
                    prefersReducedMotion || shouldSuppressProjectRevealParentMotion
                      ? undefined
                      : "size"
                  }
                  variants={
                    prefersReducedMotion || shouldSuppressProjectRevealParentMotion
                      ? undefined
                      : openedGoalVariants
                  }
                  initial={
                    shouldSuppressProjectRevealParentMotion
                      ? false
                      : prefersReducedMotion
                        ? { opacity: 0 }
                        : "hidden"
                  }
                  animate={
                    shouldSuppressProjectRevealParentMotion
                      ? undefined
                      : prefersReducedMotion
                        ? { opacity: 1 }
                        : "visible"
                  }
                  exit={
                    shouldSuppressProjectRevealParentMotion
                      ? undefined
                      : prefersReducedMotion
                        ? { opacity: 0 }
                        : "exit"
                  }
                  transition={
                    prefersReducedMotion
                      ? { duration: 0.12 }
                      : { layout: rowLayoutTransition }
                  }
                >
                  <ProjectRowTaskInteractionsProvider
                    value={{
                      goalId: goal.id,
                      onTaskToggleCompletion,
                    }}
                  >
                    <ProjectsDropdown
                      id={`goal-${goal.id}`}
                      goalTitle={goal.title}
                      projects={goal.projects}
                      loading={false}
                      onProjectLongPress={
                        onProjectEditOpen
                          ? (project, origin) =>
                              onProjectEditOpen(
                                {
                                  entityType: "PROJECT",
                                  entityId: project.id,
                                  title: project.name,
                                  status: project.status,
                                  stage: project.stage ?? null,
                                  progress: project.progress,
                                  completedAt: getProjectCompletedTimestamp(project),
                                  originRect: origin
                                    ? {
                                        top: origin.y,
                                        left: origin.x,
                                        width: origin.width,
                                        height: origin.height,
                                      }
                                    : null,
                                },
                                project.id,
                                goal.id,
                                origin
                              )
                          : undefined
                      }
                      goalId={goal.id}
                      projectTasksOnly={false}
                      onProjectUpdated={(projectId, updates) =>
                        onProjectUpdated?.(goal.id, projectId, updates)
                      }
                      onTaskToggleCompletion={onTaskToggleCompletion}
                      campaignDrawerXpSource
                      campaignDrawerRowOverrides={campaignDrawerRowOverrides}
                      newProjectRevealId={newProjectRevealId}
                      onNewProjectRevealComplete={(projectId) =>
                        onNewProjectRevealComplete?.(goal.id, projectId)
                      }
                      addingProject={false}
                      onAddProject={(originRect) =>
                        fabCreation?.requestProjectCreation(
                          goal.id,
                          originRect ?? null,
                          {
                            preserveDrawer: {
                              type: "goal",
                              id: goal.id,
                              parentId: sourceCampaignId,
                            },
                          }
                        )
                      }
                    />
                  </ProjectRowTaskInteractionsProvider>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        ) : (
          <AnimatePresence initial={false}>
            {shouldRenderOpenGoal ? (
              <motion.div
                className="overflow-hidden"
                layout={
                  prefersReducedMotion || shouldSuppressProjectRevealParentMotion
                    ? undefined
                    : "size"
                }
                variants={
                  prefersReducedMotion || shouldSuppressProjectRevealParentMotion
                    ? undefined
                    : openedGoalVariants
                }
                initial={
                  shouldSuppressProjectRevealParentMotion
                    ? false
                    : prefersReducedMotion
                      ? { opacity: 0 }
                      : "hidden"
                }
                animate={
                  shouldSuppressProjectRevealParentMotion
                    ? undefined
                    : prefersReducedMotion
                      ? { opacity: 1 }
                      : "visible"
                }
                exit={
                  shouldSuppressProjectRevealParentMotion
                    ? undefined
                    : prefersReducedMotion
                      ? { opacity: 0 }
                      : "exit"
                }
                transition={
                  prefersReducedMotion
                    ? { duration: 0.12 }
                    : { layout: rowLayoutTransition }
                }
              >
                <GoalCard
                  goal={goal}
                  showWeight={false}
                  showCreatedAt={false}
                  showEmojiPrefix={false}
                  hideEnergyPill={hideEnergyPill}
                  variant="default"
                  drawerCompact
                  open={controlledGoalOpen}
                  onOpenChange={handleOpenedGoalChange}
                  onEdit={onGoalEdit ? handleGoalEdit : undefined}
                  onToggleActive={
                    onGoalToggleActive
                      ? () => onGoalToggleActive(goal)
                      : undefined
                  }
                  onDelete={onGoalDelete ? () => onGoalDelete(goal) : undefined}
                  onProjectEditOpen={
                    onProjectEditOpen
                      ? (target, project, origin) =>
                          onProjectEditOpen(target, project.id, goal.id, origin)
                      : undefined
                  }
                  onProjectUpdated={(projectId, updates) =>
                    onProjectUpdated?.(goal.id, projectId, updates)
                  }
                  monumentContext={monumentContext}
                  completeWhenProjectsDone
                  completionTheme="emerald"
                />
              </motion.div>
            ) : (
              compactGoalRow
            )}
          </AnimatePresence>
        )}
      </motion.div>
    </motion.div>
  );
}

function AddGoalButton({
  campaignId,
  onAddGoal,
}: {
  campaignId: string;
  onAddGoal?: (campaignId: string) => void;
}) {
  if (!onAddGoal) return null;

  return (
    <button
      type="button"
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onAddGoal(campaignId);
      }}
      className="relative flex w-full items-center gap-2 rounded-lg border border-white/8 bg-[linear-gradient(180deg,rgba(66,66,66,0.18)_0%,rgba(28,28,28,0.74)_100%)] px-2 py-1.5 text-left text-white transition shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-white/18 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2.5 sm:rounded-xl sm:px-2.5 sm:py-2"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/80 shadow-[inset_0_-1px_0_rgba(255,255,255,0.05)] sm:h-8 sm:w-8">
        <Plus aria-hidden="true" className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium leading-tight text-white/84 sm:text-[13px]">
        ADD GOAL
      </span>
    </button>
  );
}

interface CampaignCardProps {
  roadmap: Roadmap;
  goalCount: number;
  goals: Goal[];
  onClick?(): void;
  onAddGoal?: (campaignId: string) => void;
  variant?: "default" | "compact";
  onGoalEdit?: (goal: Goal) => void;
  onGoalToggleActive?: (goal: Goal) => void;
  onGoalDelete?: (goal: Goal) => void;
  onGoalManualComplete?: (
    goal: Goal,
    sourceRect?: DOMRect | null
  ) => CompletionMutationResult | Promise<CompletionMutationResult>;
  onGoalManualUndo?: (goal: Goal) => CompletionMutationResult | Promise<CompletionMutationResult>;
  onProjectUpdated?: (
    goalId: string,
    projectId: string,
    updates: Partial<Project>
  ) => void;
  onTaskToggleCompletion?: (
    goalId: string,
    projectId: string,
    taskId: string,
    currentCompletedAt: string | null,
    sourceRect?: DOMRect | null
  ) => CompletionMutationResult | Promise<CompletionMutationResult>;
  onRoadmapOrderSaved?: () => void | Promise<void>;
  onCampaignDetailsSaved?: (
    campaignId: string,
    details: CampaignDetails
  ) => void | Promise<void>;
  onProjectEditOpen?: (
    target: FabEditTarget,
    projectId: string,
    goalId: string,
    origin: ProjectCardMorphOrigin | null
  ) => void;
  monumentContext?: boolean;
  suppressReadyToast?: boolean;
  restoreOpen?: boolean;
  restoreOpenGoalId?: string | null;
  newGoalRevealId?: string | null;
  newProjectReveal?: NewProjectRevealMarker | null;
  onNewGoalRevealComplete?: (goalId: string) => void;
  onNewProjectRevealComplete?: (goalId: string, projectId: string) => void;
}

function CampaignCardImpl({
  roadmap,
  goalCount,
  goals,
  onClick,
  onAddGoal,
  variant = "default",
  onGoalEdit,
  onGoalToggleActive,
  onGoalDelete,
  onGoalManualComplete,
  onGoalManualUndo,
  onProjectUpdated,
  onTaskToggleCompletion,
  onProjectEditOpen,
  monumentContext = false,
  suppressReadyToast = false,
  restoreOpen = false,
  restoreOpenGoalId = null,
  newGoalRevealId = null,
  newProjectReveal = null,
  onNewGoalRevealComplete,
  onNewProjectRevealComplete,
  onRoadmapOrderSaved,
  onCampaignDetailsSaved,
}: CampaignCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [openGoalId, setOpenGoalId] = useState<string | null>(null);
  const [localGoals, setLocalGoals] = useState(goals);

  useEffect(() => {
    // Sort goals by priority_rank if available, otherwise maintain original order
    const sortedGoals = [...goals].sort((a, b) => {
      const aRank = getFinitePriorityRank(a);
      const bRank = getFinitePriorityRank(b);

      // If both have priority_rank, sort by it
      if (aRank !== null && bRank !== null) {
        return aRank - bRank;
      }

      // If only one has priority_rank, prioritize the one that has it
      if (aRank !== null && bRank === null) {
        return -1;
      }
      if (bRank !== null && aRank === null) {
        return 1;
      }

      // If neither has priority_rank, maintain original order (by index in goals array)
      return 0;
    });

    setLocalGoals(sortedGoals);
  }, [goals]);

  useEffect(() => {
    return () => {
      setOpen(false);
    };
  }, []);

  useLayoutEffect(() => {
    if (!restoreOpen) return;
    setOpen(true);
  }, [restoreOpen]);

  const handleToggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const dragSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 10,
      },
    })
  );

  const saveCampaignGoalPositions = useCallback(
    async (goalsToSave: Goal[]) => {
      try {
        await saveCampaignGoalOrder(
          roadmap.id,
          goalsToSave.map((goal) => goal.id)
        );
      } catch (error) {
        console.error("Failed to save campaign goal order:", error);
        throw error;
      }
    },
    [roadmap.id]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      console.log("🎯 Drag ended:", event);
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = localGoals.findIndex((item) => item.id === active.id);
        const newIndex = localGoals.findIndex((item) => item.id === over.id);

        console.log(`Moving from index ${oldIndex} to ${newIndex}`);
        const reordered = arrayMove(localGoals, oldIndex, newIndex);

        const updatedGoals = reordered.map((goal, index) => ({
          ...goal,
          priorityRank: index + 1,
        }));

        setLocalGoals(updatedGoals);
        try {
          await saveCampaignGoalPositions(updatedGoals);
        } catch {
          setLocalGoals(localGoals);
          return;
        }
        await onRoadmapOrderSaved?.();
      }
    },
    [localGoals, saveCampaignGoalPositions, onRoadmapOrderSaved]
  );

  const handleProjectUpdated = useCallback(
    (goalId: string, projectId: string, updates: Partial<Project>) => {
      setLocalGoals((currentGoals) =>
        currentGoals.map((currentGoal) =>
          currentGoal.id === goalId
            ? {
                ...currentGoal,
                projects: currentGoal.projects.map((project) =>
                  project.id === projectId ? { ...project, ...updates } : project
                ),
              }
            : currentGoal
        )
      );
      onProjectUpdated?.(goalId, projectId, updates);
    },
    [onProjectUpdated]
  );

  const hasGoals = goals.length > 0;
  const shellMotionProps = prefersReducedMotion
    ? {}
    : {
        whileTap: { scale: 0.97, y: 1 },
        transition: cardSpringTransition,
      };
  const revealProps = prefersReducedMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.12 },
      }
    : {
        variants: revealMotion,
        initial: "hidden" as const,
        animate: "visible" as const,
        exit: "exit" as const,
      };

  if (variant === "compact") {
    const containerBase =
      "group relative h-full rounded-2xl border-2 border-yellow-400 shimmer-border p-3 text-white min-h-[96px]";
    const containerClass = `${containerBase} shadow-[0_10px_26px_-14px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.06)] aspect-[5/6]`;
    return (
      <div className={containerClass} data-variant="compact">
        <div className="pointer-events-none absolute inset-0 rounded-2xl [mask-image:linear-gradient(to_bottom,black,transparent_70%)] bg-[radial-gradient(120%_70%_at_50%_0%,rgba(255,255,255,0.10),transparent_60%)]" />
        <div className="relative z-0 flex h-full min-w-0 flex-col items-stretch">
          <motion.button
            type="button"
            onClick={() => {
              handleToggle();
              onClick?.();
            }}
            className="flex flex-1 flex-col items-center gap-1 min-w-0 text-center"
            {...shellMotionProps}
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
          </motion.button>

          <AnimatePresence initial={false}>
            {open && hasGoals ? (
              <CampaignDrawer
                roadmap={roadmap}
                goals={localGoals}
                onClose={handleToggle}
                onGoalEdit={onGoalEdit}
                onGoalToggleActive={onGoalToggleActive}
                onGoalDelete={onGoalDelete}
                onGoalManualComplete={onGoalManualComplete}
                onGoalManualUndo={onGoalManualUndo}
                onProjectUpdated={handleProjectUpdated}
                onTaskToggleCompletion={onTaskToggleCompletion}
                onProjectEditOpen={onProjectEditOpen}
                monumentContext={monumentContext}
                suppressReadyToast={suppressReadyToast}
                onAddGoal={onAddGoal}
                restoreOpen={restoreOpen}
                restoreOpenGoalId={restoreOpenGoalId}
                newGoalRevealId={newGoalRevealId}
                newProjectReveal={newProjectReveal}
                onNewGoalRevealComplete={onNewGoalRevealComplete}
                onNewProjectRevealComplete={onNewProjectRevealComplete}
                onCampaignDetailsSaved={onCampaignDetailsSaved}
                onGoalsReordered={async (reordered) => {
                  setLocalGoals(reordered);
                  await onRoadmapOrderSaved?.();
                }}
              />
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // Default variant is the Goals grid Campaign Card. Keep AddGoalButton outside DndContext/SortableContext so it is not sortable.
  return (
    <div className="group relative min-h-full rounded-[24px] border border-white/10 bg-[#0A0B0F]/88 p-2.5 text-white shadow-[0_20px_42px_-28px_rgba(0,0,0,0.75)] transition hover:-translate-y-1 hover:border-white/18 sm:rounded-[30px] sm:p-4">
      <div className="relative flex min-h-full flex-col gap-2.5 sm:gap-4">
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          <motion.button
            onClick={() => {
              handleToggle();
              onClick?.();
            }}
            className="relative flex flex-1 flex-col gap-1 overflow-hidden text-left sm:gap-2"
            {...shellMotionProps}
          >
            <div className="relative z-10 flex items-start gap-2 sm:gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-lg font-semibold text-white sm:h-12 sm:w-12 sm:rounded-2xl sm:text-xl">
                {roadmap.emoji ?? roadmap.title.slice(0, 2)}
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-1 text-[10px] uppercase tracking-[0.14em] sm:gap-2 sm:text-[11px] sm:tracking-[0.18em]">
                  <span className="flex items-center gap-1 rounded-full border border-white/10 px-1.5 py-0.5 text-white/80 sm:px-2">
                    <span className="text-[9px] uppercase tracking-[0.14em] sm:text-[10px] sm:tracking-[0.2em]">
                      CAMPAIGN
                    </span>
                  </span>
                </div>
                <h3 className="mt-0.5 text-lg font-semibold leading-tight sm:mt-2 sm:text-xl">{roadmap.title}</h3>
              </div>
              <ChevronDown
                className={`mt-0.5 h-4 w-4 text-white/60 transition-transform sm:mt-1 sm:h-5 sm:w-5 ${
                  open ? "rotate-180" : ""
                }`}
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-white/60 sm:gap-3 sm:text-xs">
              <div className="flex items-center gap-1.5 rounded-full border border-white/10 px-2 py-0.5 sm:gap-2 sm:px-3 sm:py-1">
                <span
                  className="h-1 w-1 rounded-full bg-white/60 sm:h-1.5 sm:w-1.5"
                  aria-hidden="true"
                />
                <span>
                  {goalCount} {goalCount === 1 ? "goal" : "goals"}
                </span>
              </div>
            </div>
          </motion.button>
        </div>

        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              className="w-full origin-top rounded-[18px] border border-white/10 bg-white/[0.03] p-1.5 shadow-[0_20px_32px_-24px_rgba(0,0,0,0.8)] sm:rounded-[24px] sm:p-2"
              {...revealProps}
            >
              <div className="flex max-h-[min(58vh,34rem)] flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
                  {hasGoals ? (
                    <DndContext
                      sensors={dragSensors}
                      collisionDetection={closestCenter}
                      onDragStart={(event) => {
                        console.log("🎯 Drag started:", event.active.id);
                      }}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext items={localGoals.map((g) => g.id)}>
                        <div className="flex flex-col gap-1">
                          {localGoals.map((goal, index) => (
                            <div key={goal.id}>
                              <DraggableGoalCard
                                goal={goal}
                                index={index}
                                isOpen={openGoalId === goal.id}
                                onOpenChange={(isOpen) => {
                                  if (isOpen) {
                                    setOpenGoalId(goal.id);
                                  } else if (openGoalId === goal.id) {
                                    setOpenGoalId(null);
                                  }
                                }}
                                onGoalEdit={onGoalEdit}
                                onGoalToggleActive={onGoalToggleActive}
                                onGoalDelete={onGoalDelete}
                                onGoalManualComplete={onGoalManualComplete}
                                onProjectEditOpen={onProjectEditOpen}
                                onProjectUpdated={handleProjectUpdated}
                                suppressReadyToast={suppressReadyToast}
                              />
                            </div>
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  ) : (
                    <div className="rounded-[18px] border border-dashed border-white/20 bg-white/[0.02] px-2.5 py-4 text-center text-sm text-white/60 sm:rounded-2xl sm:px-4 sm:py-6">
                      No goals yet
                    </div>
                  )}

                  {onAddGoal ? (
                    <AddGoalButton campaignId={roadmap.id} onAddGoal={onAddGoal} />
                  ) : null}
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

type CampaignDrawerProps = {
  roadmap: Roadmap;
  goals: Goal[];
  onClose: () => void;
  onGoalEdit?: (goal: Goal) => void;
  onGoalToggleActive?: (goal: Goal) => void;
  onGoalDelete?: (goal: Goal) => void;
  onGoalManualComplete?: (
    goal: Goal,
    sourceRect?: DOMRect | null
  ) => CompletionMutationResult | Promise<CompletionMutationResult>;
  onGoalManualUndo?: (goal: Goal) => CompletionMutationResult | Promise<CompletionMutationResult>;
  onProjectUpdated?: (
    goalId: string,
    projectId: string,
    updates: Partial<Project>
  ) => void;
  onTaskToggleCompletion?: (
    goalId: string,
    projectId: string,
    taskId: string,
    currentCompletedAt: string | null,
    sourceRect?: DOMRect | null
  ) => CompletionMutationResult | Promise<CompletionMutationResult>;
  onProjectEditOpen?: (
    target: FabEditTarget,
    projectId: string,
    goalId: string,
    origin: ProjectCardMorphOrigin | null
  ) => void;
  monumentContext?: boolean;
  suppressReadyToast?: boolean;
  onGoalsReordered?: (goals: Goal[]) => void | Promise<void>;
  onAddGoal?: (campaignId: string) => void;
  onCampaignDetailsSaved?: (
    campaignId: string,
    details: CampaignDetails
  ) => void | Promise<void>;
  restoreOpen?: boolean;
  restoreOpenGoalId?: string | null;
  newGoalRevealId?: string | null;
  newProjectReveal?: NewProjectRevealMarker | null;
  onNewGoalRevealComplete?: (goalId: string) => void;
  onNewProjectRevealComplete?: (goalId: string, projectId: string) => void;
};

// Campaign Drawer: opened compact campaign goals menu used by Monument Detail Goal Grid campaign cards.
function CampaignDrawer({
  roadmap,
  goals,
  onClose,
  onGoalEdit,
  onGoalToggleActive,
  onGoalDelete,
  onGoalManualComplete,
  onGoalManualUndo,
  onProjectUpdated,
  onTaskToggleCompletion,
  onProjectEditOpen,
  monumentContext,
  suppressReadyToast = false,
  onGoalsReordered,
  onAddGoal,
  onCampaignDetailsSaved,
  restoreOpen = false,
  restoreOpenGoalId = null,
  newGoalRevealId = null,
  newProjectReveal = null,
  onNewGoalRevealComplete,
  onNewProjectRevealComplete,
}: CampaignDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const [localGoals, setLocalGoals] = useState(goals);
  const [openGoalId, setOpenGoalId] = useState<string | null>(null);
  const [showCompletedGoals, setShowCompletedGoals] = useState(false);
  const [pendingCompletedGoalExitIds, setPendingCompletedGoalExitIds] =
    useState<Set<string>>(new Set());
  const [campaignDrawerRowStateById, setCampaignDrawerRowStateById] =
    useState<CampaignDrawerRowLifecycleById>({});
  const pendingCompletedGoalExitTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [isEditingCampaign, setIsEditingCampaign] = useState(false);
  const [displayCampaignName, setDisplayCampaignName] = useState(roadmap.title);
  const [displayCampaignEmoji, setDisplayCampaignEmoji] = useState(
    roadmap.emoji ?? null
  );
  const [draftCampaignName, setDraftCampaignName] = useState(roadmap.title);
  const [draftCampaignEmoji, setDraftCampaignEmoji] = useState(
    roadmap.emoji ?? ""
  );
  const [isSavingCampaignDetails, setIsSavingCampaignDetails] = useState(false);
  const [campaignEditError, setCampaignEditError] = useState<string | null>(
    null
  );
  const handleClose = useCallback(() => {
    queueFabViewportTeardown();
    onClose();
  }, [onClose]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 10,
      },
    })
  );

  const saveCampaignGoalPositions = useCallback(
    async (goalsToSave: Goal[]) => {
      try {
        await saveCampaignGoalOrder(
          roadmap.id,
          goalsToSave.map((goal) => goal.id)
        );
      } catch (error) {
        console.error("Failed to save campaign goal order:", error);
        throw error;
      }
    },
    [roadmap.id]
  );

  useEffect(() => {
    setLocalGoals((currentGoals) =>
      goals.map((goal) => {
        const goalState = campaignDrawerRowStateById[campaignDrawerGoalRowKey(goal.id)];
        const localGoal = currentGoals.find((currentGoal) => currentGoal.id === goal.id);
        const goalOverrideCompleted =
          campaignDrawerRowOverrideCompleted(goalState);
        const nextGoal =
          goalOverrideCompleted === true
            ? {
                ...goal,
                status: "COMPLETED" as const,
                active: false,
                progress: 100,
              }
            : goalOverrideCompleted === false
              ? {
                  ...goal,
                  status: "ACTIVE" as const,
                  active: true,
                  progress: localGoal?.progress ?? goal.progress,
                }
              : goal;

        return {
          ...nextGoal,
          projects: nextGoal.projects.map((project) => {
            const projectState =
              campaignDrawerRowStateById[campaignDrawerProjectRowKey(project.id)];
            const localProject = localGoal?.projects.find(
              (candidate) => candidate.id === project.id
            );
            const projectOverrideCompleted =
              campaignDrawerRowOverrideCompleted(projectState);
            const completedAt =
              projectState?.completedAt ??
              getProjectCompletedTimestamp(localProject ?? project);
            const nextProject =
              projectOverrideCompleted === true
                ? {
                    ...project,
                    status: "Done" as const,
                    stage: "RELEASE",
                    progress: 100,
                    completedAt: completedAt ?? new Date().toISOString(),
                    completed_at: completedAt ?? new Date().toISOString(),
                  }
                : projectOverrideCompleted === false
                  ? {
                      ...project,
                      status: localProject?.status === "Done" ? "In-Progress" : project.status,
                      stage:
                        project.stage === "RELEASE" ? "BUILD" : project.stage,
                      completedAt: null,
                      completed_at: null,
                      progress: getCampaignDrawerIncompleteProjectProgress(
                        localProject ?? project
                      ),
                    }
                  : project;

            return {
              ...nextProject,
              tasks: nextProject.tasks.map((task) => {
                const taskState =
                  campaignDrawerRowStateById[campaignDrawerTaskRowKey(task.id)];
                if (!taskState) return task;
                const taskOverrideCompleted =
                  campaignDrawerRowOverrideCompleted(taskState);
                return {
                  ...task,
                  completedAt:
                    taskOverrideCompleted === false
                      ? null
                      : taskState.completedAt ?? task.completedAt ?? new Date().toISOString(),
                  stage:
                    taskOverrideCompleted === false
                      ? getCampaignDrawerTaskActiveStage(task)
                      : task.stage,
                };
              }),
            };
          }),
        };
      })
    );
  }, [campaignDrawerRowStateById, goals]);

  useEffect(() => {
    setCampaignDrawerRowStateById((current) => {
      let changed = false;
      const next = { ...current };

      for (const goal of goals) {
        const goalRowKey = campaignDrawerGoalRowKey(goal.id);
        if (
          next[goalRowKey]?.status === "active" &&
          !isCampaignDrawerGoalCompleted(goal)
        ) {
          delete next[goalRowKey];
          changed = true;
        }

        for (const project of goal.projects) {
          const projectRowKey = campaignDrawerProjectRowKey(project.id);
          if (
            next[projectRowKey]?.status === "active" &&
            !isCampaignDrawerProjectCompleted(project)
          ) {
            delete next[projectRowKey];
            changed = true;
          }

          for (const task of project.tasks) {
            const taskRowKey = campaignDrawerTaskRowKey(task.id);
            if (
              next[taskRowKey]?.status === "active" &&
              !isCampaignDrawerTaskCompleted(task)
            ) {
              delete next[taskRowKey];
              changed = true;
            }
          }
        }
      }

      return changed ? next : current;
    });
  }, [goals]);

  useEffect(
    () => () => {
      pendingCompletedGoalExitTimersRef.current.forEach((timer) => {
        clearTimeout(timer);
      });
      pendingCompletedGoalExitTimersRef.current.clear();
    },
    []
  );

  useLayoutEffect(() => {
    if (
      !restoreOpen ||
      !restoreOpenGoalId ||
      !localGoals.some((goal) => goal.id === restoreOpenGoalId)
    ) {
      return;
    }
    setOpenGoalId(restoreOpenGoalId);
  }, [localGoals, restoreOpen, restoreOpenGoalId]);

  const getGoalBucket = useCallback(
    (goal: Goal) => {
      const rowKey = campaignDrawerGoalRowKey(goal.id);
      return getCampaignDrawerGoalBucket(
        goal,
        campaignDrawerRowStateById[rowKey],
        pendingCompletedGoalExitIds.has(rowKey)
      );
    },
    [campaignDrawerRowStateById, pendingCompletedGoalExitIds]
  );

  const activeGoals = localGoals.filter(
    (goal) => getGoalBucket(goal) !== "completed-hidden"
  );
  const completedGoals = localGoals.filter(
    (goal) => getGoalBucket(goal) === "completed-hidden"
  );
  const visibleDrawerGoals = showCompletedGoals
    ? [...activeGoals, ...completedGoals]
    : activeGoals;

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (
      typeof window === "undefined" ||
      window.localStorage.getItem(CREATOR_MATRIX_XP_DEBUG_STORAGE_KEY) !== "1"
    ) {
      return;
    }

    const diagnostics = localGoals.flatMap((goal) => {
      const goalRowKey = campaignDrawerGoalRowKey(goal.id);
      const goalOverride = campaignDrawerRowStateById[goalRowKey];
      const goalCanonicalCompleted = isCampaignDrawerGoalCompleted(goal);
      const goalEffectiveCompleted =
        campaignDrawerRowOverrideCompleted(goalOverride) ??
        goalCanonicalCompleted;
      const goalBucket = getCampaignDrawerGoalBucket(
        goal,
        goalOverride,
        pendingCompletedGoalExitIds.has(goalRowKey)
      );
      const rows: Array<Record<string, unknown>> = [
        {
          rowKey: goalRowKey,
          canonicalCompleted: goalCanonicalCompleted,
          override: goalOverride?.status ?? null,
          effectiveCompleted: goalEffectiveCompleted,
          bucket: goalBucket,
          lastAction: goalOverride?.lastAction ?? null,
          lastPersistenceResult: goalOverride?.lastPersistenceResult ?? null,
          lastXpResult: goalOverride?.lastXpResult ?? null,
        },
      ];

      for (const project of goal.projects) {
        const projectRowKey = campaignDrawerProjectRowKey(project.id);
        const projectOverride = campaignDrawerRowStateById[projectRowKey];
        const projectCanonicalCompleted =
          isCampaignDrawerProjectCompleted(project);
        const projectEffectiveCompleted =
          campaignDrawerRowOverrideCompleted(projectOverride) ??
          projectCanonicalCompleted;
        rows.push({
          rowKey: projectRowKey,
          canonicalCompleted: projectCanonicalCompleted,
          override: projectOverride?.status ?? null,
          effectiveCompleted: projectEffectiveCompleted,
          bucket: projectEffectiveCompleted
            ? "project-effective-completed"
            : "active",
          lastAction: projectOverride?.lastAction ?? null,
          lastPersistenceResult:
            projectOverride?.lastPersistenceResult ?? null,
          lastXpResult: projectOverride?.lastXpResult ?? null,
        });

        for (const task of project.tasks) {
          const taskRowKey = campaignDrawerTaskRowKey(task.id);
          const taskOverride = campaignDrawerRowStateById[taskRowKey];
          const taskCanonicalCompleted = isCampaignDrawerTaskCompleted(task);
          const taskEffectiveCompleted =
            campaignDrawerRowOverrideCompleted(taskOverride) ??
            taskCanonicalCompleted;
          rows.push({
            rowKey: taskRowKey,
            canonicalCompleted: taskCanonicalCompleted,
            override: taskOverride?.status ?? null,
            effectiveCompleted: taskEffectiveCompleted,
            bucket: taskEffectiveCompleted ? "task-effective-completed" : "active",
            lastAction: taskOverride?.lastAction ?? null,
            lastPersistenceResult: taskOverride?.lastPersistenceResult ?? null,
            lastXpResult: taskOverride?.lastXpResult ?? null,
          });
        }
      }

      return rows;
    });

    console.debug("Campaign drawer row diagnostics", diagnostics);
  }, [campaignDrawerRowStateById, localGoals, pendingCompletedGoalExitIds]);

  useEffect(() => {
    if (completedGoals.length === 0) {
      setShowCompletedGoals(false);
    }
  }, [completedGoals.length]);

  useEffect(() => {
    setDisplayCampaignName(roadmap.title);
    setDisplayCampaignEmoji(roadmap.emoji ?? null);
  }, [roadmap.emoji, roadmap.title]);

  useEffect(() => {
    if (!isEditingCampaign) {
      setDraftCampaignName(displayCampaignName);
      setDraftCampaignEmoji(displayCampaignEmoji ?? "");
    }
  }, [displayCampaignEmoji, displayCampaignName, isEditingCampaign]);

  useEffect(() => {
    if (!openGoalId) return;
    if (!localGoals.some((goal) => goal.id === openGoalId)) {
      setOpenGoalId(null);
    }
  }, [localGoals, openGoalId]);

  useEffect(() => {
    if (!openGoalId || showCompletedGoals) return;
    const openGoal = localGoals.find((goal) => goal.id === openGoalId);
    if (
      openGoal &&
      getGoalBucket(openGoal) === "completed-hidden"
    ) {
      setOpenGoalId(null);
    }
  }, [
    getGoalBucket,
    localGoals,
    openGoalId,
    showCompletedGoals,
  ]);

  const holdCompletedGoalBeforeExit = useCallback(
    (goalId: string) => {
      const rowKey = campaignDrawerGoalRowKey(goalId);
      setPendingCompletedGoalExitIds((current) => {
        if (current.has(rowKey)) return current;
        const next = new Set(current);
        next.add(rowKey);
        return next;
      });
      setCampaignDrawerRowStateById((current) => ({
        ...current,
        [rowKey]: {
          status: "rewarding",
          completedAt: current[rowKey]?.completedAt ?? new Date().toISOString(),
          lastAction: "complete",
          lastPersistenceResult: "success",
          lastXpResult: current[rowKey]?.lastXpResult ?? "none",
        },
      }));

      const existingTimer =
        pendingCompletedGoalExitTimersRef.current.get(rowKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const delay = prefersReducedMotion
        ? REDUCED_MOTION_COMPLETED_DRAWER_GOAL_EXIT_DELAY_MS
        : COMPLETED_DRAWER_GOAL_EXIT_DELAY_MS;

      const timer = setTimeout(() => {
        reportCampaignDrawerXpTiming("goal exit timer end", {
          goalId,
          exitEndAt: performance.now(),
        });
        pendingCompletedGoalExitTimersRef.current.delete(rowKey);
        setPendingCompletedGoalExitIds((current) => {
          if (!current.has(rowKey)) return current;
          const next = new Set(current);
          next.delete(rowKey);
          return next;
        });
        setCampaignDrawerRowStateById((current) => ({
          ...current,
          [rowKey]: {
            ...current[rowKey],
            status: "completed-hidden",
            lastAction: "complete",
            lastPersistenceResult: "success",
            lastXpResult: current[rowKey]?.lastXpResult ?? "none",
          },
        }));
        setOpenGoalId((current) => (current === goalId ? null : current));
      }, delay);
      reportCampaignDrawerXpTiming("goal exit timer start", {
        goalId,
        exitStartAt: performance.now(),
      });
      pendingCompletedGoalExitTimersRef.current.set(rowKey, timer);
    },
    [prefersReducedMotion]
  );

  const releasePendingCompletedGoal = useCallback((goalId: string) => {
    const rowKey = campaignDrawerGoalRowKey(goalId);
    const timer = pendingCompletedGoalExitTimersRef.current.get(rowKey);
    if (timer) {
      clearTimeout(timer);
      pendingCompletedGoalExitTimersRef.current.delete(rowKey);
    }
    setPendingCompletedGoalExitIds((current) => {
      if (!current.has(rowKey)) return current;
      const next = new Set(current);
      next.delete(rowKey);
      return next;
    });
    setCampaignDrawerRowStateById((current) => ({
      ...current,
      [rowKey]: {
        status: "active",
        completedAt: null,
        lastAction: "undo",
        lastPersistenceResult: "success",
        lastXpResult: "success",
      },
    }));
  }, []);

  const handleGoalManualComplete = useCallback(
    async (goal: Goal, sourceRect?: DOMRect | null) => {
      const rowKey = campaignDrawerGoalRowKey(goal.id);
      const completedAt = new Date().toISOString();
      setCampaignDrawerRowStateById((current) => ({
        ...current,
        [rowKey]: {
          status: "completing",
          completedAt,
          lastAction: "complete",
          lastXpResult: "none",
        },
      }));
      setLocalGoals((currentGoals) =>
        currentGoals.map((currentGoal) =>
          currentGoal.id === goal.id
            ? {
                ...currentGoal,
                status: "COMPLETED",
                active: false,
                progress: 100,
              }
            : currentGoal
        )
      );
      const result = await onGoalManualComplete?.(goal, sourceRect);
      if (result === false) {
        setCampaignDrawerRowStateById((current) => ({
          ...current,
          [rowKey]: {
            status: "active",
            completedAt: null,
            lastAction: "complete",
            lastPersistenceResult: "failed",
            lastXpResult: "failed",
          },
        }));
        setLocalGoals((currentGoals) =>
          currentGoals.map((currentGoal) =>
            currentGoal.id === goal.id
              ? {
                  ...currentGoal,
                  status: "ACTIVE",
                  active: true,
                  progress: goal.progress,
                }
              : currentGoal
          )
        );
        return false;
      }
      setCampaignDrawerRowStateById((current) => ({
        ...current,
        [rowKey]: {
          status: "rewarding",
          completedAt,
          lastAction: "complete",
          lastPersistenceResult: "success",
          lastXpResult: "success",
        },
      }));
      setLocalGoals((currentGoals) =>
        currentGoals.map((currentGoal) =>
          currentGoal.id === goal.id
            ? {
                ...currentGoal,
                status: "COMPLETED",
                active: false,
                progress: 100,
              }
            : currentGoal
        )
      );
      holdCompletedGoalBeforeExit(goal.id);
      return true;
    },
    [holdCompletedGoalBeforeExit, onGoalManualComplete]
  );

  const handleGoalManualUndo = useCallback(
    async (goal: Goal) => {
      const rowKey = campaignDrawerGoalRowKey(goal.id);
      releasePendingCompletedGoal(goal.id);
      const previousGoal = localGoals.find((currentGoal) => currentGoal.id === goal.id) ?? goal;
      setCampaignDrawerRowStateById((current) => ({
        ...current,
        [rowKey]: {
          status: "undoing",
          completedAt: null,
          lastAction: "undo",
        },
      }));
      setLocalGoals((currentGoals) =>
        currentGoals.map((currentGoal) =>
          currentGoal.id === goal.id
            ? {
                ...currentGoal,
                status: "ACTIVE",
                active: true,
                progress:
                  currentGoal.projects.length > 0
                    ? Math.round(
                        (currentGoal.projects.filter((project) =>
                          Boolean(getProjectCompletedTimestamp(project)) ||
                          project.status === "Done" ||
                          project.stage === "RELEASE"
                        ).length /
                          currentGoal.projects.length) *
                          100
                      )
                    : 0,
              }
            : currentGoal
        )
      );
      const result = await onGoalManualUndo?.(goal);
      if (result === false) {
        setCampaignDrawerRowStateById((current) => ({
          ...current,
          [rowKey]: {
            status: "exiting",
            completedAt: current[rowKey]?.completedAt ?? new Date().toISOString(),
            lastAction: "undo",
            lastPersistenceResult: "failed",
            lastXpResult: "failed",
          },
        }));
        setLocalGoals((currentGoals) =>
          currentGoals.map((currentGoal) =>
            currentGoal.id === goal.id ? previousGoal : currentGoal
          )
        );
        if (isCampaignDrawerGoalCompleted(previousGoal)) {
          holdCompletedGoalBeforeExit(goal.id);
        }
        return false;
      }
      setCampaignDrawerRowStateById((current) => ({
        ...current,
        [rowKey]: {
          status: "active",
          completedAt: null,
          lastAction: "undo",
          lastPersistenceResult: "success",
          lastXpResult: "success",
        },
      }));
      setOpenGoalId(goal.id);
      return true;
    },
    [
      holdCompletedGoalBeforeExit,
      localGoals,
      onGoalManualUndo,
      releasePendingCompletedGoal,
    ]
  );

  const handleProjectUpdated = useCallback(
    (goalId: string, projectId: string, updates: Partial<Project>) => {
      const rowKey = campaignDrawerProjectRowKey(projectId);
      const completedAt = getProjectCompletedTimestamp(updates as Project);
      const isProjectNowCompleted =
        isCampaignDrawerProjectCompletionUpdate(updates);
      const isProjectCompletionRelatedUpdate =
        "completedAt" in updates ||
        "completed_at" in updates ||
        "stage" in updates ||
        "status" in updates ||
        "progress" in updates;
      const existingProject = localGoals
        .find((goal) => goal.id === goalId)
        ?.projects.find((project) => project.id === projectId);
      const projectUpdates =
        isProjectNowCompleted
          ? updates
          : !isProjectCompletionRelatedUpdate
            ? updates
          : ({
              ...updates,
              status:
                updates.status === "Done"
                  ? "In-Progress"
                  : updates.status ?? existingProject?.status ?? "In-Progress",
              stage:
                updates.stage === "RELEASE"
                  ? "BUILD"
                  : updates.stage ?? existingProject?.stage ?? "BUILD",
              completedAt: null,
              completed_at: null,
              progress: getCampaignDrawerIncompleteProjectProgress(
                {
                  ...(existingProject ?? {
                    id: projectId,
                    name: updates.name ?? "Project",
                    status: updates.status ?? "In-Progress",
                    progress: updates.progress ?? 0,
                    energy: updates.energy ?? "No",
                    tasks: updates.tasks ?? [],
                    stage: updates.stage ?? "BUILD",
                  }),
                  ...updates,
                } as Project
              ),
            } as Partial<Project>);
      setCampaignDrawerRowStateById((current) => ({
        ...current,
        [rowKey]: {
          status: isProjectNowCompleted ? "rewarding" : "active",
          completedAt: isProjectNowCompleted
            ? completedAt ?? new Date().toISOString()
            : null,
          lastAction: isProjectNowCompleted ? "complete" : "undo",
          lastPersistenceResult: "success",
          lastXpResult: "none",
        },
      }));
      setLocalGoals((currentGoals) =>
        currentGoals.map((currentGoal) =>
          currentGoal.id === goalId
            ? {
                ...currentGoal,
                projects: currentGoal.projects.map((project) =>
                  project.id === projectId
                    ? { ...project, ...projectUpdates }
                    : project
                ),
              }
            : currentGoal
        )
      );
      onProjectUpdated?.(goalId, projectId, projectUpdates);
    },
    [localGoals, onProjectUpdated]
  );

  const handleTaskToggleCompletion = useCallback(
    async (
      goalId: string,
      projectId: string,
      taskId: string,
      currentCompletedAt: string | null,
      sourceRect?: DOMRect | null
    ) => {
      const rowKey = campaignDrawerTaskRowKey(taskId);
      const latestCompletedAt = getCampaignDrawerTaskCompletedAt(
        localGoals,
        goalId,
        projectId,
        taskId
      );
      const completionBase = latestCompletedAt ?? currentCompletedAt;
      const nextCompletedAt = completionBase ? null : new Date().toISOString();

      setCampaignDrawerRowStateById((current) => ({
        ...current,
        [rowKey]: {
          status: nextCompletedAt ? "completing" : "undoing",
          completedAt: nextCompletedAt,
          lastAction: nextCompletedAt ? "complete" : "undo",
          lastXpResult: "none",
        },
      }));

      const result = await onTaskToggleCompletion?.(
        goalId,
        projectId,
        taskId,
        completionBase,
        sourceRect
      );

      if (result === false) {
        setCampaignDrawerRowStateById((current) => ({
          ...current,
          [rowKey]: {
            status: completionBase ? "rewarding" : "active",
            completedAt: completionBase,
            lastAction: nextCompletedAt ? "complete" : "undo",
            lastPersistenceResult: "failed",
            lastXpResult: "failed",
          },
        }));
        return false;
      }

      setLocalGoals((currentGoals) =>
        applyCampaignDrawerTaskCompletion(
          currentGoals,
          goalId,
          projectId,
          taskId,
          nextCompletedAt
        )
      );
      setCampaignDrawerRowStateById((current) => ({
        ...current,
        [rowKey]: {
          status: nextCompletedAt ? "rewarding" : "active",
          completedAt: nextCompletedAt,
          lastAction: nextCompletedAt ? "complete" : "undo",
          lastPersistenceResult: "success",
          lastXpResult: "success",
        },
      }));
      return true;
    },
    [localGoals, onTaskToggleCompletion]
  );

  const handleDrawerDragEnd = useCallback(
    async (event: DragEndEvent) => {
      console.log("🎯 Drag ended:", event);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const draggedGoal = localGoals.find((goal) => goal.id === active.id);
      const overGoal = localGoals.find((goal) => goal.id === over.id);
      if (!draggedGoal || !overGoal) return;

      const draggingCompleted =
        getGoalBucket(draggedGoal) === "completed-hidden";
      const overCompleted = getGoalBucket(overGoal) === "completed-hidden";
      if (draggingCompleted !== overCompleted) return;

      const goalsToReorder = draggingCompleted ? completedGoals : activeGoals;
      const oldIndex = goalsToReorder.findIndex((g) => g.id === active.id);
      const newIndex = goalsToReorder.findIndex((g) => g.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;

      console.log(`Moving from index ${oldIndex} to ${newIndex}`);
      const reorderedGroup = arrayMove(goalsToReorder, oldIndex, newIndex);
      const reordered = draggingCompleted
        ? [...activeGoals, ...reorderedGroup]
        : [...reorderedGroup, ...completedGoals];
      const updatedGoals = reordered.map((goal, index) => ({
        ...goal,
        priorityRank: index + 1,
      }));

      setLocalGoals(updatedGoals);
      try {
        await saveCampaignGoalPositions(updatedGoals);
      } catch {
        setLocalGoals(localGoals);
        return;
      }
      await onGoalsReordered?.(updatedGoals);
    },
    [
      activeGoals,
      completedGoals,
      getGoalBucket,
      localGoals,
      onGoalsReordered,
      saveCampaignGoalPositions,
    ]
  );

  const openCampaignEditForm = useCallback(() => {
    setDraftCampaignName(displayCampaignName);
    setDraftCampaignEmoji(displayCampaignEmoji ?? "");
    setCampaignEditError(null);
    setIsActionsMenuOpen(false);
    setIsEditingCampaign(true);
  }, [displayCampaignEmoji, displayCampaignName]);

  const closeCampaignEditForm = useCallback(() => {
    if (isSavingCampaignDetails) return;
    setDraftCampaignName(displayCampaignName);
    setDraftCampaignEmoji(displayCampaignEmoji ?? "");
    setIsEditingCampaign(false);
    setCampaignEditError(null);
  }, [displayCampaignEmoji, displayCampaignName, isSavingCampaignDetails]);

  const handleSaveCampaignDetails = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const nextName = draftCampaignName.trim();
      if (!nextName) {
        setCampaignEditError("Campaign name is required.");
        return;
      }

      const supabase = getSupabaseBrowser();
      if (!supabase) {
        setCampaignEditError("Unable to update campaign.");
        return;
      }

      setIsSavingCampaignDetails(true);
      setCampaignEditError(null);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setCampaignEditError("Sign in required to edit this campaign.");
          return;
        }

        const details = await updateCampaignDetails(user.id, roadmap.id, {
          name: draftCampaignName,
          emoji: draftCampaignEmoji,
        });

        setDisplayCampaignName(details.name);
        setDisplayCampaignEmoji(details.emoji);
        setDraftCampaignName(details.name);
        setDraftCampaignEmoji(details.emoji ?? "");
        await onCampaignDetailsSaved?.(roadmap.id, details);
        setIsEditingCampaign(false);
      } catch (error) {
        setCampaignEditError(
          getErrorMessage(error, "Unable to update campaign.")
        );
      } finally {
        setIsSavingCampaignDetails(false);
      }
    },
    [
      draftCampaignEmoji,
      draftCampaignName,
      onCampaignDetailsSaved,
      roadmap.id,
    ]
  );

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
      queueFabViewportTeardown();
    };
  }, []);

  if (typeof document === "undefined" || !mounted) return null;

  const regionId = `roadmap-${roadmap.id}`;
  const headingId = `${regionId}-overlay-title`;
  const isMobile =
    typeof window !== "undefined" ? window.innerWidth < 640 : true;
  const computedMaxWidth =
    typeof window !== "undefined"
      ? Math.min(window.innerWidth - (isMobile ? 32 : 48), isMobile ? 384 : 576)
      : isMobile
        ? 384
        : 576;

  const emojiBadge = displayCampaignEmoji ?? displayCampaignName.slice(0, 2);
  const goalsLabel = `${goals.length} ${goals.length === 1 ? "goal" : "goals"}`;

  const headerContent = (
    <div className="flex items-start justify-between gap-2 sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-2 sm:gap-3">
        {isEditingCampaign ? (
          <input
            aria-label="Campaign emoji"
            value={draftCampaignEmoji}
            onChange={(event) => setDraftCampaignEmoji(event.target.value)}
            maxLength={2}
            placeholder="◆"
            disabled={isSavingCampaignDetails}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent bg-transparent p-0 text-center text-base font-semibold text-white outline-none transition placeholder:text-white/28 focus:border-white/14 focus:bg-white/[0.03] focus:ring-1 focus:ring-white/10 disabled:opacity-55 sm:h-9 sm:w-9 sm:text-lg"
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base font-semibold text-white sm:h-9 sm:w-9 sm:text-lg">
            {emojiBadge}
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:gap-1">
          {isEditingCampaign ? (
            <input
              id={headingId}
              aria-label="Campaign name"
              value={draftCampaignName}
              onChange={(event) => setDraftCampaignName(event.target.value)}
              placeholder="Campaign name"
              disabled={isSavingCampaignDetails}
              className="h-5 min-w-0 rounded-md border border-white/12 bg-white/[0.05] px-1.5 text-[15px] font-semibold leading-tight text-white outline-none transition placeholder:text-white/30 focus:border-white/28 focus:bg-white/[0.08] focus:ring-2 focus:ring-white/10 disabled:opacity-55 sm:h-6 sm:text-base"
            />
          ) : (
            <h4
              id={headingId}
              className="text-[15px] font-semibold leading-tight text-white sm:text-base"
            >
              {displayCampaignName}
            </h4>
          )}
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/60 sm:text-[11px] sm:tracking-[0.32em]">
            {goalsLabel}
          </p>
          {isEditingCampaign && campaignEditError ? (
            <p className="text-[11px] leading-4 text-red-100/82">
              {campaignEditError}
            </p>
          ) : null}
        </div>
      </div>
      {isEditingCampaign ? (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Cancel campaign edit"
            onClick={closeCampaignEditForm}
            disabled={isSavingCampaignDetails}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-white/58 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
          <button
            type="submit"
            aria-label="Save campaign edit"
            disabled={
              isSavingCampaignDetails || draftCampaignName.trim().length === 0
            }
            className="flex h-7 w-7 items-center justify-center rounded-md border border-white/14 bg-white/[0.1] text-white transition hover:border-white/24 hover:bg-white/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isSavingCampaignDetails ? (
              <span className="text-[10px] font-semibold leading-none">...</span>
            ) : (
              <Check aria-hidden="true" className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      ) : (
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="Campaign actions"
            aria-haspopup="menu"
            aria-expanded={isActionsMenuOpen}
            onClick={() => {
              setIsActionsMenuOpen((current) => !current);
              setCampaignEditError(null);
            }}
            className="rounded-md p-1.5 text-white/58 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
          >
            <MoreVertical aria-hidden="true" className="h-4 w-4" />
          </button>
          {isActionsMenuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-8 z-20 min-w-36 rounded-xl border border-white/10 bg-[#090A0C] p-1.5 shadow-[0_18px_44px_rgba(0,0,0,0.5)]"
            >
              <button
                type="button"
                role="menuitem"
                onClick={openCampaignEditForm}
                className="w-full rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-white/82 transition hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
              >
                Edit
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );

  const header = (
    <div className="px-5 py-4">
      {isEditingCampaign ? (
        <form
          className="min-w-0"
          onSubmit={handleSaveCampaignDetails}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {headerContent}
        </form>
      ) : (
        headerContent
      )}
    </div>
  );

  const completedGoalsToggleLabel = `${
    showCompletedGoals ? "Hide completed Goals" : "Show completed Goals"
  } (${completedGoals.length})`;

  const renderDrawerGoalCard = (goal: Goal, index: number) => (
    <DraggableGoalCard
      key={campaignDrawerGoalRowKey(goal.id)}
      goal={goal}
      index={index}
      isOpen={openGoalId === goal.id}
      onOpenChange={(isOpen) => {
        if (isOpen) {
          setOpenGoalId(goal.id);
        } else if (openGoalId === goal.id) {
          setOpenGoalId(null);
        }
      }}
      onGoalEdit={
        onGoalEdit
          ? (goal) => {
              onGoalEdit(goal);
              handleClose();
            }
          : undefined
      }
      onGoalToggleActive={onGoalToggleActive}
      onGoalDelete={onGoalDelete}
      onGoalManualComplete={handleGoalManualComplete}
      onGoalManualUndo={handleGoalManualUndo}
      onProjectEditOpen={onProjectEditOpen}
      onProjectUpdated={handleProjectUpdated}
      onTaskToggleCompletion={handleTaskToggleCompletion}
      campaignDrawerRowOverrides={campaignDrawerRowStateById}
      monumentContext={monumentContext}
      hideEnergyPill
      campaignDrawerRow
      sourceCampaignId={roadmap.id}
      suppressReadyToast={suppressReadyToast}
      newGoalRevealId={newGoalRevealId}
      newProjectRevealId={
        newProjectReveal?.goalId === goal.id
          ? newProjectReveal.projectId
          : null
      }
      onNewGoalRevealComplete={onNewGoalRevealComplete}
      onNewProjectRevealComplete={onNewProjectRevealComplete}
    />
  );

  const listArea = (
    <div className="flex min-h-0 flex-1 flex-col px-3 pb-4 sm:px-5">
      <div className="min-h-0 flex-1 overflow-y-auto pb-1 sm:pb-1.5">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(event) => {
            console.log("🎯 Drag started:", event.active.id);
          }}
          onDragEnd={handleDrawerDragEnd}
        >
          <SortableContext items={visibleDrawerGoals.map((g) => g.id)}>
            <LayoutGroup id={`campaign-drawer-goals-${roadmap.id}`}>
              <div className="flex flex-col gap-1 sm:gap-1.5">
                <AnimatePresence initial={false}>
                  {activeGoals.map((goal, index) =>
                    renderDrawerGoalCard(goal, index)
                  )}

                  {completedGoals.length > 0 ? (
                    <motion.button
                      key="campaign-drawer-completed-goals-toggle"
                      type="button"
                      aria-expanded={showCompletedGoals}
                      onClick={() =>
                        setShowCompletedGoals((current) => !current)
                      }
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs font-medium text-white/45 transition hover:bg-white/[0.03] hover:text-white/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
                      layout={
                        prefersReducedMotion ? undefined : "position"
                      }
                      transition={
                        prefersReducedMotion
                          ? { duration: 0.12 }
                          : { layout: campaignDrawerRowTransition }
                      }
                    >
                      <span>{completedGoalsToggleLabel}</span>
                    </motion.button>
                  ) : null}

                  {showCompletedGoals
                    ? completedGoals.map((goal, index) =>
                        renderDrawerGoalCard(goal, activeGoals.length + index)
                      )
                    : null}
                </AnimatePresence>
              </div>
            </LayoutGroup>
          </SortableContext>
        </DndContext>
      </div>
      <div className="mt-1.5 shrink-0 sm:mt-2">
        <AddGoalButton campaignId={roadmap.id} onAddGoal={onAddGoal} />
      </div>
    </div>
  );

  const basePanelClass =
    "overflow-hidden rounded-2xl border border-white/10 bg-[#07080A]/95 shadow-[0_25px_50px_-20px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.05)] text-white/90";
  return createPortal(
    <>
      <motion.button
        type="button"
        className={`fixed inset-0 z-[60] ${isMobile ? "bg-black/70" : "bg-black/50"}`}
        aria-label="Close goals overlay"
        onClick={handleClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.14 }}
      />
      <div
        className={`fixed inset-0 z-[70] flex items-center justify-center ${isMobile ? "px-4 py-10" : "px-6 py-12"}`}
        onClick={handleClose}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          onClick={(event) => event.stopPropagation()}
          className={`w-full ${isMobile ? "max-w-sm" : "max-w-xl"} ${basePanelClass}`}
          style={computedMaxWidth ? { maxWidth: computedMaxWidth } : undefined}
          initial={
            prefersReducedMotion
              ? { opacity: 0 }
              : { opacity: 0, y: 6, scale: 0.985 }
          }
          animate={
            prefersReducedMotion
              ? { opacity: 1 }
              : { opacity: 1, y: 0, scale: 1 }
          }
          exit={
            prefersReducedMotion
              ? { opacity: 0 }
              : { opacity: 0, y: 4, scale: 0.99 }
          }
          transition={{
            duration: prefersReducedMotion ? 0.12 : 0.18,
            ease: "easeOut",
          }}
        >
          <motion.div
            className="flex max-h-[calc(100vh-3rem)] flex-col sm:max-h-[calc(100vh-6rem)]"
            variants={prefersReducedMotion ? undefined : shellContentMotion}
            initial={prefersReducedMotion ? false : "hidden"}
            animate={prefersReducedMotion ? undefined : "visible"}
            exit={prefersReducedMotion ? undefined : "exit"}
          >
            {header}
            {listArea}
          </motion.div>
        </motion.div>
      </div>
    </>,
    document.body
  );
}

export const CampaignCard = memo(CampaignCardImpl, (prev, next) => {
  return (
    prev.roadmap.id === next.roadmap.id &&
    prev.roadmap.title === next.roadmap.title &&
    prev.goalCount === next.goalCount &&
    prev.variant === next.variant &&
    prev.goals === next.goals &&
    prev.monumentContext === next.monumentContext &&
    prev.suppressReadyToast === next.suppressReadyToast &&
    prev.restoreOpen === next.restoreOpen &&
    prev.restoreOpenGoalId === next.restoreOpenGoalId &&
    prev.newGoalRevealId === next.newGoalRevealId &&
    prev.newProjectReveal === next.newProjectReveal &&
    prev.onProjectUpdated === next.onProjectUpdated &&
    prev.onTaskToggleCompletion === next.onTaskToggleCompletion &&
    prev.onProjectEditOpen === next.onProjectEditOpen &&
    prev.onGoalManualComplete === next.onGoalManualComplete &&
    prev.onGoalManualUndo === next.onGoalManualUndo &&
    prev.onAddGoal === next.onAddGoal &&
    prev.onRoadmapOrderSaved === next.onRoadmapOrderSaved &&
    prev.onNewGoalRevealComplete === next.onNewGoalRevealComplete &&
    prev.onNewProjectRevealComplete === next.onNewProjectRevealComplete &&
    prev.onCampaignDetailsSaved === next.onCampaignDetailsSaved
  );
});

export default CampaignCard;
