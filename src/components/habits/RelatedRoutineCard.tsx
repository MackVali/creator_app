"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  type TouchEvent,
} from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Check, MoreVertical, Plus, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable } from "@dnd-kit/sortable";
import FlameEmber from "@/components/FlameEmber";
import { getSupabaseBrowser } from "@/lib/supabase";

export type RelatedRoutineCardHabit = {
  id: string;
  name: string;
  dueLabel?: string | null;
  skillIcon?: string | null;
  completed?: boolean;
  pending?: boolean;
  routinePosition?: number | null;
  currentStreakDays?: number | null;
};

export type RelatedRoutineCardRoutine = {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  habits: RelatedRoutineCardHabit[];
};

type RelatedRoutineCardProps = {
  routine: RelatedRoutineCardRoutine;
  density: "large" | "small";
  fallbackIcon?: string;
  onHabitCompletionToggle?: (habitId: string) => void | Promise<void>;
  onAddHabit?: (routine: RelatedRoutineCardRoutine) => void;
  restoreOpen?: boolean;
};

const DEFAULT_ROUTINE_ICON = "🔁";
const ROUTINE_HABIT_DOUBLE_TAP_MS = 350;
const ROUTINE_HABIT_COMPLETED_MOVE_DELAY_MS = 850;
const ROUTINE_HABIT_COMPLETED_COLLAPSE_MS = 320;
const routineDrawerRowTransition = {
  duration: 0.36,
  ease: [0.16, 1, 0.3, 1],
} as const;

const routineDrawerActiveHabitMotion = {
  visible: {
    opacity: 1,
    height: "auto",
    y: 0,
    transition: {
      height: routineDrawerRowTransition,
      opacity: { duration: 0.18, ease: "easeOut" },
      y: routineDrawerRowTransition,
    },
  },
  exit: {
    opacity: 0,
    height: 0,
    y: 8,
    transition: {
      height: { duration: 0.32, ease: [0.33, 0, 0.2, 1] },
      opacity: { duration: 0.2, ease: "easeOut" },
      y: { duration: 0.32, ease: [0.33, 0, 0.2, 1] },
    },
  },
} as const;

const routineDrawerCompletedHabitMotion = {
  hidden: {
    opacity: 0,
    height: 0,
    y: -6,
  },
  visible: {
    opacity: 1,
    height: "auto",
    y: 0,
    transition: {
      height: routineDrawerRowTransition,
      opacity: { duration: 0.28, ease: "easeOut", delay: 0.04 },
      y: routineDrawerRowTransition,
    },
  },
  exit: {
    opacity: 0,
    height: 0,
    y: -4,
    transition: {
      height: { duration: 0.3, ease: [0.33, 0, 0.2, 1] },
      opacity: { duration: 0.2, ease: "easeOut" },
      y: { duration: 0.3, ease: [0.33, 0, 0.2, 1] },
    },
  },
} as const;

type RoutineUpdateQuery = {
  update: (payload: { name: string; icon?: string | null }) => {
    eq: (column: string, value: string) => {
      eq: (column: string, value: string) => Promise<{ error: unknown }>;
    };
  };
};

type RoutineHabitOrderRpcClient = {
  rpc: (
    functionName: "save_routine_habit_order",
    args: { p_routine_id: string; p_habit_ids: string[] }
  ) => Promise<{ error: unknown }>;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}

function dispatchRoutineUpdated(routineId: string) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent("creator:entity-saved", {
      detail: {
        entityType: "ROUTINE",
        entityId: routineId,
        action: "updated",
      },
    })
  );
}

