"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DndContext,
  DragEndEvent,
  MouseSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase";
import {
  formatEnumLabel,
  normalizeStage,
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

export default function PriorityEditorClient({
  initialProjects,
  initialGoals = [],
  initialError = null,
}: PriorityEditorClientProps) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [goals, setGoals] = useState(initialGoals);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [priorityUpdateError, setPriorityUpdateError] = useState<string | null>(null);
  const [view, setView] = useState<PriorityView>("projects");

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { delay: 200, tolerance: 6 },
  });
  const mouseSensor = useSensor(MouseSensor);
  const touchSensor = useSensor(TouchSensor);
  const sensors = useSensors(pointerSensor, mouseSensor, touchSensor);

  const handleDragStart = useCallback(() => {
    setPriorityUpdateError(null);
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
      if (a.globalRank !== undefined && b.globalRank !== undefined) {
        return a.globalRank - b.globalRank;
      }
      if (a.globalRank !== undefined) return -1;
      if (b.globalRank !== undefined) return 1;
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

    const sortedGoals = [...goals].sort((a, b) => a.name.localeCompare(b.name));
    for (const goal of sortedGoals) {
      buckets[goal.priority].push(goal);
    }
    return buckets;
  }, [goals]);

  const isProjectView = view === "projects";

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
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

  const handleRecalculate = async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setActionError("Unable to contact the backend.");
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setIsRecalculating(true);

    try {
      const { error: rpcError } = await supabase.rpc("recalculate_global_rank");
      if (rpcError) {
        console.error("Failed to recalculate global rank", rpcError);
        setActionError("Could not recalculate ranks.");
        return;
      }

      setActionMessage("Global ranks refreshed.");
      setLoading(true);
      await router.refresh();
    } catch (caught) {
      console.error("Recalculation request failed", caught);
      setActionError("Could not recalculate ranks.");
    } finally {
      setIsRecalculating(false);
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
          {isProjectView && (
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <button
                type="button"
                disabled={isRecalculating || loading}
                onClick={handleRecalculate}
                className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:border-white/40 disabled:cursor-not-allowed disabled:border-white/10 disabled:opacity-60"
              >
                {isRecalculating ? "Recalculating…" : "Recalculate ranks"}
              </button>
              <p className="text-xs text-zinc-400">
                Updates global_rank from priority/stage formula.
              </p>
              {actionError && <p className="text-xs text-red-300">{actionError}</p>}
              {!actionError && actionMessage && (
                <p className="text-xs text-emerald-200">{actionMessage}</p>
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
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
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

              return (
                <PriorityBucketColumn
                  key={bucketId}
                  bucketId={bucketId}
                  totalItems={totalItems}
                  itemLabel={itemLabel}
                  emptyLabel={emptyLabel}
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
        </DndContext>
      </div>
    </>
  );
}

type PriorityItemCardProps =
  | { type: "project"; item: PriorityProject }
  | { type: "goal"; item: PriorityGoal };

function PriorityItemCard({ type, item }: PriorityItemCardProps) {
  const draggableId = buildDraggableId(type, item.id);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: draggableId,
  });

  const stageLabel = item.stage ? `Stage: ${formatEnumLabel(item.stage)}` : null;
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      className={`flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-[var(--surface)] px-3 py-2 transition ${
        isDragging ? "shadow-2xl shadow-black/40" : ""
      } cursor-grab active:cursor-grabbing`}
    >
      <div>
        <p className="text-sm font-semibold text-white">{item.name}</p>
        {stageLabel && <p className="text-xs text-zinc-500">{stageLabel}</p>}
      </div>
      {type === "project" && item.globalRank !== undefined && (
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
  children: ReactNode;
}

function PriorityBucketColumn({
  bucketId,
  totalItems,
  itemLabel,
  emptyLabel,
  children,
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
          children
        )}
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
