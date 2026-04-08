import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../types/supabase";
import {
  fetchInstancesForRange,
  type ScheduleInstance,
} from "./instanceRepo";
import {
  fetchAllProjectsMap,
  fetchGoalsForUser,
  fetchProjectSkillsForProjects,
  fetchReadyTasks,
  type GoalSummary,
} from "./repo";
import { buildProjectItems, type ProjectItem } from "./projects";
import type { ProjectLite, TaskLite } from "./weight";
import {
  fetchCompatibleWindowsForItem,
} from "./reschedule";
import {
  placeItemInWindows,
} from "./placement";
import {
  addDaysInTimeZone,
  startOfDayInTimeZone,
} from "./timezone";

type Client = SupabaseClient<Database>;
type PlacementResult = Awaited<ReturnType<typeof placeItemInWindows>>;

const MANUAL_PLACEMENT_FORWARD_HORIZON_DAYS = 1;

export type ManualPlacementCascadeWarning = {
  instanceId: string;
  projectId: string;
  error: string;
};

export type ManualPlacementCascadeResult = {
  warnings: ManualPlacementCascadeWarning[];
};

type ProjectPlacementContext = {
  project: ProjectLite;
  item: ProjectItem;
  skillIds: string[];
  monumentIds: string[] | null;
};

type ProjectItemConstraint = {
  energy: string;
  duration_min: number;
  skillIds?: string[] | null;
  monumentIds?: string[] | null;
  isProject: true;
};

type PlacementRegion = {
  startMs: number;
  endMs: number;
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

function isPlacementSuccess(
  result: PlacementResult
): result is Extract<PlacementResult, { data: ScheduleInstance; error: null }> {
  return Boolean(result && !result.error && result.data);
}

function toProjectConstraintItem(
  projectContext: ProjectPlacementContext
): ProjectItemConstraint {
  return {
    energy: projectContext.item.energy,
    duration_min: projectContext.item.duration_min,
    skillIds: projectContext.skillIds.length > 0 ? projectContext.skillIds : null,
    monumentIds: projectContext.monumentIds,
    isProject: true,
  };
}

function parseInstanceRegion(instance: ScheduleInstance): PlacementRegion | null {
  const startMs = new Date(instance.start_utc ?? "").getTime();
  const endMs = new Date(instance.end_utc ?? "").getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return null;
  }
  if (endMs <= startMs) {
    return null;
  }
  return { startMs, endMs };
}

function parseWindowRegion(window: { startLocal: Date; endLocal: Date }): PlacementRegion | null {
  const startMs = window.startLocal.getTime();
  const endMs = window.endLocal.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return null;
  }
  if (endMs <= startMs) {
    return null;
  }
  return { startMs, endMs };
}

function rangesIntersect(a: PlacementRegion, b: PlacementRegion): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