function readRoutinePosition(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function sortRoutineHabitsByPosition(habits: RelatedRoutineCardHabit[]) {
  return habits
    .map((habit, index) => ({ habit, index }))
    .sort((first, second) => {
      const firstPosition = readRoutinePosition(first.habit.routinePosition);
      const secondPosition = readRoutinePosition(second.habit.routinePosition);

      if (firstPosition !== null && secondPosition !== null) {
        return firstPosition - secondPosition || first.index - second.index;
      }

      if (firstPosition !== null) return -1;
      if (secondPosition !== null) return 1;
      return first.index - second.index;
    })
    .map(({ habit }, index) => ({
      ...habit,
      routinePosition: readRoutinePosition(habit.routinePosition) ?? index + 1,
    }));
}

function normalizeRoutineHabitStreakDays(value: number | null | undefined) {
  return Math.max(0, Math.round(value ?? 0));
}

function RoutineHabitRowBody({
  habit,
  onHabitCompletionToggle,
  onDoubleClick,
  onTouchEnd,
  dragHandle,
  isDragging = false,
  setNodeRef,
  style,
}: {
  habit: RelatedRoutineCardHabit;
  onHabitCompletionToggle?: (habitId: string) => void | Promise<void>;
  onDoubleClick: (
    event: MouseEvent<HTMLDivElement>,
    habit: RelatedRoutineCardHabit
  ) => void;
  onTouchEnd: (
    event: TouchEvent<HTMLDivElement>,
    habit: RelatedRoutineCardHabit
  ) => void;
  dragHandle: ReactNode;
  isDragging?: boolean;
  setNodeRef?: (node: HTMLDivElement | null) => void;
  style?: CSSProperties;
}) {
  const streakDays = normalizeRoutineHabitStreakDays(habit.currentStreakDays);
  const showStreakBadge = streakDays >= 2;
  const streakLabel = `${streakDays}x`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx("relative", isDragging ? "z-50 scale-[1.02]" : null)}
    >
      <div
        className={clsx(
          "relative flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-lg border px-2 py-1.5 text-left text-white transition hover:border-white/18 hover:bg-white/[0.04] sm:gap-2.5 sm:rounded-xl sm:px-2.5 sm:py-2",
          habit.completed
            ? "habit-card--completed habit-card--completed-gem border-emerald-300/24 shadow-[0_18px_34px_rgba(2,32,24,0.52),inset_0_1px_0_rgba(255,255,255,0.04)]"
            : "border-white/8 bg-[linear-gradient(180deg,rgba(66,66,66,0.18)_0%,rgba(28,28,28,0.74)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
          habit.pending ? "pointer-events-none opacity-75 brightness-95" : null,
          onHabitCompletionToggle && !habit.pending ? "cursor-pointer" : null,
          isDragging ? "shadow-2xl" : null
        )}
        title={`${habit.name}${
          habit.completed
            ? " - COMPLETE"
            : habit.dueLabel
              ? ` - ${habit.dueLabel}`
              : ""
        }${
          onHabitCompletionToggle && !habit.pending
            ? `. Double tap to ${habit.completed ? "undo" : "complete"}.`
            : ""
        }`}
        role={onHabitCompletionToggle ? "button" : undefined}
        tabIndex={
          onHabitCompletionToggle && !habit.pending ? 0 : undefined
        }
        aria-pressed={onHabitCompletionToggle ? habit.completed : undefined}
        aria-disabled={onHabitCompletionToggle ? habit.pending : undefined}
        aria-label={`${habit.name}. ${
          habit.completed ? "COMPLETE" : habit.dueLabel || "No Due Match"
        }${
          onHabitCompletionToggle && !habit.pending
            ? `. Double tap to ${habit.completed ? "undo" : "complete"}.`
            : ""
        }`}
        onDoubleClick={(event) => onDoubleClick(event, habit)}
        onTouchEnd={(event) => onTouchEnd(event, habit)}
      >
        {dragHandle}
        <span
          className={clsx(
            "min-w-0 flex-1 truncate text-[12px] font-medium leading-tight sm:text-[13px]",
            habit.completed ? "text-emerald-50" : "text-white/84"
          )}
        >
          {habit.name}
        </span>
        {showStreakBadge ? (
          <span
            className="pointer-events-none flex shrink-0 items-center gap-0.5 rounded-full bg-white/10 px-1.5 py-[2px] text-[10px] font-semibold leading-tight text-amber-100"
            aria-label={`${streakDays} habit streak`}
          >
            <FlameEmber
              level={
                streakDays >= 7
                  ? "HIGH"
                  : streakDays >= 4
                    ? "MEDIUM"
                    : "LOW"
              }
              size="xs"
              className="drop-shadow-[0_0_6px_rgba(0,0,0,0.4)]"
            />
            <span className="tracking-normal">{streakLabel}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

function DraggableRoutineHabitRow({
  habit,
  fallbackIcon,
  onHabitCompletionToggle,
  onDoubleClick,
  onTouchEnd,
}: {
  habit: RelatedRoutineCardHabit;
  fallbackIcon: string;
  onHabitCompletionToggle?: (habitId: string) => void | Promise<void>;
  onDoubleClick: (
    event: MouseEvent<HTMLDivElement>,
    habit: RelatedRoutineCardHabit
  ) => void;
  onTouchEnd: (
    event: TouchEvent<HTMLDivElement>,
    habit: RelatedRoutineCardHabit
  ) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: habit.id });

  return (
    <RoutineHabitRowBody
      habit={habit}
      onHabitCompletionToggle={onHabitCompletionToggle}
      onDoubleClick={onDoubleClick}
      onTouchEnd={onTouchEnd}
      isDragging={isDragging}
      setNodeRef={setNodeRef}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition,
      }}
      dragHandle={
        <span
          className="flex h-7 w-7 shrink-0 touch-none cursor-grab items-center justify-center rounded-lg border border-white/12 bg-black/35 text-white/82 shadow-[inset_0_-1px_0_rgba(255,255,255,0.05)] transition active:cursor-grabbing sm:h-8 sm:w-8"
          {...attributes}
          {...listeners}
          data-routine-habit-drag-handle="true"
          aria-label="Drag habit to reorder"
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onTouchEnd={(event) => {
            event.stopPropagation();
          }}
        >
          {habit.skillIcon || fallbackIcon}
        </span>
      }
    />
  );
}

