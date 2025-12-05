"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
  type MouseEvent,
} from "react";
import dynamic from "next/dynamic";
import { ChevronDown, MoreHorizontal, Sparkles } from "lucide-react";
import { createPortal } from "react-dom";
import type { Goal, Project } from "../types";
import type { ProjectCardMorphOrigin } from "./ProjectRow";
// Lazy-load dropdown contents to reduce initial bundle and re-render cost
const ProjectsDropdown = dynamic(() => import("./ProjectsDropdown").then(m => m.ProjectsDropdown), {
  ssr: false,
  loading: () => (
    <div className="h-24 w-full animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
  ),
});
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";
import { ProjectQuickEditDialog } from "./ProjectQuickEditDialog";

const energyAccent: Record<
  Goal["energy"],
  { dot: string; bar: string }
> = {
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
  showWeight?: boolean;
  showCreatedAt?: boolean;
  showEmojiPrefix?: boolean;
  variant?: "default" | "compact";
  onProjectUpdated?: (projectId: string, updates: Partial<Project>) => void;
  onProjectDeleted?: (projectId: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  projectDropdownMode?: "default" | "tasks-only";
  onTaskToggleCompletion?: (
    goalId: string,
    projectId: string,
    taskId: string,
    currentStage: string
  ) => void;
  onProjectHoldComplete?: (
    goalId: string,
    projectId: string,
    stage: string
  ) => void;
}

function GoalCardImpl({
  goal,
  onEdit,
  onToggleActive,
  onDelete,
  onBoost,
  showWeight = true,
  showCreatedAt = true,
  showEmojiPrefix = false,
  variant = "default",
  onProjectUpdated,
  onProjectDeleted,
  open: openProp,
  onOpenChange,
  projectDropdownMode = "default",
  onTaskToggleCompletion,
  onProjectHoldComplete,
}: GoalCardProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof openProp === "boolean";
  const open = isControlled ? (openProp as boolean) : internalOpen;
  const [loading] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingProjectOrigin, setEditingProjectOrigin] = useState<ProjectCardMorphOrigin | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [overlayRect, setOverlayRect] = useState<DOMRect | null>(null);

  const updateOverlayRect = useCallback(() => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setOverlayRect(rect);
  }, []);

  useLayoutEffect(() => {
    if (open) {
      updateOverlayRect();
    } else {
      setOverlayRect(null);
    }
  }, [open, updateOverlayRect]);

  useEffect(() => {
    if (!open) return;
    const handler = () => updateOverlayRect();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [open, updateOverlayRect]);

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
  const projectLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectLongPressTriggeredRef = useRef(false);
  const [isHolding, setIsHolding] = useState(false);
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
    setIsHolding(true);
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
      setIsHolding(false);
    },
    [cancelProjectLongPress]
  );
  const handleProjectPointerCancel = useCallback(() => {
    cancelProjectLongPress();
    projectLongPressTriggeredRef.current = false;
    setIsHolding(false);
  }, [cancelProjectLongPress]);

  const handleProjectLongPress = useCallback((project: Project, origin: ProjectCardMorphOrigin | null) => {
    setEditingProjectOrigin(origin ?? null);
    setEditingProject(project);
  }, []);

  const closeProjectEditor = useCallback(() => {
    setEditingProject(null);
    setEditingProjectOrigin(null);
  }, []);

  const energy = energyAccent[goal.energy];
  const isCompleted = goal.progress >= 100 || goal.status === "Completed";
  const completionGradient =
    "linear-gradient(135deg,rgba(6,78,59,0.96) 0%,rgba(4,120,87,0.94) 42%,rgba(16,185,129,0.9) 100%)";
  const progressBarStyle = {
    width: `${goal.progress}%`,
    backgroundImage: isCompleted ? completionGradient : energy.bar,
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

  // Compact tile for dense mobile grids
  if (variant === "compact") {
    const energy = energyAccent[goal.energy];
    const progressPct = Math.max(0, Math.min(100, Number(goal.progress ?? 0)));
    const lightness = Math.round(88 - progressPct * 0.78); // 0% -> 88% (light gray), 100% -> ~10% (near black)
    const containerBase =
      "group relative h-full rounded-2xl ring-1 ring-white/10 p-3 text-white min-h-[96px]";
    const completedBg =
      "bg-[linear-gradient(135deg,_rgba(6,78,59,0.96)_0%,_rgba(4,120,87,0.94)_42%,_rgba(16,185,129,0.9)_100%)] text-white shadow-[0_22px_42px_rgba(4,47,39,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] ring-emerald-300/60";
    const inProgressBg =
      "bg-gradient-to-b from-white/[0.03] to-white/[0.015] shadow-[0_10px_26px_-14px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.06)]";
    const containerClass = `${containerBase} ${isCompleted ? completedBg : inProgressBg} aspect-[5/6]`;
    return (
      <>
      <div
        ref={cardRef}
        className={containerClass}
        data-variant="compact"
        data-build-tag="gc-test-01"
      >
        {/* Subtle top sheen + edge glow */}
        <div className="pointer-events-none absolute inset-0 rounded-2xl [mask-image:linear-gradient(to_bottom,black,transparent_70%)] bg-[radial-gradient(120%_70%_at_50%_0%,rgba(255,255,255,0.10),transparent_60%)]" />
        <div className="relative z-0 flex h-full min-w-0 flex-col items-stretch">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={`goal-${goal.id}`}
            onPointerDown={startProjectLongPress}
            onPointerUp={handleProjectPointerUp}
            onPointerCancel={handleProjectPointerCancel}
            onPointerLeave={handleProjectPointerCancel}
            className="flex flex-1 flex-col items-center gap-1 min-w-0 text-center"
          >
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-base font-semibold shadow-[inset_0_-1px_0_rgba(255,255,255,0.06),_0_6px_12px_rgba(0,0,0,0.35)] ${
                isCompleted ? "bg-black text-white" : "bg-white/5 text-white"
              }`}
            >
              {goal.monumentEmoji ?? goal.emoji ?? goal.title.slice(0, 2)}
            </div>
            <h3
              id={`goal-${goal.id}-label`}
              className="max-w-full px-1 text-center text-[8px] leading-snug font-semibold line-clamp-2 break-words min-h-[2.4em]"
              title={goal.title}
              style={{ hyphens: "auto" }}
            >
              {goal.title}
            </h3>
            <div className="mt-1 h-[0.65rem] w-full overflow-hidden rounded-full bg-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
              <div
                className="h-full rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.25)]"
                style={progressBarStyle}
              />
            </div>
          </button>

          {open && (
          <CompactProjectsOverlay
            goal={goal}
            loading={loading}
            onClose={toggle}
          onProjectLongPress={handleProjectLongPress}
          onProjectUpdated={onProjectUpdated}
          anchorRect={overlayRect}
          projectDropdownMode={projectDropdownMode}
          goalId={goal.id}
          onEdit={onEdit}
          onTaskToggleCompletion={onTaskToggleCompletion}
        />
          )}
        </div>
      </div>
          <ProjectQuickEditDialog
            project={editingProject}
            origin={editingProjectOrigin}
            onClose={closeProjectEditor}
            onUpdated={(projectId, updates) =>
              onProjectUpdated?.(projectId, updates)
            }
            onDeleted={(projectId) => onProjectDeleted?.(projectId)}
          />
      </>
    );
  }

  return (
    <>
      <div className="group relative h-full rounded-[30px] border border-white/10 bg-white/[0.03] p-4 text-white transition hover:-translate-y-1 hover:border-white/30">
        <div className="relative flex h-full flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
          <button
            onClick={toggle}
            aria-expanded={open}
            aria-controls={`goal-${goal.id}`}
            onPointerDown={startProjectLongPress}
            onPointerUp={handleProjectPointerUp}
            onPointerCancel={handleProjectPointerCancel}
            onPointerLeave={handleProjectPointerCancel}
            className="relative flex flex-1 flex-col gap-2 text-left overflow-hidden"
          >
            <div
              className="pointer-events-none absolute inset-0 transition-[height] duration-500"
              style={{
                height: isCompleted || isHolding ? "100%" : "0%",
                backgroundImage: completionGradient,
                transformOrigin: "bottom",
                zIndex: 0,
              }}
            />
            <div className="relative z-10 flex items-start gap-3">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 text-xl font-semibold ${
                  isCompleted ? "bg-black text-white" : "bg-white/5 text-white"
                }`}
              >
                {goal.monumentEmoji ?? goal.emoji ?? goal.title.slice(0, 2)}
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em]">
                  <span className="flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-white/80">
                    <FlameEmber
                      level={goal.energy.toUpperCase() as FlameLevel}
                      size="xs"
                    />
                    <span className="text-[10px] uppercase tracking-[0.2em]">
                      {goal.energy}
                    </span>
                  </span>
                  {showWeight ? (
                    <span className="rounded-full border border-white/20 px-2 py-0.5 text-white/70">
                      wt {goal.weight ?? 0}
                    </span>
                  ) : null}
                </div>
                <h3 id={`goal-${goal.id}-label`} className="mt-2 text-xl font-semibold">
                  {showEmojiPrefix && (goal.monumentEmoji ?? goal.emoji) ? (
                    <span className="mr-2 inline" aria-hidden>
                      {goal.monumentEmoji ?? goal.emoji}
                    </span>
                  ) : null}
                  {goal.title}
                </h3>
                {goal.why && (
                  <p className="mt-1 text-sm text-white/65 line-clamp-2">{goal.why}</p>
                )}
              </div>
              <ChevronDown
                className={`mt-1 h-5 w-5 text-white/60 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
              <div className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1">
                <span className={`h-1.5 w-1.5 rounded-full ${energy.dot}`} aria-hidden="true" />
                <span>{goal.projects.length} projects</span>
              </div>
              {goal.dueDate && (
                <span className="rounded-full border border-white/10 px-3 py-1">
                  Due {new Date(goal.dueDate).toLocaleDateString()}
                </span>
              )}
              {etaDisplay && (
                <span className="relative flex items-center gap-2 rounded-full border border-fuchsia-400/40 bg-gradient-to-r from-fuchsia-500/15 via-rose-500/10 to-amber-500/15 px-3 py-1 text-white shadow-[0_6px_18px_rgba(236,72,153,0.35)]">
                  <span className="flex items-center gap-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.3em] text-white/70">
                    <Sparkles className="h-3 w-3 text-amber-100" aria-hidden="true" />
                    ETA
                  </span>
                  <span className="text-sm font-semibold tracking-tight text-white">
                    {etaDisplay}
                  </span>
                </span>
              )}
              {createdAt && showCreatedAt && (
                <span className="rounded-full border border-white/10 px-3 py-1 text-white/60">
                  Created {createdAt}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.25em] text-white/50">
                <span>Progress</span>
                <span>{goal.progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full" style={progressBarStyle} />
              </div>
            </div>
            {onBoost && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onBoost();
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-gradient-to-r from-red-600 to-rose-500 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white shadow-[0_8px_20px_-10px_rgba(239,68,68,0.6)] transition hover:scale-[1.02]"
                >
                  Boost +250
                </button>
              </div>
            )}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Goal actions"
                  className="rounded-full border border-white/10 bg-white/10 p-1.5 text-white/70 transition hover:border-white/40 hover:text-white"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onEdit?.()}>Edit</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onToggleActive?.()}>
                  {goal.active ? "Mark Inactive" : "Mark Active"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-rose-500 focus:text-rose-400"
                  onSelect={() => onDelete?.()}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {open && (
          <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-[#030303] via-[#080808] to-[#1b1b1b] shadow-[0_35px_45px_-20px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.02)]">
              <ProjectsDropdown
                id={`goal-${goal.id}`}
                goalTitle={goal.title}
                projects={goal.projects}
                loading={loading}
                onProjectLongPress={handleProjectLongPress}
                onProjectUpdated={onProjectUpdated}
                goalId={goal.id}
                projectTasksOnly={projectDropdownMode === "tasks-only"}
                onTaskToggleCompletion={onTaskToggleCompletion}
              />
            </div>
          )}
        </div>
      </div>
      <ProjectQuickEditDialog
        project={editingProject}
        origin={editingProjectOrigin}
        onClose={closeProjectEditor}
        onUpdated={(projectId, updates) => {
          onProjectUpdated?.(projectId, updates);
        }}
        onDeleted={(projectId) => onProjectDeleted?.(projectId)}
      />
    </>
  );
}

type CompactProjectsOverlayProps = {
  goal: Goal;
  loading: boolean;
  onClose: () => void;
  anchorRect: DOMRect | null;
  onProjectLongPress: (project: Project, origin: ProjectCardMorphOrigin | null) => void;
  onProjectUpdated?: (projectId: string, updates: Partial<Project>) => void;
  projectDropdownMode?: "default" | "tasks-only";
  goalId: string;
  onEdit?: () => void;
  onTaskToggleCompletion?: (
    goalId: string,
    projectId: string,
    taskId: string,
    currentStage: string
  ) => void;
};

function CompactProjectsOverlay({
  goal,
  loading,
  onClose,
  anchorRect,
  onProjectLongPress,
  onProjectUpdated,
  projectDropdownMode = "default",
  goalId,
  onEdit,
  onTaskToggleCompletion,
}: CompactProjectsOverlayProps) {
  const [mounted, setMounted] = useState(false);

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
  const isMobile = typeof window !== "undefined" ? window.innerWidth < 640 : true;
  const computedMaxWidth = anchorRect
    ? Math.min(640, Math.max(anchorRect.width + 64, 300))
    : undefined;

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
              className="rounded-full border border-white/15 bg-white/10 p-1.5 text-white/70 transition hover:border-white/40 hover:text-white"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[80]">
            <DropdownMenuItem
              onSelect={() => {
                onEdit?.();
              }}
            >
              EDIT GOAL
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/80 transition hover:border-white/30 hover:text-white"
        >
          Close
        </button>
      </div>
    </div>
  );

  const listContent = (
      <div className="max-h-[60vh] overflow-y-auto px-3 pb-4 sm:max-h-[70vh] sm:px-5">
        <ProjectsDropdown
          id={regionId}
          goalTitle={goal.title}
          projects={goal.projects}
          loading={loading}
          onProjectLongPress={onProjectLongPress}
          onProjectUpdated={onProjectUpdated}
          projectTasksOnly={projectDropdownMode === "tasks-only"}
          goalId={goalId}
          onTaskToggleCompletion={onTaskToggleCompletion}
        />
      </div>
  );

  const basePanelClass =
    "overflow-hidden rounded-2xl border border-white/15 bg-black shadow-[0_25px_50px_-20px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.05)]";

  if (isMobile || !anchorRect) {
    return createPortal(
      <>
        <button
          type="button"
          className="fixed inset-0 z-[60] bg-black/70"
          aria-label="Close projects overlay"
          onClick={onClose}
        />
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-10">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            className={`w-full max-w-sm ${basePanelClass}`}
            style={computedMaxWidth ? { maxWidth: computedMaxWidth } : undefined}
          >
            {header}
            {listContent}
          </div>
        </div>
      </>,
      document.body,
    );
  }

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] bg-black/50"
        aria-label="Close projects overlay"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[70] flex items-center justify-center px-6 py-12">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          className={`w-full max-w-xl ${basePanelClass}`}
          style={computedMaxWidth ? { maxWidth: computedMaxWidth } : undefined}
        >
          {header}
          {listContent}
        </div>
      </div>
    </>,
    document.body,
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
    prev.variant === next.variant &&
    prev.open === next.open
  );
});

export default GoalCard;
