import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  createClient,
  type PostgrestError,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2?dts";
import type { Database } from "../../../types/supabase.ts";
import {
  addDaysInTimeZone,
  normalizeTimeZone,
  setTimeInTimeZone,
  startOfDayInTimeZone,
  weekdayInTimeZone,
} from "../../../src/lib/scheduler/timezone.ts";

type Client = SupabaseClient<Database>;
type ScheduleInstance =
  Database["public"]["Tables"]["schedule_instances"]["Row"];

const START_GRACE_MIN = 1;
const DEFAULT_PROJECT_DURATION_MIN = 60;
const ENERGY_ORDER = [
  "NO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "ULTRA",
  "EXTREME",
] as const;
const BASE_LOOKAHEAD_DAYS = 28;
const LOOKAHEAD_PER_ITEM_DAYS = 7;
const MAX_LOOKAHEAD_DAYS = 365;

serve(async (req) => {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) {
      return new Response("missing userId", { status: 400 });
    }

    const supabaseUrl =
      Deno.env.get("DENO_ENV_SUPABASE_URL") ??
      Deno.env.get("SUPABASE_URL") ??
      "";
    const serviceRoleKey =
      Deno.env.get("DENO_ENV_SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      "";

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response("missing supabase credentials", { status: 500 });
    }

    const supabase = createClient<Database>(supabaseUrl, serviceRoleKey);
    const now = new Date();

    const missedResult = await markMissedAndQueue(supabase, userId, now);
    if (missedResult.error) {
      console.error("markMissedAndQueue error", missedResult.error);
      return new Response(JSON.stringify(missedResult), { status: 500 });
    }

    const timeZoneValue = await resolveUserTimeZone(supabase, userId);
    const scheduleResult = await scheduleBacklog(
      supabase,
      userId,
      now,
      timeZoneValue
    );
    if (scheduleResult.error) {
      console.error("scheduleBacklog error", scheduleResult.error);
      return new Response(JSON.stringify(scheduleResult), { status: 500 });
    }

    const cleanupResult = await cleanupOldHabitInstances(supabase, userId, now);
    if (cleanupResult?.error) {
      console.error("cleanupOldHabitInstances error", cleanupResult.error);
    }

    return new Response(JSON.stringify(scheduleResult), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("scheduler_cron failure", error);
    return new Response("internal error", { status: 500 });
  }
});

async function resolveUserTimeZone(client: Client, userId: string) {
  try {
    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("timezone")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profileError && profile?.timezone) {
      const tz = String(profile.timezone).trim();
      if (tz) return tz;
    }
  } catch (error) {
    console.error("resolveUserTimeZone profile lookup failed", error);
  }

  try {
    const { data, error } = await client.auth.admin.getUserById(userId);
    if (error) {
      console.error("resolveUserTimeZone error", error);
      return null;
    }
    const user = data?.user ?? null;
    if (!user) return null;
    const meta =
      ((user.user_metadata ?? user.raw_user_meta_data) as
        | Record<string, unknown>
        | null
        | undefined) ?? {};
    const candidates = [meta?.timezone, meta?.timeZone, meta?.tz];
    for (const value of candidates) {
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }
  } catch (error) {
    console.error("resolveUserTimeZone failure", error);
  }
  return null;
}

async function markMissedAndQueue(client: Client, userId: string, now: Date) {
  const cutoff = new Date(
    now.getTime() - START_GRACE_MIN * 60_000
  ).toISOString();
  return await client
    .from("schedule_instances")
    .update({ status: "missed" })
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .lt("start_utc", cutoff);
}

