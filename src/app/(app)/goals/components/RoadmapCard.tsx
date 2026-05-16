"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, GripVertical } from "lucide-react";
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
import type { Roadmap } from "@/lib/queries/roadmaps";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { FabEditTarget } from "@/components/ui/Fab";
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";
import {
  getGoalStatusLabel,
  normalizeGoalStatus,
} from "@/lib/goals/status";

import type { Goal } from "../types";
import { GoalCard } from "./GoalCard";
import type { ProjectCardMorphOrigin } from "./ProjectRow";

const formatPriorityLabel = (priority: Goal["priority"]) =>
  priority === "Ultra-Critical" ? "Ultra" : priority;

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

const closeGoalDetailAfterFabOpen = (closeGoalDetail: () => void) => {
  if (typeof window === "undefined") {
    closeGoalDetail();
    return;
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(closeGoalDetail);
  });
};

function DraggableGoalCard({
  goal,
  index,
  isOpen,
  onOpenChange,
  onGoalEdit,
  onGoalToggleActive,
  onGoalDelete,
  onProjectEditOpen,
  monumentContext,
}: {
  goal: Goal;
  index: number;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onGoalEdit?: (goal: Goal) => void;
  onGoalToggleActive?: (goal: Goal) => void;
  onGoalDelete?: (goal: Goal) => void;
  onProjectEditOpen?: (
    target: FabEditTarget,
    projectId: string,
    goalId: string,
    origin: ProjectCardMorphOrigin | null
  ) => void;
  monumentContext?: boolean;
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

  // Debug logging for drag start
  useEffect(() => {
    if (isDragging) {
      console.log(`🎯 Drag started for goal: ${goal.id}`);
    }
  }, [isDragging, goal.id]);

  const displayEmoji =
    typeof (goal.emoji ?? goal.monumentEmoji) === "string" &&
    (goal.emoji ?? goal.monumentEmoji)?.trim().length
      ? (goal.emoji ?? goal.monumentEmoji)!.trim()
      : goal.title.slice(0, 2).toUpperCase();
  const flameLevel = (goal.energyCode ? goal.energyCode : goal.energy ?? "No")
    .toString()
    .toUpperCase() as FlameLevel;
  const allProjectsCompleted =
    goal.projects.length > 0 &&
    goal.projects.every(
      (project) =>
        project.status === "Done" ||
        project.stage === "RELEASE" ||
        Number(project.progress ?? 0) >= 100
    );
  const normalizedStatus = normalizeGoalStatus(goal.status, goal.active);
  const isCompleted = normalizedStatus === "COMPLETED" || allProjectsCompleted;
  const statusLabel = isCompleted
    ? "Completed"
    : getGoalStatusLabel(normalizedStatus);
  const cardSurfaceClass = isCompleted
    ? "border border-emerald-400/60 bg-[linear-gradient(135deg,_rgba(6,78,59,0.96)_0%,_rgba(4,120,87,0.94)_42%,_rgba(16,185,129,0.9)_100%)] shadow-[0_18px_38px_-24px_rgba(4,47,39,0.8),inset_0_1px_0_rgba(255,255,255,0.12)] ring-1 ring-emerald-300/50"
    : "ring-1 ring-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.02] shadow-[0_12px_28px_-18px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.06)]";
  const overlayGlowClass =
    isCompleted
      ? "bg-[radial-gradient(120%_70%_at_50%_0%,rgba(255,255,255,0.18),transparent_60%)]"
      : "bg-[radial-gradient(120%_70%_at_50%_0%,rgba(255,255,255,0.10),transparent_60%)]";
  const shellMotionProps = prefersReducedMotion
    ? {}
    : {
        whileTap: { scale: 0.97, y: 1 },
        transition: cardSpringTransition,
      };
  const handleGoalEdit = useCallback(() => {
    if (!onGoalEdit) return;
    onGoalEdit(goal);
    closeGoalDetailAfterFabOpen(() => onOpenChange?.(false));
  }, [goal, onGoalEdit, onOpenChange]);

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
      {...attributes}
    >
      {/* Drag Handle */}
      <div className="absolute left-1 top-1.5 z-10 flex items-center gap-1 sm:top-2 sm:gap-1.5">
        <span className="min-w-[2ch] select-none text-[13px] font-black text-white/55 sm:text-base">
          {index + 1}.
        </span>
        <button
          type="button"
          className="flex h-4 w-4 items-center justify-center rounded-md transition-colors hover:bg-white/10 cursor-grab active:cursor-grabbing sm:h-[18px] sm:w-[18px]"
          {...listeners}
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-2.5 w-2.5 text-white/60 sm:h-3 sm:w-3" />
        </button>
      </div>

      {/* Goal Card with inline expansion */}
      <div className="ml-6 sm:ml-8">
        {isOpen ? (
          <GoalCard
            goal={goal}
            showWeight={false}
            showCreatedAt={false}
            showEmojiPrefix
            variant="default"
            open={true}
            onOpenChange={onOpenChange}
            onEdit={onGoalEdit ? handleGoalEdit : undefined}
            onToggleActive={
              onGoalToggleActive ? () => onGoalToggleActive(goal) : undefined
            }
            onDelete={onGoalDelete ? () => onGoalDelete(goal) : undefined}
            onProjectEditOpen={
              onProjectEditOpen
                ? (target, project, origin) =>
                    onProjectEditOpen(target, project.id, goal.id, origin)
                : undefined
            }
            monumentContext={monumentContext}
            completeWhenProjectsDone
            completionTheme="emerald"
          />
        ) : (
          <motion.button
            type="button"
            onClick={() => onOpenChange?.(true)}
            className={`relative flex w-full items-start gap-2 rounded-[20px] px-2.5 py-2 text-left text-white transition-all hover:-translate-y-0.5 hover:ring-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 sm:gap-2.5 sm:rounded-[22px] sm:px-3 sm:py-2.5 ${cardSurfaceClass}`}
            {...shellMotionProps}
          >
            <div
              className={`pointer-events-none absolute inset-0 rounded-2xl [mask-image:linear-gradient(to_bottom,black,transparent_75%)] ${overlayGlowClass}`}
            />
            <div
              className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-semibold shadow-[inset_0_-1px_0_rgba(255,255,255,0.05)] sm:h-8 sm:w-8 sm:text-[11px] ${
                isCompleted
                  ? "border border-emerald-300/60 bg-emerald-950/40 text-emerald-50"
                  : "border border-white/10 bg-white/5"
              }`}
            >
              {displayEmoji}
            </div>
            <div className="relative z-10 flex min-w-0 flex-1 flex-col gap-0.5 pr-0.5 sm:pr-1">
              <p className="line-clamp-1 break-words text-[11px] font-semibold leading-[0.95rem] text-white sm:line-clamp-2 sm:text-[13px] sm:leading-[1rem]">
                {typeof (goal.emoji ?? goal.monumentEmoji) === "string" &&
                (goal.emoji ?? goal.monumentEmoji)?.trim().length ? (
                  <span className="mr-2 inline" aria-hidden>
                    {(goal.emoji ?? goal.monumentEmoji)?.trim()}
                  </span>
                ) : null}
                {goal.title}
              </p>
              <div
                className={`flex flex-wrap items-center gap-1 text-[9px] sm:gap-1.5 sm:text-[10px] ${
                  isCompleted ? "text-emerald-50/80" : "text-white/60"
                }`}
              >
                <FlameEmber level={flameLevel} size="xs" />
                <span className="uppercase tracking-[0.16em] sm:tracking-[0.24em]">{goal.energy}</span>
                <span className="text-white/30">•</span>
                <span className="uppercase tracking-[0.16em] sm:tracking-[0.24em]">
                  {formatPriorityLabel(goal.priority)}
                </span>
                {goal.dueDate && (
                  <>
                    <span className="text-white/30">•</span>
                    <span className="whitespace-nowrap text-[8px] text-white/60 normal-case sm:text-[9px]">
                      Due {new Date(goal.dueDate).toLocaleDateString()}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="relative z-10 flex shrink-0 flex-col items-end gap-0 whitespace-nowrap pt-0.5 text-right text-[9px] sm:gap-0.5 sm:text-[10px]">
              <span className="text-[12px] font-semibold text-white sm:text-[13px]">
                {Math.round(Math.min(100, goal.progress))}%
              </span>
              <span
                className={`text-[9px] uppercase tracking-[0.16em] sm:text-[10px] sm:tracking-[0.24em] ${
                  isCompleted ? "text-emerald-50/80" : "text-white/70"
                }`}
              >
                {statusLabel}
              </span>
            </div>
          </motion.button>
        )}
      </div>
    </div>
  );
}

interface RoadmapCardProps {
  roadmap: Roadmap;
  goalCount: number;
  goals: Goal[];
  onClick?(): void;
  variant?: "default" | "compact";
  onGoalEdit?: (goal: Goal) => void;
  onGoalToggleActive?: (goal: Goal) => void;
  onGoalDelete?: (goal: Goal) => void;
  onRoadmapOrderSaved?: () => void | Promise<void>;
  onProjectEditOpen?: (
    target: FabEditTarget,
    projectId: string,
    goalId: string,
    origin: ProjectCardMorphOrigin | null
  ) => void;
  monumentContext?: boolean;
}

function RoadmapCardImpl({
  roadmap,
  goalCount,
  goals,
  onClick,
  variant = "default",
  onGoalEdit,
  onGoalToggleActive,
  onGoalDelete,
  onProjectEditOpen,
  monumentContext = false,
  onRoadmapOrderSaved,
}: RoadmapCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [openGoalId, setOpenGoalId] = useState<string | null>(null);
  const [localGoals, setLocalGoals] = useState(goals);

  useEffect(() => {
    // Sort goals by priority_rank if available, otherwise maintain original order
    const sortedGoals = [...goals].sort((a, b) => {
      const aRank = a.priorityRank;
      const bRank = b.priorityRank;

      // If both have priority_rank, sort by it
      if (aRank !== undefined && bRank !== undefined) {
        return aRank - bRank;
      }

      // If only one has priority_rank, prioritize the one that has it
      if (aRank !== undefined && bRank === undefined) {
        return -1;
      }
      if (bRank !== undefined && aRank === undefined) {
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

  const savePriorityRanks = useCallback(
    async (goalsToSave: Goal[]) => {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;

      try {
        const orderedGoalIds = goalsToSave.map((goal) => goal.id);
        const { error } = await supabase.rpc("save_roadmap_goal_order", {
          p_roadmap_id: roadmap.id,
          p_goal_ids: orderedGoalIds,
        });

        if (error) {
          console.error("Failed to save roadmap goal order:", error);
        }
      } catch (error) {
        console.error("Failed to save priority ranks:", error);
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
        await savePriorityRanks(updatedGoals);
        await onRoadmapOrderSaved?.();
      }
    },
    [localGoals, savePriorityRanks, onRoadmapOrderSaved]
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
              <CompactGoalsOverlay
                roadmap={roadmap}
                goals={localGoals}
                onClose={handleToggle}
                onGoalEdit={onGoalEdit}
                onGoalToggleActive={onGoalToggleActive}
                onGoalDelete={onGoalDelete}
                onProjectEditOpen={onProjectEditOpen}
                monumentContext={monumentContext}
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

  return (
    <div className="group relative h-full rounded-[24px] border-2 border-amber-500 bg-white/[0.03] p-2.5 text-white transition hover:-translate-y-1 hover:border-amber-500/50 sm:rounded-[30px] sm:p-4">
      <div className="relative flex h-full flex-col gap-2.5 sm:gap-4">
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
              className="flex-1 origin-top rounded-[18px] border border-white/8 border-t-white/15 bg-white/[0.015] shadow-[0_20px_32px_-24px_rgba(0,0,0,0.8)] sm:rounded-[24px] sm:border-white/10 sm:border-t-white/20 sm:bg-white/[0.02]"
              {...revealProps}
            >
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
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                      }}
                    >
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
                            onProjectEditOpen={onProjectEditOpen}
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
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

type CompactGoalsOverlayProps = {
  roadmap: Roadmap;
  goals: Goal[];
  onClose: () => void;
  onGoalEdit?: (goal: Goal) => void;
  onGoalToggleActive?: (goal: Goal) => void;
  onGoalDelete?: (goal: Goal) => void;
  onProjectEditOpen?: (
    target: FabEditTarget,
    projectId: string,
    goalId: string,
    origin: ProjectCardMorphOrigin | null
  ) => void;
  monumentContext?: boolean;
  onGoalsReordered?: (goals: Goal[]) => void | Promise<void>;
};

function CompactGoalsOverlay({
  roadmap,
  goals,
  onClose,
  onGoalEdit,
  onGoalToggleActive,
  onGoalDelete,
  onProjectEditOpen,
  monumentContext,
  onGoalsReordered,
}: CompactGoalsOverlayProps) {
  const [mounted, setMounted] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const [localGoals, setLocalGoals] = useState(goals);
  const [openGoalId, setOpenGoalId] = useState<string | null>(null);
  const selectedGoal = useMemo(
    () => localGoals.find((goal) => goal.id === openGoalId) ?? null,
    [localGoals, openGoalId]
  );


  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 10,
      },
    })
  );

  const savePriorityRanks = useCallback(
    async (goalsToSave: Goal[]) => {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;

      try {
        const orderedGoalIds = goalsToSave.map((goal) => goal.id);
        const { error } = await supabase.rpc("save_roadmap_goal_order", {
          p_roadmap_id: roadmap.id,
          p_goal_ids: orderedGoalIds,
        });

        if (error) {
          console.error("Failed to save roadmap goal order:", error);
        }
      } catch (error) {
        console.error("Failed to save priority ranks:", error);
      }
    },
    [roadmap.id]
  );

  useEffect(() => {
    setLocalGoals(goals);
  }, [goals]);

  useEffect(() => {
    if (!openGoalId) return;
    if (!localGoals.some((goal) => goal.id === openGoalId)) {
      setOpenGoalId(null);
    }
  }, [localGoals, openGoalId]);

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

  const handleSelectedGoalEdit = useCallback(() => {
    if (!selectedGoal || !onGoalEdit) return;
    onGoalEdit(selectedGoal);
    closeGoalDetailAfterFabOpen(() => setOpenGoalId(null));
  }, [onGoalEdit, selectedGoal]);

  if (typeof document === "undefined" || !mounted) return null;

  const regionId = `roadmap-${roadmap.id}`;
  const headingId = `${regionId}-overlay-title`;
  const isMobile =
    typeof window !== "undefined" ? window.innerWidth < 640 : true;
  const computedMaxWidth =
    typeof window !== "undefined"
      ? Math.min(window.innerWidth - (isMobile ? 16 : 48), isMobile ? window.innerWidth - 16 : 576)
      : isMobile
        ? 384
        : 576;

  const emojiBadge = roadmap.emoji ?? roadmap.title.slice(0, 2);
  const goalsLabel = `${goals.length} ${goals.length === 1 ? "goal" : "goals"}`;

  const header = (
    <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-2 sm:gap-4 sm:pb-3">
      <div className="flex min-w-0 items-start gap-2 sm:gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/15 bg-white/[0.08] text-base font-semibold text-white shadow-[inset_0_-1px_0_rgba(255,255,255,0.2)] sm:h-9 sm:w-9 sm:rounded-2xl sm:text-lg">
          {emojiBadge}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5 sm:gap-1">
          <h4
            id={headingId}
            className="text-[15px] font-semibold leading-tight text-white sm:text-base"
          >
            {roadmap.title}
          </h4>
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/60 sm:text-[11px] sm:tracking-[0.32em]">
            {goalsLabel}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="self-start rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-white/70 transition hover:border-white/30 hover:text-white sm:px-3 sm:py-1 sm:text-[10px] sm:tracking-[0.2em]"
      >
        Close
      </button>
    </div>
  );

  const listArea = (
    <div className="mt-2.5 max-h-[60vh] overflow-y-auto pb-1.5 sm:mt-4 sm:pb-3 sm:max-h-[70vh]">
      {selectedGoal ? (
        <GoalCard
          goal={selectedGoal}
          variant="default"
          showWeight={false}
          showCreatedAt={false}
          showEmojiPrefix={false}
          open={true}
          onOpenChange={(isOpen) => {
            if (!isOpen) setOpenGoalId(null);
          }}
          onEdit={onGoalEdit ? handleSelectedGoalEdit : undefined}
          onToggleActive={
            onGoalToggleActive
              ? () => onGoalToggleActive(selectedGoal)
              : undefined
          }
          onDelete={
            onGoalDelete
              ? () => onGoalDelete(selectedGoal)
              : undefined
          }
          onProjectEditOpen={
            onProjectEditOpen
              ? (target, project, origin) =>
                  onProjectEditOpen(target, project.id, selectedGoal.id, origin)
              : undefined
          }
          completeWhenProjectsDone
          completionTheme="emerald"
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(event) => {
            console.log("🎯 Drag started:", event.active.id);
          }}
          onDragEnd={async (event) => {
            console.log("🎯 Drag ended:", event);
            const { active, over } = event;
            if (over && active.id !== over.id) {
              const oldIndex = localGoals.findIndex((g) => g.id === active.id);
              const newIndex = localGoals.findIndex((g) => g.id === over.id);
              console.log(`Moving from index ${oldIndex} to ${newIndex}`);
              const reordered = arrayMove(localGoals, oldIndex, newIndex).map(
                (goal, index) => ({
                  ...goal,
                  priorityRank: index + 1,
                })
              );
              setLocalGoals(reordered);
              await savePriorityRanks(reordered);
              await onGoalsReordered?.(reordered);
            }
          }}
        >
          <SortableContext items={localGoals.map((g) => g.id)}>
            <div className="flex flex-col gap-1.5 sm:gap-3">
              {localGoals.map((goal, index) => (
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
                  onGoalEdit={onGoalEdit}
                  onGoalToggleActive={onGoalToggleActive}
                  onGoalDelete={onGoalDelete}
                  onProjectEditOpen={onProjectEditOpen}
                  monumentContext={monumentContext}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );

  const panelPadding = "p-1.5 sm:p-5";
  const basePanelClass =
    "relative w-full max-w-full overflow-hidden rounded-[24px] border border-white/12 bg-black/[0.64] shadow-[0_25px_45px_-25px_rgba(0,0,0,0.9)] backdrop-blur-sm text-white/90 sm:rounded-[30px] sm:border-white/15 sm:bg-black/[0.68]";
  const goalCardContent = selectedGoal ? (
    <GoalCard
      goal={selectedGoal}
      variant="default"
      showWeight={false}
      showCreatedAt={false}
      showEmojiPrefix={false}
      open={true}
      onOpenChange={(isOpen) => {
        if (!isOpen) setOpenGoalId(null);
      }}
      onProjectEditOpen={
        onProjectEditOpen
          ? (target, project, origin) =>
              onProjectEditOpen(target, project.id, selectedGoal.id, origin)
          : undefined
      }
      monumentContext={monumentContext}
      completeWhenProjectsDone
      completionTheme="emerald"
    />
  ) : null;

  return createPortal(
    <>
      <motion.button
        type="button"
        className={`fixed inset-0 z-[60] ${isMobile ? "bg-black/70" : "bg-black/50"}`}
        aria-label="Close goals overlay"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.14 }}
      />
      <div
        className={`fixed inset-0 z-[70] flex items-center justify-center ${isMobile ? "px-1.5 py-6" : "px-6 py-12"}`}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          className={`w-full ${isMobile ? "max-w-full" : "max-w-xl"} ${basePanelClass} ${panelPadding}`}
          style={computedMaxWidth ? { maxWidth: computedMaxWidth } : undefined}
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.985 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.99 }}
          transition={{ duration: prefersReducedMotion ? 0.12 : 0.18, ease: "easeOut" }}
        >
          <motion.div
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
      {goalCardContent}
    </>,
    document.body
  );
}

export const RoadmapCard = memo(RoadmapCardImpl, (prev, next) => {
  return (
    prev.roadmap.id === next.roadmap.id &&
    prev.roadmap.title === next.roadmap.title &&
    prev.goalCount === next.goalCount &&
    prev.variant === next.variant &&
    prev.goals === next.goals &&
    prev.monumentContext === next.monumentContext &&
    prev.onProjectEditOpen === next.onProjectEditOpen &&
    prev.onRoadmapOrderSaved === next.onRoadmapOrderSaved
  );
});

export default RoadmapCard;
