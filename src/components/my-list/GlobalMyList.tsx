"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import {
  MyListSheet,
  type MyListPinnedSourceRow,
  type MyListTaskXpContext,
} from "@/components/my-list/MyListSheet";
import {
  hapticComplete,
  hapticPress,
  hapticWarningPattern,
} from "@/lib/haptics/creatorHaptics";
import { getCatsForUser } from "@/lib/data/cats";
import { getSkillsForUser } from "@/lib/data/skills";
import { getSupabaseBrowser } from "@/lib/supabase";
import {
  fetchReadyTasks,
  updateMyListTaskCompletion,
  updateTaskSkill,
} from "@/lib/scheduler/repo";
import type { TaskLite } from "@/lib/scheduler/weight";
import type { CatRow } from "@/lib/types/cat";
import type { SkillRow } from "@/lib/types/skill";
import { dispatchCreatorXpRewardVisual } from "@/lib/effects/creatorXpRewardVisual";
import type { CreatorXpBurstRect } from "@/lib/effects/creatorXpBurstBus";
import {
  MY_LIST_PINNED_SOURCE_ITEMS_CHANGED_EVENT,
  readPinnedSourceItemIds,
  setSourceItemPinned,
  writePinnedSourceItemIds,
} from "@/lib/my-list/pinnedSourceItems";
import {
  loadPinnedSourceMyListItems,
  updatePinnedSourceMyListItemCompletion,
  type MyListPinnedSourceStorageItem,
} from "@/lib/my-list/myListItemsStorage";

type MyListXpAwardResult = {
  success?: boolean;
  inserted?: number;
  deduped?: boolean;
  skipped?: boolean;
  reason?: string;
  awardKeyBase?: string;
  activePositiveCount?: number;
  alreadyReversedCount?: number;
  surge?: Parameters<typeof dispatchCreatorXpRewardVisual>[0]["surge"];
};

type MyListXpReverseResult = {
  success?: boolean;
  reversed?: number;
  alreadyReversed?: number;
  activePositivesFound?: number;
  insertedReversalKeys?: string[];
  error?: string;
};

const MY_LIST_TASK_XP_AMOUNT = 1;

function buildMyListTaskOccurrenceStem(taskId: string) {
  return `my_list:task:${taskId}`;
}

async function reverseMyListTaskXp(taskId: string) {
  const occurrenceStem = buildMyListTaskOccurrenceStem(taskId);
  const response = await fetch("/api/xp/reverse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ occurrenceStem }),
  });

  const result = (await response.json().catch(() => null)) as
    | MyListXpReverseResult
    | null;
  if (!response.ok) {
    throw new Error(
      result?.error ?? `XP reverse request failed (${response.status})`
    );
  }
  return result;
}

