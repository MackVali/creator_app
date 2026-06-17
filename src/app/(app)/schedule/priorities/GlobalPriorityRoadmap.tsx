"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ChevronDown, GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";
import { useFabCreation } from "@/components/ui/FabCreationContext";
import {
  compareRankValues,
  normalizePriority,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  sortGlobalPriorityItems,
  type GlobalPriorityRoadmapItem,
  type PriorityBucketId,
  type RoadmapPriorityGoal,
} from "./utils";

export type PriorityRoadmapSensors = ReturnType<typeof useSensors>;

export type GlobalPriorityOrderPayloadItem = {
  id: string;
  type: "goal" | "campaign";
  priority: PriorityBucketId;
};

export type CampaignGoalPriorityUpdate = {
  id: string;
  priority: PriorityBucketId;
  priorityOrder: number;
};

export type GlobalPriorityGoalLongPressEditHandler = (
  goal: Pick<GlobalPriorityRoadmapItem | RoadmapPriorityGoal, "id" | "name">,
  element: HTMLElement
) => void;

type DragScrollTarget = Element | Window;
type DragHandleListenerMap = {
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onTouchStart?: (event: ReactTouchEvent<HTMLButtonElement>) => void;
};

const GLOBAL_PRIORITY_BUCKET_PREFIX = "global-priority-bucket:";
const CAMPAIGN_GOAL_BUCKET_PREFIX = "campaign-goal-bucket:";
const EDGE_AUTOSCROLL_THRESHOLD_PX = 96;
const EDGE_AUTOSCROLL_MAX_STEP_PX = 12;
const PRIORITY_EDIT_LONG_PRESS_MS = 560;
const PRIORITY_EDIT_LONG_PRESS_MOVE_TOLERANCE_PX = 8;
const PRIORITY_DND_AUTO_SCROLL = {
  threshold: { x: 0, y: 0.16 },
  acceleration: 8,
  interval: 5,
};

export function usePriorityRoadmapSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
  );
}

export function parseGlobalPriorityBucketId(
  value: string
): PriorityBucketId | null {
  if (!value.startsWith(GLOBAL_PRIORITY_BUCKET_PREFIX)) return null;
  const bucket = value.slice(GLOBAL_PRIORITY_BUCKET_PREFIX.length);
  return PRIORITY_ORDER.includes(bucket as PriorityBucketId)
    ? (bucket as PriorityBucketId)
    : null;
}

function getCampaignGoalBucketId(campaignId: string, priority: PriorityBucketId) {
  return `${CAMPAIGN_GOAL_BUCKET_PREFIX}${campaignId}:${priority}`;
}

export function parseCampaignGoalBucketId(
  value: string,
  campaignId: string
): PriorityBucketId | null {
  const prefix = `${CAMPAIGN_GOAL_BUCKET_PREFIX}${campaignId}:`;
  if (!value.startsWith(prefix)) return null;
  const bucket = value.slice(prefix.length);
  return PRIORITY_ORDER.includes(bucket as PriorityBucketId)
    ? (bucket as PriorityBucketId)
    : null;
}

function getGlobalPriorityItemDragId(item: GlobalPriorityRoadmapItem) {
  return `global-priority-item:${item.type}:${item.id}`;
}

function getCampaignGoalDragId(campaignId: string, goalId: string) {
  return `campaign-goal:${campaignId}:${goalId}`;
}

function isSameGlobalPriorityItem(
  a: Pick<GlobalPriorityRoadmapItem, "id" | "type">,
  b: Pick<GlobalPriorityRoadmapItem, "id" | "type">
) {
  return a.type === b.type && a.id === b.id;
}

function assignGlobalPriorityOrders(
  items: GlobalPriorityRoadmapItem[]
): GlobalPriorityRoadmapItem[] {
  const nextOrderByPriority = new Map<PriorityBucketId, number>();

  return items.map((item) => {
    const nextOrder = (nextOrderByPriority.get(item.priority) ?? 0) + 1;
    nextOrderByPriority.set(item.priority, nextOrder);
    return { ...item, priorityOrder: nextOrder };
  });
}

export function buildGlobalPriorityOrderPayload(
  items: GlobalPriorityRoadmapItem[]
): GlobalPriorityOrderPayloadItem[] {
  const seenItems = new Set<string>();
  const payload: GlobalPriorityOrderPayloadItem[] = [];

  for (const item of items) {
    const itemIds =
      item.type === "campaign" && item.sourceIds && item.sourceIds.length > 0
        ? item.sourceIds
        : [item.id];

    for (const itemId of itemIds) {
      const itemKey = `${item.type}:${itemId}`;
      if (seenItems.has(itemKey)) continue;
      seenItems.add(itemKey);
      payload.push({
        id: itemId,
        type: item.type,
        priority: item.priority,
      });
    }
  }

  return payload;
}

export function clearGlobalPriorityRanks(
  items: GlobalPriorityRoadmapItem[]
): GlobalPriorityRoadmapItem[] {
  return items.map((item) => {
    const nextItem: GlobalPriorityRoadmapItem = { ...item };
    delete nextItem.globalRank;

    if (item.goals) {
      nextItem.goals = item.goals.map((goal) => {
        const nextGoal: RoadmapPriorityGoal = { ...goal };
        delete nextGoal.globalRank;
        return nextGoal;
      });
    }

    return nextItem;
  });
}

export function moveGlobalPriorityItem(
  items: GlobalPriorityRoadmapItem[],
  draggedItem: GlobalPriorityRoadmapItem,
  targetPriority: PriorityBucketId,
  overItem?: GlobalPriorityRoadmapItem
): GlobalPriorityRoadmapItem[] {
  const sortedItems = sortGlobalPriorityItems(items);
  const buckets = new Map<PriorityBucketId, GlobalPriorityRoadmapItem[]>(
    PRIORITY_ORDER.map((priority) => [
      priority,
      sortedItems.filter((item) => item.priority === priority),
    ])
  );
  const currentItem =
    sortedItems.find((item) => isSameGlobalPriorityItem(item, draggedItem)) ??
    draggedItem;
  const currentBucket = buckets.get(currentItem.priority) ?? [];

  if (
    overItem &&
    currentItem.priority === targetPriority &&
    overItem.priority === targetPriority
  ) {
    const oldIndex = currentBucket.findIndex((item) =>
      isSameGlobalPriorityItem(item, currentItem)
    );
    const newIndex = currentBucket.findIndex((item) =>
      isSameGlobalPriorityItem(item, overItem)
    );

    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
      return sortedItems;
    }

    buckets.set(targetPriority, arrayMove(currentBucket, oldIndex, newIndex));
    return assignGlobalPriorityOrders(
      PRIORITY_ORDER.flatMap((priority) => buckets.get(priority) ?? [])
    );
  }

  for (const priority of PRIORITY_ORDER) {
    buckets.set(
      priority,
      (buckets.get(priority) ?? []).filter(
        (item) => !isSameGlobalPriorityItem(item, currentItem)
      )
    );
  }

  const targetItems = buckets.get(targetPriority) ?? [];
  const movedItem = { ...currentItem, priority: targetPriority };

  if (overItem && overItem.priority === targetPriority) {
    const overIndex = targetItems.findIndex((item) =>
      isSameGlobalPriorityItem(item, overItem)
    );
    targetItems.splice(overIndex >= 0 ? overIndex : targetItems.length, 0, movedItem);
  } else {
    targetItems.push(movedItem);
  }

  buckets.set(targetPriority, targetItems);

  return assignGlobalPriorityOrders(
    PRIORITY_ORDER.flatMap((priority) => buckets.get(priority) ?? [])
  );
}

