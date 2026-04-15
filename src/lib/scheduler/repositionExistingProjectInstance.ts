import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../types/supabase";
import {
  fetchCompatibleWindowsForItem,
} from "./reschedule";
import {
  placeItemInWindows,
  type BlockerCache,
  type PlacementDebugTrace,
} from "./placement";
import {
  addDaysInTimeZone,
  startOfDayInTimeZone,
} from "./timezone";
import { buildProjectItems, type ProjectItem } from "./projects";
import type { ProjectLite, TaskLite } from "./weight";
import {
  fetchProjectsMap,
  fetchProjectSkillsForProjects,
  fetchReadyTasks,
  fetchGoalsForUser,
  fetchWindowsForDate,
  type GoalSummary,
  type WindowLite,
} from "./repo";
import { fetchInstancesForRange, type ScheduleInstance } from "./instanceRepo";

type Client = SupabaseClient<Database>;

type WindowAvailabilityBounds = {
  front: Date;
  back: Date;
};

export type RepositionExistingProjectInstanceError =
  | "NOT_FOUND"
  | "NOT_PROJECT_INSTANCE"
  | "NOT_SCHEDULED"
  | "PROJECT_MISMATCH"
  | "NO_FIT"
  | Error;

export type RepositionExistingProjectInstanceSuccess = {
  ok: true;
  projectId: string;
  instanceId: string;
  instance: ScheduleInstance;
  projectItem: ProjectItem;
};

export type RepositionExistingProjectInstanceFailure = {
  ok: false;
  projectId: string;
  instanceId: string;
  error: RepositionExistingProjectInstanceError;
  maxGapMs?: number | null;
};

export type RepositionExistingProjectInstanceResult =
  | RepositionExistingProjectInstanceSuccess
  | RepositionExistingProjectInstanceFailure;

export type RepositionExistingProjectInstanceParams = {
  userId: string;
  projectId: string;
  instanceId: string;
  baseDate: Date;
  timeZone: string;
  client: Client;
  project?: ProjectLite | null;
  tasks?: TaskLite[] | null;
  goals?: GoalSummary[] | null;
  projectSkillIds?: string[] | null;
  searchHorizonDays?: number;
  windowsSnapshot?: WindowLite[] | null;
  useDayTypes?: boolean;
  locationContextId?: string | null;
  locationContextValue?: string | null;
  existingInstances?: ScheduleInstance[];
  blockerCache?: BlockerCache;
  maxGapCache?: Map<string, number>;
  debugEnabled?: boolean;
  debugOnFailure?: (info: PlacementDebugTrace) => void;
};

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === "string") return new Error(value);
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error(String(value));
  }
}

function mapGoalWeights(goals: GoalSummary[]): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const goal of goals) {
    weights[goal.id] = goal.weight ?? 0;
  }
  return weights;
}

function normalizeSearchHorizonDays(value?: number | null): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 14;
  return Math.max(1, Math.floor(value));
}

function extractProjectSkillIds(
  taskRows: TaskLite[],
  projectSkillRows: string[]
): string[] {
  const ids = new Set<string>();
  for (const skillId of projectSkillRows) {
    if (skillId) ids.add(skillId);
  }
  for (const task of taskRows) {
    if (task.skill_id) ids.add(task.skill_id);
  }
  return Array.from(ids);
}

