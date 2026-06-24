"use client";

import type React from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronDown } from "lucide-react";
import type { Project, Task } from "../types";
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";
import { useToastHelpers } from "@/components/ui/toast";
import { getSupabaseBrowser } from "@/lib/supabase";
import { recordProjectCompletion } from "@/lib/projects/projectCompletion";
import {
  hapticErrorPattern,
  hapticLongPress,
} from "@/lib/haptics/creatorHaptics";

export type ProjectCardMorphOrigin = {
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius: string;
  backgroundColor?: string;
  boxShadow?: string;
  emoji?: string | null;
};

interface ProjectRowProps {
  project: Project;
  projectOrder?: number;
  variant?: "default" | "compactNested";
  goalId?: string;
  onLongPress?: (project: Project, origin: ProjectCardMorphOrigin | null) => void;
  onUpdated?: (projectId: string, updates: Partial<Project>) => void;
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
}

export const MAX_VISIBLE_PROJECT_TASKS = 12;
const LONG_PRESS_MS = 650;
const DOUBLE_TAP_MS = 325;
const SINGLE_TAP_DELAY_MS = 160;

const compactNestedTaskPanelMotion = {
  hidden: { opacity: 0, height: 0, y: -3 },
  visible: {
    opacity: 1,
    height: "auto",
    y: 0,
    transition: {
      duration: 0.48,
      ease: [0.16, 1, 0.3, 1],
    },
  },
  exit: {
    opacity: 0,
    height: 0,
    y: -2,
    transition: {
      duration: 0.38,
      ease: [0.4, 0, 0.2, 1],
    },
  },
} as const;

type ProjectRowTaskInteractions = Pick<
  ProjectRowProps,
  "goalId" | "onTaskEditOpen" | "onTaskToggleCompletion"
>;

const ProjectRowTaskInteractionsContext =
  createContext<ProjectRowTaskInteractions>({});

export const ProjectRowTaskInteractionsProvider =
  ProjectRowTaskInteractionsContext.Provider;

export function useProjectRowTaskInteractions() {
  return useContext(ProjectRowTaskInteractionsContext);
}

export function getProjectTasksListClasses(isCompleted: boolean) {
  return {
    tertiaryTextClass: isCompleted ? "text-emerald-100/65" : "text-white/50",
    tasksPanelClass: isCompleted
      ? "border-emerald-100/24 bg-emerald-950/35 ring-emerald-200/20 text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-12px_18px_rgba(2,44,34,0.22)]"
      : "border-white/10 bg-[#030407] ring-white/10 text-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_-12px_18px_rgba(0,0,0,0.18)]",
    completedTaskRowClass:
      "shimmer-border-complete focus-pomo-start-glint relative isolate z-0 overflow-hidden border-green-900/45 bg-[linear-gradient(155deg,rgba(34,197,94,0.94)_0%,rgba(22,163,74,0.97)_48%,rgba(21,128,61,0.98)_100%)] text-white ring-1 ring-green-900/45 shadow-[0_22px_38px_rgba(0,0,0,0.34),0_9px_18px_rgba(3,83,45,0.22),inset_0_1px_0_rgba(255,255,255,0.045),inset_0_-2px_8px_rgba(0,0,0,0.11),inset_0_0_0_1px_rgba(0,0,0,0.08)]",
    incompleteTaskRowClass:
      "border-white/8 bg-[linear-gradient(180deg,rgba(66,66,66,0.22)_0%,rgba(46,46,46,0.34)_24%,rgba(24,24,24,0.92)_100%)] text-white/78 shadow-[inset_2px_0_0_rgba(255,255,255,0.08),inset_0_1px_0_rgba(255,255,255,0.03)]",
    completedTaskMarkerClass:
      "isolate overflow-visible border-slate-200/18 bg-[linear-gradient(180deg,rgba(148,163,184,0.28)_0%,rgba(71,85,105,0.32)_42%,rgba(30,41,59,0.46)_100%)] text-slate-50/92 shadow-[0_8px_16px_rgba(2,6,23,0.22),inset_0_1px_0_rgba(255,255,255,0.16),inset_0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur-sm",
    incompleteTaskMarkerClass:
      "isolate overflow-visible border-slate-200/16 bg-[linear-gradient(180deg,rgba(148,163,184,0.24)_0%,rgba(71,85,105,0.28)_45%,rgba(30,41,59,0.42)_100%)] text-slate-100/88 shadow-[0_8px_16px_rgba(2,6,23,0.2),inset_0_1px_0_rgba(255,255,255,0.14),inset_0_0_0_1px_rgba(255,255,255,0.035)] backdrop-blur-sm",
  };
}