async function cleanupOldHabitInstances(
  client: Client,
  userId: string,
  now: Date
) {
  const cutoff = new Date(
    now.getTime() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();
  return await client
    .from("schedule_instances")
    .delete()
    .eq("user_id", userId)
    .eq("source_type", "HABIT")
    .eq("status", "completed")
    .lt("end_utc", cutoff);
}

async function scheduleBacklog(
  client: Client,
  userId: string,
  baseDate: Date,
  timeZoneValue?: string | null
) {
  throw new Error("[SCHEDULER_ENTRY] reschedule.ts rebuild path reached");

  const missed = await fetchMissedInstances(client, userId);
  if (missed.error) return { placed: [], failures: [], error: missed.error };

  const tasks = await fetchReadyTasks(client, userId);
  const projects = await fetchProjectsMap(client, userId);
  const goalWeights = await fetchGoalWeights(client, userId);
  const projectItems = buildProjectItems(
    Object.values(projects),
    tasks,
    goalWeights
  );

  const projectMap = new Map(
    projectItems.map((project) => [project.id, project])
  );

  type QueueItem = {
    id: string;
    sourceType: "PROJECT";
    duration_min: number;
    energy: string;
    weight: number;
    goalWeight: number;
    instanceId?: string | null;
    eventName: string;
  };

  const timeZone = normalizeTimeZone(timeZoneValue);
  const baseStart = startOfDayInTimeZone(baseDate, timeZone);
  const queue: QueueItem[] = [];
  const failures: { itemId: string; reason: string; detail?: unknown }[] = [];
  const seenMissedProjects = new Set<string>();
  const queueProjectIds = new Set<string>();

  for (const instance of missed.data ?? []) {
    if (instance.source_type !== "PROJECT") continue;
    if (seenMissedProjects.has(instance.source_id)) {
      const cancel = await client
        .from("schedule_instances")
        .update({ status: "canceled" })
        .eq("id", instance.id);

      if (cancel.error) {
        failures.push({
          itemId: instance.source_id,
          reason: "error",
          detail: cancel.error,
        });
      }

      continue;
    }

    seenMissedProjects.add(instance.source_id);
    const def = projectMap.get(instance.source_id);
    if (!def) continue;
    queueProjectIds.add(def.id);

    let duration = Number(def.duration_min ?? 0);
    if (!Number.isFinite(duration) || duration <= 0) {
      const fallback = Number(instance.duration_min ?? 0);
      if (Number.isFinite(fallback) && fallback > 0) {
        duration = fallback;
      } else {
        duration = DEFAULT_PROJECT_DURATION_MIN;
      }
    }

    const resolvedEnergy = def.energy
      ? String(def.energy)
      : instance.energy_resolved ?? "NO";

    const weight =
      typeof instance.weight_snapshot === "number"
        ? instance.weight_snapshot
        : def.weight ?? 0;

    queue.push({
      id: def.id,
      sourceType: "PROJECT",
      duration_min: duration,
      energy: (resolvedEnergy ?? "NO").toUpperCase(),
      weight,
      goalWeight: def.goalWeight ?? 0,
      instanceId: instance.id,
      eventName: def.name || def.id,
    });
  }

  const rangeEnd = addDaysInTimeZone(baseStart, 28, timeZone);
  const dedupe = await dedupeScheduledProjects(
    client,
    userId,
    baseStart,
    rangeEnd,
    queueProjectIds
  );

  if (dedupe.error) {
    return { placed: [], failures, error: dedupe.error };
  }

  if (dedupe.failures.length > 0) {
    failures.push(...dedupe.failures);
  }

  const queueByProject = new Map(queue.map((item) => [item.id, item]));

  for (const project of projectItems) {
    const duration = Number(project.duration_min ?? 0);
    if (!Number.isFinite(duration) || duration <= 0) continue;
    const energy = (project.energy ?? "NO").toString().toUpperCase();
    const weight = project.weight ?? 0;
    const existing = queueByProject.get(project.id);
    const reuse = dedupe.keepers.get(project.id);
    if (existing) {
      existing.duration_min = duration;
      existing.energy = energy;
      existing.weight = weight;
      existing.goalWeight = project.goalWeight ?? 0;
      if (!existing.instanceId && reuse) {
        existing.instanceId = reuse.id;
      }
    } else {
      const entry = {
        id: project.id,
        sourceType: "PROJECT" as const,
        duration_min: duration,
        energy,
        weight,
        goalWeight: project.goalWeight ?? 0,
        instanceId: reuse?.id,
        eventName: project.name || project.id,
      };
      queue.push(entry);
      queueByProject.set(project.id, entry);
    }
  }

  for (const [projectId, inst] of dedupe.keepers) {
    if (queueByProject.has(projectId)) continue;
    const duration = Number(inst.duration_min ?? 0);
    if (!Number.isFinite(duration) || duration <= 0) continue;
    const energy = (inst.energy_resolved ?? "NO").toString().toUpperCase();
    const weight =
      typeof inst.weight_snapshot === "number" ? inst.weight_snapshot : 0;
    const fallbackProject = projectMap.get(projectId);
    const entry = {
      id: projectId,
      sourceType: "PROJECT" as const,
      duration_min: duration,
      energy,
      weight: fallbackProject?.weight ?? weight,
      goalWeight: fallbackProject?.goalWeight ?? 0,
      instanceId: inst.id,
      eventName: fallbackProject?.name ?? projectId,
    };
    queue.push(entry);
    queueByProject.set(projectId, entry);
  }

  const instanceIdToProject = new Map<string, string>();
  for (const item of queue) {
    if (item.instanceId) {
      instanceIdToProject.set(item.instanceId, item.id);
    }
  }

  const failedInstanceIds = new Set<string>();
  for (const [instanceId, projectId] of instanceIdToProject) {
    const { error } = await client
      .from("schedule_instances")
      .update({ status: "canceled" })
      .eq("id", instanceId);

    if (error) {
      failures.push({ itemId: projectId, reason: "error", detail: error });
      failedInstanceIds.add(instanceId);
    }
  }

  if (failedInstanceIds.size > 0) {
    const filteredQueue = queue.filter(
      (item) => !item.instanceId || !failedInstanceIds.has(item.instanceId)
    );
    queue.length = 0;
    queue.push(...filteredQueue);
  }

  queue.sort((a, b) => {
    const goalWeightDiff = b.goalWeight - a.goalWeight;
    if (goalWeightDiff !== 0) return goalWeightDiff;
    const weightDiff = b.weight - a.weight;
    if (weightDiff !== 0) return weightDiff;
    const energyDiff = energyIndex(b.energy) - energyIndex(a.energy);
    if (energyDiff !== 0) return energyDiff;
    return a.id.localeCompare(b.id);
  });

  const placed: ScheduleInstance[] = [];
  const windowAvailability = new Map<string, Date>();
  const windowCache = new Map<string, WindowRecord[]>();
  const lookaheadDays = Math.min(
    MAX_LOOKAHEAD_DAYS,
    BASE_LOOKAHEAD_DAYS + queue.length * LOOKAHEAD_PER_ITEM_DAYS
  );

  for (const item of queue) {
    let scheduled = false;
    for (let offset = 0; offset < lookaheadDays && !scheduled; offset += 1) {
      const day = addDaysInTimeZone(baseStart, offset, timeZone);
      const windows = await fetchCompatibleWindowsForItem(
        client,
        userId,
        day,
        item,
        timeZone,
        {
          availability: windowAvailability,
          now: offset === 0 ? baseDate : undefined,
          cache: windowCache,
        }
      );
      if (windows.length === 0) continue;

      const placedInstance = await placeItemInWindows(
        client,
        userId,
        item,
        windows,
        item.instanceId,
        queueProjectIds,
        offset === 0 ? baseDate : undefined
      );
      if (placedInstance) {
        placed.push(placedInstance);
        const placementWindow = findPlacementWindow(windows, placedInstance);
        if (placementWindow?.key) {
          windowAvailability.set(
            placementWindow.key,
            new Date(placedInstance.end_utc)
          );
        }
        scheduled = true;
      }
    }

    if (!scheduled) {
      failures.push({ itemId: item.id, reason: "NO_WINDOW" });
    }
  }

  return { placed, failures, error: null as const };
}

async function fetchMissedInstances(client: Client, userId: string) {
  return await client
    .from("schedule_instances")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "missed")
    .order("weight_snapshot", { ascending: false });
}