export function globalPriorityOrdersMatch(
  previousItems: GlobalPriorityRoadmapItem[],
  nextItems: GlobalPriorityRoadmapItem[]
) {
  const previous = sortGlobalPriorityItems(previousItems);
  if (previous.length !== nextItems.length) return false;

  return previous.every((item, index) => {
    const nextItem = nextItems[index];
    return (
      nextItem &&
      isSameGlobalPriorityItem(item, nextItem) &&
      item.priority === nextItem.priority &&
      item.priorityOrder === nextItem.priorityOrder
    );
  });
}

function compareText(a?: string | null, b?: string | null) {
  return (a ?? "").localeCompare(b ?? "");
}

function compareCampaignGoalsByPriority(
  a: RoadmapPriorityGoal,
  b: RoadmapPriorityGoal
) {
  const aPriority = normalizePriority(a.priority);
  const bPriority = normalizePriority(b.priority);
  const priorityDelta =
    PRIORITY_ORDER.indexOf(aPriority) - PRIORITY_ORDER.indexOf(bPriority);
  if (priorityDelta !== 0) return priorityDelta;

  const priorityOrderDelta = compareRankValues(a.priorityOrder, b.priorityOrder);
  if (priorityOrderDelta !== 0) return priorityOrderDelta;

  const priorityRankDelta = compareRankValues(a.priorityRank, b.priorityRank);
  if (priorityRankDelta !== 0) return priorityRankDelta;

  const campaignPositionDelta = compareRankValues(
    a.campaignPosition,
    b.campaignPosition
  );
  if (campaignPositionDelta !== 0) return campaignPositionDelta;

  const campaignCreatedDelta = compareText(
    a.campaignGoalCreatedAt,
    b.campaignGoalCreatedAt
  );
  if (campaignCreatedDelta !== 0) return campaignCreatedDelta;

  const createdDelta = compareText(a.createdAt, b.createdAt);
  if (createdDelta !== 0) return createdDelta;

  return compareText(a.id, b.id);
}

function groupCampaignGoalsByPriority(goals: RoadmapPriorityGoal[]) {
  const seenGoalIds = new Set<string>();
  const grouped = new Map<PriorityBucketId, RoadmapPriorityGoal[]>(
    PRIORITY_ORDER.map((priority) => [priority, []])
  );

  for (const goal of [...goals].sort(compareCampaignGoalsByPriority)) {
    if (seenGoalIds.has(goal.id)) continue;
    seenGoalIds.add(goal.id);
    grouped.get(normalizePriority(goal.priority))?.push(goal);
  }

  return PRIORITY_ORDER.map((priority) => ({
    priority,
    goals: grouped.get(priority) ?? [],
  }));
}

function assignCampaignGoalPriorityOrders(
  goals: RoadmapPriorityGoal[]
): RoadmapPriorityGoal[] {
  const nextOrderByPriority = new Map<PriorityBucketId, number>();

  return goals.map((goal) => {
    const priority = normalizePriority(goal.priority);
    const nextOrder = (nextOrderByPriority.get(priority) ?? 0) + 1;
    nextOrderByPriority.set(priority, nextOrder);
    return { ...goal, priority, priorityOrder: nextOrder };
  });
}

export function moveCampaignGoal(
  goals: RoadmapPriorityGoal[],
  draggedGoal: RoadmapPriorityGoal,
  targetPriority: PriorityBucketId,
  overGoal?: RoadmapPriorityGoal
): RoadmapPriorityGoal[] {
  const buckets = new Map<PriorityBucketId, RoadmapPriorityGoal[]>(
    groupCampaignGoalsByPriority(goals).map((bucket) => [
      bucket.priority,
      bucket.goals,
    ])
  );
  const currentGoal =
    goals.find((goal) => goal.id === draggedGoal.id) ?? draggedGoal;
  const currentPriority = normalizePriority(currentGoal.priority);
  const currentBucket = buckets.get(currentPriority) ?? [];

  if (
    overGoal &&
    currentPriority === targetPriority &&
    normalizePriority(overGoal.priority) === targetPriority
  ) {
    const oldIndex = currentBucket.findIndex((goal) => goal.id === currentGoal.id);
    const newIndex = currentBucket.findIndex((goal) => goal.id === overGoal.id);

    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
      return assignCampaignGoalPriorityOrders(
        PRIORITY_ORDER.flatMap((priority) => buckets.get(priority) ?? [])
      );
    }

    buckets.set(targetPriority, arrayMove(currentBucket, oldIndex, newIndex));
    return assignCampaignGoalPriorityOrders(
      PRIORITY_ORDER.flatMap((priority) => buckets.get(priority) ?? [])
    );
  }

  for (const priority of PRIORITY_ORDER) {
    buckets.set(
      priority,
      (buckets.get(priority) ?? []).filter((goal) => goal.id !== currentGoal.id)
    );
  }

  const targetGoals = buckets.get(targetPriority) ?? [];
  const movedGoal = { ...currentGoal, priority: targetPriority };

  if (overGoal && normalizePriority(overGoal.priority) === targetPriority) {
    const overIndex = targetGoals.findIndex((goal) => goal.id === overGoal.id);
    targetGoals.splice(overIndex >= 0 ? overIndex : targetGoals.length, 0, movedGoal);
  } else {
    targetGoals.push(movedGoal);
  }

  buckets.set(targetPriority, targetGoals);

  return assignCampaignGoalPriorityOrders(
    PRIORITY_ORDER.flatMap((priority) => buckets.get(priority) ?? [])
  );
}

