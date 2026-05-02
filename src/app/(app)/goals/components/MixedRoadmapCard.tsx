"use client";

import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragStartEvent,
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
  onGoalOpen?: (goalId: string) => void;
  onReorderSaved?: () => void | Promise<void>;
}

function getCampaignStateClasses(state?: string | null): {
  shell: string;
  badge: string;
  countBadge: string;
  title: string;
  description: string;
} {
  switch (state?.toUpperCase()) {
    case "ACTIVE":
      return {
        shell:
          "border-white/10 bg-[linear-gradient(180deg,rgba(78,78,78,0.28)_0%,rgba(58,58,58,0.34)_14%,rgba(42,42,42,0.96)_48%,rgba(28,28,28,0.99)_100%)] shadow-[0_18px_44px_-26px_rgba(0,0,0,0.92),inset_0_1px_0_rgba(255,255,255,0.04),inset_0_-18px_24px_rgba(0,0,0,0.16)]",
        badge:
          "border-white/10 bg-white/[0.05] text-white/62",
        countBadge:
          "border-white/8 bg-black/28 text-white/56",
        title: "text-white",
        description: "text-white/48",
      };
    case "PAUSED":
      return {
        shell:
          "border-white/8 bg-[linear-gradient(180deg,rgba(70,70,70,0.22)_0%,rgba(54,54,54,0.28)_16%,rgba(40,40,40,0.95)_50%,rgba(26,26,26,0.99)_100%)] opacity-90 shadow-[0_18px_44px_-26px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.03),inset_0_-18px_24px_rgba(0,0,0,0.14)]",
        badge:
          "border-amber-200/16 bg-amber-200/8 text-amber-50/80",
        countBadge:
          "border-white/8 bg-black/24 text-white/48",
        title: "text-white/88",
        description: "text-white/42",
      };
    case "COMPLETED":
      return {
        shell:
          "border-white/8 bg-[linear-gradient(180deg,rgba(64,64,64,0.2)_0%,rgba(50,50,50,0.24)_16%,rgba(38,38,38,0.94)_50%,rgba(24,24,24,0.99)_100%)] shadow-[0_16px_36px_-28px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.02),inset_0_-16px_22px_rgba(0,0,0,0.12)]",
        badge:
          "border-white/10 bg-white/[0.04] text-white/58",
        countBadge:
          "border-white/8 bg-black/20 text-white/40",
        title: "text-white/76",
        description: "text-white/38",
      };
    default:
      return {
        shell:
          "border-white/10 bg-[linear-gradient(180deg,rgba(78,78,78,0.28)_0%,rgba(58,58,58,0.34)_14%,rgba(42,42,42,0.96)_48%,rgba(28,28,28,0.99)_100%)] shadow-[0_18px_44px_-26px_rgba(0,0,0,0.92),inset_0_1px_0_rgba(255,255,255,0.04),inset_0_-18px_24px_rgba(0,0,0,0.16)]",
        badge:
          "border-white/10 bg-white/[0.05] text-white/62",
        countBadge:
          "border-white/8 bg-black/28 text-white/56",
        title: "text-white",
        description: "text-white/48",
      };
  }
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

function getGoalIdentity(goal: {
  name: string;
  emoji?: string | null;
  monumentEmoji?: string | null;
}): string {
  const emoji = goal.emoji?.trim();
  if (emoji) {
    return emoji;
  }

  const monumentEmoji = goal.monumentEmoji?.trim();
  if (monumentEmoji) {
    return monumentEmoji;
  }

  return getInitials(goal.name);
}

function isCompletedGoalStatus(status?: string | null): boolean {
  return typeof status === "string" && status.trim().toUpperCase() === "COMPLETED";
}

const COMPLETED_ROADMAP_GOAL_SHADOW =
  "shadow-[0_26px_52px_rgba(2,32,24,0.6),0_12px_28px_rgba(1,55,34,0.45),inset_0_1px_0_rgba(255,255,255,0.12)]";
const COMPLETED_ROADMAP_GOAL_CLASS =
  "border-[rgba(16,185,129,0.55)] bg-[linear-gradient(135deg,_rgba(30,204,163,0.95)_0%,_rgba(16,185,129,0.85)_45%,_rgba(4,120,87,0.92)_100%)] text-emerald-50 ring-1 ring-emerald-300/60 backdrop-blur";
const ROADMAP_GOAL_HANDLE_CLASS =
  "isolate overflow-visible border-white/14 bg-[linear-gradient(180deg,rgba(52,52,52,0.96)_0%,rgba(20,20,20,0.98)_32%,rgba(8,8,8,0.99)_100%)] text-white/88 shadow-[0_8px_18px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_0_1px_rgba(0,0,0,0.18)] backdrop-blur-sm hover:border-white/22 hover:bg-[linear-gradient(180deg,rgba(66,66,66,0.98)_0%,rgba(26,26,26,0.99)_32%,rgba(10,10,10,1)_100%)] hover:text-white";
const ROADMAP_GOAL_CARD_HANDLE_CLASS =
  "isolate overflow-visible border-white/16 bg-[linear-gradient(180deg,rgba(56,56,56,0.96)_0%,rgba(22,22,22,0.98)_32%,rgba(8,8,8,0.99)_100%)] text-white shadow-[0_10px_22px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_0_1px_rgba(0,0,0,0.2)] backdrop-blur-sm hover:border-white/24 hover:bg-[linear-gradient(180deg,rgba(70,70,70,0.98)_0%,rgba(28,28,28,0.99)_32%,rgba(10,10,10,1)_100%)] hover:text-white";
const ROADMAP_GOAL_IDENTITY_CLASS =
  "inline-flex items-center justify-center leading-none translate-y-[0.5px]";
const COMPLETED_ROADMAP_GOAL_BADGE_CLASS =
  "border-emerald-50/28 bg-emerald-950/18 text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]";
const COMPLETED_ROADMAP_GOAL_META_CLASS =
  "border-emerald-50/24 bg-emerald-950/14 text-emerald-50/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]";

function isCompletedGoal(goal: {
  status?: string | null;
  allProjectsCompleted?: boolean;
}): boolean {
  return isCompletedGoalStatus(goal.status) || goal.allProjectsCompleted === true;
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
  className,
  children,
  gripClassName,
}: {
  attributes: Record<string, unknown>;
  listeners: Record<string, unknown> | undefined;
  label: string;
  className?: string;
  children?: ReactNode;
  gripClassName?: string;
}) {
  return (
    <button
      type="button"
      className={`shrink-0 cursor-grab touch-none select-none active:cursor-grabbing [-webkit-touch-callout:none] [-webkit-user-select:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${className ?? "flex h-6.5 w-6.5 items-center justify-center rounded-lg border border-white/12 bg-black/30 text-white/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-white/20 hover:bg-black/45 hover:text-white/85 sm:h-8 sm:w-8 sm:rounded-xl"}`}
      aria-label={label}
      {...attributes}
      {...listeners}
    >
      {children ?? <GripVertical className={gripClassName ?? "h-3.5 w-3.5 sm:h-4 sm:w-4"} />}
    </button>
  );
}