type TaskLite = {
  id: string;
  name: string;
  priority: string;
  stage: string;
  duration_min: number;
  energy: string | null;
  project_id?: string | null;
  skill_icon?: string | null;
};

type ProjectLite = {
  id: string;
  name?: string;
  priority: string;
  stage: string;
  energy?: string | null;
  duration_min?: number | null;
  goal_id?: string | null;
  due_date?: string | null;
};

type ProjectItem = ProjectLite & {
  name: string;
  duration_min: number;
  energy: string;
  weight: number;
  taskCount: number;
  skill_icon?: string | null;
  goalWeight: number;
};

type PriorityEnergyLookups = {
  priority: Record<string, string>;
  energy: Record<string, string>;
};

let lookupCache: PriorityEnergyLookups | null = null;

async function getLookupMaps(client: Client): Promise<PriorityEnergyLookups> {
  if (lookupCache) return lookupCache;
  const [priorityRes, energyRes] = await Promise.all([
    client.from("priority").select("id, name"),
    client.from("energy").select("id, name"),
  ]);

  const priority: Record<string, string> = {};
  if (priorityRes.error) {
    console.warn("priority lookup error", priorityRes.error);
  } else {
    for (const row of priorityRes.data ?? []) {
      if (!row?.id || typeof row.name !== "string") continue;
      priority[String(row.id)] = row.name.toUpperCase();
    }
  }
  const energy: Record<string, string> = {};
  if (energyRes.error) {
    console.warn("energy lookup error", energyRes.error);
  } else {
    for (const row of energyRes.data ?? []) {
      if (!row?.id || typeof row.name !== "string") continue;
      energy[String(row.id)] = row.name.toUpperCase();
    }
  }
  lookupCache = { priority, energy };
  return lookupCache;
}

async function fetchReadyTasks(
  client: Client,
  userId: string
): Promise<TaskLite[]> {
  const columns = [
    "id",
    "name",
    "priority",
    "stage",
    "duration_min",
    "energy",
    "project_id",
    "skills(icon)",
  ].join(", ");

  const [lookups, { data, error }] = await Promise.all([
    getLookupMaps(client),
    client.from("tasks").select(columns).eq("user_id", userId),
  ]);

  if (error) {
    console.error("fetchReadyTasks error", error);
    return [];
  }

  return (data ?? []).map((task) => ({
    id: task.id,
    name: task.name ?? "",
    priority: resolvePriorityValue(task, lookups),
    stage: task.stage ?? "PREPARE",
    duration_min: task.duration_min ?? 0,
    energy: resolveEnergyValue(task, lookups),
    project_id: task.project_id ?? null,
    skill_icon: ((task.skills as { icon?: string | null } | null)?.icon ??
      null) as string | null,
  }));
}

