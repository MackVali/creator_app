"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type UIEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  TouchSensor,
  type DragEndEvent,
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

import { getSupabaseBrowser } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  type GlobalPriorityRoadmapItem,
  type MonumentRoadmapPriority,
  PRIORITY_ORDER,
  type PriorityBucketId,
  type RoadmapPriorityCampaign,
  type RoadmapPriorityGoal,
  sortGlobalPriorityItems,
} from "./utils";

interface PriorityEditorClientProps {
  initialRoadmaps: MonumentRoadmapPriority[];
  initialGlobalPriorityItems: GlobalPriorityRoadmapItem[];
  initialError?: string | null;
}

const ROADMAP_SCROLL_SETTLE_MS = 140;
const ROADMAP_SCROLL_RELEASE_MS = 90;
const ROADMAP_PROGRAMMATIC_SCROLL_RELEASE_MS = 420;

type MonumentPriorityRow = {
  monumentId: string;
  name: string;
  emoji?: string | null;
  priorityRank?: number;
  createdAt?: string | null;
};

type MonumentPriorityRpcClient = NonNullable<ReturnType<typeof getSupabaseBrowser>> & {
  rpc(
    fn: "save_monument_priority_order",
    args: { p_monument_ids: string[] }
  ): Promise<{ error: { message?: string } | null }>;
};

type GlobalPriorityOrderPayloadItem = {
  id: string;
  type: "goal" | "campaign";
  priority: PriorityBucketId;
};

type GlobalPriorityRpcClient = NonNullable<ReturnType<typeof getSupabaseBrowser>> & {
  rpc(
    fn: "save_global_priority_order",
    args: { p_items: GlobalPriorityOrderPayloadItem[] }
  ): Promise<{ error: { message?: string } | null }>;
};

const GLOBAL_PRIORITY_BUCKET_PREFIX = "global-priority-bucket:";

