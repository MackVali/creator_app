"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import dynamic from "next/dynamic";
import { ChevronDown, MoreVertical, Sparkles } from "lucide-react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Goal, Project, Task } from "../types";
import {
  ProjectRowTaskInteractionsProvider,
  type ProjectCardMorphOrigin,
} from "./ProjectRow";
import type { FabEditTarget } from "@/components/ui/Fab";
import { cn } from "@/lib/utils";
import { normalizeGoalStatus } from "@/lib/goals/status";
import { useToastHelpers } from "@/components/ui/toast";
// Lazy-load dropdown contents to reduce initial bundle and re-render cost
const ProjectsDropdown = dynamic(
  () => import("./ProjectsDropdown").then((m) => m.ProjectsDropdown),
  {
    ssr: false,
    loading: () => (
      <div className="h-24 w-full animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
    ),
  }
);
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";
import { ProjectQuickEditDialog } from "./ProjectQuickEditDialog";
import { useFabCreation } from "@/components/ui/FabCreationContext";

const energyAccent: Record<Goal["energy"], { dot: string; bar: string }> = {
  No: {
    dot: "bg-slate-200",
    bar: "linear-gradient(90deg, rgba(148,163,184,0.7), rgba(71,85,105,0.3))",
  },
  Low: {
    dot: "bg-emerald-300",
    bar: "linear-gradient(90deg, rgba(74,222,128,0.8), rgba(13,148,136,0.3))",
  },
  Medium: {
    dot: "bg-sky-300",
    bar: "linear-gradient(90deg, rgba(56,189,248,0.8), rgba(99,102,241,0.35))",
  },
  High: {
    dot: "bg-amber-300",
    bar: "linear-gradient(90deg, rgba(251,191,36,0.85), rgba(249,115,22,0.4))",
  },
  Ultra: {
    dot: "bg-fuchsia-300",
    bar: "linear-gradient(90deg, rgba(244,114,182,0.9), rgba(168,85,247,0.4))",
  },
  Extreme: {
    dot: "bg-yellow-300",
    bar: "linear-gradient(90deg, rgba(250,204,21,0.9), rgba(244,63,94,0.45))",
  },
};

interface GoalCardProps {
  goal: Goal;
  onEdit?(): void;
  onToggleActive?(): void;
  onDelete?(): void;
  onBoost?(): void;
  onCardClick?(): void;
  onLongPressEdit?(): void;
  showWeight?: boolean;
  showCreatedAt?: boolean;
  showEmojiPrefix?: boolean;
  hideEnergyPill?: boolean;
  hideGoalEditAction?: boolean;
  monumentContext?: boolean;
  variant?: "default" | "compact";
  drawerCompact?: boolean;
  showEnergyInCompact?: boolean;
  onProjectUpdated?: (projectId: string, updates: Partial<Project>) => void;
  onProjectDeleted?: (projectId: string) => void;
  onProjectEditOpen?: (
    target: FabEditTarget,
    project: Project,
    origin: ProjectCardMorphOrigin | null
  ) => void;
  onTaskEditOpen?: (
    task: Task,
    project: Project,
    origin: ProjectCardMorphOrigin | null
  ) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  projectDropdownMode?: "default" | "tasks-only";
  onTaskToggleCompletion?: (
    goalId: string,
    projectId: string,
    taskId: string,
    currentCompletedAt: string | null
  ) => void;
  onAddTask?: (goalId: string) => void | Promise<void>;
  onProjectHoldComplete?: (
    goalId: string,
    projectId: string,
    stage: string
  ) => void;
  onManualComplete?: (goal: Goal) => void | Promise<void>;
  completeWhenProjectsDone?: boolean;
  completionTheme?: "auto" | "emerald" | "monument" | "border" | "matrix";
  suppressReadyToast?: boolean;
}

function isProjectComplete(project: Project) {
  return (
    project.status === "Done" ||
    project.stage === "RELEASE" ||
    Number(project.progress ?? 0) >= 100
  );
}

function getProjectCompletionSignature(projects: Project[]) {
  return projects
    .map((project) => `${project.id}:${isProjectComplete(project) ? "1" : "0"}`)
    .join("|");
}

const shellSpringTransition = {
  type: "spring",
  stiffness: 580,
  damping: 29,
  mass: 0.7,
} as const;

const projectDropdownTransition = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1],
} as const;

const drawerCompactDropdownTransition = {
  duration: 0.48,
  ease: [0.16, 1, 0.3, 1],
} as const;

const drawerCompactDropdownCloseTransition = {
  duration: 0.4,
  ease: [0.4, 0, 0.2, 1],
} as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const goalManualCompleteRejectClass =
  "goal-manual-complete-reject !border-red-400/80 shadow-[0_0_0_1px_rgba(248,113,113,0.65),0_12px_28px_-22px_rgba(248,113,113,0.65)]";

const detailRevealVariant = {
  hidden: { opacity: 0, height: 0, y: 6 },
  visible: {
    opacity: 1,
    height: "auto",
    y: 0,
    transition: projectDropdownTransition,
  },
  exit: {
    opacity: 0,
    height: 0,
    y: 4,
    transition: { duration: 0.22, ease: "easeOut" },
  },
} as const;

const drawerCompactDetailRevealVariant = {
  hidden: { opacity: 0, height: 0, y: -4 },
  visible: {
    opacity: 1,
    height: "auto",
    y: 0,
    transition: drawerCompactDropdownTransition,
  },
  exit: {
    opacity: 0,
    height: 0,
    y: -4,
    transition: drawerCompactDropdownCloseTransition,
  },
} as const;

const detailContentVariant = {
  hidden: { opacity: 0, y: 5 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      delay: 0.03,
      duration: 0.2,
      ease: "easeOut",
    },
  },
  exit: {
    opacity: 0,
    y: 3,
    transition: { duration: 0.18, ease: "easeOut" },
  },
} as const;