function StaticRoutineHabitRow({
  habit,
  fallbackIcon,
  onHabitCompletionToggle,
  onDoubleClick,
  onTouchEnd,
}: {
  habit: RelatedRoutineCardHabit;
  fallbackIcon: string;
  onHabitCompletionToggle?: (habitId: string) => void | Promise<void>;
  onDoubleClick: (
    event: MouseEvent<HTMLDivElement>,
    habit: RelatedRoutineCardHabit
  ) => void;
  onTouchEnd: (
    event: TouchEvent<HTMLDivElement>,
    habit: RelatedRoutineCardHabit
  ) => void;
}) {
  return (
    <RoutineHabitRowBody
      habit={habit}
      onHabitCompletionToggle={onHabitCompletionToggle}
      onDoubleClick={onDoubleClick}
      onTouchEnd={onTouchEnd}
      dragHandle={
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-black/35 text-white/82 shadow-[inset_0_-1px_0_rgba(255,255,255,0.05)] transition sm:h-8 sm:w-8">
          {habit.skillIcon || fallbackIcon}
        </span>
      }
    />
  );
}

function AddHabitButton({
  routine,
  onAddHabit,
}: {
  routine: RelatedRoutineCardRoutine;
  onAddHabit?: (routine: RelatedRoutineCardRoutine) => void;
}) {
  if (!onAddHabit) return null;

  return (
    <button
      type="button"
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onAddHabit(routine);
      }}
      className="relative flex w-full items-center gap-2 rounded-lg border border-white/8 bg-[linear-gradient(180deg,rgba(66,66,66,0.18)_0%,rgba(28,28,28,0.74)_100%)] px-2 py-1.5 text-left text-white transition shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-white/18 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2.5 sm:rounded-xl sm:px-2.5 sm:py-2"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/80 shadow-[inset_0_-1px_0_rgba(255,255,255,0.05)] sm:h-8 sm:w-8">
        <Plus aria-hidden="true" className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium leading-tight text-white/84 sm:text-[13px]">
        ADD HABIT
      </span>
    </button>
  );
}

