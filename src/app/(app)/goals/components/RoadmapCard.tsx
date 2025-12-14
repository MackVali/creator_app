"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, GripVertical } from "lucide-react";
import { createPortal } from "react-dom";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Roadmap } from "@/lib/queries/roadmaps";
import { getSupabaseBrowser } from "@/lib/supabase";
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";

import type { Goal } from "../types";
import { GoalCard } from "./GoalCard";

interface SortableGoalItemProps {
  goal: Goal;
  index: number;
  isOpen?: boolean;
  onToggle?: () => void;
  onClick?: () => void;
}

function DraggableGoalCard({
  goal,
  index,
  isOpen,
  onOpenChange,
  onGoalEdit,
  onGoalToggleActive,
  onGoalDelete,
}: {
  goal: Goal;
  index: number;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onGoalEdit?: (goal: Goal) => void;
  onGoalToggleActive?: (goal: Goal) => void;
  onGoalDelete?: (goal: Goal) => void;
}) {
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
    typeof goal.emoji === "string" && goal.emoji.trim().length > 0
      ? goal.emoji.trim()
      : goal.title.slice(0, 2).toUpperCase();

  const flameLevel = (goal.energyCode ? goal.energyCode : goal.energy ?? "No")
    .toString()
    .toUpperCase() as FlameLevel;

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
      <div className="absolute -left-8 top-2 z-10 flex items-center gap-2">
        <span className="text-lg font-black text-white/60 min-w-[2ch] select-none">
          {index + 1}.
        </span>
        <button
          type="button"
          className="flex items-center justify-center w-5 h-5 rounded-md hover:bg-white/10 transition-colors cursor-grab active:cursor-grabbing"
          {...listeners}
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-3 h-3 text-white/60" />
        </button>
      </div>

      {/* Goal Card with inline expansion */}
      <div className="ml-6">
        {isOpen ? (
          <GoalCard
            goal={goal}
            showWeight={false}
            showCreatedAt={false}
            showEmojiPrefix={false}
            variant="default"
            open={true}
            onOpenChange={onOpenChange}
            onEdit={onGoalEdit ? () => onGoalEdit(goal) : undefined}
            onToggleActive={
              onGoalToggleActive ? () => onGoalToggleActive(goal) : undefined
            }
            onDelete={onGoalDelete ? () => onGoalDelete(goal) : undefined}
          />
        ) : (
          <button
            type="button"
            onClick={() => onOpenChange?.(true)}
            className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-white transition hover:bg-white/[0.04] text-left"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-sm font-semibold">
              {displayEmoji}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm truncate">{goal.title}</h4>
              <div className="flex items-center gap-2 mt-1">
                <FlameEmber level={flameLevel} size="xs" />
                <span className="text-xs text-white/60 uppercase tracking-wide">
                  {goal.energy}
                </span>
                <span className="text-xs text-white/70">{goal.progress}%</span>
                {goal.dueDate && (
                  <span className="text-xs text-white/60">
                    Due {new Date(goal.dueDate).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-16 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, goal.progress)}%` }}
                />
              </div>
            </div>
          </button>
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
}: RoadmapCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [openGoalId, setOpenGoalId] = useState<string | null>(null);
  const [localGoals, setLocalGoals] = useState(goals);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

  const handleGoalClick = useCallback((goalId: string) => {
    console.log("🎯 Goal clicked:", goalId);
    setOpenGoalId((current) => (current === goalId ? null : goalId));
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

      setIsSaving(true);
      try {
        // Batch update priority_rank for all goals in this roadmap
        const updates = goalsToSave.map((goal) => ({
          id: goal.id,
          priority_rank: goal.priorityRank!,
        }));

        // Update each goal sequentially
        for (const { id, priority_rank } of updates) {
          const { error } = await supabase
            .from("goals")
            .update({ priority_rank })
            .eq("id", id)
            .eq("roadmap_id", roadmap.id); // Ensure we only update goals in this roadmap

          if (error) {
            console.error(`Failed to update goal ${id}:`, error);
          }
        }

        console.log(
          `Saved priority ranks for ${updates.length} goals in roadmap ${roadmap.id}`
        );
      } catch (error) {
        console.error("Failed to save priority ranks:", error);
      } finally {
        setIsSaving(false);
      }
    },
    [roadmap.id]
  );

  const debouncedSave = useCallback(
    (goalsToSave: Goal[]) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        savePriorityRanks(goalsToSave);
      }, 1000); // Debounce for 1 second
    },
    [savePriorityRanks]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        setLocalGoals((items) => {
          const oldIndex = items.findIndex((item) => item.id === active.id);
          const newIndex = items.findIndex((item) => item.id === over.id);

          const reordered = arrayMove(items, oldIndex, newIndex);

          // Generate contiguous priority_rank values
          const updatedGoals = reordered.map((goal, index) => ({
            ...goal,
            priorityRank: index + 1,
          }));

          // Debounced save
          debouncedSave(updatedGoals);

          return updatedGoals;
        });
      }
    },
    [debouncedSave]
  );

  const hasGoals = goals.length > 0;

  if (variant === "compact") {
    const containerBase =
      "group relative h-full rounded-2xl border-2 border-yellow-400 shimmer-border p-3 text-white min-h-[96px]";
    const containerClass = `${containerBase} shadow-[0_10px_26px_-14px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.06)] aspect-[5/6]`;
    return (
      <div ref={cardRef} className={containerClass} data-variant="compact">
        <div className="pointer-events-none absolute inset-0 rounded-2xl [mask-image:linear-gradient(to_bottom,black,transparent_70%)] bg-[radial-gradient(120%_70%_at_50%_0%,rgba(255,255,255,0.10),transparent_60%)]" />
        <div className="relative z-0 flex h-full min-w-0 flex-col items-stretch">
          <button
            type="button"
            onClick={() => {
              handleToggle();
              onClick?.();
            }}
            className="flex flex-1 flex-col items-center gap-1 min-w-0 text-center"
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
          </button>

          {open && hasGoals && (
            <CompactGoalsOverlay
              roadmap={roadmap}
              goals={goals}
              onClose={handleToggle}
              anchorRect={null}
              onGoalClick={handleGoalClick}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="group relative h-full rounded-[30px] border-2 border-amber-500 bg-white/[0.03] p-4 text-white transition hover:-translate-y-1 hover:border-amber-500/50">
      <div className="relative flex h-full flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <button
            onClick={() => {
              handleToggle();
              onClick?.();
            }}
            className="relative flex flex-1 flex-col gap-2 overflow-hidden text-left"
          >
            <div className="relative z-10 flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 text-xl font-semibold bg-white/5 text-white">
                {roadmap.emoji ?? roadmap.title.slice(0, 2)}
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em]">
                  <span className="flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-white/80">
                    <span className="text-[10px] uppercase tracking-[0.2em]">
                      ROADMAP
                    </span>
                  </span>
                </div>
                <h3 className="mt-2 text-xl font-semibold">{roadmap.title}</h3>
              </div>
              <ChevronDown
                className={`mt-1 h-5 w-5 text-white/60 transition-transform ${
                  open ? "rotate-180" : ""
                }`}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
              <div className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-white/60"
                  aria-hidden="true"
                />
                <span>
                  {goalCount} {goalCount === 1 ? "goal" : "goals"}
                </span>
              </div>
            </div>
          </button>
        </div>

        {open && (
          <div className="flex-1">
            {hasGoals ? (
              <DndContext
                sensors={dragSensors}
                collisionDetection={closestCenter}
                onDragStart={(event) => {
                  console.log("🎯 Drag started:", event.active.id);
                }}
                onDragEnd={(event) => {
                  console.log("🎯 Drag ended:", event);
                  const { active, over } = event;
                  if (over && active.id !== over.id) {
                    const oldIndex = localGoals.findIndex(
                      (g) => g.id === active.id
                    );
                    const newIndex = localGoals.findIndex(
                      (g) => g.id === over.id
                    );
                    console.log(`Moving from index ${oldIndex} to ${newIndex}`);
                    const reordered = arrayMove(localGoals, oldIndex, newIndex);
                    setLocalGoals(reordered);
                  }
                }}
              >
                <SortableContext items={localGoals.map((g) => g.id)}>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
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
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/20 bg-white/[0.02] px-4 py-6 text-center text-sm text-white/60">
                No goals yet
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type CompactGoalsOverlayProps = {
  roadmap: Roadmap;
  goals: Goal[];
  onClose: () => void;
  anchorRect: DOMRect | null;
  onGoalClick?: (goalId: string) => void;
};

function CompactGoalsOverlay({
  roadmap,
  goals,
  onClose,
  anchorRect,
  onGoalClick,
}: CompactGoalsOverlayProps) {
  const [mounted, setMounted] = useState(false);
  const [localGoals, setLocalGoals] = useState(goals);
  const [openGoalId, setOpenGoalId] = useState<string | null>(null);

  const handleGoalClick = useCallback((goalId: string) => {
    setOpenGoalId((current) => (current === goalId ? null : goalId));
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 10,
      },
    })
  );

  useEffect(() => {
    setLocalGoals(goals);
  }, [goals]);

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

  const regionId = `roadmap-${roadmap.id}`;
  const headingId = `${regionId}-overlay-title`;
  const isMobile =
    typeof window !== "undefined" ? window.innerWidth < 640 : true;
  const computedMaxWidth = anchorRect
    ? Math.min(640, Math.max(anchorRect.width + 64, 300))
    : undefined;

  const header = (
    <div className="flex items-center justify-between px-5 py-4">
      <h4
        id={headingId}
        className="text-xs font-semibold uppercase tracking-[0.28em] text-white/70"
      >
        {roadmap.title}
      </h4>
      <button
        type="button"
        onClick={onClose}
        className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/80 transition hover:border-white/30 hover:text-white"
      >
        Close
      </button>
    </div>
  );

  const goalsContent = (
    <div className="max-h-[60vh] overflow-y-auto px-3 pb-4 sm:max-h-[70vh] sm:px-5">
      {openGoalId ? (
        <GoalCard
          goal={localGoals.find((g) => g.id === openGoalId)!}
          variant="default"
          showWeight={false}
          showCreatedAt={false}
          showEmojiPrefix={false}
          open={true}
          onOpenChange={(isOpen) => {
            if (!isOpen) setOpenGoalId(null);
          }}
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(event) => {
            console.log("🎯 Drag started:", event.active.id);
          }}
          onDragEnd={(event) => {
            console.log("🎯 Drag ended:", event);
            const { active, over } = event;
            if (over && active.id !== over.id) {
              const oldIndex = localGoals.findIndex((g) => g.id === active.id);
              const newIndex = localGoals.findIndex((g) => g.id === over.id);
              console.log(`Moving from index ${oldIndex} to ${newIndex}`);
              const reordered = arrayMove(localGoals, oldIndex, newIndex);
              setLocalGoals(reordered);
            }
          }}
        >
          <SortableContext items={localGoals.map((g) => g.id)}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
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
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );

  const basePanelClass =
    "overflow-hidden rounded-2xl border border-white/15 bg-black shadow-[0_25px_50px_-20px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.05)]";

  const goalCardContent = openGoalId ? (
    <GoalCard
      goal={localGoals.find((g) => g.id === openGoalId)!}
      variant="default"
      showWeight={false}
      showCreatedAt={false}
      showEmojiPrefix={false}
      open={true}
      onOpenChange={(isOpen) => {
        if (!isOpen) setOpenGoalId(null);
      }}
    />
  ) : null;

  if (isMobile || !anchorRect) {
    return createPortal(
      <>
        <button
          type="button"
          className="fixed inset-0 z-[60] bg-black/70"
          aria-label="Close goals overlay"
          onClick={onClose}
        />
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-10">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            className={`w-full max-w-sm ${basePanelClass}`}
            style={
              computedMaxWidth ? { maxWidth: computedMaxWidth } : undefined
            }
          >
            {header}
            {goalsContent}
          </div>
        </div>
        {goalCardContent}
      </>,
      document.body
    );
  }

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] bg-black/50"
        aria-label="Close goals overlay"
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
          {goalsContent}
        </div>
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
    prev.goals === next.goals
  );
});

export default RoadmapCard;
