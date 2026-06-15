"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
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
  type DraggableAttributes,
  type DraggableSyntheticListeners,
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

import { useAuth } from "@/components/auth/AuthProvider";
import {
  createTopLevelGoalRoadmapItem,
  saveCampaignGoalOrder,
  saveRoadmapItemOrder,
  updateCampaignDetails,
  type RoadmapCampaignGoal,
  type RoadmapMixedItem,
  type RoadmapWithItems,
} from "@/lib/queries/roadmaps";

interface MixedRoadmapCardProps {
  roadmap: RoadmapWithItems;
  variant?: "default" | "compact";
  defaultOpen?: boolean;
  onClick?: () => void;
  onGoalOpen?: (goalId: string) => void;
  onReorderSaved?: () => void | Promise<void>;
  enableCampaignCollapse?: boolean;
}

interface CampaignDetails {
  id: string;
  name: string;
  emoji: string | null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getCampaignStateClasses(state?: string | null): {
  shell: string;
  countBadge: string;
  title: string;
  description: string;
} {
  switch (state?.toUpperCase()) {
    case "ACTIVE":
      return {
        shell:
          "border-white/[0.07] bg-[#101112] shadow-[0_18px_45px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)]",
        countBadge:
          "border-white/[0.08] bg-white/[0.045] text-white/58",
        title: "text-white",
        description: "text-white/48",
      };
    case "PAUSED":
      return {
        shell:
          "border-white/[0.06] bg-[#0D0E10] opacity-90 shadow-[0_16px_40px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.04)]",
        countBadge:
          "border-white/[0.07] bg-white/[0.035] text-white/48",
        title: "text-white/88",
        description: "text-white/42",
      };
    case "COMPLETED":
      return {
        shell:
          "border-white/[0.055] bg-[#0B0C0D] shadow-[0_14px_34px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.035)]",
        countBadge:
          "border-white/[0.06] bg-white/[0.03] text-white/40",
        title: "text-white/76",
        description: "text-white/38",
      };
    default:
      return {
        shell:
          "border-white/[0.07] bg-[#101112] shadow-[0_18px_45px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)]",
        countBadge:
          "border-white/[0.08] bg-white/[0.045] text-white/58",
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
  "border-white/[0.08] bg-white/[0.04] text-white/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-white/[0.14] hover:bg-white/[0.07] hover:text-white";
const ROADMAP_GOAL_IDENTITY_CLASS =
  "inline-flex items-center justify-center leading-none translate-y-[0.5px]";
const STANDALONE_ROADMAP_GOAL_CLASS =
  "border-white/[0.07] bg-[#0D0E10] text-white shadow-[0_14px_34px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.04)]";
const COMPLETED_STANDALONE_ROADMAP_GOAL_CLASS =
  "border-emerald-200/[0.12] bg-[#0B0C0D] text-white shadow-[0_14px_34px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.04)]";
const COMPLETED_ROADMAP_GOAL_BADGE_CLASS =
  "border-emerald-50/28 bg-emerald-950/18 text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]";
const COMPLETED_ROADMAP_GOAL_META_CLASS =
  "border-emerald-50/24 bg-emerald-950/14 text-emerald-50/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]";

function isCompletedGoal(goal: {
  status?: string | null;
  allProjectsCompleted?: boolean;
}): boolean {
  return isCompletedGoalStatus(goal.status);
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

function isLegacyFallbackGoalItem(item: RoadmapMixedItem): boolean {
  return (
    item.item_type === "GOAL" &&
    item.id.startsWith("legacy-goal-") &&
    Boolean(item.goal?.id)
  );
}

function getNestedCampaignGoalIds(items: RoadmapMixedItem[]): Set<string> {
  return new Set(
    items.flatMap((item) => item.campaign?.goals.map((goal) => goal.id) ?? [])
  );
}

function getCampaignIds(items: RoadmapMixedItem[]): string[] {
  return items.flatMap((item) =>
    item.item_type === "CAMPAIGN" && item.campaign ? [item.campaign.id] : []
  );
}

function isStandaloneGoalItem(
  item: RoadmapMixedItem,
  nestedCampaignGoalIds: Set<string>
): boolean {
  if (item.item_type !== "GOAL" || !item.goal) {
    return false;
  }

  return (
    !item.campaign &&
    !nestedCampaignGoalIds.has(item.goal.id)
  );
}

function DragHandle({
  attributes,
  listeners,
  label,
  className,
  children,
  gripClassName,
}: {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
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
  enableCampaignCollapse,
  collapsedCampaignIds,
  onCampaignCollapseToggle,
  userId,
  onCampaignDetailsSaved,
}: {
  item: RoadmapMixedItem;
  compact: boolean;
  sensors: ReturnType<typeof useSensors>;
  onCampaignGoalReorder: (
    campaignId: string,
    event: DragEndEvent
  ) => Promise<void>;
  topLevelHandle: {
    attributes: DraggableAttributes;
    listeners: DraggableSyntheticListeners;
  };
  isAnyDragging: boolean;
  onNestedDragStart: (event: DragStartEvent) => void;
  onNestedDragEnd: (event: DragEndEvent) => void;
  onNestedDragCancel: (event: DragCancelEvent) => void;
  onGoalOpen?: (goalId: string) => void;
  enableCampaignCollapse?: boolean;
  collapsedCampaignIds: Set<string>;
  onCampaignCollapseToggle?: (campaignId: string) => void;
  userId?: string | null;
  onCampaignDetailsSaved?: (
    campaignId: string,
    details: CampaignDetails
  ) => void | Promise<void>;
}) {
  const campaign = item.item_type === "CAMPAIGN" ? item.campaign : null;
  const [isEditMenuOpen, setIsEditMenuOpen] = useState(false);
  const [draftCampaignName, setDraftCampaignName] = useState("");
  const [draftCampaignEmoji, setDraftCampaignEmoji] = useState("");
  const [isSavingCampaignDetails, setIsSavingCampaignDetails] = useState(false);
  const [campaignEditError, setCampaignEditError] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressNextCampaignClickRef = useRef(false);
  const campaignCardRef = useRef<HTMLDivElement | null>(null);
  const campaignEditMenuRef = useRef<HTMLDivElement | null>(null);

  const suppressCampaignHeaderClickBriefly = useCallback(() => {
    suppressNextCampaignClickRef.current = true;
    window.setTimeout(() => {
      suppressNextCampaignClickRef.current = false;
    }, 3000);
  }, []);

  const clearCampaignLongPressTimer = useCallback(() => {
    if (!longPressTimerRef.current) {
      return;
    }

    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }, []);

  const openCampaignEditMenu = useCallback(() => {
    if (!campaign) {
      return;
    }

    setDraftCampaignName(campaign.name);
    setDraftCampaignEmoji(campaign.emoji ?? "");
    setCampaignEditError(null);
    setIsEditMenuOpen(true);
  }, [campaign]);

  const closeCampaignEditMenu = useCallback(() => {
    if (isSavingCampaignDetails) {
      return;
    }

    setIsEditMenuOpen(false);
    setCampaignEditError(null);
  }, [isSavingCampaignDetails]);

  useEffect(() => {
    return clearCampaignLongPressTimer;
  }, [clearCampaignLongPressTimer]);

  useEffect(() => {
    if (!isEditMenuOpen) {
      return;
    }

    const handleDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        campaignEditMenuRef.current?.contains(target)
      ) {
        return;
      }

      if (
        target instanceof Node &&
        campaignCardRef.current?.contains(target)
      ) {
        suppressCampaignHeaderClickBriefly();
      }

      closeCampaignEditMenu();
    };

    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        closeCampaignEditMenu();
      }
    };

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleDocumentKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [
    closeCampaignEditMenu,
    isEditMenuOpen,
    suppressCampaignHeaderClickBriefly,
  ]);

  const handleCampaignHeaderPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (!campaign || isAnyDragging || isEditMenuOpen) {
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    clearCampaignLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      suppressNextCampaignClickRef.current = true;
      openCampaignEditMenu();
      longPressTimerRef.current = null;
    }, 500);
  };