export function mergeVisibleCampaignGoalOrder(
  fullGoals: RoadmapPriorityGoal[],
  previousVisibleGoals: RoadmapPriorityGoal[],
  nextVisibleGoals: RoadmapPriorityGoal[]
): RoadmapPriorityGoal[] {
  const visibleGoalIds = new Set(previousVisibleGoals.map((goal) => goal.id));
  const remainingVisibleGoalsByPriority = new Map<
    PriorityBucketId,
    RoadmapPriorityGoal[]
  >(
    groupCampaignGoalsByPriority(nextVisibleGoals).map((bucket) => [
      bucket.priority,
      [...bucket.goals],
    ])
  );
  const fullGoalsByPriority = new Map<PriorityBucketId, RoadmapPriorityGoal[]>(
    groupCampaignGoalsByPriority(fullGoals).map((bucket) => [
      bucket.priority,
      bucket.goals,
    ])
  );

  const mergedGoals = PRIORITY_ORDER.flatMap((priority) => {
    const remainingVisibleGoals =
      remainingVisibleGoalsByPriority.get(priority) ?? [];
    const mergedBucketGoals: RoadmapPriorityGoal[] = [];

    for (const goal of fullGoalsByPriority.get(priority) ?? []) {
      if (!visibleGoalIds.has(goal.id)) {
        mergedBucketGoals.push(goal);
        continue;
      }

      const nextVisibleGoal = remainingVisibleGoals.shift();
      if (nextVisibleGoal) {
        mergedBucketGoals.push({ ...nextVisibleGoal, priority });
      }
    }

    for (const goal of remainingVisibleGoals) {
      mergedBucketGoals.push({ ...goal, priority });
    }

    return mergedBucketGoals;
  });

  return assignCampaignGoalPriorityOrders(mergedGoals);
}

export function campaignGoalOrdersMatch(
  previousGoals: RoadmapPriorityGoal[],
  nextGoals: RoadmapPriorityGoal[]
) {
  const previous = assignCampaignGoalPriorityOrders(
    groupCampaignGoalsByPriority(previousGoals).flatMap((bucket) => bucket.goals)
  );
  if (previous.length !== nextGoals.length) return false;

  return previous.every((goal, index) => {
    const nextGoal = nextGoals[index];
    return (
      nextGoal &&
      goal.id === nextGoal.id &&
      normalizePriority(goal.priority) === normalizePriority(nextGoal.priority) &&
      goal.priorityOrder === nextGoal.priorityOrder
    );
  });
}

export function buildCampaignGoalPriorityUpdates(
  previousGoals: RoadmapPriorityGoal[],
  nextGoals: RoadmapPriorityGoal[]
): CampaignGoalPriorityUpdate[] {
  const previousGoalsById = new Map(
    previousGoals.map((goal) => [
      goal.id,
      {
        priority: normalizePriority(goal.priority),
        priorityOrder: goal.priorityOrder,
      },
    ])
  );
  const updatesById = new Map<string, CampaignGoalPriorityUpdate>();

  for (const goal of nextGoals) {
    const previous = previousGoalsById.get(goal.id);
    const priority = normalizePriority(goal.priority);
    const priorityOrder =
      typeof goal.priorityOrder === "number" &&
      Number.isFinite(goal.priorityOrder) &&
      goal.priorityOrder > 0
        ? goal.priorityOrder
        : 1;

    if (
      !previous ||
      previous.priority !== priority ||
      previous.priorityOrder !== priorityOrder
    ) {
      updatesById.set(goal.id, {
        id: goal.id,
        priority,
        priorityOrder,
      });
    }
  }

  return Array.from(updatesById.values());
}

export function applyCampaignGoalOrder(
  items: GlobalPriorityRoadmapItem[],
  campaignId: string,
  nextGoals: RoadmapPriorityGoal[]
) {
  const updatedGoalsById = new Map(nextGoals.map((goal) => [goal.id, goal]));

  return items.map((item) => {
    if (item.type !== "campaign" || !item.goals) return item;

    if (item.id === campaignId) {
      return { ...item, goals: nextGoals };
    }

    const hasUpdatedGoal = item.goals.some((goal) =>
      updatedGoalsById.has(goal.id)
    );
    if (!hasUpdatedGoal) return item;

    return {
      ...item,
      goals: groupCampaignGoalsByPriority(
        item.goals.map((goal) => updatedGoalsById.get(goal.id) ?? goal)
      ).flatMap((bucket) => bucket.goals),
    };
  });
}