function SortableCampaignGoalRow({
  goal,
  compact,
  isAnyDragging,
  onGoalOpen,
}: {
  goal: RoadmapCampaignGoal;
  compact: boolean;
  isAnyDragging: boolean;
  onGoalOpen?: (goalId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: goal.id });
  const isCompleted = isCompletedGoal(goal);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={isDragging ? "z-20 w-full" : "w-full"}
    >
      <div
        className={`flex w-full items-center gap-1 rounded-lg border px-1.5 py-1.5 shadow-[inset_2px_0_0_rgba(255,255,255,0.08),inset_0_1px_0_rgba(255,255,255,0.03),inset_0_-10px_16px_rgba(0,0,0,0.14)] sm:gap-2 sm:px-2.5 sm:py-2 ${
          isCompleted
            ? `${COMPLETED_ROADMAP_GOAL_CLASS} ${COMPLETED_ROADMAP_GOAL_SHADOW}`
            : "border-white/8 bg-[linear-gradient(180deg,rgba(66,66,66,0.22)_0%,rgba(46,46,46,0.4)_22%,rgba(28,28,28,0.92)_100%)]"
        } ${
          isDragging ? "opacity-90 ring-1 ring-white/20" : ""
        } ${isAnyDragging ? "select-none [-webkit-user-select:none]" : ""}`}
      >
        <DragHandle
          attributes={attributes}
          listeners={listeners}
          label={`Reorder goal ${goal.name}`}
          className={`flex h-6.5 w-6.5 items-center justify-center rounded-md border text-[9px] font-semibold shadow-[inset_0_-1px_0_rgba(255,255,255,0.03)] transition sm:h-8 sm:w-8 sm:rounded-lg sm:text-[11px] ${ROADMAP_GOAL_HANDLE_CLASS}`}
        >
          <span aria-hidden className={ROADMAP_GOAL_IDENTITY_CLASS}>{getGoalIdentity(goal)}</span>
        </DragHandle>
        <button
          type="button"
          onClick={() => onGoalOpen?.(goal.id)}
          className="flex min-w-0 flex-1 items-center gap-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 sm:gap-2"
        >
          <p
            className={`min-w-0 flex-1 truncate font-medium ${
              isCompleted ? "text-emerald-50/92" : "text-white/82"
            } ${
              compact ? "text-[11px] sm:text-[12px]" : "text-[12px] sm:text-[13px]"
            }`}
          >
            {goal.name}
          </p>
          <div
            className={`rounded-full border px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.12em] sm:px-2 sm:py-1 sm:text-[9px] sm:tracking-[0.18em] ${
              isCompleted
                ? COMPLETED_ROADMAP_GOAL_META_CLASS
                : "border-white/8 bg-white/[0.03] text-white/35"
            }`}
          >
            #{goal.position}
          </div>
        </button>
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
  onDragStart,
  onDragEnd,
  onDragCancel,
  isAnyDragging,
  onGoalOpen,
}: {
  campaignId: string;
  goals: RoadmapCampaignGoal[];
  compact: boolean;
  sensors: ReturnType<typeof useSensors>;
  onReorder: (campaignId: string, event: DragEndEvent) => Promise<void>;
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragCancel: (event: DragCancelEvent) => void;
  isAnyDragging: boolean;
  onGoalOpen?: (goalId: string) => void;
}) {
  if (goals.length === 0) {
    return null;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={(event) => {
        onDragEnd(event);
        void onReorder(campaignId, event);
      }}
      onDragCancel={onDragCancel}
    >
      <SortableContext
        items={goals.map((goal) => goal.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="w-full space-y-1.5 pt-1.5 sm:space-y-2 sm:pt-3">
          {goals.map((goal) => (
            <SortableCampaignGoalRow
              key={goal.id}
              goal={goal}
              compact={compact}
              isAnyDragging={isAnyDragging}
              onGoalOpen={onGoalOpen}
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
  topLevelHandle,
  isAnyDragging,
  onNestedDragStart,
  onNestedDragEnd,
  onNestedDragCancel,
  onGoalOpen,
}: {
  item: RoadmapMixedItem;
  compact: boolean;
  sensors: ReturnType<typeof useSensors>;
  onCampaignGoalReorder: (
    campaignId: string,
    event: DragEndEvent
  ) => Promise<void>;
  topLevelHandle: {
    attributes: Record<string, unknown>;
    listeners: Record<string, unknown> | undefined;
  };
  isAnyDragging: boolean;
  onNestedDragStart: (event: DragStartEvent) => void;
  onNestedDragEnd: (event: DragEndEvent) => void;
  onNestedDragCancel: (event: DragCancelEvent) => void;
  onGoalOpen?: (goalId: string) => void;
}) {
  if (item.item_type === "CAMPAIGN" && item.campaign) {
    const campaignIdentity =
      item.campaign.emoji?.trim() || getInitials(item.campaign.name);
    const goals = sortByPosition(item.campaign.goals);
    const campaignStateClasses = getCampaignStateClasses(
      item.campaign.scheduling_state
    );

    return (
      <div
        className={`relative min-w-0 flex-1 overflow-hidden rounded-[20px] border p-2.5 sm:rounded-[24px] sm:p-3.5 ${campaignStateClasses.shell}`}
      >
        <div className="pointer-events-none absolute inset-x-2.5 top-0 h-12 rounded-b-[24px] bg-[radial-gradient(85%_100%_at_50%_0%,rgba(255,255,255,0.08),rgba(255,255,255,0.02)_44%,transparent_78%)] sm:inset-x-3 sm:h-14 sm:rounded-b-[28px]" />
        <div className="pointer-events-none absolute inset-x-3.5 bottom-2.5 h-7 rounded-full bg-[radial-gradient(60%_100%_at_50%_100%,rgba(0,0,0,0.18),transparent_76%)] blur-md sm:inset-x-4 sm:bottom-3 sm:h-8" />
        <div className="space-y-2 sm:space-y-3">
          <div className="flex items-start gap-1.5 sm:gap-2.5">
            <DragHandle
              attributes={topLevelHandle.attributes}
              listeners={topLevelHandle.listeners}
              label={`Reorder campaign ${item.campaign.name}`}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/14 bg-[linear-gradient(180deg,rgba(96,96,96,0.16)_0%,rgba(56,56,56,0.28)_28%,rgba(32,32,32,0.82)_100%)] text-[11px] font-semibold text-white shadow-[inset_0_-1px_0_rgba(255,255,255,0.04)] transition hover:border-white/24 hover:bg-[linear-gradient(180deg,rgba(108,108,108,0.18)_0%,rgba(62,62,62,0.3)_28%,rgba(36,36,36,0.86)_100%)] hover:text-white sm:h-10 sm:w-10 sm:rounded-2xl sm:text-sm"
            >
              <span aria-hidden>{campaignIdentity}</span>
            </DragHandle>
            <div className="min-w-0 flex-1 space-y-1.5 sm:space-y-2">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span
                  className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.12em] sm:px-2 sm:py-1 sm:text-[10px] sm:tracking-[0.18em] ${campaignStateClasses.badge}`}
                >
                  {item.campaign.scheduling_state}
                </span>
                <span
                  className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium sm:px-2 sm:py-1 sm:text-[10px] ${campaignStateClasses.countBadge}`}
                >
                  {goals.length} goal{goals.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="space-y-0.5 sm:space-y-1">
                <p
                  className={`font-semibold leading-tight ${campaignStateClasses.title} ${compact ? "text-[13px] sm:text-sm" : "text-[14px] sm:text-[15px]"}`}
                >
                  {item.campaign.name}
                </p>
                {item.campaign.description ? (
                  <p
                    className={`line-clamp-1 text-[12px] leading-4 sm:line-clamp-2 sm:text-[13px] sm:leading-5 ${campaignStateClasses.description}`}
                  >
                    {item.campaign.description}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
          {goals.length > 0 ? (
            <div className="relative overflow-hidden rounded-[16px] border border-white/10 bg-[#030407] px-1 pb-1.5 pt-1 sm:rounded-[18px] sm:px-2 sm:pb-2.5 sm:pt-1.5">
              <div className="pointer-events-none absolute inset-y-3 left-1 w-px bg-white/10 sm:left-2 sm:inset-y-3.5" />
              <CampaignGoalList
                campaignId={item.campaign.id}
                goals={goals}
                compact={compact}
                sensors={sensors}
                onReorder={onCampaignGoalReorder}
                onDragStart={onNestedDragStart}
                onDragEnd={onNestedDragEnd}
                onDragCancel={onNestedDragCancel}
                isAnyDragging={isAnyDragging}
                onGoalOpen={onGoalOpen}
              />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (item.item_type === "GOAL" && item.goal) {
    const goal = item.goal;
    const goalIdentity = getGoalIdentity(goal);
    const isCompleted = isCompletedGoal(goal);

    return (
      <div
        className={`relative min-w-0 flex-1 overflow-hidden rounded-[20px] border p-2.5 sm:rounded-[22px] sm:p-3.5 ${
          isCompleted
            ? `${COMPLETED_ROADMAP_GOAL_CLASS} ${COMPLETED_ROADMAP_GOAL_SHADOW}`
            : "border-white/10 bg-[linear-gradient(180deg,rgba(76,76,76,0.24)_0%,rgba(58,58,58,0.3)_14%,rgba(40,40,40,0.94)_54%,rgba(24,24,24,0.99)_100%)] shadow-[0_22px_40px_-28px_rgba(0,0,0,0.96),0_6px_12px_-10px_rgba(255,255,255,0.03),inset_0_1px_0_rgba(255,255,255,0.05),inset_0_-18px_24px_rgba(0,0,0,0.16)]"
        }`}
      >
        <div className="pointer-events-none absolute inset-x-2.5 top-0 h-10 rounded-b-[20px] bg-[radial-gradient(80%_100%_at_50%_0%,rgba(255,255,255,0.08),rgba(255,255,255,0.02)_46%,transparent_78%)] sm:inset-x-3 sm:h-12 sm:rounded-b-[24px]" />
        <div className="pointer-events-none absolute inset-x-4 bottom-2.5 h-6 rounded-full bg-[radial-gradient(55%_100%_at_50%_100%,rgba(0,0,0,0.2),transparent_76%)] blur-md sm:inset-x-5 sm:bottom-3 sm:h-7" />
        <div className="flex items-start gap-1.5 sm:gap-2.5">
          <DragHandle
            attributes={topLevelHandle.attributes}
            listeners={topLevelHandle.listeners}
            label={`Reorder goal ${goal.name}`}
            className={`flex h-7 w-7 items-center justify-center rounded-lg border text-[11px] font-semibold shadow-[inset_0_-1px_0_rgba(255,255,255,0.04)] transition sm:h-10 sm:w-10 sm:rounded-2xl sm:text-sm ${ROADMAP_GOAL_CARD_HANDLE_CLASS}`}
          >
            <span aria-hidden className={ROADMAP_GOAL_IDENTITY_CLASS}>{goalIdentity}</span>
          </DragHandle>
          <button
            type="button"
            onClick={() => onGoalOpen?.(goal.id)}
            className="min-w-0 flex-1 space-y-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 sm:space-y-1.5"
          >
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span
                className={`inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] sm:px-2 sm:py-1 sm:text-[10px] sm:tracking-[0.2em] ${
                  isCompleted
                    ? COMPLETED_ROADMAP_GOAL_BADGE_CLASS
                    : "border-white/12 bg-white/[0.05] text-white/82"
                }`}
              >
                Goal
              </span>
              <span
                className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium sm:px-2 sm:py-1 sm:text-[10px] ${
                  isCompleted
                    ? COMPLETED_ROADMAP_GOAL_META_CLASS
                    : "border-white/8 bg-black/25 text-white/50"
                }`}
              >
                Roadmap level
              </span>
            </div>
            <p
              className={`font-semibold leading-tight ${
                isCompleted ? "text-emerald-50" : "text-white"
              } ${compact ? "text-[13px] sm:text-sm" : "text-[14px] sm:text-[15px]"}`}
            >
              {goal.name}
            </p>
          </button>
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
  isAnyDragging,
  onNestedDragStart,
  onNestedDragEnd,
  onNestedDragCancel,
  onGoalOpen,
}: {
  item: RoadmapMixedItem;
  compact: boolean;
  sensors: ReturnType<typeof useSensors>;
  onCampaignGoalReorder: (
    campaignId: string,
    event: DragEndEvent
  ) => Promise<void>;
  isAnyDragging: boolean;
  onNestedDragStart: (event: DragStartEvent) => void;
  onNestedDragEnd: (event: DragEndEvent) => void;
  onNestedDragCancel: (event: DragCancelEvent) => void;
  onGoalOpen?: (goalId: string) => void;
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
      <div
        className={`rounded-[22px] border border-transparent p-0.5 transition-colors sm:rounded-[26px] sm:p-1.5 ${
          isDragging ? "border-white/20 bg-white/[0.02]" : ""
        } ${isAnyDragging ? "select-none [-webkit-user-select:none]" : ""}`}
      >
        <MixedRoadmapItemContent
          item={item}
          compact={compact}
          sensors={sensors}
          onCampaignGoalReorder={onCampaignGoalReorder}
          topLevelHandle={{ attributes, listeners }}
          isAnyDragging={isAnyDragging}
          onNestedDragStart={onNestedDragStart}
          onNestedDragEnd={onNestedDragEnd}
          onNestedDragCancel={onNestedDragCancel}
          onGoalOpen={onGoalOpen}
        />
      </div>
    </div>
  );
}

function preventTouchScrollWhileDragging(event: TouchEvent) {
  event.preventDefault();
}

function MixedRoadmapCardImpl({
  roadmap,
  variant = "default",
  onClick,
  onGoalOpen,
  onReorderSaved,
}: MixedRoadmapCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [orderedItems, setOrderedItems] = useState<RoadmapMixedItem[]>(() =>
    buildOrderedItems(roadmap.items)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [activeDragCount, setActiveDragCount] = useState(0);

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

  useEffect(() => {
    if (activeDragCount === 0) {
      return;
    }

    const { body, documentElement } = document;
    const previousBodyUserSelect = body.style.userSelect;
    const previousBodyWebkitUserSelect = body.style.webkitUserSelect;
    const previousBodyWebkitTouchCallout = body.style.webkitTouchCallout;
    const previousDocumentOverscrollBehavior = documentElement.style.overscrollBehavior;

    body.style.userSelect = "none";
    body.style.webkitUserSelect = "none";
    body.style.webkitTouchCallout = "none";
    documentElement.style.overscrollBehavior = "none";

    window.addEventListener("touchmove", preventTouchScrollWhileDragging, {
      passive: false,
    });

    return () => {
      body.style.userSelect = previousBodyUserSelect;
      body.style.webkitUserSelect = previousBodyWebkitUserSelect;
      body.style.webkitTouchCallout = previousBodyWebkitTouchCallout;
      documentElement.style.overscrollBehavior = previousDocumentOverscrollBehavior;
      window.removeEventListener("touchmove", preventTouchScrollWhileDragging);
    };
  }, [activeDragCount]);

  function handleAnyDragStart() {
    setActiveDragCount((count) => count + 1);
  }

  function handleAnyDragEnd() {
    setActiveDragCount(0);
  }

  function handleAnyDragCancel() {
    setActiveDragCount(0);
  }

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
      await onReorderSaved?.();
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
      await onReorderSaved?.();
    } catch (error) {
      console.error("Error saving campaign goal order:", error);
      setOrderedItems(previousItems);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-[22px] border-2 border-white/14 bg-[#040404] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.95),0_10px_20px_-16px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.05)]">
      <button
        type="button"
        onClick={() => {
          setIsOpen((open) => !open);
          onClick?.();
        }}
        className={`flex w-full items-start justify-between gap-2.5 text-left transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
          isCompact ? "px-3 py-2.5 sm:px-4 sm:py-3" : "px-4 py-3 sm:px-5 sm:py-3.5"
        }`}
        aria-expanded={isOpen}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-zinc-700 text-base text-white shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)] sm:h-11 sm:w-11 sm:rounded-2xl sm:text-lg">
              <span aria-hidden>{roadmap.emoji?.trim() || getInitials(roadmap.title)}</span>
            </div>
            <div className="min-w-0 flex-1 space-y-0.5 sm:space-y-1">
              <p
                className={`truncate font-semibold text-white ${
                  isCompact ? "text-[14px] sm:text-[15px]" : "text-[15px] sm:text-[17px]"
                }`}
              >
                {roadmap.title}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-white/55 sm:gap-2 sm:text-[11px]">
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 font-medium sm:px-2.5 sm:py-1">
                  {campaignCount} campaign{campaignCount === 1 ? "" : "s"}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 font-medium sm:px-2.5 sm:py-1">
                  {standaloneGoalCount} standalone goal
                  {standaloneGoalCount === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </div>
        </div>
        <span
          className={`mt-0.5 shrink-0 rounded-full border border-white/10 bg-white/[0.04] p-1.5 text-white/70 transition-transform sm:p-2 ${
            isOpen ? "rotate-180" : ""
          }`}
          aria-hidden
        >
          <ChevronDown className="h-4 w-4" />
        </span>
      </button>

      {isOpen ? (
        <div className={`border-t border-white/10 ${isCompact ? "px-3 py-2.5 sm:px-4 sm:py-3" : "px-4 py-3 sm:px-5 sm:py-3.5"}`}>
          <div className="mb-1.5 flex items-center justify-end sm:mb-2">
            {isSaving ? (
              <p className="rounded-full border border-white/12 bg-white/[0.06] px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-white/72 sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.18em]">
                Saving...
              </p>
            ) : null}
          </div>

          {orderedItems.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] px-3 py-4 text-sm text-white/55 sm:px-4 sm:py-5">
              No roadmap items yet.
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleAnyDragStart}
              onDragEnd={(event) => {
                handleAnyDragEnd(event);
                void handleTopLevelDragEnd(event);
              }}
              onDragCancel={handleAnyDragCancel}
            >
              <SortableContext
                items={orderedItems.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2 sm:space-y-2.5">
                  {orderedItems.map((item) => (
                    <SortableMixedRoadmapItemRow
                      key={item.id}
                      item={item}
                      compact={isCompact}
                      sensors={sensors}
                      onCampaignGoalReorder={handleCampaignGoalDragEnd}
                      isAnyDragging={activeDragCount > 0}
                      onNestedDragStart={handleAnyDragStart}
                      onNestedDragEnd={handleAnyDragEnd}
                      onNestedDragCancel={handleAnyDragCancel}
                      onGoalOpen={onGoalOpen}
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
