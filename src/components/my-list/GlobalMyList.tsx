"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { useAuth } from "@/components/auth/AuthProvider";
import {
  MyListSheet,
  type MyListMonumentRow,
  type MyListPinnedGoalRow,
  type MyListPinnedSourceRow,
  type MyListTaskXpContext,
} from "@/components/my-list/MyListSheet";
import {
  hapticComplete,
  hapticErrorPattern,
  hapticPress,
  hapticWarningPattern,
} from "@/lib/haptics/creatorHaptics";
import { getCatsForUser } from "@/lib/data/cats";
import { getSkillsForUser } from "@/lib/data/skills";
import { getSupabaseBrowser } from "@/lib/supabase";
import { normalizeGoalStatus } from "@/lib/goals/status";
import {
  deleteStandaloneMyListTask,
  fetchReadyTasks,
  updateMyListTaskCompletion,
  updateTaskSkill,
} from "@/lib/scheduler/repo";
import type { TaskLite } from "@/lib/scheduler/weight";
import type { CatRow } from "@/lib/types/cat";
import type { SkillRow } from "@/lib/types/skill";
import { normalizePriority } from "@/app/(app)/schedule/priorities/utils";
import { dispatchCreatorXpRewardVisual } from "@/lib/effects/creatorXpRewardVisual";
import {
  buildCreatorXpSurgePayload,
  type CreatorXpSurgePayload,
} from "@/components/xp/CreatorXpSurgeHud";
import type { CreatorXpBurstRect } from "@/lib/effects/creatorXpBurstBus";
import { recordProjectCompletion } from "@/lib/projects/projectCompletion";
import {
  MY_LIST_PINNED_SOURCE_ITEMS_CHANGED_EVENT,
  readPinnedSourceItemIds,
  setSourceItemPinned,
  writePinnedSourceItemIds,
} from "@/lib/my-list/pinnedSourceItems";
import {
  loadPinnedSourceMyListItems,
  updatePinnedSourceMyListItemCompletion,
  updatePinnedSourceMyListItemMetadata,
  updatePinnedSourceMyListItemOrder,
  type MyListPinnedSourceStorageItem,
} from "@/lib/my-list/myListItemsStorage";
import {
  getMyListAreaSystemKey,
  getMyListMonumentSystemKey,
} from "@/lib/my-list/myListListsStorage";
import { isAreaId } from "@/config/areas";

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

type MyListGoalCompletionUpdateQuery = {
  update(values: { status: "COMPLETED"; active: false }): {
    eq(column: "id", value: string): {
      eq(
        column: "user_id",
        value: string
      ): Promise<{ error: { message?: string } | null }>;
    };
  };
};

type MyListGoalXpAwardResponse = {
  success?: boolean;
  deduped?: boolean;
  inserted?: number;
  surge?: CreatorXpSurgePayload | null;
  reason?: string | null;
};

type MyListHierarchyGoalRow = {
  id: string;
  monument_id?: string | null;
  roadmap_id?: string | null;
};

type MyListHierarchyProjectRow = {
  id: string;
  goal_id?: string | null;
};

type MyListHierarchyRoadmapRow = {
  id: string;
  monument_id?: string | null;
};

function getPreferredMyListSystemKeyFromPathname(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 2 && segments[0] === "areas") {
    const areaId = segments[1]?.trim().toLowerCase();
    return isAreaId(areaId) ? getMyListAreaSystemKey(areaId) : null;
  }

  if (segments.length === 2 && segments[0] === "monuments") {
    const monumentId = segments[1]?.trim();
    return monumentId ? getMyListMonumentSystemKey(monumentId) : null;
  }

  return null;
}

function readCleanId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildMyListTaskOccurrenceStem(taskId: string) {
  return `my_list:task:${taskId}`;
}

function isProjectCompletionStage(stage: string | null | undefined) {
  return stage?.toString().trim().toUpperCase() === "RELEASE";
}

function isMyListProjectComplete(project: MyListPinnedSourceRow) {
  const normalizedStage = project.stage?.trim().toUpperCase();
  return (
    Boolean(project.completedAt) ||
    normalizedStage === "RELEASE" ||
    normalizedStage === "COMPLETE" ||
    normalizedStage === "COMPLETED" ||
    normalizedStage === "DONE"
  );
}

function isMyListTaskComplete(task: MyListPinnedSourceRow) {
  return Boolean(task.completedAt) || task.stage?.trim().toUpperCase() === "PERFECT";
}

function isMyListGoalComplete(goal: MyListPinnedGoalRow) {
  return normalizeGoalStatus(goal.stage, goal.active) === "COMPLETED";
}

function isMyListGoalReadyToComplete(goal: MyListPinnedGoalRow) {
  return (
    goal.projects.every(isMyListProjectComplete) &&
    (goal.tasks ?? []).every(isMyListTaskComplete)
  );
}

function collectMyListGoalCompletionSkillIds(goal: MyListPinnedGoalRow) {
  const skillIds = new Set<string>();

  for (const descendant of [...goal.projects, ...(goal.tasks ?? [])]) {
    for (const skillId of descendant.skillIds ?? []) {
      if (typeof skillId === "string" && skillId.trim()) {
        skillIds.add(skillId.trim());
      }
    }
    if (typeof descendant.skillId === "string" && descendant.skillId.trim()) {
      skillIds.add(descendant.skillId.trim());
    }
  }

  return Array.from(skillIds);
}

