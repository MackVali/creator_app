"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
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

import {
  hapticComplete,
  hapticErrorPattern,
  hapticPress,
  hapticSnap,
  hapticSoftTick,
} from "@/lib/haptics/creatorHaptics";
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
  type RoadmapPriorityProject,
  type RoadmapPriorityTask,
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
  goal: Pick<GlobalPriorityRoadmapItem | RoadmapPriorityGoal, "id" | "name"> & {
    status?: string | null;
  },
  element: HTMLElement
) => void;

export type GlobalPriorityProjectCompleteHandler = (
  project: RoadmapPriorityProject
) => void | Promise<void>;

export type GlobalPriorityTaskCompleteHandler = (
  task: RoadmapPriorityTask,
  project: RoadmapPriorityProject
) => void | Promise<void>;

type DragScrollTarget = Element | Window;
type DragHandleListenerMap = {
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onTouchStart?: (event: ReactTouchEvent<HTMLButtonElement>) => void;
};
type GlobalPriorityRoadmapAppearance = "default" | "priorityEditor";

const GLOBAL_PRIORITY_BUCKET_PREFIX = "global-priority-bucket:";
const CAMPAIGN_GOAL_BUCKET_PREFIX = "campaign-goal-bucket:";
const TOP_LEVEL_GOAL_ROW_PREFIX = "top-level-goal:";
const CAMPAIGN_GOAL_ROW_PREFIX = "campaign-goal:";
const ROADMAP_PROJECT_ROW_PREFIX = "roadmap-project:";
const EDGE_AUTOSCROLL_THRESHOLD_PX = 96;
const EDGE_AUTOSCROLL_MAX_STEP_PX = 12;
const PRIORITY_EDIT_LONG_PRESS_MS = 560;
const PRIORITY_ROW_DOUBLE_TAP_MS = 325;
const PRIORITY_EDIT_LONG_PRESS_MOVE_TOLERANCE_PX = 8;
const PRIORITY_DND_AUTO_SCROLL = {
  threshold: { x: 0, y: 0.16 },
  acceleration: 8,
  interval: 5,
};
const PRIORITY_EDITOR_PROJECT_ROW_CLASS =
  "border-black/70 bg-[radial-gradient(circle_at_0%_0%,rgba(120,126,138,0.28),transparent_58%),linear-gradient(140deg,rgb(8,8,10)_0%,rgb(22,22,26)_42%,rgb(34,35,42)_100%)] shadow-[0_0_0_1px_rgba(255,255,255,0.035),0_10px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.08)] outline outline-1 -outline-offset-1 outline-black/85 hover:border-white/16";
const PRIORITY_EDITOR_PROJECT_ROW_DRAGGING_CLASS =
  "bg-[radial-gradient(circle_at_0%_0%,rgba(120,126,138,0.18),transparent_58%),linear-gradient(140deg,rgba(8,8,10,0.94)_0%,rgba(22,22,26,0.9)_42%,rgba(34,35,42,0.82)_100%)]";
const PRIORITY_EDITOR_COMPLETED_NESTED_ROW_CLASS =
  "shimmer-border-complete focus-pomo-start-glint relative isolate z-0 overflow-hidden border-green-900/45 bg-[linear-gradient(155deg,rgba(34,197,94,0.94)_0%,rgba(22,163,74,0.97)_48%,rgba(21,128,61,0.98)_100%)] text-white ring-1 ring-green-900/45 shadow-[0_22px_38px_rgba(0,0,0,0.34),0_9px_18px_rgba(3,83,45,0.22),inset_0_1px_0_rgba(255,255,255,0.045),inset_0_-2px_8px_rgba(0,0,0,0.11),inset_0_0_0_1px_rgba(0,0,0,0.08)]";

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

function getTopLevelGoalRowKey(goalId: string) {
  return `${TOP_LEVEL_GOAL_ROW_PREFIX}${goalId}`;
}

function getCampaignGoalRowKey(campaignId: string, goalId: string) {
  return `${CAMPAIGN_GOAL_ROW_PREFIX}${campaignId}:${goalId}`;
}

