import type { SupabaseClient } from "@supabase/supabase-js";

import {
  addDaysInTimeZone,
  formatDateKeyInTimeZone,
  startOfDayInTimeZone,
} from "@/lib/scheduler/timezone";
import type { Database } from "@/types/supabase";

const FALLBACK_TIME_ZONE = "America/Chicago";
const UNNAMED_BLOCK_LABEL = "Unnamed Time Block";
const MEAL_BRIEF_TITLE = "Meal time";
const MEAL_BRIEF_BODY = "Eat, then log your meal and calories in CREATOR.";

export type ScheduleInstance = {
  id: string;
  event_name: string | null;
  project_name: string | null;
  source_type: string;
  source_id: string;
  start_utc: string;
  end_utc: string | null;
  duration_min: number | null;
  status: string;
  time_block_id: string | null;
  day_type_time_block_id: string | null;
  window_id: string | null;
};

export type TimeBlockRow = {
  id: string;
  label: string | null;
  start_local: string;
  end_local: string;
};

export type DayTypeTimeBlockRow = {
  id: string;
  time_block_id: string;
  time_block_label: string | null;
  block_type: string;
  time_blocks: TimeBlockRow | TimeBlockRow[] | null;
};

export type WindowRow = {
  id: string;
  label: string;
  window_kind: string;
};

export type BlockMetadata = {
  timeBlock: TimeBlockRow | null;
  dayTypeTimeBlock: DayTypeTimeBlockRow | null;
  window: WindowRow | null;
};

export type PreviewEvent = {
  id: string;
  name: string;
  skillIcon?: string | null;
  sourceType: string;
  startUtc: string;
};

export type ScheduleBlockBriefDataPayload = {
  type: "schedule_block_brief";
  instanceId: string;
  sourceType: string;
  sourceId: string;
  startUtc: string;
  blockLabel: string;
  blockEventCount: number;
  timeBlockId: string | null;
  dayTypeTimeBlockId: string | null;
  windowId: string | null;
};

export type ScheduleBlockBrief = {
  title: string;
  body: string;
  blockLabel: string;
  blockEventCount: number;
  previewEvents: PreviewEvent[];
  timeZone: string;
  entityId: string;
  dataPayload: ScheduleBlockBriefDataPayload;
};

type ProjectSkillRow = {
  project_id: string | null;
  skill_id: string | null;
};

type SourceSkillRow = {
  id: string | null;
  skill_id: string | null;
};

type SkillIconRow = {
  id: string | null;
  icon: string | null;
};

export class ScheduleBlockBriefBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduleBlockBriefBuildError";
  }
}

function normalizeTimeZoneOrFallback(timeZone: string | null) {
  const trimmed = timeZone?.trim();
  if (!trimmed) return FALLBACK_TIME_ZONE;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed });
    return trimmed;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

async function resolveProfileTimeZone(
  client: SupabaseClient<Database>,
  userId: string,
) {
  try {
    const { data, error } = await client
      .from("profiles")
      .select("timezone")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn("[SCHEDULE_BLOCK_BRIEF] timezone lookup failed", {
        userId,
        error,
      });
      return null;
    }

    const timeZone = (data as { timezone?: unknown } | null)?.timezone;
    return typeof timeZone === "string" && timeZone.trim() ? timeZone : null;
  } catch (error) {
    console.warn("[SCHEDULE_BLOCK_BRIEF] timezone lookup failed", {
      userId,
      error,
    });
    return null;
  }
}

function formatLocalTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatWeekday(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
  }).format(date);
}

function pickText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function joinedTimeBlock(
  dayTypeTimeBlock: DayTypeTimeBlockRow | null,
): TimeBlockRow | null {
  const joined = dayTypeTimeBlock?.time_blocks;
  if (!joined) return null;
  return Array.isArray(joined) ? (joined[0] ?? null) : joined;
}

function resolveBlockLabel(metadata: BlockMetadata) {
  return (
    pickText(metadata.timeBlock?.label) ??
    pickText(metadata.dayTypeTimeBlock?.time_block_label) ??
    pickText(joinedTimeBlock(metadata.dayTypeTimeBlock)?.label) ??
    pickText(metadata.window?.label) ??
    UNNAMED_BLOCK_LABEL
  );
}

