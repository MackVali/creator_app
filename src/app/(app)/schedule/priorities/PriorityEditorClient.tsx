"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  type DragEndEvent,
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
import { ChevronDown, GripVertical, SlidersHorizontal, X } from "lucide-react";

import { getSupabaseBrowser } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  compareRankValues,
  HABIT_TYPE_LABELS,
  HABIT_TYPE_ORDER,
  type GlobalPriorityRoadmapItem,
  type HabitBucketId,
  normalizePriority,
  PRIORITY_ORDER,
  type PriorityBucketId,
  type RoadmapHabitItem,
  type RoadmapPriorityGoal,
  sortHabitRoadmapItems,
  sortGlobalPriorityItems,
  type UserPriorityFilterOptionData,
} from "./utils";

interface PriorityEditorClientProps {
  userId: string;
  initialGlobalPriorityItems: GlobalPriorityRoadmapItem[];
  initialHabitItems: RoadmapHabitItem[];
  initialMonumentOptions: UserPriorityFilterOptionData[];
  initialSkillOptions: UserPriorityFilterOptionData[];
  initialError?: string | null;
}

type GlobalPriorityOrderPayloadItem = {
  id: string;
  type: "goal" | "campaign";
  priority: PriorityBucketId;
};

type CampaignGoalPriorityUpdate = {
  id: string;
  priority: PriorityBucketId;
  priorityOrder: number;
};

type PriorityFilterOption = {
  id: string;
  name: string;
  icon: string | null;
};

type PriorityRoadmapType = "goals" | "habits";

type PriorityEditorSupabaseClient = NonNullable<
  ReturnType<typeof getSupabaseBrowser>
> & {
  rpc(
    fn: "save_global_priority_order",
    args: { p_items: GlobalPriorityOrderPayloadItem[] }
  ): Promise<{ error: { message?: string } | null }>;
  rpc(
    fn: "recalculate_goal_global_rank"
  ): Promise<{ error: { message?: string } | null }>;
  rpc(
    fn: "save_global_habit_order",
    args: { p_user_id: string; p_habit_type: string; p_habit_ids: string[] }
  ): Promise<{ error: { message?: string } | null }>;
};

const GLOBAL_PRIORITY_BUCKET_PREFIX = "global-priority-bucket:";
const CAMPAIGN_GOAL_BUCKET_PREFIX = "campaign-goal-bucket:";
const GLOBAL_HABIT_BUCKET_PREFIX = "global-habit-bucket:";
const GLOBAL_HABIT_ITEM_PREFIX = "global-habit-item:";
const EDGE_AUTOSCROLL_THRESHOLD_PX = 96;
const EDGE_AUTOSCROLL_MAX_STEP_PX = 12;
const PRIORITY_DND_AUTO_SCROLL = {
  threshold: { x: 0, y: 0.16 },
  acceleration: 8,
  interval: 5,
};

