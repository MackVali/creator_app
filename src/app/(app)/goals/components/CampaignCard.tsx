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
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
import { useToastHelpers } from "@/components/ui/toast";
import { teardownFabViewportState } from "@/components/ui/fabViewportCleanup";

import type { Goal, Project } from "../types";
import { GoalCard } from "./GoalCard";
import {
  ProjectRowTaskInteractionsProvider,
  type ProjectCardMorphOrigin,
} from "./ProjectRow";
import { ProjectsDropdown } from "./ProjectsDropdown";

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
  duration: 0.9,
  ease: [0.33, 0, 0.67, 1],
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

const completedGoalsRevealMotion = {
  hidden: {
    opacity: 0,
    height: 0,
    y: -8,
  },
  visible: {
    opacity: 1,
    height: "auto",
    y: 0,
    transition: {
      height: { duration: 0.52, ease: [0.16, 1, 0.3, 1] },
      opacity: { duration: 0.32, ease: "easeOut", delay: 0.08 },
      y: { duration: 0.52, ease: [0.16, 1, 0.3, 1] },
    },
  },
  exit: {
    opacity: 0,
    height: 0,
    y: -6,
    transition: {
      height: { duration: 0.42, ease: [0.33, 0, 0.2, 1] },
      opacity: { duration: 0.24, ease: "easeOut" },
      y: { duration: 0.42, ease: [0.33, 0, 0.2, 1] },
    },
  },
} as const;

const newCampaignGoalRevealTransition = {
  duration: 0.56,
  ease: [0.16, 1, 0.3, 1],
} as const;

const goalManualCompleteRejectClass =
  "goal-manual-complete-reject !border-red-400/80 shadow-[0_0_0_1px_rgba(248,113,113,0.65),0_12px_28px_-22px_rgba(248,113,113,0.65)]";
