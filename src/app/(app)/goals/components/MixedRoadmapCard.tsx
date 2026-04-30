"use client";

import { memo, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, GripVertical } from "lucide-react";

import {
  saveCampaignGoalOrder,
  saveRoadmapItemOrder,
  type RoadmapCampaignGoal,
  type RoadmapMixedItem,
  type RoadmapWithItems,
} from "@/lib/queries/roadmaps";

interface MixedRoadmapCardProps {
  roadmap: RoadmapWithItems;
  variant?: "default" | "compact";
  onClick?: () => void;
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

function sortByPosition<T extends { position: number | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aPosition = a.position ?? Number.POSITIVE_INFINITY;
    const bPosition = b.position ?? Number.POSITIVE_INFINITY;

    if (aPosition !== bPosition) {
      return aPosition - bPosition;
    }

    return 0;
  });
}

function buildOrderedItems(items: RoadmapMixedItem[]): RoadmapMixedItem[] {
  return sortByPosition(items).map((item) => ({
    ...item,
    campaign: item.campaign
      ? {
          ...item.campaign,
          goals: sortByPosition(item.campaign.goals),
        }
      : null,
  }));
}

function applyPositionsToItems(items: RoadmapMixedItem[]): RoadmapMixedItem[] {
  return items.map((item, index) => ({
    ...item,
    position: index + 1,
  }));
}

function applyPositionsToGoals(goals: RoadmapCampaignGoal[]): RoadmapCampaignGoal[] {
  return goals.map((goal, index) => ({
    ...goal,
    position: index + 1,
  }));
}