export function GlobalPriorityRoadmap({
  title = "Global Goal Roadmap",
  items,
  error,
  isSaving,
  sensors,
  isFiltered,
  onGoalOpen,
  onGoalLongPressEdit,
  onDragEnd,
  onCampaignGoalDragEnd,
}: {
  title?: string;
  items: GlobalPriorityRoadmapItem[];
  error: string | null;
  isSaving: boolean;
  sensors: PriorityRoadmapSensors;
  isFiltered: boolean;
  onGoalOpen?: (goalId: string) => void;
  onGoalLongPressEdit?: GlobalPriorityGoalLongPressEditHandler;
  onDragEnd: (
    event: DragEndEvent,
    previewItems?: GlobalPriorityRoadmapItem[] | null
  ) => void;
  onCampaignGoalDragEnd: (
    campaign: GlobalPriorityRoadmapItem,
    event: DragEndEvent
  ) => void;
}) {
  const fabCreation = useFabCreation();
  const [openCampaignIds, setOpenCampaignIds] = useState<Record<string, boolean>>(
    {}
  );
  const [activePriorityItem, setActivePriorityItem] =
    useState<GlobalPriorityRoadmapItem | null>(null);
  const [previewPriorityItems, setPreviewPriorityItems] = useState<
    GlobalPriorityRoadmapItem[] | null
  >(null);
  const {
    start: startEdgeAutoscroll,
    stop: stopEdgeAutoscroll,
  } = usePriorityDragEdgeAutoscroll();
  const displayedItems = previewPriorityItems ?? items;
  const itemsByPriority = useMemo(() => {
    const grouped = new Map<PriorityBucketId, GlobalPriorityRoadmapItem[]>(
      PRIORITY_ORDER.map((priority) => [priority, []])
    );

    for (const item of sortGlobalPriorityItems(displayedItems)) {
      grouped.get(item.priority)?.push(item);
    }

    return grouped;
  }, [displayedItems]);
  const handleToggleCampaign = useCallback((campaignId: string) => {
    setOpenCampaignIds((current) => ({
      ...current,
      [campaignId]: !current[campaignId],
    }));
  }, []);
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const activeData = event.active.data.current as
        | { item?: GlobalPriorityRoadmapItem }
        | undefined;
      if (!activeData?.item) return;

      setActivePriorityItem(activeData.item);
      setPreviewPriorityItems(items);
      startEdgeAutoscroll(event.activatorEvent);
    },
    [items, startEdgeAutoscroll]
  );
  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeData = active.data.current as
        | { item?: GlobalPriorityRoadmapItem }
        | undefined;
      const draggedItem = activeData?.item;
      if (!draggedItem) return;

      const overData = over.data.current as
        | { bucket?: PriorityBucketId; item?: GlobalPriorityRoadmapItem }
        | undefined;
      const overBucket =
        overData?.bucket ??
        overData?.item?.priority ??
        parseGlobalPriorityBucketId(String(over.id));
      if (!overBucket) return;

      setPreviewPriorityItems((currentPreviewItems) => {
        const previousItems = currentPreviewItems ?? items;
        const nextPreviewItems = moveGlobalPriorityItem(
          previousItems,
          draggedItem,
          overBucket,
          overData?.item
        );

        return globalPriorityOrdersMatch(previousItems, nextPreviewItems)
          ? currentPreviewItems
          : nextPreviewItems;
      });
    },
    [items]
  );
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const previewItemsOnDrop = previewPriorityItems;
      setActivePriorityItem(null);
      setPreviewPriorityItems(null);
      stopEdgeAutoscroll();
      onDragEnd(event, isFiltered ? null : previewItemsOnDrop);
    },
    [isFiltered, onDragEnd, previewPriorityItems, stopEdgeAutoscroll]
  );
  const handleDragCancel = useCallback(() => {
    setActivePriorityItem(null);
    setPreviewPriorityItems(null);
    stopEdgeAutoscroll();
  }, [stopEdgeAutoscroll]);
  const handleDefaultGoalLongPressEdit = useCallback(
    (
      goal: Pick<GlobalPriorityRoadmapItem | RoadmapPriorityGoal, "id" | "name">,
      element: HTMLElement
    ) => {
      fabCreation?.requestEntityEdit({
        entityType: "GOAL",
        entityId: goal.id,
        title: goal.name,
        originRect: getPriorityRowFabOriginRect(element),
      });
    },
    [fabCreation]
  );
  const handleGoalLongPressEdit =
    onGoalLongPressEdit ?? handleDefaultGoalLongPressEdit;

  return (
    <div className="space-y-2">
      <RoadmapExteriorTitle title={title} isSaving={isSaving} />
      <section className="overflow-hidden rounded-[20px] border border-black/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.075),rgba(113,113,122,0.10)_30%,rgba(24,24,27,0.34)_62%,rgba(255,255,255,0.035))] p-px shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_14px_36px_rgba(0,0,0,0.34)] sm:rounded-[22px]">
        <div className="rounded-[19px] border border-black/60 bg-zinc-950/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_0_22px_rgba(255,255,255,0.018),inset_0_-18px_30px_rgba(0,0,0,0.34)] sm:rounded-[21px] sm:p-4">
          {error ? <p className="mb-2 px-1 text-xs text-red-200/85">{error}</p> : null}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            autoScroll={PRIORITY_DND_AUTO_SCROLL}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="space-y-3">
              {PRIORITY_ORDER.map((priority) => {
                const bucketItems = itemsByPriority.get(priority) ?? [];

                return (
                  <GlobalPriorityBucket
                    key={priority}
                    priority={priority}
                    items={bucketItems}
                    openCampaignIds={openCampaignIds}
                    onToggleCampaign={handleToggleCampaign}
                    sensors={sensors}
                    isTopLevelDragDisabled={false}
                    isCampaignGoalDragDisabled={false}
                    onGoalOpen={onGoalOpen}
                    onGoalLongPressEdit={handleGoalLongPressEdit}
                    onCampaignGoalDragEnd={onCampaignGoalDragEnd}
                  />
                );
              })}
            </div>
            <PriorityRoadmapDragOverlay zIndex={1000}>
              {activePriorityItem ? (
                <GlobalPriorityItemDragOverlay item={activePriorityItem} />
              ) : null}
            </PriorityRoadmapDragOverlay>
          </DndContext>
        </div>
      </section>
    </div>
  );
}

function RoadmapExteriorTitle({
  title,
  isSaving,
}: {
  title: string;
  isSaving: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 sm:px-5">
      <h2 className="text-[11px] font-semibold uppercase text-white/35">
        {title}
      </h2>
      {isSaving ? (
        <span className="text-[11px] font-medium text-white/35">Saving</span>
      ) : null}
    </div>
  );
}

