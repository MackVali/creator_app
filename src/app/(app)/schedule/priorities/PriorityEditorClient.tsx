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
} from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  useDroppable,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { GripVertical, SlidersHorizontal, X } from "lucide-react";

import {
  hapticComplete,
  hapticErrorPattern,
  hapticPress,
  hapticSnap,
  hapticSoftTick,
  hapticWarningPattern,
} from "@/lib/haptics/creatorHaptics";
import { getSupabaseBrowser } from "@/lib/supabase";
import { recordProjectCompletion } from "@/lib/projects/projectCompletion";
import { cn } from "@/lib/utils";
import { useFabCreation } from "@/components/ui/FabCreationContext";
import {
  resolveCreatorXpSurgeTitle,
  showCreatorXpSurge,
} from "@/components/xp/CreatorXpSurgeHud";
import {
  HABIT_TYPE_LABELS,
  HABIT_TYPE_ORDER,
  type GlobalPriorityRoadmapItem,
  type HabitBucketId,
  type PriorityBucketId,
  type RoadmapHabitItem,
  type RoadmapPriorityGoal,
  type RoadmapPriorityProject,
  type RoadmapPriorityTask,
  sortHabitRoadmapItems,
  sortGlobalPriorityItems,
  type UserPriorityFilterOptionData,
  type UserPrioritySkillCategoryData,
} from "./utils";
import {
  GlobalPriorityRoadmap,
  applyCampaignGoalOrder,
  buildCampaignGoalPriorityUpdates,
  buildGlobalPriorityOrderPayload,
  campaignGoalOrdersMatch,
  clearGlobalPriorityRanks,
  globalPriorityOrdersMatch,
  mergeVisibleCampaignGoalOrder,
  moveCampaignGoal,
  moveGlobalPriorityItem,
  parseCampaignGoalBucketId,
  parseGlobalPriorityBucketId,
  usePriorityRoadmapSensors,
  type PriorityRoadmapSensors,
} from "./GlobalPriorityRoadmap";

interface PriorityEditorClientProps {
  userId: string;
  initialGlobalPriorityItems: GlobalPriorityRoadmapItem[];
  initialHabitItems: RoadmapHabitItem[];
  initialMonumentOptions: UserPriorityFilterOptionData[];
  initialSkillOptions: UserPriorityFilterOptionData[];
  initialSkillCategories: UserPrioritySkillCategoryData[];
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
  categoryId?: string | null;
  sortOrder?: number | null;
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

type PriorityEditorTaskCompletionUpdateQuery = {
  update(values: {
    stage: "PERFECT";
    completed_at: string;
    updated_at: string;
  }): {
    eq(column: "id", value: string): {
      eq(
        column: "user_id",
        value: string
      ): Promise<{ error: { message?: string } | null }>;
    };
  };
};

type PriorityEditorGoalPriorityUpdateQuery = {
  update(values: {
    priority_code: PriorityBucketId;
    priority_order: number;
  }): {
    eq(column: "id", value: string): Promise<{ error: { message?: string } | null }>;
  };
};

type CreatorEntitySavedEventDetail = {
  entityType?: string;
};

const GLOBAL_HABIT_BUCKET_PREFIX = "global-habit-bucket:";
const GLOBAL_HABIT_ITEM_PREFIX = "global-habit-item:";
const EDGE_AUTOSCROLL_THRESHOLD_PX = 96;
const EDGE_AUTOSCROLL_MAX_STEP_PX = 12;
const PRIORITY_EDIT_LONG_PRESS_MS = 560;
const PRIORITY_EDIT_LONG_PRESS_MOVE_TOLERANCE_PX = 8;
const PRIORITY_DND_AUTO_SCROLL = {
  threshold: { x: 0, y: 0.16 },
  acceleration: 8,
  interval: 5,
};
const PRIORITY_EDITOR_REFRESH_DEBOUNCE_MS = 250;
const PRIORITY_EDITOR_REFRESH_MIN_INTERVAL_MS = 1200;
const PRIORITY_EDITOR_REFRESH_ENTITY_TYPES = new Set([
  "GOAL",
  "PROJECT",
  "TASK",
  "HABIT",
]);

function getBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function dispatchPriorityEditorEntitySaved(entityType: "PROJECT" | "TASK", entityId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("creator:entity-saved", {
      detail: { entityType, entityId, action: "updated" },
    })
  );
}

