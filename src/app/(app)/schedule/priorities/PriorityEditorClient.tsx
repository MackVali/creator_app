"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type PointerEvent,
  type UIEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  TouchSensor,
  type DragEndEvent,
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
  type MonumentRoadmapPriority,
  type RoadmapPriorityCampaign,
  type RoadmapPriorityGoal,
} from "./utils";

interface PriorityEditorClientProps {
  initialRoadmaps: MonumentRoadmapPriority[];
  initialError?: string | null;
}

const ROADMAP_SWIPE_THRESHOLD_PX = 48;

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

export default function PriorityEditorClient({
  initialRoadmaps,
  initialError = null,
}: PriorityEditorClientProps) {
  const router = useRouter();
  const [roadmaps, setRoadmaps] = useState(initialRoadmaps);
  const [focusedRoadmapId, setFocusedRoadmapId] = useState(
    initialRoadmaps[0]?.id ?? ""
  );
  const [error, setError] = useState<string | null>(initialError);
  const [monumentOrderError, setMonumentOrderError] = useState<string | null>(null);
  const [isSavingMonumentOrder, setIsSavingMonumentOrder] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const scrollSyncTimeoutRef = useRef<number | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const pointerDraggingRef = useRef(false);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    setRoadmaps(initialRoadmaps);
    setFocusedRoadmapId((current) =>
      initialRoadmaps.some((roadmap) => roadmap.id === current)
        ? current
        : initialRoadmaps[0]?.id ?? ""
    );
    setError(initialError);
  }, [initialRoadmaps, initialError]);

  const focusedIndex = useMemo(
    () => roadmaps.findIndex((roadmap) => roadmap.id === focusedRoadmapId),
    [focusedRoadmapId, roadmaps]
  );
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

  const handleRoadmapScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      if (pointerDraggingRef.current || suppressClickRef.current) {
        return;
      }

      const scroller = event.currentTarget;
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }

      scrollFrameRef.current = window.requestAnimationFrame(() => {
        const scrollerRect = scroller.getBoundingClientRect();
        const scrollerCenter = scrollerRect.left + scrollerRect.width / 2;
        let closestRoadmapId = focusedRoadmapId;
        let closestDistance = Number.POSITIVE_INFINITY;

        scroller.querySelectorAll<HTMLElement>("[data-roadmap-key]").forEach((preview) => {
          const previewRect = preview.getBoundingClientRect();
          const previewCenter = previewRect.left + previewRect.width / 2;
          const distance = Math.abs(previewCenter - scrollerCenter);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestRoadmapId = preview.dataset.roadmapKey ?? focusedRoadmapId;
          }
        });

        scrollFrameRef.current = null;
        if (closestRoadmapId !== focusedRoadmapId) {
          handleFocusRoadmap(closestRoadmapId);
        }
      });
    },
    [focusedRoadmapId, handleFocusRoadmap]
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
    suppressClickRef.current = true;
    scroller.scrollTo({
      left: Math.max(0, nextScrollLeft),
      behavior: "auto",
    });

    if (scrollSyncTimeoutRef.current !== null) {
      window.clearTimeout(scrollSyncTimeoutRef.current);
    }
    scrollSyncTimeoutRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      scrollSyncTimeoutRef.current = null;
    }, 260);
  }, [focusedRoadmapId]);

  useEffect(() => {
    scrollFocusedRoadmapIntoView();
  }, [scrollFocusedRoadmapIntoView]);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    pointerDraggingRef.current = true;
  }, []);

  const clearPointer = useCallback(() => {
    pointerStartRef.current = null;
    pointerDraggingRef.current = false;
  }, []);

  const handlePointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const start = pointerStartRef.current;
      clearPointer();
      if (!start || roadmaps.length === 0) return;

      const deltaX = start.x - event.clientX;
      const deltaY = start.y - event.clientY;
      if (
        Math.abs(deltaX) < ROADMAP_SWIPE_THRESHOLD_PX ||
        Math.abs(deltaX) < Math.abs(deltaY)
      ) {
        return;
      }

      const currentIndex = focusedIndex >= 0 ? focusedIndex : 0;
      const nextIndex =
        (currentIndex + (deltaX > 0 ? 1 : -1) + roadmaps.length) % roadmaps.length;
      suppressClickRef.current = true;
      if (scrollSyncTimeoutRef.current !== null) {
        window.clearTimeout(scrollSyncTimeoutRef.current);
      }
      scrollSyncTimeoutRef.current = window.setTimeout(() => {
        suppressClickRef.current = false;
        scrollSyncTimeoutRef.current = null;
      }, 260);
      handleFocusRoadmap(roadmaps[nextIndex]?.id ?? focusedRoadmapId);
    },
    [clearPointer, focusedIndex, focusedRoadmapId, handleFocusRoadmap, roadmaps]
  );

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
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

        <section className="space-y-3">
          <div
            ref={scrollerRef}
            className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-3 pb-3 touch-pan-x sm:-mx-4 sm:px-4"
            onScroll={handleRoadmapScroll}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={clearPointer}
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

        {monumentRows.length > 0 ? (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3 px-1">
              <h2 className="text-[11px] font-semibold uppercase text-white/35">
                Monument Priority
              </h2>
              {isSavingMonumentOrder ? (
                <span className="text-[11px] font-medium text-white/35">
                  Saving
                </span>
              ) : null}
            </div>
            {monumentOrderError ? (
              <p className="px-1 text-xs text-red-200/85">{monumentOrderError}</p>
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
                <div className="overflow-hidden rounded-2xl border border-black bg-[#060607] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
                  {monumentRows.map((monument, index) => (
                    <SortableMonumentPriorityRow
                      key={monument.monumentId}
                      monument={monument}
                      rank={index + 1}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </section>
        ) : null}
      </div>
    </main>
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
        "flex min-h-12 items-center gap-2 border-b border-white/[0.055] bg-[#08090A] px-2.5 py-2 last:border-b-0 sm:px-3",
        isDragging ? "relative z-20 shadow-2xl shadow-black/50" : ""
      )}
    >
      <button
        type="button"
        className="flex size-8 shrink-0 touch-none cursor-grab items-center justify-center rounded-lg border border-white/[0.08] bg-black/35 text-white/52 transition hover:text-white/78 active:cursor-grabbing"
        aria-label={`Drag ${monument.name} to reorder`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.035] text-sm font-semibold text-white/88">
        {identity}
      </span>
      <p className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight text-white/88">
        {monument.name}
      </p>
      <span className="shrink-0 rounded-full border border-white/[0.07] bg-black/30 px-2 py-0.5 text-[10px] font-semibold leading-none text-white/52">
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
          <div className="flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-3 py-3 sm:space-y-3 sm:px-4">
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
            <div className="space-y-1.5 pt-1.5 sm:space-y-2 sm:pt-3">
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