function GlobalPriorityBucket({
  priority,
  items,
  openCampaignIds,
  onToggleCampaign,
  sensors,
  isTopLevelDragDisabled,
  isCampaignGoalDragDisabled,
  onGoalOpen,
  onGoalLongPressEdit,
  onCampaignGoalDragEnd,
}: {
  priority: PriorityBucketId;
  items: GlobalPriorityRoadmapItem[];
  openCampaignIds: Record<string, boolean>;
  onToggleCampaign: (campaignId: string) => void;
  sensors: PriorityRoadmapSensors;
  isTopLevelDragDisabled: boolean;
  isCampaignGoalDragDisabled: boolean;
  onGoalOpen?: (goalId: string) => void;
  onGoalLongPressEdit: (
    goal: Pick<GlobalPriorityRoadmapItem | RoadmapPriorityGoal, "id" | "name">,
    element: HTMLElement
  ) => void;
  onCampaignGoalDragEnd: (
    campaign: GlobalPriorityRoadmapItem,
    event: DragEndEvent
  ) => void;
}) {
  const bucketId = `${GLOBAL_PRIORITY_BUCKET_PREFIX}${priority}`;
  const { setNodeRef, isOver } = useDroppable({
    id: bucketId,
    data: { bucket: priority },
  });

  return (
    <div ref={setNodeRef} className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[10px] font-semibold uppercase leading-none tracking-normal text-zinc-600">
          {PRIORITY_LABELS[priority]}
        </p>
        <span className="text-[10px] font-semibold leading-none text-zinc-700">
          {items.length}
        </span>
      </div>
      <SortableContext
        items={items.map(getGlobalPriorityItemDragId)}
        strategy={verticalListSortingStrategy}
      >
        <div
          className={cn(
            "min-h-8 overflow-hidden rounded-[16px] border border-black/60 bg-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]",
            isOver ? "bg-white/[0.035]" : ""
          )}
        >
          {items.length > 0 ? (
            items.map((item) => (
              <SortableGlobalPriorityItem
                key={`${item.type}:${item.id}`}
                item={item}
                isOpen={
                  item.type === "campaign" ? openCampaignIds[item.id] ?? false : false
                }
                onToggle={() => onToggleCampaign(item.id)}
                sensors={sensors}
                isTopLevelDragDisabled={isTopLevelDragDisabled}
                isCampaignGoalDragDisabled={isCampaignGoalDragDisabled}
                onGoalOpen={onGoalOpen}
                onGoalLongPressEdit={onGoalLongPressEdit}
                onCampaignGoalDragEnd={onCampaignGoalDragEnd}
              />
            ))
          ) : (
            <div className="min-h-8 px-2 py-2 text-[11px] font-medium text-zinc-800">
              Empty
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableGlobalPriorityItem({
  item,
  isOpen,
  onToggle,
  sensors,
  isTopLevelDragDisabled,
  isCampaignGoalDragDisabled,
  onGoalOpen,
  onGoalLongPressEdit,
  onCampaignGoalDragEnd,
}: {
  item: GlobalPriorityRoadmapItem;
  isOpen: boolean;
  onToggle: () => void;
  sensors: PriorityRoadmapSensors;
  isTopLevelDragDisabled: boolean;
  isCampaignGoalDragDisabled: boolean;
  onGoalOpen?: (goalId: string) => void;
  onGoalLongPressEdit: (
    goal: Pick<GlobalPriorityRoadmapItem | RoadmapPriorityGoal, "id" | "name">,
    element: HTMLElement
  ) => void;
  onCampaignGoalDragEnd: (
    campaign: GlobalPriorityRoadmapItem,
    event: DragEndEvent
  ) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: getGlobalPriorityItemDragId(item),
    data: { item, bucket: item.priority },
    disabled: isTopLevelDragDisabled,
  });
  const isCampaign = item.type === "campaign";
  const identity = getGlobalPriorityItemIdentity(item);
  const globalRank = isCampaign ? null : getGlobalPriorityItemRank(item);
  const campaignGoalBuckets = useMemo(
    () => groupCampaignGoalsByPriority(item.goals ?? []),
    [item.goals]
  );
  const [activeCampaignGoal, setActiveCampaignGoal] =
    useState<RoadmapPriorityGoal | null>(null);
  const {
    start: startCampaignGoalEdgeAutoscroll,
    stop: stopCampaignGoalEdgeAutoscroll,
  } = usePriorityDragEdgeAutoscroll();
  const handleCampaignGoalDragStart = useCallback(
    (event: DragStartEvent) => {
      const activeData = event.active.data.current as
        | { campaignId?: string; goal?: RoadmapPriorityGoal }
        | undefined;
      if (
        isCampaignGoalDragDisabled ||
        !activeData?.goal ||
        activeData.campaignId !== item.id
      ) {
        return;
      }

      setActiveCampaignGoal(activeData.goal);
      startCampaignGoalEdgeAutoscroll(event.activatorEvent);
    },
    [isCampaignGoalDragDisabled, item.id, startCampaignGoalEdgeAutoscroll]
  );
  const handleCampaignGoalDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveCampaignGoal(null);
      stopCampaignGoalEdgeAutoscroll();
      if (isCampaignGoalDragDisabled) return;
      onCampaignGoalDragEnd(item, event);
    },
    [
      isCampaignGoalDragDisabled,
      item,
      onCampaignGoalDragEnd,
      stopCampaignGoalEdgeAutoscroll,
    ]
  );
  const handleCampaignGoalDragCancel = useCallback(() => {
    setActiveCampaignGoal(null);
    stopCampaignGoalEdgeAutoscroll();
  }, [stopCampaignGoalEdgeAutoscroll]);
  const dragHandleListeners = listeners as DragHandleListenerMap | undefined;
  const handleDragHandlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      dragHandleListeners?.onPointerDown?.(event);
    },
    [dragHandleListeners]
  );
  const handleDragHandleTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      dragHandleListeners?.onTouchStart?.(event);
    },
    [dragHandleListeners]
  );
  const style: CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
  };
  const handleGoalLongPress = useCallback(
    (element: HTMLElement) => {
      if (isDragging || isCampaign) return;
      onGoalLongPressEdit(item, element);
    },
    [isCampaign, isDragging, item, onGoalLongPressEdit]
  );
  const goalLongPressHandlers = usePriorityEditLongPress(
    handleGoalLongPress,
    isDragging || isCampaign
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "border-b border-black/40 bg-white/[0.026] last:border-b-0",
        isDragging
          ? "relative z-10 bg-white/[0.018] opacity-45 shadow-none ring-1 ring-white/[0.06]"
          : ""
      )}
    >
      <div className="flex min-h-10 items-center gap-2 px-2 py-1.5 sm:px-2.5">
        <button
          ref={setActivatorNodeRef}
          type="button"
          disabled={isTopLevelDragDisabled}
          className={cn(
            "flex size-7 shrink-0 touch-none items-center justify-center rounded-lg border border-black/60 bg-black/30 text-zinc-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] transition",
            isTopLevelDragDisabled
              ? "cursor-default opacity-45"
              : "cursor-grab hover:bg-white/[0.045] hover:text-zinc-300 active:cursor-grabbing"
          )}
          aria-label={`Move ${item.name} priority`}
          {...attributes}
          {...listeners}
          onPointerDown={handleDragHandlePointerDown}
          onTouchStart={handleDragHandleTouchStart}
        >
          <GripVertical className="size-3.5" aria-hidden="true" />
        </button>
        {isCampaign ? (
          <>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-black/60 bg-white/[0.04] text-[11px] font-semibold text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              {identity}
            </span>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={onToggle}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1 text-left outline-none transition hover:bg-white/[0.025] focus-visible:ring-1 focus-visible:ring-white/15"
            >
              <p className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight text-white/82">
                {item.name}
              </p>
              <span className="shrink-0 text-[10px] font-semibold leading-none text-zinc-600">
                {item.goals?.length ?? 0} Goal
                {item.goals?.length === 1 ? "" : "s"}
              </span>
              <ChevronDown
                className={cn(
                  "size-3.5 shrink-0 text-zinc-600 transition-transform",
                  isOpen ? "rotate-180" : ""
                )}
                aria-hidden="true"
              />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onGoalOpen ? () => onGoalOpen(item.id) : undefined}
            {...goalLongPressHandlers}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1 text-left outline-none transition hover:bg-white/[0.025] focus-visible:ring-1 focus-visible:ring-white/15"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-black/60 bg-white/[0.04] text-[11px] font-semibold text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              {identity}
            </span>
            <p className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight text-white/82">
              {item.name}
            </p>
            {globalRank ? (
              <span className="shrink-0 text-[11px] font-semibold leading-none text-zinc-600">
                #{globalRank}
              </span>
            ) : null}
          </button>
        )}
      </div>
      {isCampaign && isOpen ? (
        <div className="border-t border-black/35 bg-black/20 px-2 pb-2 pt-1.5 sm:px-2.5">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            autoScroll={PRIORITY_DND_AUTO_SCROLL}
            onDragStart={handleCampaignGoalDragStart}
            onDragEnd={handleCampaignGoalDragEnd}
            onDragCancel={handleCampaignGoalDragCancel}
          >
            <div className="ml-1 space-y-1.5">
              {campaignGoalBuckets.map((bucket) => (
                <CampaignGoalPriorityBucket
                  key={bucket.priority}
                  campaignId={item.id}
                  bucket={bucket}
                  isDragDisabled={isCampaignGoalDragDisabled}
                  onGoalOpen={onGoalOpen}
                  onGoalLongPressEdit={onGoalLongPressEdit}
                />
              ))}
            </div>
            <PriorityRoadmapDragOverlay zIndex={1001}>
              {activeCampaignGoal ? (
                <CampaignGoalDragOverlay goal={activeCampaignGoal} />
              ) : null}
            </PriorityRoadmapDragOverlay>
          </DndContext>
        </div>
      ) : null}
    </div>
  );
}