async function awardMyListTaskXp({
  task,
  skillId,
  monumentId,
  completedAt,
}: {
  task: TaskLite;
  skillId: string;
  monumentId: string | null;
  completedAt: string;
}) {
  const occurrenceStem = buildMyListTaskOccurrenceStem(task.id);
  const body: Record<string, unknown> = {
    kind: "task",
    amount: MY_LIST_TASK_XP_AMOUNT,
    skillIds: [skillId],
    awardKeyBase: occurrenceStem,
    reversible: { occurrenceStem },
    source: "my-list",
    completion: {
      action: "complete",
      sourceType: "TASK",
      sourceId: task.id,
      completedAt,
      wasScheduled: false,
      durationMin:
        typeof task.duration_min === "number" && Number.isFinite(task.duration_min)
          ? Math.max(0, Math.round(task.duration_min))
          : null,
    },
  };
  if (monumentId) {
    body.monumentIds = [monumentId];
  }

  const response = await fetch("/api/xp/award", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const result = (await response.json().catch(() => null)) as
    | MyListXpAwardResult
    | null;
  if (!response.ok) {
    throw new Error(result?.reason ?? `XP award request failed (${response.status})`);
  }
  return result;
}

export function GlobalMyList({
  useFullExpandedHeight,
  enableScheduleTimelineDrag,
}: {
  useFullExpandedHeight: boolean;
  enableScheduleTimelineDrag?: boolean;
}) {
  const { user, ready } = useAuth();
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<TaskLite[]>([]);
  const [pinnedSourceRows, setPinnedSourceRows] = useState<
    MyListPinnedSourceRow[]
  >([]);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [skillCategories, setSkillCategories] = useState<CatRow[]>([]);
  const [scheduledTaskIds, setScheduledTaskIds] = useState<Set<string>>(
    () => new Set()
  );
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(
    () => new Set()
  );
  const previousStageRef = useRef<Map<string, TaskLite["stage"]>>(new Map());

  useEffect(() => {
    if (!ready || !user?.id) {
      setTasks([]);
      setPinnedSourceRows([]);
      setSkills([]);
      setSkillCategories([]);
      setScheduledTaskIds(new Set());
      return;
    }

    let active = true;
    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    const loadPinnedSourceRows = async (
      skillRows: SkillRow[],
      pinnedItems: MyListPinnedSourceStorageItem[]
    ): Promise<MyListPinnedSourceRow[]> => {
      const pinnedIds = pinnedItems.reduce(
        (ids, item) => ({
          ...ids,
          [item.sourceType]: [...ids[item.sourceType], item.sourceId],
        }),
        {
          GOAL: [],
          PROJECT: [],
          TASK: [],
          HABIT: [],
        } as Record<MyListPinnedSourceStorageItem["sourceType"], string[]>
      );
      const completionByKey = new Map(
        pinnedItems.map((item) => [
          `${item.sourceType}:${item.sourceId}`,
          item.completedAt,
        ])
      );
      const orderByKey = new Map(
        pinnedItems.map((item, index) => [
          `${item.sourceType}:${item.sourceId}`,
          item.sortOrder * 1000 + index,
        ])
      );
      const skillIconById = new Map(
        skillRows
          .map((skill) => [
            skill.id,
            typeof skill.icon === "string" && skill.icon.trim()
              ? skill.icon.trim()
              : null,
          ] as const)
          .filter((entry): entry is readonly [string, string] =>
            Boolean(entry[0] && entry[1])
          )
      );
      const [goalsResult, projectsResult, tasksResult, habitsResult] =
        await Promise.all([
          pinnedIds.GOAL.length > 0
            ? supabase
                .from("goals")
                .select("id, name, emoji, priority, energy, status")
                .eq("user_id", user.id)
                .in("id", pinnedIds.GOAL)
            : Promise.resolve({ data: [], error: null }),
          pinnedIds.PROJECT.length > 0
            ? supabase
                .from("projects")
                .select("id, name, priority, energy, stage")
                .eq("user_id", user.id)
                .in("id", pinnedIds.PROJECT)
            : Promise.resolve({ data: [], error: null }),
          pinnedIds.TASK.length > 0
            ? supabase
                .from("tasks")
                .select("id, name, priority, energy, stage, skill_id")
                .eq("user_id", user.id)
                .in("id", pinnedIds.TASK)
            : Promise.resolve({ data: [], error: null }),
          pinnedIds.HABIT.length > 0
            ? supabase
                .from("habits")
                .select("id, name, energy, habit_type, skill_id")
                .eq("user_id", user.id)
                .in("id", pinnedIds.HABIT)
            : Promise.resolve({ data: [], error: null }),
        ]);

      const firstError =
        goalsResult.error ||
        projectsResult.error ||
        tasksResult.error ||
        habitsResult.error;
      if (firstError) throw firstError;

      const projectRows = (projectsResult.data ?? []) as {
        id: string;
        name: string | null;
        priority: string | null;
        energy: string | null;
        stage: string | null;
      }[];
      const projectIds = projectRows
        .map((project) => project.id)
        .filter((projectId): projectId is string => Boolean(projectId));
      const projectIconById = new Map<string, string>();
      if (projectIds.length > 0) {
        const { data: projectSkillRowsData, error: projectSkillRowsError } =
          await supabase
            .from("project_skills")
            .select("project_id, skill_id")
            .in("project_id", projectIds);
        if (projectSkillRowsError) throw projectSkillRowsError;

        ((projectSkillRowsData ?? []) as {
          project_id?: string | null;
          skill_id?: string | null;
        }[]).forEach((row) => {
          const projectId =
            typeof row.project_id === "string" ? row.project_id : null;
          if (!projectId || projectIconById.has(projectId)) return;

          const icon = row.skill_id
            ? skillIconById.get(row.skill_id) ?? null
            : null;
          if (icon) {
            projectIconById.set(projectId, icon);
          }
        });
      }

      return [
        ...((goalsResult.data ?? []) as {
          id: string;
          name: string | null;
          emoji?: string | null;
          priority: string | null;
          energy: string | null;
          status: string | null;
        }[]).map((goal) => ({
          id: goal.id,
          sourceType: "GOAL" as const,
          title: goal.name ?? "Untitled Goal",
          icon: goal.emoji ?? null,
          priority: goal.priority,
          energy: goal.energy,
          stage: goal.status,
          completedAt: completionByKey.get(`GOAL:${goal.id}`) ?? null,
        })),
        ...projectRows.map((project) => ({
          id: project.id,
          sourceType: "PROJECT" as const,
          title: project.name ?? "Untitled Project",
          icon: projectIconById.get(project.id) ?? null,
          priority: project.priority,
          energy: project.energy,
          stage: project.stage,
          completedAt: completionByKey.get(`PROJECT:${project.id}`) ?? null,
        })),
        ...((tasksResult.data ?? []) as {
          id: string;
          name: string | null;
          priority: string | null;
          energy: string | null;
          stage: string | null;
          skill_id?: string | null;
        }[]).map((task) => ({
          id: task.id,
          sourceType: "TASK" as const,
          title: task.name ?? "Untitled Task",
          icon: task.skill_id ? skillIconById.get(task.skill_id) ?? null : null,
          priority: task.priority,
          energy: task.energy,
          stage: task.stage,
          completedAt: completionByKey.get(`TASK:${task.id}`) ?? null,
        })),
        ...((habitsResult.data ?? []) as {
          id: string;
          name: string | null;
          energy: string | null;
          habit_type: string | null;
          skill_id?: string | null;
        }[]).map((habit) => ({
          id: habit.id,
          sourceType: "HABIT" as const,
          title: habit.name ?? "Untitled Habit",
          icon: habit.skill_id ? skillIconById.get(habit.skill_id) ?? null : null,
          priority: "MEDIUM",
          energy: habit.energy,
          stage: habit.habit_type,
          completedAt: completionByKey.get(`HABIT:${habit.id}`) ?? null,
        })),
      ].sort(
        (left, right) =>
          (orderByKey.get(`${left.sourceType}:${left.id}`) ?? 0) -
          (orderByKey.get(`${right.sourceType}:${right.id}`) ?? 0)
      );
    };

    const loadMyListData = async () => {
      const [taskRows, skillRows, categoryRows, scheduledRowsResult] =
        await Promise.all([
          fetchReadyTasks(),
          getSkillsForUser(user.id),
          getCatsForUser(user.id),
          supabase
            .from("schedule_instances")
            .select("source_id")
            .eq("user_id", user.id)
            .eq("source_type", "TASK")
            .not("source_id", "is", null),
        ]);

      if (!active) return;
      if (scheduledRowsResult.error) {
        throw scheduledRowsResult.error;
      }

      const localPinnedIds = readPinnedSourceItemIds(user.id);
      const pinnedItems = await loadPinnedSourceMyListItems({
        userId: user.id,
        localPinnedIds,
      }).catch((error) => {
        console.error("Failed to load Supabase My List pinned source items", error);
        return Object.entries(localPinnedIds).flatMap(([sourceType, sourceIds]) =>
          sourceIds.map((sourceId, index) => ({
            sourceType: sourceType as MyListPinnedSourceStorageItem["sourceType"],
            sourceId,
            done: false,
            completedAt: null,
            sortOrder: index,
          }))
        );
      });
      writePinnedSourceItemIds(
        user.id,
        pinnedItems.reduce(
          (ids, item) => ({
            ...ids,
            [item.sourceType]: [...ids[item.sourceType], item.sourceId],
          }),
          {
            GOAL: [],
            PROJECT: [],
            TASK: [],
            HABIT: [],
          } as Record<MyListPinnedSourceStorageItem["sourceType"], string[]>
        ),
        { notify: false }
      );
      const pinnedRows = await loadPinnedSourceRows(skillRows, pinnedItems).catch(
        (error) => {
          console.error("Failed to load My List pinned source rows", error);
          return [];
        }
      );
      if (!active) return;

      setTasks(taskRows);
      setPinnedSourceRows(pinnedRows);
      setSkills(skillRows);
      setSkillCategories(categoryRows);
      setScheduledTaskIds(
        new Set(
          ((scheduledRowsResult.data ?? []) as {
            source_id?: string | null;
          }[])
            .map((row) =>
              typeof row.source_id === "string" ? row.source_id : null
            )
            .filter((sourceId): sourceId is string => Boolean(sourceId))
        )
      );
    };

    void loadMyListData().catch(() => {
      if (!active) return;
      setTasks([]);
      setPinnedSourceRows([]);
      setSkills([]);
      setSkillCategories([]);
      setScheduledTaskIds(new Set());
    });

    const handlePinnedSourcesChanged = () => {
      void loadMyListData().catch(() => {
        if (!active) return;
        setPinnedSourceRows([]);
      });
    };
    const handleCreatorEntitySaved = () => {
      void loadMyListData().catch(() => {
        if (!active) return;
        setPinnedSourceRows([]);
      });
    };
    window.addEventListener(
      MY_LIST_PINNED_SOURCE_ITEMS_CHANGED_EVENT,
      handlePinnedSourcesChanged,
    );
    window.addEventListener("creator:entity-saved", handleCreatorEntitySaved);

    return () => {
      active = false;
      window.removeEventListener(
        MY_LIST_PINNED_SOURCE_ITEMS_CHANGED_EVENT,
        handlePinnedSourcesChanged,
      );
      window.removeEventListener(
        "creator:entity-saved",
        handleCreatorEntitySaved,
      );
    };
  }, [ready, user?.id]);

  const myListTasks = useMemo(
    () =>
      tasks
        .filter(
          (task) =>
            !task.goal_id && !task.project_id && !scheduledTaskIds.has(task.id)
        )
        .sort((left, right) => {
          const leftDone = left.stage?.toString().toUpperCase() === "PERFECT";
          const rightDone = right.stage?.toString().toUpperCase() === "PERFECT";
          if (leftDone !== rightDone) return leftDone ? 1 : -1;
          return left.name.localeCompare(right.name);
        }),
    [scheduledTaskIds, tasks]
  );
  const myListTaskIds = useMemo(
    () => new Set(myListTasks.map((task) => task.id)),
    [myListTasks],
  );
  const visiblePinnedSourceRows = useMemo(
    () =>
      pinnedSourceRows.filter((row) => {
        if (row.sourceType !== "TASK") return true;
        return !myListTaskIds.has(row.id) && !scheduledTaskIds.has(row.id);
      }),
    [myListTaskIds, pinnedSourceRows, scheduledTaskIds],
  );

  const handleRemovePinnedSource = useCallback(
    (row: MyListPinnedSourceRow) => {
      setSourceItemPinned({
        userId: user?.id,
        sourceType: row.sourceType,
        sourceId: row.id,
        pinned: false,
      });
      setPinnedSourceRows((currentRows) =>
        currentRows.filter(
          (currentRow) =>
            currentRow.sourceType !== row.sourceType || currentRow.id !== row.id
        )
      );
    },
    [user?.id]
  );

  const handleTogglePinnedSourceCompletion = useCallback(
    (row: MyListPinnedSourceRow, completedAt: string | null) => {
      if (!user?.id) return;

      setPinnedSourceRows((currentRows) =>
        currentRows.map((currentRow) =>
          currentRow.sourceType === row.sourceType && currentRow.id === row.id
            ? { ...currentRow, completedAt }
            : currentRow
        )
      );

      void updatePinnedSourceMyListItemCompletion({
        userId: user.id,
        sourceType: row.sourceType,
        sourceId: row.id,
        done: Boolean(completedAt),
        completedAt,
      }).catch((error) => {
        console.error("Failed to persist pinned My List completion", error);
      });
    },
    [user?.id]
  );

  const handleTaskSkillSelect = useCallback((taskId: string, skill: SkillRow) => {
    setTasks((currentTasks) =>
      currentTasks.map((item) =>
        item.id === taskId
          ? {
              ...item,
              skill_id: skill.id,
              skill_icon: skill.icon ?? null,
              skill_monument_id: skill.monument_id ?? null,
            }
          : item
      )
    );

    void updateTaskSkill(taskId, skill.id).then(({ error }) => {
      if (error) {
        console.error("Failed to persist My List task skill", error);
      }
    });
  }, []);

  const handleToggleTask = useCallback(
    async (
      taskId: string,
      sourceRect: CreatorXpBurstRect | null,
      xpContext: MyListTaskXpContext
    ) => {
      const task = tasks.find((item) => item.id === taskId);
      if (!task) return;
      if (pendingTaskIds.has(taskId)) {
        void hapticWarningPattern();
        return;
      }

      const currentStage = task.stage;
      const isCurrentlyCompleted = currentStage === "PERFECT";
      const snapshots = previousStageRef.current;
      let nextStage: TaskLite["stage"];

      if (isCurrentlyCompleted) {
        nextStage = snapshots.get(taskId) ?? "PRODUCE";
      } else {
        snapshots.set(taskId, currentStage);
        nextStage = "PERFECT";
      }

      if (nextStage === currentStage) {
        if (!isCurrentlyCompleted) snapshots.delete(taskId);
        return;
      }

      const selectedSkillId = xpContext.skillId?.trim() || task.skill_id?.trim();
      const selectedMonumentId =
        xpContext.monumentId?.trim() || task.skill_monument_id?.trim() || null;

      if (!isCurrentlyCompleted && !selectedSkillId) {
        snapshots.delete(taskId);
        void hapticWarningPattern();
        return;
      }

      setPendingTaskIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.add(taskId);
        return nextIds;
      });

      try {
        if (isCurrentlyCompleted) {
          const { error } = await updateMyListTaskCompletion(
            taskId,
            nextStage,
            null
          );
          if (error) throw error;

          await reverseMyListTaskXp(taskId);

          snapshots.delete(taskId);
          setTasks((currentTasks) =>
            currentTasks.map((item) =>
              item.id === taskId ? { ...item, stage: nextStage } : item
            )
          );
          return;
        }

        await reverseMyListTaskXp(taskId);

        if (!selectedSkillId) {
          throw new Error("Missing skill context");
        }

        const skillIdForAward = selectedSkillId;

        if (skillIdForAward !== task.skill_id) {
          const { error: skillError } = await updateTaskSkill(
            taskId,
            skillIdForAward
          );
          if (skillError) throw skillError;
        }

        const completedAt = new Date().toISOString();
        const { error } = await updateMyListTaskCompletion(
          taskId,
          "PERFECT",
          completedAt
        );
        if (error) throw error;

        const awardResult = await awardMyListTaskXp({
          task,
          skillId: skillIdForAward,
          monumentId: selectedMonumentId,
          completedAt,
        });

        if ((awardResult?.inserted ?? 0) <= 0) {
          throw new Error(
            awardResult?.reason ??
              (awardResult?.deduped
                ? "XP award already exists"
                : "XP award inserted no rows")
          );
        }

        setTasks((currentTasks) =>
          currentTasks.map((item) =>
            item.id === taskId
              ? {
                  ...item,
                  stage: "PERFECT",
                  skill_id: skillIdForAward,
                  skill_monument_id: selectedMonumentId,
                }
              : item
          )
        );

        if (awardResult?.surge) {
          dispatchCreatorXpRewardVisual({
            surge: awardResult.surge,
            completedAt,
            sourceRect,
            sourceOrigin: "card",
            amount: MY_LIST_TASK_XP_AMOUNT,
            kind: "task_complete",
            burstId: `my-list:task:${taskId}:${completedAt}`,
          });
        }

        void hapticComplete();
      } catch (error) {
        console.error("My List task completion failed", error);
        if (!isCurrentlyCompleted) {
          const { error: rollbackError } = await updateMyListTaskCompletion(
            taskId,
            currentStage,
            null
          );
          if (rollbackError) {
            console.error("My List completion rollback failed", rollbackError);
          }
        } else {
          const { error: rollbackError } = await updateMyListTaskCompletion(
            taskId,
            "PERFECT",
            new Date().toISOString()
          );
          if (rollbackError) {
            console.error("My List undo rollback failed", rollbackError);
          }
        }
        if (!isCurrentlyCompleted) snapshots.delete(taskId);
        void hapticWarningPattern();
      } finally {
        setPendingTaskIds((currentIds) => {
          const nextIds = new Set(currentIds);
          nextIds.delete(taskId);
          return nextIds;
        });
      }
    },
    [pendingTaskIds, tasks]
  );

  return (
    <MyListSheet
      open={open}
      userId={user?.id ?? null}
      tasks={myListTasks}
      pinnedSourceRows={visiblePinnedSourceRows}
      skills={skills}
      skillCategories={skillCategories}
      pendingTaskIds={pendingTaskIds}
      useFullExpandedHeight={useFullExpandedHeight}
      enableScheduleTimelineDrag={enableScheduleTimelineDrag === true}
      onRemovePinnedSource={handleRemovePinnedSource}
      onTogglePinnedSourceCompletion={handleTogglePinnedSourceCompletion}
      onToggleTask={handleToggleTask}
      onTaskSkillSelect={handleTaskSkillSelect}
      onOpenChange={(nextOpen) => {
        void hapticPress();
        setOpen(nextOpen);
      }}
    />
  );
}