function normalizeBlockKind(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

function isMealBlock(metadata: BlockMetadata) {
  return (
    normalizeBlockKind(metadata.dayTypeTimeBlock?.block_type) === "MEAL" ||
    normalizeBlockKind(metadata.window?.window_kind) === "MEAL"
  );
}

function formatSourceType(sourceType: string | null | undefined) {
  const trimmed = sourceType?.trim();
  return trimmed ? trimmed.toUpperCase() : "";
}

function eventName(instance: ScheduleInstance) {
  return (
    pickText(instance.event_name) ??
    pickText(instance.project_name) ??
    "Scheduled event"
  );
}

function formatEventPreview(event: Pick<PreviewEvent, "name" | "skillIcon">) {
  const skillIcon = event.skillIcon?.trim();
  return skillIcon ? `${skillIcon} ${event.name}` : event.name;
}

function buildBriefBody(events: PreviewEvent[]) {
  const count = events.length;
  const previewLines = events.slice(0, 3).map(formatEventPreview);
  const remaining = count - previewLines.length;
  const lines = [`${count} scheduled`, ...previewLines];

  if (remaining > 0) {
    lines.push(`+${remaining} more`);
  }

  return lines.join("\n");
}

function buildBriefTitle({
  blockLabel,
  now,
  start,
  timeZone,
}: {
  blockLabel: string;
  now: Date;
  start: Date;
  timeZone: string;
}) {
  const minutesUntilStart = Math.max(0, (start.getTime() - now.getTime()) / 60000);

  if (minutesUntilStart <= 2) {
    return `${blockLabel} is live`;
  }

  if (minutesUntilStart < 60) {
    const displayMinutes = Math.min(59, Math.max(3, Math.ceil(minutesUntilStart)));
    return `${blockLabel} starts in ${displayMinutes} min`;
  }

  const localTime = formatLocalTime(start, timeZone);
  const todayKey = formatDateKeyInTimeZone(now, timeZone);
  const startKey = formatDateKeyInTimeZone(start, timeZone);

  if (startKey === todayKey) {
    return `${blockLabel} starts at ${localTime}`;
  }

  return `${blockLabel} starts ${formatWeekday(start, timeZone)} at ${localTime}`;
}

async function loadBlockMetadata(
  client: SupabaseClient<Database>,
  userId: string,
  instance: ScheduleInstance,
): Promise<BlockMetadata> {
  const [timeBlockResult, dayTypeTimeBlockResult, windowResult] = await Promise.all([
    instance.time_block_id
      ? client
          .from("time_blocks")
          .select("id, label, start_local, end_local")
          .eq("user_id", userId)
          .eq("id", instance.time_block_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    instance.day_type_time_block_id
      ? client
          .from("day_type_time_blocks")
          .select(
            "id, time_block_id, time_block_label, block_type, time_blocks(label, start_local, end_local)",
          )
          .eq("user_id", userId)
          .eq("id", instance.day_type_time_block_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    instance.window_id
      ? client
          .from("windows")
          .select("id, label, window_kind")
          .eq("user_id", userId)
          .eq("id", instance.window_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (timeBlockResult.error) {
    console.warn("[SCHEDULE_BLOCK_BRIEF] time block lookup failed", {
      userId,
      timeBlockId: instance.time_block_id,
      error: timeBlockResult.error,
    });
  }

  if (dayTypeTimeBlockResult.error) {
    console.warn("[SCHEDULE_BLOCK_BRIEF] day type time block lookup failed", {
      userId,
      dayTypeTimeBlockId: instance.day_type_time_block_id,
      error: dayTypeTimeBlockResult.error,
    });
  }

  if (windowResult.error) {
    console.warn("[SCHEDULE_BLOCK_BRIEF] window lookup failed", {
      userId,
      windowId: instance.window_id,
      error: windowResult.error,
    });
  }

  return {
    timeBlock: (timeBlockResult.data as TimeBlockRow | null) ?? null,
    dayTypeTimeBlock:
      (dayTypeTimeBlockResult.data as DayTypeTimeBlockRow | null) ?? null,
    window: (windowResult.data as WindowRow | null) ?? null,
  };
}

function addUniqueSourceId(target: Set<string>, instance: ScheduleInstance) {
  const sourceId = instance.source_id?.trim();
  if (sourceId) {
    target.add(sourceId);
  }
}

function assignSkillId(
  instanceSkillIds: Map<string, string>,
  instance: ScheduleInstance,
  skillId: string | null | undefined,
) {
  const normalized = skillId?.trim();
  if (normalized) {
    instanceSkillIds.set(instance.id, normalized);
  }
}

async function loadSkillIconByInstanceId(
  client: SupabaseClient<Database>,
  userId: string,
  instances: ScheduleInstance[],
): Promise<Map<string, string>> {
  const projectIds = new Set<string>();
  const habitIds = new Set<string>();
  const taskIds = new Set<string>();

  for (const instance of instances) {
    if (instance.source_type === "PROJECT") {
      addUniqueSourceId(projectIds, instance);
    } else if (instance.source_type === "HABIT") {
      addUniqueSourceId(habitIds, instance);
    } else if (instance.source_type === "TASK") {
      addUniqueSourceId(taskIds, instance);
    }
  }

  const [projectSkillResult, habitResult, taskResult] = await Promise.all([
    projectIds.size > 0
      ? client
          .from("project_skills")
          .select("project_id, skill_id")
          .in("project_id", Array.from(projectIds))
      : Promise.resolve({ data: null, error: null }),
    habitIds.size > 0
      ? client
          .from("habits")
          .select("id, skill_id")
          .eq("user_id", userId)
          .in("id", Array.from(habitIds))
      : Promise.resolve({ data: null, error: null }),
    taskIds.size > 0
      ? client
          .from("tasks")
          .select("id, skill_id")
          .eq("user_id", userId)
          .in("id", Array.from(taskIds))
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (projectSkillResult.error) {
    console.warn("[SCHEDULE_BLOCK_BRIEF] project skill lookup failed", {
      userId,
      error: projectSkillResult.error,
    });
  }

  if (habitResult.error) {
    console.warn("[SCHEDULE_BLOCK_BRIEF] habit skill lookup failed", {
      userId,
      error: habitResult.error,
    });
  }

  if (taskResult.error) {
    console.warn("[SCHEDULE_BLOCK_BRIEF] task skill lookup failed", {
      userId,
      error: taskResult.error,
    });
  }

  const projectSkillIds = new Map<string, string>();
  for (const row of (projectSkillResult.data ?? []) as ProjectSkillRow[]) {
    const projectId = row.project_id?.trim();
    const skillId = row.skill_id?.trim();
    if (projectId && skillId && !projectSkillIds.has(projectId)) {
      projectSkillIds.set(projectId, skillId);
    }
  }

  const habitSkillIds = new Map<string, string>();
  for (const row of (habitResult.data ?? []) as SourceSkillRow[]) {
    const habitId = row.id?.trim();
    const skillId = row.skill_id?.trim();
    if (habitId && skillId) {
      habitSkillIds.set(habitId, skillId);
    }
  }

  const taskSkillIds = new Map<string, string>();
  for (const row of (taskResult.data ?? []) as SourceSkillRow[]) {
    const taskId = row.id?.trim();
    const skillId = row.skill_id?.trim();
    if (taskId && skillId) {
      taskSkillIds.set(taskId, skillId);
    }
  }

  const instanceSkillIds = new Map<string, string>();
  for (const instance of instances) {
    const sourceId = instance.source_id?.trim();
    if (!sourceId) continue;

    if (instance.source_type === "PROJECT") {
      assignSkillId(instanceSkillIds, instance, projectSkillIds.get(sourceId));
    } else if (instance.source_type === "HABIT") {
      assignSkillId(instanceSkillIds, instance, habitSkillIds.get(sourceId));
    } else if (instance.source_type === "TASK") {
      assignSkillId(instanceSkillIds, instance, taskSkillIds.get(sourceId));
    }
  }

  const skillIds = Array.from(new Set(instanceSkillIds.values()));
  if (skillIds.length === 0) {
    return new Map();
  }

  const { data: skillRows, error: skillError } = await client
    .from("skills")
    .select("id, icon")
    .eq("user_id", userId)
    .in("id", skillIds);

  if (skillError) {
    console.warn("[SCHEDULE_BLOCK_BRIEF] skill icon lookup failed", {
      userId,
      error: skillError,
    });
    return new Map();
  }

  const skillIcons = new Map<string, string>();
  for (const row of (skillRows ?? []) as SkillIconRow[]) {
    const skillId = row.id?.trim();
    const icon = row.icon?.trim();
    if (skillId && icon) {
      skillIcons.set(skillId, icon);
    }
  }

  const iconsByInstanceId = new Map<string, string>();
  for (const [instanceId, skillId] of instanceSkillIds) {
    const icon = skillIcons.get(skillId)?.trim();
    if (icon) {
      iconsByInstanceId.set(instanceId, icon);
    }
  }

  return iconsByInstanceId;
}

function isSameBlock(anchor: ScheduleInstance, candidate: ScheduleInstance) {
  if (anchor.time_block_id) {
    return candidate.time_block_id === anchor.time_block_id;
  }

  if (anchor.day_type_time_block_id) {
    return candidate.day_type_time_block_id === anchor.day_type_time_block_id;
  }

  if (anchor.window_id) {
    return candidate.window_id === anchor.window_id;
  }

  return candidate.id === anchor.id;
}

function toPreviewEvent(
  instance: ScheduleInstance,
  skillIconsByInstanceId: Map<string, string>,
): PreviewEvent {
  const skillIcon = skillIconsByInstanceId.get(instance.id)?.trim() ?? null;

  return {
    id: instance.id,
    name: eventName(instance),
    skillIcon,
    sourceType: formatSourceType(instance.source_type),
    startUtc: instance.start_utc,
  };
}

export async function buildScheduleBlockBrief(
  client: SupabaseClient<Database>,
  userId: string,
  anchorInstance: ScheduleInstance,
  now = new Date(),
): Promise<ScheduleBlockBrief> {
  const timeZone = normalizeTimeZoneOrFallback(
    await resolveProfileTimeZone(client, userId),
  );
  const start = new Date(anchorInstance.start_utc);
  const dayStart = startOfDayInTimeZone(start, timeZone);
  const dayEnd = addDaysInTimeZone(dayStart, 1, timeZone);
  const metadata = await loadBlockMetadata(client, userId, anchorInstance);
  const blockLabel = resolveBlockLabel(metadata);
  const isMealTimeBlock = isMealBlock(metadata);

  const { data: dayInstancesData, error: dayInstancesError } = await client
    .from("schedule_instances")
    .select(
      "id, event_name, project_name, source_type, source_id, start_utc, end_utc, duration_min, status, time_block_id, day_type_time_block_id, window_id",
    )
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .not("start_utc", "is", null)
    .gte("start_utc", dayStart.toISOString())
    .lt("start_utc", dayEnd.toISOString());

  if (dayInstancesError) {
    throw new ScheduleBlockBriefBuildError(
      "Unable to load scheduled events for block",
    );
  }

  const blockInstances = ((dayInstancesData as ScheduleInstance[] | null) ?? [
    anchorInstance,
  ])
    .filter((candidate) => isSameBlock(anchorInstance, candidate))
    .sort((left, right) => left.start_utc.localeCompare(right.start_utc));
  const briefInstances = blockInstances.length > 0 ? blockInstances : [anchorInstance];
  const title = isMealTimeBlock
    ? MEAL_BRIEF_TITLE
    : buildBriefTitle({
        blockLabel,
        now,
        start,
        timeZone,
      });
  const skillIconsByInstanceId = await loadSkillIconByInstanceId(
    client,
    userId,
    briefInstances,
  );
  const previewEvents = briefInstances.map((briefInstance) =>
    toPreviewEvent(briefInstance, skillIconsByInstanceId),
  );
  const body = isMealTimeBlock ? MEAL_BRIEF_BODY : buildBriefBody(previewEvents);
  const entityId =
    anchorInstance.time_block_id ??
    anchorInstance.day_type_time_block_id ??
    anchorInstance.window_id ??
    anchorInstance.id;
  const blockEventCount = briefInstances.length;

  return {
    title,
    body,
    blockLabel,
    blockEventCount,
    previewEvents,
    timeZone,
    entityId,
    dataPayload: {
      type: "schedule_block_brief",
      instanceId: anchorInstance.id,
      sourceType: anchorInstance.source_type,
      sourceId: anchorInstance.source_id,
      startUtc: anchorInstance.start_utc,
      blockLabel,
      blockEventCount,
      timeBlockId: anchorInstance.time_block_id,
      dayTypeTimeBlockId: anchorInstance.day_type_time_block_id,
      windowId: anchorInstance.window_id,
    },
  };
}