export default function PriorityEditorClient({
  initialRoadmaps,
  initialGlobalPriorityItems,
  initialError = null,
}: PriorityEditorClientProps) {
  const router = useRouter();
  const [roadmaps, setRoadmaps] = useState(initialRoadmaps);
  const [globalPriorityItems, setGlobalPriorityItems] = useState(
    initialGlobalPriorityItems
  );
  const [focusedRoadmapId, setFocusedRoadmapId] = useState(
    initialRoadmaps[0]?.id ?? ""
  );
  const [error, setError] = useState<string | null>(initialError);
  const [monumentOrderError, setMonumentOrderError] = useState<string | null>(null);
  const [globalPriorityError, setGlobalPriorityError] = useState<string | null>(null);
  const [isSavingMonumentOrder, setIsSavingMonumentOrder] = useState(false);
  const [isSavingGlobalPriorityOrder, setIsSavingGlobalPriorityOrder] =
    useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const scrollSettleTimeoutRef = useRef<number | null>(null);
  const scrollSyncTimeoutRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const hasCenteredRoadmapRef = useRef(false);

  useEffect(() => {
    setRoadmaps(initialRoadmaps);
    setGlobalPriorityItems(initialGlobalPriorityItems);
    setFocusedRoadmapId((current) =>
      initialRoadmaps.some((roadmap) => roadmap.id === current)
        ? current
        : initialRoadmaps[0]?.id ?? ""
    );
    setError(initialError);
  }, [initialRoadmaps, initialGlobalPriorityItems, initialError]);

  const monumentRows = useMemo(() => buildMonumentPriorityRows(roadmaps), [roadmaps]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
  );

  const handleFocusRoadmap = useCallback((roadmapId: string) => {
    setFocusedRoadmapId(roadmapId);
  }, []);

  const handleMonumentDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const previousRoadmaps = roadmaps;
      const oldIndex = monumentRows.findIndex(
        (monument) => monument.monumentId === active.id
      );
      const newIndex = monumentRows.findIndex(
        (monument) => monument.monumentId === over.id
      );

      if (oldIndex < 0 || newIndex < 0) return;

      const nextMonuments = arrayMove(monumentRows, oldIndex, newIndex);
      const nextMonumentIds = nextMonuments.map((monument) => monument.monumentId);
      const nextRoadmaps = reorderRoadmapsByMonumentOrder(
        previousRoadmaps,
        nextMonumentIds
      );

      setMonumentOrderError(null);
      setRoadmaps(nextRoadmaps);
      setFocusedRoadmapId((current) =>
        nextRoadmaps.some((roadmap) => roadmap.id === current)
          ? current
          : nextRoadmaps[0]?.id ?? ""
      );

      const supabase = getSupabaseBrowser() as MonumentPriorityRpcClient | null;
      if (!supabase) {
        setRoadmaps(previousRoadmaps);
        setMonumentOrderError("Unable to save Monument order.");
        return;
      }

      setIsSavingMonumentOrder(true);
      try {
        const { error: saveError } = await supabase.rpc(
          "save_monument_priority_order",
          { p_monument_ids: nextMonumentIds }
        );

        if (saveError) {
          throw saveError;
        }

        router.refresh();
      } catch (caught) {
        console.error("Failed to save Monument priority order", caught);
        setRoadmaps(previousRoadmaps);
        setMonumentOrderError("Could not save Monument priority order.");
      } finally {
        setIsSavingMonumentOrder(false);
      }
    },
    [monumentRows, roadmaps, router]
  );

  const handleGlobalPriorityDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

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

      const previousItems = globalPriorityItems;
      const nextItems = moveGlobalPriorityItem(
        previousItems,
        draggedItem,
        overBucket,
        overData?.item
      );
      if (globalPriorityOrdersMatch(previousItems, nextItems)) return;
      const payload = buildGlobalPriorityOrderPayload(nextItems);

      setGlobalPriorityError(null);
      setGlobalPriorityItems(nextItems);

      const supabase = getSupabaseBrowser() as GlobalPriorityRpcClient | null;
      if (!supabase) {
        setGlobalPriorityItems(previousItems);
        setGlobalPriorityError("Unable to save priority order.");
        return;
      }

      setIsSavingGlobalPriorityOrder(true);
      try {
        const { error: saveError } = await supabase.rpc(
          "save_global_priority_order",
          { p_items: payload }
        );

        if (saveError) {
          throw saveError;
        }

        router.refresh();
      } catch (caught) {
        console.error("Failed to save global priority item", caught);
        setGlobalPriorityItems(previousItems);
        setGlobalPriorityError("Could not save priority order.");
      } finally {
        setIsSavingGlobalPriorityOrder(false);
      }
    },
    [globalPriorityItems, router]
  );

  const releaseSuppressedRoadmapClick = useCallback((delay: number) => {
    if (scrollSyncTimeoutRef.current !== null) {
      window.clearTimeout(scrollSyncTimeoutRef.current);
    }

    scrollSyncTimeoutRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      scrollSyncTimeoutRef.current = null;
    }, delay);
  }, []);

  const syncFocusedRoadmapFromScroll = useCallback((scroller: HTMLDivElement) => {
    const scrollerRect = scroller.getBoundingClientRect();
    const scrollerCenter = scrollerRect.left + scrollerRect.width / 2;
    let closestRoadmapId = "";
    let closestDistance = Number.POSITIVE_INFINITY;

    scroller.querySelectorAll<HTMLElement>("[data-roadmap-key]").forEach((preview) => {
      const previewRect = preview.getBoundingClientRect();
      const previewCenter = previewRect.left + previewRect.width / 2;
      const distance = Math.abs(previewCenter - scrollerCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestRoadmapId = preview.dataset.roadmapKey ?? "";
      }
    });

    if (closestRoadmapId) {
      setFocusedRoadmapId((current) =>
        current === closestRoadmapId ? current : closestRoadmapId
      );
    }
  }, []);

  const handleRoadmapScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const scroller = event.currentTarget;
      suppressClickRef.current = true;

      if (scrollSettleTimeoutRef.current !== null) {
        window.clearTimeout(scrollSettleTimeoutRef.current);
      }
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }

      scrollSettleTimeoutRef.current = window.setTimeout(() => {
        scrollSettleTimeoutRef.current = null;
        scrollFrameRef.current = window.requestAnimationFrame(() => {
          scrollFrameRef.current = null;
          syncFocusedRoadmapFromScroll(scroller);
          releaseSuppressedRoadmapClick(ROADMAP_SCROLL_RELEASE_MS);
        });
      }, ROADMAP_SCROLL_SETTLE_MS);
    },
    [releaseSuppressedRoadmapClick, syncFocusedRoadmapFromScroll]
  );

  const scrollFocusedRoadmapIntoView = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !focusedRoadmapId) return;

    const preview = scroller.querySelector<HTMLElement>(
      `[data-roadmap-key="${focusedRoadmapId}"]`
    );
    if (!preview) return;

    const nextScrollLeft =
      preview.offsetLeft - (scroller.clientWidth - preview.offsetWidth) / 2;
    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
    const clampedScrollLeft = Math.min(
      Math.max(0, nextScrollLeft),
      Math.max(0, maxScrollLeft)
    );

    if (Math.abs(scroller.scrollLeft - clampedScrollLeft) < 1) {
      hasCenteredRoadmapRef.current = true;
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    suppressClickRef.current = true;
    scroller.scrollTo({
      left: clampedScrollLeft,
      behavior:
        hasCenteredRoadmapRef.current && !prefersReducedMotion ? "smooth" : "auto",
    });
    hasCenteredRoadmapRef.current = true;
    releaseSuppressedRoadmapClick(ROADMAP_PROGRAMMATIC_SCROLL_RELEASE_MS);
  }, [focusedRoadmapId, releaseSuppressedRoadmapClick]);

  useEffect(() => {
    scrollFocusedRoadmapIntoView();
  }, [scrollFocusedRoadmapIntoView]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
      if (scrollSettleTimeoutRef.current !== null) {
        window.clearTimeout(scrollSettleTimeoutRef.current);
      }
      if (scrollSyncTimeoutRef.current !== null) {
        window.clearTimeout(scrollSyncTimeoutRef.current);
      }
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#050507] text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] pt-6 sm:px-6 sm:pb-12">
        <header>
          <h1 className="text-xs font-semibold text-white/45">
            Priority Editor
          </h1>
        </header>

        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-100">
            {error}
          </div>
        )}

        {monumentRows.length > 0 ? (
          <section className="overflow-hidden rounded-[20px] border border-black/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.075),rgba(113,113,122,0.10)_30%,rgba(24,24,27,0.34)_62%,rgba(255,255,255,0.035))] p-px shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_14px_36px_rgba(0,0,0,0.34)] sm:rounded-[22px]">
            <div className="rounded-[19px] border border-black/60 bg-zinc-950/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_0_22px_rgba(255,255,255,0.018),inset_0_-18px_30px_rgba(0,0,0,0.34)] sm:rounded-[21px] sm:p-4">
              <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <h2 className="text-[11px] font-semibold uppercase text-white/35">
                  Adjust
                </h2>
                {isSavingMonumentOrder ? (
                  <span className="text-[11px] font-medium text-white/35">
                    Saving
                  </span>
                ) : null}
              </div>
              {monumentOrderError ? (
                <p className="mb-2 px-1 text-xs text-red-200/85">
                  {monumentOrderError}
                </p>
              ) : null}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleMonumentDragEnd}
              >
                <SortableContext
                  items={monumentRows.map((monument) => monument.monumentId)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="overflow-hidden rounded-[18px] border border-black/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(113,113,122,0.12)_32%,rgba(39,39,42,0.28)_60%,rgba(255,255,255,0.04))] p-px shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_14px_36px_rgba(0,0,0,0.34)] sm:rounded-[22px]">
                    <div className="overflow-hidden rounded-[17px] border border-black/60 bg-zinc-950/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_0_22px_rgba(255,255,255,0.018),inset_0_-18px_30px_rgba(0,0,0,0.34)] sm:rounded-[21px]">
                      {monumentRows.map((monument, index) => (
                        <SortableMonumentPriorityRow
                          key={monument.monumentId}
                          monument={monument}
                          rank={index + 1}
                        />
                      ))}
                    </div>
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          </section>
        ) : null}

        {globalPriorityItems.length > 0 ? (
          <GlobalPriorityRoadmap
            items={globalPriorityItems}
            error={globalPriorityError}
            isSaving={isSavingGlobalPriorityOrder}
            sensors={sensors}
            onDragEnd={handleGlobalPriorityDragEnd}
          />
        ) : null}

        <section className="space-y-3">
          <div
            ref={scrollerRef}
            className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-3 pb-3 touch-pan-x [-webkit-overflow-scrolling:touch] sm:-mx-4 sm:px-4"
            onScroll={handleRoadmapScroll}
          >
            {roadmaps.map((roadmap) => (
              <RoadmapCarouselCard
                key={roadmap.id}
                roadmap={roadmap}
                active={roadmap.id === focusedRoadmapId}
                onFocus={() => handleFocusRoadmap(roadmap.id)}
                suppressClickRef={suppressClickRef}
              />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function parseGlobalPriorityBucketId(value: string): PriorityBucketId | null {
  if (!value.startsWith(GLOBAL_PRIORITY_BUCKET_PREFIX)) return null;
  const bucket = value.slice(GLOBAL_PRIORITY_BUCKET_PREFIX.length);
  return PRIORITY_ORDER.includes(bucket as PriorityBucketId)
    ? (bucket as PriorityBucketId)
    : null;
}

function getGlobalPriorityItemDragId(item: GlobalPriorityRoadmapItem) {
  return `global-priority-item:${item.type}:${item.id}`;
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

function buildGlobalPriorityOrderPayload(
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

function moveGlobalPriorityItem(
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

    buckets.set(
      targetPriority,
      arrayMove(currentBucket, oldIndex, newIndex)
    );
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

function globalPriorityOrdersMatch(
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

function GlobalPriorityRoadmap({
  items,
  error,
  isSaving,
  sensors,
  onDragEnd,
}: {
  items: GlobalPriorityRoadmapItem[];
  error: string | null;
  isSaving: boolean;
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (event: DragEndEvent) => void;
}) {
  const [openCampaignIds, setOpenCampaignIds] = useState<Record<string, boolean>>(
    {}
  );
  const itemsByPriority = useMemo(() => {
    const grouped = new Map<PriorityBucketId, GlobalPriorityRoadmapItem[]>(
      PRIORITY_ORDER.map((priority) => [priority, []])
    );

    for (const item of sortGlobalPriorityItems(items)) {
      grouped.get(item.priority)?.push(item);
    }

    return grouped;
  }, [items]);
  const handleToggleCampaign = useCallback((campaignId: string) => {
    setOpenCampaignIds((current) => ({
      ...current,
      [campaignId]: !current[campaignId],
    }));
  }, []);

  return (
    <section className="overflow-hidden rounded-[20px] border border-black/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.075),rgba(113,113,122,0.10)_30%,rgba(24,24,27,0.34)_62%,rgba(255,255,255,0.035))] p-px shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_14px_36px_rgba(0,0,0,0.34)] sm:rounded-[22px]">
      <div className="rounded-[19px] border border-black/60 bg-zinc-950/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_0_22px_rgba(255,255,255,0.018),inset_0_-18px_30px_rgba(0,0,0,0.34)] sm:rounded-[21px] sm:p-4">
        {isSaving ? (
          <div className="mb-2 flex justify-end px-1">
            <span className="text-[11px] font-medium text-white/35">Saving</span>
          </div>
        ) : null}
        {error ? <p className="mb-2 px-1 text-xs text-red-200/85">{error}</p> : null}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
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
                />
              );
            })}
          </div>
        </DndContext>
      </div>
    </section>
  );
}

function GlobalPriorityBucket({
  priority,
  items,
  openCampaignIds,
  onToggleCampaign,
}: {
  priority: PriorityBucketId;
  items: GlobalPriorityRoadmapItem[];
  openCampaignIds: Record<string, boolean>;
  onToggleCampaign: (campaignId: string) => void;
}) {
  const bucketId = `${GLOBAL_PRIORITY_BUCKET_PREFIX}${priority}`;
  const { setNodeRef, isOver } = useDroppable({
    id: bucketId,
    data: { bucket: priority },
  });

  return (
    <div ref={setNodeRef} className="space-y-1.5">
      <p className="px-1 text-[10px] font-semibold uppercase leading-none tracking-normal text-zinc-600">
        {priority}
      </p>
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
          {items.map((item) => (
            <SortableGlobalPriorityItem
              key={`${item.type}:${item.id}`}
              item={item}
              isOpen={
                item.type === "campaign" ? openCampaignIds[item.id] ?? false : false
              }
              onToggle={() => onToggleCampaign(item.id)}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableGlobalPriorityItem({
  item,
  isOpen,
  onToggle,
}: {
  item: GlobalPriorityRoadmapItem;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: getGlobalPriorityItemDragId(item),
    data: { item, bucket: item.priority },
  });
  const identity =
    item.emoji?.trim() ||
    item.monumentEmoji?.trim() ||
    getInitials(item.name) ||
    (item.type === "campaign" ? "◇" : "◆");
  const globalRank =
    item.type === "goal" &&
    typeof item.globalRank === "number" &&
    Number.isFinite(item.globalRank) &&
    item.globalRank > 0
      ? item.globalRank
      : null;
  const isCampaign = item.type === "campaign";
  const style: CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "border-b border-black/40 bg-white/[0.026] last:border-b-0",
        isDragging ? "relative z-20 bg-white/[0.06] shadow-2xl shadow-black/50" : ""
      )}
    >
      <div className="flex min-h-10 items-center gap-2 px-2 py-1.5 sm:px-2.5">
        <button
          type="button"
          className="flex size-7 shrink-0 touch-none cursor-grab items-center justify-center rounded-lg border border-black/60 bg-black/30 text-zinc-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] transition hover:bg-white/[0.045] hover:text-zinc-300 active:cursor-grabbing"
          aria-label={`Move ${item.name} priority`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" aria-hidden="true" />
        </button>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-black/60 bg-white/[0.04] text-[11px] font-semibold text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          {identity}
        </span>
        {isCampaign ? (
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
              {item.goals?.length ?? 0} Goal{item.goals?.length === 1 ? "" : "s"}
            </span>
            <ChevronDown
              className={cn(
                "size-3.5 shrink-0 text-zinc-600 transition-transform",
                isOpen ? "rotate-180" : ""
              )}
              aria-hidden="true"
            />
          </button>
        ) : (
          <>
            <p className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight text-white/82">
              {item.name}
            </p>
            {globalRank ? (
              <span className="shrink-0 text-[11px] font-semibold leading-none text-zinc-600">
                #{globalRank}
              </span>
            ) : null}
          </>
        )}
      </div>
      {isCampaign && isOpen ? (
        <div className="border-t border-black/35 bg-black/20 px-2 pb-2 pt-1.5 sm:px-2.5">
          {item.goals && item.goals.length > 0 ? (
            <div className="ml-9 space-y-1">
              {item.goals.map((goal) => (
                <GlobalCampaignGoalRow key={goal.id} goal={goal} />
              ))}
            </div>
          ) : (
            <p className="ml-9 rounded-lg border border-dashed border-black/50 bg-white/[0.018] px-2.5 py-2 text-[11px] text-zinc-600">
              No Goals in this Campaign yet.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function GlobalCampaignGoalRow({ goal }: { goal: RoadmapPriorityGoal }) {
  const identity = goal.emoji?.trim() || goal.monumentEmoji?.trim() || "";
  const globalRank =
    typeof goal.globalRank === "number" &&
    Number.isFinite(goal.globalRank) &&
    goal.globalRank > 0
      ? goal.globalRank
      : null;

  return (
    <div className="flex min-h-8 items-center gap-2 rounded-lg border border-black/45 bg-white/[0.018] px-2 py-1.5">
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
    </div>
  );
}

function buildMonumentPriorityRows(
  roadmaps: MonumentRoadmapPriority[]
): MonumentPriorityRow[] {
  const rowsByMonumentId = new Map<string, MonumentPriorityRow>();

  for (const roadmap of roadmaps) {
    if (rowsByMonumentId.has(roadmap.monumentId)) continue;
    rowsByMonumentId.set(roadmap.monumentId, {
      monumentId: roadmap.monumentId,
      name: roadmap.monumentName,
      emoji: roadmap.monumentEmoji,
      priorityRank: roadmap.monumentPriorityRank,
      createdAt: roadmap.monumentCreatedAt,
    });
  }

  return Array.from(rowsByMonumentId.values());
}

function reorderRoadmapsByMonumentOrder(
  roadmaps: MonumentRoadmapPriority[],
  monumentIds: string[]
): MonumentRoadmapPriority[] {
  const orderByMonumentId = new Map(
    monumentIds.map((monumentId, index) => [monumentId, index + 1])
  );

  return roadmaps
    .map((roadmap, index) => [roadmap, index] as const)
    .sort((a, b) => {
      const monumentDelta =
        (orderByMonumentId.get(a[0].monumentId) ?? Number.POSITIVE_INFINITY) -
        (orderByMonumentId.get(b[0].monumentId) ?? Number.POSITIVE_INFINITY);
      if (monumentDelta !== 0) return monumentDelta;
      return a[1] - b[1];
    })
    .map(([roadmap]) => ({
      ...roadmap,
      monumentPriorityRank:
        orderByMonumentId.get(roadmap.monumentId) ?? roadmap.monumentPriorityRank,
    }));
}

function SortableMonumentPriorityRow({
  monument,
  rank,
}: {
  monument: MonumentPriorityRow;
  rank: number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: monument.monumentId });
  const identity = monument.emoji?.trim() || getInitials(monument.name) || "◆";
  const style: CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex min-h-12 items-center gap-2 border-b border-black/40 bg-white/[0.025] px-2.5 py-2 last:border-b-0 sm:px-3",
        isDragging
          ? "relative z-20 bg-white/[0.055] shadow-2xl shadow-black/50"
          : ""
      )}
    >
      <button
        type="button"
        className="flex size-8 shrink-0 touch-none cursor-grab items-center justify-center rounded-lg border border-black/60 bg-black/30 text-zinc-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] transition hover:bg-white/[0.045] hover:text-zinc-200 active:cursor-grabbing"
        aria-label={`Drag ${monument.name} to reorder`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-black/60 bg-white/[0.04] text-sm font-semibold text-white/82 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        {identity}
      </span>
      <p className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight text-white/82">
        {monument.name}
      </p>
      <span className="shrink-0 rounded-full border border-black/60 bg-black/30 px-2 py-0.5 text-[10px] font-semibold leading-none text-zinc-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
        #{rank}
      </span>
    </div>
  );
}

function RoadmapCarouselCard({
  roadmap,
  active,
  onFocus,
  suppressClickRef,
}: {
  roadmap: MonumentRoadmapPriority;
  active: boolean;
  onFocus: () => void;
  suppressClickRef: MutableRefObject<boolean>;
}) {
  const [openCampaignIds, setOpenCampaignIds] = useState<Record<string, boolean>>(
    {}
  );
  const identity =
    roadmap.monumentEmoji?.trim() ||
    roadmap.roadmapEmoji?.trim() ||
    getInitials(roadmap.monumentName) ||
    "◆";
  const monumentEmoji = roadmap.monumentEmoji?.trim();
  const handleToggleCampaign = useCallback((campaignId: string) => {
    setOpenCampaignIds((current) => ({
      ...current,
      [campaignId]: !current[campaignId],
    }));
  }, []);

  return (
    <article
      data-roadmap-key={roadmap.id}
      role="button"
      tabIndex={0}
      aria-current={active ? "true" : undefined}
      onClick={() => {
        if (suppressClickRef.current) return;
        onFocus();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onFocus();
      }}
      className={cn(
        "group flex h-[72vh] min-h-[30rem] min-w-[88vw] snap-center flex-col overflow-hidden rounded-[22px] border-2 bg-[#040404] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.95),0_10px_20px_-16px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.05)] outline-none transition duration-200 sm:min-w-[24rem] lg:min-w-[28rem]",
        active
          ? "border-black opacity-100 ring-1 ring-black/80"
          : "border-black/70 opacity-[0.78] hover:border-black/90 hover:opacity-100"
      )}
    >
      <div className="border-b border-white/10 px-4 py-3.5 sm:px-5 sm:py-4">
        <h3 className="flex min-w-0 items-center gap-2 text-[15px] font-semibold leading-tight text-white sm:text-base">
          {monumentEmoji ? (
            <span
              aria-hidden
              className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            >
              {monumentEmoji}
            </span>
          ) : null}
          <span className="min-w-0 truncate">{roadmap.monumentName}</span>
        </h3>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {roadmap.items.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center">
            <div className="max-w-[18rem] rounded-2xl border border-dashed border-white/10 bg-white/[0.025] px-5 py-6">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-lg text-white/80">
                {identity}
              </div>
              <p className="mt-4 text-sm font-semibold text-white">
                No Roadmap Goals yet
              </p>
              <p className="mt-2 text-sm leading-6 text-white/42">
                Goals will appear here after they are assigned to this Monument Roadmap.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 space-y-[0.5px] overflow-y-auto overscroll-contain px-3 py-3 sm:px-4">
            {roadmap.items.map((item) => {
              if (item.type === "campaign") {
                return (
                  <CampaignGroup
                    key={item.id}
                    campaign={item.campaign}
                    monumentEmoji={monumentEmoji}
                    isOpen={openCampaignIds[item.campaign.id] ?? false}
                    onToggle={() => handleToggleCampaign(item.campaign.id)}
                  />
                );
              }

              return (
                <GoalRankRow
                  key={item.id}
                  goal={item.goal}
                  monumentEmoji={monumentEmoji}
                />
              );
            })}
          </div>
        )}
      </div>
    </article>
  );
}

function getCampaignStateClasses(state?: string | null): {
  shell: string;
  countBadge: string;
  title: string;
  description: string;
} {
  switch (state?.toUpperCase()) {
    case "PAUSED":
      return {
        shell:
          "border-white/[0.06] bg-[#0D0E10] opacity-90 shadow-[0_16px_40px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.04)]",
        countBadge: "border-white/[0.07] bg-white/[0.035] text-white/48",
        title: "text-white/88",
        description: "text-white/42",
      };
    case "COMPLETED":
      return {
        shell:
          "border-white/[0.055] bg-[#0B0C0D] shadow-[0_14px_34px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.035)]",
        countBadge: "border-white/[0.06] bg-white/[0.03] text-white/40",
        title: "text-white/76",
        description: "text-white/38",
      };
    default:
      return {
        shell:
          "border-white/[0.07] bg-[#101112] shadow-[0_18px_45px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)]",
        countBadge: "border-white/[0.08] bg-white/[0.045] text-white/58",
        title: "text-white",
        description: "text-white/48",
      };
  }
}

function CampaignGroup({
  campaign,
  monumentEmoji,
  isOpen,
  onToggle,
}: {
  campaign: RoadmapPriorityCampaign;
  monumentEmoji?: string | null;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const stateClasses = getCampaignStateClasses(campaign.schedulingState);
  const identity = campaign.emoji?.trim() || getInitials(campaign.name) || "◇";

  return (
    <section
      className={cn(
        "relative min-w-0 overflow-hidden rounded-2xl border p-2.5 sm:rounded-[20px] sm:p-3.5",
        stateClasses.shell
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.08]" />
      <div className="space-y-2 sm:space-y-3">
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={onToggle}
          onKeyDown={(event) => {
            event.stopPropagation();
          }}
          className="flex w-full items-start gap-2 rounded-xl text-left outline-none transition hover:bg-white/[0.025] focus-visible:ring-1 focus-visible:ring-white/20 sm:gap-2.5"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-[12px] font-semibold text-white/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:h-10 sm:w-10 sm:rounded-xl sm:text-sm">
            {identity}
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
                <h4
                  className={cn(
                    "min-w-0 truncate text-[13px] font-semibold leading-tight sm:text-sm",
                    stateClasses.title
                  )}
                  title={campaign.name}
                >
                  {campaign.name}
                </h4>
                <span
                  className={cn(
                    "shrink-0 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[9px] font-medium leading-none sm:px-2 sm:py-1 sm:text-[10px]",
                    stateClasses.countBadge
                  )}
                >
                  {campaign.goals.length} Goal
                  {campaign.goals.length === 1 ? "" : "s"}
                </span>
              </div>
              <ChevronDown
                className={cn(
                  "mt-0.5 size-4 shrink-0 text-white/38 transition-transform",
                  isOpen ? "rotate-180" : ""
                )}
                aria-hidden="true"
              />
            </div>
            {isOpen && campaign.description ? (
              <p
                className={cn(
                  "line-clamp-2 text-[12px] leading-5",
                  stateClasses.description
                )}
              >
                {campaign.description}
              </p>
            ) : null}
          </div>
        </button>
        {isOpen && campaign.goals.length > 0 ? (
          <div className="relative overflow-hidden rounded-[16px] border border-white/10 bg-[#030407] px-1 pb-1.5 pt-1 sm:rounded-[18px] sm:px-2 sm:pb-2.5 sm:pt-1.5">
            <div className="pointer-events-none absolute inset-y-3 left-1 w-px bg-white/10 sm:inset-y-3.5 sm:left-2" />
            <div className="space-y-[0.5px] pt-1.5 sm:pt-3">
              {campaign.goals.map((goal) => (
                <GoalRankRow
                  key={goal.id}
                  goal={goal}
                  monumentEmoji={monumentEmoji}
                  nested
                />
              ))}
            </div>
          </div>
        ) : null}
        {isOpen && campaign.goals.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] px-3 py-3 text-xs text-white/45">
            No Goals in this Campaign yet.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function GoalRankRow({
  goal,
  monumentEmoji,
  nested = false,
}: {
  goal: RoadmapPriorityGoal;
  monumentEmoji?: string | null;
  nested?: boolean;
}) {
  const identity =
    monumentEmoji?.trim() || goal.monumentEmoji?.trim() || goal.emoji?.trim() || "";
  const isCompleted = goal.status?.trim().toUpperCase() === "COMPLETED";

  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        nested
          ? "border-white/8 bg-[linear-gradient(180deg,rgba(66,66,66,0.22)_0%,rgba(46,46,46,0.4)_22%,rgba(28,28,28,0.92)_100%)]"
          : "border-white/[0.07] bg-[#0D0E10] shadow-[0_14px_34px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.04)]",
        isCompleted ? "opacity-[0.82]" : ""
      )}
    >
      <div className="flex items-center gap-2 px-2.5 py-2.5 sm:gap-2.5 sm:px-3">
        {identity ? (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-[11px] font-semibold text-white/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:h-9 sm:w-9 sm:rounded-xl sm:text-sm">
            <span
              aria-hidden
              className="inline-flex items-center justify-center leading-none"
            >
              {identity}
            </span>
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-[13px] font-semibold leading-tight sm:text-sm",
              isCompleted ? "text-white/68" : "text-white"
            )}
            title={goal.name}
          >
            {goal.name}
          </p>
        </div>
        {typeof goal.globalRank === "number" ? (
          <span className="shrink-0 rounded-full border border-white/8 bg-black/25 px-2 py-0.5 text-[10px] font-semibold leading-none text-white/58 sm:text-[11px]">
            #{goal.globalRank}
          </span>
        ) : null}
      </div>
    </div>
  );
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