const energyCodeToFlameLevel = (value?: string | null): FlameLevel => {
  switch (value?.toUpperCase()) {
    case "LOW":
      return "LOW";
    case "MEDIUM":
      return "MEDIUM";
    case "HIGH":
      return "HIGH";
    case "ULTRA":
      return "ULTRA";
    case "EXTREME":
      return "EXTREME";
    default:
      return "NO";
  }
};

const projectStageToStatus = (stage: string): Project["status"] => {
  switch (stage) {
    case "RESEARCH":
      return "Todo";
    case "RELEASE":
      return "Done";
    default:
      return "In-Progress";
  }
};

function buildProjectOrigin(
  element: HTMLElement | null,
  project: Project
): ProjectCardMorphOrigin | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const computed = window.getComputedStyle(element);
  const radius =
    computed.borderRadius && computed.borderRadius.trim().length > 0
      ? computed.borderRadius
      : [
          computed.borderTopLeftRadius,
          computed.borderTopRightRadius,
          computed.borderBottomRightRadius,
          computed.borderBottomLeftRadius,
        ]
          .filter(Boolean)
          .join(" ") || "0px";
  const backgroundColor =
    computed.backgroundColor &&
    computed.backgroundColor !== "rgba(0, 0, 0, 0)" &&
    computed.backgroundColor.toLowerCase() !== "transparent"
      ? computed.backgroundColor
      : undefined;
  const boxShadow =
    computed.boxShadow && computed.boxShadow !== "none"
      ? computed.boxShadow
      : undefined;

  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
    borderRadius: radius,
    backgroundColor,
    boxShadow,
    emoji: project.emoji,
  };
}