function getProjectRowKey(goalRowKey: string, projectId: string) {
  return `${ROADMAP_PROJECT_ROW_PREFIX}${goalRowKey}:${projectId}`;
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
  const currentItem = sortedItems.find((item) =>
    isSameGlobalPriorityItem(item, draggedItem)
  );
  if (!currentItem) {
    return sortedItems;
  }
  const validOverItem = overItem
    ? sortedItems.find((item) => isSameGlobalPriorityItem(item, overItem))
    : undefined;
  const buckets = new Map<PriorityBucketId, GlobalPriorityRoadmapItem[]>(
    PRIORITY_ORDER.map((priority) => [
      priority,
      sortedItems.filter((item) => item.priority === priority),
    ])
  );
  const currentBucket = buckets.get(currentItem.priority) ?? [];

  if (
    validOverItem &&
    currentItem.priority === targetPriority &&
    validOverItem.priority === targetPriority
  ) {
    const oldIndex = currentBucket.findIndex((item) =>
      isSameGlobalPriorityItem(item, currentItem)
    );
    const newIndex = currentBucket.findIndex((item) =>
      isSameGlobalPriorityItem(item, validOverItem)
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

  if (validOverItem && validOverItem.priority === targetPriority) {
    const overIndex = targetItems.findIndex((item) =>
      isSameGlobalPriorityItem(item, validOverItem)
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

function getGlobalPriorityItemPositionKey(
  items: GlobalPriorityRoadmapItem[],
  targetItem: Pick<GlobalPriorityRoadmapItem, "id" | "type">
) {
  const bucketIndexes = new Map<PriorityBucketId, number>();

  for (const item of sortGlobalPriorityItems(items)) {
    const priorityIndex = bucketIndexes.get(item.priority) ?? 0;
    if (isSameGlobalPriorityItem(item, targetItem)) {
      return `${item.priority}:${priorityIndex}`;
    }
    bucketIndexes.set(item.priority, priorityIndex + 1);
  }

  return null;
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
  const currentGoal = goals.find((goal) => goal.id === draggedGoal.id);
  if (!currentGoal) {
    return assignCampaignGoalPriorityOrders(
      groupCampaignGoalsByPriority(goals).flatMap((bucket) => bucket.goals)
    );
  }
  const validOverGoal = overGoal
    ? goals.find((goal) => goal.id === overGoal.id)
    : undefined;
  const buckets = new Map<PriorityBucketId, RoadmapPriorityGoal[]>(
    groupCampaignGoalsByPriority(goals).map((bucket) => [
      bucket.priority,
      bucket.goals,
    ])
  );
  const currentPriority = normalizePriority(currentGoal.priority);
  const currentBucket = buckets.get(currentPriority) ?? [];

  if (
    validOverGoal &&
    currentPriority === targetPriority &&
    normalizePriority(validOverGoal.priority) === targetPriority
  ) {
    const oldIndex = currentBucket.findIndex((goal) => goal.id === currentGoal.id);
    const newIndex = currentBucket.findIndex((goal) => goal.id === validOverGoal.id);

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

  if (validOverGoal && normalizePriority(validOverGoal.priority) === targetPriority) {
    const overIndex = targetGoals.findIndex((goal) => goal.id === validOverGoal.id);
    targetGoals.splice(overIndex >= 0 ? overIndex : targetGoals.length, 0, movedGoal);
  } else {
    targetGoals.push(movedGoal);
  }

  buckets.set(targetPriority, targetGoals);

  return assignCampaignGoalPriorityOrders(
    PRIORITY_ORDER.flatMap((priority) => buckets.get(priority) ?? [])
  );
}

function getCampaignGoalPositionKey(
  goals: RoadmapPriorityGoal[],
  targetGoal: Pick<RoadmapPriorityGoal, "id">
) {
  for (const bucket of groupCampaignGoalsByPriority(goals)) {
    const index = bucket.goals.findIndex((goal) => goal.id === targetGoal.id);
    if (index >= 0) {
      return `${bucket.priority}:${index}`;
    }
  }

  return null;
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
  isDragDisabled = false,
  disabledReason = null,
  emptyFilteredLabel = null,
  appearance = "default",
  hideNestedChildCountLabels = false,
  onGoalOpen,
  onGoalLongPressEdit,
  onProjectComplete,
  onTaskComplete,
  onDragEnd,
  onCampaignGoalDragEnd,
}: {
  title?: string;
  items: GlobalPriorityRoadmapItem[];
  error: string | null;
  isSaving: boolean;
  sensors: PriorityRoadmapSensors;
  isFiltered: boolean;
  isDragDisabled?: boolean;
  disabledReason?: string | null;
  emptyFilteredLabel?: string | null;
  appearance?: GlobalPriorityRoadmapAppearance;
  hideNestedChildCountLabels?: boolean;
  onGoalOpen?: (goalId: string) => void;
  onGoalLongPressEdit?: GlobalPriorityGoalLongPressEditHandler;
  onProjectComplete?: GlobalPriorityProjectCompleteHandler;
  onTaskComplete?: GlobalPriorityTaskCompleteHandler;
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
  const [openGoalIds, setOpenGoalIds] = useState<Record<string, boolean>>({});
  const [openProjectIds, setOpenProjectIds] = useState<Record<string, boolean>>({});
  const [blockedProjectIds, setBlockedProjectIds] = useState<Record<string, boolean>>({});
  const [activePriorityItem, setActivePriorityItem] =
    useState<GlobalPriorityRoadmapItem | null>(null);
  const [previewPriorityItems, setPreviewPriorityItems] = useState<
    GlobalPriorityRoadmapItem[] | null
  >(null);
  const lastPriorityDragHapticTargetRef = useRef<string | null>(null);
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
    if (appearance === "priorityEditor") {
      void hapticSnap();
    }
    setOpenCampaignIds((current) => ({
      ...current,
      [campaignId]: !current[campaignId],
    }));
  }, [appearance]);
  const handleToggleGoal = useCallback((goalRowKey: string) => {
    if (appearance === "priorityEditor") {
      void hapticSnap();
    }
    setOpenGoalIds((current) => ({
      ...current,
      [goalRowKey]: !current[goalRowKey],
    }));
  }, [appearance]);
  const handleToggleProject = useCallback((projectRowKey: string) => {
    if (appearance === "priorityEditor") {
      void hapticSnap();
    }
    setOpenProjectIds((current) => ({
      ...current,
      [projectRowKey]: !current[projectRowKey],
    }));
  }, [appearance]);
  const handleProjectBlocked = useCallback((projectRowKey: string) => {
    void hapticErrorPattern();
    setBlockedProjectIds((current) => ({ ...current, [projectRowKey]: true }));
    window.setTimeout(() => {
      setBlockedProjectIds((current) => {
        if (!current[projectRowKey]) return current;
        const next = { ...current };
        delete next[projectRowKey];
        return next;
      });
    }, 380);
  }, []);
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      if (isDragDisabled) return;
      const activeData = event.active.data.current as
        | { item?: GlobalPriorityRoadmapItem }
        | undefined;
      if (!activeData?.item) return;

      setActivePriorityItem(activeData.item);
      setPreviewPriorityItems(items);
      lastPriorityDragHapticTargetRef.current = getGlobalPriorityItemPositionKey(
        items,
        activeData.item
      );
      startEdgeAutoscroll(event.activatorEvent);
    },
    [isDragDisabled, items, startEdgeAutoscroll]
  );
  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      if (isDragDisabled) return;
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
        const nextTargetKey = getGlobalPriorityItemPositionKey(
          nextPreviewItems,
          draggedItem
        );
        if (
          appearance === "priorityEditor" &&
          nextTargetKey &&
          nextTargetKey !== lastPriorityDragHapticTargetRef.current
        ) {
          lastPriorityDragHapticTargetRef.current = nextTargetKey;
          void hapticSoftTick();
        }

        return globalPriorityOrdersMatch(previousItems, nextPreviewItems)
          ? currentPreviewItems
          : nextPreviewItems;
      });
    },
    [appearance, isDragDisabled, items]
  );
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const previewItemsOnDrop = previewPriorityItems;
      setActivePriorityItem(null);
      setPreviewPriorityItems(null);
      lastPriorityDragHapticTargetRef.current = null;
      stopEdgeAutoscroll();
      if (isDragDisabled) return;
      if (!event.over || !event.active.data.current) return;
      onDragEnd(event, isFiltered ? null : previewItemsOnDrop);
    },
    [
      isDragDisabled,
      isFiltered,
      onDragEnd,
      previewPriorityItems,
      stopEdgeAutoscroll,
    ]
  );
  const handleDragCancel = useCallback(() => {
    setActivePriorityItem(null);
    setPreviewPriorityItems(null);
    lastPriorityDragHapticTargetRef.current = null;
    stopEdgeAutoscroll();
  }, [stopEdgeAutoscroll]);
  const handleDefaultGoalLongPressEdit = useCallback(
    (
      goal: Pick<GlobalPriorityRoadmapItem | RoadmapPriorityGoal, "id" | "name"> & {
        status?: string | null;
      },
      element: HTMLElement
    ) => {
      fabCreation?.requestEntityEdit({
        entityType: "GOAL",
        entityId: goal.id,
        title: goal.name,
        status: goal.status ?? null,
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
          {disabledReason ? (
            <p className="mb-2 px-1 text-[11px] font-medium text-zinc-600">
              {disabledReason}
            </p>
          ) : null}
          {displayedItems.length === 0 && emptyFilteredLabel ? (
            <p className="rounded-[16px] border border-black/60 bg-black/25 px-3 py-3 text-xs font-medium text-zinc-500">
              {emptyFilteredLabel}
            </p>
          ) : (
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
                      openGoalIds={openGoalIds}
                      openProjectIds={openProjectIds}
                      blockedProjectIds={blockedProjectIds}
                      onToggleCampaign={handleToggleCampaign}
                      onToggleGoal={handleToggleGoal}
                      onToggleProject={handleToggleProject}
                      onProjectBlocked={handleProjectBlocked}
                      sensors={sensors}
                      isTopLevelDragDisabled={isDragDisabled}
                      isCampaignGoalDragDisabled={isDragDisabled}
                      appearance={appearance}
                      hideNestedChildCountLabels={hideNestedChildCountLabels}
                      onGoalOpen={onGoalOpen}
                      onGoalLongPressEdit={handleGoalLongPressEdit}
                      onProjectComplete={onProjectComplete}
                      onTaskComplete={onTaskComplete}
                      onCampaignGoalDragEnd={onCampaignGoalDragEnd}
                    />
                  );
                })}
              </div>
              <PriorityRoadmapDragOverlay zIndex={1000}>
                {activePriorityItem ? (
                  <GlobalPriorityItemDragOverlay
                    item={activePriorityItem}
                    appearance={appearance}
                  />
                ) : null}
              </PriorityRoadmapDragOverlay>
            </DndContext>
          )}
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
  openGoalIds,
  openProjectIds,
  blockedProjectIds,
  onToggleCampaign,
  onToggleGoal,
  onToggleProject,
  onProjectBlocked,
  sensors,
  isTopLevelDragDisabled,
  isCampaignGoalDragDisabled,
  appearance,
  hideNestedChildCountLabels,
  onGoalOpen,
  onGoalLongPressEdit,
  onProjectComplete,
  onTaskComplete,
  onCampaignGoalDragEnd,
}: {
  priority: PriorityBucketId;
  items: GlobalPriorityRoadmapItem[];
  openCampaignIds: Record<string, boolean>;
  openGoalIds: Record<string, boolean>;
  openProjectIds: Record<string, boolean>;
  blockedProjectIds: Record<string, boolean>;
  onToggleCampaign: (campaignId: string) => void;
  onToggleGoal: (goalRowKey: string) => void;
  onToggleProject: (projectRowKey: string) => void;
  onProjectBlocked: (projectRowKey: string) => void;
  sensors: PriorityRoadmapSensors;
  isTopLevelDragDisabled: boolean;
  isCampaignGoalDragDisabled: boolean;
  appearance: GlobalPriorityRoadmapAppearance;
  hideNestedChildCountLabels: boolean;
  onGoalOpen?: (goalId: string) => void;
  onGoalLongPressEdit: GlobalPriorityGoalLongPressEditHandler;
  onProjectComplete?: GlobalPriorityProjectCompleteHandler;
  onTaskComplete?: GlobalPriorityTaskCompleteHandler;
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
                isGoalOpen={
                  item.type === "goal"
                    ? openGoalIds[getTopLevelGoalRowKey(item.id)] ?? false
                    : false
                }
                onToggle={() => onToggleCampaign(item.id)}
                onToggleGoal={() => onToggleGoal(getTopLevelGoalRowKey(item.id))}
                openGoalIds={openGoalIds}
                openProjectIds={openProjectIds}
                blockedProjectIds={blockedProjectIds}
                onToggleNestedGoal={onToggleGoal}
                onToggleProject={onToggleProject}
                onProjectBlocked={onProjectBlocked}
                sensors={sensors}
                isTopLevelDragDisabled={isTopLevelDragDisabled}
                isCampaignGoalDragDisabled={isCampaignGoalDragDisabled}
                appearance={appearance}
                hideNestedChildCountLabels={hideNestedChildCountLabels}
                onGoalOpen={onGoalOpen}
                onGoalLongPressEdit={onGoalLongPressEdit}
                onProjectComplete={onProjectComplete}
                onTaskComplete={onTaskComplete}
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
  isGoalOpen,
  onToggle,
  onToggleGoal,
  openGoalIds,
  openProjectIds,
  blockedProjectIds,
  onToggleNestedGoal,
  onToggleProject,
  onProjectBlocked,
  sensors,
  isTopLevelDragDisabled,
  isCampaignGoalDragDisabled,
  appearance,
  hideNestedChildCountLabels,
  onGoalOpen,
  onGoalLongPressEdit,
  onProjectComplete,
  onTaskComplete,
  onCampaignGoalDragEnd,
}: {
  item: GlobalPriorityRoadmapItem;
  isOpen: boolean;
  isGoalOpen: boolean;
  onToggle: () => void;
  onToggleGoal: () => void;
  openGoalIds: Record<string, boolean>;
  openProjectIds: Record<string, boolean>;
  blockedProjectIds: Record<string, boolean>;
  onToggleNestedGoal: (goalRowKey: string) => void;
  onToggleProject: (projectRowKey: string) => void;
  onProjectBlocked: (projectRowKey: string) => void;
  sensors: PriorityRoadmapSensors;
  isTopLevelDragDisabled: boolean;
  isCampaignGoalDragDisabled: boolean;
  appearance: GlobalPriorityRoadmapAppearance;
  hideNestedChildCountLabels: boolean;
  onGoalOpen?: (goalId: string) => void;
  onGoalLongPressEdit: GlobalPriorityGoalLongPressEditHandler;
  onProjectComplete?: GlobalPriorityProjectCompleteHandler;
  onTaskComplete?: GlobalPriorityTaskCompleteHandler;
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
  const goalProjects = item.projects ?? [];
  const hasGoalProjects = goalProjects.length > 0;
  const campaignGoalBuckets = useMemo(
    () => groupCampaignGoalsByPriority(item.goals ?? []),
    [item.goals]
  );
  const [activeCampaignGoal, setActiveCampaignGoal] =
    useState<RoadmapPriorityGoal | null>(null);
  const lastCampaignGoalDragHapticTargetRef = useRef<string | null>(null);
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
      lastCampaignGoalDragHapticTargetRef.current = getCampaignGoalPositionKey(
        item.goals ?? [],
        activeData.goal
      );
      startCampaignGoalEdgeAutoscroll(event.activatorEvent);
    },
    [
      isCampaignGoalDragDisabled,
      item.goals,
      item.id,
      startCampaignGoalEdgeAutoscroll,
    ]
  );
  const handleCampaignGoalDragOver = useCallback(
    (event: DragOverEvent) => {
      if (isCampaignGoalDragDisabled || appearance !== "priorityEditor") return;

      const { active, over } = event;
      if (!over) return;

      const activeData = active.data.current as
        | { campaignId?: string; goal?: RoadmapPriorityGoal }
        | undefined;
      const draggedGoal = activeData?.goal;
      if (!draggedGoal || activeData?.campaignId !== item.id) return;

      const overData = over.data.current as
        | {
            campaignId?: string;
            bucket?: PriorityBucketId;
            goal?: RoadmapPriorityGoal;
          }
        | undefined;
      if (overData?.campaignId && overData.campaignId !== item.id) return;

      const targetPriority =
        overData?.bucket ??
        (overData?.goal ? normalizePriority(overData.goal.priority) : null) ??
        parseCampaignGoalBucketId(String(over.id), item.id);
      if (!targetPriority) return;

      const visibleGoals = item.goals ?? [];
      if (!visibleGoals.some((goal) => goal.id === draggedGoal.id)) return;

      const nextVisibleGoals = moveCampaignGoal(
        visibleGoals,
        draggedGoal,
        targetPriority,
        overData?.goal
      );
      const nextTargetKey = getCampaignGoalPositionKey(
        nextVisibleGoals,
        draggedGoal
      );
      if (
        nextTargetKey &&
        nextTargetKey !== lastCampaignGoalDragHapticTargetRef.current
      ) {
        lastCampaignGoalDragHapticTargetRef.current = nextTargetKey;
        void hapticSoftTick();
      }
    },
    [appearance, isCampaignGoalDragDisabled, item.goals, item.id]
  );
  const handleCampaignGoalDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveCampaignGoal(null);
      lastCampaignGoalDragHapticTargetRef.current = null;
      stopCampaignGoalEdgeAutoscroll();
      if (isCampaignGoalDragDisabled) return;
      if (!event.over || !event.active.data.current) return;
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
    lastCampaignGoalDragHapticTargetRef.current = null;
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
      if (appearance === "priorityEditor") {
        void hapticPress();
      }
      onGoalLongPressEdit(item, element);
    },
    [appearance, isCampaign, isDragging, item, onGoalLongPressEdit]
  );
  const handleGoalOpen = useCallback(() => {
    if (!onGoalOpen) return;
    if (appearance === "priorityEditor") {
      void hapticPress();
    }
    onGoalOpen(item.id);
  }, [appearance, item.id, onGoalOpen]);
  const handleGoalToggle = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onToggleGoal();
    },
    [onToggleGoal]
  );
  const goalLongPressHandlers = usePriorityEditLongPress<HTMLButtonElement>(
    handleGoalLongPress,
    isDragging || isCampaign
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "border-b border-black/40 bg-white/[0.026] last:border-b-0",
        appearance === "priorityEditor" ? PRIORITY_EDITOR_PROJECT_ROW_CLASS : "",
        isDragging
          ? cn(
              "relative z-10 opacity-45 shadow-none ring-1 ring-white/[0.06]",
              appearance === "priorityEditor"
                ? PRIORITY_EDITOR_PROJECT_ROW_DRAGGING_CLASS
                : "bg-white/[0.018]"
            )
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
          <>
            <button
              type="button"
              onClick={onGoalOpen ? handleGoalOpen : undefined}
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
            {hasGoalProjects ? (
              <button
                type="button"
                aria-expanded={isGoalOpen}
                aria-label={
                  isGoalOpen ? "Collapse Goal Projects" : "Expand Goal Projects"
                }
                onClick={handleGoalToggle}
                className="flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-semibold leading-none text-zinc-600 outline-none transition hover:bg-white/[0.025] hover:text-zinc-400 focus-visible:ring-1 focus-visible:ring-white/15"
              >
                {hideNestedChildCountLabels ? null : (
                  <span>
                    {goalProjects.length} Project
                    {goalProjects.length === 1 ? "" : "s"}
                  </span>
                )}
                <ChevronDown
                  className={cn(
                    "size-3.5 shrink-0 transition-transform",
                    isGoalOpen ? "rotate-180" : ""
                  )}
                  aria-hidden="true"
                />
              </button>
            ) : null}
          </>
        )}
      </div>
      {!isCampaign && isGoalOpen && hasGoalProjects ? (
        <GoalProjectRows
          projects={goalProjects}
          goalRowKey={getTopLevelGoalRowKey(item.id)}
          openProjectIds={openProjectIds}
          blockedProjectIds={blockedProjectIds}
          onToggleProject={onToggleProject}
          onProjectBlocked={onProjectBlocked}
          onProjectComplete={onProjectComplete}
          onTaskComplete={onTaskComplete}
          hideNestedChildCountLabels={hideNestedChildCountLabels}
        />
      ) : null}
      {isCampaign && isOpen ? (
        <div className="border-t border-black/35 bg-black/20 px-2 pb-2 pt-1.5 sm:px-2.5">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            autoScroll={PRIORITY_DND_AUTO_SCROLL}
            onDragStart={handleCampaignGoalDragStart}
            onDragOver={handleCampaignGoalDragOver}
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
                  openGoalIds={openGoalIds}
                  openProjectIds={openProjectIds}
                  blockedProjectIds={blockedProjectIds}
                  onToggleGoal={onToggleNestedGoal}
                  onToggleProject={onToggleProject}
                  onProjectBlocked={onProjectBlocked}
                  appearance={appearance}
                  hideNestedChildCountLabels={hideNestedChildCountLabels}
                  onProjectComplete={onProjectComplete}
                  onTaskComplete={onTaskComplete}
                />
              ))}
            </div>
            <PriorityRoadmapDragOverlay zIndex={1001}>
              {activeCampaignGoal ? (
                <CampaignGoalDragOverlay
                  goal={activeCampaignGoal}
                  appearance={appearance}
                />
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
  appearance,
}: {
  item: GlobalPriorityRoadmapItem;
  appearance: GlobalPriorityRoadmapAppearance;
}) {
  const isCampaign = item.type === "campaign";
  const identity = getGlobalPriorityItemIdentity(item);
  const globalRank = isCampaign ? null : getGlobalPriorityItemRank(item);

  return (
    <div
      className={cn(
        "scale-[1.015] overflow-hidden rounded-[16px] border border-white/[0.13] bg-zinc-950/95 opacity-[0.98] shadow-[0_22px_48px_rgba(0,0,0,0.68),inset_0_1px_0_rgba(255,255,255,0.075)] ring-1 ring-white/[0.08] backdrop-blur-md",
        appearance === "priorityEditor" ? PRIORITY_EDITOR_PROJECT_ROW_CLASS : ""
      )}
    >
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
  appearance,
  onGoalOpen,
  onGoalLongPressEdit,
  openGoalIds,
  openProjectIds,
  blockedProjectIds,
  onToggleGoal,
  onToggleProject,
  onProjectBlocked,
  onProjectComplete,
  onTaskComplete,
  hideNestedChildCountLabels,
}: {
  campaignId: string;
  bucket: { priority: PriorityBucketId; goals: RoadmapPriorityGoal[] };
  isDragDisabled: boolean;
  appearance: GlobalPriorityRoadmapAppearance;
  onGoalOpen?: (goalId: string) => void;
  onGoalLongPressEdit: GlobalPriorityGoalLongPressEditHandler;
  openGoalIds: Record<string, boolean>;
  openProjectIds: Record<string, boolean>;
  blockedProjectIds: Record<string, boolean>;
  onToggleGoal: (goalRowKey: string) => void;
  onToggleProject: (projectRowKey: string) => void;
  onProjectBlocked: (projectRowKey: string) => void;
  onProjectComplete?: GlobalPriorityProjectCompleteHandler;
  onTaskComplete?: GlobalPriorityTaskCompleteHandler;
  hideNestedChildCountLabels: boolean;
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
                appearance={appearance}
                isOpen={
                  openGoalIds[getCampaignGoalRowKey(campaignId, goal.id)] ?? false
                }
                onToggle={() =>
                  onToggleGoal(getCampaignGoalRowKey(campaignId, goal.id))
                }
                openProjectIds={openProjectIds}
                blockedProjectIds={blockedProjectIds}
                onToggleProject={onToggleProject}
                onProjectBlocked={onProjectBlocked}
                onGoalOpen={onGoalOpen}
                onGoalLongPressEdit={onGoalLongPressEdit}
                onProjectComplete={onProjectComplete}
                onTaskComplete={onTaskComplete}
                hideNestedChildCountLabels={hideNestedChildCountLabels}
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
  appearance,
  isOpen,
  onToggle,
  openProjectIds,
  blockedProjectIds,
  onToggleProject,
  onProjectBlocked,
  onGoalOpen,
  onGoalLongPressEdit,
  onProjectComplete,
  onTaskComplete,
  hideNestedChildCountLabels,
}: {
  campaignId: string;
  goal: RoadmapPriorityGoal;
  isDragDisabled: boolean;
  appearance: GlobalPriorityRoadmapAppearance;
  isOpen: boolean;
  onToggle: () => void;
  openProjectIds: Record<string, boolean>;
  blockedProjectIds: Record<string, boolean>;
  onToggleProject: (projectRowKey: string) => void;
  onProjectBlocked: (projectRowKey: string) => void;
  onGoalOpen?: (goalId: string) => void;
  onGoalLongPressEdit: GlobalPriorityGoalLongPressEditHandler;
  onProjectComplete?: GlobalPriorityProjectCompleteHandler;
  onTaskComplete?: GlobalPriorityTaskCompleteHandler;
  hideNestedChildCountLabels: boolean;
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
  const projects = goal.projects ?? [];
  const hasProjects = projects.length > 0;
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
      if (appearance === "priorityEditor") {
        void hapticPress();
      }
      onGoalLongPressEdit(goal, element);
    },
    [appearance, goal, isDragging, onGoalLongPressEdit]
  );
  const handleGoalOpen = useCallback(() => {
    if (!onGoalOpen) return;
    if (appearance === "priorityEditor") {
      void hapticPress();
    }
    onGoalOpen(goal.id);
  }, [appearance, goal.id, onGoalOpen]);
  const handleToggle = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onToggle();
    },
    [onToggle]
  );
  const goalLongPressHandlers = usePriorityEditLongPress<HTMLButtonElement>(
    handleGoalLongPress,
    isDragging
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border border-black/45 bg-white/[0.018]",
        appearance === "priorityEditor" ? PRIORITY_EDITOR_PROJECT_ROW_CLASS : "",
        isDragging
          ? cn(
              "relative z-10 opacity-45 shadow-none ring-1 ring-white/[0.055]",
              appearance === "priorityEditor"
                ? PRIORITY_EDITOR_PROJECT_ROW_DRAGGING_CLASS
                : "bg-white/[0.012]"
            )
          : ""
      )}
    >
      <div className="flex min-h-8 items-center gap-2 px-2 py-1.5">
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
            onClick={handleGoalOpen}
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
        {hasProjects ? (
          <button
            type="button"
            aria-expanded={isOpen}
            aria-label={isOpen ? "Collapse Goal Projects" : "Expand Goal Projects"}
            onClick={handleToggle}
            className="flex shrink-0 items-center gap-1 rounded-md px-1 py-0.5 text-[9px] font-semibold leading-none text-zinc-700 outline-none transition hover:bg-white/[0.025] hover:text-zinc-500 focus-visible:ring-1 focus-visible:ring-white/15"
          >
            {hideNestedChildCountLabels ? null : (
              <span>
                {projects.length} Project{projects.length === 1 ? "" : "s"}
              </span>
            )}
            <ChevronDown
              className={cn(
                "size-3 shrink-0 transition-transform",
                isOpen ? "rotate-180" : ""
              )}
              aria-hidden="true"
            />
          </button>
        ) : null}
      </div>
      {isOpen && hasProjects ? (
        <GoalProjectRows
          projects={projects}
          goalRowKey={getCampaignGoalRowKey(campaignId, goal.id)}
          openProjectIds={openProjectIds}
          blockedProjectIds={blockedProjectIds}
          onToggleProject={onToggleProject}
          onProjectBlocked={onProjectBlocked}
          onProjectComplete={onProjectComplete}
          onTaskComplete={onTaskComplete}
          hideNestedChildCountLabels={hideNestedChildCountLabels}
          nested
        />
      ) : null}
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