function getGlobalPriorityItemIdentity(item: GlobalPriorityRoadmapItem) {
  return (
    item.emoji?.trim() ||
    item.monumentEmoji?.trim() ||
    getInitials(item.name) ||
    (item.type === "campaign" ? "C" : "G")
  );
}

function getGlobalPriorityItemRank(item: GlobalPriorityRoadmapItem) {
  return item.type === "goal" &&
    typeof item.globalRank === "number" &&
    Number.isFinite(item.globalRank) &&
    item.globalRank > 0
    ? item.globalRank
    : null;
}

function GlobalPriorityItemDragOverlay({
  item,
}: {
  item: GlobalPriorityRoadmapItem;
}) {
  const isCampaign = item.type === "campaign";
  const identity = getGlobalPriorityItemIdentity(item);
  const globalRank = isCampaign ? null : getGlobalPriorityItemRank(item);

  return (
    <div className="scale-[1.015] overflow-hidden rounded-[16px] border border-white/[0.13] bg-zinc-950/95 opacity-[0.98] shadow-[0_22px_48px_rgba(0,0,0,0.68),inset_0_1px_0_rgba(255,255,255,0.075)] ring-1 ring-white/[0.08] backdrop-blur-md">
      <div className="flex min-h-10 items-center gap-2 px-2 py-1.5 sm:px-2.5">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-black/60 bg-black/35 text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]"
          aria-hidden="true"
        >
          <GripVertical className="size-3.5" />
        </span>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-black/60 bg-white/[0.06] text-[11px] font-semibold text-white/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          {identity}
        </span>
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight text-white/88">
          {item.name}
        </p>
        {isCampaign ? (
          <>
            <span className="shrink-0 text-[10px] font-semibold leading-none text-zinc-500">
              {item.goals?.length ?? 0} Goal{item.goals?.length === 1 ? "" : "s"}
            </span>
            <ChevronDown
              className="size-3.5 shrink-0 text-zinc-500"
              aria-hidden="true"
            />
          </>
        ) : globalRank ? (
          <span className="shrink-0 text-[11px] font-semibold leading-none text-zinc-500">
            #{globalRank}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function CampaignGoalPriorityBucket({
  campaignId,
  bucket,
  isDragDisabled,
  onGoalOpen,
  onGoalLongPressEdit,
}: {
  campaignId: string;
  bucket: { priority: PriorityBucketId; goals: RoadmapPriorityGoal[] };
  isDragDisabled: boolean;
  onGoalOpen?: (goalId: string) => void;
  onGoalLongPressEdit: (
    goal: Pick<GlobalPriorityRoadmapItem | RoadmapPriorityGoal, "id" | "name">,
    element: HTMLElement
  ) => void;
}) {
  const bucketId = getCampaignGoalBucketId(campaignId, bucket.priority);
  const { setNodeRef, isOver } = useDroppable({
    id: bucketId,
    data: { campaignId, bucket: bucket.priority },
  });
  const isEmpty = bucket.goals.length === 0;

  return (
    <div ref={isEmpty ? setNodeRef : undefined} className="space-y-1">
      <p className="px-1 text-[9px] font-semibold uppercase leading-none tracking-normal text-zinc-700">
        {PRIORITY_LABELS[bucket.priority]}
      </p>
      <SortableContext
        items={bucket.goals.map((goal) =>
          getCampaignGoalDragId(campaignId, goal.id)
        )}
        strategy={verticalListSortingStrategy}
      >
        {isEmpty ? (
          <div
            className={cn("h-1 rounded-md", isOver ? "bg-white/[0.03]" : "")}
            aria-hidden="true"
          />
        ) : (
          <div
            ref={setNodeRef}
            className={cn(
              "min-h-8 space-y-1 rounded-lg border border-black/40 bg-black/20 p-1",
              isOver ? "bg-white/[0.03]" : ""
            )}
          >
            {bucket.goals.map((goal) => (
              <GlobalCampaignGoalRow
                key={goal.id}
                campaignId={campaignId}
                goal={goal}
                isDragDisabled={isDragDisabled}
                onGoalOpen={onGoalOpen}
                onGoalLongPressEdit={onGoalLongPressEdit}
              />
            ))}
          </div>
        )}
      </SortableContext>
    </div>
  );
}

function GlobalCampaignGoalRow({
  campaignId,
  goal,
  isDragDisabled,
  onGoalOpen,
  onGoalLongPressEdit,
}: {
  campaignId: string;
  goal: RoadmapPriorityGoal;
  isDragDisabled: boolean;
  onGoalOpen?: (goalId: string) => void;
  onGoalLongPressEdit: (
    goal: Pick<GlobalPriorityRoadmapItem | RoadmapPriorityGoal, "id" | "name">,
    element: HTMLElement
  ) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: getCampaignGoalDragId(campaignId, goal.id),
    data: {
      campaignId,
      goal,
      bucket: normalizePriority(goal.priority),
    },
    disabled: isDragDisabled,
  });
  const identity = getCampaignGoalIdentity(goal);
  const globalRank = getCampaignGoalRank(goal);
  const dragHandleListeners = listeners as DragHandleListenerMap | undefined;
  const handleDragHandlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      dragHandleListeners?.onPointerDown?.(event);
    },
    [dragHandleListeners]
  );
  const handleDragHandleTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      dragHandleListeners?.onTouchStart?.(event);
    },
    [dragHandleListeners]
  );
  const style: CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
  };
  const handleGoalLongPress = useCallback(
    (element: HTMLElement) => {
      if (isDragging) return;
      onGoalLongPressEdit(goal, element);
    },
    [goal, isDragging, onGoalLongPressEdit]
  );
  const goalLongPressHandlers = usePriorityEditLongPress(
    handleGoalLongPress,
    isDragging
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex min-h-8 items-center gap-2 rounded-lg border border-black/45 bg-white/[0.018] px-2 py-1.5",
        isDragging
          ? "relative z-10 bg-white/[0.012] opacity-45 shadow-none ring-1 ring-white/[0.055]"
          : ""
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        disabled={isDragDisabled}
        className={cn(
          "flex size-5 shrink-0 touch-none items-center justify-center rounded-md border border-black/50 bg-black/25 text-zinc-700 transition",
          isDragDisabled
            ? "cursor-default opacity-45"
            : "cursor-grab hover:bg-white/[0.04] hover:text-zinc-400 active:cursor-grabbing"
        )}
        aria-label={`Move ${goal.name} within Campaign`}
        onClick={(event) => event.stopPropagation()}
        {...attributes}
        {...listeners}
        onPointerDown={handleDragHandlePointerDown}
        onTouchStart={handleDragHandleTouchStart}
      >
        <GripVertical className="size-3" aria-hidden="true" />
      </button>
      {onGoalOpen ? (
        <button
          type="button"
          onClick={() => onGoalOpen(goal.id)}
          {...goalLongPressHandlers}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none transition hover:bg-white/[0.025] focus-visible:ring-1 focus-visible:ring-white/15"
        >
          {identity ? (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-md border border-black/50 bg-white/[0.035] text-[10px] font-semibold text-white/70">
              {identity}
            </span>
          ) : null}
          <p className="min-w-0 flex-1 truncate text-[12px] font-medium leading-tight text-white/68">
            {goal.name}
          </p>
          {globalRank ? (
            <span className="shrink-0 text-[10px] font-semibold leading-none text-zinc-700">
              #{globalRank}
            </span>
          ) : null}
        </button>
      ) : (
        <button
          type="button"
          {...goalLongPressHandlers}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none transition hover:bg-white/[0.025] focus-visible:ring-1 focus-visible:ring-white/15"
        >
          {identity ? (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-md border border-black/50 bg-white/[0.035] text-[10px] font-semibold text-white/70">
              {identity}
            </span>
          ) : null}
          <p className="min-w-0 flex-1 truncate text-[12px] font-medium leading-tight text-white/68">
            {goal.name}
          </p>
          {globalRank ? (
            <span className="shrink-0 text-[10px] font-semibold leading-none text-zinc-700">
              #{globalRank}
            </span>
          ) : null}
        </button>
      )}
    </div>
  );
}