function DragHandle({
  attributes,
  listeners,
  label,
}: {
  attributes: Record<string, unknown>;
  listeners: Record<string, unknown> | undefined;
  label: string;
}) {
  return (
    <button
      type="button"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/55 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 cursor-grab active:cursor-grabbing"
      aria-label={label}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}

function SortableCampaignGoalRow({
  goal,
  compact,
}: {
  goal: RoadmapCampaignGoal;
  compact: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: goal.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={isDragging ? "z-20" : undefined}
    >
      <div
        className={`flex items-center gap-3 rounded-2xl border border-white/8 bg-black/15 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ${
          isDragging ? "opacity-90 ring-1 ring-white/15" : ""
        }`}
      >
        <DragHandle
          attributes={attributes}
          listeners={listeners}
          label={`Reorder goal ${goal.name}`}
        />
        <div className="min-w-0 flex-1">
          <p className={`truncate text-white/80 ${compact ? "text-[13px]" : "text-sm"}`}>
            {goal.name}
          </p>
        </div>
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">
          {goal.position}
        </span>
      </div>
    </div>
  );
}

function CampaignGoalList({
  campaignId,
  goals,
  compact,
  sensors,
  onReorder,
}: {
  campaignId: string;
  goals: RoadmapCampaignGoal[];
  compact: boolean;
  sensors: ReturnType<typeof useSensors>;
  onReorder: (campaignId: string, event: DragEndEvent) => Promise<void>;
}) {
  if (goals.length === 0) {
    return null;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(event) => void onReorder(campaignId, event)}
    >
      <SortableContext
        items={goals.map((goal) => goal.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2 pt-2">
          {goals.map((goal) => (
            <SortableCampaignGoalRow
              key={goal.id}
              goal={goal}
              compact={compact}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function MixedRoadmapItemContent({
  item,
  compact,
  sensors,
  onCampaignGoalReorder,
}: {
  item: RoadmapMixedItem;
  compact: boolean;
  sensors: ReturnType<typeof useSensors>;
  onCampaignGoalReorder: (
    campaignId: string,
    event: DragEndEvent
  ) => Promise<void>;
}) {
  if (item.item_type === "CAMPAIGN" && item.campaign) {
    const campaignIdentity =
      item.campaign.emoji?.trim() || getInitials(item.campaign.name);
    const goals = sortByPosition(item.campaign.goals);

    return (
      <div className="min-w-0 flex-1 rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0.03)_100%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm font-semibold text-white">
            <span aria-hidden>{campaignIdentity}</span>
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-200">
                Campaign
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/65">
                {item.campaign.scheduling_state}
              </span>
            </div>
            <div className="space-y-1">
              <p className={`font-semibold text-white ${compact ? "text-sm" : "text-[15px]"}`}>
                {item.campaign.name}
              </p>
              {item.campaign.description ? (
                <p className="line-clamp-2 text-sm text-white/50">
                  {item.campaign.description}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2 text-xs text-white/50">
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                {goals.length} goal{goals.length === 1 ? "" : "s"}
              </span>
            </div>
            <CampaignGoalList
              campaignId={item.campaign.id}
              goals={goals}
              compact={compact}
              sensors={sensors}
              onReorder={onCampaignGoalReorder}
            />
          </div>
        </div>
      </div>
    );
  }

  if (item.item_type === "GOAL" && item.goal) {
    return (
      <div className="min-w-0 flex-1 rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0.03)_100%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="space-y-2">
          <span className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-200">
            Goal
          </span>
          <p className={`font-semibold text-white ${compact ? "text-sm" : "text-[15px]"}`}>
            {item.goal.name}
          </p>
        </div>
      </div>
    );
  }

  return null;
}

function SortableMixedRoadmapItemRow({
  item,
  compact,
  sensors,
  onCampaignGoalReorder,
}: {
  item: RoadmapMixedItem;
  compact: boolean;
  sensors: ReturnType<typeof useSensors>;
  onCampaignGoalReorder: (
    campaignId: string,
    event: DragEndEvent
  ) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={isDragging ? "z-10" : undefined}
    >
      <div className="flex items-start gap-3">
        <div className="pt-3">
          <DragHandle
            attributes={attributes}
            listeners={listeners}
            label={`Reorder ${item.item_type === "CAMPAIGN" ? "campaign" : "goal"}`}
          />
        </div>
        <MixedRoadmapItemContent
          item={item}
          compact={compact}
          sensors={sensors}
          onCampaignGoalReorder={onCampaignGoalReorder}
        />
      </div>
    </div>
  );
}

function MixedRoadmapCardImpl({
  roadmap,
  variant = "default",
  onClick,
}: MixedRoadmapCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [orderedItems, setOrderedItems] = useState<RoadmapMixedItem[]>(() =>
    buildOrderedItems(roadmap.items)
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setOrderedItems(buildOrderedItems(roadmap.items));
  }, [roadmap.items]);

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

  const campaignCount = useMemo(
    () => orderedItems.filter((item) => item.item_type === "CAMPAIGN").length,
    [orderedItems]
  );

  const standaloneGoalCount = useMemo(
    () => orderedItems.filter((item) => item.item_type === "GOAL").length,
    [orderedItems]
  );

  const isCompact = variant === "compact";

  async function handleTopLevelDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const previousItems = orderedItems;
    const oldIndex = previousItems.findIndex((item) => item.id === active.id);
    const newIndex = previousItems.findIndex((item) => item.id === over.id);

    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    const reordered = applyPositionsToItems(
      arrayMove(previousItems, oldIndex, newIndex)
    );

    setOrderedItems(reordered);
    setIsSaving(true);

    try {
      await saveRoadmapItemOrder(
        roadmap.id,
        reordered.map((item) => item.id)
      );
    } catch (error) {
      console.error("Error saving roadmap item order:", error);
      setOrderedItems(previousItems);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCampaignGoalDragEnd(
    campaignId: string,
    event: DragEndEvent
  ) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const campaignItem = orderedItems.find(
      (item) => item.item_type === "CAMPAIGN" && item.campaign?.id === campaignId
    );
    const currentGoals = campaignItem?.campaign?.goals;

    if (!campaignItem?.campaign || !currentGoals) {
      return;
    }

    const oldIndex = currentGoals.findIndex((goal) => goal.id === active.id);
    const newIndex = currentGoals.findIndex((goal) => goal.id === over.id);

    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    const reorderedGoals = applyPositionsToGoals(
      arrayMove(currentGoals, oldIndex, newIndex)
    );
    const previousItems = orderedItems;
    const nextItems = orderedItems.map((item) => {
      if (item.item_type !== "CAMPAIGN" || item.campaign?.id !== campaignId) {
        return item;
      }

      return {
        ...item,
        campaign: {
          ...item.campaign,
          goals: reorderedGoals,
        },
      };
    });

    setOrderedItems(nextItems);
    setIsSaving(true);

    try {
      await saveCampaignGoalOrder(
        campaignId,
        reorderedGoals.map((goal) => goal.id)
      );
    } catch (error) {
      console.error("Error saving campaign goal order:", error);
      setOrderedItems(previousItems);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.03)_100%)] shadow-[0_18px_48px_-28px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
      <button
        type="button"
        onClick={() => {
          setIsOpen((open) => !open);
          onClick?.();
        }}
        className={`flex w-full items-start justify-between gap-4 text-left transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${
          isCompact ? "px-4 py-3" : "px-5 py-4"
        }`}
        aria-expanded={isOpen}
      >
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-lg shadow-[inset_0_-1px_0_rgba(255,255,255,0.05)]">
              <span aria-hidden>{roadmap.emoji?.trim() || getInitials(roadmap.title)}</span>
            </div>
            <div className="min-w-0">
              <p
                className={`truncate font-semibold text-white ${
                  isCompact ? "text-[15px]" : "text-base"
                }`}
              >
                {roadmap.title}
              </p>
            </div>
          </div>
          <p className="text-xs uppercase tracking-[0.24em] text-white/55">
            {campaignCount} campaign{campaignCount === 1 ? "" : "s"} {"  "}
            {standaloneGoalCount} standalone goal
            {standaloneGoalCount === 1 ? "" : "s"}
          </p>
        </div>
        <span
          className={`mt-1 shrink-0 rounded-full border border-white/10 bg-white/5 p-2 text-white/70 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
          aria-hidden
        >
          <ChevronDown className="h-4 w-4" />
        </span>
      </button>

      {isOpen ? (
        <div className={`border-t border-white/10 ${isCompact ? "px-4 py-3" : "px-5 py-4"}`}>
          <div className="mb-3 flex min-h-5 items-center justify-end">
            {isSaving ? (
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/45">
                Saving...
              </p>
            ) : null}
          </div>

          {orderedItems.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-5 text-sm text-white/55">
              No roadmap items yet.
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => void handleTopLevelDragEnd(event)}
            >
              <SortableContext
                items={orderedItems.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {orderedItems.map((item) => (
                    <SortableMixedRoadmapItemRow
                      key={item.id}
                      item={item}
                      compact={isCompact}
                      sensors={sensors}
                      onCampaignGoalReorder={handleCampaignGoalDragEnd}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default memo(MixedRoadmapCardImpl);