function mergePlacementRegions(regions: PlacementRegion[]): PlacementRegion[] {
  if (regions.length <= 1) {
    return regions.slice();
  }

  const sorted = regions
    .filter((region) => region.endMs > region.startMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const merged: PlacementRegion[] = [];
  for (const region of sorted) {
    const last = merged[merged.length - 1];
    if (!last || region.startMs > last.endMs) {
      merged.push({ ...region });
      continue;
    }
    last.endMs = Math.max(last.endMs, region.endMs);
  }
  return merged;
}

function regionIntersectsAny(
  region: PlacementRegion,
  regions: PlacementRegion[]
): boolean {
  for (const candidate of regions) {
    if (rangesIntersect(region, candidate)) {
      return true;
    }
  }
  return false;
}

function collectDirectOverlapInstances(params: {
  currentInstances: ScheduleInstance[];
  pivotId: string;
  pivotRegion: PlacementRegion;
}): ScheduleInstance[] {
  return params.currentInstances.filter((instance) => {
    if (instance.id === params.pivotId) return false;
    if (instance.source_type !== "PROJECT") return false;

    const currentRegion = parseInstanceRegion(instance);
    return currentRegion ? rangesIntersect(currentRegion, params.pivotRegion) : false;
  });
}

async function collectLegalCompetitionBuckets(params: {
  userId: string;
  projectContext: ProjectPlacementContext;
  timeZone: string;
  searchStartDay: Date;
  horizonEndDay: Date;
  client: Client;
}): Promise<PlacementRegion[]> {
  const constraintItem = toProjectConstraintItem(params.projectContext);
  const regions: PlacementRegion[] = [];

  for (
    let searchDay = params.searchStartDay;
    searchDay.getTime() <= params.horizonEndDay.getTime();
    searchDay = addDaysInTimeZone(searchDay, 1, params.timeZone)
  ) {
    const compatible = await fetchCompatibleWindowsForItem(
      params.client,
      searchDay,
      constraintItem,
      params.timeZone,
      { userId: params.userId }
    );

    for (const window of compatible.windows) {
      const region = parseWindowRegion(window);
      if (region) {
        regions.push(region);
      }
    }
  }

  return mergePlacementRegions(regions);
}

async function collectAffectedPlacementRegion(params: {
  userId: string;
  pivotId: string;
  timeZone: string;
  client: Client;
  currentInstances: ScheduleInstance[];
  projectContexts: Map<string, ProjectPlacementContext>;
  cascadeStartDay: Date;
  cascadeHorizonEnd: Date;
}): Promise<ScheduleInstance[]> {
  const pivotInstance = params.currentInstances.find(
    (instance) => instance.id === params.pivotId
  );
  if (!pivotInstance || pivotInstance.source_type !== "PROJECT") {
    return [];
  }

  const pivotRegion = parseInstanceRegion(pivotInstance);
  if (!pivotRegion) {
    return [];
  }

  const pivotProjectId = pivotInstance.source_id ?? "";
  const pivotContext = pivotProjectId
    ? params.projectContexts.get(pivotProjectId)
    : null;
  if (!pivotContext) {
    return collectDirectOverlapInstances({
      currentInstances: params.currentInstances,
      pivotId: params.pivotId,
      pivotRegion,
    });
  }

  const pivotCompetitionBuckets = await collectLegalCompetitionBuckets({
    userId: params.userId,
    projectContext: pivotContext,
    timeZone: params.timeZone,
    searchStartDay: params.cascadeStartDay,
    horizonEndDay: params.cascadeHorizonEnd,
    client: params.client,
  });

  if (pivotCompetitionBuckets.length === 0) {
    return [];
  }

  const affected: ScheduleInstance[] = [];

  for (const instance of params.currentInstances) {
    if (instance.id === params.pivotId) continue;
    if (instance.source_type !== "PROJECT") continue;

    const currentRegion = parseInstanceRegion(instance);
    if (currentRegion && regionIntersectsAny(currentRegion, pivotCompetitionBuckets)) {
      affected.push(instance);
      continue;
    }

    const projectId = instance.source_id ?? "";
    const projectContext = projectId
      ? params.projectContexts.get(projectId)
      : null;
    if (!projectContext) {
      continue;
    }

    const instanceCompetitionBuckets = await collectLegalCompetitionBuckets({
      userId: params.userId,
      projectContext,
      timeZone: params.timeZone,
      searchStartDay: params.cascadeStartDay,
      horizonEndDay: params.cascadeHorizonEnd,
      client: params.client,
    });

    if (instanceCompetitionBuckets.length === 0) {
      continue;
    }

    for (const bucket of instanceCompetitionBuckets) {
      if (regionIntersectsAny(bucket, pivotCompetitionBuckets)) {
        affected.push(instance);
        break;
      }
    }
  }

  return affected;
}

async function loadProjectPlacementContexts(
  client: Client,
  userId: string,
  projectIds: string[]
): Promise<Map<string, ProjectPlacementContext>> {
  const uniqueIds = Array.from(
    new Set(projectIds.filter((value) => typeof value === "string" && value.length > 0))
  );
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const [projectsById, tasks, goals, projectSkillIdsByProject] = await Promise.all([
    fetchAllProjectsMap(client),
    fetchReadyTasks(client),
    fetchGoalsForUser(userId, client),
    fetchProjectSkillsForProjects(uniqueIds, client),
  ]);

  const goalWeights = mapGoalWeights(goals);
  const goalMonumentIdById = new Map(
    goals.map((goal) => [goal.id, goal.monumentId ?? null])
  );
  const contexts = new Map<string, ProjectPlacementContext>();
  for (const projectId of uniqueIds) {
    const project = projectsById[projectId];
    if (!project) continue;
    const projectTasks = tasks.filter((task) => task.project_id === projectId);
    const item = buildProjectItems([project], projectTasks, goalWeights)[0];
    if (!item) continue;
    contexts.set(projectId, {
      project,
      item,
      skillIds:
        extractProjectSkillIds(
          projectTasks,
          projectSkillIdsByProject[projectId] ?? []
        ),
      monumentIds: project.goal_id
        ? (() => {
            const monumentId = goalMonumentIdById.get(project.goal_id ?? "");
            return monumentId ? [monumentId] : null;
          })()
        : null,
    });
  }

  return contexts;
}

async function loadCurrentInstancesForRange(
  userId: string,
  rangeStart: Date,
  rangeEnd: Date,
  client: Client
): Promise<ScheduleInstance[]> {
  const response = await fetchInstancesForRange(
    userId,
    rangeStart.toISOString(),
    rangeEnd.toISOString(),
    client,
    { suppressQueryLog: true }
  );
  if (response.error) {
    throw toError(response.error);
  }
  return ((response.data ?? []) as ScheduleInstance[])
    .filter((instance) => instance.status === "scheduled")
    .sort((a, b) => {
      const aStart = Date.parse(a.start_utc ?? "");
      const bStart = Date.parse(b.start_utc ?? "");
      if (aStart !== bStart) return aStart - bStart;
      return (a.id ?? "").localeCompare(b.id ?? "");
    });
}

async function tryPlaceProjectInstance(
  params: {
    userId: string;
    instance: ScheduleInstance;
    projectContext: ProjectPlacementContext;
    timeZone: string;
    searchStartDay: Date;
    horizonEndDay: Date;
    blockingEnd: Date;
    client: Client;
  }
): Promise<
  | { ok: true; startUtc: Date; endUtc: Date }
  | { ok: false; error: string }
> {
  const {
    userId,
    instance,
    projectContext,
    timeZone,
    searchStartDay,
    horizonEndDay,
    blockingEnd,
    client,
  } = params;

  const constraintItem: ProjectItemConstraint = {
    energy: projectContext.item.energy,
    duration_min: projectContext.item.duration_min,
    skillIds: projectContext.skillIds.length > 0 ? projectContext.skillIds : null,
    monumentIds: projectContext.monumentIds,
    isProject: true,
  };

  for (
    let searchDay = searchStartDay;
    searchDay.getTime() <= horizonEndDay.getTime();
    searchDay = addDaysInTimeZone(searchDay, 1, timeZone)
  ) {
    const compatible = await fetchCompatibleWindowsForItem(
      client,
      searchDay,
      constraintItem,
      timeZone,
      { userId }
    );

    if (compatible.windows.length === 0) {
      continue;
    }

    const freshInstances = await loadCurrentInstancesForRange(
      userId,
      searchStartDay,
      addDaysInTimeZone(horizonEndDay, 1, timeZone),
      client
    );

    const placement = await placeItemInWindows({
      userId,
      item: {
        id: projectContext.item.id,
        sourceType: "PROJECT",
        duration_min: projectContext.item.duration_min,
        energy: projectContext.item.energy,
        weight: projectContext.item.weight,
        globalRank: projectContext.item.globalRank ?? null,
        eventName: projectContext.item.name || projectContext.item.id,
      },
      windows: compatible.windows,
      date: searchDay,
      timeZone,
      client,
      reuseInstanceId: instance.id,
      notBefore: blockingEnd,
      existingInstances: freshInstances,
    });

    if (isPlacementSuccess(placement)) {
      const startUtc = new Date(placement.data.start_utc);
      const endUtc = new Date(placement.data.end_utc);
      if (
        Number.isFinite(startUtc.getTime()) &&
        Number.isFinite(endUtc.getTime())
      ) {
        return { ok: true, startUtc, endUtc };
      }
      return { ok: false, error: "INVALID_PLACEMENT_END" };
    }

    const failure = placement.error;
    if (failure !== "NO_FIT") {
      return {
        ok: false,
        error:
          failure instanceof Error
            ? failure.message
            : typeof failure === "string"
              ? failure
              : "PLACEMENT_FAILED",
      };
    }
  }

  return { ok: false, error: "NO_FIT" };
}

async function persistDisplacedProjectInstance(params: {
  client: Client;
  userId: string;
  instanceId: string;
  startUtc: Date;
  endUtc: Date;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await params.client
    .from("schedule_instances")
    .update({
      start_utc: params.startUtc.toISOString(),
      end_utc: params.endUtc.toISOString(),
      locked: true,
    })
    .eq("id", params.instanceId)
    .eq("user_id", params.userId);

  if (error) {
    return {
      ok: false,
      error: toError(error).message,
    };
  }

  return { ok: true };
}

export async function persistManualPlacementCascade(params: {
  userId: string;
  pivotId: string;
  pivotStart: string;
  pivotEnd: string;
  timeZone: string;
  client: Client;
}): Promise<ManualPlacementCascadeResult> {
  const pivotStartDate = new Date(params.pivotStart);
  const pivotEndDate = new Date(params.pivotEnd);
  if (
    Number.isNaN(pivotStartDate.getTime()) ||
    Number.isNaN(pivotEndDate.getTime())
  ) {
    return {
      warnings: [
        {
          instanceId: params.pivotId,
          projectId: "",
          error: "Invalid pivot interval",
        },
      ],
    };
  }

  const cascadeStartDay = startOfDayInTimeZone(pivotStartDate, params.timeZone);
  const cascadeHorizonEnd = addDaysInTimeZone(
    cascadeStartDay,
    MANUAL_PLACEMENT_FORWARD_HORIZON_DAYS,
    params.timeZone
  );
  const initialRangeEnd = addDaysInTimeZone(
    cascadeHorizonEnd,
    1,
    params.timeZone
  );

  const currentInstances = await loadCurrentInstancesForRange(
    params.userId,
    cascadeStartDay,
    initialRangeEnd,
    params.client
  );
  const projectIds = Array.from(
    new Set(
      currentInstances
        .filter(
          (instance) =>
            instance.id !== params.pivotId &&
            instance.source_type === "PROJECT" &&
            typeof instance.source_id === "string" &&
            instance.source_id.trim().length > 0
        )
        .map((instance) => instance.source_id as string)
    )
  );
  const pivotInstance = currentInstances.find((instance) => instance.id === params.pivotId);
  if (pivotInstance?.source_type === "PROJECT" && typeof pivotInstance.source_id === "string") {
    projectIds.push(pivotInstance.source_id);
  }
  const projectContexts = await loadProjectPlacementContexts(
    params.client,
    params.userId,
    projectIds
  );

  const affectedInstances = await collectAffectedPlacementRegion({
    userId: params.userId,
    pivotId: params.pivotId,
    timeZone: params.timeZone,
    client: params.client,
    currentInstances,
    projectContexts,
    cascadeStartDay,
    cascadeHorizonEnd,
  });

  const warnings: ManualPlacementCascadeWarning[] = [];
  let blockingEnd = pivotEndDate;

  for (const instance of affectedInstances) {
    const originalStart = new Date(instance.start_utc ?? "");
    const originalEnd = new Date(instance.end_utc ?? "");
    if (
      Number.isNaN(originalStart.getTime()) ||
      Number.isNaN(originalEnd.getTime())
    ) {
      warnings.push({
        instanceId: instance.id,
        projectId: instance.source_id ?? "",
        error: "Invalid displaced project interval",
      });
      continue;
    }

    if (originalEnd.getTime() <= pivotStartDate.getTime()) {
      continue;
    }

    if (originalStart.getTime() >= blockingEnd.getTime()) {
      break;
    }

    const projectId = instance.source_id ?? "";
    const projectContext = projectContexts.get(projectId);
    if (!projectId || !projectContext) {
      warnings.push({
        instanceId: instance.id,
        projectId,
        error: "Missing project context for displaced project",
      });
      blockingEnd = new Date(Math.max(blockingEnd.getTime(), originalEnd.getTime()));
      continue;
    }

    const searchStartDay = startOfDayInTimeZone(blockingEnd, params.timeZone);
    const placementResult = await tryPlaceProjectInstance({
      userId: params.userId,
      instance,
      projectContext,
      timeZone: params.timeZone,
      searchStartDay,
      horizonEndDay: cascadeHorizonEnd,
      blockingEnd,
      client: params.client,
    });

    if (placementResult.ok) {
      const persistResult = await persistDisplacedProjectInstance({
        client: params.client,
        userId: params.userId,
        instanceId: instance.id,
        startUtc: placementResult.startUtc,
        endUtc: placementResult.endUtc,
      });
      if (!persistResult.ok) {
        warnings.push({
          instanceId: instance.id,
          projectId,
          error: persistResult.error,
        });
        blockingEnd = new Date(Math.max(blockingEnd.getTime(), originalEnd.getTime()));
        continue;
      }
      blockingEnd = placementResult.endUtc;
      continue;
    }

    warnings.push({
      instanceId: instance.id,
      projectId,
      error: placementResult.error,
    });
    blockingEnd = new Date(Math.max(blockingEnd.getTime(), originalEnd.getTime()));
  }

  return { warnings };
}
