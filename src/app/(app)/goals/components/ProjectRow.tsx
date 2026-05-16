"use client";

import type React from "react";
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
  const hasTasks = project.tasks.length > 0;
  const [open, setOpen] = useState(hasTasks);
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

  const primaryTextClass = isCompleted ? "text-emerald-50" : "text-white";
  const secondaryTextClass = isCompleted ? "text-emerald-100/80" : "text-white/60";
  const accentTextClass = isCompleted ? "text-emerald-100/75" : "text-white/70";
  const tertiaryTextClass = isCompleted ? "text-emerald-100/65" : "text-white/50";
  const chevronColorClass = isCompleted ? "text-emerald-100/70" : "text-white/60";
  const overlayGlowClass = isCompleted
    ? "bg-[radial-gradient(120%_70%_at_50%_0%,rgba(52,211,153,0.35),transparent_55%)]"
    : "bg-[radial-gradient(120%_70%_at_50%_0%,rgba(255,255,255,0.10),transparent_60%)]";
  const cardSurfaceClass = isCompleted
    ? "ring-1 ring-emerald-300/60 bg-[linear-gradient(135deg,_rgba(6,78,59,0.96)_0%,_rgba(4,120,87,0.94)_42%,_rgba(16,185,129,0.9)_100%)] shadow-[0_22px_42px_rgba(4,47,39,0.55)]"
    : "ring-1 ring-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.02] shadow-[0_12px_28px_-18px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.06)]";
  const tasksPanelClass = isCompleted
    ? "border-emerald-100/24 bg-emerald-950/35 ring-emerald-200/20 text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-12px_18px_rgba(2,44,34,0.22)]"
    : "border-white/10 bg-[#030407] ring-white/10 text-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_-12px_18px_rgba(0,0,0,0.18)]";
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
        className={`relative rounded-2xl p-4 transition-transform select-none ${cardSurfaceClass} ${primaryTextClass} ${
          completionPending ? "opacity-70" : ""
        }`}
        style={cardAnimationStyle}
      >
        <div
          className={`pointer-events-none absolute inset-0 rounded-2xl [mask-image:linear-gradient(to_bottom,black,transparent_75%)] ${overlayGlowClass}`}
        />
        <div
          className={`relative z-0 flex w-full items-center gap-3 text-sm select-none ${primaryTextClass}`}
        >
          <button
            onClick={handleClick}
            type="button"
            className={`flex min-w-0 flex-1 items-center justify-between text-left select-none ${primaryTextClass}`}
            aria-disabled={completionPending}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          >
            <div className={`flex min-w-0 items-center gap-3 ${primaryTextClass}`}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-base font-semibold shadow-[inset_0_-1px_0_rgba(255,255,255,0.05)]">
                {displayEmoji}
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-semibold leading-tight">{project.name}</span>
                <div className={`flex items-center gap-1.5 text-[11px] ${secondaryTextClass}`}>
                  <FlameEmber level={flameLevel} size="xs" />
                  <span className="uppercase tracking-[0.2em]">{project.energy}</span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <p className={`text-[11px] ${accentTextClass}`}>{project.progress}%</p>
              {project.dueDate && (
                <span className={`text-xs ${secondaryTextClass}`}>
                  {new Date(project.dueDate).toLocaleDateString()}
                </span>
              )}
            </div>
          </button>
          {hasTasks && (
            <button
              type="button"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:outline-none ${chevronColorClass}`}
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
        </div>
        {hasTasks && (
          <div
            id={`project-${project.id}`}
            className={`relative mt-3 overflow-hidden rounded-[16px] border ring-1 transition-all duration-200 ${
              open ? "max-h-72 p-2" : "max-h-0 border-transparent p-0"
            } ${tasksPanelClass}`}
          >
            {open && (
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
                          taskCompleted
                            ? completedTaskRowClass
                            : incompleteTaskRowClass
                        }`}
                        role="listitem"
                        onPointerDown={handleTaskPointerDown}
                        onPointerUp={(event) => handleTaskPointerUp(event, task)}
                        onPointerCancel={handleTaskPointerCancel}
                        onClick={(event) => handleTaskClick(event, task)}
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