function updateRoadmapProject(
  items: GlobalPriorityRoadmapItem[],
  projectId: string,
  update: (project: RoadmapPriorityProject) => RoadmapPriorityProject
) {
  return items.map((item) => {
    const updateProjects = (projects?: RoadmapPriorityProject[]) =>
      projects?.map((project) =>
        project.id === projectId ? update(project) : project
      );

    if (item.type === "campaign") {
      return {
        ...item,
        goals: item.goals?.map((goal) => ({
          ...goal,
          projects: updateProjects(goal.projects),
        })),
      };
    }

    return {
      ...item,
      projects: updateProjects(item.projects),
    };
  });
}

function updateRoadmapTask(
  items: GlobalPriorityRoadmapItem[],
  taskId: string,
  update: (task: RoadmapPriorityTask) => RoadmapPriorityTask
) {
  return items.map((item) => {
    const updateProjects = (projects?: RoadmapPriorityProject[]) =>
      projects?.map((project) => ({
        ...project,
        tasks: project.tasks?.map((task) =>
          task.id === taskId ? update(task) : task
        ),
      }));

    if (item.type === "campaign") {
      return {
        ...item,
        goals: item.goals?.map((goal) => ({
          ...goal,
          projects: updateProjects(goal.projects),
        })),
      };
    }

    return {
      ...item,
      projects: updateProjects(item.projects),
    };
  });
}

function isRoadmapTaskComplete(task: RoadmapPriorityTask) {
  return (
    Boolean(task.completedAt) ||
    task.stage?.trim().toUpperCase() === "PERFECT"
  );
}

