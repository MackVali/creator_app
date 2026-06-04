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
import { getSupabaseBrowser } from "@/lib/supabase";
import { recordProjectCompletion } from "@/lib/projects/projectCompletion";

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

const MAX_VISIBLE_TASKS = 12;
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
  const prefersReducedMotion = useReducedMotion();
  const isCompactNested = variant === "compactNested";
  const hasTasks = project.tasks.length > 0;
  const [open, setOpen] = useState(() => (isCompactNested ? false : hasTasks));
  const toggle = useCallback(() => {
    if (!hasTasks) return;
    setOpen((o) => !o);
  }, [hasTasks]);
  const [isBouncing, setIsBouncing] = useState(false);
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
    },
    []
  );

  const [visibleTasks, hiddenCount] = useMemo(() => {
    const slice = project.tasks.slice(0, MAX_VISIBLE_TASKS);
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

    const shouldComplete = localStatus !== "Done";
    const fallbackStage = localStage && localStage !== "RELEASE" ? localStage : lastActiveStage;
    const nextStage = shouldComplete ? "RELEASE" : fallbackStage || "BUILD";
    const completedAt = shouldComplete ? new Date().toISOString() : null;

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
    } else if (!shouldComplete && nextStage && nextStage !== "RELEASE") {
      setLastActiveStage(nextStage);
    }

    setLocalStatus(nextStatus);
    setLocalStage(nextStage);
    onUpdated?.(project.id, { status: nextStatus, stage: nextStage });
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
    project.skillIds,
    project.tasks,
  ]);

  const isCompleted = localStatus === "Done";

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
  const tertiaryTextClass = isCompleted ? "text-emerald-100/65" : "text-white/50";
  const chevronColorClass = isCompleted
    ? "text-emerald-100/70"
    : isCompactNested
      ? "text-white/45"
      : "text-white/60";
  const overlayGlowClass = isCompleted
    ? "bg-[radial-gradient(120%_70%_at_50%_0%,rgba(52,211,153,0.35),transparent_55%)]"
    : "bg-[radial-gradient(120%_70%_at_50%_0%,rgba(255,255,255,0.10),transparent_60%)]";
  const cardSurfaceClass = isCompleted
    ? "border-emerald-300/24 ring-1 ring-emerald-900/20 shadow-[0_18px_34px_rgba(2,32,24,0.52)]"
    : isCompactNested
      ? "border-white/8 bg-[linear-gradient(180deg,rgba(66,66,66,0.18)_0%,rgba(28,28,28,0.74)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-white/18 hover:bg-white/[0.04]"
      : "border-white/8 bg-[linear-gradient(180deg,rgba(66,66,66,0.22)_0%,rgba(46,46,46,0.4)_22%,rgba(28,28,28,0.92)_100%)] ring-1 ring-white/8 shadow-[inset_2px_0_0_rgba(255,255,255,0.08),inset_0_1px_0_rgba(255,255,255,0.03),inset_0_-10px_16px_rgba(0,0,0,0.14)]";
  const tasksPanelClass = isCompleted
    ? "border-emerald-100/24 bg-emerald-950/35 ring-emerald-200/20 text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-12px_18px_rgba(2,44,34,0.22)]"
    : "border-white/10 bg-[#030407] ring-white/10 text-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_-12px_18px_rgba(0,0,0,0.18)]";
  const metaPillClass = isCompactNested
    ? "border-white/10 bg-black/35 text-white/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    : isCompleted
      ? "border-emerald-50/24 bg-emerald-950/14 text-emerald-50/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
      : "border-white/8 bg-white/[0.03] text-white/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";
  const identityClass = isCompactNested
    ? "rounded-lg border-white/12 bg-black/35 text-white/82 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_-1px_0_rgba(0,0,0,0.22)]"
    : isCompleted
      ? "rounded-md border-emerald-50/28 bg-emerald-950/18 text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] sm:rounded-lg"
      : "rounded-md border-white/12 bg-black/25 text-white/82 shadow-[inset_0_-1px_0_rgba(255,255,255,0.03)] sm:rounded-lg";
  const completedTaskRowClass =
    "border-emerald-300/60 bg-[linear-gradient(135deg,rgba(6,78,59,0.96)_0%,rgba(4,120,87,0.9)_48%,rgba(16,185,129,0.84)_100%)] text-emerald-50 ring-1 ring-emerald-200/30 shadow-[0_12px_26px_-16px_rgba(16,185,129,0.72),0_0_22px_rgba(16,185,129,0.14),inset_2px_0_0_rgba(209,250,229,0.24),inset_0_1px_0_rgba(255,255,255,0.14)]";
  const incompleteTaskRowClass =
    "border-white/8 bg-[linear-gradient(180deg,rgba(66,66,66,0.22)_0%,rgba(46,46,46,0.34)_24%,rgba(24,24,24,0.92)_100%)] text-white/78 shadow-[inset_2px_0_0_rgba(255,255,255,0.08),inset_0_1px_0_rgba(255,255,255,0.03)]";
  const completedTaskMarkerClass =
    "border-emerald-50/40 bg-emerald-100/22 text-white shadow-[0_0_12px_rgba(16,185,129,0.28)]";
  const incompleteTaskMarkerClass =
    "border-white/10 bg-white/[0.05] text-white/50";

  return (
    <>
      <div
        className={`relative border transition-transform select-none ${
          isCompactNested
            ? "rounded-lg px-2 py-1.5 sm:rounded-xl sm:px-2.5 sm:py-2"
            : "rounded-lg px-1.5 py-1.5 sm:px-2.5 sm:py-2"
        } ${cardSurfaceClass} ${primaryTextClass} ${
          isCompleted ? "habit-card--completed habit-card--completed-gem" : ""
        } ${completionPending ? "opacity-70" : ""}`}
        style={cardAnimationStyle}
      >
        {!isCompactNested && (
          <div
            className={`pointer-events-none absolute inset-0 rounded-lg [mask-image:linear-gradient(to_bottom,black,transparent_75%)] ${overlayGlowClass}`}
          />
        )}
        {isCompleted && (
          <span
            className="pointer-events-none absolute inset-0 rounded-[inherit] focus-pomo-start-glint"
            aria-hidden="true"
          />
        )}
        <div
          className={`relative z-[2] flex w-full items-center text-sm select-none ${
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
                className={`relative z-[3] flex h-7 w-7 shrink-0 items-center justify-center border text-[10px] font-semibold leading-none sm:h-8 sm:w-8 sm:text-[11px] ${identityClass}`}
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
                  } ${isCompactNested ? "leading-tight text-white/84" : "leading-snug"}`}
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
              className={`relative z-[3] shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] sm:px-2 sm:text-[9px] ${metaPillClass}`}
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

interface ProjectTasksListProps {
  visibleTasks: Task[];
  hiddenCount: number;
  tertiaryTextClass: string;
  completedTaskRowClass: string;
  incompleteTaskRowClass: string;
  completedTaskMarkerClass: string;
  incompleteTaskMarkerClass: string;
  onTaskPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onTaskPointerUp: (
    event: React.PointerEvent<HTMLButtonElement>,
    task: Task
  ) => void;
  onTaskPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onTaskClick: (
    event: React.MouseEvent<HTMLButtonElement>,
    task: Task
  ) => void;
}

function ProjectTasksList({
  visibleTasks,
  hiddenCount,
  tertiaryTextClass,
  completedTaskRowClass,
  incompleteTaskRowClass,
  completedTaskMarkerClass,
  incompleteTaskMarkerClass,
  onTaskPointerDown,
  onTaskPointerUp,
  onTaskPointerCancel,
  onTaskClick,
}: ProjectTasksListProps) {
  return (
    <>
      <div className="pointer-events-none absolute inset-y-3 left-2 w-px bg-white/10" />
      <div className="relative space-y-1.5" role="list">
        {visibleTasks.map((task) => {
          const taskCompleted = Boolean(task.completedAt);
          return (
            <button
              type="button"
              key={task.id}
              className={`flex w-full min-w-0 items-start gap-2 rounded-lg border px-2 py-1.5 text-left text-xs leading-4 ${
                taskCompleted ? completedTaskRowClass : incompleteTaskRowClass
              }`}
              role="listitem"
              onPointerDown={onTaskPointerDown}
              onPointerUp={(event) => onTaskPointerUp(event, task)}
              onPointerCancel={onTaskPointerCancel}
              onClick={(event) => onTaskClick(event, task)}
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold leading-none ${
                  taskCompleted
                    ? completedTaskMarkerClass
                    : incompleteTaskMarkerClass
                }`}
                aria-hidden="true"
              >
                {task.skillIcon ?? (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </span>
              <span className="min-w-0 flex-1 break-words pr-1">
                {task.name}
              </span>
              <FlameEmber
                level={energyCodeToFlameLevel(task.energyCode)}
                size="sm"
                className="shrink-0"
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
