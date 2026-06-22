import { NextResponse } from "next/server";

import {
  addDaysInTimeZone,
  formatDateKeyInTimeZone,
  startOfDayInTimeZone,
} from "@/lib/scheduler/timezone";
import { sendPushToUser } from "@/lib/notifications/sendPush";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_TIME_ZONE = "America/Chicago";
const UNNAMED_BLOCK_LABEL = "Unnamed Time Block";

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

type ScheduleInstance = {
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

type TimeBlockRow = {
  id: string;
  label: string | null;
  start_local: string;
  end_local: string;
};

type DayTypeTimeBlockRow = {
  id: string;
  time_block_id: string;
  time_block_label: string | null;
  block_type: string;
  time_blocks: TimeBlockRow | TimeBlockRow[] | null;
};

type WindowRow = {
  id: string;
  label: string;
  window_kind: string;
};

type BlockMetadata = {
  timeBlock: TimeBlockRow | null;
  dayTypeTimeBlock: DayTypeTimeBlockRow | null;
  window: WindowRow | null;
};

type PreviewEvent = {
  id: string;
  name: string;
  skillIcon?: string | null;
  sourceType: string;
  startUtc: string;
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
  client: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  if (!client) return null;

  try {
    const { data, error } = await client
      .from("profiles")
      .select("timezone")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn("[PUSH_SCHEDULE_TEST] timezone lookup failed", {
        userId,
        error,
      });
      return null;
    }

    const timeZone = (data as { timezone?: unknown } | null)?.timezone;
    return typeof timeZone === "string" && timeZone.trim() ? timeZone : null;
  } catch (error) {
    console.warn("[PUSH_SCHEDULE_TEST] timezone lookup failed", {
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

  if (count === 1) {
    return `1 scheduled: ${formatEventPreview(events[0])}`;
  }

  if (count <= 3) {
    return `${count} scheduled: ${events.map(formatEventPreview).join(" · ")}`;
  }

  const remaining = count - 2;
  return `${count} scheduled: ${events
    .slice(0, 2)
    .map(formatEventPreview)
    .join(" · ")} · +${remaining} more`;
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
  client: AdminClient,
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
    console.warn("[PUSH_SCHEDULE_TEST] time block lookup failed", {
      userId,
      timeBlockId: instance.time_block_id,
      error: timeBlockResult.error,
    });
  }

  if (dayTypeTimeBlockResult.error) {
    console.warn("[PUSH_SCHEDULE_TEST] day type time block lookup failed", {
      userId,
      dayTypeTimeBlockId: instance.day_type_time_block_id,
      error: dayTypeTimeBlockResult.error,
    });
  }

  if (windowResult.error) {
    console.warn("[PUSH_SCHEDULE_TEST] window lookup failed", {
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
  client: AdminClient,
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
    console.warn("[PUSH_SCHEDULE_TEST] project skill lookup failed", {
      userId,
      error: projectSkillResult.error,
    });
  }

  if (habitResult.error) {
    console.warn("[PUSH_SCHEDULE_TEST] habit skill lookup failed", {
      userId,
      error: habitResult.error,
    });
  }

  if (taskResult.error) {
    console.warn("[PUSH_SCHEDULE_TEST] task skill lookup failed", {
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
    console.warn("[PUSH_SCHEDULE_TEST] skill icon lookup failed", {
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

export async function POST() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase client unavailable" }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  if (!adminClient) {
    return NextResponse.json({ error: "Supabase admin client unavailable" }, { status: 500 });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const { data: instance, error: instanceError } = await adminClient
    .from("schedule_instances")
    .select(
      "id, event_name, project_name, source_type, source_id, start_utc, end_utc, duration_min, status, time_block_id, day_type_time_block_id, window_id",
    )
    .eq("user_id", user.id)
    .eq("status", "scheduled")
    .not("start_utc", "is", null)
    .gte("start_utc", nowIso)
    .order("start_utc", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (instanceError) {
    return NextResponse.json({ error: "Unable to load next scheduled block" }, { status: 500 });
  }

  if (!instance) {
    return NextResponse.json({ error: "No upcoming scheduled block found" }, { status: 404 });
  }

  const anchor = instance as ScheduleInstance;
  const timeZone = normalizeTimeZoneOrFallback(
    await resolveProfileTimeZone(adminClient, user.id),
  );
  const start = new Date(anchor.start_utc);
  const dayStart = startOfDayInTimeZone(start, timeZone);
  const dayEnd = addDaysInTimeZone(dayStart, 1, timeZone);
  const metadata = await loadBlockMetadata(adminClient, user.id, anchor);
  const blockLabel = resolveBlockLabel(metadata);

  const { data: dayInstancesData, error: dayInstancesError } = await adminClient
    .from("schedule_instances")
    .select(
      "id, event_name, project_name, source_type, source_id, start_utc, end_utc, duration_min, status, time_block_id, day_type_time_block_id, window_id",
    )
    .eq("user_id", user.id)
    .eq("status", "scheduled")
    .not("start_utc", "is", null)
    .gte("start_utc", dayStart.toISOString())
    .lt("start_utc", dayEnd.toISOString());

  if (dayInstancesError) {
    return NextResponse.json(
      { error: "Unable to load scheduled events for block" },
      { status: 500 },
    );
  }

  const blockInstances = ((dayInstancesData as ScheduleInstance[] | null) ?? [anchor])
    .filter((candidate) => isSameBlock(anchor, candidate))
    .sort((left, right) => left.start_utc.localeCompare(right.start_utc));
  const briefInstances = blockInstances.length > 0 ? blockInstances : [anchor];
  const title = buildBriefTitle({
    blockLabel,
    now,
    start,
    timeZone,
  });
  const skillIconsByInstanceId = await loadSkillIconByInstanceId(
    adminClient,
    user.id,
    briefInstances,
  );
  const previewEvents = briefInstances.map((briefInstance) =>
    toPreviewEvent(briefInstance, skillIconsByInstanceId),
  );
  const body = buildBriefBody(previewEvents);
  const entityId =
    anchor.time_block_id ??
    anchor.day_type_time_block_id ??
    anchor.window_id ??
    anchor.id;

  const result = await sendPushToUser(
    adminClient,
    user.id,
    {
      notification: {
        title,
        body,
      },
      data: {
        type: "schedule_block_brief",
        instanceId: anchor.id,
        sourceType: anchor.source_type,
        sourceId: anchor.source_id,
        startUtc: anchor.start_utc,
        blockLabel,
        blockEventCount: briefInstances.length,
        timeBlockId: anchor.time_block_id,
        dayTypeTimeBlockId: anchor.day_type_time_block_id,
        windowId: anchor.window_id,
      },
    },
    {
      delivery: {
        kind: "schedule_block_brief",
        entityType: "schedule_block",
        entityId,
        scheduledFor: anchor.start_utc,
        dedupe: true,
      },
    },
  );

  const response = {
    ok: result.ok,
    successCount: result.successCount,
    failureCount: result.failureCount,
    skippedReason: result.skippedReason ?? null,
    instanceId: anchor.id,
    startUtc: anchor.start_utc,
    blockLabel,
    blockEventCount: briefInstances.length,
    previewEvents,
    title,
    body,
    ...(result.error ? { error: result.error } : {}),
  };

  return NextResponse.json(response, { status: result.ok ? 200 : 500 });
}