function GoalCardImpl({
  goal,
  onEdit,
  onToggleActive,
  onDelete,
  onBoost,
  onCardClick,
  onLongPressEdit,
  showWeight = true,
  showCreatedAt = true,
  showEmojiPrefix = false,
  hideEnergyPill = false,
  hideGoalEditAction = false,
  variant = "default",
  drawerCompact = false,
  showEnergyInCompact = false,
  monumentContext = false,
  onProjectUpdated,
  onProjectDeleted,
  onProjectEditOpen,
  onTaskEditOpen,
  open: openProp,
  onOpenChange,
  projectDropdownMode = "default",
  onTaskToggleCompletion,
  onAddTask,
  onProjectHoldComplete,
  onManualComplete,
  completionTheme = "auto",
  suppressReadyToast = false,
}: GoalCardProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof openProp === "boolean";
  const open = isControlled ? (openProp as boolean) : internalOpen;
  const [loading] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const fabCreation = useFabCreation();
  const [editingProjectOrigin, setEditingProjectOrigin] =
    useState<ProjectCardMorphOrigin | null>(null);
  const [addingProject, setAddingProject] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const isDrawerCompactDefault = drawerCompact && variant === "default";
  const defaultCardRef = useRef<HTMLDivElement | null>(null);
  const drawerCompactDropdownContentRef = useRef<HTMLDivElement | null>(null);
  const latestDrawerCompactDropdownHeightRef = useRef(0);
  const [drawerCompactDropdownHeight, setDrawerCompactDropdownHeight] =
    useState(0);
  const [manualCompleteRejected, setManualCompleteRejected] = useState(false);
  const manualCompleteRejectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const shellClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goalLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goalLongPressTriggeredRef = useRef(false);
  const lastShellClickAtRef = useRef(0);
  const readyToastShownGoalIdsRef = useRef<Set<string>>(new Set());
  const toast = useToastHelpers();

  const setOpen = useCallback(
    (value: boolean) => {
      if (!isControlled) {
        setInternalOpen(value);
      }
      onOpenChange?.(value);
    },
    [isControlled, onOpenChange]
  );

  const toggle = useCallback(() => {
    setOpen(!open);
  }, [open, setOpen]);

  const energy = energyAccent[goal.energy];
  const normalizedStatus = normalizeGoalStatus(goal.status, goal.active);
  const allProjectsCompleted =
    goal.projects.length > 0 && goal.projects.every(isProjectComplete);
  const isCompleted = normalizedStatus === "COMPLETED";
  const isReadyToComplete = allProjectsCompleted && !isCompleted;

  const triggerManualCompleteRejection = useCallback(() => {
    setManualCompleteRejected(true);
    if (manualCompleteRejectTimerRef.current) {
      clearTimeout(manualCompleteRejectTimerRef.current);
    }
    manualCompleteRejectTimerRef.current = setTimeout(() => {
      manualCompleteRejectTimerRef.current = null;
      setManualCompleteRejected(false);
    }, 460);
  }, []);

  const handleManualCompleteAttempt = useCallback(() => {
    if (isReadyToComplete) {
      void onManualComplete?.(goal);
      return;
    }
    if (!isCompleted) {
      triggerManualCompleteRejection();
    }
  }, [goal, isCompleted, isReadyToComplete, onManualComplete, triggerManualCompleteRejection]);

  useEffect(() => {
    if (!open || isDrawerCompactDefault) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const node = defaultCardRef.current;
      if (!node || !(event.target instanceof Node)) {
        return;
      }

      if (node.contains(event.target)) {
        return;
      }

      setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isDrawerCompactDefault, open, setOpen]);

  useLayoutEffect(() => {
    if (!isDrawerCompactDefault || !open) {
      return;
    }

    const node = drawerCompactDropdownContentRef.current;
    if (!node) return;

    const updateMeasuredHeight = () => {
      const nextHeight = node.scrollHeight;
      if (nextHeight > 0) {
        latestDrawerCompactDropdownHeightRef.current = nextHeight;
      }
      setDrawerCompactDropdownHeight((currentHeight) =>
        Math.abs(currentHeight - nextHeight) > 0.5 ? nextHeight : currentHeight
      );
    };

    updateMeasuredHeight();

    if (typeof ResizeObserver === "undefined") return;

    const resizeObserver = new ResizeObserver(() => {
      updateMeasuredHeight();
    });
    resizeObserver.observe(node);

    return () => {
      resizeObserver.disconnect();
    };
  }, [goal.projects, isDrawerCompactDefault, open, projectDropdownMode]);

  useEffect(() => {
    return () => {
      if (manualCompleteRejectTimerRef.current) {
        clearTimeout(manualCompleteRejectTimerRef.current);
      }
      if (shellClickTimerRef.current) {
        clearTimeout(shellClickTimerRef.current);
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

  const handleShellClick = useCallback(
    (event?: MouseEvent<HTMLButtonElement>) => {
      if (!onManualComplete) {
        if (onCardClick) {
          onCardClick();
          return;
        }
        toggle();
        return;
      }

      const now = Date.now();
      const isDoubleTap = now - lastShellClickAtRef.current <= 320;
      lastShellClickAtRef.current = now;

      if (isDoubleTap) {
        event?.preventDefault();
        event?.stopPropagation();
        if (shellClickTimerRef.current) {
          clearTimeout(shellClickTimerRef.current);
          shellClickTimerRef.current = null;
        }
        handleManualCompleteAttempt();
        return;
      }

      if (shellClickTimerRef.current) {
        clearTimeout(shellClickTimerRef.current);
      }
      shellClickTimerRef.current = setTimeout(() => {
        shellClickTimerRef.current = null;
        if (onCardClick) {
          onCardClick();
          return;
        }
        toggle();
      }, 330);
    },
    [handleManualCompleteAttempt, onCardClick, onManualComplete, toggle]
  );
  const projectLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const projectLongPressTriggeredRef = useRef(false);
  const cancelProjectLongPress = useCallback(() => {
    if (projectLongPressTimerRef.current) {
      clearTimeout(projectLongPressTimerRef.current);
      projectLongPressTimerRef.current = null;
    }
  }, []);
  const triggerProjectHold = useCallback(() => {
    if (!onProjectHoldComplete) return;
    const project = goal.projects[0];
    if (!project) return;
    onProjectHoldComplete(goal.id, project.id, project.stage ?? "BUILD");
  }, [goal, onProjectHoldComplete]);
  const startProjectLongPress = useCallback(() => {
    if (!onProjectHoldComplete) return;
    cancelProjectLongPress();
    projectLongPressTriggeredRef.current = false;
    projectLongPressTimerRef.current = setTimeout(() => {
      projectLongPressTimerRef.current = null;
      projectLongPressTriggeredRef.current = true;
      triggerProjectHold();
    }, 650);
  }, [cancelProjectLongPress, onProjectHoldComplete, triggerProjectHold]);
  const handleProjectPointerUp = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      cancelProjectLongPress();
      if (projectLongPressTriggeredRef.current) {
        projectLongPressTriggeredRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [cancelProjectLongPress]
  );
  const handleProjectPointerCancel = useCallback(() => {
    cancelProjectLongPress();
    projectLongPressTriggeredRef.current = false;
  }, [cancelProjectLongPress]);

    const cancelGoalLongPress = useCallback(() => {
      if (goalLongPressTimerRef.current) {
        clearTimeout(goalLongPressTimerRef.current);
        goalLongPressTimerRef.current = null;
      }
    }, []);

    const startGoalLongPress = useCallback(() => {
      const longPressEditHandler = onLongPressEdit ?? onEdit;

      if (!longPressEditHandler) {
        startProjectLongPress();
        return;
      }

      cancelGoalLongPress();
      goalLongPressTriggeredRef.current = false;
      goalLongPressTimerRef.current = setTimeout(() => {
        goalLongPressTimerRef.current = null;
        goalLongPressTriggeredRef.current = true;

        if (shellClickTimerRef.current) {
          clearTimeout(shellClickTimerRef.current);
          shellClickTimerRef.current = null;
        }

        longPressEditHandler();
      }, 560);
    }, [cancelGoalLongPress, onEdit, onLongPressEdit, startProjectLongPress]);

    const handleGoalPointerUp = useCallback(
      (event: MouseEvent<HTMLButtonElement>) => {
        const longPressEditHandler = onLongPressEdit ?? onEdit;

        if (!longPressEditHandler) {
          handleProjectPointerUp(event);
          return;
        }

        cancelGoalLongPress();
        if (goalLongPressTriggeredRef.current) {
          goalLongPressTriggeredRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }
      },
      [cancelGoalLongPress, handleProjectPointerUp, onEdit, onLongPressEdit]
    );

    const handleGoalPointerCancel = useCallback(() => {
      const longPressEditHandler = onLongPressEdit ?? onEdit;

      if (!longPressEditHandler) {
        handleProjectPointerCancel();
        return;
      }

      cancelGoalLongPress();
      goalLongPressTriggeredRef.current = false;
    }, [cancelGoalLongPress, handleProjectPointerCancel, onEdit, onLongPressEdit]);


  const handleAddProject = useCallback(async (originRect?: DOMRect) => {
    if (addingProject) return;
    setAddingProject(true);
    try {
      if (projectDropdownMode === "tasks-only") {
        const firstProject = goal.projects[0];
        if (firstProject && fabCreation?.requestTaskCreation) {
          fabCreation.requestTaskCreation(firstProject.id, goal.id, originRect ?? null);
          return;
        }
        await onAddTask?.(goal.id);
        return;
      }
      fabCreation?.requestProjectCreation(goal.id, originRect ?? null);
    } finally {
      setAddingProject(false);
    }
  }, [addingProject, fabCreation, goal.id, goal.projects, onAddTask, projectDropdownMode]);

  const handleProjectLongPress = useCallback(
    (project: Project, origin: ProjectCardMorphOrigin | null) => {
      if (onProjectEditOpen) {
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
          project,
          origin
        );
        return;
      }
      setEditingProjectOrigin(origin ?? null);
      setEditingProject(project);
    },
    [onProjectEditOpen]
  );

  const handleProjectEditRequest = useCallback(
    (project: Project, origin: ProjectCardMorphOrigin | null = null) => {
      fabCreation?.requestEntityEdit({
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
      });
    },
    [fabCreation]
  );

  const closeProjectEditor = useCallback(() => {
    setEditingProject(null);
    setEditingProjectOrigin(null);
  }, []);

  const resolvedCompletionTheme =
    completionTheme === "auto"
      ? monumentContext
        ? "monument"
        : "emerald"
      : completionTheme;
  const isBorderOnlyCompleted =
    isCompleted && resolvedCompletionTheme === "border";
  const isMonumentCompactCompleted =
    isCompleted &&
    resolvedCompletionTheme === "monument" &&
    variant === "compact";
  const completedClass = isCompleted
    ? resolvedCompletionTheme === "border"
      ? "shimmer-border-complete completion-border-only"
      : resolvedCompletionTheme === "matrix"
      ? variant === "compact"
        ? "emerald-completed-compact shimmer-border-complete matrix-completed-project-card"
        : "emerald-completed shimmer-border-complete"
      : resolvedCompletionTheme === "monument"
      ? variant === "compact"
        ? "border border-white/10 bg-white/[0.04] text-white/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),_0_4px_10px_rgba(0,0,0,0.45)] opacity-85"
        : "monument-completed"
      : variant === "compact"
        ? "emerald-completed-compact shimmer-border-complete !bg-[radial-gradient(circle_at_0%_0%,rgba(52,211,153,0.22),transparent_58%),linear-gradient(145deg,rgba(5,95,68,0.96)_0%,rgba(6,120,83,0.94)_54%,rgba(4,83,63,0.92)_100%)]"
        : drawerCompact
          ? ""
          : "emerald-completed"
    : "";
  const completedIconClass = isCompleted
    ? isBorderOnlyCompleted
      ? "bg-white/5 text-white"
      : isMonumentCompactCompleted
      ? "bg-white/[0.045] border border-white/10 text-white/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] grayscale"
      : "bg-gradient-to-b from-[#0a5c3a] via-[#0a4f34] to-[#043022] border border-emerald-400/60 text-emerald-100 shadow-[inset_0_2px_0_rgba(255,255,255,0.08)]"
    : "bg-white/5 text-white";
  const progressBarStyle = {
    width: `${goal.progress}%`,
    height: "100%",
    borderRadius: "inherit",
    background:
      "linear-gradient(to bottom, #4fd18b 0%, #2fb36f 50%, #21965b 100%)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.35)",
  };
  const createdAt = useMemo(() => {
    if (goal.createdAt) return new Date(goal.createdAt).toLocaleDateString();
    if (goal.updatedAt) return new Date(goal.updatedAt).toLocaleDateString();
    return null;
  }, [goal.createdAt, goal.updatedAt]);
  const etaDisplay = useMemo(() => {
    if (!goal.estimatedCompletionAt) return null;
    return new Date(goal.estimatedCompletionAt).toLocaleDateString();
  }, [goal.estimatedCompletionAt]);
  const shellMotionProps = prefersReducedMotion
    ? {}
    : {
        whileTap: { scale: 0.962, y: 2 },
        transition: shellSpringTransition,
      };
  const drawerCompactOpenDuration = clamp(
    0.45 + drawerCompactDropdownHeight / 900,
    0.55,
    1.15
  );
  const latestDrawerCompactDropdownHeight = Math.max(
    drawerCompactDropdownHeight,
    latestDrawerCompactDropdownHeightRef.current
  );
  const drawerCompactCloseDuration = clamp(
    0.75 + latestDrawerCompactDropdownHeight / 900,
    0.85,
    1.45
  );
  const drawerCompactMeasuredDetailMotionProps = prefersReducedMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.08 },
      }
    : {
        initial: { opacity: 0, height: 0 },
        animate: {
          opacity: 1,
          height: latestDrawerCompactDropdownHeight,
          transition: {
            height: {
              duration: drawerCompactOpenDuration,
              ease: [0.25, 0.1, 0.25, 1],
            },
            opacity: { duration: 0.18, ease: "linear" },
          },
        },
        exit: {
          opacity: [1, 1, 0.92],
          height: 0,
          transition: {
            height: {
              duration: drawerCompactCloseDuration,
              ease: "linear",
            },
            opacity: {
              duration: drawerCompactCloseDuration,
              ease: "linear",
              times: [0, 0.82, 1],
            },
          },
        },
      };
  const drawerCompactMeasuredContentMotionProps = prefersReducedMotion
    ? {
        initial: false,
      }
    : {
        initial: { opacity: 0, y: 5 },
        animate: {
          opacity: 1,
          y: 0,
          transition: {
            delay: 0.03,
            duration: 0.2,
            ease: "easeOut",
          },
        },
        exit: {
          opacity: [1, 1, 0.92],
          y: 0,
          transition: {
            opacity: {
              duration: drawerCompactCloseDuration,
              ease: "linear",
              times: [0, 0.82, 1],
            },
            y: { duration: drawerCompactCloseDuration, ease: "linear" },
          },
        },
      };
  const detailMotionProps = prefersReducedMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: isDrawerCompactDefault ? 0.08 : 0.12 },
      }
    : {
        variants: isDrawerCompactDefault
          ? drawerCompactDetailRevealVariant
          : detailRevealVariant,
        initial: "hidden" as const,
        animate: "visible" as const,
        exit: "exit" as const,
      };

  // Compact tile for dense mobile grids
  if (variant === "compact") {
    const containerBase =
      "group relative h-full rounded-2xl p-3 sm:p-4 text-white goal-card";
    const containerClass = [
      containerBase,
      completedClass,
      manualCompleteRejected ? goalManualCompleteRejectClass : "",
      showEnergyInCompact ? "min-h-[60px]" : "min-h-[96px] aspect-[5/6]",
    ]
      .filter(Boolean)
      .join(" ");
    const displayEmoji =
      typeof (goal.emoji ?? goal.monumentEmoji) === "string" &&
      (goal.emoji ?? goal.monumentEmoji)?.trim().length
        ? (goal.emoji ?? goal.monumentEmoji)?.trim()
        : goal.title.slice(0, 2).toUpperCase();
    const flameLevel = (goal.energyCode ? goal.energyCode : goal.energy ?? "No")
      .toString()
      .toUpperCase() as FlameLevel;

    if (showEnergyInCompact) {
      return (
        <>
          <div
            className={containerClass}
            data-variant="compact"
            data-build-tag="gc-test-01"
          >
            <div className="relative z-[2] flex h-full min-w-0 flex-col items-stretch">
              <motion.button
                type="button"
                onClick={handleShellClick}
                aria-expanded={onCardClick ? undefined : open}
                aria-controls={onCardClick ? undefined : `goal-${goal.id}`}
                onPointerDown={startGoalLongPress}
                onPointerUp={handleGoalPointerUp}
                onPointerCancel={handleGoalPointerCancel}
                onPointerLeave={handleGoalPointerCancel}
                className="flex w-full items-center justify-between text-left text-sm select-none"
                {...shellMotionProps}
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm font-semibold shadow-[inset_0_-1px_0_rgba(255,255,255,0.05)]">
                    {displayEmoji}
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-semibold leading-tight truncate text-sm">
                      {goal.title}
                    </span>
                    <div className="flex items-center gap-1.5 text-[11px] text-white/60">
                      <FlameEmber level={flameLevel} size="xs" />
                      <span className="uppercase tracking-[0.2em]">
                        {goal.energy}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-[11px] text-white/70">{goal.progress}%</p>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform text-white/60 ${
                      open ? "rotate-180" : ""
                    }`}
                  />
                </div>
              </motion.button>

              <AnimatePresence initial={false}>
                {open ? (
                  <CompactProjectsOverlay
                    goal={goal}
                    loading={loading}
                    onClose={toggle}
                    onProjectLongPress={handleProjectLongPress}
                    onProjectEditRequest={handleProjectEditRequest}
                    onProjectUpdated={onProjectUpdated}
                    projectDropdownMode={projectDropdownMode}
                    goalId={goal.id}
                    onAddProject={handleAddProject}
                    addingProject={addingProject}
                    onEdit={onEdit}
                    hideGoalEditAction={hideGoalEditAction}
                    onTaskEditOpen={onTaskEditOpen}
                    onTaskToggleCompletion={onTaskToggleCompletion}
                  />
                ) : null}
              </AnimatePresence>
            </div>
          </div>
          {!onProjectEditOpen ? (
            <ProjectQuickEditDialog
              project={editingProject}
              goalId={goal.id}
              origin={editingProjectOrigin}
              onClose={closeProjectEditor}
              onUpdated={(projectId, updates) =>
                onProjectUpdated?.(projectId, updates)
              }
              onDeleted={(projectId) => onProjectDeleted?.(projectId)}
            />
          ) : null}
        </>
      );
    }

    return (
      <>
        <div
          className={containerClass}
          data-variant="compact"
          data-build-tag="gc-test-01"
        >
          <div className="relative z-[2] flex h-full min-w-0 flex-col items-stretch">
            <motion.button
              type="button"
              onClick={handleShellClick}
              aria-expanded={onCardClick ? undefined : open}
              aria-controls={onCardClick ? undefined : `goal-${goal.id}`}
              onPointerDown={startGoalLongPress}
              onPointerUp={handleGoalPointerUp}
              onPointerCancel={handleGoalPointerCancel}
              onPointerLeave={handleGoalPointerCancel}
              className="flex flex-1 flex-col items-center gap-1 min-w-0 select-none text-center"
              {...shellMotionProps}
            >
              <div
                className={cn(
                  "relative z-[3] flex h-9 w-9 shrink-0 items-center justify-center overflow-visible rounded-xl border border-white/10 text-base font-semibold leading-none shadow-[inset_0_-1px_0_rgba(255,255,255,0.06),_0_6px_12px_rgba(0,0,0,0.35)]",
                  isCompleted && resolvedCompletionTheme === "matrix"
                    ? "bg-white/[0.075] text-white/90 ring-1 ring-white/10"
                    : null,
                  completedIconClass
                )}
              >
                <span className="relative z-[4] leading-none">
                  {goal.emoji ?? goal.monumentEmoji ?? goal.title.slice(0, 2)}
                </span>
              </div>
              <h3
                id={`goal-${goal.id}-label`}
                className="max-w-full px-1 text-center text-[8px] leading-snug font-semibold line-clamp-2 break-words min-h-[2.4em]"
                title={goal.title}
                style={{ hyphens: "auto" }}
              >
                {showEmojiPrefix && (goal.emoji ?? goal.monumentEmoji)
                  ? `${goal.emoji ?? goal.monumentEmoji} `
                  : ""}
                {goal.title}
              </h3>
              <div
                className={cn(
                  "mt-1 h-3 w-full overflow-hidden rounded-[999px]",
                  resolvedCompletionTheme === "matrix"
                    ? Number(goal.progress ?? 0) > 0
                      ? "border border-[#16483d] bg-[linear-gradient(180deg,#1b2d28,#0d1b17)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.72),inset_0_-1px_0_rgba(255,255,255,0.065)]"
                      : "border border-[#252a2a] bg-[linear-gradient(180deg,#17191b,#090a0b)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.82),inset_0_-1px_0_rgba(255,255,255,0.045)]"
                    : "h-[14px] border-2 border-[#0f1115] bg-[#1b1e24]"
                )}
                style={
                  resolvedCompletionTheme === "matrix"
                    ? undefined
                    : {
                        boxShadow:
                          "inset 0 2px 3px rgba(0,0,0,0.6), 0 1px 2px rgba(255,255,255,0.08)",
                      }
                }
              >
                <div
                  className={cn(
                    "h-full rounded-[999px]",
                    resolvedCompletionTheme === "matrix"
                      ? "bg-[linear-gradient(90deg,#0b7a5c,#059669,#0b8060)] shadow-[0_0_9px_rgba(16,185,129,0.26),inset_0_1px_0_rgba(209,250,229,0.28),inset_0_-1px_0_rgba(0,0,0,0.24)] transition-[width] duration-500 ease-out"
                      : ""
                  )}
                  style={
                    resolvedCompletionTheme === "matrix"
                      ? { width: `${goal.progress}%` }
                      : progressBarStyle
                  }
                />
              </div>
            </motion.button>

            <AnimatePresence initial={false}>
              {open ? (
                <CompactProjectsOverlay
                  goal={goal}
                  loading={loading}
                  onClose={toggle}
                  onProjectLongPress={handleProjectLongPress}
                  onProjectEditRequest={handleProjectEditRequest}
                  onProjectUpdated={onProjectUpdated}
                  projectDropdownMode={projectDropdownMode}
                  goalId={goal.id}
                  onAddProject={handleAddProject}
                  addingProject={addingProject}
                  onEdit={onEdit}
                  hideGoalEditAction={hideGoalEditAction}
                  onTaskEditOpen={onTaskEditOpen}
                  onTaskToggleCompletion={onTaskToggleCompletion}
                />
              ) : null}
            </AnimatePresence>
          </div>
        </div>
        {!onProjectEditOpen ? (
          <ProjectQuickEditDialog
            project={editingProject}
            goalId={goal.id}
            origin={editingProjectOrigin}
            onClose={closeProjectEditor}
            onUpdated={(projectId, updates) =>
              onProjectUpdated?.(projectId, updates)
            }
            onDeleted={(projectId) => onProjectDeleted?.(projectId)}
          />
        ) : null}
      </>
    );
  }

  const defaultContainerClass = [
    isDrawerCompactDefault
      ? "group relative mb-1 h-full overflow-hidden rounded-lg goal-card p-1.5 text-white transition-[background-color,border-color,box-shadow] duration-200 sm:rounded-xl sm:p-2"
      : "group relative mb-2.5 h-full overflow-hidden rounded-xl goal-card p-2.5 text-white transition-[background-color,border-color,box-shadow] duration-200 sm:mb-3 sm:p-3",
    completedClass,
    manualCompleteRejected ? goalManualCompleteRejectClass : "",
  ]
    .filter(Boolean)
    .join(" ");
  const shellStateClass = open
    ? isCompleted && !isBorderOnlyCompleted
      ? isDrawerCompactDefault
        ? "border border-emerald-300/50 bg-emerald-950/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
        : "border border-emerald-300/55 shadow-[0_24px_44px_-28px_rgba(16,185,129,0.48),inset_0_1px_0_rgba(255,255,255,0.07)]"
      : isDrawerCompactDefault
        ? "border border-white/10 bg-[linear-gradient(180deg,rgba(66,66,66,0.16)_0%,rgba(28,28,28,0.72)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        : "border border-white/16 bg-white/[0.04] shadow-[0_24px_44px_-28px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.06)]"
    : isCompleted && !isBorderOnlyCompleted
      ? "border border-emerald-400/28 shadow-[0_16px_28px_-24px_rgba(16,185,129,0.32),inset_0_1px_0_rgba(255,255,255,0.04)]"
      : "border border-transparent shadow-[0_12px_24px_-24px_rgba(0,0,0,0.7)]";

  return (
    <>
      <motion.div
        ref={defaultCardRef}
        layout={!prefersReducedMotion}
        transition={
          prefersReducedMotion
            ? { duration: 0.12 }
            : isDrawerCompactDefault
              ? { layout: projectDropdownTransition }
              : shellSpringTransition
        }
        className={`${defaultContainerClass} ${shellStateClass}`}
      >
        <div
          className={`relative flex h-full flex-col ${
            isDrawerCompactDefault ? "gap-1" : "gap-1.5 sm:gap-2"
          }`}
        >
          <div
            className={`flex justify-between ${
              isDrawerCompactDefault
                ? "items-center gap-1.5"
                : "items-start gap-2"
            }`}
          >
            <motion.button
              onClick={handleShellClick}
              aria-expanded={onCardClick ? undefined : open}
              aria-controls={onCardClick ? undefined : `goal-${goal.id}`}
              onPointerDown={startGoalLongPress}
              onPointerUp={handleGoalPointerUp}
              onPointerCancel={handleGoalPointerCancel}
              onPointerLeave={handleGoalPointerCancel}
              className={`relative flex flex-1 flex-col text-left overflow-hidden ${
                isDrawerCompactDefault ? "gap-0.5" : "gap-1 sm:gap-1.5"
              }`}
              {...shellMotionProps}
            >
              <div
                className={`relative z-10 flex ${
                  isDrawerCompactDefault
                      ? "w-full items-center gap-2"
                    : "items-start gap-2"
                }`}
              >
                <div
                  className={`flex items-center justify-center border border-white/10 font-semibold ${
                    isDrawerCompactDefault
                      ? "h-7 w-7 shrink-0 rounded-lg text-[10px] sm:h-8 sm:w-8 sm:text-[11px]"
                      : "h-9 w-9 rounded-xl text-lg sm:h-10 sm:w-10 sm:rounded-2xl sm:text-xl"
                  } ${completedIconClass}`}
                >
                  {goal.emoji ?? goal.monumentEmoji ?? goal.title.slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1 select-none">
                  <div
                    className={`flex flex-wrap items-center gap-1 text-[9px] uppercase tracking-[0.14em] ${
                      isDrawerCompactDefault
                        ? "hidden"
                        : "sm:gap-1.5 sm:text-[10px] sm:tracking-[0.18em]"
                    }`}
                  >
                    {hideEnergyPill ? null : (
                      <span className="flex items-center gap-1 rounded-full border border-white/10 px-1.5 py-0.5 text-white/80">
                        <FlameEmber
                          level={goal.energy.toUpperCase() as FlameLevel}
                          size="xs"
                        />
                        <span className="text-[9px] uppercase tracking-[0.14em] sm:text-[10px] sm:tracking-[0.2em]">
                          {goal.energy}
                        </span>
                      </span>
                    )}
                    {showWeight ? (
                      <span className="rounded-full border border-white/20 px-1.5 py-0.5 text-[9px] text-white/70 sm:text-[10px]">
                        wt {goal.weight ?? 0}
                      </span>
                    ) : null}
                  </div>
                  <h3
                    id={`goal-${goal.id}-label`}
                    className={
                      isDrawerCompactDefault
                        ? "truncate text-[12px] font-medium leading-tight text-white/84 sm:text-[13px]"
                        : "mt-0.5 text-[17px] font-semibold leading-tight sm:mt-1 sm:text-lg"
                    }
                    title={goal.title}
                  >
                    {showEmojiPrefix && (goal.emoji ?? goal.monumentEmoji) ? (
                      <span className="mr-2 inline" aria-hidden>
                        {goal.emoji ?? goal.monumentEmoji}
                      </span>
                    ) : null}
                    {goal.title}
                  </h3>
                  {goal.why && !isDrawerCompactDefault && (
                    <p className="mt-0.5 line-clamp-1 text-[13px] leading-4 text-white/65 sm:line-clamp-2 sm:text-sm sm:leading-5">
                      {goal.why}
                    </p>
                  )}
                </div>
                <ChevronDown
                  className={`shrink-0 text-white/60 ${
                    isDrawerCompactDefault
                      ? "h-4 w-4"
                      : "mt-0.5 h-4 w-4 sm:mt-1 sm:h-5 sm:w-5"
                  } ${
                    open ? "rotate-180" : ""
                  }`}
                />
              </div>
              {!isDrawerCompactDefault ? (
                <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-white/60 sm:gap-2 sm:text-[10px]">
                  {!open && (
                    <div className="flex items-center gap-1.5 rounded-full border border-white/10 px-1.5 py-0.5 text-[9px] sm:gap-2 sm:px-2 sm:text-[10px]">
                      <span
                        className={`h-1 w-1 rounded-full sm:h-1.5 sm:w-1.5 ${energy.dot}`}
                        aria-hidden="true"
                      />
                      <span>{goal.projects.length} projects</span>
                    </div>
                  )}
                  {goal.dueDate && (
                    <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[9px] sm:px-2 sm:text-[10px]">
                      Due {new Date(goal.dueDate).toLocaleDateString()}
                    </span>
                  )}
                  {etaDisplay && (
                    <span className="relative flex items-center gap-1.5 rounded-full border border-fuchsia-400/40 bg-gradient-to-r from-fuchsia-500/15 via-rose-500/10 to-amber-500/15 px-1.5 py-0.5 text-white shadow-[0_6px_18px_rgba(236,72,153,0.35)] sm:gap-2 sm:px-2">
                      <span className="flex items-center gap-1 rounded-full bg-white/10 px-1 py-0.5 text-[7px] font-semibold uppercase tracking-[0.22em] text-white/70 sm:px-1.25 sm:text-[8px] sm:tracking-[0.3em]">
                        <Sparkles
                          className="h-3 w-3 text-amber-100"
                          aria-hidden="true"
                        />
                        ETA
                      </span>
                      <span className="text-[13px] font-semibold tracking-tight text-white sm:text-sm">
                        {etaDisplay}
                      </span>
                    </span>
                  )}
                  {createdAt && showCreatedAt && (
                    <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[9px] text-white/60 sm:px-2 sm:text-[10px]">
                      Created {createdAt}
                    </span>
                  )}
                </div>
              ) : null}
              {!open && !isDrawerCompactDefault && (
                <div className="flex flex-col gap-0.5 sm:gap-1">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-white/50 sm:text-[11px] sm:tracking-[0.25em]">
                    <span>Progress</span>
                    <span>{goal.progress}%</span>
                  </div>
                  <div
                    className="h-[10px] overflow-hidden rounded-[999px] border border-[#0f1115] bg-[#1b1e24] sm:h-[12px]"
                    style={{
                      boxShadow:
                        "inset 0 2px 3px rgba(0,0,0,0.6), 0 1px 2px rgba(255,255,255,0.08)",
                    }}
                  >
                    <div
                      className="progress-fill h-full rounded-[999px]"
                      style={progressBarStyle}
                    />
                  </div>
                </div>
              )}
              {onBoost && (
                <div className="pt-0.5">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onBoost();
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-gradient-to-r from-red-600 to-rose-500 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-white shadow-[0_8px_20px_-10px_rgba(239,68,68,0.6)] sm:px-2 sm:text-[10px] sm:tracking-[0.25em]"
                  >
                    Boost +250
                  </button>
                </div>
              )}
            </motion.button>

            <div className="relative">
              <button
                type="button"
                aria-label="Goal actions"
                className={
                  isDrawerCompactDefault
                    ? "rounded-full border border-white/10 bg-white/10 p-1 text-white/70 hover:bg-white/20"
                    : "rounded-full p-1.5 text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white/85"
                }
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  console.log("🎯 Three dots clicked, onEdit:", !!onEdit);
                  // Simple custom dropdown toggle
                  const dropdown = document.getElementById(
                    `dropdown-${goal.id}`
                  );
                  if (dropdown) {
                    dropdown.classList.toggle("hidden");
                    console.log("🎯 Toggled dropdown visibility");
                  } else {
                    console.log("🎯 Dropdown element not found");
                  }
                }}
              >
                <MoreVertical
                  className={
                    isDrawerCompactDefault
                      ? "h-3.5 w-3.5"
                      : "h-3.5 w-3.5 sm:h-4 sm:w-4"
                  }
                />
              </button>
              <div
                id={`dropdown-${goal.id}`}
                className="absolute right-0 top-full mt-1 hidden z-50 w-48 rounded-md border border-white/10 bg-black shadow-lg"
              >
                <div className="py-1">
                  <button
                    className="block w-full px-4 py-2 text-left text-sm text-white hover:bg-white/10"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      console.log("🎯 Edit goal button clicked");
                      document
                        .getElementById(`dropdown-${goal.id}`)
                        ?.classList.add("hidden");
                      window.requestAnimationFrame(() => {
                        onEdit?.();
                      });
                    }}
                  >
                    Edit Goal
                  </button>
                </div>
              </div>
            </div>
          </div>

          <AnimatePresence initial={false} mode="sync">
            {open ? (
              <motion.div
                className={
                  isDrawerCompactDefault
                    ? "mt-0.5 origin-top overflow-hidden rounded-lg border border-white/8 bg-black/10 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]"
                    : "origin-top overflow-hidden rounded-[22px] border border-white/10 bg-[#07080A]/92 shadow-[0_25px_45px_-25px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm"
                }
                layout={
                  !isDrawerCompactDefault && !prefersReducedMotion
                    ? "size"
                    : undefined
                }
                {...(isDrawerCompactDefault
                  ? drawerCompactMeasuredDetailMotionProps
                  : detailMotionProps)}
              >
                <motion.div
                  ref={
                    isDrawerCompactDefault
                      ? drawerCompactDropdownContentRef
                      : undefined
                  }
                  variants={
                    isDrawerCompactDefault || prefersReducedMotion
                      ? undefined
                      : detailContentVariant
                  }
                  initial={
                    isDrawerCompactDefault || prefersReducedMotion
                      ? undefined
                      : "hidden"
                  }
                  animate={
                    isDrawerCompactDefault || prefersReducedMotion
                      ? undefined
                      : "visible"
                  }
                  exit={
                    isDrawerCompactDefault || prefersReducedMotion
                      ? undefined
                      : "exit"
                  }
                  {...(isDrawerCompactDefault
                    ? drawerCompactMeasuredContentMotionProps
                    : {})}
                >
                  <ProjectRowTaskInteractionsProvider
                    value={{
                      goalId: goal.id,
                      onTaskEditOpen,
                      onTaskToggleCompletion,
                    }}
                  >
                    <ProjectsDropdown
                      id={`goal-${goal.id}`}
                      goalTitle={goal.title}
                      projects={goal.projects}
                      loading={loading}
                      onProjectLongPress={handleProjectLongPress}
                      onProjectUpdated={onProjectUpdated}
                      goalId={goal.id}
                      projectTasksOnly={projectDropdownMode === "tasks-only"}
                      onAddProject={handleAddProject}
                      addingProject={addingProject}
                      onTaskToggleCompletion={onTaskToggleCompletion}
                    />
                  </ProjectRowTaskInteractionsProvider>
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>
      {!onProjectEditOpen ? (
        <ProjectQuickEditDialog
          project={editingProject}
          goalId={goal.id}
          origin={editingProjectOrigin}
          onClose={closeProjectEditor}
          onUpdated={(projectId, updates) => {
            onProjectUpdated?.(projectId, updates);
          }}
          onDeleted={(projectId) => onProjectDeleted?.(projectId)}
        />
      ) : null}
    </>
  );
}

type CompactProjectsOverlayProps = {
  goal: Goal;
  loading: boolean;
  onClose: () => void;
  onProjectLongPress: (
    project: Project,
    origin: ProjectCardMorphOrigin | null
  ) => void;
  onProjectEditRequest?: (
    project: Project,
    origin: ProjectCardMorphOrigin | null
  ) => void;
  onProjectUpdated?: (projectId: string, updates: Partial<Project>) => void;
  projectDropdownMode?: "default" | "tasks-only";
  goalId: string;
  onAddProject: () => void;
  addingProject: boolean;
  onEdit?: () => void;
  hideGoalEditAction?: boolean;
  onTaskEditOpen?: (
    task: Task,
    project: Project,
    origin: ProjectCardMorphOrigin | null
  ) => void;
  onTaskToggleCompletion?: (
    goalId: string,
    projectId: string,
    taskId: string,
    currentCompletedAt: string | null
  ) => void;
};

function CompactProjectsOverlay({
  goal,
  loading,
  onClose,
  onProjectLongPress,
  onProjectEditRequest,
  onProjectUpdated,
  projectDropdownMode = "default",
  goalId,
  onAddProject,
  addingProject,
  onEdit,
  hideGoalEditAction = false,
  onTaskEditOpen,
  onTaskToggleCompletion,
}: CompactProjectsOverlayProps) {
  const [mounted, setMounted] = useState(false);
  const prefersReducedMotion = useReducedMotion();

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

  const regionId = `goal-${goal.id}`;
  const headingId = `${regionId}-overlay-title`;
  const isMobile =
    typeof window !== "undefined" ? window.innerWidth < 640 : true;
  const computedMaxWidth =
    typeof window !== "undefined"
      ? Math.min(window.innerWidth - (isMobile ? 32 : 48), isMobile ? 384 : 576)
      : isMobile
        ? 384
        : 576;
  const goalBadge =
    typeof goal.emoji === "string" && goal.emoji.trim().length
      ? goal.emoji.trim()
      : typeof goal.monumentEmoji === "string" &&
          goal.monumentEmoji.trim().length
        ? goal.monumentEmoji.trim()
        : goal.title.slice(0, 2).toUpperCase();
  const firstProject = goal.projects[0];
  const drawerSubtitle =
    projectDropdownMode === "tasks-only"
      ? firstProject
        ? `${firstProject.tasks.length} ${
            firstProject.tasks.length === 1 ? "task" : "tasks"
          }`
        : "Project tasks"
      : `${goal.projects.length} ${
          goal.projects.length === 1 ? "project" : "projects"
        }`;
  const showProjectEditAction = projectDropdownMode === "tasks-only";
  const showGoalEditAction =
    projectDropdownMode !== "tasks-only" && !hideGoalEditAction && Boolean(onEdit);
  const showActionMenu = showProjectEditAction || showGoalEditAction;

  const headerContent = (
    <div className="flex items-start justify-between gap-2 sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-2 sm:gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base font-semibold text-white sm:h-9 sm:w-9 sm:text-lg">
          {projectDropdownMode === "tasks-only" && firstProject?.emoji
            ? firstProject.emoji
            : goalBadge}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:gap-1">
          <h4
            id={headingId}
            className="text-[15px] font-semibold leading-tight text-white sm:text-base"
          >
            {projectDropdownMode === "tasks-only" && firstProject
              ? firstProject.name
              : goal.title}
          </h4>
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/60 sm:text-[11px] sm:tracking-[0.32em]">
            {drawerSubtitle}
          </p>
        </div>
      </div>
      {showActionMenu ? (
        <div className="relative shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Goal actions"
                className="rounded-md p-1.5 text-white/58 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
              >
                <MoreVertical aria-hidden="true" className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="z-[80] min-w-36 rounded-xl border border-white/10 bg-[#090A0C] p-1.5 text-white shadow-[0_18px_44px_rgba(0,0,0,0.5)]"
            >
              {showProjectEditAction ? (
                <DropdownMenuItem
                  className="rounded-lg px-2.5 py-2 text-[12px] font-medium text-white/82 outline-none transition focus:bg-white/[0.07] focus:text-white data-[highlighted]:bg-white/[0.07] data-[highlighted]:text-white"
                  onSelect={() => {
                    if (firstProject) {
                      if (onProjectEditRequest) {
                        onProjectEditRequest(firstProject, null);
                        onClose();
                        return;
                      }
                      onProjectLongPress(firstProject, null);
                    }
                  }}
                >
                  Edit Project
                </DropdownMenuItem>
              ) : null}
              {showGoalEditAction ? (
                <DropdownMenuItem
                  className="rounded-lg px-2.5 py-2 text-[12px] font-medium text-white/82 outline-none transition focus:bg-white/[0.07] focus:text-white data-[highlighted]:bg-white/[0.07] data-[highlighted]:text-white"
                  onSelect={() => {
                    onEdit?.();
                  }}
                >
                  Edit Goal
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </div>
  );

  const header = <div className="px-5 py-4">{headerContent}</div>;

  const listArea = (
    <div className="flex min-h-0 flex-1 flex-col px-3 pb-4 sm:px-5">
      <div className="min-h-0 flex-1 overflow-y-auto pb-1 sm:pb-1.5">
        <ProjectRowTaskInteractionsProvider
          value={{ goalId, onTaskEditOpen, onTaskToggleCompletion }}
        >
          <ProjectsDropdown
            id={regionId}
            goalTitle={goal.title}
            projects={goal.projects}
            loading={loading}
            onProjectLongPress={onProjectLongPress}
            onProjectUpdated={onProjectUpdated}
            projectTasksOnly={projectDropdownMode === "tasks-only"}
            goalId={goalId}
            onAddProject={onAddProject}
            addingProject={addingProject}
            onTaskToggleCompletion={onTaskToggleCompletion}
          />
        </ProjectRowTaskInteractionsProvider>
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
        aria-label="Close projects overlay"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.14 }}
      />
      <div
        className={`fixed inset-0 z-[70] flex items-center justify-center ${isMobile ? "px-4 py-10" : "px-6 py-12"}`}
        onClick={onClose}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          onClick={(event) => event.stopPropagation()}
          className={`w-full ${isMobile ? "max-w-sm" : "max-w-xl"} ${basePanelClass}`}
          style={computedMaxWidth ? { maxWidth: computedMaxWidth } : undefined}
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.985 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.99 }}
          transition={{ duration: prefersReducedMotion ? 0.12 : 0.18, ease: "easeOut" }}
        >
          <motion.div
            className="flex max-h-[calc(100vh-3rem)] flex-col sm:max-h-[calc(100vh-6rem)]"
            variants={prefersReducedMotion ? undefined : detailContentVariant}
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

export const GoalCard = memo(GoalCardImpl, (prev, next) => {
  const a = prev.goal;
  const b = next.goal;
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.progress === b.progress &&
    a.active === b.active &&
    a.status === b.status &&
    (a.weight ?? 0) === (b.weight ?? 0) &&
    a.projects.length === b.projects.length &&
    getProjectCompletionSignature(a.projects) ===
      getProjectCompletionSignature(b.projects) &&
    prev.showWeight === next.showWeight &&
    prev.showCreatedAt === next.showCreatedAt &&
    prev.showEmojiPrefix === next.showEmojiPrefix &&
    prev.hideEnergyPill === next.hideEnergyPill &&
    prev.hideGoalEditAction === next.hideGoalEditAction &&
    prev.variant === next.variant &&
    prev.open === next.open &&
    prev.onManualComplete === next.onManualComplete &&
    prev.completeWhenProjectsDone === next.completeWhenProjectsDone &&
    prev.completionTheme === next.completionTheme &&
    prev.suppressReadyToast === next.suppressReadyToast
  );
});

export default GoalCard;