  const handleSaveCampaignDetails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!campaign) {
      return;
    }

    if (!userId) {
      setCampaignEditError("Sign in required to edit this campaign.");
      return;
    }

    const nextName = draftCampaignName.trim();
    if (!nextName) {
      setCampaignEditError("Campaign name is required.");
      return;
    }

    setIsSavingCampaignDetails(true);
    setCampaignEditError(null);

    try {
      const details = await updateCampaignDetails(userId, campaign.id, {
        name: draftCampaignName,
        emoji: draftCampaignEmoji,
      });
      await onCampaignDetailsSaved?.(campaign.id, details);
      setIsEditMenuOpen(false);
      setCampaignEditError(null);
    } catch (error) {
      setCampaignEditError(
        getErrorMessage(error, "Unable to update campaign.")
      );
    } finally {
      setIsSavingCampaignDetails(false);
    }
  };

  if (item.item_type === "CAMPAIGN" && item.campaign) {
    const campaignId = item.campaign.id;
    const campaignName = item.campaign.name;
    const campaignIdentity =
      item.campaign.emoji?.trim() || getInitials(campaignName);
    const goals = sortByPosition(item.campaign.goals);
    const isCampaignCollapsed =
      enableCampaignCollapse && collapsedCampaignIds.has(campaignId);
    const campaignGoalsId = `roadmap-campaign-goals-${campaignId}`;
    const campaignStateClasses = getCampaignStateClasses(
      item.campaign.scheduling_state
    );
    const canToggleCampaign =
      enableCampaignCollapse && Boolean(onCampaignCollapseToggle);
    const toggleCampaignCollapse = () => {
      if (!canToggleCampaign) {
        return;
      }

      onCampaignCollapseToggle?.(campaignId);
    };
    const handleCampaignHeaderClick = (event: MouseEvent<HTMLDivElement>) => {
      if (suppressNextCampaignClickRef.current || isEditMenuOpen) {
        event.preventDefault();
        event.stopPropagation();
        suppressNextCampaignClickRef.current = false;
        return;
      }

      toggleCampaignCollapse();
    };
    const handleCampaignHeaderKeyDown = (
      event: KeyboardEvent<HTMLDivElement>
    ) => {
      if (event.target !== event.currentTarget) {
        return;
      }

      if (event.key === "Enter" && event.shiftKey) {
        event.preventDefault();
        openCampaignEditMenu();
        return;
      }

      if (!canToggleCampaign || isEditMenuOpen) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
        }
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleCampaignCollapse();
      }
    };

    return (
      <div
        ref={campaignCardRef}
        className={`relative min-w-0 flex-1 overflow-hidden rounded-2xl border p-2.5 sm:rounded-[20px] sm:p-3.5 ${campaignStateClasses.shell}`}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.08]" />
        <div className="space-y-2 sm:space-y-3">
          <div
            className={`flex select-none items-start gap-1.5 rounded-[14px] transition-colors sm:gap-2.5 sm:rounded-[18px] ${
              canToggleCampaign
                ? "cursor-pointer active:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 sm:hover:bg-white/[0.025]"
                : ""
            }`}
            onPointerDown={handleCampaignHeaderPointerDown}
            onPointerUp={clearCampaignLongPressTimer}
            onPointerLeave={clearCampaignLongPressTimer}
            onPointerCancel={clearCampaignLongPressTimer}
            onClick={handleCampaignHeaderClick}
            onKeyDown={handleCampaignHeaderKeyDown}
            role={canToggleCampaign ? "button" : undefined}
            tabIndex={canToggleCampaign ? 0 : undefined}
            aria-keyshortcuts="Shift+Enter"
            aria-expanded={canToggleCampaign ? !isCampaignCollapsed : undefined}
            aria-controls={canToggleCampaign ? campaignGoalsId : undefined}
            aria-label={
              canToggleCampaign
                ? `${isCampaignCollapsed ? "Expand" : "Collapse"} campaign ${campaignName}`
                : undefined
            }
          >
            <div
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <DragHandle
                attributes={topLevelHandle.attributes}
                listeners={topLevelHandle.listeners}
                label={`Reorder campaign ${campaignName}`}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-[11px] font-semibold text-white/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-white/[0.14] hover:bg-white/[0.07] hover:text-white sm:h-10 sm:w-10 sm:rounded-xl sm:text-sm"
              >
                <span aria-hidden>{campaignIdentity}</span>
              </DragHandle>
            </div>
            <div className="min-w-0 flex-1 space-y-1 sm:space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
                  <p
                    className={`min-w-0 truncate font-semibold leading-tight ${campaignStateClasses.title} ${compact ? "text-[13px] sm:text-sm" : "text-[14px] sm:text-[15px]"}`}
                    title={campaignName}
                  >
                    {campaignName}
                  </p>
                  <span
                    className={`shrink-0 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[9px] font-medium leading-none sm:px-2 sm:py-1 sm:text-[10px] ${campaignStateClasses.countBadge}`}
                  >
                    {goals.length} goal{goals.length === 1 ? "" : "s"}
                  </span>
                </div>
                {enableCampaignCollapse ? (
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onCampaignCollapseToggle?.(campaignId);
                    }}
                    className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] p-1.5 text-white/70 transition hover:border-white/18 hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                    aria-expanded={!isCampaignCollapsed}
                    aria-controls={campaignGoalsId}
                    aria-label={`${isCampaignCollapsed ? "Expand" : "Collapse"} campaign ${campaignName}`}
                  >
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${
                        isCampaignCollapsed ? "" : "rotate-180"
                      }`}
                      aria-hidden
                    />
                  </button>
                ) : null}
              </div>
              <div className="space-y-0.5 sm:space-y-1">
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
          {isEditMenuOpen ? (
            <div
              ref={campaignEditMenuRef}
              className="absolute left-3 right-3 top-3 z-50 rounded-2xl border border-white/10 bg-[#090A0C] p-3 shadow-[0_24px_60px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(255,255,255,0.06)] sm:left-14 sm:right-4 sm:top-4 sm:p-3.5"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <form className="space-y-3" onSubmit={handleSaveCampaignDetails}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/62">
                    Edit campaign
                  </p>
                  <button
                    type="button"
                    onClick={closeCampaignEditMenu}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-white/58 transition hover:border-white/18 hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                  >
                    Cancel
                  </button>
                </div>
                <div className="flex items-center gap-2.5">
                  <input
                    aria-label="Campaign emoji"
                    value={draftCampaignEmoji}
                    onChange={(event) => setDraftCampaignEmoji(event.target.value)}
                    maxLength={2}
                    placeholder="◆"
                    className="h-11 w-11 shrink-0 rounded-xl border border-white/12 bg-white/[0.05] text-center text-lg text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] outline-none transition placeholder:text-white/28 focus:border-white/28 focus:bg-white/[0.08] focus:ring-2 focus:ring-white/10"
                  />
                  <input
                    aria-label="Campaign name"
                    value={draftCampaignName}
                    onChange={(event) => setDraftCampaignName(event.target.value)}
                    placeholder="Campaign name"
                    className="h-11 min-w-0 flex-1 rounded-xl border border-white/12 bg-white/[0.05] px-3 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] outline-none transition placeholder:text-white/30 focus:border-white/28 focus:bg-white/[0.08] focus:ring-2 focus:ring-white/10"
                  />
                </div>
                {campaignEditError ? (
                  <p className="rounded-xl border border-red-400/18 bg-red-500/10 px-2.5 py-2 text-[12px] leading-4 text-red-100/88">
                    {campaignEditError}
                  </p>
                ) : null}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="submit"
                    disabled={
                      isSavingCampaignDetails || draftCampaignName.trim().length === 0
                    }
                    className="rounded-full border border-white/14 bg-white/[0.1] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:border-white/24 hover:bg-white/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {isSavingCampaignDetails ? "Saving..." : "Save"}
                  </button>
                </div>
              </form>
            </div>
          ) : null}
          {goals.length > 0 && !isCampaignCollapsed ? (
            <div
              id={campaignGoalsId}
              className="relative overflow-hidden rounded-[16px] border border-white/10 bg-[#030407] px-1 pb-1.5 pt-1 sm:rounded-[18px] sm:px-2 sm:pb-2.5 sm:pt-1.5"
            >
              <div className="pointer-events-none absolute inset-y-3 left-1 w-px bg-white/10 sm:left-2 sm:inset-y-3.5" />
              <CampaignGoalList
                campaignId={campaignId}
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
        className={`relative min-w-0 flex-1 overflow-hidden rounded-2xl border p-2.5 sm:rounded-[18px] sm:p-3 ${
          isCompleted
            ? COMPLETED_STANDALONE_ROADMAP_GOAL_CLASS
            : STANDALONE_ROADMAP_GOAL_CLASS
        }`}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.08]" />
        <div className="flex items-start gap-1.5 sm:gap-2.5">
          <DragHandle
            attributes={topLevelHandle.attributes}
            listeners={topLevelHandle.listeners}
            label={`Reorder goal ${goal.name}`}
            className={`flex h-7 w-7 items-center justify-center rounded-lg border text-[11px] font-semibold transition sm:h-9 sm:w-9 sm:rounded-xl sm:text-sm ${ROADMAP_GOAL_CARD_HANDLE_CLASS}`}
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
  enableCampaignCollapse,
  collapsedCampaignIds,
  onCampaignCollapseToggle,
  userId,
  onCampaignDetailsSaved,
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
  enableCampaignCollapse?: boolean;
  collapsedCampaignIds: Set<string>;
  onCampaignCollapseToggle?: (campaignId: string) => void;
  userId?: string | null;
  onCampaignDetailsSaved?: (
    campaignId: string,
    details: CampaignDetails
  ) => void | Promise<void>;
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
          enableCampaignCollapse={enableCampaignCollapse}
          collapsedCampaignIds={collapsedCampaignIds}
          onCampaignCollapseToggle={onCampaignCollapseToggle}
          userId={userId}
          onCampaignDetailsSaved={onCampaignDetailsSaved}
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
  defaultOpen = false,
  onClick,
  onGoalOpen,
  onReorderSaved,
  enableCampaignCollapse = false,
}: MixedRoadmapCardProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const knownCampaignIdsRef = useRef<Set<string>>(
    new Set(getCampaignIds(roadmap.items))
  );
  const [collapsedCampaignIds, setCollapsedCampaignIds] = useState<Set<string>>(
    () => new Set(knownCampaignIdsRef.current)
  );
  const [orderedItems, setOrderedItems] = useState<RoadmapMixedItem[]>(() =>
    buildOrderedItems(roadmap.items)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [activeDragCount, setActiveDragCount] = useState(0);

  useEffect(() => {
    setOrderedItems(buildOrderedItems(roadmap.items));
  }, [roadmap.items]);

  useEffect(() => {
    const nextKnownCampaignIds = new Set(getCampaignIds(roadmap.items));

    setCollapsedCampaignIds((currentIds) => {
      const nextIds = new Set<string>();

      for (const campaignId of nextKnownCampaignIds) {
        const isNewCampaign = !knownCampaignIdsRef.current.has(campaignId);
        if (isNewCampaign || currentIds.has(campaignId)) {
          nextIds.add(campaignId);
        }
      }

      return nextIds;
    });
    knownCampaignIdsRef.current = nextKnownCampaignIds;
  }, [roadmap.items]);

  useEffect(() => {
    setIsOpen(defaultOpen);
  }, [defaultOpen, roadmap.id]);

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
    const bodyStyle = body.style as CSSStyleDeclaration & {
      webkitTouchCallout: string;
    };
    const previousBodyUserSelect = bodyStyle.userSelect;
    const previousBodyWebkitUserSelect = bodyStyle.webkitUserSelect;
    const previousBodyWebkitTouchCallout = bodyStyle.webkitTouchCallout;
    const previousDocumentOverscrollBehavior = documentElement.style.overscrollBehavior;

    bodyStyle.userSelect = "none";
    bodyStyle.webkitUserSelect = "none";
    bodyStyle.webkitTouchCallout = "none";
    documentElement.style.overscrollBehavior = "none";

    window.addEventListener("touchmove", preventTouchScrollWhileDragging, {
      passive: false,
    });

    return () => {
      bodyStyle.userSelect = previousBodyUserSelect;
      bodyStyle.webkitUserSelect = previousBodyWebkitUserSelect;
      bodyStyle.webkitTouchCallout = previousBodyWebkitTouchCallout;
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

  const handleCampaignCollapseToggle = useCallback((campaignId: string) => {
    setCollapsedCampaignIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(campaignId)) {
        nextIds.delete(campaignId);
      } else {
        nextIds.add(campaignId);
      }

      return nextIds;
    });
  }, []);

  const handleCampaignDetailsSaved = useCallback(
    async (campaignId: string, details: CampaignDetails) => {
      setOrderedItems((currentItems) =>
        currentItems.map((item) => {
          if (item.item_type !== "CAMPAIGN" || item.campaign?.id !== campaignId) {
            return item;
          }

          return {
            ...item,
            campaign: {
              ...item.campaign,
              name: details.name,
              emoji: details.emoji,
            },
          };
        })
      );

      await onReorderSaved?.();
    },
    [onReorderSaved]
  );

  const campaignCount = useMemo(
    () => orderedItems.filter((item) => item.item_type === "CAMPAIGN").length,
    [orderedItems]
  );

  const topLevelItems = useMemo(() => {
    const nestedCampaignGoalIds = getNestedCampaignGoalIds(orderedItems);

    return orderedItems.filter((item) => {
      if (item.item_type !== "GOAL") {
        return true;
      }

      return isStandaloneGoalItem(item, nestedCampaignGoalIds);
    });
  }, [orderedItems]);

  const standaloneGoalCount = useMemo(
    () => topLevelItems.filter((item) => item.item_type === "GOAL").length,
    [topLevelItems]
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
      const realReordered = [...reordered];
      const legacyItems = reordered.filter(isLegacyFallbackGoalItem);

      if (legacyItems.length > 0) {
        const createdItems = await Promise.all(
          legacyItems.map((item) =>
            createTopLevelGoalRoadmapItem({
              roadmapId: roadmap.id,
              goalId: item.goal!.id,
              position: item.position,
            })
          )
        );

        const createdItemsByLegacyId = new Map(
          createdItems.map((createdItem, index) => [
            legacyItems[index].id,
            createdItem,
          ])
        );

        for (let index = 0; index < realReordered.length; index += 1) {
          const createdItem = createdItemsByLegacyId.get(realReordered[index].id);
          if (!createdItem) {
            continue;
          }

          realReordered[index] = {
            ...realReordered[index],
            id: createdItem.id,
            roadmap_id: createdItem.roadmap_id,
            position: createdItem.position,
          };
        }

        setOrderedItems(realReordered);
      }

      const attemptedItemIds = realReordered.map((item) => item.id);
      await saveRoadmapItemOrder(roadmap.id, attemptedItemIds);
      await onReorderSaved?.();
    } catch {
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
    const currentGoals = campaignItem?.campaign
      ? sortByPosition(campaignItem.campaign.goals)
      : null;

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
              <div className="hidden grid-cols-2 gap-2 text-[0.58rem] text-white/55 sm:grid sm:text-[0.68rem]">
                <span className="min-w-0 rounded-full border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-center font-medium uppercase tracking-[0.08em] sm:px-2 sm:py-1 sm:tracking-[0.1em]">
                  {campaignCount} CAMPAIGN{campaignCount === 1 ? "" : "S"}
                </span>
                <span className="min-w-0 rounded-full border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-center font-medium uppercase tracking-[0.08em] sm:px-2 sm:py-1 sm:tracking-[0.1em]">
                  {standaloneGoalCount} GOAL
                  {standaloneGoalCount === 1 ? "" : "S"}
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

          {topLevelItems.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] px-3 py-4 text-sm text-white/55 sm:px-4 sm:py-5">
              No roadmap items yet.
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleAnyDragStart}
              onDragEnd={(event) => {
                handleAnyDragEnd();
                void handleTopLevelDragEnd(event);
              }}
              onDragCancel={handleAnyDragCancel}
            >
              <SortableContext
                items={topLevelItems.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2 sm:space-y-2.5">
                  {topLevelItems.map((item) => (
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
                      enableCampaignCollapse={enableCampaignCollapse}
                      collapsedCampaignIds={collapsedCampaignIds}
                      onCampaignCollapseToggle={handleCampaignCollapseToggle}
                      userId={user?.id ?? null}
                      onCampaignDetailsSaved={handleCampaignDetailsSaved}
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