function getPriorityRowFabOriginRect(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const styles = window.getComputedStyle(element);

  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    borderRadius: styles.borderRadius,
    backgroundColor: styles.backgroundColor,
    backgroundImage: styles.backgroundImage,
    boxShadow: styles.boxShadow,
  };
}

function usePriorityEditLongPress(
  onLongPress: (element: HTMLElement) => void,
  disabled = false
) {
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    element: HTMLElement;
  } | null>(null);
  const triggeredRef = useRef(false);

  const releasePointerCapture = useCallback(
    (element: HTMLElement, pointerId: number) => {
      try {
        if (element.hasPointerCapture?.(pointerId)) {
          element.releasePointerCapture?.(pointerId);
        }
      } catch {
        // Pointer capture can already be released by the browser.
      }
    },
    []
  );

  const cancel = useCallback(
    (event?: ReactPointerEvent<HTMLElement>) => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      const start = startRef.current;
      startRef.current = null;
      if (event) {
        releasePointerCapture(event.currentTarget, event.pointerId);
      } else if (start) {
        releasePointerCapture(start.element, start.pointerId);
      }
    },
    [releasePointerCapture]
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (disabled || (event.pointerType === "mouse" && event.button !== 0)) {
        return;
      }

      const element = event.currentTarget;
      cancel();
      triggeredRef.current = false;
      startRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        element,
      };

      try {
        element.setPointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture is best-effort across browsers and input types.
      }

      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        const start = startRef.current;
        startRef.current = null;
        triggeredRef.current = true;
        releasePointerCapture(element, event.pointerId);
        onLongPress(start?.element ?? element);
      }, PRIORITY_EDIT_LONG_PRESS_MS);
    },
    [cancel, disabled, onLongPress, releasePointerCapture]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const start = startRef.current;
      if (!start || start.pointerId !== event.pointerId) return;

      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      if (
        Math.hypot(deltaX, deltaY) > PRIORITY_EDIT_LONG_PRESS_MOVE_TOLERANCE_PX
      ) {
        cancel(event);
      }
    },
    [cancel]
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      cancel(event);
      if (triggeredRef.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [cancel]
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      cancel(event);
      triggeredRef.current = false;
    },
    [cancel]
  );

  const handlePointerLeave = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse") {
        cancel(event);
      }
    },
    [cancel]
  );

  const handleClickCapture = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (!triggeredRef.current) return;
      triggeredRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    []
  );

  useEffect(() => cancel, [cancel]);

  return {
    draggable: false,
    style: {
      userSelect: "none",
      WebkitUserSelect: "none",
      WebkitTouchCallout: "none",
      WebkitTapHighlightColor: "transparent",
    },
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
    onPointerLeave: handlePointerLeave,
    onClickCapture: handleClickCapture,
    onContextMenu: (event: ReactMouseEvent<HTMLElement>) => event.preventDefault(),
    onDragStart: (event: ReactMouseEvent<HTMLElement>) => event.preventDefault(),
  };
}

function getCampaignGoalIdentity(goal: RoadmapPriorityGoal) {
  return goal.emoji?.trim() || goal.monumentEmoji?.trim() || "";
}

function getCampaignGoalRank(goal: RoadmapPriorityGoal) {
  return typeof goal.globalRank === "number" &&
    Number.isFinite(goal.globalRank) &&
    goal.globalRank > 0
    ? goal.globalRank
    : null;
}