async function fetchProjectsMap(
  client: Client,
  userId: string
): Promise<Record<string, ProjectLite>> {
  const columns = [
    "id",
    "name",
    "priority",
    "stage",
    "energy",
    "duration_min",
    "goal_id",
    "due_date",
  ].join(", ");

  const [lookups, { data, error }] = await Promise.all([
    getLookupMaps(client),
    client
      .from("projects")
      .select(columns)
      .eq("user_id", userId)
      .is("completed_at", null),
  ]);

  if (error) {
    console.error("fetchProjectsMap error", error);
    return {};
  }

  const map: Record<string, ProjectLite> = {};
  for (const project of data ?? []) {
    map[project.id] = {
      id: project.id,
      name: project.name ?? "",
      priority: resolvePriorityValue(project, lookups),
      stage: project.stage ?? "RESEARCH",
      energy: resolveEnergyValue(project, lookups),
      duration_min: project.duration_min ?? null,
      goal_id: project.goal_id ?? null,
      due_date: project.due_date ?? null,
    };
  }
  return map;
}

function resolvePriorityValue(
  record: { priority?: string | number | null },
  lookups: PriorityEnergyLookups
): string {
  if (typeof record.priority === "number") {
    const value = lookups.priority[String(record.priority)];
    if (value) return value;
  }
  if (typeof record.priority === "string") {
    const trimmed = record.priority.trim();
    if (!trimmed) return "NO";
    if (/^\d+$/.test(trimmed)) {
      const value = lookups.priority[trimmed];
      if (value) return value;
    }
    return trimmed.toUpperCase();
  }
  return "NO";
}

function resolveEnergyValue(
  record: { energy?: string | number | null },
  lookups: PriorityEnergyLookups
): string {
  if (typeof record.energy === "number") {
    const value = lookups.energy[String(record.energy)];
    if (value) return value;
  }
  if (typeof record.energy === "string") {
    const trimmed = record.energy.trim();
    if (!trimmed) return "NO";
    if (/^\d+$/.test(trimmed)) {
      const value = lookups.energy[trimmed];
      if (value) return value;
    }
    return trimmed.toUpperCase();
  }
  return "NO";
}

async function fetchGoalWeights(
  client: Client,
  userId: string
): Promise<Record<string, number>> {
  const { data, error } = await client
    .from("goals")
    .select("id, weight")
    .eq("user_id", userId);

  if (error) {
    console.error("fetchGoalWeights error", error);
    return {};
  }

  const weights: Record<string, number> = {};
  for (const goal of data ?? []) {
    if (!goal?.id) continue;
    const value = Number(goal.weight ?? 0);
    weights[goal.id] = Number.isFinite(value) ? value : 0;
  }
  return weights;
}

function buildProjectItems(
  projects: ProjectLite[],
  tasks: TaskLite[],
  goalWeights: Record<string, number> = {}
): ProjectItem[] {
  const items: ProjectItem[] = [];
  const getGoalWeight = (goalId?: string | null) => {
    if (!goalId) return 0;
    const value = goalWeights[goalId];
    return Number.isFinite(value) ? Number(value) : 0;
  };
  for (const project of projects) {
    const related = tasks.filter((task) => task.project_id === project.id);
    const projectDuration = Number(project.duration_min ?? 0);
    let duration =
      Number.isFinite(projectDuration) && projectDuration > 0
        ? projectDuration
        : 0;

    if (!duration && related.length > 0) {
      const relatedDuration = related.reduce(
        (sum, task) => sum + task.duration_min,
        0
      );
      if (relatedDuration > 0) {
        duration = relatedDuration;
      }
    }

    if (!duration) {
      duration = DEFAULT_PROJECT_DURATION_MIN;
    }

    const normalizeEnergy = (value?: string | null) => {
      const upper = (value ?? "").toUpperCase();
      return ENERGY_ORDER.includes(upper as (typeof ENERGY_ORDER)[number])
        ? (upper as string)
        : "NO";
    };

    const energy = related.reduce<string>((current, task) => {
      const candidate = normalizeEnergy(task.energy);
      if (!current) return candidate;
      return energyIndex(candidate) > energyIndex(current)
        ? candidate
        : current;
    }, normalizeEnergy(project.energy));

    const weight = projectWeight(
      project,
      related.reduce((sum, task) => sum + taskWeight(task), 0)
    );

    const skill_icon =
      related.find((task) => task.skill_icon)?.skill_icon ?? null;

    items.push({
      ...project,
      name: project.name ?? "",
      duration_min: duration,
      energy,
      weight,
      taskCount: related.length,
      skill_icon,
      goalWeight: getGoalWeight(project.goal_id),
    });
  }
  return items;
}