function readRealProjectCompletedAt(project: {
  completed_at?: string | null;
  stage?: string | null;
}) {
  return typeof project.completed_at === "string" && project.completed_at.trim()
    ? project.completed_at
    : null;
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

async function awardMyListGoalCompletion(
  goal: MyListPinnedGoalRow,
  completedAt: string
): Promise<MyListGoalXpAwardResponse | null> {
  const body: Record<string, unknown> = {
    kind: "goal",
    awardKeyBase: `goal:${goal.id}:goal`,
    reversible: {
      occurrenceStem: `goal:${goal.id}:goal`,
    },
    completion: {
      action: "complete",
      sourceType: "GOAL",
      sourceId: goal.id,
      completedAt,
      wasScheduled: false,
    },
  };

  const skillIds = collectMyListGoalCompletionSkillIds(goal);
  if (skillIds.length > 0) {
    body.skillIds = skillIds;
  }
  if (goal.monumentId) {
    body.monumentIds = [goal.monumentId];
  }

  try {
    const response = await fetch("/api/xp/award", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.error(
        "Failed to award XP for My List Goal completion",
        await response.text()
      );
      return null;
    }
    return (await response.json().catch(() => null)) as
      | MyListGoalXpAwardResponse
      | null;
  } catch (error) {
    console.error("Failed to award XP for My List Goal completion", error);
    return null;
  }
}

export function GlobalMyList({
  useFullExpandedHeight,
  enableScheduleTimelineDrag,
}: {
  useFullExpandedHeight: boolean;
  enableScheduleTimelineDrag?: boolean;
}) {
  const { user, ready } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<TaskLite[]>([]);
  const [pinnedSourceRows, setPinnedSourceRows] = useState<
    MyListPinnedSourceRow[]
  >([]);
  const [pinnedGoalRows, setPinnedGoalRows] = useState<MyListPinnedGoalRow[]>(
    []
  );
  const [monuments, setMonuments] = useState<MyListMonumentRow[]>([]);
  const [goalMonumentIdsById, setGoalMonumentIdsById] = useState<
    Record<string, string | null>
  >({});
  const [projectGoalIdsById, setProjectGoalIdsById] = useState<
    Record<string, string | null>
  >({});
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [skillCategories, setSkillCategories] = useState<CatRow[]>([]);
  const [scheduledTaskIds, setScheduledTaskIds] = useState<Set<string>>(
    () => new Set()
  );
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(
    () => new Set()
  );
  const [myListReloadKey, setMyListReloadKey] = useState(0);
  const previousStageRef = useRef<Map<string, TaskLite["stage"]>>(new Map());
  const completingPinnedGoalIdsRef = useRef<Set<string>>(new Set());
  const preferredListSystemKeyOnOpen = useMemo(
    () => getPreferredMyListSystemKeyFromPathname(pathname),
    [pathname],
  );

  useEffect(() => {
    if (!ready || !user?.id) {
      setTasks([]);
      setPinnedSourceRows([]);
      setPinnedGoalRows([]);
      setMonuments([]);
      setGoalMonumentIdsById({});
      setProjectGoalIdsById({});
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
      pinnedItems: MyListPinnedSourceStorageItem[],
      hierarchy: {
        goalMonumentIdById: Map<string, string | null>;
        projectGoalIdById: Map<string, string | null>;
        monumentById: Map<string, MyListMonumentRow>;
      }
    ): Promise<{
      topLevelRows: MyListPinnedSourceRow[];
      pinnedGoalRows: MyListPinnedGoalRow[];
    }> => {
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
      const metadataByKey = new Map(
        pinnedItems.map((item) => [
          `${item.sourceType}:${item.sourceId}`,
          {
            priorityId: item.priorityId
              ? normalizePriority(item.priorityId)
              : null,
            dayBucketId: item.dayBucketId,
          },
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
      const projectSelect =
        "id, name, priority, energy, stage, goal_id, completed_at";
      const taskSelect =
        "id, name, priority, energy, stage, completed_at, goal_id, project_id, skill_id, skill:skills(icon, monument_id)";
      const habitSelect =
        "id, name, energy, habit_type, goal_id, skill_id, skill:skills(icon, monument_id)";
      const emptyResult = { data: [], error: null };
      const [
        goalsResult,
        independentProjectsResult,
        goalProjectsResult,
        independentTasksResult,
        goalTasksResult,
        independentHabitsResult,
        goalHabitsResult,
      ] = await Promise.all([
        pinnedIds.GOAL.length > 0
          ? supabase
              .from("goals")
              .select(
                "id, name, emoji, priority, energy, status, active, monument_id, roadmap_id, monument:monuments(id, title, emoji)"
              )
              .eq("user_id", user.id)
              .in("id", pinnedIds.GOAL)
          : Promise.resolve(emptyResult),
        pinnedIds.PROJECT.length > 0
          ? supabase
              .from("projects")
              .select(projectSelect)
              .eq("user_id", user.id)
              .in("id", pinnedIds.PROJECT)
          : Promise.resolve(emptyResult),
        pinnedIds.GOAL.length > 0
          ? supabase
              .from("projects")
              .select(projectSelect)
              .eq("user_id", user.id)
              .in("goal_id", pinnedIds.GOAL)
          : Promise.resolve(emptyResult),
        pinnedIds.TASK.length > 0
          ? supabase
              .from("tasks")
              .select(taskSelect)
              .eq("user_id", user.id)
              .in("id", pinnedIds.TASK)
          : Promise.resolve(emptyResult),
        pinnedIds.GOAL.length > 0
          ? supabase
              .from("tasks")
              .select(taskSelect)
              .eq("user_id", user.id)
              .in("goal_id", pinnedIds.GOAL)
          : Promise.resolve(emptyResult),
        pinnedIds.HABIT.length > 0
          ? supabase
              .from("habits")
              .select(habitSelect)
              .eq("user_id", user.id)
              .in("id", pinnedIds.HABIT)
          : Promise.resolve(emptyResult),
        pinnedIds.GOAL.length > 0
          ? supabase
              .from("habits")
              .select(habitSelect)
              .eq("user_id", user.id)
              .in("goal_id", pinnedIds.GOAL)
          : Promise.resolve(emptyResult),
      ]);

      const firstError =
        goalsResult.error ||
        independentProjectsResult.error ||
        goalProjectsResult.error ||
        independentTasksResult.error ||
        goalTasksResult.error ||
        independentHabitsResult.error ||
        goalHabitsResult.error;
      if (firstError) throw firstError;

      type ProjectSourceRecord = {
        id: string;
        name: string | null;
        priority: string | null;
        energy: string | null;
        stage: string | null;
        completed_at?: string | null;
        goal_id?: string | null;
      };
      type TaskSourceRecord = {
        id: string;
        name: string | null;
        priority: string | null;
        energy: string | null;
        stage: string | null;
        completed_at?: string | null;
        goal_id?: string | null;
        project_id?: string | null;
        skill_id?: string | null;
        skill?:
          | { icon?: string | null; monument_id?: string | null }
          | { icon?: string | null; monument_id?: string | null }[]
          | null;
      };
      type HabitSourceRecord = {
        id: string;
        name: string | null;
        energy: string | null;
        habit_type: string | null;
        goal_id?: string | null;
        skill_id?: string | null;
        skill?:
          | { icon?: string | null; monument_id?: string | null }
          | { icon?: string | null; monument_id?: string | null }[]
          | null;
      };
      const independentProjectRows =
        (independentProjectsResult.data ?? []) as ProjectSourceRecord[];
      const goalProjectRows =
        (goalProjectsResult.data ?? []) as ProjectSourceRecord[];
      const independentTaskRows =
        (independentTasksResult.data ?? []) as TaskSourceRecord[];
      const goalTaskRows = (goalTasksResult.data ?? []) as TaskSourceRecord[];
      const independentHabitRows =
        (independentHabitsResult.data ?? []) as HabitSourceRecord[];
      const goalHabitRows =
        (goalHabitsResult.data ?? []) as HabitSourceRecord[];
      const projectRowsById = new Map<string, ProjectSourceRecord>();
      [...independentProjectRows, ...goalProjectRows].forEach((project) => {
        if (project.id) projectRowsById.set(project.id, project);
      });
      const projectRows = Array.from(projectRowsById.values());
      const projectIds = projectRows
        .map((project) => project.id)
        .filter((projectId): projectId is string => Boolean(projectId));
      const projectIconById = new Map<string, string>();
      const projectSkillIdsById = new Map<string, string[]>();
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
          if (!projectId) return;

          const skillId = readCleanId(row.skill_id);
          if (skillId) {
            const currentSkillIds = projectSkillIdsById.get(projectId) ?? [];
            if (!currentSkillIds.includes(skillId)) {
              projectSkillIdsById.set(projectId, [...currentSkillIds, skillId]);
            }
          }

          if (projectIconById.has(projectId)) return;

          const icon = skillId
            ? skillIconById.get(skillId) ?? null
            : null;
          if (icon) {
            projectIconById.set(projectId, icon);
          }
        });
      }

      const resolveMonumentMetadata = (
        monumentId: string | null,
        fallback?: { title?: string | null; emoji?: string | null } | null
      ) => {
        const monument = monumentId
          ? hierarchy.monumentById.get(monumentId)
          : null;
        return {
          monumentIcon: monument?.emoji ?? fallback?.emoji ?? null,
          monumentName: monument?.title ?? fallback?.title ?? null,
        };
      };
      const resolveProjectMonumentId = (
        projectId?: string | null,
        fallbackGoalId?: string | null
      ) => {
        const goalId =
          (projectId ? hierarchy.projectGoalIdById.get(projectId) : null) ??
          readCleanId(fallbackGoalId);
        return goalId ? (hierarchy.goalMonumentIdById.get(goalId) ?? null) : null;
      };

      const buildProjectRow = (
        project: ProjectSourceRecord,
        options?: {
          isPinned?: boolean;
          rowKind?: MyListPinnedSourceRow["rowKind"];
          useRealProjectCompletion?: boolean;
        }
      ): MyListPinnedSourceRow => {
        const monumentId = resolveProjectMonumentId(project.id, project.goal_id);
        const realCompletedAt = readRealProjectCompletedAt(project);
        return {
          id: project.id,
          sourceType: "PROJECT" as const,
          rowKind: options?.rowKind,
          title: project.name ?? "Untitled Project",
          icon: projectIconById.get(project.id) ?? null,
          skillIds: projectSkillIdsById.get(project.id) ?? [],
          skillIcon: projectIconById.get(project.id) ?? null,
          monumentId,
          ...resolveMonumentMetadata(monumentId),
          priority: project.priority,
          priorityId: metadataByKey.get(`PROJECT:${project.id}`)?.priorityId ?? null,
          dayBucketId: metadataByKey.get(`PROJECT:${project.id}`)?.dayBucketId ?? null,
          energy: project.energy,
          stage: project.stage,
          goalId: project.goal_id ?? null,
          isPinned: options?.isPinned ?? pinnedIds.PROJECT.includes(project.id),
          completedAt: options?.useRealProjectCompletion
            ? realCompletedAt
            : completionByKey.get(`PROJECT:${project.id}`) ?? null,
        };
      };

      const buildTaskRow = (
        task: TaskSourceRecord,
        options?: {
          isPinned?: boolean;
          rowKind?: MyListPinnedSourceRow["rowKind"];
          useRealTaskCompletion?: boolean;
        }
      ): MyListPinnedSourceRow => {
        const skill = Array.isArray(task.skill) ? task.skill[0] : task.skill;
        const goalMonumentId = task.goal_id
          ? hierarchy.goalMonumentIdById.get(task.goal_id) ?? null
          : null;
        const projectMonumentId = resolveProjectMonumentId(task.project_id);
        const skillMonumentId = readCleanId(skill?.monument_id);
        const monumentId = goalMonumentId ?? projectMonumentId ?? skillMonumentId;
        return {
          id: task.id,
          sourceType: "TASK" as const,
          rowKind: options?.rowKind,
          title: task.name ?? "Untitled Task",
          icon:
            skill?.icon ??
            (task.skill_id ? skillIconById.get(task.skill_id) ?? null : null),
          skillId: task.skill_id ?? null,
          skillMonumentId,
          goalId: task.goal_id ?? null,
          projectId: task.project_id ?? null,
          monumentId,
          ...resolveMonumentMetadata(monumentId),
          priority: task.priority,
          priorityId: metadataByKey.get(`TASK:${task.id}`)?.priorityId ?? null,
          dayBucketId: metadataByKey.get(`TASK:${task.id}`)?.dayBucketId ?? null,
          energy: task.energy,
          stage: task.stage,
          isPinned: options?.isPinned ?? pinnedIds.TASK.includes(task.id),
          completedAt: options?.useRealTaskCompletion
            ? readCleanId(task.completed_at)
            : completionByKey.get(`TASK:${task.id}`) ?? null,
        };
      };

      const buildHabitRow = (
        habit: HabitSourceRecord,
        options?: {
          isPinned?: boolean;
          rowKind?: MyListPinnedSourceRow["rowKind"];
        }
      ): MyListPinnedSourceRow => {
        const skill = Array.isArray(habit.skill) ? habit.skill[0] : habit.skill;
        const goalMonumentId = habit.goal_id
          ? hierarchy.goalMonumentIdById.get(habit.goal_id) ?? null
          : null;
        const skillMonumentId = readCleanId(skill?.monument_id);
        const monumentId = goalMonumentId ?? skillMonumentId;
        return {
          id: habit.id,
          sourceType: "HABIT" as const,
          rowKind: options?.rowKind,
          title: habit.name ?? "Untitled Habit",
          icon:
            skill?.icon ??
            (habit.skill_id ? skillIconById.get(habit.skill_id) ?? null : null),
          skillId: habit.skill_id ?? null,
          skillMonumentId,
          goalId: habit.goal_id ?? null,
          monumentId,
          ...resolveMonumentMetadata(monumentId),
          priority: "MEDIUM",
          priorityId: metadataByKey.get(`HABIT:${habit.id}`)?.priorityId ?? null,
          dayBucketId: metadataByKey.get(`HABIT:${habit.id}`)?.dayBucketId ?? null,
          energy: habit.energy,
          stage: habit.habit_type,
          isPinned: options?.isPinned ?? pinnedIds.HABIT.includes(habit.id),
          completedAt: completionByKey.get(`HABIT:${habit.id}`) ?? null,
        };
      };

      const goalRows = ((goalsResult.data ?? []) as {
          id: string;
          name: string | null;
          emoji?: string | null;
          priority: string | null;
          energy: string | null;
          status: string | null;
          active?: boolean | null;
          monument_id?: string | null;
          roadmap_id?: string | null;
          monument?:
            | { id?: string | null; title?: string | null; emoji?: string | null }
            | { id?: string | null; title?: string | null; emoji?: string | null }[]
            | null;
        }[]).map((goal): MyListPinnedGoalRow => {
          const resolvedMonumentId =
            hierarchy.goalMonumentIdById.get(goal.id) ??
            readCleanId(goal.monument_id);
          const monument = Array.isArray(goal.monument)
            ? goal.monument[0]
            : goal.monument;
          return {
            ...resolveMonumentMetadata(resolvedMonumentId, monument),
            id: goal.id,
            sourceType: "GOAL" as const,
            title: goal.name ?? "Untitled Goal",
            goalIcon: goal.emoji ?? null,
            icon: goal.emoji ?? null,
            monumentId: resolvedMonumentId,
            priority: goal.priority,
            priorityId: metadataByKey.get(`GOAL:${goal.id}`)?.priorityId ?? null,
            dayBucketId: metadataByKey.get(`GOAL:${goal.id}`)?.dayBucketId ?? null,
            energy: goal.energy,
            stage: goal.status,
            active: goal.active ?? null,
            completedAt: null,
            projects: goalProjectRows
              .filter((project) => project.goal_id === goal.id)
              .map((project) =>
                buildProjectRow(project, { useRealProjectCompletion: true })
              ),
            tasks: goalTaskRows
              .filter((task) => task.goal_id === goal.id)
              .map((task) => buildTaskRow(task, { useRealTaskCompletion: true })),
            habits: goalHabitRows
              .filter((habit) => habit.goal_id === goal.id)
              .map((habit) => buildHabitRow(habit)),
          };
        }).sort(
          (left, right) =>
            (orderByKey.get(`${left.sourceType}:${left.id}`) ?? 0) -
            (orderByKey.get(`${right.sourceType}:${right.id}`) ?? 0)
        );

      const topLevelRows = [
        ...independentProjectRows.map((project) =>
          buildProjectRow(project, {
            isPinned: true,
            rowKind: "PINNED_SOURCE",
          })
        ),
        ...independentTaskRows.map((task) =>
          buildTaskRow(task, {
            isPinned: true,
            rowKind: "PINNED_SOURCE",
          })
        ),
        ...independentHabitRows.map((habit) =>
          buildHabitRow(habit, {
            isPinned: true,
            rowKind: "PINNED_SOURCE",
          })
        ),
      ].sort(
        (left, right) =>
          (orderByKey.get(`${left.sourceType}:${left.id}`) ?? 0) -
          (orderByKey.get(`${right.sourceType}:${right.id}`) ?? 0)
      );

      return { topLevelRows, pinnedGoalRows: goalRows };
    };

    const loadMyListData = async () => {
      const [
        taskRows,
        skillRows,
        categoryRows,
        scheduledRowsResult,
        monumentsResult,
        hierarchyGoalsResult,
        hierarchyProjectsResult,
        hierarchyRoadmapsResult,
      ] =
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
          supabase
            .from("monuments")
            .select("id,title,emoji,priority_rank")
            .eq("user_id", user.id)
            .order("priority_rank", { ascending: true, nullsFirst: false })
            .order("created_at", { ascending: true }),
          supabase
            .from("goals")
            .select("id,monument_id,roadmap_id")
            .eq("user_id", user.id),
          supabase
            .from("projects")
            .select("id,goal_id")
            .eq("user_id", user.id),
          supabase
            .from("roadmaps")
            .select("id,monument_id")
            .eq("user_id", user.id),
        ]);

      if (!active) return;
      if (scheduledRowsResult.error) {
        throw scheduledRowsResult.error;
      }
      if (monumentsResult.error) {
        console.warn("Failed to load My List monuments", monumentsResult.error);
      }
      if (hierarchyGoalsResult.error) {
        console.warn(
          "Failed to load My List goal hierarchy",
          hierarchyGoalsResult.error
        );
      }
      if (hierarchyProjectsResult.error) {
        console.warn(
          "Failed to load My List project hierarchy",
          hierarchyProjectsResult.error
        );
      }
      if (hierarchyRoadmapsResult.error) {
        console.warn(
          "Failed to load My List roadmap hierarchy",
          hierarchyRoadmapsResult.error
        );
      }

      const loadedMonuments = ((monumentsResult.data ?? []) as {
        id: string;
        title: string | null;
        emoji?: string | null;
        priority_rank?: number | null;
      }[])
        .filter((monument) => readCleanId(monument.id))
        .map<MyListMonumentRow>((monument) => ({
          id: monument.id,
          title: monument.title?.trim() || "Untitled Monument",
          emoji: monument.emoji ?? null,
          priorityRank:
            typeof monument.priority_rank === "number" &&
            Number.isFinite(monument.priority_rank)
              ? monument.priority_rank
              : null,
        }));
      const monumentById = new Map(
        loadedMonuments.map((monument) => [monument.id, monument])
      );
      const roadmapMonumentIdById = new Map(
        ((hierarchyRoadmapsResult.data ?? []) as MyListHierarchyRoadmapRow[])
          .map((roadmap) => [
            readCleanId(roadmap.id),
            readCleanId(roadmap.monument_id),
          ] as const)
          .filter((entry): entry is readonly [string, string | null] =>
            Boolean(entry[0])
          )
      );
      const goalMonumentIdById = new Map(
        ((hierarchyGoalsResult.data ?? []) as MyListHierarchyGoalRow[])
          .map((goal) => {
            const goalId = readCleanId(goal.id);
            const roadmapId = readCleanId(goal.roadmap_id);
            const monumentId =
              readCleanId(goal.monument_id) ??
              (roadmapId ? roadmapMonumentIdById.get(roadmapId) ?? null : null);
            return [goalId, monumentId] as const;
          })
          .filter((entry): entry is readonly [string, string | null] =>
            Boolean(entry[0])
          )
      );
      const projectGoalIdById = new Map(
        ((hierarchyProjectsResult.data ?? []) as MyListHierarchyProjectRow[])
          .map((project) => [
            readCleanId(project.id),
            readCleanId(project.goal_id),
          ] as const)
          .filter((entry): entry is readonly [string, string | null] =>
            Boolean(entry[0])
          )
      );

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
            priorityId: null,
            dayBucketId: null,
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
      const pinnedRowsResult = await loadPinnedSourceRows(skillRows, pinnedItems, {
        goalMonumentIdById,
        projectGoalIdById,
        monumentById,
      }).catch((error) => {
        console.error("Failed to load My List pinned source rows", error);
        return { topLevelRows: [], pinnedGoalRows: [] };
      });
      if (!active) return;

      setTasks(taskRows);
      setPinnedSourceRows(pinnedRowsResult.topLevelRows);
      setPinnedGoalRows(pinnedRowsResult.pinnedGoalRows);
      setMonuments(loadedMonuments);
      setGoalMonumentIdsById(Object.fromEntries(goalMonumentIdById));
      setProjectGoalIdsById(Object.fromEntries(projectGoalIdById));
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
      setPinnedGoalRows([]);
      setSkills([]);
      setSkillCategories([]);
      setScheduledTaskIds(new Set());
    });

    const handlePinnedSourcesChanged = () => {
      void loadMyListData().catch(() => {
        if (!active) return;
        setPinnedSourceRows([]);
        setPinnedGoalRows([]);
      });
    };
    const handleCreatorEntitySaved = () => {
      void loadMyListData().catch(() => {
        if (!active) return;
        setPinnedSourceRows([]);
        setPinnedGoalRows([]);
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
  }, [myListReloadKey, ready, user?.id]);

  const pinnedTaskIds = useMemo(
    () =>
      new Set(
        pinnedSourceRows
          .filter((row) => row.sourceType === "TASK")
          .map((row) => row.id)
      ),
    [pinnedSourceRows]
  );
  const myListTasks = useMemo(
    () =>
      tasks
        .filter(
          (task) =>
            !task.goal_id &&
            !task.project_id &&
            !scheduledTaskIds.has(task.id) &&
            !pinnedTaskIds.has(task.id)
        )
        .sort((left, right) => {
          const leftDone = left.stage?.toString().toUpperCase() === "PERFECT";
          const rightDone = right.stage?.toString().toUpperCase() === "PERFECT";
          if (leftDone !== rightDone) return leftDone ? 1 : -1;
          return left.name.localeCompare(right.name);
        }),
    [pinnedTaskIds, scheduledTaskIds, tasks]
  );
  const visiblePinnedSourceRows = useMemo(
    () =>
      pinnedSourceRows.filter((row) => {
        if (row.sourceType !== "TASK") return true;
        return !scheduledTaskIds.has(row.id);
      }),
    [pinnedSourceRows, scheduledTaskIds],
  );
  const visibleTodoPinnedSourceRows = useMemo(
    () =>
      visiblePinnedSourceRows.filter(
        (row) => row.sourceType !== "GOAL" && row.isPinned !== false
      ),
    [visiblePinnedSourceRows]
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
      setPinnedGoalRows((currentRows) => {
        if (row.sourceType === "GOAL") {
          return currentRows.filter((currentRow) => currentRow.id !== row.id);
        }

        return currentRows.map((goal) => ({
          ...goal,
          projects: goal.projects.map((project) =>
            project.sourceType === row.sourceType && project.id === row.id
              ? { ...project, isPinned: false, completedAt: null }
              : project
          ),
          tasks: goal.tasks?.map((task) =>
            task.sourceType === row.sourceType && task.id === row.id
              ? { ...task, isPinned: false, completedAt: null }
              : task
          ),
          habits: goal.habits?.map((habit) =>
            habit.sourceType === row.sourceType && habit.id === row.id
              ? { ...habit, isPinned: false, completedAt: null }
              : habit
          ),
        }));
      });
    },
    [user?.id]
  );

  const handleTogglePinnedSourceCompletion = useCallback(
    async (row: MyListPinnedSourceRow, completedAt: string | null) => {
      if (!user?.id) return false;

      const previousCompletedAt = row.completedAt ?? null;

      setPinnedSourceRows((currentRows) =>
        currentRows.map((currentRow) =>
          currentRow.sourceType === row.sourceType && currentRow.id === row.id
            ? { ...currentRow, completedAt }
            : currentRow
        )
      );
      setPinnedGoalRows((currentRows) =>
        currentRows.map((goal) => ({
          ...goal,
          projects: goal.projects.map((project) =>
            project.sourceType === row.sourceType && project.id === row.id
              ? { ...project, completedAt }
              : project
          ),
          tasks: goal.tasks?.map((task) =>
            task.sourceType === row.sourceType && task.id === row.id
              ? { ...task, completedAt }
              : task
          ),
          habits: goal.habits?.map((habit) =>
            habit.sourceType === row.sourceType && habit.id === row.id
              ? { ...habit, completedAt }
              : habit
          ),
        }))
      );

      try {
        await updatePinnedSourceMyListItemCompletion({
          userId: user.id,
          sourceType: row.sourceType,
          sourceId: row.id,
          done: Boolean(completedAt),
          completedAt,
        });
        return true;
      } catch (error) {
        console.error("Failed to persist pinned My List completion", error);

        setPinnedSourceRows((currentRows) =>
          currentRows.map((currentRow) =>
            currentRow.sourceType === row.sourceType &&
            currentRow.id === row.id
              ? { ...currentRow, completedAt: previousCompletedAt }
              : currentRow
          )
        );
        setPinnedGoalRows((currentRows) =>
          currentRows.map((goal) => ({
            ...goal,
            projects: goal.projects.map((project) =>
              project.sourceType === row.sourceType && project.id === row.id
                ? { ...project, completedAt: previousCompletedAt }
                : project
            ),
            tasks: goal.tasks?.map((task) =>
              task.sourceType === row.sourceType && task.id === row.id
                ? { ...task, completedAt: previousCompletedAt }
                : task
            ),
            habits: goal.habits?.map((habit) =>
              habit.sourceType === row.sourceType && habit.id === row.id
                ? { ...habit, completedAt: previousCompletedAt }
                : habit
            ),
          }))
        );
        return false;
      }
    },
    [user?.id]
  );

  const handleTogglePinnedGoalProjectCompletion = useCallback(
    async (
      row: MyListPinnedSourceRow,
      checked: boolean,
      sourceRect: CreatorXpBurstRect | null
    ) => {
      if (!user?.id || row.sourceType !== "PROJECT") return false;

      const supabase = getSupabaseBrowser();
      if (!supabase) return false;

      const previousStage = row.stage ?? null;
      const previousCompletedAt = row.completedAt ?? null;
      const nextCompletedAt = checked ? new Date().toISOString() : null;
      const nextStage = checked
        ? "RELEASE"
        : isProjectCompletionStage(previousStage)
          ? "BUILD"
          : previousStage ?? "BUILD";

      try {
        const [
          projectSkillRowsResult,
          taskSkillRowsResult,
        ] = await Promise.all([
          supabase
            .from("project_skills")
            .select("skill_id")
            .eq("project_id", row.id),
          supabase
            .from("tasks")
            .select("skill_id, stage, completed_at")
            .eq("user_id", user.id)
            .eq("project_id", row.id),
        ]);

        if (projectSkillRowsResult.error) throw projectSkillRowsResult.error;
        if (taskSkillRowsResult.error) throw taskSkillRowsResult.error;

        const taskRows = (taskSkillRowsResult.data ?? []) as {
          skill_id?: string | null;
          stage?: string | null;
          completed_at?: string | null;
        }[];

        if (
          checked &&
          taskRows.some(
            (task) =>
              task.stage?.toString().toUpperCase() !== "PERFECT" &&
              !task.completed_at
          )
        ) {
          void hapticWarningPattern();
          return false;
        }

        setPinnedGoalRows((currentRows) =>
          currentRows.map((goal) => ({
            ...goal,
            projects: goal.projects.map((project) =>
              project.sourceType === "PROJECT" && project.id === row.id
                ? {
                    ...project,
                    stage: nextStage,
                    completedAt: nextCompletedAt,
                  }
                : project
            ),
          }))
        );

        const projectSkillIds = (
          (projectSkillRowsResult.data ?? []) as { skill_id?: string | null }[]
        )
          .map((skill) => skill.skill_id)
          .filter((skillId): skillId is string =>
            Boolean(skillId && skillId.trim())
          );
        const taskSkillIds = taskRows.map((task) => task.skill_id);

        const result = await recordProjectCompletion(
          {
            projectId: row.id,
            projectSkillIds,
            taskSkillIds,
            xpSurge: {
              sourceTitle: row.title,
              sourceIcon: row.icon ?? row.skillIcon ?? null,
            },
            xpSourceRect: checked ? sourceRect : null,
            xpSourceOrigin: checked && sourceRect ? "card" : undefined,
          },
          checked ? "complete" : "undo"
        );

        if (checked && !result.completedAt) {
          throw new Error("Project completion failed");
        }

        if (!checked && !result.ok) {
          console.warn(
            "Pinned Goal Project undo completed, but XP reversal did not succeed",
            {
              projectId: row.id,
              scheduleInstanceId: result.scheduleInstanceId,
            }
          );
        }

        const persistedCompletedAt = checked ? result.completedAt : null;
        setPinnedGoalRows((currentRows) =>
          currentRows.map((goal) => ({
            ...goal,
            projects: goal.projects.map((project) =>
              project.sourceType === "PROJECT" && project.id === row.id
                ? {
                    ...project,
                    stage: checked ? "RELEASE" : nextStage,
                    completedAt: persistedCompletedAt,
                  }
                : project
            ),
          }))
        );

        try {
          const { error: stageUpdateError } = await supabase
            .from("projects")
            .update({
              stage: nextStage,
              updated_at: new Date().toISOString(),
            } as never)
            .eq("id", row.id)
            .eq("user_id", user.id);
          if (stageUpdateError) throw stageUpdateError;
        } catch (stageSyncError) {
          console.error(
            "Failed to synchronize pinned Goal Project stage",
            stageSyncError
          );
          void hapticWarningPattern();
          return true;
        }

        if (checked) void hapticComplete();
        return true;
      } catch (error) {
        console.error("Failed to toggle pinned Goal Project completion", error);
        setPinnedGoalRows((currentRows) =>
          currentRows.map((goal) => ({
            ...goal,
            projects: goal.projects.map((project) =>
              project.sourceType === "PROJECT" && project.id === row.id
                ? {
                    ...project,
                    stage: previousStage,
                    completedAt: previousCompletedAt,
                  }
                : project
            ),
          }))
        );
        void hapticWarningPattern();
        return false;
      }
    },
    [user?.id]
  );

  const handleCompletePinnedGoal = useCallback(
    async (goal: MyListPinnedGoalRow) => {
      if (!user?.id) return false;
      if (
        completingPinnedGoalIdsRef.current.has(goal.id) ||
        isMyListGoalComplete(goal)
      ) {
        return false;
      }

      if (!isMyListGoalReadyToComplete(goal)) {
        void hapticErrorPattern();
        return false;
      }

      const supabase = getSupabaseBrowser();
      if (!supabase) {
        void hapticWarningPattern();
        return false;
      }

      const completedAt = new Date().toISOString();
      completingPinnedGoalIdsRef.current.add(goal.id);

      try {
        const goalCompletionUpdate = supabase.from(
          "goals"
        ) as unknown as MyListGoalCompletionUpdateQuery;
        const { error: updateError } = await goalCompletionUpdate
          .update({ status: "COMPLETED", active: false })
          .eq("id", goal.id)
          .eq("user_id", user.id);

        if (updateError) throw updateError;

        setPinnedGoalRows((currentRows) =>
          currentRows.map((currentGoal) =>
            currentGoal.id === goal.id
              ? { ...currentGoal, active: false, stage: "COMPLETED" }
              : currentGoal
          )
        );
        void hapticComplete();

        const awardPayload = await awardMyListGoalCompletion(goal, completedAt);
        const didAwardXp = Boolean(
          awardPayload?.success &&
            !awardPayload.deduped &&
            (awardPayload.inserted ?? 0) > 0
        );
        if (didAwardXp) {
          const fallbackGoalSurge = buildCreatorXpSurgePayload({
            sourceType: "GOAL",
            monumentTitle: goal.monumentName,
            sourceTitle: goal.title,
            sourceIcon: goal.goalIcon ?? goal.icon ?? goal.monumentIcon ?? null,
          });
          const goalSurge = awardPayload?.surge
            ? {
                ...fallbackGoalSurge,
                ...awardPayload.surge,
                sourceType: "GOAL" as const,
                title: awardPayload.surge.title ?? fallbackGoalSurge.title,
                sourceIcon:
                  awardPayload.surge.sourceIcon ??
                  fallbackGoalSurge.sourceIcon ??
                  null,
                displayXp:
                  awardPayload.surge.displayXp ?? fallbackGoalSurge.displayXp,
              }
            : fallbackGoalSurge;

          dispatchCreatorXpRewardVisual({
            surge: goalSurge,
            completedAt,
            amount: goalSurge.displayXp ?? undefined,
            kind: "goal_complete",
            burstId: `my-list-goal:${goal.id}:${completedAt}`,
          });
        }

        return true;
      } catch (error) {
        console.error("Failed to complete pinned Goal from My List", error);
        void hapticErrorPattern();
        return false;
      } finally {
        completingPinnedGoalIdsRef.current.delete(goal.id);
      }
    },
    [user?.id]
  );

  const handleUpdatePinnedSourceMetadata = useCallback(
    (
      row: MyListPinnedSourceRow,
      updates: {
        priorityId?: MyListPinnedSourceRow["priorityId"];
        dayBucketId?: MyListPinnedSourceRow["dayBucketId"];
      }
    ) => {
      if (!user?.id) return;

      setPinnedSourceRows((currentRows) =>
        currentRows.map((currentRow) =>
          currentRow.sourceType === row.sourceType && currentRow.id === row.id
            ? { ...currentRow, ...updates }
            : currentRow
        )
      );
      setPinnedGoalRows((currentRows) =>
        currentRows.map((goal) => ({
          ...goal,
          projects: goal.projects.map((project) =>
            project.sourceType === row.sourceType && project.id === row.id
              ? { ...project, ...updates }
              : project
          ),
          tasks: goal.tasks?.map((task) =>
            task.sourceType === row.sourceType && task.id === row.id
              ? { ...task, ...updates }
              : task
          ),
          habits: goal.habits?.map((habit) =>
            habit.sourceType === row.sourceType && habit.id === row.id
              ? { ...habit, ...updates }
              : habit
          ),
        }))
      );

      void updatePinnedSourceMyListItemMetadata({
        userId: user.id,
        sourceType: row.sourceType,
        sourceId: row.id,
        priorityId: updates.priorityId ?? undefined,
        dayBucketId: updates.dayBucketId,
      }).catch((error) => {
        console.error("Failed to persist pinned My List metadata", error);
      });
    },
    [user?.id]
  );

  const handleReorderPinnedSourceRows = useCallback(
    (orderedRows: MyListPinnedSourceRow[]) => {
      if (!user?.id) return;

      const orderByKey = new Map(
        orderedRows.map((row, index) => [`${row.sourceType}:${row.id}`, index])
      );

      setPinnedSourceRows((currentRows) => {
        const orderedQueue = orderedRows.filter((row) =>
          currentRows.some(
            (currentRow) =>
              currentRow.sourceType === row.sourceType &&
              currentRow.id === row.id
          )
        );
        let orderedIndex = 0;

        return currentRows.map((row) => {
          if (!orderByKey.has(`${row.sourceType}:${row.id}`)) return row;
          const nextRow = orderedQueue[orderedIndex];
          orderedIndex += 1;
          return nextRow ?? row;
        });
      });

      void updatePinnedSourceMyListItemOrder({
        userId: user.id,
        rows: orderedRows.map((row) => ({
          sourceType: row.sourceType,
          sourceId: row.id,
        })),
      }).catch((error) => {
        console.error("Failed to persist pinned My List order", error);
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

  const handleRemoveTask = useCallback(
    async (taskId: string) => {
      if (!user?.id) return false;
      if (pendingTaskIds.has(taskId)) return false;

      const task = myListTasks.find((item) => item.id === taskId);
      if (!task) {
        setMyListReloadKey((key) => key + 1);
        return false;
      }

      if (
        task.goal_id ||
        task.project_id ||
        scheduledTaskIds.has(taskId) ||
        pinnedTaskIds.has(taskId)
      ) {
        setMyListReloadKey((key) => key + 1);
        return false;
      }

      try {
        const result = await deleteStandaloneMyListTask({
          taskId,
          userId: user.id,
        });

        if (!result.deleted) {
          console.warn("Standalone My List Task delete skipped", {
            taskId,
            reason: result.reason,
          });
          setMyListReloadKey((key) => key + 1);
          return false;
        }

        previousStageRef.current.delete(taskId);
        setTasks((currentTasks) =>
          currentTasks.filter((item) => item.id !== taskId)
        );
        return true;
      } catch (error) {
        console.error("Failed to delete standalone My List Task", error);
        setMyListReloadKey((key) => key + 1);
        return false;
      }
    },
    [myListTasks, pendingTaskIds, pinnedTaskIds, scheduledTaskIds, user?.id]
  );

  const handleToggleTask = useCallback(
    async (
      taskId: string,
      sourceRect: CreatorXpBurstRect | null,
      xpContext: MyListTaskXpContext
    ) => {
      const task = tasks.find((item) => item.id === taskId);
      if (!task) return false;
      if (pendingTaskIds.has(taskId)) {
        void hapticWarningPattern();
        return false;
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
        return true;
      }

      const selectedSkillId = xpContext.skillId?.trim() || task.skill_id?.trim();
      const selectedMonumentId =
        xpContext.monumentId?.trim() || task.skill_monument_id?.trim() || null;

      if (!isCurrentlyCompleted && !selectedSkillId) {
        snapshots.delete(taskId);
        void hapticWarningPattern();
        return false;
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
          return true;
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
        return true;
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
        return false;
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
      pinnedSourceRows={visibleTodoPinnedSourceRows}
      pinnedGoalRows={pinnedGoalRows}
      monuments={monuments}
      goalMonumentIdsById={goalMonumentIdsById}
      projectGoalIdsById={projectGoalIdsById}
      skills={skills}
      skillCategories={skillCategories}
      pendingTaskIds={pendingTaskIds}
      preferredListSystemKeyOnOpen={preferredListSystemKeyOnOpen}
      useFullExpandedHeight={useFullExpandedHeight}
      enableScheduleTimelineDrag={enableScheduleTimelineDrag === true}
      onRemovePinnedSource={handleRemovePinnedSource}
      onTogglePinnedSourceCompletion={handleTogglePinnedSourceCompletion}
      onTogglePinnedGoalProjectCompletion={
        handleTogglePinnedGoalProjectCompletion
      }
      onCompletePinnedGoal={handleCompletePinnedGoal}
      onUpdatePinnedSourceMetadata={handleUpdatePinnedSourceMetadata}
      onReorderPinnedSourceRows={handleReorderPinnedSourceRows}
      onRemoveTask={handleRemoveTask}
      onToggleTask={handleToggleTask}
      onTaskSkillSelect={handleTaskSkillSelect}
      onOpenChange={(nextOpen) => {
        void hapticPress();
        setOpen(nextOpen);
      }}
    />
  );
}