const campaignDrawerNoSelectClass =
  "select-none [-webkit-user-select:none] [-webkit-touch-callout:none]";

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
  monumentContext,
  hideEnergyPill,
  campaignDrawerRow = false,
  onGoalManualComplete,
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
  onGoalManualComplete?: (goal: Goal) => void | Promise<void>;
  onProjectUpdated?: (
    goalId: string,
    projectId: string,
    updates: Partial<Project>
  ) => void;
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
  const rowClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRowLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const closedRowLongPressTriggeredRef = useRef(false);
  const lastRowClickAtRef = useRef(0);
  const rejectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyToastShownGoalIdsRef = useRef<Set<string>>(new Set());
  const [manualCompleteRejected, setManualCompleteRejected] = useState(false);
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
    goal.projects.length > 0 &&
    goal.projects.every(
      (project) =>
        project.status === "Done" ||
        project.stage === "RELEASE" ||
        Number(project.progress ?? 0) >= 100
    );
  const normalizedStatus = normalizeGoalStatus(goal.status, goal.active);
  const isCompleted = normalizedStatus === "COMPLETED";
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
  const closeTimerRef = useRef<number | null>(null);

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

  const triggerManualCompleteRejection = useCallback(() => {
    setManualCompleteRejected(true);
    if (rejectTimerRef.current !== null) {
      window.clearTimeout(rejectTimerRef.current);
    }
    rejectTimerRef.current = window.setTimeout(() => {
      rejectTimerRef.current = null;
      setManualCompleteRejected(false);
    }, 460);
  }, []);

  const handleManualCompleteAttempt = useCallback(() => {
    if (isReadyToComplete) {
      void onGoalManualComplete?.(goal);
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
        window.clearTimeout(rowClickTimerRef.current);
        rowClickTimerRef.current = null;
      }
      handleManualCompleteAttempt();
      return;
    }

    if (rowClickTimerRef.current !== null) {
      window.clearTimeout(rowClickTimerRef.current);
    }
    rowClickTimerRef.current = window.setTimeout(() => {
      rowClickTimerRef.current = null;
      onOpenChange?.(nextOpen);
    }, 330);
  }, [handleManualCompleteAttempt, isOpen, onGoalManualComplete, onOpenChange]);

  const handleOpenedGoalChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        if (closeTimerRef.current !== null) {
          window.clearTimeout(closeTimerRef.current);
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
        window.clearTimeout(closeTimerRef.current);
      }

      closeTimerRef.current = window.setTimeout(() => {
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
    window.clearTimeout(closedRowLongPressTimerRef.current);
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
      closedRowLongPressTimerRef.current = window.setTimeout(() => {
        closedRowLongPressTimerRef.current = null;
        closedRowLongPressTriggeredRef.current = true;
        if (rowClickTimerRef.current !== null) {
          window.clearTimeout(rowClickTimerRef.current);
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
      ? "habit-card--completed habit-card--completed-gem border-emerald-300/24 shadow-[0_18px_34px_rgba(2,32,24,0.52),inset_0_1px_0_rgba(255,255,255,0.04)]"
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
          ? "habit-card--completed habit-card--completed-gem rounded-lg border border-emerald-300/24 shadow-[0_18px_34px_rgba(2,32,24,0.52)] sm:rounded-xl"
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
          "border border-white/12 bg-black/35 text-white/82"
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
        {displayEmoji}
      </div>

      <p
        className={`min-w-0 flex-1 truncate text-[12px] font-medium leading-tight sm:text-[13px] ${
          isCompleted ? "text-emerald-50" : "text-white/84"
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
          "border-white/10 bg-black/35 text-white/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        }`}
      >
        {index + 1}
      </span>
    </motion.button>
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition,
      }}
      className={`relative ${isDragging ? "scale-105 shadow-2xl z-50" : ""}`}
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
                  campaignDrawerRowVisual
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
                  newProjectRevealId={newProjectRevealId}
                  onNewProjectRevealComplete={(projectId) =>
                    onNewProjectRevealComplete?.(goal.id, projectId)
                  }
                  suppressDrawerOpenAnimation={
                    shouldSuppressProjectRevealParentMotion
                  }
                  monumentContext={monumentContext}
                  onManualComplete={onGoalManualComplete}
                  completeWhenProjectsDone
                  completionTheme="emerald"
                  suppressReadyToast={suppressReadyToast}
                />
              </motion.div>
            ) : (
              compactGoalRow
            )}
          </AnimatePresence>
        )}
      </motion.div>
    </div>
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
  onGoalManualComplete?: (goal: Goal) => void | Promise<void>;
  onProjectUpdated?: (
    goalId: string,
    projectId: string,
    updates: Partial<Project>
  ) => void;
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
  onProjectUpdated,
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
                onProjectUpdated={handleProjectUpdated}
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
  onGoalManualComplete?: (goal: Goal) => void | Promise<void>;
  onProjectUpdated?: (
    goalId: string,
    projectId: string,
    updates: Partial<Project>
  ) => void;
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
  onProjectUpdated,
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
    setLocalGoals(goals);
  }, [goals]);

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

  const activeGoals = localGoals.filter(
    (goal) => !isCampaignDrawerGoalCompleted(goal)
  );
  const completedGoals = localGoals.filter(isCampaignDrawerGoalCompleted);
  const visibleDrawerGoals = showCompletedGoals
    ? [...activeGoals, ...completedGoals]
    : activeGoals;

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
    if (openGoal && isCampaignDrawerGoalCompleted(openGoal)) {
      setOpenGoalId(null);
    }
  }, [localGoals, openGoalId, showCompletedGoals]);

  const handleGoalManualComplete = useCallback(
    async (goal: Goal) => {
      await onGoalManualComplete?.(goal);
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
      setOpenGoalId((current) => (current === goal.id ? null : current));
    },
    [onGoalManualComplete]
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

  const handleDrawerDragEnd = useCallback(
    async (event: DragEndEvent) => {
      console.log("🎯 Drag ended:", event);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const draggedGoal = localGoals.find((goal) => goal.id === active.id);
      const overGoal = localGoals.find((goal) => goal.id === over.id);
      if (!draggedGoal || !overGoal) return;

      const draggingCompleted = isCampaignDrawerGoalCompleted(draggedGoal);
      const overCompleted = isCampaignDrawerGoalCompleted(overGoal);
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
  const completedGoalsRegionId = `${regionId}-completed-goals`;
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
      key={goal.id}
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
      onProjectEditOpen={onProjectEditOpen}
      onProjectUpdated={handleProjectUpdated}
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
            <div className="flex flex-col gap-1 sm:gap-1.5">
              {activeGoals.map((goal, index) =>
                renderDrawerGoalCard(goal, index)
              )}

              {completedGoals.length > 0 ? (
                <button
                  type="button"
                  aria-expanded={showCompletedGoals}
                  aria-controls={completedGoalsRegionId}
                  onClick={() =>
                    setShowCompletedGoals((current) => !current)
                  }
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs font-medium text-white/45 transition hover:bg-white/[0.03] hover:text-white/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
                >
                  <span>{completedGoalsToggleLabel}</span>
                </button>
              ) : null}

              <AnimatePresence initial={false}>
                {showCompletedGoals ? (
                  <motion.div
                    id={completedGoalsRegionId}
                    className="flex flex-col gap-1 overflow-hidden sm:gap-1.5"
                    initial={prefersReducedMotion ? { opacity: 0 } : "hidden"}
                    animate={prefersReducedMotion ? { opacity: 1 } : "visible"}
                    exit={prefersReducedMotion ? { opacity: 0 } : "exit"}
                    variants={
                      prefersReducedMotion ? undefined : completedGoalsRevealMotion
                    }
                    transition={
                      prefersReducedMotion ? { duration: 0.12 } : undefined
                    }
                  >
                    {completedGoals.map((goal, index) =>
                      renderDrawerGoalCard(goal, activeGoals.length + index)
                    )}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
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
    prev.onProjectEditOpen === next.onProjectEditOpen &&
    prev.onGoalManualComplete === next.onGoalManualComplete &&
    prev.onAddGoal === next.onAddGoal &&
    prev.onRoadmapOrderSaved === next.onRoadmapOrderSaved &&
    prev.onNewGoalRevealComplete === next.onNewGoalRevealComplete &&
    prev.onNewProjectRevealComplete === next.onNewProjectRevealComplete &&
    prev.onCampaignDetailsSaved === next.onCampaignDetailsSaved
  );
});

export default CampaignCard;