async function fetchInstancesForRange(
  client: Client,
  userId: string,
  startUTC: string,
  endUTC: string
) {
  return await client
    .from("schedule_instances")
    .select("*")
    .eq("user_id", userId)
    .neq("status", "canceled")
    .or(
      `and(start_utc.gte.${startUTC},start_utc.lt.${endUTC}),and(start_utc.lt.${startUTC},end_utc.gt.${startUTC})`
    )
    .order("start_utc", { ascending: true });
}

async function dedupeScheduledProjects(
  client: Client,
  userId: string,
  baseStart: Date,
  rangeEnd: Date,
  projectsToReset: Set<string>
): Promise<{
  scheduled: Set<string>;
  keepers: Map<string, ScheduleInstance>;
  failures: { itemId: string; reason: string; detail?: unknown }[];
  error: PostgrestError | null;
}> {
  const response = await fetchInstancesForRange(
    client,
    userId,
    baseStart.toISOString(),
    rangeEnd.toISOString()
  );

  if (response.error) {
    return {
      scheduled: new Set<string>(),
      keepers: new Map<string, ScheduleInstance>(),
      failures: [],
      error: response.error,
    };
  }

  const keepers = new Map<string, ScheduleInstance>();
  const extras: ScheduleInstance[] = [];

  for (const inst of response.data ?? []) {
    if (inst.source_type !== "PROJECT") continue;

    if (projectsToReset.has(inst.source_id) && inst.status === "scheduled") {
      extras.push(inst);
      continue;
    }

    if (inst.status !== "scheduled") continue;

    const existing = keepers.get(inst.source_id);
    if (!existing) {
      keepers.set(inst.source_id, inst);
      continue;
    }

    const existingStart = new Date(existing.start_utc).getTime();
    const instStart = new Date(inst.start_utc).getTime();

    if (instStart < existingStart) {
      extras.push(existing);
      keepers.set(inst.source_id, inst);
    } else {
      extras.push(inst);
    }
  }

  const failures: { itemId: string; reason: string; detail?: unknown }[] = [];

  for (const extra of extras) {
    const { error } = await client
      .from("schedule_instances")
      .update({ status: "canceled" })
      .eq("id", extra.id);

    if (error) {
      failures.push({
        itemId: extra.source_id,
        reason: "error",
        detail: error,
      });
    }
  }

  const scheduled = new Set<string>();
  for (const key of keepers.keys()) {
    scheduled.add(key);
  }

  return { scheduled, keepers, failures, error: null };
}

async function fetchCompatibleWindowsForItem(
  client: Client,
  userId: string,
  date: Date,
  item: { energy: string; duration_min: number },
  timeZone: string,
  options?: {
    now?: Date;
    availability?: Map<string, Date>;
    cache?: Map<string, WindowRecord[]>;
  }
) {
  const cacheKey = dateCacheKey(date);
  const cache = options?.cache;
  let windows: WindowRecord[];
  if (cache?.has(cacheKey)) {
    windows = cache.get(cacheKey) ?? [];
  } else {
    windows = await fetchWindowsForDate(client, userId, date, timeZone);
    cache?.set(cacheKey, windows);
  }
  const itemIdx = energyIndex(item.energy);
  const now = options?.now ? new Date(options.now) : null;
  const nowMs = now?.getTime();
  const durationMs = Math.max(0, item.duration_min) * 60_000;
  const availability = options?.availability;

  const compatible: Array<{
    id: string;
    key: string;
    startLocal: Date;
    endLocal: Date;
    availableStartLocal: Date;
    energyIdx: number;
  }> = [];

  for (const window of windows) {
    const windowKind =
      typeof window.window_kind === "string"
        ? window.window_kind.toUpperCase().trim()
        : "DEFAULT";
    if (windowKind === "BREAK" || windowKind === "PRACTICE") {
      continue;
    }
    const energyRaw = window.energy
      ? String(window.energy).toUpperCase().trim()
      : "";
    const hasEnergyLabel = energyRaw.length > 0;
    const energyLabel = hasEnergyLabel ? energyRaw : null;
    const energyIdx = hasEnergyLabel
      ? energyIndex(energyLabel, { fallback: ENERGY_ORDER.length })
      : ENERGY_ORDER.length;
    if (hasEnergyLabel && energyIdx >= ENERGY_ORDER.length) continue;
    if (energyIdx < itemIdx) continue;

    const startLocal = resolveWindowStart(window, date, timeZone);
    const endLocal = resolveWindowEnd(window, date, timeZone);
    const key = windowKey(window.id, startLocal);
    const startMs = startLocal.getTime();
    const endMs = endLocal.getTime();

    if (typeof nowMs === "number" && endMs <= nowMs) continue;

    const baseAvailableStartMs =
      typeof nowMs === "number" ? Math.max(startMs, nowMs) : startMs;
    const carriedStartMs = availability?.get(key)?.getTime();
    const availableStartMs =
      typeof carriedStartMs === "number"
        ? Math.max(baseAvailableStartMs, carriedStartMs)
        : baseAvailableStartMs;
    if (availableStartMs >= endMs) continue;
    if (availableStartMs + durationMs > endMs) continue;

    const availableStartLocal = new Date(availableStartMs);
    if (availability) {
      const existing = availability.get(key);
      if (!existing || existing.getTime() !== availableStartMs) {
        availability.set(key, availableStartLocal);
      }
    }

    compatible.push({
      id: window.id,
      key,
      startLocal,
      endLocal,
      availableStartLocal,
      energyIdx,
    });
  }

  compatible.sort((a, b) => {
    const startDiff =
      a.availableStartLocal.getTime() - b.availableStartLocal.getTime();
    if (startDiff !== 0) return startDiff;
    const energyDiff = a.energyIdx - b.energyIdx;
    if (energyDiff !== 0) return energyDiff;
    const rawStartDiff = a.startLocal.getTime() - b.startLocal.getTime();
    if (rawStartDiff !== 0) return rawStartDiff;
    return a.id.localeCompare(b.id);
  });

  return compatible.map((window) => ({
    id: window.id,
    key: window.key,
    startLocal: window.startLocal,
    endLocal: window.endLocal,
    availableStartLocal: window.availableStartLocal,
  }));
}