async function awardPriorityEditorTaskCompletion(
  task: RoadmapPriorityTask,
  completedAt: string
) {
  const body: Record<string, unknown> = {
    kind: "task",
    awardKeyBase: `task:${task.id}:complete`,
    completion: {
      action: "complete",
      sourceType: "TASK",
      sourceId: task.id,
      completedAt,
      wasScheduled: false,
      durationMin:
        typeof task.durationMin === "number" && Number.isFinite(task.durationMin)
          ? Math.max(0, Math.round(task.durationMin))
          : null,
      timeZone: getBrowserTimeZone() ?? undefined,
    },
  };

  if (task.skillId) {
    body.skillIds = [task.skillId];
  }

  try {
    const response = await fetch("/api/xp/award", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.error(
        "Failed to award XP for priority roadmap task completion",
        await response.text()
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error("Failed to award XP for priority roadmap task completion", error);
    return false;
  }
}

export default function PriorityEditorClient({
  userId,
  initialGlobalPriorityItems,
  initialHabitItems,
  initialMonumentOptions,
  initialSkillOptions,
  initialSkillCategories,
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
  const refreshTimeoutRef = useRef<number | null>(null);
  const lastRefreshAtRef = useRef(0);
  const isSavingOrderRef = useRef(false);

  const sensors = usePriorityRoadmapSensors();

  useEffect(() => {
    setGlobalPriorityItems(initialGlobalPriorityItems);
    setHabitRoadmapItems(initialHabitItems);
    setError(initialError);
  }, [initialGlobalPriorityItems, initialHabitItems, initialError]);

  useEffect(() => {
    isSavingOrderRef.current =
      isSavingGlobalPriorityOrder || isSavingHabitOrder;
  }, [isSavingGlobalPriorityOrder, isSavingHabitOrder]);

  const schedulePriorityEditorRefresh = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (refreshTimeoutRef.current) {
      return;
    }

    const now = Date.now();
    const elapsed = now - lastRefreshAtRef.current;
    const delay = Math.max(
      PRIORITY_EDITOR_REFRESH_DEBOUNCE_MS,
      PRIORITY_EDITOR_REFRESH_MIN_INTERVAL_MS - elapsed
    );

    const refresh = () => {
      if (isSavingOrderRef.current) {
        refreshTimeoutRef.current = window.setTimeout(
          refresh,
          PRIORITY_EDITOR_REFRESH_DEBOUNCE_MS
        );
        return;
      }

      refreshTimeoutRef.current = null;
      lastRefreshAtRef.current = Date.now();
      router.refresh();
    };

    refreshTimeoutRef.current = window.setTimeout(refresh, delay);
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleCreatorEntitySaved = (event: Event) => {
      const detail = (event as CustomEvent<CreatorEntitySavedEventDetail>).detail;
      const entityType = detail?.entityType;
      if (
        !entityType ||
        !PRIORITY_EDITOR_REFRESH_ENTITY_TYPES.has(entityType)
      ) {
        return;
      }

      schedulePriorityEditorRefresh();
    };
    const handleVisible = () => {
      if (document.visibilityState === "visible") {
        schedulePriorityEditorRefresh();
      }
    };
    const handleFocus = () => {
      if (document.visibilityState !== "hidden") {
        schedulePriorityEditorRefresh();
      }
    };

    window.addEventListener("creator:entity-saved", handleCreatorEntitySaved);
    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener(
        "creator:entity-saved",
        handleCreatorEntitySaved
      );
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("focus", handleFocus);
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, [schedulePriorityEditorRefresh]);

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
          initialSkillOptions,
          initialSkillCategories
        ),
      [
        filterSourceItems,
        initialMonumentOptions,
        initialSkillOptions,
        initialSkillCategories,
      ]
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
    async (
      event: DragEndEvent,
      previewItems?: GlobalPriorityRoadmapItem[] | null
    ) => {
      const { active, over } = event;
      if (!over) return;

      const activeData = active.data.current as
        | { item?: GlobalPriorityRoadmapItem }
        | undefined;
      const draggedItem = activeData?.item;
      if (!draggedItem) return;

      const previousItems = globalPriorityItems;
      const previewItemsChanged = previewItems
        ? !globalPriorityOrdersMatch(previousItems, previewItems)
        : false;

      const overData = over.data.current as
        | { bucket?: PriorityBucketId; item?: GlobalPriorityRoadmapItem }
        | undefined;
      const overBucket =
        overData?.bucket ??
        overData?.item?.priority ??
        parseGlobalPriorityBucketId(String(over.id));
      let nextItems = overBucket
        ? moveGlobalPriorityItem(
            previousItems,
            draggedItem,
            overBucket,
            overData?.item
          )
        : null;
      if (
        (!nextItems || globalPriorityOrdersMatch(previousItems, nextItems)) &&
        previewItemsChanged &&
        previewItems
      ) {
        nextItems = previewItems;
      }
      if (!nextItems) return;
      if (globalPriorityOrdersMatch(previousItems, nextItems)) return;
      const payload = buildGlobalPriorityOrderPayload(nextItems);

      setGlobalPriorityError(null);
      setGlobalPriorityItems(clearGlobalPriorityRanks(nextItems));

      const supabase = getSupabaseBrowser() as PriorityEditorSupabaseClient | null;
      if (!supabase) {
        setGlobalPriorityItems(previousItems);
        setGlobalPriorityError("Unable to save priority order.");
        void hapticWarningPattern();
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

        const { error: rankError } = await supabase.rpc(
          "recalculate_goal_global_rank"
        );
        if (rankError) {
          throw rankError;
        }

        void hapticComplete();
        router.refresh();
      } catch (caught) {
        console.error("Failed to save global priority item", caught);
        setGlobalPriorityItems(previousItems);
        setGlobalPriorityError("Could not save priority order.");
        void hapticErrorPattern();
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
      const visibleGoals = campaign.goals ?? previousGoals;
      if (!visibleGoals.some((goal) => goal.id === draggedGoal.id)) return;

      const nextVisibleGoals = moveCampaignGoal(
        visibleGoals,
        draggedGoal,
        targetPriority,
        overData?.goal
      );
      const nextGoals = mergeVisibleCampaignGoalOrder(
        previousGoals,
        visibleGoals,
        nextVisibleGoals
      );

      if (campaignGoalOrdersMatch(previousGoals, nextGoals)) return;

      const updates = buildCampaignGoalPriorityUpdates(previousGoals, nextGoals);
      if (updates.length === 0) return;

      setGlobalPriorityError(null);
      setGlobalPriorityItems(
        clearGlobalPriorityRanks(
          applyCampaignGoalOrder(previousItems, currentCampaign.id, nextGoals)
        )
      );

      const supabase = getSupabaseBrowser() as PriorityEditorSupabaseClient | null;
      if (!supabase) {
        setGlobalPriorityItems(previousItems);
        setGlobalPriorityError("Unable to save Campaign Goal order.");
        void hapticWarningPattern();
        return;
      }

      try {
        await saveCampaignGoalPriorityOrder(supabase, updates);
        void hapticComplete();
        router.refresh();
      } catch (caught) {
        console.error("Failed to save Campaign Goal order", caught);
        setGlobalPriorityItems(previousItems);
        setGlobalPriorityError("Could not save Campaign Goal order.");
        void hapticErrorPattern();
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
        void hapticWarningPattern();
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

        void hapticComplete();
        router.refresh();
      } catch (caught) {
        console.error("Failed to save global Habit order", caught);
        setHabitRoadmapItems(previousItems);
        setHabitRoadmapError("Could not save Habit order.");
        void hapticErrorPattern();
      } finally {
        setIsSavingHabitOrder(false);
      }
    },
    [habitRoadmapItems, router, userId]
  );

  const handleRoadmapProjectComplete = useCallback(
    async (project: RoadmapPriorityProject) => {
      if (
        (project.tasks?.length ?? 0) > 0 &&
        project.tasks?.some((task) => !isRoadmapTaskComplete(task))
      ) {
        setGlobalPriorityError("Complete all Tasks first.");
        void hapticErrorPattern();
        return;
      }

      const supabase = getSupabaseBrowser();
      if (!supabase) {
        setGlobalPriorityError("Unable to complete Project.");
        void hapticWarningPattern();
        return;
      }

      const completedAt = new Date().toISOString();
      const previousItems = globalPriorityItems;
      setGlobalPriorityError(null);
      setGlobalPriorityItems((current) =>
        updateRoadmapProject(current, project.id, (item) => ({
          ...item,
          stage: "RELEASE",
          completedAt,
        }))
      );

      try {
        await recordProjectCompletion(
          {
            projectId: project.id,
            projectSkillIds: project.skillIds,
            taskSkillIds:
              project.taskSkillIds ?? project.tasks?.map((task) => task.skillId),
            xpSurge: {
              skillName: project.skillName,
              sourceTitle: project.name,
              sourceIcon: project.skillIcon ?? project.emoji ?? null,
            },
          },
          "complete"
        );
        dispatchPriorityEditorEntitySaved("PROJECT", project.id);
      } catch (caught) {
        console.error("Failed to complete roadmap Project", caught);
        setGlobalPriorityItems(previousItems);
        setGlobalPriorityError("Could not complete Project.");
        void hapticErrorPattern();
      }
    },
    [globalPriorityItems]
  );

  const handleRoadmapTaskComplete = useCallback(
    async (task: RoadmapPriorityTask) => {
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        setGlobalPriorityError("Unable to complete Task.");
        void hapticWarningPattern();
        return;
      }

      const completedAt = new Date().toISOString();
      const previousItems = globalPriorityItems;
      setGlobalPriorityError(null);
      setGlobalPriorityItems((current) =>
        updateRoadmapTask(current, task.id, (item) => ({
          ...item,
          stage: "PERFECT",
          completedAt,
        }))
      );

      try {
        const taskCompletionUpdate = supabase.from(
          "tasks"
        ) as unknown as PriorityEditorTaskCompletionUpdateQuery;
        const { error: updateError } = await taskCompletionUpdate
          .update({
            stage: "PERFECT",
            completed_at: completedAt,
            updated_at: completedAt,
          })
          .eq("id", task.id)
          .eq("user_id", userId);

        if (updateError) {
          throw updateError;
        }

        const didAwardXp = await awardPriorityEditorTaskCompletion(task, completedAt);
        if (didAwardXp) {
          showCreatorXpSurge({
            sourceType: "TASK",
            title: resolveCreatorXpSurgeTitle({
              skillName: task.skillName,
              sourceTitle: task.name,
            }),
            sourceIcon: task.skillIcon ?? null,
            displayXp: 1,
          });
        }
        dispatchPriorityEditorEntitySaved("TASK", task.id);
      } catch (caught) {
        console.error("Failed to complete roadmap Task", caught);
        setGlobalPriorityItems(previousItems);
        setGlobalPriorityError("Could not complete Task.");
        void hapticErrorPattern();
      }
    },
    [globalPriorityItems, userId]
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
                appearance="priorityEditor"
                onDragEnd={handleGlobalPriorityDragEnd}
                onCampaignGoalDragEnd={handleCampaignGoalDragEnd}
                onProjectComplete={handleRoadmapProjectComplete}
                onTaskComplete={handleRoadmapTaskComplete}
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
  const clearMonumentFilters = useCallback(() => {
    selectedMonumentIds.forEach(onToggleMonument);
  }, [onToggleMonument, selectedMonumentIds]);
  const clearSkillFilters = useCallback(() => {
    selectedSkillIds.forEach(onToggleSkill);
  }, [onToggleSkill, selectedSkillIds]);
  const handleOpenToggle = useCallback(() => {
    void hapticSnap();
    onOpenChange(!isOpen);
  }, [isOpen, onOpenChange]);
  const handleClear = useCallback(() => {
    if (hasActiveFilters) {
      void hapticSoftTick();
    }
    onClear();
  }, [hasActiveFilters, onClear]);
  const handleDone = useCallback(() => {
    if (isOpen) {
      void hapticSnap();
    }
    onOpenChange(false);
  }, [isOpen, onOpenChange]);

  return (
    <section className="overflow-hidden rounded-[18px] border border-black/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.075),rgba(113,113,122,0.10)_32%,rgba(39,39,42,0.28)_62%,rgba(255,255,255,0.035))] p-px shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_14px_36px_rgba(0,0,0,0.30)] sm:rounded-[20px]">
      <div className="overflow-hidden rounded-[17px] border border-black/60 bg-zinc-950/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_-18px_30px_rgba(0,0,0,0.32)] sm:rounded-[19px]">
        <div className="border-b border-black/40 bg-black/20 px-2.5 py-1.5 sm:px-3 sm:py-2">
          <button
            type="button"
            onClick={handleOpenToggle}
            aria-expanded={isOpen}
            aria-controls={panelId}
            className="inline-flex min-h-7 w-full items-center justify-center gap-2 rounded-lg border border-black/60 bg-white/[0.025] px-3 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400 transition hover:border-black/40 hover:bg-white/[0.055] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/30 sm:min-h-8 sm:text-[10px] sm:tracking-[0.14em]"
          >
            <SlidersHorizontal className="size-3" aria-hidden="true" />
            Adjust
          </button>
        </div>
        <AnimatePresence initial={false}>
          {isOpen ? (
            <motion.div
              id={panelId}
              className="overflow-hidden border-b border-black/40 bg-black/30"
              initial={{ height: 0, opacity: 0, y: -6 }}
              animate={{ height: "auto", opacity: 1, y: 0 }}
              exit={{ height: 0, opacity: 0, y: -6 }}
              transition={{
                height: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
                opacity: { duration: 0.18, ease: "easeOut" },
                y: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
              }}
            >
              <div className="min-h-0 overflow-hidden">
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
                    onClear={clearMonumentFilters}
                  />
                  <PriorityFilterSection
                    label="Skills"
                    emptyLabel="No Skills available."
                    options={skillOptions}
                    selectedIds={selectedSkillIds}
                    fallbackIcon="S"
                    onToggle={onToggleSkill}
                    onClear={clearSkillFilters}
                  />
                </div>
                <div className="flex items-center gap-2 border-t border-black/40 bg-black/35 px-2.5 py-2 sm:px-3 sm:py-3">
                  {hasActiveFilters ? (
                    <button
                      type="button"
                      onClick={handleClear}
                      className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-black/60 bg-black/25 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 transition hover:border-black/40 hover:bg-white/[0.055] hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/30"
                    >
                      <X className="size-3" aria-hidden="true" />
                      Clear
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleDone}
                    aria-controls={panelId}
                    className="inline-flex min-h-8 flex-1 items-center justify-center rounded-lg border border-black/60 bg-white/[0.055] px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),inset_0_-10px_18px_rgba(0,0,0,0.24)] transition hover:border-black/40 hover:bg-white/[0.09] focus:outline-none focus:ring-2 focus:ring-white/35 sm:min-h-9 sm:text-[11px]"
                  >
                    Done
                  </button>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
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
          const handleClick = () => {
            if (!selected) {
              void hapticSoftTick();
              onTypeChange(option.id);
            }
          };

          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={handleClick}
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
  onClear,
}: {
  label: string;
  emptyLabel: string;
  options: PriorityFilterOption[];
  selectedIds: string[];
  fallbackIcon: string;
  onToggle: (optionId: string) => void;
  onClear: () => void;
}) {
  const [expanded, setExpanded] = useState(selectedIds.length > 0);
  const sectionId = `priority-${label.toLowerCase()}-filters`;
  const hasSelectedFilters = selectedIds.length > 0;

  useEffect(() => {
    if (hasSelectedFilters) {
      setExpanded(true);
    }
  }, [hasSelectedFilters]);

  const handleAllClick = () => {
    if (hasSelectedFilters) {
      void hapticSoftTick();
      onClear();
      setExpanded(false);
      return;
    }

    void hapticSnap();
    setExpanded((current) => !current);
  };

  return (
    <section>
      <div className="flex items-center gap-2">
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-[10px] sm:tracking-[0.22em]">
          {label}
        </p>
        <button
          type="button"
          aria-controls={sectionId}
          aria-expanded={expanded}
          aria-pressed={!hasSelectedFilters}
          onClick={handleAllClick}
          className={cn(
            "ml-auto inline-flex min-h-7 items-center justify-center rounded-full border px-3 text-[10px] font-semibold uppercase tracking-[0.12em] transition focus:outline-none focus:ring-2 focus:ring-white/35 sm:min-h-8 sm:px-3.5 sm:text-[11px]",
            hasSelectedFilters
              ? "border-black/60 bg-black/30 text-zinc-400 hover:border-black/40 hover:bg-white/[0.06] hover:text-zinc-200"
              : "border-black/50 bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]"
          )}
        >
          ALL
        </button>
      </div>
      <div
        id={sectionId}
        className={cn(
          "grid overflow-hidden transition-[grid-template-rows,opacity,transform] duration-300 ease-out",
          expanded
            ? "mt-1.5 grid-rows-[1fr] opacity-100 translate-y-0 sm:mt-2"
            : "mt-0 grid-rows-[0fr] opacity-0 -translate-y-1"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          {options.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {options.map((option) => {
                const selected = selectedIds.includes(option.id);

                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      void hapticSoftTick();
                      onToggle(option.id);
                    }}
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
            <p className="rounded-lg border border-black/60 bg-black/25 px-2.5 py-1.5 text-xs text-zinc-400 sm:px-3 sm:py-2 sm:text-sm">
              {emptyLabel}
            </p>
          )}
        </div>
      </div>
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
  icon?: string | null,
  categoryId?: string | null,
  sortOrder?: number | null
): PriorityFilterOption | null {
  const optionId = buildFilterOptionId(id, name);
  const optionName = (name ?? "").trim() || (id ?? "").trim();
  if (!optionId || !optionName) return null;

  return {
    id: optionId,
    name: optionName,
    icon: icon?.trim() || null,
    categoryId: categoryId ?? null,
    sortOrder: sortOrder ?? null,
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
    categoryId: existing?.categoryId ?? option.categoryId ?? null,
    sortOrder: existing?.sortOrder ?? option.sortOrder ?? null,
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

function comparePriorityFilterOptionNames(
  a: PriorityFilterOption,
  b: PriorityFilterOption
) {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function hasPriorityFilterSortOrder(option: PriorityFilterOption) {
  return (
    typeof option.sortOrder === "number" && Number.isFinite(option.sortOrder)
  );
}

function hasSkillCategorySortOrder(category: UserPrioritySkillCategoryData) {
  return (
    typeof category.sortOrder === "number" && Number.isFinite(category.sortOrder)
  );
}

function sortPrioritySkillFilterOptions(
  options: PriorityFilterOption[],
  categories: UserPrioritySkillCategoryData[]
) {
  const categoryOrder = new Map<string, number>();
  [...categories]
    .sort((a, b) => {
      const aHasOrder = hasSkillCategorySortOrder(a);
      const bHasOrder = hasSkillCategorySortOrder(b);

      if (aHasOrder && bHasOrder && a.sortOrder !== b.sortOrder) {
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      }
      if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;

      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    })
    .forEach((category, index) => {
      categoryOrder.set(category.id, index);
    });

  const originalIndex = new Map<string, number>();
  options.forEach((option, index) => {
    originalIndex.set(option.id, index);
  });

  return [...options].sort((a, b) => {
    const aCategoryOrder =
      a.categoryId != null ? categoryOrder.get(a.categoryId) : undefined;
    const bCategoryOrder =
      b.categoryId != null ? categoryOrder.get(b.categoryId) : undefined;
    const aUncategorized = aCategoryOrder == null;
    const bUncategorized = bCategoryOrder == null;

    if (aUncategorized !== bUncategorized) return aUncategorized ? 1 : -1;
    if (!aUncategorized && aCategoryOrder !== bCategoryOrder) {
      return (aCategoryOrder ?? 0) - (bCategoryOrder ?? 0);
    }

    const aHasOrder = hasPriorityFilterSortOrder(a);
    const bHasOrder = hasPriorityFilterSortOrder(b);
    if (aHasOrder && bHasOrder && a.sortOrder !== b.sortOrder) {
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    }
    if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;

    if (!aHasOrder && !bHasOrder) {
      const nameComparison = comparePriorityFilterOptionNames(a, b);
      if (nameComparison !== 0) return nameComparison;
    }

    return (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0);
  });
}

function buildAvailablePriorityFilterOptions(
  items: (GlobalPriorityRoadmapItem | RoadmapHabitItem)[],
  baseMonumentOptions: PriorityFilterOption[] = [],
  baseSkillOptions: PriorityFilterOption[] = [],
  skillCategories: UserPrioritySkillCategoryData[] = []
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
      createPriorityFilterOption(
        option.id,
        option.name,
        option.icon,
        option.categoryId,
        option.sortOrder
      )
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
    skills: sortPrioritySkillFilterOptions(
      Array.from(skills.values()),
      skillCategories
    ),
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

function parseGlobalHabitBucketId(value: string): HabitBucketId | null {
  if (!value.startsWith(GLOBAL_HABIT_BUCKET_PREFIX)) return null;
  const bucket = value.slice(GLOBAL_HABIT_BUCKET_PREFIX.length);
  return HABIT_TYPE_ORDER.includes(bucket as HabitBucketId)
    ? (bucket as HabitBucketId)
    : null;
}

function getGlobalHabitDragId(item: RoadmapHabitItem) {
  return `${GLOBAL_HABIT_ITEM_PREFIX}${item.id}`;
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

async function saveCampaignGoalPriorityOrder(
  supabase: PriorityEditorSupabaseClient,
  updates: CampaignGoalPriorityUpdate[]
) {
  await Promise.all(
    updates.map(async (update) => {
      const goalPriorityUpdate = supabase.from(
        "goals"
      ) as unknown as PriorityEditorGoalPriorityUpdateQuery;
      const { error } = await goalPriorityUpdate
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
  sensors: PriorityRoadmapSensors;
  isFiltered: boolean;
  onDragEnd: (event: DragEndEvent) => void;
}) {
  const fabCreation = useFabCreation();
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
  const handleHabitLongPressEdit = useCallback(
    (habit: RoadmapHabitItem, element: HTMLElement) => {
      void hapticPress();
      fabCreation?.requestEntityEdit({
        entityType: "HABIT",
        entityId: habit.id,
        title: habit.name,
        originRect: getPriorityEditorFabOriginRect(element),
        habitSnapshot: {
          name: habit.name,
          habitType: habit.rawHabitType ?? habit.habitType,
          recurrence: habit.recurrenceMode,
          durationMinutes: habit.durationMinutes,
          energy: habit.energy,
          goalId: habit.goalId,
          skillId: habit.skillId,
          routineId: habit.routineId,
        },
      });
    },
    [fabCreation]
  );

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
                    onHabitLongPressEdit={handleHabitLongPressEdit}
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
  onHabitLongPressEdit,
}: {
  habitType: HabitBucketId;
  items: RoadmapHabitItem[];
  isDragDisabled: boolean;
  onHabitLongPressEdit: (habit: RoadmapHabitItem, element: HTMLElement) => void;
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
              onHabitLongPressEdit={onHabitLongPressEdit}
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
  onHabitLongPressEdit,
}: {
  habit: RoadmapHabitItem;
  isDragDisabled: boolean;
  onHabitLongPressEdit: (habit: RoadmapHabitItem, element: HTMLElement) => void;
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
  const handleHabitLongPress = useCallback(
    (element: HTMLElement) => {
      if (isDragging) return;
      onHabitLongPressEdit(habit, element);
    },
    [habit, isDragging, onHabitLongPressEdit]
  );
  const habitLongPressHandlers = usePriorityEditLongPress(
    handleHabitLongPress,
    isDragging
  );

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
        <button
          type="button"
          {...habitLongPressHandlers}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1 text-left outline-none transition hover:bg-white/[0.025] focus-visible:ring-1 focus-visible:ring-white/15"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-black/60 bg-white/[0.04] text-[11px] font-semibold text-white/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            {identity}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight text-white/90">
            {habit.name}
          </span>
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
        </button>
      </div>
    </div>
  );
}

function getPriorityEditorFabOriginRect(element: HTMLElement) {
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
    onContextMenu: (event: ReactMouseEvent<HTMLElement>) => event.preventDefault(),
    onDragStart: (event: ReactMouseEvent<HTMLElement>) => event.preventDefault(),
  };
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