function CampaignGoalDragOverlay({ goal }: { goal: RoadmapPriorityGoal }) {
  const identity = getCampaignGoalIdentity(goal);
  const globalRank = getCampaignGoalRank(goal);

  return (
    <div className="flex min-h-8 scale-[1.012] items-center gap-2 rounded-lg border border-white/[0.12] bg-zinc-950/95 px-2 py-1.5 opacity-[0.98] shadow-[0_16px_34px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(255,255,255,0.07)] ring-1 ring-white/[0.07] backdrop-blur-md">
      <span
        className="flex size-5 shrink-0 items-center justify-center rounded-md border border-black/50 bg-black/30 text-zinc-500"
        aria-hidden="true"
      >
        <GripVertical className="size-3" />
      </span>
      {identity ? (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-md border border-black/50 bg-white/[0.045] text-[10px] font-semibold text-white/78">
          {identity}
        </span>
      ) : null}
      <p className="min-w-0 flex-1 truncate text-[12px] font-medium leading-tight text-white/78">
        {goal.name}
      </p>
      {globalRank ? (
        <span className="shrink-0 text-[10px] font-semibold leading-none text-zinc-600">
          #{globalRank}
        </span>
      ) : null}
    </div>
  );
}

function PriorityRoadmapDragOverlay({
  children,
  zIndex,
}: {
  children: ReactNode;
  zIndex: number;
}) {
  const overlay = (
    <DragOverlay className="pointer-events-none" dropAnimation={null} zIndex={zIndex}>
      {children}
    </DragOverlay>
  );

  if (typeof document === "undefined") {
    return overlay;
  }

  return createPortal(overlay, document.body);
}

function usePriorityDragEdgeAutoscroll() {
  const pointerYRef = useRef<number | null>(null);
  const scrollTargetRef = useRef<DragScrollTarget | null>(null);
  const frameRef = useRef<number | null>(null);
  const isActiveRef = useRef(false);

  const updatePointerY = useCallback((event: Event) => {
    const clientY = getDragClientY(event);
    if (clientY !== null) {
      pointerYRef.current = clientY;
    }
  }, []);

  const stop = useCallback(() => {
    isActiveRef.current = false;
    pointerYRef.current = null;
    scrollTargetRef.current = null;
    window.removeEventListener("pointermove", updatePointerY);
    window.removeEventListener("mousemove", updatePointerY);
    window.removeEventListener("touchmove", updatePointerY);

    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, [updatePointerY]);

  const step = useCallback(() => {
    if (!isActiveRef.current) return;

    const target = scrollTargetRef.current ?? window;
    const clientY = pointerYRef.current;

    if (clientY !== null) {
      const rect = getScrollTargetViewportRect(target);
      const threshold = Math.min(
        EDGE_AUTOSCROLL_THRESHOLD_PX,
        Math.max(24, rect.height / 2)
      );
      let delta = 0;

      if (clientY < rect.top + threshold) {
        const intensity = (rect.top + threshold - clientY) / threshold;
        delta = -Math.ceil(
          Math.min(1, intensity) ** 2 * EDGE_AUTOSCROLL_MAX_STEP_PX
        );
      } else if (clientY > rect.bottom - threshold) {
        const intensity = (clientY - (rect.bottom - threshold)) / threshold;
        delta = Math.ceil(
          Math.min(1, intensity) ** 2 * EDGE_AUTOSCROLL_MAX_STEP_PX
        );
      }

      if (canScrollTargetBy(target, delta)) {
        scrollTargetBy(target, delta);
      }
    }

    frameRef.current = window.requestAnimationFrame(step);
  }, []);

  const start = useCallback(
    (event: Event) => {
      stop();
      pointerYRef.current = getDragClientY(event);
      scrollTargetRef.current = findVerticalScrollTarget(event.target);
      isActiveRef.current = true;
      window.addEventListener("pointermove", updatePointerY, { passive: true });
      window.addEventListener("mousemove", updatePointerY, { passive: true });
      window.addEventListener("touchmove", updatePointerY, { passive: true });
      frameRef.current = window.requestAnimationFrame(step);
    },
    [step, stop, updatePointerY]
  );

  useEffect(() => stop, [stop]);

  return { start, stop };
}

function isWindowScrollTarget(target: DragScrollTarget): target is Window {
  return target === window;
}

function getDragClientY(event: Event | null): number | null {
  if (!event) return null;

  if (typeof TouchEvent !== "undefined" && event instanceof TouchEvent) {
    const touch = event.touches[0] ?? event.changedTouches[0];
    return touch?.clientY ?? null;
  }

  if (typeof MouseEvent !== "undefined" && event instanceof MouseEvent) {
    return event.clientY;
  }

  return null;
}

function findVerticalScrollTarget(target: EventTarget | null): DragScrollTarget {
  let element = target instanceof Element ? target : null;

  while (element && element !== document.body && element !== document.documentElement) {
    const style = window.getComputedStyle(element);
    const canScroll =
      /(auto|scroll|overlay)/.test(style.overflowY) &&
      element.scrollHeight > element.clientHeight + 1;

    if (canScroll) {
      return element;
    }

    element = element.parentElement;
  }

  return window;
}

function getScrollTargetViewportRect(target: DragScrollTarget) {
  if (isWindowScrollTarget(target)) {
    return { top: 0, bottom: window.innerHeight, height: window.innerHeight };
  }

  const rect = target.getBoundingClientRect();
  const top = Math.max(0, rect.top);
  const bottom = Math.min(window.innerHeight, rect.bottom);
  return {
    top,
    bottom,
    height: Math.max(0, bottom - top),
  };
}

function canScrollTargetBy(target: DragScrollTarget, delta: number) {
  if (delta === 0) return false;

  if (isWindowScrollTarget(target)) {
    const scrollingElement = document.scrollingElement;
    if (!scrollingElement) return false;

    const maxScrollTop = scrollingElement.scrollHeight - window.innerHeight;
    const scrollTop = window.scrollY;
    return delta < 0 ? scrollTop > 0 : scrollTop < maxScrollTop - 1;
  }

  const maxScrollTop = target.scrollHeight - target.clientHeight;
  return delta < 0 ? target.scrollTop > 0 : target.scrollTop < maxScrollTop - 1;
}

function scrollTargetBy(target: DragScrollTarget, delta: number) {
  if (isWindowScrollTarget(target)) {
    window.scrollBy({ top: delta, behavior: "auto" });
    return;
  }

  target.scrollTop += delta;
}

function getInitials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "";
  }

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