export default function PriorityEditorClient({
  userId,
  initialGlobalPriorityItems,
  initialHabitItems,
  initialMonumentOptions,
  initialSkillOptions,
  initialError = null,
}: PriorityEditorClientProps) {
  const router = useRouter();
  const [globalPriorityItems, setGlobalPriorityItems] = useState(
    initialGlobalPriorityItems
  );
  const [habitRoadmapItems, setHabitRoadmapItems] = useState(initialHabitItems);
  const [error, setError] = useState<string | null>(initialError);
  const [globalPriorityError, setGlobalPriorityError] = useState<string | null>(null);
  const [isSavingGlobalPriorityOrder, setIsSavingGlobalPriorityOrder] =
    useState(false);
  const [habitRoadmapError, setHabitRoadmapError] = useState<string | null>(null);
  const [isSavingHabitOrder, setIsSavingHabitOrder] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [selectedRoadmapType, setSelectedRoadmapType] =
    useState<PriorityRoadmapType>("goals");
  const [selectedMonumentFilterIds, setSelectedMonumentFilterIds] = useState<
    string[]
  >([]);
  const [selectedSkillFilterIds, setSelectedSkillFilterIds] = useState<string[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
  );

  useEffect(() => {
    setGlobalPriorityItems(initialGlobalPriorityItems);
    setHabitRoadmapItems(initialHabitItems);
    setError(initialError);
  }, [initialGlobalPriorityItems, initialHabitItems, initialError]);

  const filterSourceItems = useMemo(
    () =>
      selectedRoadmapType === "habits"
        ? habitRoadmapItems
        : globalPriorityItems,
    [globalPriorityItems, habitRoadmapItems, selectedRoadmapType]
  );
  const { monuments: monumentFilterOptions, skills: skillFilterOptions } =
    useMemo(
      () =>
        buildAvailablePriorityFilterOptions(
          filterSourceItems,
          initialMonumentOptions,
          initialSkillOptions
        ),
      [filterSourceItems, initialMonumentOptions, initialSkillOptions]
    );
  const selectedMonumentFilters = useMemo(
    () =>
      selectedMonumentFilterIds
        .map((id) => monumentFilterOptions.find((option) => option.id === id))
        .filter((option): option is PriorityFilterOption => Boolean(option)),
    [monumentFilterOptions, selectedMonumentFilterIds]
  );
  const selectedSkillFilters = useMemo(
    () =>
      selectedSkillFilterIds
        .map((id) => skillFilterOptions.find((option) => option.id === id))
        .filter((option): option is PriorityFilterOption => Boolean(option)),
    [selectedSkillFilterIds, skillFilterOptions]
  );
  const hasActiveFilters =
    selectedMonumentFilters.length > 0 || selectedSkillFilters.length > 0;
  const visibleGlobalPriorityItems = useMemo(
    () =>
      hasActiveFilters
        ? filterGlobalPriorityItems(
            globalPriorityItems,
            selectedMonumentFilters,
            selectedSkillFilters
          )
        : globalPriorityItems,
    [
      globalPriorityItems,
      hasActiveFilters,
      selectedMonumentFilters,
      selectedSkillFilters,
    ]
  );
  const visibleHabitItems = useMemo(
    () =>
      hasActiveFilters
        ? filterHabitRoadmapItems(
            habitRoadmapItems,
            selectedMonumentFilters,
            selectedSkillFilters
          )
        : habitRoadmapItems,
    [
      habitRoadmapItems,
      hasActiveFilters,
      selectedMonumentFilters,
      selectedSkillFilters,
    ]
  );
  const filterSummary = useMemo(
    () =>
      buildPriorityFilterSummary(
        selectedRoadmapType,
        selectedMonumentFilters,
        selectedSkillFilters
      ),
    [selectedRoadmapType, selectedMonumentFilters, selectedSkillFilters]
  );
  const toggleMonumentFilter = useCallback((optionId: string) => {
    setSelectedMonumentFilterIds((current) => toggleSelectedFilterId(current, optionId));
  }, []);
  const toggleSkillFilter = useCallback((optionId: string) => {
    setSelectedSkillFilterIds((current) => toggleSelectedFilterId(current, optionId));
  }, []);
  const clearPriorityFilters = useCallback(() => {
    setSelectedMonumentFilterIds([]);
    setSelectedSkillFilterIds([]);
  }, []);
  const hasAnyRoadmapItems =
    globalPriorityItems.length > 0 || habitRoadmapItems.length > 0;

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

      const supabase = getSupabaseBrowser() as PriorityEditorSupabaseClient | null;
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

  const handleCampaignGoalDragEnd = useCallback(
    async (campaign: GlobalPriorityRoadmapItem, event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || campaign.type !== "campaign") return;

      const activeData = active.data.current as
        | { campaignId?: string; goal?: RoadmapPriorityGoal }
        | undefined;
      const draggedGoal = activeData?.goal;
      if (!draggedGoal || activeData?.campaignId !== campaign.id) return;

      const overData = over.data.current as
        | {
            campaignId?: string;
            bucket?: PriorityBucketId;
            goal?: RoadmapPriorityGoal;
          }
        | undefined;
      if (overData?.campaignId && overData.campaignId !== campaign.id) return;

      const targetPriority =
        overData?.bucket ??
        overData?.goal?.priority ??
        parseCampaignGoalBucketId(String(over.id), campaign.id);
      if (!targetPriority) return;

      const previousItems = globalPriorityItems;
      const currentCampaign =
        previousItems.find(
          (item) => item.type === "campaign" && item.id === campaign.id
        ) ?? campaign;
      const previousGoals = currentCampaign.goals ?? [];
      const nextGoals = moveCampaignGoal(
        previousGoals,
        draggedGoal,
        targetPriority,
        overData?.goal
      );

      if (campaignGoalOrdersMatch(previousGoals, nextGoals)) return;

      const updates = buildCampaignGoalPriorityUpdates(previousGoals, nextGoals);
      if (updates.length === 0) return;

      setGlobalPriorityError(null);
      setGlobalPriorityItems(
        applyCampaignGoalOrder(previousItems, currentCampaign.id, nextGoals)
      );

      const supabase = getSupabaseBrowser() as PriorityEditorSupabaseClient | null;
      if (!supabase) {
        setGlobalPriorityItems(previousItems);
        setGlobalPriorityError("Unable to save Campaign Goal order.");
        return;
      }

      try {
        await saveCampaignGoalPriorityOrder(supabase, updates);
        router.refresh();
      } catch (caught) {
        console.error("Failed to save Campaign Goal order", caught);
        setGlobalPriorityItems(previousItems);
        setGlobalPriorityError("Could not save Campaign Goal order.");
      }
    },
    [globalPriorityItems, router]
  );

  const handleHabitDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeData = active.data.current as
        | { habit?: RoadmapHabitItem }
        | undefined;
      const draggedHabit = activeData?.habit;
      if (!draggedHabit) return;

      const overData = over.data.current as
        | { habitType?: HabitBucketId; habit?: RoadmapHabitItem }
        | undefined;
      const targetHabitType =
        overData?.habitType ??
        overData?.habit?.habitType ??
        parseGlobalHabitBucketId(String(over.id));
      if (!targetHabitType || targetHabitType !== draggedHabit.habitType) return;

      const previousItems = habitRoadmapItems;
      const nextItems = moveHabitRoadmapItem(
        previousItems,
        draggedHabit,
        targetHabitType,
        overData?.habit
      );
      if (habitRoadmapOrdersMatch(previousItems, nextItems)) return;

      setHabitRoadmapError(null);
      setHabitRoadmapItems(nextItems);

      const supabase = getSupabaseBrowser() as PriorityEditorSupabaseClient | null;
      if (!supabase) {
        setHabitRoadmapItems(previousItems);
        setHabitRoadmapError("Unable to save Habit order.");
        return;
      }

      setIsSavingHabitOrder(true);
      try {
        const { error: saveError } = await supabase.rpc(
          "save_global_habit_order",
          {
            p_user_id: userId,
            p_habit_type: targetHabitType,
            p_habit_ids: nextItems
              .filter((habit) => habit.habitType === targetHabitType)
              .map((habit) => habit.id),
          }
        );

        if (saveError) {
          throw saveError;
        }

        router.refresh();
      } catch (caught) {
        console.error("Failed to save global Habit order", caught);
        setHabitRoadmapItems(previousItems);
        setHabitRoadmapError("Could not save Habit order.");
      } finally {
        setIsSavingHabitOrder(false);
      }
    },
    [habitRoadmapItems, router, userId]
  );

  return (
    <main className="min-h-screen bg-[#050507] text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] pt-0 sm:px-6 sm:pb-12 sm:pt-2">
        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-100">
            {error}
          </div>
        )}

        {hasAnyRoadmapItems ? (
          <>
            <PriorityAdjustFilters
              isOpen={adjustOpen}
              selectedType={selectedRoadmapType}
              summary={filterSummary}
              monumentOptions={monumentFilterOptions}
              skillOptions={skillFilterOptions}
              selectedMonumentIds={selectedMonumentFilterIds}
              selectedSkillIds={selectedSkillFilterIds}
              hasActiveFilters={hasActiveFilters}
              onOpenChange={setAdjustOpen}
              onTypeChange={setSelectedRoadmapType}
              onToggleMonument={toggleMonumentFilter}
              onToggleSkill={toggleSkillFilter}
              onClear={clearPriorityFilters}
            />
            {selectedRoadmapType === "habits" ? (
              <GlobalHabitRoadmap
                items={visibleHabitItems}
                totalItemCount={habitRoadmapItems.length}
                error={habitRoadmapError}
                isSaving={isSavingHabitOrder}
                sensors={sensors}
                isFiltered={hasActiveFilters}
                onDragEnd={handleHabitDragEnd}
              />
            ) : (
              <GlobalPriorityRoadmap
                items={visibleGlobalPriorityItems}
                error={globalPriorityError}
                isSaving={isSavingGlobalPriorityOrder}
                sensors={sensors}
                isFiltered={hasActiveFilters}
                onDragEnd={handleGlobalPriorityDragEnd}
                onCampaignGoalDragEnd={handleCampaignGoalDragEnd}
              />
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}

function PriorityAdjustFilters({
  isOpen,
  selectedType,
  summary,
  monumentOptions,
  skillOptions,
  selectedMonumentIds,
  selectedSkillIds,
  hasActiveFilters,
  onOpenChange,
  onTypeChange,
  onToggleMonument,
  onToggleSkill,
  onClear,
}: {
  isOpen: boolean;
  selectedType: PriorityRoadmapType;
  summary: string;
  monumentOptions: PriorityFilterOption[];
  skillOptions: PriorityFilterOption[];
  selectedMonumentIds: string[];
  selectedSkillIds: string[];
  hasActiveFilters: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onTypeChange: (type: PriorityRoadmapType) => void;
  onToggleMonument: (optionId: string) => void;
  onToggleSkill: (optionId: string) => void;
  onClear: () => void;
}) {
  const panelId = "priority-adjust-panel";

  return (
    <section className="overflow-hidden rounded-[18px] border border-black/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.075),rgba(113,113,122,0.10)_32%,rgba(39,39,42,0.28)_62%,rgba(255,255,255,0.035))] p-px shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_14px_36px_rgba(0,0,0,0.30)] sm:rounded-[20px]">
      <div className="overflow-hidden rounded-[17px] border border-black/60 bg-zinc-950/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_-18px_30px_rgba(0,0,0,0.32)] sm:rounded-[19px]">
        {!isOpen ? (
          <div className="border-b border-black/40 bg-black/20 px-2.5 py-1.5 sm:px-3 sm:py-2">
            <button
              type="button"
              onClick={() => onOpenChange(true)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className="inline-flex min-h-7 w-full items-center justify-center gap-2 rounded-lg border border-black/60 bg-white/[0.025] px-3 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400 transition hover:border-black/40 hover:bg-white/[0.055] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/30 sm:min-h-8 sm:text-[10px] sm:tracking-[0.14em]"
            >
              <SlidersHorizontal className="size-3" aria-hidden="true" />
              Adjust
            </button>
          </div>
        ) : (
          <div id={panelId} className="border-b border-black/40 bg-black/30">
            <div className="max-h-[58vh] space-y-4 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
              <PriorityTypeSelector
                selectedType={selectedType}
                onTypeChange={onTypeChange}
              />
              <PriorityFilterSection
                label="Monuments"
                emptyLabel="No Monuments available."
                options={monumentOptions}
                selectedIds={selectedMonumentIds}
                fallbackIcon="M"
                onToggle={onToggleMonument}
              />
              <PriorityFilterSection
                label="Skills"
                emptyLabel="No Skills available."
                options={skillOptions}
                selectedIds={selectedSkillIds}
                fallbackIcon="S"
                onToggle={onToggleSkill}
              />
            </div>
            <div className="flex items-center gap-2 border-t border-black/40 bg-black/35 px-2.5 py-2 sm:px-3 sm:py-3">
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={onClear}
                  className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-black/60 bg-black/25 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 transition hover:border-black/40 hover:bg-white/[0.055] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/30"
                >
                  <X className="size-3" aria-hidden="true" />
                  Clear
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-controls={panelId}
                className="inline-flex min-h-8 flex-1 items-center justify-center rounded-lg border border-black/60 bg-white/[0.055] px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),inset_0_-10px_18px_rgba(0,0,0,0.24)] transition hover:border-black/40 hover:bg-white/[0.09] focus:outline-none focus:ring-2 focus:ring-white/35 sm:min-h-9 sm:text-[11px]"
              >
                Done
              </button>
            </div>
          </div>
        )}
        <div className="relative flex min-w-0 items-center gap-2 border border-black/60 bg-white/[0.035] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_18px_rgba(255,255,255,0.018),inset_0_-12px_20px_rgba(0,0,0,0.18)] sm:gap-3 sm:px-4 sm:py-3">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-black/60 bg-white/[0.04] text-zinc-300/70 sm:size-8 sm:rounded-lg">
            <SlidersHorizontal className="size-3.5 sm:size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="min-w-0 truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-white/38 sm:text-[10px] sm:tracking-[0.18em]">
              Priority Scope
            </p>
            <p className="mt-0.5 min-w-0 truncate text-xs font-semibold uppercase tracking-normal text-white/82 sm:text-sm">
              {summary}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function PriorityTypeSelector({
  selectedType,
  onTypeChange,
}: {
  selectedType: PriorityRoadmapType;
  onTypeChange: (type: PriorityRoadmapType) => void;
}) {
  const options: { id: PriorityRoadmapType; label: string }[] = [
    { id: "goals", label: "Goals" },
    { id: "habits", label: "Habits" },
  ];

  return (
    <section>
      <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-[10px] sm:tracking-[0.22em]">
        Type
      </p>
      <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg border border-black/60 bg-black/35 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] sm:mt-2">
        {options.map((option) => {
          const selected = selectedType === option.id;

          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onTypeChange(option.id)}
              className={cn(
                "inline-flex min-h-8 items-center justify-center rounded-md px-3 text-[10px] font-semibold uppercase tracking-[0.12em] transition focus:outline-none focus:ring-2 focus:ring-white/30 sm:min-h-9 sm:text-[11px]",
                selected
                  ? "border border-black/45 bg-white/[0.095] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10),inset_0_-10px_18px_rgba(0,0,0,0.20)]"
                  : "border border-transparent text-zinc-500 hover:bg-white/[0.045] hover:text-zinc-300"
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PriorityFilterSection({
  label,
  emptyLabel,
  options,
  selectedIds,
  fallbackIcon,
  onToggle,
}: {
  label: string;
  emptyLabel: string;
  options: PriorityFilterOption[];
  selectedIds: string[];
  fallbackIcon: string;
  onToggle: (optionId: string) => void;
}) {
  return (
    <section>
      <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-[10px] sm:tracking-[0.22em]">
        {label}
      </p>
      {options.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5 sm:mt-2 sm:gap-2">
          {options.map((option) => {
            const selected = selectedIds.includes(option.id);

            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onToggle(option.id)}
                className={
                  selected
                    ? "inline-flex max-w-full items-center gap-1.5 rounded-full border border-black/50 bg-white/10 px-2 py-1.5 text-[11px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] transition focus:outline-none focus:ring-2 focus:ring-white/35 sm:gap-2 sm:px-2.5 sm:py-2 sm:text-xs"
                    : "inline-flex max-w-full items-center gap-1.5 rounded-full border border-black/60 bg-black/30 px-2 py-1.5 text-[11px] font-semibold text-zinc-400 transition hover:border-black/40 hover:bg-white/[0.06] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/35 sm:gap-2 sm:px-2.5 sm:py-2 sm:text-xs"
                }
              >
                <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-black/60 bg-white/5 text-[9px] font-semibold text-zinc-200 sm:size-5 sm:text-[10px]">
                  {option.icon ?? fallbackIcon}
                </span>
                <span className="min-w-0 truncate">{option.name}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-1.5 rounded-lg border border-black/60 bg-black/25 px-2.5 py-1.5 text-xs text-zinc-400 sm:mt-2 sm:px-3 sm:py-2 sm:text-sm">
          {emptyLabel}
        </p>
      )}
    </section>
  );
}

function toggleSelectedFilterId(current: string[], optionId: string) {
  return current.includes(optionId)
    ? current.filter((id) => id !== optionId)
    : [...current, optionId];
}

function normalizeFilterId(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function normalizeFilterName(value?: string | null) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildFilterOptionId(id?: string | null, name?: string | null) {
  return normalizeFilterId(id) || normalizeFilterName(name);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function createPriorityFilterOption(
  id?: string | null,
  name?: string | null,
  icon?: string | null
): PriorityFilterOption | null {
  const optionId = buildFilterOptionId(id, name);
  const optionName = (name ?? "").trim() || (id ?? "").trim();
  if (!optionId || !optionName) return null;

  return {
    id: optionId,
    name: optionName,
    icon: icon?.trim() || null,
  };
}

function mergePriorityFilterOption(
  options: Map<string, PriorityFilterOption>,
  option: PriorityFilterOption | null
) {
  if (!option) return;
  const existing = options.get(option.id);
  const existingNameIsFallback =
    existing?.name.trim().toLowerCase() === existing?.id.trim().toLowerCase();
  options.set(option.id, {
    ...option,
    name:
      existing && !existingNameIsFallback && existing.name.trim()
        ? existing.name
        : option.name,
    icon: existing?.icon ?? option.icon,
  });
}

function getItemMonumentFilterOption(
  item: GlobalPriorityRoadmapItem | RoadmapPriorityGoal | RoadmapHabitItem
) {
  const record = item as unknown as Record<string, unknown>;
  const monument = readRecord(record.monument);
  const id =
    readString(record.monumentId) ??
    readString(record.monument_id) ??
    readString(record.skillMonumentId) ??
    readString(record.goalMonumentId) ??
    readString(monument?.id);
  const name =
    readString(record.monumentName) ??
    readString(record.monumentTitle) ??
    readString(monument?.title) ??
    readString(monument?.name);
  const icon =
    readString(record.monumentIcon) ??
    readString(record.monumentEmoji) ??
    readString(monument?.emoji) ??
    readString(monument?.icon);

  return createPriorityFilterOption(id, name, icon);
}

function getItemSkillFilterOptions(
  item: GlobalPriorityRoadmapItem | RoadmapPriorityGoal | RoadmapHabitItem
) {
  const record = item as unknown as Record<string, unknown>;
  const options = new Map<string, PriorityFilterOption>();
  const directOption = createPriorityFilterOption(
    readString(record.skillId) ?? readString(record.skill_id),
    readString(record.skillName) ?? readString(record.skill_name),
    readString(record.skillIcon) ?? readString(record.skill_icon)
  );
  mergePriorityFilterOption(options, directOption);

  for (const fieldName of [
    "skills",
    "projectSkills",
    "project_skills",
    "relatedSkills",
    "related_skills",
  ]) {
    const value = record[fieldName];
    const values = Array.isArray(value) ? value : value ? [value] : [];
    for (const entry of values) {
      if (typeof entry === "string") {
        mergePriorityFilterOption(
          options,
          createPriorityFilterOption(entry, entry, null)
        );
        continue;
      }

      const entryRecord = readRecord(entry);
      if (!entryRecord) continue;
      mergePriorityFilterOption(
        options,
        createPriorityFilterOption(
          readString(entryRecord.id) ??
            readString(entryRecord.skillId) ??
            readString(entryRecord.skill_id),
          readString(entryRecord.name) ??
            readString(entryRecord.title) ??
            readString(entryRecord.skillName) ??
            readString(entryRecord.skill_name),
          readString(entryRecord.icon) ??
            readString(entryRecord.emoji) ??
            readString(entryRecord.symbol) ??
            readString(entryRecord.skillIcon) ??
            readString(entryRecord.skill_icon)
        )
      );
    }
  }

  return Array.from(options.values());
}

function sortPriorityFilterOptions(options: PriorityFilterOption[]) {
  return [...options].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

function buildAvailablePriorityFilterOptions(
  items: (GlobalPriorityRoadmapItem | RoadmapHabitItem)[],
  baseMonumentOptions: PriorityFilterOption[] = [],
  baseSkillOptions: PriorityFilterOption[] = []
): { monuments: PriorityFilterOption[]; skills: PriorityFilterOption[] } {
  const monuments = new Map<string, PriorityFilterOption>();
  const skills = new Map<string, PriorityFilterOption>();

  baseMonumentOptions.forEach((option) =>
    mergePriorityFilterOption(
      monuments,
      createPriorityFilterOption(option.id, option.name, option.icon)
    )
  );
  baseSkillOptions.forEach((option) =>
    mergePriorityFilterOption(
      skills,
      createPriorityFilterOption(option.id, option.name, option.icon)
    )
  );

  for (const item of items) {
    mergePriorityFilterOption(monuments, getItemMonumentFilterOption(item));
    getItemSkillFilterOptions(item).forEach((option) =>
      mergePriorityFilterOption(skills, option)
    );

    for (const goal of "goals" in item ? item.goals ?? [] : []) {
      mergePriorityFilterOption(monuments, getItemMonumentFilterOption(goal));
      getItemSkillFilterOptions(goal).forEach((option) =>
        mergePriorityFilterOption(skills, option)
      );
    }
  }

  return {
    monuments: sortPriorityFilterOptions(Array.from(monuments.values())),
    skills: sortPriorityFilterOptions(Array.from(skills.values())),
  };
}

function itemMatchesMonumentFilter(
  item: GlobalPriorityRoadmapItem | RoadmapPriorityGoal | RoadmapHabitItem,
  selectedMonuments: PriorityFilterOption[]
) {
  if (selectedMonuments.length === 0) return false;
  const option = getItemMonumentFilterOption(item);
  if (!option) return false;
  return selectedMonuments.some((selected) => selected.id === option.id);
}

function itemMatchesSkillFilter(
  item: GlobalPriorityRoadmapItem | RoadmapPriorityGoal | RoadmapHabitItem,
  selectedSkills: PriorityFilterOption[]
) {
  if (selectedSkills.length === 0) return false;
  const itemSkillIds = new Set(
    getItemSkillFilterOptions(item).map((option) => option.id)
  );
  if (itemSkillIds.size === 0) return false;
  return selectedSkills.some((selected) => itemSkillIds.has(selected.id));
}

function itemMatchesAnyPriorityFilter(
  item: GlobalPriorityRoadmapItem | RoadmapPriorityGoal | RoadmapHabitItem,
  selectedMonuments: PriorityFilterOption[],
  selectedSkills: PriorityFilterOption[]
) {
  return (
    itemMatchesMonumentFilter(item, selectedMonuments) ||
    itemMatchesSkillFilter(item, selectedSkills)
  );
}

function campaignMatchesFilters(
  campaign: GlobalPriorityRoadmapItem,
  selectedMonuments: PriorityFilterOption[],
  selectedSkills: PriorityFilterOption[]
) {
  const directMatch = itemMatchesAnyPriorityFilter(
    campaign,
    selectedMonuments,
    selectedSkills
  );
  const matchingGoals = (campaign.goals ?? []).filter((goal) =>
    itemMatchesAnyPriorityFilter(goal, selectedMonuments, selectedSkills)
  );

  if (!directMatch && matchingGoals.length === 0) return null;
  return { ...campaign, goals: matchingGoals };
}

function filterGlobalPriorityItems(
  items: GlobalPriorityRoadmapItem[],
  selectedMonuments: PriorityFilterOption[],
  selectedSkills: PriorityFilterOption[]
) {
  return sortGlobalPriorityItems(
    items.flatMap((item) => {
      if (item.type === "campaign") {
        const matchingCampaign = campaignMatchesFilters(
          item,
          selectedMonuments,
          selectedSkills
        );
        return matchingCampaign ? [matchingCampaign] : [];
      }

      return itemMatchesAnyPriorityFilter(item, selectedMonuments, selectedSkills)
        ? [item]
        : [];
    })
  );
}

function filterHabitRoadmapItems(
  items: RoadmapHabitItem[],
  selectedMonuments: PriorityFilterOption[],
  selectedSkills: PriorityFilterOption[]
) {
  return sortHabitRoadmapItems(
    items.filter((item) =>
      itemMatchesAnyPriorityFilter(item, selectedMonuments, selectedSkills)
    )
  );
}

function buildPriorityFilterSummary(
  selectedType: PriorityRoadmapType,
  selectedMonuments: PriorityFilterOption[],
  selectedSkills: PriorityFilterOption[]
) {
  const defaultLabel = selectedType === "habits" ? "All habits" : "All priorities";
  const selectedNames = [...selectedMonuments, ...selectedSkills].map(
    (option) => option.name
  );
  if (selectedNames.length === 0) return defaultLabel;
  if (selectedNames.length <= 3) return selectedNames.join(" / ");
  return `${selectedNames.slice(0, 3).join(" / ")} +${selectedNames.length - 3}`;
}

function parseGlobalPriorityBucketId(value: string): PriorityBucketId | null {
  if (!value.startsWith(GLOBAL_PRIORITY_BUCKET_PREFIX)) return null;
  const bucket = value.slice(GLOBAL_PRIORITY_BUCKET_PREFIX.length);
  return PRIORITY_ORDER.includes(bucket as PriorityBucketId)
    ? (bucket as PriorityBucketId)
    : null;
}

function getCampaignGoalBucketId(campaignId: string, priority: PriorityBucketId) {
  return `${CAMPAIGN_GOAL_BUCKET_PREFIX}${campaignId}:${priority}`;
}

function parseCampaignGoalBucketId(
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

function parseGlobalHabitBucketId(value: string): HabitBucketId | null {
  if (!value.startsWith(GLOBAL_HABIT_BUCKET_PREFIX)) return null;
  const bucket = value.slice(GLOBAL_HABIT_BUCKET_PREFIX.length);
  return HABIT_TYPE_ORDER.includes(bucket as HabitBucketId)
    ? (bucket as HabitBucketId)
    : null;
}

function getGlobalPriorityItemDragId(item: GlobalPriorityRoadmapItem) {
  return `global-priority-item:${item.type}:${item.id}`;
}

function getGlobalHabitDragId(item: RoadmapHabitItem) {
  return `${GLOBAL_HABIT_ITEM_PREFIX}${item.id}`;
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

function assignHabitGlobalOrders(
  items: RoadmapHabitItem[]
): RoadmapHabitItem[] {
  const nextOrderByType = new Map<HabitBucketId, number>();

  return items.map((item) => {
    const nextOrder = (nextOrderByType.get(item.habitType) ?? 0) + 1;
    nextOrderByType.set(item.habitType, nextOrder);
    return { ...item, globalOrder: nextOrder };
  });
}

function moveHabitRoadmapItem(
  items: RoadmapHabitItem[],
  draggedHabit: RoadmapHabitItem,
  targetHabitType: HabitBucketId,
  overHabit?: RoadmapHabitItem
): RoadmapHabitItem[] {
  const sortedItems = sortHabitRoadmapItems(items);
  const buckets = new Map<HabitBucketId, RoadmapHabitItem[]>(
    HABIT_TYPE_ORDER.map((habitType) => [
      habitType,
      sortedItems.filter((habit) => habit.habitType === habitType),
    ])
  );
  const currentHabit =
    sortedItems.find((habit) => habit.id === draggedHabit.id) ?? draggedHabit;
  if (currentHabit.habitType !== targetHabitType) return sortedItems;

  const currentBucket = buckets.get(currentHabit.habitType) ?? [];
  if (!overHabit || overHabit.habitType !== targetHabitType) {
    return sortedItems;
  }

  const oldIndex = currentBucket.findIndex((habit) => habit.id === currentHabit.id);
  const newIndex = currentBucket.findIndex((habit) => habit.id === overHabit.id);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
    return sortedItems;
  }

  buckets.set(targetHabitType, arrayMove(currentBucket, oldIndex, newIndex));
  return assignHabitGlobalOrders(
    HABIT_TYPE_ORDER.flatMap((habitType) => buckets.get(habitType) ?? [])
  );
}

function habitRoadmapOrdersMatch(
  previousItems: RoadmapHabitItem[],
  nextItems: RoadmapHabitItem[]
) {
  const previous = sortHabitRoadmapItems(previousItems);
  if (previous.length !== nextItems.length) return false;

  return previous.every((item, index) => {
    const nextItem = nextItems[index];
    return (
      nextItem &&
      item.id === nextItem.id &&
      item.habitType === nextItem.habitType &&
      item.globalOrder === nextItem.globalOrder
    );
  });
}

function compareText(a?: string | null, b?: string | null) {
  return (a ?? "").localeCompare(b ?? "");
}

function compareCampaignGoalsByPriority(a: RoadmapPriorityGoal, b: RoadmapPriorityGoal) {
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

function moveCampaignGoal(
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

function campaignGoalOrdersMatch(
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

function buildCampaignGoalPriorityUpdates(
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

function applyCampaignGoalOrder(
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

async function saveCampaignGoalPriorityOrder(
  supabase: PriorityEditorSupabaseClient,
  updates: CampaignGoalPriorityUpdate[]
) {
  await Promise.all(
    updates.map(async (update) => {
      const { error } = await supabase
        .from("goals")
        .update({
          priority_code: update.priority,
          priority_order: update.priorityOrder,
        })
        .eq("id", update.id);

      if (error) {
        throw error;
      }
    })
  );

  const { error: rankError } = await supabase.rpc(
    "recalculate_goal_global_rank"
  );
  if (rankError) {
    throw rankError;
  }
}

type DragScrollTarget = Element | Window;

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

function findVerticalScrollTarget(eventTarget: EventTarget | null): DragScrollTarget {
  let node = eventTarget instanceof Element ? eventTarget : null;

  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    const canScrollY =
      /(auto|scroll|overlay)/.test(style.overflowY) &&
      node.scrollHeight > node.clientHeight + 1;

    if (canScrollY) {
      return node;
    }

    node = node.parentElement;
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

function GlobalHabitRoadmap({
  items,
  totalItemCount,
  error,
  isSaving,
  sensors,
  isFiltered,
  onDragEnd,
}: {
  items: RoadmapHabitItem[];
  totalItemCount: number;
  error: string | null;
  isSaving: boolean;
  sensors: ReturnType<typeof useSensors>;
  isFiltered: boolean;
  onDragEnd: (event: DragEndEvent) => void;
}) {
  const [activeHabit, setActiveHabit] = useState<RoadmapHabitItem | null>(null);
  const {
    start: startEdgeAutoscroll,
    stop: stopEdgeAutoscroll,
  } = usePriorityDragEdgeAutoscroll();
  const itemsByType = useMemo(() => {
    const grouped = new Map<HabitBucketId, RoadmapHabitItem[]>(
      HABIT_TYPE_ORDER.map((habitType) => [habitType, []])
    );

    for (const item of sortHabitRoadmapItems(items)) {
      grouped.get(item.habitType)?.push(item);
    }

    return grouped;
  }, [items]);
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const activeData = event.active.data.current as
        | { habit?: RoadmapHabitItem }
        | undefined;
      if (isFiltered || !activeData?.habit) return;

      setActiveHabit(activeData.habit);
      startEdgeAutoscroll(event.activatorEvent);
    },
    [isFiltered, startEdgeAutoscroll]
  );
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveHabit(null);
      stopEdgeAutoscroll();
      if (isFiltered) return;
      onDragEnd(event);
    },
    [isFiltered, onDragEnd, stopEdgeAutoscroll]
  );
  const handleDragCancel = useCallback(() => {
    setActiveHabit(null);
    stopEdgeAutoscroll();
  }, [stopEdgeAutoscroll]);

  return (
    <div className="space-y-2">
      <RoadmapExteriorTitle title="Global Habit Roadmap" isSaving={isSaving} />
      <section className="overflow-hidden rounded-[20px] border border-black/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.075),rgba(113,113,122,0.10)_30%,rgba(24,24,27,0.34)_62%,rgba(255,255,255,0.035))] p-px shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_14px_36px_rgba(0,0,0,0.34)] sm:rounded-[22px]">
        <div className="rounded-[19px] border border-black/60 bg-zinc-950/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_0_22px_rgba(255,255,255,0.018),inset_0_-18px_30px_rgba(0,0,0,0.34)] sm:rounded-[21px] sm:p-4">
          {error ? <p className="mb-2 px-1 text-xs text-red-200/85">{error}</p> : null}
          {totalItemCount === 0 ? (
            <p className="rounded-[16px] border border-black/60 bg-black/25 px-3 py-3 text-xs font-medium text-zinc-500">
              No Habits yet.
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              autoScroll={PRIORITY_DND_AUTO_SCROLL}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <div className="space-y-3">
                {HABIT_TYPE_ORDER.map((habitType) => (
                  <GlobalHabitBucket
                    key={habitType}
                    habitType={habitType}
                    items={itemsByType.get(habitType) ?? []}
                    isDragDisabled={isFiltered}
                  />
                ))}
              </div>
              <DragOverlay
                className="pointer-events-none"
                dropAnimation={null}
                zIndex={1000}
              >
                {activeHabit ? <GlobalHabitDragOverlay habit={activeHabit} /> : null}
              </DragOverlay>
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

function GlobalHabitBucket({
  habitType,
  items,
  isDragDisabled,
}: {
  habitType: HabitBucketId;
  items: RoadmapHabitItem[];
  isDragDisabled: boolean;
}) {
  const bucketId = `${GLOBAL_HABIT_BUCKET_PREFIX}${habitType}`;
  const { setNodeRef, isOver } = useDroppable({
    id: bucketId,
    data: { habitType },
  });

  return (
    <div ref={setNodeRef} className="space-y-1.5">
      <p className="px-1 text-[10px] font-semibold uppercase leading-none tracking-normal text-zinc-600">
        {HABIT_TYPE_LABELS[habitType]}
      </p>
      <SortableContext
        items={items.map(getGlobalHabitDragId)}
        strategy={verticalListSortingStrategy}
      >
        <div
          className={cn(
            "min-h-8 overflow-hidden rounded-[16px] border border-black/60 bg-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]",
            isOver ? "bg-white/[0.035]" : ""
          )}
        >
          {items.map((habit) => (
            <SortableGlobalHabitItem
              key={habit.id}
              habit={habit}
              isDragDisabled={isDragDisabled}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableGlobalHabitItem({
  habit,
  isDragDisabled,
}: {
  habit: RoadmapHabitItem;
  isDragDisabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: getGlobalHabitDragId(habit),
    data: { habit, habitType: habit.habitType },
    disabled: isDragDisabled,
  });
  const identity = getHabitIdentity(habit);
  const normalizedHabitType = normalizeHabitRoadmapType(
    habit.rawHabitType ?? habit.habitType
  );
  const rowTypeClass = getHabitRoadmapRowTypeClass(normalizedHabitType);
  const isLightTypeRow =
    normalizedHabitType === "SYNC" || normalizedHabitType === "MEMO";
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
        "border border-black/40 transition",
        rowTypeClass,
        isDragging
          ? "relative z-10 opacity-45 shadow-none ring-1 ring-white/[0.06]"
          : ""
      )}
    >
      <div className="flex min-h-10 items-center gap-2 px-2 py-1.5 sm:px-2.5">
        <button
          type="button"
          disabled={isDragDisabled}
          className={cn(
            "flex size-7 shrink-0 touch-none items-center justify-center rounded-lg border border-black/60 bg-black/30 text-zinc-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] transition",
            isDragDisabled
              ? "cursor-default opacity-45"
              : "cursor-grab hover:bg-white/[0.045] hover:text-zinc-300 active:cursor-grabbing"
          )}
          aria-label={`Move ${habit.name} within ${HABIT_TYPE_LABELS[habit.habitType]}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" aria-hidden="true" />
        </button>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-black/60 bg-white/[0.04] text-[11px] font-semibold text-white/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          {identity}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-white/90">
            {habit.name}
          </p>
        </div>
        {habit.globalOrder ? (
          <span
            className={cn(
              "shrink-0 text-[11px] font-semibold leading-none",
              isLightTypeRow ? "text-zinc-100/72" : "text-zinc-500"
            )}
          >
            #{habit.globalOrder}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function GlobalHabitDragOverlay({ habit }: { habit: RoadmapHabitItem }) {
  const identity = getHabitIdentity(habit);
  const normalizedHabitType = normalizeHabitRoadmapType(
    habit.rawHabitType ?? habit.habitType
  );
  const rowTypeClass = getHabitRoadmapRowTypeClass(normalizedHabitType);
  const isLightTypeRow =
    normalizedHabitType === "SYNC" || normalizedHabitType === "MEMO";

  return (
    <div
      className={cn(
        "scale-[1.015] overflow-hidden rounded-[16px] border opacity-[0.98] ring-1 ring-white/[0.08] backdrop-blur-md",
        rowTypeClass
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
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-white/90">
            {habit.name}
          </p>
        </div>
        {habit.globalOrder ? (
          <span
            className={cn(
              "shrink-0 text-[11px] font-semibold leading-none",
              isLightTypeRow ? "text-zinc-100/72" : "text-zinc-500"
            )}
          >
            #{habit.globalOrder}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function getHabitIdentity(habit: RoadmapHabitItem) {
  return habit.skillIcon?.trim() || (habit.habitType === "CHORE" ? "◆" : "✦");
}

type HabitRoadmapTypeClassId = "CHORE" | "HABIT" | "SYNC" | "MEMO" | "PRACTICE";

function normalizeHabitRoadmapType(value?: string | null): HabitRoadmapTypeClassId {
  const normalized = (value ?? "").trim().toUpperCase();
  if (normalized === "ASYNC") return "SYNC";
  if (
    normalized === "CHORE" ||
    normalized === "HABIT" ||
    normalized === "SYNC" ||
    normalized === "MEMO" ||
    normalized === "PRACTICE"
  ) {
    return normalized;
  }
  return "HABIT";
}

function getHabitRoadmapRowTypeClass(habitType?: string | null): string {
  const normalized = normalizeHabitRoadmapType(habitType);
  if (normalized === "CHORE") {
    return cn(
      "!bg-[radial-gradient(circle_at_10%_-25%,rgba(159,18,57,0.32),transparent_58%),linear-gradient(135deg,rgba(31,9,12,0.98)_0%,rgba(76,18,27,0.94)_48%,rgba(111,26,39,0.76)_100%)]",
      "border-black/70 shadow-[0_10px_22px_-20px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-black/80"
    );
  }
  if (normalized === "SYNC" || normalized === "MEMO") {
    return "border-black/70 bg-[radial-gradient(circle_at_12%_-20%,rgba(226,232,240,0.28),transparent_58%),linear-gradient(135deg,rgba(82,82,91,0.96)_0%,rgba(113,113,122,0.92)_48%,rgba(161,161,170,0.78)_100%)] shadow-[0_10px_22px_-20px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.055)] hover:border-black/80";
  }
  if (normalized === "PRACTICE") {
    return cn(
      "!bg-[radial-gradient(circle_at_6%_-14%,rgba(79,70,229,0.22),transparent_60%),linear-gradient(142deg,rgba(8,9,20,0.98)_0%,rgba(24,27,51,0.95)_46%,rgba(50,55,92,0.68)_100%)]",
      "border-black/70 shadow-[0_10px_22px_-20px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-black/80"
    );
  }
  return cn(
    "bg-[radial-gradient(circle_at_18%_-24%,rgba(255,255,255,0.055),transparent_54%),linear-gradient(145deg,rgba(10,11,14,0.98)_0%,rgba(17,18,22,0.96)_58%,rgba(24,26,31,0.88)_100%)]",
    "border-black/70 shadow-[0_16px_34px_-28px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.035)] hover:border-black/80"
  );
}

function GlobalPriorityRoadmap({
  items,
  error,
  isSaving,
  sensors,
  isFiltered,
  onDragEnd,
  onCampaignGoalDragEnd,
}: {
  items: GlobalPriorityRoadmapItem[];
  error: string | null;
  isSaving: boolean;
  sensors: ReturnType<typeof useSensors>;
  isFiltered: boolean;
  onDragEnd: (event: DragEndEvent) => void;
  onCampaignGoalDragEnd: (
    campaign: GlobalPriorityRoadmapItem,
    event: DragEndEvent
  ) => void;
}) {
  const [openCampaignIds, setOpenCampaignIds] = useState<Record<string, boolean>>(
    {}
  );
  const [activePriorityItem, setActivePriorityItem] =
    useState<GlobalPriorityRoadmapItem | null>(null);
  const {
    start: startEdgeAutoscroll,
    stop: stopEdgeAutoscroll,
  } = usePriorityDragEdgeAutoscroll();
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
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const activeData = event.active.data.current as
        | { item?: GlobalPriorityRoadmapItem }
        | undefined;
      if (isFiltered || !activeData?.item) return;

      setActivePriorityItem(activeData.item);
      startEdgeAutoscroll(event.activatorEvent);
    },
    [isFiltered, startEdgeAutoscroll]
  );
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActivePriorityItem(null);
      stopEdgeAutoscroll();
      if (isFiltered) return;
      onDragEnd(event);
    },
    [isFiltered, onDragEnd, stopEdgeAutoscroll]
  );
  const handleDragCancel = useCallback(
    () => {
      setActivePriorityItem(null);
      stopEdgeAutoscroll();
    },
    [stopEdgeAutoscroll]
  );

  return (
    <div className="space-y-2">
      <RoadmapExteriorTitle title="Global Goal Roadmap" isSaving={isSaving} />
      <section className="overflow-hidden rounded-[20px] border border-black/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.075),rgba(113,113,122,0.10)_30%,rgba(24,24,27,0.34)_62%,rgba(255,255,255,0.035))] p-px shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_14px_36px_rgba(0,0,0,0.34)] sm:rounded-[22px]">
        <div className="rounded-[19px] border border-black/60 bg-zinc-950/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_0_22px_rgba(255,255,255,0.018),inset_0_-18px_30px_rgba(0,0,0,0.34)] sm:rounded-[21px] sm:p-4">
          {error ? <p className="mb-2 px-1 text-xs text-red-200/85">{error}</p> : null}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            autoScroll={PRIORITY_DND_AUTO_SCROLL}
            onDragStart={handleDragStart}
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
                    isDragDisabled={isFiltered}
                    onCampaignGoalDragEnd={onCampaignGoalDragEnd}
                  />
                );
              })}
            </div>
            <DragOverlay
              className="pointer-events-none"
              dropAnimation={null}
              zIndex={1000}
            >
              {activePriorityItem ? (
                <GlobalPriorityItemDragOverlay item={activePriorityItem} />
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </section>
    </div>
  );
}

function GlobalPriorityBucket({
  priority,
  items,
  openCampaignIds,
  onToggleCampaign,
  sensors,
  isDragDisabled,
  onCampaignGoalDragEnd,
}: {
  priority: PriorityBucketId;
  items: GlobalPriorityRoadmapItem[];
  openCampaignIds: Record<string, boolean>;
  onToggleCampaign: (campaignId: string) => void;
  sensors: ReturnType<typeof useSensors>;
  isDragDisabled: boolean;
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
              sensors={sensors}
              isDragDisabled={isDragDisabled}
              onCampaignGoalDragEnd={onCampaignGoalDragEnd}
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
  sensors,
  isDragDisabled,
  onCampaignGoalDragEnd,
}: {
  item: GlobalPriorityRoadmapItem;
  isOpen: boolean;
  onToggle: () => void;
  sensors: ReturnType<typeof useSensors>;
  isDragDisabled: boolean;
  onCampaignGoalDragEnd: (
    campaign: GlobalPriorityRoadmapItem,
    event: DragEndEvent
  ) => void;
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
    disabled: isDragDisabled,
  });
  const identity = getGlobalPriorityItemIdentity(item);
  const globalRank = getGlobalPriorityItemRank(item);
  const isCampaign = item.type === "campaign";
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
      if (isDragDisabled || !activeData?.goal || activeData.campaignId !== item.id) {
        return;
      }

      setActiveCampaignGoal(activeData.goal);
      startCampaignGoalEdgeAutoscroll(event.activatorEvent);
    },
    [isDragDisabled, item.id, startCampaignGoalEdgeAutoscroll]
  );
  const handleCampaignGoalDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveCampaignGoal(null);
      stopCampaignGoalEdgeAutoscroll();
      if (isDragDisabled) return;
      onCampaignGoalDragEnd(item, event);
    },
    [isDragDisabled, item, onCampaignGoalDragEnd, stopCampaignGoalEdgeAutoscroll]
  );
  const handleCampaignGoalDragCancel = useCallback(
    () => {
      setActiveCampaignGoal(null);
      stopCampaignGoalEdgeAutoscroll();
    },
    [stopCampaignGoalEdgeAutoscroll]
  );
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
        isDragging
          ? "relative z-10 bg-white/[0.018] opacity-45 shadow-none ring-1 ring-white/[0.06]"
          : ""
      )}
    >
      <div className="flex min-h-10 items-center gap-2 px-2 py-1.5 sm:px-2.5">
        <button
          type="button"
          disabled={isDragDisabled}
          className={cn(
            "flex size-7 shrink-0 touch-none items-center justify-center rounded-lg border border-black/60 bg-black/30 text-zinc-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] transition",
            isDragDisabled
              ? "cursor-default opacity-45"
              : "cursor-grab hover:bg-white/[0.045] hover:text-zinc-300 active:cursor-grabbing"
          )}
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
                  isDragDisabled={isDragDisabled}
                />
              ))}
            </div>
            <DragOverlay
              className="pointer-events-none"
              dropAnimation={null}
              zIndex={1001}
            >
              {activeCampaignGoal ? (
                <CampaignGoalDragOverlay goal={activeCampaignGoal} />
              ) : null}
            </DragOverlay>
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
    (item.type === "campaign" ? "◇" : "◆")
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
  const identity = getGlobalPriorityItemIdentity(item);
  const globalRank = getGlobalPriorityItemRank(item);
  const isCampaign = item.type === "campaign";

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
}: {
  campaignId: string;
  bucket: { priority: PriorityBucketId; goals: RoadmapPriorityGoal[] };
  isDragDisabled: boolean;
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
        {bucket.priority}
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
}: {
  campaignId: string;
  goal: RoadmapPriorityGoal;
  isDragDisabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
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
        "flex min-h-8 items-center gap-2 rounded-lg border border-black/45 bg-white/[0.018] px-2 py-1.5",
        isDragging
          ? "relative z-10 bg-white/[0.012] opacity-45 shadow-none ring-1 ring-white/[0.055]"
          : ""
      )}
    >
      <button
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
      >
        <GripVertical className="size-3" aria-hidden="true" />
      </button>
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