type WindowRecord = {
  id: string;
  label: string;
  energy: string;
  start_local: string;
  end_local: string;
  days: number[] | null;
  fromPrevDay?: boolean;
  window_kind?: string | null;
};

async function fetchWindowsForDate(
  client: Client,
  userId: string,
  date: Date,
  timeZone: string
) {
  const weekday = weekdayInTimeZone(date, timeZone);
  const prevWeekday = (weekday + 6) % 7;

  const columns =
    "id, label, energy, start_local, end_local, days, window_kind";

  const [
    { data: today, error: errToday },
    { data: prev, error: errPrev },
    { data: recurring, error: errRecurring },
  ] = await Promise.all([
    client
      .from("windows")
      .select(columns)
      .eq("user_id", userId)
      .contains("days", [weekday]),
    client
      .from("windows")
      .select(columns)
      .eq("user_id", userId)
      .contains("days", [prevWeekday]),
    client
      .from("windows")
      .select(columns)
      .eq("user_id", userId)
      .is("days", null),
  ]);

  if (errToday) console.error("fetchWindowsForDate error (today)", errToday);
  if (errPrev) console.error("fetchWindowsForDate error (prev)", errPrev);
  if (errRecurring)
    console.error("fetchWindowsForDate error (recurring)", errRecurring);

  const crosses = (window: WindowRecord) => {
    const [sh = 0, sm = 0] = window.start_local.split(":").map(Number);
    const [eh = 0, em = 0] = window.end_local.split(":").map(Number);
    return eh < sh || (eh === sh && em < sm);
  };

  const always = recurring ?? [];

  const base = new Map<string, WindowRecord>();
  for (const window of [...(today ?? []), ...always]) {
    if (!base.has(window.id)) {
      base.set(window.id, window);
    }
  }

  const prevCross = [...(prev ?? []), ...always]
    .filter(crosses)
    .map((window) => ({ ...window, fromPrevDay: true as const }));

  return [...base.values(), ...prevCross];
}

