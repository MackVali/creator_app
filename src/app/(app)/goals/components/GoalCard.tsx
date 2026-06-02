"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import dynamic from "next/dynamic";
import { ChevronDown, MoreHorizontal, Sparkles } from "lucide-react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Goal, Project, Task } from "../types";
import {
  ProjectRowTaskInteractionsProvider,
  type ProjectCardMorphOrigin,
} from "./ProjectRow";
import type { FabEditTarget } from "@/components/ui/Fab";
import { normalizeGoalStatus } from "@/lib/goals/status";
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
  showWeight?: boolean;
  showCreatedAt?: boolean;
  showEmojiPrefix?: boolean;
  hideEnergyPill?: boolean;
  monumentContext?: boolean;
  variant?: "default" | "compact";
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
  completeWhenProjectsDone?: boolean;
  completionTheme?: "auto" | "emerald" | "monument" | "border";
}

function isProjectComplete(project: Project) {
  return (
    project.status === "Done" ||
    project.stage === "RELEASE" ||
    Number(project.progress ?? 0) >= 100
  );
}

const shellSpringTransition = {
  type: "spring",
  stiffness: 580,
  damping: 29,
  mass: 0.7,
} as const;

const detailRevealVariant = {
  hidden: { opacity: 0, height: 0, y: 6 },
  visible: {
    opacity: 1,
    height: "auto",
    y: 0,
    transition: {
      duration: 0.24,
      ease: [0.22, 1, 0.36, 1],
    },
  },
  exit: {
    opacity: 0,
    height: 0,
    y: 4,
    transition: { duration: 0.22, ease: "easeOut" },
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
  showWeight = true,
  showCreatedAt = true,
  showEmojiPrefix = false,
  hideEnergyPill = false,
  variant = "default",
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
  completeWhenProjectsDone = false,
  completionTheme = "auto",
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
  const handleShellClick = useCallback(() => {
    if (onCardClick) {
      onCardClick();
      return;
    }
    toggle();
  }, [onCardClick, toggle]);
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

  const handleAddProject = useCallback(async (originRect?: DOMRect) => {
    if (addingProject) return;
    setAddingProject(true);
    try {
      if (projectDropdownMode === "tasks-only") {
        await onAddTask?.(goal.id);
        return;
      }
      fabCreation?.requestProjectCreation(goal.id, originRect ?? null);
    } finally {
      setAddingProject(false);
    }
  }, [addingProject, fabCreation, goal.id, onAddTask, projectDropdownMode]);

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

  const closeProjectEditor = useCallback(() => {
    setEditingProject(null);
    setEditingProjectOrigin(null);
  }, []);

  const energy = energyAccent[goal.energy];
  const normalizedStatus = normalizeGoalStatus(goal.status, goal.active);
  const allProjectsCompleted =
    goal.projects.length > 0 && goal.projects.every(isProjectComplete);
  const isCompleted =
    normalizedStatus === "COMPLETED" ||
    (completeWhenProjectsDone && allProjectsCompleted);
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
      : resolvedCompletionTheme === "monument"
      ? variant === "compact"
        ? "border border-white/10 bg-white/[0.04] text-white/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),_0_4px_10px_rgba(0,0,0,0.45)] opacity-85"
        : "monument-completed"
      : variant === "compact"
        ? "emerald-completed-compact"
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
  const detailMotionProps = prefersReducedMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.12 },
      }
    : {
        variants: detailRevealVariant,
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
            <div className="relative z-0 flex h-full min-w-0 flex-col items-stretch">
              <motion.button
                type="button"
                onClick={handleShellClick}
                aria-expanded={onCardClick ? undefined : open}
                aria-controls={onCardClick ? undefined : `goal-${goal.id}`}
                onPointerDown={startProjectLongPress}
                onPointerUp={handleProjectPointerUp}
                onPointerCancel={handleProjectPointerCancel}
                onPointerLeave={handleProjectPointerCancel}
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
                    onProjectUpdated={onProjectUpdated}
                    projectDropdownMode={projectDropdownMode}
                    goalId={goal.id}
                    onAddProject={handleAddProject}
                    addingProject={addingProject}
                    onEdit={onEdit}
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
          <div className="relative z-0 flex h-full min-w-0 flex-col items-stretch">
            <motion.button
              type="button"
              onClick={handleShellClick}
              aria-expanded={onCardClick ? undefined : open}
              aria-controls={onCardClick ? undefined : `goal-${goal.id}`}
              onPointerDown={startProjectLongPress}
              onPointerUp={handleProjectPointerUp}
              onPointerCancel={handleProjectPointerCancel}
              onPointerLeave={handleProjectPointerCancel}
              className="flex flex-1 flex-col items-center gap-1 min-w-0 text-center"
              {...shellMotionProps}
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-base font-semibold shadow-[inset_0_-1px_0_rgba(255,255,255,0.06),_0_6px_12px_rgba(0,0,0,0.35)] ${completedIconClass}`}
              >
                {goal.emoji ?? goal.monumentEmoji ?? goal.title.slice(0, 2)}
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
                className="mt-1 h-[14px] w-full overflow-hidden rounded-[999px] border-2 border-[#0f1115] bg-[#1b1e24]"
                style={{
                  boxShadow:
                    "inset 0 2px 3px rgba(0,0,0,0.6), 0 1px 2px rgba(255,255,255,0.08)",
                }}
              >
                <div
                  className="h-full rounded-[999px]"
                  style={progressBarStyle}
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
                  onProjectUpdated={onProjectUpdated}
                  projectDropdownMode={projectDropdownMode}
                  goalId={goal.id}
                  onAddProject={handleAddProject}
                  addingProject={addingProject}
                  onEdit={onEdit}
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
    "group relative mb-2.5 h-full overflow-hidden rounded-xl goal-card p-2.5 text-white transition-[background-color,border-color,box-shadow] duration-200 sm:mb-3 sm:p-3",
    completedClass,
  ]
    .filter(Boolean)
    .join(" ");
  const shellStateClass = open
    ? isCompleted && !isBorderOnlyCompleted
      ? "border border-emerald-300/55 shadow-[0_24px_44px_-28px_rgba(16,185,129,0.48),inset_0_1px_0_rgba(255,255,255,0.07)]"
      : "border border-white/16 bg-white/[0.04] shadow-[0_24px_44px_-28px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.06)]"
    : isCompleted && !isBorderOnlyCompleted
      ? "border border-emerald-400/28 shadow-[0_16px_28px_-24px_rgba(16,185,129,0.32),inset_0_1px_0_rgba(255,255,255,0.04)]"
      : "border border-transparent shadow-[0_12px_24px_-24px_rgba(0,0,0,0.7)]";

  return (
    <>
      <motion.div
        layout={!prefersReducedMotion}
        transition={prefersReducedMotion ? { duration: 0.12 } : shellSpringTransition}
        className={`${defaultContainerClass} ${shellStateClass}`}
      >
        <div className="relative flex h-full flex-col gap-1.5 sm:gap-2">
          <div className="flex items-start justify-between gap-2">
            <motion.button
              onClick={handleShellClick}
              aria-expanded={onCardClick ? undefined : open}
              aria-controls={onCardClick ? undefined : `goal-${goal.id}`}
              onPointerDown={startProjectLongPress}
              onPointerUp={handleProjectPointerUp}
              onPointerCancel={handleProjectPointerCancel}
              onPointerLeave={handleProjectPointerCancel}
              className="relative flex flex-1 flex-col gap-1 text-left overflow-hidden sm:gap-1.5"
              {...shellMotionProps}
            >
              <div className="relative z-10 flex items-start gap-2">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-lg font-semibold sm:h-10 sm:w-10 sm:rounded-2xl sm:text-xl ${completedIconClass}`}
                >
                  {goal.emoji ?? goal.monumentEmoji ?? goal.title.slice(0, 2)}
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-1 text-[9px] uppercase tracking-[0.14em] sm:gap-1.5 sm:text-[10px] sm:tracking-[0.18em]">
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
                    className="mt-0.5 text-[17px] font-semibold leading-tight sm:mt-1 sm:text-lg"
                  >
                    {showEmojiPrefix && (goal.emoji ?? goal.monumentEmoji) ? (
                      <span className="mr-2 inline" aria-hidden>
                        {goal.emoji ?? goal.monumentEmoji}
                      </span>
                    ) : null}
                    {goal.title}
                  </h3>
                  {goal.why && (
                    <p className="mt-0.5 line-clamp-1 text-[13px] leading-4 text-white/65 sm:line-clamp-2 sm:text-sm sm:leading-5">
                      {goal.why}
                    </p>
                  )}
                </div>
                <ChevronDown
                  className={`mt-0.5 h-4 w-4 text-white/60 sm:mt-1 sm:h-5 sm:w-5 ${
                    open ? "rotate-180" : ""
                  }`}
                />
              </div>
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
              {!open && (
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
                aria-label="Goal actions"
                className="rounded-full border border-white/10 bg-white/10 p-1 text-white/70 hover:bg-white/20 sm:p-1.5"
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
                <MoreHorizontal className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
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
                      console.log("🎯 Edit button clicked");
                      document
                        .getElementById(`dropdown-${goal.id}`)
                        ?.classList.add("hidden");
                      onEdit?.();
                    }}
                  >
                    Edit
                  </button>
                  {normalizedStatus !== "COMPLETED" ? (
                    <button
                      className="block w-full px-4 py-2 text-left text-sm text-white hover:bg-white/10"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        console.log("🎯 Toggle active button clicked");
                        document
                          .getElementById(`dropdown-${goal.id}`)
                          ?.classList.add("hidden");
                        onToggleActive?.();
                      }}
                    >
                      {normalizedStatus === "ACTIVE"
                        ? "Pause Goal"
                        : "Resume Goal"}
                    </button>
                  ) : null}
                  <button
                    className="block w-full px-4 py-2 text-left text-sm text-rose-400 hover:bg-white/10"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      console.log("🎯 Delete button clicked");
                      document
                        .getElementById(`dropdown-${goal.id}`)
                        ?.classList.add("hidden");
                      onDelete?.();
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {open ? (
              <motion.div
                className="origin-top overflow-hidden rounded-xl border border-white/8 bg-white/[0.025] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                {...detailMotionProps}
              >
                <motion.div
                  variants={prefersReducedMotion ? undefined : detailContentVariant}
                  initial={prefersReducedMotion ? false : "hidden"}
                  animate={prefersReducedMotion ? undefined : "visible"}
                  exit={prefersReducedMotion ? undefined : "exit"}
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
  onProjectUpdated?: (projectId: string, updates: Partial<Project>) => void;
  projectDropdownMode?: "default" | "tasks-only";
  goalId: string;
  onAddProject: () => void;
  addingProject: boolean;
  onEdit?: () => void;
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
  onProjectUpdated,
  projectDropdownMode = "default",
  goalId,
  onAddProject,
  addingProject,
  onEdit,
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

  const header = (
    <div className="flex items-center justify-between px-5 py-4">
      <h4
        id={headingId}
        className="text-xs font-semibold uppercase tracking-[0.28em] text-white/70"
      >
        {goal.title}
      </h4>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Goal actions"
              className="rounded-full border border-white/15 bg-white/10 p-1.5 text-white/70"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[80]">
            <DropdownMenuItem
              onSelect={() => {
                if (projectDropdownMode === "tasks-only") {
                  const firstProject = goal.projects[0];
                  if (firstProject) {
                    onProjectLongPress(firstProject, null);
                  }
                  return;
                }
                onEdit?.();
              }}
            >
              {projectDropdownMode === "tasks-only" ? "EDIT PROJECT" : "EDIT GOAL"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/80"
        >
          Close
        </button>
      </div>
    </div>
  );

  const listContent = (
    <div className="max-h-[60vh] overflow-y-auto px-3 pb-4 sm:max-h-[70vh] sm:px-5">
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
  );

  const basePanelClass =
    "overflow-hidden rounded-2xl border border-white/10 bg-[#07080A]/95 shadow-[0_25px_50px_-20px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.05)]";

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
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          className={`w-full ${isMobile ? "max-w-sm" : "max-w-xl"} ${basePanelClass}`}
          style={computedMaxWidth ? { maxWidth: computedMaxWidth } : undefined}
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.985 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.99 }}
          transition={{ duration: prefersReducedMotion ? 0.12 : 0.18, ease: "easeOut" }}
        >
          <motion.div
            variants={prefersReducedMotion ? undefined : detailContentVariant}
            initial={prefersReducedMotion ? false : "hidden"}
            animate={prefersReducedMotion ? undefined : "visible"}
            exit={prefersReducedMotion ? undefined : "exit"}
          >
            {header}
            {listContent}
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
    prev.showWeight === next.showWeight &&
    prev.showCreatedAt === next.showCreatedAt &&
    prev.showEmojiPrefix === next.showEmojiPrefix &&
    prev.hideEnergyPill === next.hideEnergyPill &&
    prev.variant === next.variant &&
    prev.open === next.open &&
    prev.completeWhenProjectsDone === next.completeWhenProjectsDone &&
    prev.completionTheme === next.completionTheme
  );
});

export default GoalCard;
