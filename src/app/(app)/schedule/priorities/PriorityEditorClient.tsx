"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  CollisionDetection,
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { getSupabaseBrowser } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { Goal } from "@/app/(app)/goals/types";
import { computeGoalWeight } from "@/lib/goals/weight";
import {
  formatEnumLabel,
  normalizePriority,
  normalizeStage,
  parseGlobalRank,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  PriorityBucketId,
  PriorityGoal,
  PriorityProject,
  StageId,
  STAGE_ORDER,
} from "./utils";

interface PriorityEditorClientProps {
  initialProjects: PriorityProject[];
  initialGoals: PriorityGoal[];
  initialError?: string | null;
}

type PriorityView = "projects" | "goals";

const VIEW_OPTIONS: Array<{ id: PriorityView; label: string }> = [
  { id: "projects", label: "Projects" },
  { id: "goals", label: "Goals" },
];

const collisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length ? pointerCollisions : closestCorners(args);
};

export default function PriorityEditorClient({
  initialProjects,
  initialGoals = [],
  initialError = null,
}: PriorityEditorClientProps) {
  const [projects, setProjects] = useState(initialProjects);
  const [goals, setGoals] = useState(initialGoals);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [priorityUpdateError, setPriorityUpdateError] = useState<string | null>(null);
  const [view, setView] = useState<PriorityView>("projects");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isGoalRecalculating, setIsGoalRecalculating] = useState(false);
  const [goalActionError, setGoalActionError] = useState<string | null>(null);
  const [goalActionMessage, setGoalActionMessage] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setPriorityUpdateError(null);
    setActiveId(event.active.id);
  }, []);

  useEffect(() => {
    setProjects(initialProjects);
    setError(initialError);
  }, [initialProjects, initialError]);

  useEffect(() => {
    setGoals(initialGoals);
  }, [initialGoals]);

  const priorityStageBuckets = useMemo(() => {
    const buckets = PRIORITY_ORDER.reduce(
      (acc, bucketId) => ({
        ...acc,
        [bucketId]: STAGE_ORDER.reduce(
          (stageAcc, stageId) => ({ ...stageAcc, [stageId]: [] as PriorityProject[] }),
          {} as Record<StageId, PriorityProject[]>,
        ),
      }),
      {} as Record<PriorityBucketId, Record<StageId, PriorityProject[]>>,
    );

    const sortedProjects = [...projects].sort((a, b) => {
      const priorityDelta =
        PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
      if (priorityDelta !== 0) return priorityDelta;

      const aStage = normalizeStage(a.stage) ?? STAGE_ORDER[0];
      const bStage = normalizeStage(b.stage) ?? STAGE_ORDER[0];
      const stageDelta =
        STAGE_ORDER.indexOf(aStage) - STAGE_ORDER.indexOf(bStage);
      if (stageDelta !== 0) return stageDelta;

      const rankDelta = compareGlobalRankValues(a.globalRank, b.globalRank);
      if (rankDelta !== 0) return rankDelta;

      return a.name.localeCompare(b.name);
    });

    for (const project of sortedProjects) {
      const stageId = normalizeStage(project.stage) ?? STAGE_ORDER[0];
      buckets[project.priority][stageId].push(project);
    }
    return buckets;
  }, [projects]);

  const goalBuckets = useMemo(() => {
    const buckets = {} as Record<PriorityBucketId, PriorityGoal[]>;
    for (const bucketId of PRIORITY_ORDER) {
      buckets[bucketId] = [];
    }

    const sortedGoals = [...goals].sort((a, b) => {
      const priorityDelta =
        PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
      if (priorityDelta !== 0) return priorityDelta;

      const rankDelta = compareGlobalRankValues(a.globalRank, b.globalRank);
      if (rankDelta !== 0) return rankDelta;

      return a.name.localeCompare(b.name);
    });
    for (const goal of sortedGoals) {
      buckets[goal.priority].push(goal);
    }
    return buckets;
  }, [goals]);

  const isProjectView = view === "projects";

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      const draggablePayload = parseDraggableId(active.id);
      const targetBucket = parsePriorityDroppableId(over?.id);
      if (!draggablePayload || !targetBucket) {
        return;
      }

      const currentItems =
        draggablePayload.type === "project" ? projects : goals;
      const previousState = currentItems;
      const item = currentItems.find((entry) => entry.id === draggablePayload.id);
      if (!item || item.priority === targetBucket) {
        return;
      }

      const updatedItems = currentItems.map((entry) =>
        entry.id === draggablePayload.id
          ? { ...entry, priority: targetBucket }
          : entry,
      );

      if (draggablePayload.type === "project") {
        setProjects(updatedItems as PriorityProject[]);
      } else {
        setGoals(updatedItems as PriorityGoal[]);
      }

      const revertLocalState = () => {
        if (draggablePayload.type === "project") {
          setProjects(previousState as PriorityProject[]);
        } else {
          setGoals(previousState as PriorityGoal[]);
        }
      };

      const supabase = getSupabaseBrowser();
      if (!supabase) {
        revertLocalState();
        setPriorityUpdateError("Unable to contact the backend.");
        return;
      }

      try {
        const tableName =
          draggablePayload.type === "project" ? "projects" : "goals";
        const { error: updateError } = await supabase
          .from(tableName)
          .update({ priority: targetBucket })
          .eq("id", draggablePayload.id);

        if (updateError) {
          throw updateError;
        }

        setPriorityUpdateError(null);
      } catch (updateError) {
        console.error("Failed to update priority", updateError);
        revertLocalState();
        setPriorityUpdateError(
          `Could not move ${draggablePayload.type} to ${PRIORITY_LABELS[targetBucket]}. Try again.`,
        );
      }
    },
    [goals, projects],
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const handleRecalculate = async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setActionError("Unable to contact the backend.");
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsRecalculating(true);
    setLoading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user?.id) {
        console.error("RECALC USER ERROR", userError);
        setActionError("Could not determine user for priority recalculation.");
        return;
      }

      const { goals: updatedGoals, projectRankById } = await rebuildPriorityStack(
        supabase,
        user.id,
      );

      setGoals(updatedGoals);
      setProjects((previous) =>
        previous.map((entry) => ({
          ...entry,
          globalRank: projectRankById.get(entry.id) ?? entry.globalRank,
        })),
      );

      setActionMessage("Global ranks refreshed.");
    } catch (caught) {
      console.error("Failed to recalculate global rank", caught);
      setActionError("Could not recalculate ranks.");
    } finally {
      setIsRecalculating(false);
      setLoading(false);
    }
  };

  const handleGoalRecalculate = async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setGoalActionError("Unable to contact the backend.");
      return;
    }

    setGoalActionError(null);
    setGoalActionMessage(null);
    setIsGoalRecalculating(true);
    setLoading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user?.id) {
        console.error("GOAL USER ERROR", userError);
        setGoalActionError("Could not determine user for goal recompute.");
        return;
      }

      const { goals: updatedGoals, projectRankById } = await rebuildPriorityStack(
        supabase,
        user.id,
      );

      setGoals(updatedGoals);
      setProjects((previous) =>
        previous.map((entry) => ({
          ...entry,
          globalRank: projectRankById.get(entry.id) ?? entry.globalRank,
        })),
      );

      setGoalActionMessage("Goal ranks refreshed.");
    } catch (caught) {
      console.error("Goal recalc request failed", caught);
      setGoalActionError("Could not recalculate goal ranks.");
    } finally {
      setIsGoalRecalculating(false);
      setLoading(false);
    }
  };

  return (
    <>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-8 pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold text-white">Priority Editor</h1>
              <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
                {VIEW_OPTIONS.map((option) => {
                  const isActive = view === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setView(option.id)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                        isActive
                          ? "bg-white text-black border border-transparent shadow-sm"
                          : "border border-transparent text-zinc-300 hover:text-white"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="text-sm text-zinc-400">
              Drag items between priority buckets to update priority.
            </p>
            {priorityUpdateError && (
              <p className="text-xs text-red-300">{priorityUpdateError}</p>
            )}
          </div>
        {isProjectView ? (
          <div className="flex flex-col items-start gap-1 sm:items-end">
            {/* Rebuilds the full priority stack: goals first, then projects. */}
            <button
              type="button"
              disabled={isRecalculating || loading}
              onClick={handleRecalculate}
              className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:border-white/40 disabled:cursor-not-allowed disabled:border-white/10 disabled:opacity-60"
            >
              {isRecalculating ? "Recalculating…" : "Recalculate ranks"}
            </button>
            <p className="text-xs text-zinc-400">
                Rebuilds the full priority stack: goals first, then projects.
              </p>
              {actionError && <p className="text-xs text-red-300">{actionError}</p>}
              {!actionError && actionMessage && (
                <p className="text-xs text-emerald-200">{actionMessage}</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <button
                type="button"
                disabled={isGoalRecalculating || loading}
                onClick={handleGoalRecalculate}
                className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:border-white/40 disabled:cursor-not-allowed disabled:border-white/10 disabled:opacity-60"
              >
                {isGoalRecalculating ? "Recalculating…" : "Recalculate Goal Ranks"}
              </button>
              <p className="text-xs text-zinc-400">
                Updates goal global_rank from the computed goal weight formula.
              </p>
              {goalActionError && (
                <p className="text-xs text-red-300">{goalActionError}</p>
              )}
              {!goalActionError && goalActionMessage && (
                <p className="text-xs text-emerald-200">{goalActionMessage}</p>
              )}
            </div>
          )}
        </div>
        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-100">
            {error}
          </div>
        )}
        {isProjectView && loading && (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
            Loading projects…
          </div>
        )}
        <DndContext
          sensors={sensors}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {PRIORITY_ORDER.map((bucketId) => {
              const stageBuckets = priorityStageBuckets[bucketId];
              const stageGroups = STAGE_ORDER.map((stageId) => ({
                stageId,
                projects: stageBuckets[stageId],
              }));
              const totalProjects = stageGroups.reduce(
                (sum, group) => sum + group.projects.length,
                0,
              );
              const goalItems = goalBuckets[bucketId];
              const totalGoals = goalItems.length;
              const totalItems = isProjectView ? totalProjects : totalGoals;
              const itemLabel = isProjectView ? "project" : "goal";
              const emptyLabel = isProjectView ? "projects" : "goals";
              const bucketSortableItems = isProjectView
                ? STAGE_ORDER.flatMap((stageId) =>
                    stageBuckets[stageId].map((project) =>
                      buildDraggableId("project", project.id),
                    ),
                  )
                : goalItems.map((goal) => buildDraggableId("goal", goal.id));

              return (
                <PriorityBucketColumn
                  key={bucketId}
                  bucketId={bucketId}
                  totalItems={totalItems}
                  itemLabel={itemLabel}
                  emptyLabel={emptyLabel}
                  sortableItems={bucketSortableItems}
                >
                  {isProjectView ? (
                    stageGroups.map((group) => {
                      if (group.projects.length === 0) return null;
                      return (
                        <div key={group.stageId} className="flex flex-col gap-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                            {group.stageId}
                          </p>
                          <div className="flex flex-col gap-2">
                            {group.projects.map((project) => (
                              <PriorityItemCard
                                key={project.id}
                                type="project"
                                item={project}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex flex-col gap-2">
                      {goalItems.map((goal) => (
                        <PriorityItemCard key={goal.id} type="goal" item={goal} />
                      ))}
                    </div>
                  )}
                </PriorityBucketColumn>
              );
            })}
          </div>
          <DragOverlay>
            {activeId && (
              <ActiveItemOverlay
                activeId={activeId}
                projects={projects}
                goals={goals}
              />
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </>
  );
}

type PriorityRebuildResult = {
  goals: PriorityGoal[];
  projectRankById: Map<string, number>;
};

const PROJECT_PRIORITY_STRENGTH_MAP: Record<PriorityBucketId, number> = {
  "ULTRA-CRITICAL": 6,
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  NO: 1,
};

const PROJECT_STAGE_STRENGTH_MAP: Record<StageId, number> = {
  RESEARCH: 6,
  TEST: 5,
  REFINE: 4,
  BUILD: 3,
  RELEASE: 2,
};

async function rebuildPriorityStack(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<PriorityRebuildResult> {
  const { data: goalRows, error: goalFetchError } = await supabase
    .from("goals")
    .select(
      `
        id,
        name,
        active,
        roadmap_id,
        priority_code,
        priority_rank,
        created_at,
        updated_at,
        projects (
          id,
          name,
          stage
        )
      `,
    )
    .eq("user_id", userId);

  if (goalFetchError) {
    throw goalFetchError;
  }

  const weightUpdates =
    (goalRows ?? []).map((goalRow) => {
      const canonicalGoal = {
        id: goalRow.id,
        title: goalRow.name ?? "Untitled goal",
        priority: "No",
        energy: "No",
        progress: 0,
        status: "Active",
        active: goalRow.active ?? true,
        createdAt:
          goalRow.created_at ?? new Date().toISOString(),
        updatedAt:
          goalRow.updated_at ?? goalRow.created_at ?? new Date().toISOString(),
        projects: (goalRow.projects ?? []).map((project) => ({
          id: project.id,
          name: project.name ?? "Untitled project",
          status: "Active",
          progress: 0,
          energy: "No",
          tasks: [],
          weight: project.weight ?? 0,
        })),
        roadmapId: goalRow.roadmap_id ?? null,
        priorityCode: goalRow.priority_code ?? null,
        priorityRank:
          typeof goalRow.priority_rank === "number" &&
          Number.isFinite(goalRow.priority_rank)
            ? goalRow.priority_rank
            : null,
      } as Goal;

      return {
        id: goalRow.id,
        weight: computeGoalWeight(canonicalGoal),
      };
    });

  for (const update of weightUpdates) {
    const { error: updateError } = await supabase
      .from("goals")
      .update({ weight: update.weight })
      .eq("id", update.id);

    if (updateError) {
      throw updateError;
    }
  }

  const { error: rpcError } = await supabase.rpc("recalculate_goal_global_rank");
  if (rpcError) {
    throw rpcError;
  }

  const { data: refreshedGoalRows, error: refreshedGoalError } = await supabase
    .from("goals")
    .select("id,name,emoji,priority,priority_code,status,global_rank")
    .neq("status", "COMPLETED")
    .eq("user_id", userId);

  if (refreshedGoalError) {
    throw refreshedGoalError;
  }

  const normalizedGoals: PriorityGoal[] =
    (refreshedGoalRows ?? []).map((row) => ({
      id: row.id,
      name: (row.name ?? "").trim() || "Untitled goal",
      emoji: row.emoji ?? null,
      priority: normalizePriority(row.priority ?? row.priority_code),
      stage: null,
      globalRank: parseGlobalRank(row.global_rank),
    }));

  const goalRankById = new Map<string, number | null>();
  for (const goalRow of refreshedGoalRows ?? []) {
    if (!goalRow?.id) continue;
    goalRankById.set(goalRow.id, parseGlobalRank(goalRow.global_rank) ?? null);
  }

  const { data: projectRows, error: projectFetchError } = await supabase
    .from("projects")
    .select("id,name,priority,stage,goal_id")
    .eq("user_id", userId)
    .is("completed_at", null);

  if (projectFetchError) {
    throw projectFetchError;
  }

  type ProjectRankRecord = {
    id: string;
    goalGlobalRank: number | null;
    priorityStrength: number;
    stageStrength: number;
  };

  const projectRankRecords: ProjectRankRecord[] = [];
  for (const projectRow of projectRows ?? []) {
    if (!projectRow?.id) continue;
    const projectGoalRank =
      projectRow.goal_id && goalRankById.has(projectRow.goal_id)
        ? goalRankById.get(projectRow.goal_id) ?? null
        : null;
    projectRankRecords.push({
      id: projectRow.id,
      goalGlobalRank: projectGoalRank,
      priorityStrength: getPriorityStrength(projectRow.priority),
      stageStrength: getStageStrength(projectRow.stage),
    });
  }

  projectRankRecords.sort((a, b) => {
    const aGoalRank = a.goalGlobalRank ?? Number.POSITIVE_INFINITY;
    const bGoalRank = b.goalGlobalRank ?? Number.POSITIVE_INFINITY;
    if (aGoalRank !== bGoalRank) {
      return aGoalRank - bGoalRank;
    }
    if (a.priorityStrength !== b.priorityStrength) {
      return b.priorityStrength - a.priorityStrength;
    }
    if (a.stageStrength !== b.stageStrength) {
      return b.stageStrength - a.stageStrength;
    }
    return a.id.localeCompare(b.id);
  });

  const projectRankById = new Map<string, number>();
  for (let index = 0; index < projectRankRecords.length; index++) {
    const record = projectRankRecords[index];
    const rank = index + 1;
    const { error: projectUpdateError } = await supabase
      .from("projects")
      .update({ global_rank: rank })
      .eq("id", record.id);

    if (projectUpdateError) {
      throw projectUpdateError;
    }

    projectRankById.set(record.id, rank);
  }

  return {
    goals: normalizedGoals,
    projectRankById,
  };
}

function getPriorityStrength(value?: string | null): number {
  const normalized = normalizePriority(value);
  return PROJECT_PRIORITY_STRENGTH_MAP[normalized] ?? 3;
}

function getStageStrength(value?: string | null): number {
  const normalized = normalizeStage(value);
  if (normalized && normalized in PROJECT_STAGE_STRENGTH_MAP) {
    return PROJECT_STAGE_STRENGTH_MAP[normalized];
  }
  return 3;
}

type PriorityItemCardProps =
  | { type: "project"; item: PriorityProject }
  | { type: "goal"; item: PriorityGoal };

function PriorityItemCard({ type, item }: PriorityItemCardProps) {
  const draggableId = buildDraggableId(type, item.id);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: draggableId });

  const stageLabel = item.stage ? `Stage: ${formatEnumLabel(item.stage)}` : null;
  const displayEmoji = item.emoji ?? (type === "goal" ? "🎯" : null);
  const transformStyle = transform ? CSS.Transform.toString(transform) : undefined;
  const style: CSSProperties = {
    touchAction: "none",
    ...(transformStyle ? { transform: transformStyle } : undefined),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      className={`select-none flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-[var(--surface)] px-3 py-2 transition ${
        isDragging ? "shadow-2xl shadow-black/40 opacity-0" : ""
      } cursor-grab active:cursor-grabbing`}
    >
      <div>
        <div className="flex items-center gap-2">
          {displayEmoji && <span className="text-base">{displayEmoji}</span>}
          <p className="text-sm font-semibold text-white">{item.name}</p>
        </div>
        {stageLabel && <p className="text-xs text-zinc-500">{stageLabel}</p>}
      </div>
      {type === "project" && item.globalRank !== undefined && (
        <span className="text-xs font-semibold text-[var(--accent-red)]">
          #{item.globalRank}
        </span>
      )}
      {type === "goal" && item.globalRank !== undefined && (
        <span className="text-xs font-semibold text-[var(--accent-red)]">
          #{item.globalRank}
        </span>
      )}
    </div>
  );
}

interface PriorityBucketColumnProps {
  bucketId: PriorityBucketId;
  totalItems: number;
  itemLabel: string;
  emptyLabel: string;
  sortableItems: string[];
  children: ReactNode;
}

function PriorityBucketColumn({
  bucketId,
  totalItems,
  itemLabel,
  emptyLabel,
  children,
  sortableItems,
}: PriorityBucketColumnProps) {
  const droppableId = buildPriorityDroppableId(bucketId);
  const { isOver, setNodeRef } = useDroppable({ id: droppableId });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[220px] flex-col gap-3 rounded-2xl border bg-[var(--surface-elevated)] p-4 transition ${
        isOver ? "border-white/40 ring-2 ring-emerald-300/40 shadow-lg shadow-emerald-400/10" : "border-white/10"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          {PRIORITY_LABELS[bucketId]}
        </p>
        <span className="text-xs font-semibold text-zinc-500">
          {totalItems} {itemLabel}
          {totalItems === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {totalItems === 0 ? (
          <p className="text-sm text-zinc-500">No {emptyLabel}</p>
        ) : (
          <SortableContext
            items={sortableItems}
            strategy={verticalListSortingStrategy}
          >
            {children}
          </SortableContext>
        )}
      </div>
    </div>
  );
}

interface ActiveItemOverlayProps {
  activeId: string;
  projects: PriorityProject[];
  goals: PriorityGoal[];
}

function ActiveItemOverlay({
  activeId,
  projects,
  goals,
}: ActiveItemOverlayProps) {
  const payload = parseDraggableId(activeId);
  if (!payload) return null;

  const sharedClasses =
    "pointer-events-none select-none flex w-full items-center justify-between gap-3 rounded-xl border border-white/5 bg-[var(--surface)] px-3 py-2 shadow-2xl shadow-black/40 opacity-90";

  if (payload.type === "project") {
    const project = projects.find((entry) => entry.id === payload.id);
    if (!project) return null;

    const stageLabel = project.stage ? `Stage: ${formatEnumLabel(project.stage)}` : null;

    return (
      <div className={sharedClasses}>
        <div>
          <p className="text-sm font-semibold text-white">{project.name}</p>
          {stageLabel && <p className="text-xs text-zinc-500">{stageLabel}</p>}
        </div>
        {project.globalRank !== undefined && (
          <span className="text-xs font-semibold text-[var(--accent-red)]">
            #{project.globalRank}
          </span>
        )}
      </div>
    );
  }

  const goal = goals.find((entry) => entry.id === payload.id);
  if (!goal) return null;

  return (
    <div className={sharedClasses}>
      <div>
        <p className="text-sm font-semibold text-white">{goal.name}</p>
      </div>
    </div>
  );
}

const DROPPABLE_PRIORITY_PREFIX = "priority:";
const DRAGGABLE_PROJECT_PREFIX = "project:";
const DRAGGABLE_GOAL_PREFIX = "goal:";

type DraggableType = "project" | "goal";
type DraggablePayload = { type: DraggableType; id: string };

function buildPriorityDroppableId(bucketId: PriorityBucketId) {
  return `${DROPPABLE_PRIORITY_PREFIX}${bucketId}`;
}

function buildDraggableId(type: DraggableType, id: string) {
  return `${type}:${id}`;
}

function parsePriorityDroppableId(id?: string | null): PriorityBucketId | null {
  if (!id?.startsWith(DROPPABLE_PRIORITY_PREFIX)) {
    return null;
  }
  const bucketId = id.substring(DROPPABLE_PRIORITY_PREFIX.length) as PriorityBucketId;
  return PRIORITY_ORDER.includes(bucketId) ? bucketId : null;
}

function parseDraggableId(id?: string | null): DraggablePayload | null {
  if (!id) return null;
  if (id.startsWith(DRAGGABLE_PROJECT_PREFIX)) {
    return {
      type: "project",
      id: id.substring(DRAGGABLE_PROJECT_PREFIX.length),
    };
  }
  if (id.startsWith(DRAGGABLE_GOAL_PREFIX)) {
    return {
      type: "goal",
      id: id.substring(DRAGGABLE_GOAL_PREFIX.length),
    };
  }
  return null;
}

function compareGlobalRankValues(a?: number, b?: number): number {
  const normalize = (value?: number): number =>
    typeof value === "number" && Number.isFinite(value)
      ? value
      : Number.POSITIVE_INFINITY;

  const aValue = normalize(a);
  const bValue = normalize(b);
  if (aValue === bValue) return 0;
  return aValue < bValue ? -1 : 1;
}