async function placeItemInWindows(
  client: Client,
  userId: string,
  item: {
    id: string;
    sourceType: "PROJECT";
    duration_min: number;
    energy: string;
    weight: number;
    eventName: string;
  },
  windows: Array<{
    id: string;
    startLocal: Date;
    endLocal: Date;
    availableStartLocal?: Date;
    key?: string;
  }>,
  reuseInstanceId: string | null | undefined,
  ignoreProjectIds?: Set<string>,
  notBefore?: Date
): Promise<ScheduleInstance | null> {
  const notBeforeMs = notBefore ? notBefore.getTime() : null;
  const durationMs = Math.max(0, item.duration_min) * 60000;

  for (const window of windows) {
    const windowStart = new Date(
      window.availableStartLocal ?? window.startLocal
    );
    const windowEnd = new Date(window.endLocal);

    const windowStartMs = windowStart.getTime();
    const windowEndMs = windowEnd.getTime();

    if (typeof notBeforeMs === "number" && windowEndMs <= notBeforeMs) {
      continue;
    }

    const startMs =
      typeof notBeforeMs === "number"
        ? Math.max(windowStartMs, notBeforeMs)
        : windowStartMs;
    const start = new Date(startMs);

    const { data: taken, error } = await client
      .from("schedule_instances")
      .select("*")
      .eq("user_id", userId)
      .lt("start_utc", windowEnd.toISOString())
      .gt("end_utc", start.toISOString())
      .neq("status", "canceled");

    if (error) {
      console.error("fetchInstancesForRange error", error);
      continue;
    }

    const filtered = (taken ?? []).filter((instance) => {
      if (instance.id === reuseInstanceId) return false;
      if (ignoreProjectIds && instance.source_type === "PROJECT") {
        const projectId = instance.source_id ?? "";
        if (projectId && ignoreProjectIds.has(projectId)) {
          return false;
        }
      }
      return true;
    });

    const sorted = filtered.sort(
      (a, b) =>
        new Date(a.start_utc).getTime() - new Date(b.start_utc).getTime()
    );

    let cursorMs = startMs;

    for (const block of sorted) {
      const blockStartMs = new Date(block.start_utc).getTime();
      const blockEndMs = new Date(block.end_utc).getTime();

      if (typeof notBeforeMs === "number" && blockEndMs <= notBeforeMs) {
        continue;
      }

      const effectiveBlockStartMs =
        typeof notBeforeMs === "number"
          ? Math.max(blockStartMs, notBeforeMs)
          : blockStartMs;

      if (cursorMs + durationMs <= effectiveBlockStartMs) {
        const startDate = new Date(cursorMs);
        return await persistPlacement(
          client,
          userId,
          item,
          window.id,
          startDate,
          item.duration_min,
          reuseInstanceId,
          item.eventName
        );
      }

      if (blockEndMs > cursorMs) {
        cursorMs = blockEndMs;
        if (typeof notBeforeMs === "number" && cursorMs < notBeforeMs) {
          cursorMs = notBeforeMs;
        }
      }
    }

    if (cursorMs + durationMs <= windowEndMs) {
      const startDate = new Date(cursorMs);
      return await persistPlacement(
        client,
        userId,
        item,
        window.id,
        startDate,
        item.duration_min,
        reuseInstanceId,
        item.eventName
      );
    }
  }

  return null;
}

async function persistPlacement(
  client: Client,
  userId: string,
  item: {
    id: string;
    sourceType: "PROJECT";
    duration_min: number;
    energy: string;
    weight: number;
    eventName: string;
  },
  windowId: string,
  start: Date,
  durationMin: number,
  reuseInstanceId?: string | null,
  eventName?: string
): Promise<ScheduleInstance | null> {
  const startUTC = start.toISOString();
  const endUTC = addMin(start, durationMin).toISOString();

  if (reuseInstanceId) {
    return await rescheduleInstance(client, reuseInstanceId, {
      windowId,
      startUTC,
      endUTC,
      durationMin,
      weightSnapshot: item.weight,
      energyResolved: item.energy,
      eventName: eventName ?? item.eventName,
    });
  }

  return await createInstance(
    client,
    userId,
    item,
    windowId,
    startUTC,
    endUTC,
    durationMin,
    eventName ?? item.eventName
  );
}

async function createInstance(
  client: Client,
  userId: string,
  item: {
    id: string;
    sourceType: "PROJECT";
    duration_min: number;
    energy: string;
    weight: number;
    eventName: string;
  },
  windowId: string,
  startUTC: string,
  endUTC: string,
  durationMin: number,
  eventName?: string
) {
  const { data, error } = await client
    .from("schedule_instances")
    .insert({
      user_id: userId,
      source_type: "PROJECT",
      source_id: item.id,
      window_id: windowId,
      start_utc: startUTC,
      end_utc: endUTC,
      duration_min: durationMin,
      status: "scheduled",
      weight_snapshot: item.weight,
      energy_resolved: item.energy,
      event_name: eventName ?? item.eventName,
    })
    .select("*")
    .single();

  if (error) {
    console.error("createInstance error", error);
    return null;
  }

  return data;
}