export function ProjectRow({
  project,
  projectOrder,
  variant = "default",
  goalId: goalIdProp,
  onLongPress,
  onUpdated,
  onTaskEditOpen: onTaskEditOpenProp,
  onTaskToggleCompletion: onTaskToggleCompletionProp,
}: ProjectRowProps) {
  const taskInteractionContext = useContext(ProjectRowTaskInteractionsContext);
  const goalId = goalIdProp ?? taskInteractionContext.goalId;
  const onTaskEditOpen =
    onTaskEditOpenProp ?? taskInteractionContext.onTaskEditOpen;
  const onTaskToggleCompletion =
    onTaskToggleCompletionProp ??
    taskInteractionContext.onTaskToggleCompletion;
  const toast = useToastHelpers();
  const prefersReducedMotion = useReducedMotion();
  const isCompactNested = variant === "compactNested";
  const hasTasks = project.tasks.length > 0;
  const [open, setOpen] = useState(() => (isCompactNested ? false : hasTasks));
  const toggle = useCallback(() => {
    if (!hasTasks) return;
    setOpen((o) => !o);
  }, [hasTasks]);
  const [isBouncing, setIsBouncing] = useState(false);
  const [completionRejected, setCompletionRejected] = useState(false);
  const [completionPending, setCompletionPending] = useState(false);
  const [localStatus, setLocalStatus] = useState<Project["status"]>(project.status);
  const [localStage, setLocalStage] = useState(project.stage ?? "BUILD");
  const [lastActiveStage, setLastActiveStage] = useState(
    project.stage && project.stage !== "RELEASE" ? project.stage : "BUILD"
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const originElementRef = useRef<HTMLButtonElement | null>(null);
  const skipClickRef = useRef(false);
  const singleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskSingleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const lastTapTimeRef = useRef(0);
  const tapSequenceRef = useRef(0);
  const lastTaskTapRef = useRef<{ taskId: string; time: number } | null>(null);
  const lastActiveProgressRef = useRef(project.progress);
  const completionRejectedTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  useEffect(() => {
    setLocalStatus(project.status);
  }, [project.status]);

  useEffect(() => {
    if (project.stage) {
      setLocalStage(project.stage);
      if (project.stage !== "RELEASE") {
        setLastActiveStage(project.stage);
      }
    }
  }, [project.stage]);

  useEffect(() => {
    if (project.status !== "Done" && project.stage !== "RELEASE") {
      lastActiveProgressRef.current = project.progress;
    }
  }, [project.progress, project.stage, project.status]);

  useEffect(
    () => () => {
      if (singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (taskSingleTapTimeoutRef.current) {
        clearTimeout(taskSingleTapTimeoutRef.current);
      }
      if (completionRejectedTimerRef.current) {
        clearTimeout(completionRejectedTimerRef.current);
      }
    },
    []
  );

  const [visibleTasks, hiddenCount] = useMemo(() => {
    const slice = project.tasks.slice(0, MAX_VISIBLE_PROJECT_TASKS);
    return [slice, project.tasks.length - slice.length] as const;
  }, [project.tasks]);

  const triggerBounce = useCallback(() => {
    setIsBouncing(true);
    const timeout = setTimeout(() => setIsBouncing(false), 450);
    return () => clearTimeout(timeout);
  }, []);

  const cancelPendingPress = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cancelSingleTap = useCallback(() => {
    if (singleTapTimeoutRef.current) {
      clearTimeout(singleTapTimeoutRef.current);
      singleTapTimeoutRef.current = null;
    }
  }, []);

  const cancelTaskSingleTap = useCallback(() => {
    if (taskSingleTapTimeoutRef.current) {
      clearTimeout(taskSingleTapTimeoutRef.current);
      taskSingleTapTimeoutRef.current = null;
    }
  }, []);

  const rejectProjectCompletion = useCallback(() => {
    setCompletionRejected(true);
    if (completionRejectedTimerRef.current) {
      clearTimeout(completionRejectedTimerRef.current);
    }
    completionRejectedTimerRef.current = setTimeout(() => {
      completionRejectedTimerRef.current = null;
      setCompletionRejected(false);
    }, 460);
    void hapticErrorPattern();
    toast.error("Complete all tasks first");
  }, [toast]);

  const buildTaskOrigin = useCallback(
    (element: HTMLElement | null): ProjectCardMorphOrigin | null => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const computed = window.getComputedStyle(element);
      const radius =
        computed.borderRadius && computed.borderRadius.trim().length > 0
          ? computed.borderRadius
          : [
              computed.borderTopLeftRadius,
              computed.borderTopRightRadius,
              computed.borderBottomRightRadius,
              computed.borderBottomLeftRadius,
            ]
              .filter(Boolean)
              .join(" ") || "0px";
      const backgroundColor =
        computed.backgroundColor &&
        computed.backgroundColor !== "rgba(0, 0, 0, 0)" &&
        computed.backgroundColor.toLowerCase() !== "transparent"
          ? computed.backgroundColor
          : undefined;
      const boxShadow =
        computed.boxShadow && computed.boxShadow !== "none"
          ? computed.boxShadow
          : undefined;

      return {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        borderRadius: radius,
        backgroundColor,
        boxShadow,
        emoji: project.emoji,
      };
    },
    [project.emoji]
  );

  const openTaskEditor = useCallback(
    (task: Task, element: HTMLElement | null) => {
      onTaskEditOpen?.(task, project, buildTaskOrigin(element));
    },
    [buildTaskOrigin, onTaskEditOpen, project]
  );

  const handleTaskPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      cancelPendingPress();
      cancelSingleTap();
      cancelTaskSingleTap();
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
    },
    [cancelPendingPress, cancelSingleTap, cancelTaskSingleTap]
  );

  const handleTaskPointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, task: Task) => {
      event.stopPropagation();
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      const now = Date.now();
      const lastTaskTap = lastTaskTapRef.current;
      if (
        lastTaskTap?.taskId === task.id &&
        now - lastTaskTap.time <= DOUBLE_TAP_MS
      ) {
        lastTaskTapRef.current = null;
        cancelTaskSingleTap();
        event.preventDefault();
        if (goalId && onTaskToggleCompletion) {
          onTaskToggleCompletion(
            goalId,
            project.id,
            task.id,
            task.completedAt ?? null
          );
        }
        return;
      }

      lastTaskTapRef.current = { taskId: task.id, time: now };
      cancelTaskSingleTap();
      const element = event.currentTarget;
      taskSingleTapTimeoutRef.current = setTimeout(() => {
        if (lastTaskTapRef.current?.taskId !== task.id) {
          taskSingleTapTimeoutRef.current = null;
          return;
        }
        lastTaskTapRef.current = null;
        openTaskEditor(task, element);
        taskSingleTapTimeoutRef.current = null;
      }, DOUBLE_TAP_MS);
    },
    [
      cancelTaskSingleTap,
      goalId,
      onTaskToggleCompletion,
      openTaskEditor,
      project.id,
    ]
  );

  const handleTaskPointerCancel = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
    },
    []
  );

  const handleTaskClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, task: Task) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.detail === 0) {
        cancelTaskSingleTap();
        lastTaskTapRef.current = null;
        openTaskEditor(task, event.currentTarget);
      }
    },
    [cancelTaskSingleTap, openTaskEditor]
  );

  const openProjectEditor = useCallback(() => {
    if (!onLongPress) {
      toggle();
      return;
    }

    const origin = buildProjectOrigin(originElementRef.current, project);
    onLongPress(project, origin);
    originElementRef.current = null;
  }, [onLongPress, project, toggle]);

  const toggleCompletion = useCallback(async () => {
    if (completionPending) return;
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      console.warn("Supabase client not available for project completion");
      return;
    }

    const projectWithCompletion = project as Project & {
      completedAt?: string | null;
      completed_at?: string | null;
    };
    const isProjectAlreadyCompleted =
      localStatus === "Done" ||
      localStage === "RELEASE" ||
      Number(project.progress ?? 0) >= 100 ||
      Boolean(projectWithCompletion.completedAt) ||
      Boolean(projectWithCompletion.completed_at);
    const shouldComplete = !isProjectAlreadyCompleted;
    if (
      shouldComplete &&
      project.tasks.length > 0 &&
      project.tasks.some((task) => !isTaskComplete(task))
    ) {
      rejectProjectCompletion();
      return;
    }

    const fallbackStage = localStage && localStage !== "RELEASE" ? localStage : lastActiveStage;
    const nextStage = shouldComplete ? "RELEASE" : fallbackStage || "BUILD";
    const completedAt = shouldComplete ? new Date().toISOString() : null;
    const nextProgress = shouldComplete ? 100 : lastActiveProgressRef.current;

    setCompletionPending(true);
    const { error } = await supabase
      .from("projects")
      .update({ stage: nextStage, completed_at: completedAt })
      .eq("id", project.id);
    setCompletionPending(false);
    if (error) {
      console.error("Failed to toggle project completion", error);
      return;
    }

    const nextStatus = projectStageToStatus(nextStage);
    if (shouldComplete && localStage && localStage !== "RELEASE") {
      setLastActiveStage(localStage);
      lastActiveProgressRef.current = project.progress;
    } else if (!shouldComplete && nextStage && nextStage !== "RELEASE") {
      setLastActiveStage(nextStage);
    }

    setLocalStatus(nextStatus);
    setLocalStage(nextStage);
    const completionUpdates: Partial<Project> & {
      completedAt?: string | null;
      completed_at?: string | null;
    } = {
      status: nextStatus,
      stage: nextStage,
      progress: nextProgress,
      completedAt,
      completed_at: completedAt,
    };
    onUpdated?.(project.id, completionUpdates);
    if (shouldComplete) {
      void recordProjectCompletion(
        {
          projectId: project.id,
          projectSkillIds: project.skillIds,
          taskSkillIds: (project.tasks ?? []).map((task) => task.skillId),
        },
        "complete"
      );
    } else {
      void recordProjectCompletion(
        {
          projectId: project.id,
          projectSkillIds: project.skillIds,
          taskSkillIds: (project.tasks ?? []).map((task) => task.skillId),
        },
        "undo"
      );
    }
  }, [
    completionPending,
    lastActiveStage,
    localStage,
    localStatus,
    onUpdated,
    project.id,
    project.progress,
    project.skillIds,
    project.tasks,
    rejectProjectCompletion,
  ]);

  const projectWithCompletion = project as Project & {
    completedAt?: string | null;
    completed_at?: string | null;
  };
  const isCompleted =
    localStatus === "Done" ||
    localStage === "RELEASE" ||
    Number(project.progress ?? 0) >= 100 ||
    Boolean(projectWithCompletion.completedAt) ||
    Boolean(projectWithCompletion.completed_at);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!onLongPress || completionPending) return;
      originElementRef.current = event.currentTarget;
      cancelSingleTap();
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      longPressTriggeredRef.current = false;
      skipClickRef.current = false;
      cancelPendingPress();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        longPressTriggeredRef.current = true;
        skipClickRef.current = true;
        void hapticLongPress();
        triggerBounce();
        openProjectEditor();
      }, LONG_PRESS_MS);
    },
    [
      cancelPendingPress,
      cancelSingleTap,
      completionPending,
      onLongPress,
      openProjectEditor,
      triggerBounce,
    ]
  );

  const handlePointerEnd = useCallback(
    (event?: React.PointerEvent<HTMLButtonElement>) => {
      if (longPressTriggeredRef.current) {
        event?.preventDefault();
      }
      originElementRef.current = null;
      cancelPendingPress();

      if (completionPending || longPressTriggeredRef.current) {
        return;
      }

      const now = Date.now();
      if (now - lastTapTimeRef.current <= DOUBLE_TAP_MS) {
        lastTapTimeRef.current = 0;
        tapSequenceRef.current += 1;
        cancelSingleTap();
        skipClickRef.current = true;
        event?.preventDefault();
        void toggleCompletion();
        return;
      }

      lastTapTimeRef.current = now;
      tapSequenceRef.current += 1;
    },
    [cancelPendingPress, cancelSingleTap, completionPending, toggleCompletion]
  );

  const displayEmoji =
    typeof project.emoji === "string" && project.emoji.trim().length > 0
      ? project.emoji.trim()
      : project.name.slice(0, 2).toUpperCase();
  const flameLevel = (
    project.energyCode ? project.energyCode : project.energy ?? "No"
  )
    .toString()
    .toUpperCase() as FlameLevel;

  const cardAnimationStyle = isBouncing
    ? ({ animation: "project-bounce 0.45s ease" } satisfies React.CSSProperties)
    : undefined;

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (skipClickRef.current) {
        event.preventDefault();
        longPressTriggeredRef.current = false;
        skipClickRef.current = false;
        return;
      }
      if (completionPending) {
        event.preventDefault();
        return;
      }
      originElementRef.current = event.currentTarget;
      cancelSingleTap();
      const tapSequence = tapSequenceRef.current;
      singleTapTimeoutRef.current = setTimeout(() => {
        if (tapSequenceRef.current !== tapSequence) {
          singleTapTimeoutRef.current = null;
          return;
        }
        openProjectEditor();
        singleTapTimeoutRef.current = null;
      }, SINGLE_TAP_DELAY_MS);
    },
    [cancelSingleTap, completionPending, openProjectEditor]
  );

  const handleChevronPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      cancelPendingPress();
      cancelSingleTap();
    },
    [cancelPendingPress, cancelSingleTap]
  );

  const handleChevronClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      toggle();
    },
    [toggle]
  );

  const projectStatusLabel = isCompleted ? "Done" : localStatus;
  const projectEnergyLabel =
    project.energyCode?.toString().trim() || project.energy;
  const primaryTextClass = isCompleted
    ? "text-emerald-50"
    : isCompactNested
      ? "text-white/84"
      : "text-white";
  const chevronColorClass = isCompactNested
    ? isCompleted
      ? "text-emerald-100/70"
      : "text-white/45"
    : isCompleted
      ? "text-emerald-100/70"
      : "text-white/60";
  const overlayGlowClass = isCompleted
    ? "bg-[radial-gradient(120%_70%_at_50%_0%,rgba(52,211,153,0.35),transparent_55%)]"
    : "bg-[radial-gradient(120%_70%_at_50%_0%,rgba(255,255,255,0.10),transparent_60%)]";
  const cardSurfaceClass = isCompleted
    ? isCompactNested
      ? "border-emerald-400/42 bg-[linear-gradient(135deg,rgba(30,204,163,0.72)_0%,rgba(16,185,129,0.58)_48%,rgba(4,120,87,0.68)_100%)] ring-1 ring-emerald-300/36 shadow-[0_14px_26px_rgba(2,32,24,0.32),inset_0_1px_0_rgba(255,255,255,0.1)] hover:border-emerald-300/55 hover:bg-emerald-500/[0.08]"
      : "border-emerald-400/55 bg-[linear-gradient(135deg,_rgba(30,204,163,0.95)_0%,_rgba(16,185,129,0.85)_45%,_rgba(4,120,87,0.92)_100%)] ring-1 ring-emerald-300/60 shadow-[0_18px_34px_rgba(2,32,24,0.52),inset_2px_0_0_rgba(209,250,229,0.22),inset_0_1px_0_rgba(255,255,255,0.12)]"
    : isCompactNested
      ? "border-white/8 bg-[linear-gradient(180deg,rgba(66,66,66,0.18)_0%,rgba(28,28,28,0.74)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-white/18 hover:bg-white/[0.04]"
      : "border-white/8 bg-[linear-gradient(180deg,rgba(66,66,66,0.22)_0%,rgba(46,46,46,0.4)_22%,rgba(28,28,28,0.92)_100%)] ring-1 ring-white/8 shadow-[inset_2px_0_0_rgba(255,255,255,0.08),inset_0_1px_0_rgba(255,255,255,0.03),inset_0_-10px_16px_rgba(0,0,0,0.14)]";
  const metaPillClass = isCompleted
    ? isCompactNested
      ? "border-emerald-50/20 bg-emerald-950/18 text-emerald-50/86 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
      : "border-emerald-50/24 bg-emerald-950/14 text-emerald-50/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
    : isCompactNested
      ? "border-white/8 bg-white/[0.03] text-white/42"
      : "border-white/8 bg-white/[0.03] text-white/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";
  const identityClass = isCompleted
    ? isCompactNested
      ? "rounded-lg border-emerald-50/24 bg-emerald-950/18 text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
      : "rounded-md border-emerald-50/28 bg-emerald-950/18 text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] sm:rounded-lg"
    : isCompactNested
      ? "rounded-lg border-white/10 bg-white/[0.04] text-white/80 shadow-[inset_0_-1px_0_rgba(255,255,255,0.05)]"
      : "rounded-md border-white/12 bg-black/25 text-white/82 shadow-[inset_0_-1px_0_rgba(255,255,255,0.03)] sm:rounded-lg";
  const {
    tertiaryTextClass,
    tasksPanelClass,
    completedTaskRowClass,
    incompleteTaskRowClass,
    completedTaskMarkerClass,
    incompleteTaskMarkerClass,
  } = getProjectTasksListClasses(isCompleted);

  return (
    <>
      <div
        className={`relative border transition-transform select-none ${
          isCompactNested
            ? "rounded-lg px-2 py-1.5 sm:rounded-xl sm:px-2.5 sm:py-2"
            : "rounded-lg px-1.5 py-1.5 sm:px-2.5 sm:py-2"
        } ${cardSurfaceClass} ${primaryTextClass} ${
          completionPending ? "opacity-70" : ""
        } ${
          completionRejected
            ? "goal-manual-complete-reject !border-red-400/80 shadow-[0_0_0_1px_rgba(248,113,113,0.65),0_12px_28px_-22px_rgba(248,113,113,0.65)]"
            : ""
        }`}
        style={cardAnimationStyle}
      >
        {!isCompactNested && (
          <div
            className={`pointer-events-none absolute inset-0 rounded-lg [mask-image:linear-gradient(to_bottom,black,transparent_75%)] ${overlayGlowClass}`}
          />
        )}
        <div
          className={`relative z-0 flex w-full items-center text-sm select-none ${
            isCompactNested ? "gap-2 sm:gap-2.5" : "gap-1 sm:gap-2"
          } ${primaryTextClass}`}
        >
          <button
            onClick={handleClick}
            type="button"
            className={`flex min-w-0 flex-1 text-left select-none ${
              isCompactNested
                ? "items-center gap-2"
                : "flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2"
            } ${primaryTextClass}`}
            aria-disabled={completionPending}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          >
            <div
              className={`flex min-w-0 items-center gap-2 ${primaryTextClass} ${
                isCompactNested ? "flex-1" : ""
              }`}
            >
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center border text-[10px] font-semibold leading-none sm:h-8 sm:w-8 sm:text-[11px] ${identityClass}`}
              >
                {displayEmoji}
              </div>
              <div
                className={`flex min-w-0 ${
                  isCompactNested ? "flex-1" : "flex-col"
                }`}
              >
                <span
                  className={`text-[12px] font-medium sm:text-[13px] ${
                    isCompactNested ? "min-w-0 flex-1 truncate" : "line-clamp-2 sm:truncate"
                  } ${isCompactNested ? `leading-tight ${primaryTextClass}` : "leading-snug"}`}
                >
                  {project.name}
                </span>
              </div>
            </div>
            {!isCompactNested && (
              <div className="flex w-full min-w-0 flex-wrap items-center gap-1 pl-9 sm:w-auto sm:shrink-0 sm:justify-end sm:pl-0">
                {typeof projectOrder === "number" && (
                  <span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.12em] sm:px-2 sm:py-1 sm:text-[9px] sm:tracking-[0.18em] ${metaPillClass}`}>
                    #{projectOrder}
                  </span>
                )}
                <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.12em] sm:px-2 sm:py-1 sm:text-[9px] sm:tracking-[0.18em] ${metaPillClass}`}>
                  <FlameEmber level={flameLevel} size="xs" />
                  <span>{projectEnergyLabel}</span>
                </span>
                <span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.12em] sm:px-2 sm:py-1 sm:text-[9px] sm:tracking-[0.18em] ${metaPillClass}`}>
                  {projectStatusLabel}
                </span>
              </div>
            )}
          </button>
          {hasTasks && (
            <button
              type="button"
              className={`flex shrink-0 items-center justify-center rounded-md transition-colors hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:outline-none ${
                isCompactNested
                  ? "h-5 w-5 sm:h-6 sm:w-6"
                  : "h-7 w-7 sm:h-8 sm:w-8 sm:rounded-lg"
              } ${chevronColorClass}`}
              aria-expanded={open}
              aria-controls={`project-${project.id}`}
              aria-label={open ? "Collapse project tasks" : "Expand project tasks"}
              onPointerDown={handleChevronPointerDown}
              onClick={handleChevronClick}
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
          )}
          {isCompactNested && typeof projectOrder === "number" && (
            <span
              className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] sm:px-2 sm:text-[9px] ${metaPillClass}`}
            >
              {projectOrder}
            </span>
          )}
        </div>
        {hasTasks && isCompactNested && (
          <AnimatePresence initial={false}>
            {open ? (
              <motion.div
                id={`project-${project.id}`}
                className={`relative mt-1.5 overflow-hidden rounded-lg border p-2 ring-1 sm:mt-2 ${tasksPanelClass}`}
                variants={
                  prefersReducedMotion ? undefined : compactNestedTaskPanelMotion
                }
                initial={prefersReducedMotion ? { opacity: 0 } : "hidden"}
                animate={prefersReducedMotion ? { opacity: 1 } : "visible"}
                exit={prefersReducedMotion ? { opacity: 0 } : "exit"}
                transition={prefersReducedMotion ? { duration: 0.12 } : undefined}
              >
                <ProjectTasksList
                  visibleTasks={visibleTasks}
                  hiddenCount={hiddenCount}
                  tertiaryTextClass={tertiaryTextClass}
                  completedTaskRowClass={completedTaskRowClass}
                  incompleteTaskRowClass={incompleteTaskRowClass}
                  completedTaskMarkerClass={completedTaskMarkerClass}
                  incompleteTaskMarkerClass={incompleteTaskMarkerClass}
                  isTaskCompleted={isTaskComplete}
                  onTaskPointerDown={handleTaskPointerDown}
                  onTaskPointerUp={handleTaskPointerUp}
                  onTaskPointerCancel={handleTaskPointerCancel}
                  onTaskClick={handleTaskClick}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        )}
        {hasTasks && !isCompactNested && (
          <div
            id={`project-${project.id}`}
            className={`relative mt-1.5 overflow-hidden rounded-lg border ring-1 transition-all duration-200 sm:mt-2 ${
              open ? "max-h-72 p-2" : "max-h-0 border-transparent p-0"
            } ${tasksPanelClass}`}
          >
            {open && (
              <ProjectTasksList
                visibleTasks={visibleTasks}
                hiddenCount={hiddenCount}
                tertiaryTextClass={tertiaryTextClass}
                completedTaskRowClass={completedTaskRowClass}
                incompleteTaskRowClass={incompleteTaskRowClass}
                completedTaskMarkerClass={completedTaskMarkerClass}
                incompleteTaskMarkerClass={incompleteTaskMarkerClass}
                isTaskCompleted={isTaskComplete}
                onTaskPointerDown={handleTaskPointerDown}
                onTaskPointerUp={handleTaskPointerUp}
                onTaskPointerCancel={handleTaskPointerCancel}
                onTaskClick={handleTaskClick}
              />
            )}
          </div>
        )}
      </div>
      <style jsx>{`
        @keyframes project-bounce {
          0% {
            transform: scale(1);
          }
          35% {
            transform: scale(0.96);
          }
          70% {
            transform: scale(1.02);
          }
          100% {
            transform: scale(1);
          }
        }
      `}</style>
    </>
  );
}

function isTaskComplete(task: Task) {
  return Boolean(task.completedAt) || task.stage === "PERFECT";
}

export interface ProjectTasksListProps {
  visibleTasks: Task[];
  hiddenCount: number;
  tertiaryTextClass: string;
  completedTaskRowClass: string;
  incompleteTaskRowClass: string;
  completedTaskMarkerClass: string;
  incompleteTaskMarkerClass: string;
  isTaskCompleted?: (task: Task) => boolean;
  onTaskPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onTaskPointerUp: (
    event: React.PointerEvent<HTMLButtonElement>,
    task: Task
  ) => void;
  onTaskPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onTaskPointerLeave?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onTaskClick: (
    event: React.MouseEvent<HTMLButtonElement>,
    task: Task
  ) => void;
}

export function ProjectTasksList({
  visibleTasks,
  hiddenCount,
  tertiaryTextClass,
  completedTaskRowClass,
  incompleteTaskRowClass,
  completedTaskMarkerClass,
  incompleteTaskMarkerClass,
  isTaskCompleted,
  onTaskPointerDown,
  onTaskPointerUp,
  onTaskPointerCancel,
  onTaskPointerLeave,
  onTaskClick,
}: ProjectTasksListProps) {
  return (
    <>
      <div className="pointer-events-none absolute inset-y-3 left-2 w-px bg-white/10" />
      <div className="relative space-y-1.5" role="list">
        {visibleTasks.map((task) => {
          const taskCompleted = isTaskCompleted
            ? isTaskCompleted(task)
            : Boolean(task.completedAt);
          const taskSkillIcon =
            typeof task.skillIcon === "string" && task.skillIcon.trim().length > 0
              ? task.skillIcon.trim()
              : null;
          return (
            <button
              type="button"
              key={task.id}
              className={`flex w-full min-w-0 items-center gap-1.5 rounded-lg border px-1.5 py-1.5 text-left leading-4 transition sm:gap-2 sm:px-2.5 sm:py-2 ${
                taskCompleted ? completedTaskRowClass : incompleteTaskRowClass
              }`}
              role="listitem"
              onPointerDown={onTaskPointerDown}
              onPointerUp={(event) => onTaskPointerUp(event, task)}
              onPointerCancel={onTaskPointerCancel}
              onPointerLeave={onTaskPointerLeave}
              onClick={(event) => onTaskClick(event, task)}
            >
              <span
                className={`flex h-[1.625rem] w-[1.625rem] shrink-0 items-center justify-center rounded-md border text-[9px] font-semibold leading-none transition sm:h-8 sm:w-8 sm:rounded-lg sm:text-[11px] ${
                  taskCompleted
                    ? completedTaskMarkerClass
                    : incompleteTaskMarkerClass
                }`}
                aria-hidden="true"
              >
                {taskSkillIcon ?? (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </span>
              <span
                className={`min-w-0 flex-1 truncate font-medium ${
                  taskCompleted ? "text-emerald-50/92" : "text-white/82"
                } text-[11px] sm:text-[12px]`}
              >
                {task.name}
              </span>
              <FlameEmber
                level={energyCodeToFlameLevel(task.energyCode)}
                size="sm"
                className="shrink-0 self-center"
              />
            </button>
          );
        })}
        {hiddenCount > 0 && (
          <div
            className={`rounded-lg border border-white/8 bg-black/20 px-2 py-1.5 text-[11px] ${tertiaryTextClass}`}
            role="listitem"
          >
            +{hiddenCount} more tasks
          </div>
        )}
      </div>
    </>
  );
}