export async function repositionExistingProjectInstance(
  params: RepositionExistingProjectInstanceParams
): Promise<RepositionExistingProjectInstanceResult> {
  const {
    userId,
    projectId,
    instanceId,
    baseDate,
    timeZone,
    client,
    project: providedProject,
    tasks: providedTasks,
    goals: providedGoals,
    projectSkillIds: providedProjectSkillIds,
    searchHorizonDays,
    windowsSnapshot,
    useDayTypes,
    locationContextId,
    locationContextValue,
    existingInstances: providedExistingInstances,
    blockerCache,
    maxGapCache,
    debugEnabled,
    debugOnFailure,
  } = params;

  try {
    const horizonDays = normalizeSearchHorizonDays(searchHorizonDays);
    const dayStart = startOfDayInTimeZone(baseDate, timeZone);
    const horizonEnd = addDaysInTimeZone(dayStart, horizonDays, timeZone);

    const [instanceResult, projectsById] = await Promise.all([
      client
        .from("schedule_instances")
        .select("id, source_type, source_id, status")
        .eq("id", instanceId)
        .eq("user_id", userId)
        .maybeSingle(),
      providedProject ? Promise.resolve(null) : fetchProjectsMap(client),
    ]);

    if (instanceResult.error) {
      return {
        ok: false,
        projectId,
        instanceId,
        error: toError(instanceResult.error),
      };
    }
    const targetInstance = instanceResult.data as
      | Pick<ScheduleInstance, "id" | "source_type" | "source_id" | "status">
      | null;
    const projectRow = providedProject ?? (projectsById?.[projectId] ?? null);

    if (!targetInstance || !projectRow) {
      return {
        ok: false,
        projectId,
        instanceId,
        error: "NOT_FOUND",
      };
    }

    if (targetInstance.source_type !== "PROJECT") {
      return {
        ok: false,
        projectId,
        instanceId,
        error: "NOT_PROJECT_INSTANCE",
      };
    }

    if (targetInstance.source_id !== projectId) {
      return {
        ok: false,
        projectId,
        instanceId,
        error: "PROJECT_MISMATCH",
      };
    }

    if (targetInstance.status !== "scheduled") {
      return {
        ok: false,
        projectId,
        instanceId,
        error: "NOT_SCHEDULED",
      };
    }

    const [allTasks, goalsResult, projectSkillIdsByProject] = await Promise.all([
      providedTasks ? Promise.resolve(null) : fetchReadyTasks(client),
      providedGoals ? Promise.resolve(null) : fetchGoalsForUser(userId, client),
      providedProjectSkillIds
        ? Promise.resolve(null)
        : fetchProjectSkillsForProjects([projectId], client),
    ]);
    const projectTasks = (providedTasks ?? allTasks ?? []).filter(
      (task) => task.project_id === projectId
    );
    const projectSkillIds = extractProjectSkillIds(
      projectTasks,
      providedProjectSkillIds ?? projectSkillIdsByProject?.[projectId] ?? []
    );

    const resolvedGoals = providedGoals ?? goalsResult ?? [];
    const goalWeights = mapGoalWeights(resolvedGoals);
    const projectItem = buildProjectItems([projectRow], projectTasks, goalWeights)[0];

    if (!projectItem) {
      return {
        ok: false,
        projectId,
        instanceId,
        error: "NOT_FOUND",
      };
    }

    const projectGoalMonumentId =
      resolvedGoals.find((goal) => goal.id === projectRow.goal_id)?.monumentId ??
      null;
    const projectGoalMonumentIds =
      projectGoalMonumentId !== null ? [projectGoalMonumentId] : null;

    const placementItem = {
      id: projectItem.id,
      sourceType: "PROJECT" as const,
      duration_min: projectItem.duration_min,
      energy: projectItem.energy,
      weight: projectItem.weight,
      globalRank: projectItem.globalRank ?? null,
      eventName: projectItem.name || projectItem.id,
    };

    let blockers: ScheduleInstance[] = providedExistingInstances ?? [];
    if (blockers.length === 0) {
      const blockerRangeResult = await fetchInstancesForRange(
        userId,
        dayStart.toISOString(),
        horizonEnd.toISOString(),
        client
      );
      if (blockerRangeResult.error) {
        return {
          ok: false,
          projectId,
          instanceId,
          error: toError(blockerRangeResult.error),
        };
      }
      blockers = ((blockerRangeResult.data ?? []) as ScheduleInstance[]).filter(
        Boolean
      );
    }

    const availability = new Map<string, WindowAvailabilityBounds>();
    let lastNoFit: { maxGapMs?: number | null } | null = null;

    for (let dayOffset = 0; dayOffset < horizonDays; dayOffset++) {
      const currentDay =
        dayOffset === 0 ? dayStart : addDaysInTimeZone(dayStart, dayOffset, timeZone);

      const dayWindows: WindowLite[] = await fetchWindowsForDate(
        currentDay,
        client,
        timeZone,
        windowsSnapshot
          ? {
              userId,
              snapshot: windowsSnapshot,
              useDayTypes,
            }
          : {
              userId,
              useDayTypes,
            }
      );

      const compatibleWindowsResult = await fetchCompatibleWindowsForItem(
        client,
        currentDay,
        {
          energy: projectItem.energy,
          duration_min: projectItem.duration_min,
          skillIds: projectSkillIds.length > 0 ? projectSkillIds : null,
          monumentId: projectGoalMonumentId,
          monumentIds: projectGoalMonumentIds,
          isProject: true,
        },
        timeZone,
        {
          availability,
          forceDayScopedAvailabilityKey: true,
          now: dayOffset === 0 ? baseDate : undefined,
          preloadedWindows: dayWindows,
          userId,
          locationContextId,
          locationContextValue,
          trackFilterCounters: false,
        }
      );

      if (compatibleWindowsResult.windows.length === 0) {
        continue;
      }

      const placement = await placeItemInWindows({
        userId,
        item: placementItem,
        windows: compatibleWindowsResult.windows,
        date: currentDay,
        timeZone,
        client,
        reuseInstanceId: instanceId,
        ignoreProjectIds: new Set([projectId]),
        notBefore: dayOffset === 0 ? baseDate : undefined,
        existingInstances: blockers as ScheduleInstance[],
        blockerCache,
        maxGapCache,
        debugEnabled,
        debugOnFailure,
      });

      if (!("status" in placement)) {
        if (placement.error === "NO_FIT") {
          lastNoFit = { maxGapMs: placement.maxGapMs ?? null };
          continue;
        }
        return {
          ok: false,
          projectId,
          instanceId,
          error: placement.error,
          maxGapMs: placement.maxGapMs ?? null,
        };
      }

      if (placement.error) {
        return {
          ok: false,
          projectId,
          instanceId,
          error: toError(placement.error),
        };
      }

      if (!placement.data) {
        continue;
      }

      return {
        ok: true,
        projectId,
        instanceId,
        instance: placement.data,
        projectItem,
      };
    }

    return {
      ok: false,
      projectId,
      instanceId,
      error: "NO_FIT",
      maxGapMs: lastNoFit?.maxGapMs ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      projectId,
      instanceId,
      error: toError(error),
    };
  }
}