async function rescheduleInstance(
  client: Client,
  id: string,
  input: {
    windowId: string;
    startUTC: string;
    endUTC: string;
    durationMin: number;
    weightSnapshot: number;
    energyResolved: string;
    eventName?: string;
  }
): Promise<ScheduleInstance | null> {
  const { data, error } = await client
    .from("schedule_instances")
    .update({
      window_id: input.windowId,
      start_utc: input.startUTC,
      end_utc: input.endUTC,
      duration_min: input.durationMin,
      status: "scheduled",
      weight_snapshot: input.weightSnapshot,
      energy_resolved: input.energyResolved,
      completed_at: null,
      event_name: input.eventName ?? null,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("rescheduleInstance error", error);
    return null;
  }

  return data;
}

function findPlacementWindow(
  windows: Array<{
    id: string;
    startLocal: Date;
    endLocal: Date;
    key?: string;
  }>,
  placement: ScheduleInstance
) {
  if (!placement.window_id) return null;
  const start = new Date(placement.start_utc);
  const match = windows.find(
    (window) =>
      window.id === placement.window_id && isWithinWindow(start, window)
  );
  if (match) return match;
  return windows.find((window) => window.id === placement.window_id) ?? null;
}

function isWithinWindow(
  start: Date,
  window: { startLocal: Date; endLocal: Date }
) {
  return start >= window.startLocal && start < window.endLocal;
}

function windowKey(windowId: string, startLocal: Date) {
  return `${windowId}:${startLocal.toISOString()}`;
}

function dateCacheKey(date: Date) {
  return date.toISOString();
}

function resolveWindowStart(
  window: WindowRecord,
  date: Date,
  timeZone: string
) {
  const [hour = 0, minute = 0] = window.start_local.split(":").map(Number);
  const base = window.fromPrevDay
    ? addDaysInTimeZone(date, -1, timeZone)
    : date;
  return setTimeInTimeZone(base, timeZone, hour, minute);
}

function resolveWindowEnd(window: WindowRecord, date: Date, timeZone: string) {
  const [hour = 0, minute = 0] = window.end_local.split(":").map(Number);
  let end = setTimeInTimeZone(date, timeZone, hour, minute);
  const start = resolveWindowStart(window, date, timeZone);
  if (end <= start) {
    const nextDay = addDaysInTimeZone(date, 1, timeZone);
    end = setTimeInTimeZone(nextDay, timeZone, hour, minute);
  }
  return end;
}

function addMin(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function energyIndex(level?: string | null, options?: { fallback?: number }) {
  const fallback = options?.fallback ?? -1;
  if (!level) return fallback;
  const upper = level.toUpperCase();
  const index = ENERGY_ORDER.indexOf(upper as (typeof ENERGY_ORDER)[number]);
  return index === -1 ? fallback : index;
}

const TASK_PRIORITY_WEIGHT: Record<string, number> = {
  NO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  Critical: 4,
  "Ultra-Critical": 5,
};

const TASK_STAGE_WEIGHT: Record<string, number> = {
  Prepare: 30,
  Produce: 20,
  Perfect: 10,
};

const PROJECT_PRIORITY_WEIGHT: Record<string, number> = {
  NO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  Critical: 4,
  "Ultra-Critical": 5,
};

const PROJECT_STAGE_WEIGHT: Record<string, number> = {
  RESEARCH: 50,
  TEST: 40,
  BUILD: 30,
  REFINE: 20,
  RELEASE: 10,
};

const DAY_IN_MS = 86_400_000;

type DueDateBoostOptions = {
  linearWindowDays?: number;
  linearMax?: number;
  surgeWindowDays?: number;
  surgeMax?: number;
  overdueBonusPerDay?: number;
  overdueMax?: number;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function dueDateUrgencyBoost(
  dueDate?: string | null,
  options: DueDateBoostOptions = {}
): number {
  if (!dueDate) return 0;
  const parsed = Date.parse(dueDate);
  if (Number.isNaN(parsed)) return 0;
  const config: Required<DueDateBoostOptions> = {
    linearWindowDays: options.linearWindowDays ?? 30,
    linearMax: options.linearMax ?? 200,
    surgeWindowDays: options.surgeWindowDays ?? 3,
    surgeMax: options.surgeMax ?? 350,
    overdueBonusPerDay: options.overdueBonusPerDay ?? 125,
    overdueMax: options.overdueMax ?? 350,
  };
  const now = Date.now();
  const diffDays = (parsed - now) / DAY_IN_MS;
  let linearBoost = 0;
  if (diffDays <= config.linearWindowDays) {
    const ratio = clamp01(1 - diffDays / config.linearWindowDays);
    linearBoost = ratio * config.linearMax;
  }
  let surgeBoost = 0;
  if (diffDays <= config.surgeWindowDays) {
    const ratio = clamp01(1 - diffDays / config.surgeWindowDays);
    surgeBoost = Math.pow(ratio, 2) * config.surgeMax;
  }
  let overdueBoost = 0;
  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    overdueBoost = Math.min(
      config.overdueMax,
      overdueDays * config.overdueBonusPerDay
    );
  }
  return Math.round(linearBoost + surgeBoost + overdueBoost);
}

function taskWeight(task: TaskLite) {
  const priority = TASK_PRIORITY_WEIGHT[task.priority] ?? 0;
  const stage = TASK_STAGE_WEIGHT[task.stage] ?? 0;
  return priority + stage;
}

function projectWeight(project: ProjectLite, relatedTaskWeightsSum: number) {
  const priority = PROJECT_PRIORITY_WEIGHT[project.priority] ?? 0;
  const stage = PROJECT_STAGE_WEIGHT[project.stage] ?? 0;
  const dueBoost = dueDateUrgencyBoost(project.due_date, {
    linearMax: 40,
    surgeMax: 70,
    surgeWindowDays: 4,
    linearWindowDays: 28,
    overdueBonusPerDay: 25,
    overdueMax: 140,
  });
  return relatedTaskWeightsSum / 1000 + priority + stage + dueBoost;
}