export function RelatedRoutineCard({
  routine,
  density,
  fallbackIcon = "💡",
  onHabitCompletionToggle,
  onAddHabit,
  restoreOpen = false,
}: RelatedRoutineCardProps) {
  const headingId = useId();
  const prefersReducedMotion = useReducedMotion();
  const lastHabitTapRef = useRef<{
    habitId: string;
    timestamp: number;
  } | null>(null);
  const completingHabitIdsRef = useRef<Set<string>>(new Set());
  const suppressHabitCompletionUntilRef = useRef(0);
  const pendingCompletedHabitIdsRef = useRef<Set<string>>(new Set());
  const collapsingCompletedHabitIdsRef = useRef<Set<string>>(new Set());
  const pendingCompletedHabitMoveTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const collapsingCompletedHabitTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const isSmall = density === "small";
  const routineName = routine.name?.trim() || "Untitled routine";
  const routineIcon = routine.icon?.trim() || DEFAULT_ROUTINE_ICON;
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [isEditingRoutine, setIsEditingRoutine] = useState(false);
  const [displayRoutineName, setDisplayRoutineName] = useState(routineName);
  const [displayRoutineIcon, setDisplayRoutineIcon] = useState(routineIcon);
  const [draftRoutineName, setDraftRoutineName] = useState(routineName);
  const [draftRoutineIcon, setDraftRoutineIcon] = useState(routineIcon);
  const [isSavingRoutineDetails, setIsSavingRoutineDetails] = useState(false);
  const [routineEditError, setRoutineEditError] = useState<string | null>(null);
  const [showCompletedHabits, setShowCompletedHabits] = useState(false);
  const [pendingCompletedHabitIds, setPendingCompletedHabitIds] = useState<
    Set<string>
  >(() => new Set());
  const [collapsingCompletedHabitIds, setCollapsingCompletedHabitIds] =
    useState<Set<string>>(() => new Set());
  const routineHabits = useMemo(
    () => (Array.isArray(routine.habits) ? routine.habits : []),
    [routine.habits]
  );
  const [localHabits, setLocalHabits] = useState(() =>
    sortRoutineHabitsByPosition(routineHabits)
  );

  useEffect(() => {
    if (!restoreOpen) return;
    setOpen(true);
  }, [restoreOpen]);

  const habitCount = routineHabits.length;
  const labelIcon = displayRoutineIcon || DEFAULT_ROUTINE_ICON;
  const habitCountLabel = `${habitCount} ${habitCount === 1 ? "habit" : "habits"}`;
  const isMobile =
    mounted && typeof window !== "undefined" ? window.innerWidth < 640 : true;
  const computedMaxWidth =
    mounted && typeof window !== "undefined"
      ? Math.min(window.innerWidth - (isMobile ? 32 : 48), isMobile ? 384 : 576)
      : isMobile
        ? 384
        : 576;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 10,
      },
    })
  );
  const { incompleteHabits, completedHabits } = useMemo(() => {
    const nextIncompleteHabits: RelatedRoutineCardHabit[] = [];
    const nextCompletedHabits: RelatedRoutineCardHabit[] = [];

    for (const habit of localHabits) {
      const isMovingToCompleted =
        pendingCompletedHabitIds.has(habit.id) ||
        collapsingCompletedHabitIds.has(habit.id);

      if (habit.completed && !isMovingToCompleted) {
        nextCompletedHabits.push(habit);
      } else {
        nextIncompleteHabits.push(habit);
      }
    }

    return {
      incompleteHabits: nextIncompleteHabits,
      completedHabits: nextCompletedHabits,
    };
  }, [collapsingCompletedHabitIds, localHabits, pendingCompletedHabitIds]);
  const hasCompletedHabits = completedHabits.length > 0;
  const completedHabitsToggleLabel = `${
    showCompletedHabits ? "Hide completed" : "Show completed"
  } (${completedHabits.length})`;
  const completedHabitsRegionId = `${headingId}-completed-habits`;

  const clearPendingCompletedHabitMove = useCallback((habitId: string) => {
    const pendingTimer = pendingCompletedHabitMoveTimersRef.current.get(habitId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingCompletedHabitMoveTimersRef.current.delete(habitId);
    }

    const collapsingTimer =
      collapsingCompletedHabitTimersRef.current.get(habitId);
    if (collapsingTimer) {
      clearTimeout(collapsingTimer);
      collapsingCompletedHabitTimersRef.current.delete(habitId);
    }

    setPendingCompletedHabitIds((current) => {
      if (!current.has(habitId)) return current;

      const next = new Set(current);
      next.delete(habitId);
      pendingCompletedHabitIdsRef.current = next;
      return next;
    });
    setCollapsingCompletedHabitIds((current) => {
      if (!current.has(habitId)) return current;

      const next = new Set(current);
      next.delete(habitId);
      collapsingCompletedHabitIdsRef.current = next;
      return next;
    });
  }, []);

  const schedulePendingCompletedHabitMove = useCallback((habitId: string) => {
    const existingPendingTimer =
      pendingCompletedHabitMoveTimersRef.current.get(habitId);
    if (existingPendingTimer) {
      clearTimeout(existingPendingTimer);
      pendingCompletedHabitMoveTimersRef.current.delete(habitId);
    }

    const existingCollapsingTimer =
      collapsingCompletedHabitTimersRef.current.get(habitId);
    if (existingCollapsingTimer) {
      clearTimeout(existingCollapsingTimer);
      collapsingCompletedHabitTimersRef.current.delete(habitId);
    }

    setCollapsingCompletedHabitIds((current) => {
      if (!current.has(habitId)) return current;

      const next = new Set(current);
      next.delete(habitId);
      collapsingCompletedHabitIdsRef.current = next;
      return next;
    });
    setPendingCompletedHabitIds((current) => {
      if (current.has(habitId)) return current;

      const next = new Set(current);
      next.add(habitId);
      pendingCompletedHabitIdsRef.current = next;
      return next;
    });

    const pendingTimer = setTimeout(() => {
      pendingCompletedHabitMoveTimersRef.current.delete(habitId);
      setPendingCompletedHabitIds((current) => {
        if (!current.has(habitId)) return current;

        const next = new Set(current);
        next.delete(habitId);
        pendingCompletedHabitIdsRef.current = next;
        return next;
      });
      setCollapsingCompletedHabitIds((current) => {
        if (current.has(habitId)) return current;

        const next = new Set(current);
        next.add(habitId);
        collapsingCompletedHabitIdsRef.current = next;
        return next;
      });

      const collapsingTimer = setTimeout(() => {
        collapsingCompletedHabitTimersRef.current.delete(habitId);
        setCollapsingCompletedHabitIds((current) => {
          if (!current.has(habitId)) return current;

          const next = new Set(current);
          next.delete(habitId);
          collapsingCompletedHabitIdsRef.current = next;
          return next;
        });
      }, ROUTINE_HABIT_COMPLETED_COLLAPSE_MS);

      collapsingCompletedHabitTimersRef.current.set(habitId, collapsingTimer);
    }, ROUTINE_HABIT_COMPLETED_MOVE_DELAY_MS);

    pendingCompletedHabitMoveTimersRef.current.set(habitId, pendingTimer);
  }, []);

  const saveRoutineHabitOrder = useCallback(
    async (habitsToSave: RelatedRoutineCardHabit[]) => {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;

      try {
        const orderedHabitIds = habitsToSave.map((habit) => habit.id);
        const { error } = await (
          supabase as unknown as RoutineHabitOrderRpcClient
        ).rpc("save_routine_habit_order", {
          p_routine_id: routine.id,
          p_habit_ids: orderedHabitIds,
        });

        if (error) {
          console.error("Failed to save routine habit order:", error);
        }
      } catch (error) {
        console.error("Failed to save routine habit order:", error);
      }
    },
    [routine.id]
  );

  const handleRoutineHabitDragEnd = useCallback(
    async (event: DragEndEvent) => {
      suppressHabitCompletionUntilRef.current = Date.now() + 700;
      const { active, over } = event;

      if (!over || active.id === over.id) {
        return;
      }

      const oldIndex = incompleteHabits.findIndex(
        (habit) => habit.id === active.id
      );
      const newIndex = incompleteHabits.findIndex(
        (habit) => habit.id === over.id
      );
      if (oldIndex < 0 || newIndex < 0) {
        return;
      }

      const reorderedIncompleteHabits = arrayMove(
        incompleteHabits,
        oldIndex,
        newIndex
      );
      const reordered = [
        ...reorderedIncompleteHabits,
        ...completedHabits,
      ].map(
        (habit, index) => ({
          ...habit,
          routinePosition: index + 1,
        })
      );

      setLocalHabits(reordered);
      await saveRoutineHabitOrder(reordered);
    },
    [completedHabits, incompleteHabits, saveRoutineHabitOrder]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const pendingMoveTimers = pendingCompletedHabitMoveTimersRef.current;
    const collapsingTimers = collapsingCompletedHabitTimersRef.current;

    return () => {
      for (const timer of pendingMoveTimers.values()) {
        clearTimeout(timer);
      }
      for (const timer of collapsingTimers.values()) {
        clearTimeout(timer);
      }
      pendingMoveTimers.clear();
      collapsingTimers.clear();
    };
  }, []);

  useEffect(() => {
    const sortedHabits = sortRoutineHabitsByPosition(routineHabits);

    setLocalHabits(
      sortedHabits.map((habit) => {
        if (!pendingCompletedHabitIdsRef.current.has(habit.id)) {
          return habit;
        }

        return {
          ...habit,
          completed: true,
          pending: false,
        };
      })
    );

    for (const habit of sortedHabits) {
      if (
        pendingCompletedHabitIdsRef.current.has(habit.id) &&
        !habit.completed &&
        !habit.pending
      ) {
        clearPendingCompletedHabitMove(habit.id);
      }
    }
  }, [clearPendingCompletedHabitMove, routineHabits]);

  useEffect(() => {
    const habitsById = new Map(localHabits.map((habit) => [habit.id, habit]));
    const movingHabitIds = new Set([
      ...pendingCompletedHabitIdsRef.current,
      ...collapsingCompletedHabitIdsRef.current,
    ]);

    for (const habitId of movingHabitIds) {
      const habit = habitsById.get(habitId);
      if (!habit?.completed) {
        clearPendingCompletedHabitMove(habitId);
      }
    }
  }, [clearPendingCompletedHabitMove, localHabits]);

  useEffect(() => {
    const nextName = routine.name?.trim() || "Untitled routine";
    const nextIcon = routine.icon?.trim() || DEFAULT_ROUTINE_ICON;

    setDisplayRoutineName(nextName);
    setDisplayRoutineIcon(nextIcon);

    if (!isEditingRoutine) {
      setDraftRoutineName(nextName);
      setDraftRoutineIcon(nextIcon);
    }
  }, [isEditingRoutine, routine.icon, routine.name]);

  useEffect(() => {
    if (!open) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || hasCompletedHabits) return;

    setShowCompletedHabits(false);
  }, [hasCompletedHabits, open]);

  useEffect(() => {
    if (!isActionsMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const menuElement = actionsMenuRef.current;
      if (
        menuElement &&
        event.target instanceof Node &&
        menuElement.contains(event.target)
      ) {
        return;
      }

      setIsActionsMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [isActionsMenuOpen]);

  useEffect(() => {
    for (const habit of routineHabits) {
      if (!habit.pending) {
        completingHabitIdsRef.current.delete(habit.id);
      }
    }
  }, [routineHabits]);

  const closeRoutineEditForm = useCallback(() => {
    if (isSavingRoutineDetails) return;

    setDraftRoutineName(displayRoutineName);
    setDraftRoutineIcon(displayRoutineIcon);
    setIsEditingRoutine(false);
    setRoutineEditError(null);
  }, [displayRoutineIcon, displayRoutineName, isSavingRoutineDetails]);

  const openRoutineEditForm = useCallback(() => {
    setDraftRoutineName(displayRoutineName);
    setDraftRoutineIcon(displayRoutineIcon);
    setRoutineEditError(null);
    setIsActionsMenuOpen(false);
    setIsEditingRoutine(true);
  }, [displayRoutineIcon, displayRoutineName]);

  const handleSaveRoutineDetails = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const nextName = draftRoutineName.trim();
      if (!nextName) {
        setRoutineEditError("Routine name is required.");
        return;
      }

      const supabase = getSupabaseBrowser();
      if (!supabase) {
        setRoutineEditError("Unable to update routine.");
        return;
      }

      setIsSavingRoutineDetails(true);
      setRoutineEditError(null);

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setRoutineEditError("Sign in required to edit this routine.");
          return;
        }

        const nextIcon = draftRoutineIcon.trim() || DEFAULT_ROUTINE_ICON;
        const routineUpdateQuery = supabase.from(
          "habit_routines"
        ) as unknown as RoutineUpdateQuery;
        let { error } = await routineUpdateQuery
          .update({ name: nextName, icon: nextIcon })
          .eq("id", routine.id)
          .eq("user_id", user.id);

        if (error) {
          ({ error } = await routineUpdateQuery
            .update({ name: nextName })
            .eq("id", routine.id)
            .eq("user_id", user.id));
        }

        if (error) {
          throw error;
        }

        setDisplayRoutineName(nextName);
        setDisplayRoutineIcon(nextIcon);
        setDraftRoutineName(nextName);
        setDraftRoutineIcon(nextIcon);
        setIsEditingRoutine(false);
        dispatchRoutineUpdated(routine.id);
      } catch (error) {
        setRoutineEditError(getErrorMessage(error, "Unable to update routine."));
      } finally {
        setIsSavingRoutineDetails(false);
      }
    },
    [draftRoutineIcon, draftRoutineName, routine.id]
  );

  const toggleHabitCompletionFromRoutine = useCallback(
    (habit: RelatedRoutineCardHabit) => {
      const isPendingCompletedMove =
        pendingCompletedHabitIdsRef.current.has(habit.id);

      if (
        !onHabitCompletionToggle ||
        (habit.pending && !isPendingCompletedMove) ||
        (completingHabitIdsRef.current.has(habit.id) &&
          !isPendingCompletedMove)
      ) {
        return;
      }

      completingHabitIdsRef.current.add(habit.id);
      if (!habit.completed) {
        setShowCompletedHabits(false);
        setLocalHabits((current) =>
          current.map((currentHabit) =>
            currentHabit.id === habit.id
              ? { ...currentHabit, completed: true, pending: false }
              : currentHabit
          )
        );
        schedulePendingCompletedHabitMove(habit.id);
      } else if (isPendingCompletedMove) {
        clearPendingCompletedHabitMove(habit.id);
        setLocalHabits((current) =>
          current.map((currentHabit) =>
            currentHabit.id === habit.id
              ? { ...currentHabit, completed: false, pending: false }
              : currentHabit
          )
        );
      }

      try {
        void Promise.resolve(onHabitCompletionToggle(habit.id)).finally(() => {
          completingHabitIdsRef.current.delete(habit.id);
        });
      } catch (error) {
        completingHabitIdsRef.current.delete(habit.id);
        throw error;
      }
    },
    [
      clearPendingCompletedHabitMove,
      onHabitCompletionToggle,
      schedulePendingCompletedHabitMove,
    ]
  );

  const handleRoutineHabitDoubleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>, habit: RelatedRoutineCardHabit) => {
      if (
        Date.now() < suppressHabitCompletionUntilRef.current ||
        (event.target instanceof Element &&
          event.target.closest("[data-routine-habit-drag-handle='true']"))
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      lastHabitTapRef.current = null;
      toggleHabitCompletionFromRoutine(habit);
    },
    [toggleHabitCompletionFromRoutine]
  );

  const handleRoutineHabitTouchEnd = useCallback(
    (event: TouchEvent<HTMLDivElement>, habit: RelatedRoutineCardHabit) => {
      if (
        Date.now() < suppressHabitCompletionUntilRef.current ||
        (event.target instanceof Element &&
          event.target.closest("[data-routine-habit-drag-handle='true']"))
      ) {
        return;
      }

      const now = Date.now();
      const previousTap = lastHabitTapRef.current;

      if (
        previousTap?.habitId === habit.id &&
        now - previousTap.timestamp <= ROUTINE_HABIT_DOUBLE_TAP_MS
      ) {
        event.preventDefault();
        event.stopPropagation();
        lastHabitTapRef.current = null;
        toggleHabitCompletionFromRoutine(habit);
        return;
      }

      lastHabitTapRef.current = {
        habitId: habit.id,
        timestamp: now,
      };
    },
    [toggleHabitCompletionFromRoutine]
  );

  const popup =
    mounted && open
      ? createPortal(
          <>
            <button
              type="button"
              className={`fixed inset-0 z-[60] ${
                isMobile ? "bg-black/70" : "bg-black/50"
              }`}
              aria-label="Close routine habits overlay"
          onClick={() => setOpen(false)}
            />
            <div
              className={`fixed inset-0 z-[70] flex items-center justify-center ${
                isMobile ? "px-4 py-10" : "px-6 py-12"
              }`}
              onClick={() => setOpen(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={headingId}
                onClick={(event) => event.stopPropagation()}
                className={clsx(
                  "w-full overflow-hidden rounded-2xl border border-white/10 bg-[#07080A]/95 text-white/90 shadow-[0_25px_50px_-20px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.05)]",
                  isMobile ? "max-w-sm" : "max-w-xl"
                )}
                style={{ maxWidth: computedMaxWidth }}
              >
                <div className="flex max-h-[calc(100vh-3rem)] flex-col sm:max-h-[calc(100vh-6rem)]">
                  <div className="px-5 py-4">
                    {isEditingRoutine ? (
                      <form
                        className="min-w-0"
                        onSubmit={handleSaveRoutineDetails}
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <div className="flex items-start justify-between gap-2 sm:gap-4">
                          <div className="flex min-w-0 flex-1 items-start gap-2 sm:gap-3">
                            <input
                              aria-label="Routine emoji"
                              value={draftRoutineIcon}
                              onChange={(event) =>
                                setDraftRoutineIcon(event.target.value)
                              }
                              maxLength={8}
                              placeholder={DEFAULT_ROUTINE_ICON}
                              disabled={isSavingRoutineDetails}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent bg-transparent p-0 text-center text-base font-semibold text-white outline-none transition placeholder:text-white/28 focus:border-white/14 focus:bg-white/[0.03] focus:ring-1 focus:ring-white/10 disabled:opacity-55 sm:h-9 sm:w-9 sm:text-lg"
                            />
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:gap-1">
                              <input
                                id={headingId}
                                aria-label="Routine name"
                                value={draftRoutineName}
                                onChange={(event) =>
                                  setDraftRoutineName(event.target.value)
                                }
                                placeholder="Routine name"
                                disabled={isSavingRoutineDetails}
                                className="h-5 min-w-0 rounded-md border border-white/12 bg-white/[0.05] px-1.5 text-[15px] font-semibold leading-tight text-white outline-none transition placeholder:text-white/30 focus:border-white/28 focus:bg-white/[0.08] focus:ring-2 focus:ring-white/10 disabled:opacity-55 sm:h-6 sm:text-base"
                              />
                              <p className="text-[10px] uppercase tracking-[0.22em] text-white/60 sm:text-[11px] sm:tracking-[0.32em]">
                                {habitCountLabel}
                              </p>
                              {routineEditError ? (
                                <p className="text-[11px] leading-4 text-red-100/82">
                                  {routineEditError}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              aria-label="Cancel routine edit"
                              onClick={closeRoutineEditForm}
                              disabled={isSavingRoutineDetails}
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-white/58 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              <X aria-hidden="true" className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="submit"
                              aria-label="Save routine edit"
                              disabled={
                                isSavingRoutineDetails ||
                                draftRoutineName.trim().length === 0
                              }
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-white/14 bg-white/[0.1] text-white transition hover:border-white/24 hover:bg-white/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              {isSavingRoutineDetails ? (
                                <span className="text-[10px] font-semibold leading-none">
                                  ...
                                </span>
                              ) : (
                                <Check
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5"
                                />
                              )}
                            </button>
                          </div>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-start justify-between gap-2 sm:gap-4">
                        <div className="flex min-w-0 flex-1 items-start gap-2 sm:gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base font-semibold text-white sm:h-9 sm:w-9 sm:text-lg">
                            {labelIcon}
                          </div>
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:gap-1">
                            <h4
                              id={headingId}
                              className="text-[15px] font-semibold leading-tight text-white sm:text-base"
                            >
                              {displayRoutineName}
                            </h4>
                            <p className="text-[10px] uppercase tracking-[0.22em] text-white/60 sm:text-[11px] sm:tracking-[0.32em]">
                              {habitCountLabel}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <div ref={actionsMenuRef} className="relative">
                            <button
                              type="button"
                              aria-label="Routine actions"
                              aria-haspopup="menu"
                              aria-expanded={isActionsMenuOpen}
                              onClick={(event) => {
                                event.stopPropagation();
                                setIsActionsMenuOpen((current) => !current);
                                setRoutineEditError(null);
                              }}
                              className="rounded-md p-1.5 text-white/58 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
                            >
                              <MoreVertical
                                aria-hidden="true"
                                className="h-4 w-4"
                              />
                            </button>
                            {isActionsMenuOpen ? (
                              <div
                                role="menu"
                                className="absolute right-0 top-8 z-20 min-w-40 rounded-xl border border-white/10 bg-[#090A0C] p-1.5 shadow-[0_18px_44px_rgba(0,0,0,0.5)]"
                                onClick={(event) => event.stopPropagation()}
                                onPointerDown={(event) =>
                                  event.stopPropagation()
                                }
                              >
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={openRoutineEditForm}
                                  className="w-full rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-white/82 transition hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
                                >
                                  Edit Routine
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col px-3 pb-4 sm:px-5">
                    <div className="min-h-0 flex-1 overflow-y-auto pb-1 sm:pb-1.5">
                      {localHabits.length > 0 ? (
                        <div className="flex flex-col gap-1 sm:gap-1.5">
                          {incompleteHabits.length > 0 ? (
                            <DndContext
                              sensors={sensors}
                              collisionDetection={closestCenter}
                              onDragStart={() => {
                                suppressHabitCompletionUntilRef.current =
                                  Date.now() + 700;
                                lastHabitTapRef.current = null;
                              }}
                              onDragEnd={handleRoutineHabitDragEnd}
                              onDragCancel={() => {
                                suppressHabitCompletionUntilRef.current =
                                  Date.now() + 700;
                                lastHabitTapRef.current = null;
                              }}
                            >
                              <SortableContext
                                items={incompleteHabits.map(
                                  (habit) => habit.id
                                )}
                              >
                                <div className="flex flex-col gap-1 sm:gap-1.5">
                                  {incompleteHabits.map((habit) => {
                                    const isPendingCompletedMove =
                                      pendingCompletedHabitIds.has(habit.id) ||
                                      collapsingCompletedHabitIds.has(habit.id);
                                    const isCollapsingCompletedMove =
                                      collapsingCompletedHabitIds.has(habit.id);
                                    const displayedHabit =
                                      isPendingCompletedMove
                                        ? {
                                            ...habit,
                                            completed: true,
                                            pending: false,
                                          }
                                        : habit;

                                    return (
                                      <motion.div
                                        key={habit.id}
                                        className={clsx(
                                          "overflow-hidden",
                                          isCollapsingCompletedMove
                                            ? "pointer-events-none"
                                            : null
                                        )}
                                        initial={false}
                                        animate={
                                          prefersReducedMotion
                                            ? {
                                                opacity:
                                                  isCollapsingCompletedMove
                                                    ? 0
                                                    : 1,
                                                height:
                                                  isCollapsingCompletedMove
                                                    ? 0
                                                    : "auto",
                                              }
                                            : isCollapsingCompletedMove
                                              ? "exit"
                                              : "visible"
                                        }
                                        variants={
                                          prefersReducedMotion
                                            ? undefined
                                            : routineDrawerActiveHabitMotion
                                        }
                                        transition={
                                          prefersReducedMotion
                                            ? { duration: 0.12 }
                                            : undefined
                                        }
                                      >
                                        <DraggableRoutineHabitRow
                                          habit={displayedHabit}
                                          fallbackIcon={fallbackIcon}
                                          onHabitCompletionToggle={
                                            onHabitCompletionToggle
                                          }
                                          onDoubleClick={
                                            handleRoutineHabitDoubleClick
                                          }
                                          onTouchEnd={handleRoutineHabitTouchEnd}
                                        />
                                      </motion.div>
                                    );
                                  })}
                                </div>
                              </SortableContext>
                            </DndContext>
                          ) : null}

                          {hasCompletedHabits ? (
                            <div
                              className={clsx(
                                "flex flex-col gap-1 sm:gap-1.5",
                                incompleteHabits.length > 0 ? "pt-1.5" : null
                              )}
                            >
                              <button
                                type="button"
                                aria-expanded={showCompletedHabits}
                                aria-controls={completedHabitsRegionId}
                                onClick={() =>
                                  setShowCompletedHabits((current) => !current)
                                }
                                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs font-medium text-white/45 transition hover:bg-white/[0.03] hover:text-white/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
                              >
                                <span>{completedHabitsToggleLabel}</span>
                              </button>

                              <AnimatePresence initial={false}>
                                {showCompletedHabits ? (
                                  <motion.div
                                    id={completedHabitsRegionId}
                                    className="flex flex-col gap-1 overflow-hidden sm:gap-1.5"
                                    initial={
                                      prefersReducedMotion
                                        ? { opacity: 0 }
                                        : "hidden"
                                    }
                                    animate={
                                      prefersReducedMotion
                                        ? { opacity: 1 }
                                        : "visible"
                                    }
                                    exit={
                                      prefersReducedMotion
                                        ? { opacity: 0 }
                                        : "exit"
                                    }
                                    variants={
                                      prefersReducedMotion
                                        ? undefined
                                        : routineDrawerCompletedHabitMotion
                                    }
                                    transition={
                                      prefersReducedMotion
                                        ? { duration: 0.12 }
                                        : undefined
                                    }
                                  >
                                    {completedHabits.map((habit) => (
                                      <StaticRoutineHabitRow
                                        key={habit.id}
                                        habit={habit}
                                        fallbackIcon={fallbackIcon}
                                        onHabitCompletionToggle={
                                          onHabitCompletionToggle
                                        }
                                        onDoubleClick={
                                          handleRoutineHabitDoubleClick
                                        }
                                        onTouchEnd={handleRoutineHabitTouchEnd}
                                      />
                                    ))}
                                  </motion.div>
                                ) : null}
                              </AnimatePresence>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="rounded-[18px] border border-dashed border-white/20 bg-white/[0.02] px-2.5 py-4 text-center text-sm text-white/60 sm:rounded-2xl sm:px-4 sm:py-6">
                          No habits linked yet.
                        </div>
                      )}
                    </div>
                    {onAddHabit ? (
                      <div className="mt-1.5 shrink-0 sm:mt-2">
                        <AddHabitButton
                          routine={routine}
                          onAddHabit={onAddHabit}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </>,
          document.body
        )
      : null;

  return (
    <>
      <div
        className={clsx(
          "goal-card shimmer-border group relative flex aspect-[5/6] w-full transform-gpu flex-col overflow-hidden border-2 border-yellow-400 text-white shadow-[0_10px_26px_-14px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.06)] transition duration-200 select-none hover:-translate-y-0.5",
          isSmall
            ? "min-h-[70px] rounded-xl p-1.5 sm:min-h-[82px] sm:p-2"
            : "min-h-[96px] rounded-2xl p-3 sm:p-4"
        )}
        title={`${displayRoutineName} routine`}
      >
        <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(120%_70%_at_50%_0%,rgba(255,255,255,0.10),transparent_60%)] [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />
        <button
          type="button"
          className="relative z-[2] flex h-full min-w-0 flex-1 flex-col items-center gap-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300/50"
          aria-expanded={open}
          aria-label={`${displayRoutineName}. Routine with ${habitCount} ${
            habitCount === 1 ? "habit" : "habits"
          }.`}
          onClick={() => {
            setIsActionsMenuOpen(false);
            setShowCompletedHabits(false);
            setOpen(true);
          }}
        >
          <div
            className={clsx(
              "flex items-center justify-center rounded-xl border border-white/10 bg-white/5 font-semibold text-white shadow-[inset_0_-1px_0_rgba(255,255,255,0.06),_0_6px_12px_rgba(0,0,0,0.35)]",
              isSmall ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-base"
            )}
          >
            {labelIcon}
          </div>
          <h3
            className={clsx(
              "max-w-full break-words px-1 text-center font-semibold leading-snug",
              isSmall ? "line-clamp-2 text-[8px]" : "line-clamp-2 text-[9px]"
            )}
            title={displayRoutineName}
            style={{ hyphens: "auto" }}
          >
            {displayRoutineName}
          </h3>
          <div
            className={clsx(
              "text-white/60",
              isSmall ? "text-[7px]" : "text-[8px]"
            )}
          >
            {habitCountLabel}
          </div>
        </button>
      </div>
      {popup}
    </>
  );
}

export default RelatedRoutineCard;