function usePriorityEditLongPress<TElement extends HTMLElement = HTMLElement>(
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
    (event?: ReactPointerEvent<TElement>) => {
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
    (event: ReactPointerEvent<TElement>) => {
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
    (event: ReactPointerEvent<TElement>) => {
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
    (event: ReactPointerEvent<TElement>) => {
      cancel(event);
      if (triggeredRef.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [cancel]
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<TElement>) => {
      cancel(event);
      triggeredRef.current = false;
    },
    [cancel]
  );

  const handlePointerLeave = useCallback(
    (event: ReactPointerEvent<TElement>) => {
      if (event.pointerType === "mouse") {
        cancel(event);
      }
    },
    [cancel]
  );

  const handleClickCapture = useCallback(
    (event: ReactMouseEvent<TElement>) => {
      if (!triggeredRef.current) return;
      triggeredRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    []
  );

  useEffect(() => cancel, [cancel]);
  const interactionStyle: CSSProperties = {
    userSelect: "none",
    WebkitUserSelect: "none",
    WebkitTouchCallout: "none",
    WebkitTapHighlightColor: "transparent",
  };

  return {
    draggable: false,
    style: interactionStyle,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
    onPointerLeave: handlePointerLeave,
    onClickCapture: handleClickCapture,
    onContextMenu: (event: ReactMouseEvent<TElement>) => event.preventDefault(),
    onDragStart: (event: ReactDragEvent<TElement>) => event.preventDefault(),
  };
}

function useRoadmapRowDoubleTap<TElement extends HTMLElement = HTMLElement>(
  onDoubleTap: () => void,
  disabled = false
) {
  const lastTapRef = useRef<number | null>(null);

  const handleClick = useCallback(
    (event: ReactMouseEvent<TElement>) => {
      if (disabled) {
        lastTapRef.current = null;
        return;
      }

      const now = Date.now();
      const lastTap = lastTapRef.current;
      if (event.detail > 1 || (lastTap !== null && now - lastTap <= PRIORITY_ROW_DOUBLE_TAP_MS)) {
        lastTapRef.current = null;
        event.preventDefault();
        event.stopPropagation();
        onDoubleTap();
        return;
      }

      lastTapRef.current = now;
      window.setTimeout(() => {
        if (lastTapRef.current === now) {
          lastTapRef.current = null;
        }
      }, PRIORITY_ROW_DOUBLE_TAP_MS);
    },
    [disabled, onDoubleTap]
  );

  return { onClick: handleClick };
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

function GoalProjectRows({
  projects,
  goalRowKey,
  openProjectIds,
  blockedProjectIds,
  onToggleProject,
  onProjectBlocked,
  onProjectComplete,
  onTaskComplete,
  hideNestedChildCountLabels,
  nested = false,
}: {
  projects: RoadmapPriorityProject[];
  goalRowKey: string;
  openProjectIds: Record<string, boolean>;
  blockedProjectIds: Record<string, boolean>;
  onToggleProject: (projectRowKey: string) => void;
  onProjectBlocked: (projectRowKey: string) => void;
  onProjectComplete?: GlobalPriorityProjectCompleteHandler;
  onTaskComplete?: GlobalPriorityTaskCompleteHandler;
  hideNestedChildCountLabels: boolean;
  nested?: boolean;
}) {
  return (
    <div
      className={cn(
        "border-t border-black/35 bg-black/20 px-2 pb-2 pt-1.5 sm:px-2.5",
        nested ? "px-2 pb-2 pt-1" : ""
      )}
    >
      <div className={cn("space-y-1", nested ? "ml-7" : "ml-10")}>
        {projects.map((project) => {
          const projectRowKey = getProjectRowKey(goalRowKey, project.id);
          return (
            <GoalProjectRow
              key={project.id}
              project={project}
              isOpen={openProjectIds[projectRowKey] ?? false}
              isBlocked={blockedProjectIds[projectRowKey] ?? false}
              onToggle={() => onToggleProject(projectRowKey)}
              onBlocked={() => onProjectBlocked(projectRowKey)}
              onProjectComplete={onProjectComplete}
              onTaskComplete={onTaskComplete}
              hideNestedChildCountLabels={hideNestedChildCountLabels}
            />
          );
        })}
      </div>
    </div>
  );
}

function GoalProjectRow({
  project,
  isOpen,
  isBlocked,
  onToggle,
  onBlocked,
  onProjectComplete,
  onTaskComplete,
  hideNestedChildCountLabels,
}: {
  project: RoadmapPriorityProject;
  isOpen: boolean;
  isBlocked: boolean;
  onToggle: () => void;
  onBlocked: () => void;
  onProjectComplete?: GlobalPriorityProjectCompleteHandler;
  onTaskComplete?: GlobalPriorityTaskCompleteHandler;
  hideNestedChildCountLabels: boolean;
}) {
  const fabCreation = useFabCreation();
  const tasks = project.tasks ?? [];
  const hasTasks = tasks.length > 0;
  const identity = getProjectSkillIdentity(project);
  const isCompleted = isRoadmapProjectCompleted(project);
  const canCompleteProject = tasks.every(isRoadmapTaskCompleted);
  const handleProjectLongPress = useCallback(
    (element: HTMLElement) => {
      void hapticPress();
      fabCreation?.requestEntityEdit({
        entityType: "PROJECT",
        entityId: project.id,
        title: project.name,
        stage: project.stage ?? null,
        completedAt: project.completedAt ?? null,
        originRect: getPriorityRowFabOriginRect(element),
      });
    },
    [fabCreation, project.completedAt, project.id, project.name, project.stage]
  );
  const handleProjectDoubleTap = useCallback(() => {
    if (isCompleted || !onProjectComplete) return;
    if (!canCompleteProject) {
      onBlocked();
      return;
    }
    void hapticComplete();
    void onProjectComplete(project);
  }, [canCompleteProject, isCompleted, onBlocked, onProjectComplete, project]);
  const handleToggle = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onToggle();
    },
    [onToggle]
  );
  const projectLongPressHandlers = usePriorityEditLongPress<HTMLButtonElement>(
    handleProjectLongPress
  );
  const projectDoubleTapHandlers = useRoadmapRowDoubleTap<HTMLButtonElement>(
    handleProjectDoubleTap,
    isCompleted || !onProjectComplete
  );

  return (
    <div
      className={cn(
        "rounded-md border border-black/45 bg-white/[0.014]",
        isCompleted ? PRIORITY_EDITOR_COMPLETED_NESTED_ROW_CLASS : "",
        isBlocked
          ? "goal-manual-complete-reject border-red-400/70 ring-1 ring-red-400/30"
          : ""
      )}
    >
      <div className="flex min-h-7 items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          {...projectLongPressHandlers}
          {...projectDoubleTapHandlers}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none transition hover:bg-white/[0.025] focus-visible:ring-1 focus-visible:ring-white/15"
          aria-label={`${project.name}. ${
            isCompleted
              ? "Completed"
              : canCompleteProject
                ? "Double tap to complete. Long press to edit"
                : "Complete all Tasks before completing this Project. Long press to edit"
          }`}
        >
          <span
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-md border border-black/50 bg-white/[0.028] px-1 text-center text-[9px] font-semibold leading-none text-white/70",
              isCompleted ? "border-emerald-50/24 bg-emerald-950/16 text-emerald-50" : ""
            )}
          >
            {identity}
          </span>
          <p
            className={cn(
              "min-w-0 flex-1 truncate text-[11px] font-medium leading-tight text-white/62",
              isCompleted ? "text-emerald-50" : ""
            )}
          >
            {project.name}
          </p>
          {project.globalRank ? (
            <span
              className={cn(
                "shrink-0 text-[9px] font-semibold leading-none text-zinc-700",
                isCompleted ? "text-emerald-50/75" : ""
              )}
            >
              #{project.globalRank}
            </span>
          ) : null}
        </button>
        {hasTasks ? (
          <button
            type="button"
            aria-expanded={isOpen}
            aria-label={
              isOpen ? "Collapse Project Tasks" : "Expand Project Tasks"
            }
            onClick={handleToggle}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-md px-1 py-0.5 text-[9px] font-semibold leading-none text-zinc-700 outline-none transition hover:bg-white/[0.025] hover:text-zinc-500 focus-visible:ring-1 focus-visible:ring-white/15",
              isCompleted ? "text-emerald-50/72 hover:text-emerald-50" : ""
            )}
          >
            {hideNestedChildCountLabels ? null : (
              <span>
                {tasks.length} Task{tasks.length === 1 ? "" : "s"}
              </span>
            )}
            <ChevronDown
              className={cn(
                "size-3 shrink-0 transition-transform",
                isOpen ? "rotate-180" : ""
              )}
              aria-hidden="true"
            />
          </button>
        ) : null}
      </div>
      {isOpen && hasTasks ? (
        <div className="border-t border-black/30 bg-black/18 px-2 pb-2 pt-1">
          <div className="ml-7 space-y-1">
            {tasks.map((task) => (
              <GoalProjectTaskRow
                key={task.id}
                task={task}
                project={project}
                onTaskComplete={onTaskComplete}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GoalProjectTaskRow({
  task,
  project,
  onTaskComplete,
}: {
  task: RoadmapPriorityTask;
  project: RoadmapPriorityProject;
  onTaskComplete?: GlobalPriorityTaskCompleteHandler;
}) {
  const fabCreation = useFabCreation();
  const identity = getTaskSkillIdentity(task);
  const isCompleted = isRoadmapTaskCompleted(task);
  const handleTaskLongPress = useCallback(
    (element: HTMLElement) => {
      void hapticPress();
      fabCreation?.requestEntityEdit({
        entityType: "TASK",
        entityId: task.id,
        title: task.name,
        stage: task.stage ?? null,
        completedAt: task.completedAt ?? null,
        originRect: getPriorityRowFabOriginRect(element),
      });
    },
    [fabCreation, task.completedAt, task.id, task.name, task.stage]
  );
  const handleTaskDoubleTap = useCallback(() => {
    if (isCompleted || !onTaskComplete) return;
    void hapticComplete();
    void onTaskComplete(task, project);
  }, [isCompleted, onTaskComplete, project, task]);
  const taskLongPressHandlers = usePriorityEditLongPress<HTMLButtonElement>(
    handleTaskLongPress
  );
  const taskDoubleTapHandlers = useRoadmapRowDoubleTap<HTMLButtonElement>(
    handleTaskDoubleTap,
    isCompleted || !onTaskComplete
  );

  return (
    <button
      type="button"
      {...taskLongPressHandlers}
      {...taskDoubleTapHandlers}
      className={cn(
        "flex min-h-7 w-full min-w-0 items-center gap-2 rounded-md border border-black/45 bg-white/[0.012] px-2 py-1.5 text-left outline-none transition hover:bg-white/[0.025] focus-visible:ring-1 focus-visible:ring-white/15",
        isCompleted ? PRIORITY_EDITOR_COMPLETED_NESTED_ROW_CLASS : ""
      )}
      aria-label={`${task.name}. ${
        isCompleted ? "Completed" : "Double tap to complete. Long press to edit"
      }`}
    >
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-md border border-black/50 bg-white/[0.026] px-1 text-center text-[9px] font-semibold leading-none text-white/60",
          isCompleted ? "border-emerald-50/24 bg-emerald-950/16 text-emerald-50" : ""
        )}
      >
        {identity}
      </span>
      <p
        className={cn(
          "min-w-0 flex-1 truncate text-[11px] font-medium leading-tight text-white/56",
          isCompleted ? "text-emerald-50" : ""
        )}
      >
        {task.name}
      </p>
    </button>
  );
}

function getProjectSkillIdentity(project: RoadmapPriorityProject) {
  return (
    project.skillIcon?.trim() ||
    project.emoji?.trim() ||
    project.skillName?.trim().slice(0, 2).toUpperCase() ||
    "P"
  );
}

function getTaskSkillIdentity(task: RoadmapPriorityTask) {
  return (
    task.skillIcon?.trim() ||
    task.skillName?.trim().slice(0, 2).toUpperCase() ||
    "T"
  );
}

function isRoadmapProjectCompleted(project: RoadmapPriorityProject) {
  const normalizedStage = project.stage?.trim().toUpperCase();
  return (
    Boolean(project.completedAt) ||
    normalizedStage === "RELEASE" ||
    normalizedStage === "COMPLETE" ||
    normalizedStage === "COMPLETED" ||
    normalizedStage === "DONE"
  );
}

function isRoadmapTaskCompleted(task: RoadmapPriorityTask) {
  return Boolean(task.completedAt) || task.stage?.trim().toUpperCase() === "PERFECT";
}

function CampaignGoalDragOverlay({
  goal,
  appearance,
}: {
  goal: RoadmapPriorityGoal;
  appearance: GlobalPriorityRoadmapAppearance;
}) {
  const identity = getCampaignGoalIdentity(goal);
  const globalRank = getCampaignGoalRank(goal);

  return (
    <div
      className={cn(
        "flex min-h-8 scale-[1.012] items-center gap-2 rounded-lg border border-white/[0.12] bg-zinc-950/95 px-2 py-1.5 opacity-[0.98] shadow-[0_16px_34px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(255,255,255,0.07)] ring-1 ring-white/[0.07] backdrop-blur-md",
        appearance === "priorityEditor" ? PRIORITY_EDITOR_PROJECT_ROW_CLASS : ""
      )}
    >
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
