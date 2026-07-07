import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchWindowsForDate,
  type WindowLite,
} from "@/lib/scheduler/repo";
import {
  fetchInstancesForRange,
  type ScheduleInstance,
} from "@/lib/scheduler/instanceRepo";
import { evaluateHabitDueOnDate } from "@/lib/scheduler/habitRecurrence";
import { fetchHabitsForSchedule } from "@/lib/scheduler/habits";
import { addDaysInTimeZone, makeDateInTimeZone } from "@/lib/scheduler/timezone";
import { AI_INTENT_MAX_SERIALIZED_CONTEXT_CHARS } from "@/lib/ai/config";
import type { Database } from "@/types/supabase";

type Client = SupabaseClient<Database>;

type CreatorAiContextArgs = {
  supabase: Client;
  userId: string;
  timeZone: string;
  dayKey: string;
  nowMs?: number;
  intentMode?: OperatorIntentMode;
  myListContext?: OperatorMyListContext;
};

export type OperatorIntentMode =
  | "next_action"
  | "schedule_summary"
  | "missed_today"
  | "neglect"
  | "plan_day"
  | "goals_projects"
  | "my_list"
  | "general";

type ScheduleSnapshotInstance = {
  id: string;
  title: string;
  label: string;
  source_type: string | null;
  source_id: string | null;
  start_utc_ms: number;
  end_utc_ms: number;
  start_utc: string;
  end_utc: string;
  status: string | null;
  completed_at: string | null;
  completed: boolean;
  parent_time_block_id?: string | null;
  parent_day_type_time_block_id?: string | null;
  parent_window_id?: string | null;
  priority?: string | null;
  skill_id?: string | null;
  skill_name?: string | null;
  skill_icon?: string | null;
  monument_id?: string | null;
  energy?: string | null;
  relation_to_now?: "active" | "next" | "future" | "past";
  minutes_until_start?: number | null;
  minutes_until_end?: number | null;
  inside_current_or_nearest_block?: boolean;
  project_id?: string | null;
  goal_id?: string | null;
  habit_id?: string | null;
  task_id?: string | null;
  event_id?: string | null;
};

type OperatorStateItem = {
  id: string;
  title: string;
  type: string | null;
  sourceId?: string | null;
  status: string | null;
  startLocal: string;
  endLocal: string;
  timeRange: string;
  timing: string;
  start_utc_ms: number;
  end_utc_ms: number;
  startUtc?: string | null;
  endUtc?: string | null;
  skillName?: string | null;
  skillIcon?: string | null;
  blockId?: string | null;
  blockLabel?: string | null;
  timeBlockId?: string | null;
  dayTypeTimeBlockId?: string | null;
  windowId?: string | null;
};

type OperatorStateBlock = {
  id: string;
  label: string;
  kind: string | null;
  startLocal: string;
  endLocal: string;
  timeRange: string;
  timing: string;
  itemCount: number;
  startUtc?: string | null;
  endUtc?: string | null;
  timeBlockId?: string | null;
  dayTypeTimeBlockId?: string | null;
  windowId?: string | null;
};

type OperatorState = {
  intentMode: OperatorIntentMode;
  nowUtcMs: number;
  nowLocal: string;
  dayPhase:
    | "late_night"
    | "pre_day"
    | "morning"
    | "midday"
    | "afternoon"
    | "evening"
    | "shutdown";
  currentBlock: OperatorStateBlock | null;
  currentItems: OperatorStateItem[];
  activeRecoveryItem: OperatorStateItem | null;
  activeRecoveryBlock: OperatorStateBlock | null;
  isRecoveryActive: boolean;
  recoveryInstruction: string | null;
  nextBlock: OperatorStateBlock | null;
  nextItems: OperatorStateItem[];
  lastMissedItems: OperatorStateItem[];
  missedTodayItems: OperatorStateItem[];
  upcomingItems: OperatorStateItem[];
  scheduleSummaryItems: OperatorStateItem[];
  tonightItems: OperatorStateItem[];
  todaySkills: string[];
  todayItemCountsByType: Record<string, number>;
  neglectCheck: {
    missedItems: OperatorStateItem[];
    currentItems: OperatorStateItem[];
    upcomingItems: OperatorStateItem[];
    rule: string;
    FUTURE_ITEMS_ARE_NOT_NEGLECTED: true;
    recoveryActive: boolean;
  };
  neglectIntelligence: NeglectIntelligence;
  neglectDigest: string;
  scheduleDigest: string;
  myListContext?: OperatorMyListContext;
  suggestedActions: SuggestedAction[];
};

export type OperatorMyListContext = {
  source: "server" | "client_local_storage" | "unavailable";
  clientProvided?: boolean;
  rows: Array<{
    id: string;
    text: string;
    done?: boolean;
    completedAt?: string | null;
    skillIcon?: string | null;
    skillName?: string | null;
    dayBucketId?: string | null;
    priorityId?: string | null;
  }>;
  capped: boolean;
};

export type SuggestedAction = {
  id: string;
  kind:
    | "complete_due_item"
    | "start_focus"
    | "reschedule_missed_item"
    | "protect_recovery"
    | "open_context"
    | "triage_due_today";
  label: string;
  reason: string;
  confidence: "high" | "medium" | "low";
  readOnly: true;
  sourceType?:
    | "PROJECT"
    | "TASK"
    | "HABIT"
    | "EVENT"
    | "SCHEDULE_INSTANCE"
    | "SKILL"
    | "MONUMENT"
    | "GOAL";
  sourceId?: string;
  scheduleInstanceId?: string;
  href?: string;
  unavailableReason?: string;
  evidence?: {
    bucket?: string;
    blockId?: string | null;
    blockLabel?: string | null;
    startUtc?: string | null;
    endUtc?: string | null;
  };
};

export type OperatorProposedAction =
  | {
      kind: "create_schedule_event";
      status: "proposed";
      title: string;
      startAt: string;
      endAt: string;
      timezone: string;
      notes?: string | null;
      display: {
        title: string;
        timeRange: string;
        typeLabel: "Event";
      };
    };

type NeglectItem = {
  id: string;
  type:
    | "schedule_instance"
    | "project"
    | "habit"
    | "goal"
    | "skill"
    | "monument";
  title: string;
  reason: string;
  evidenceAt?: string | null;
  dueAt?: string | null;
  scheduledStartAt?: string | null;
  priority?: string | number | null;
  linkedIds?: {
    goalId?: string;
    projectId?: string;
    skillId?: string;
    monumentId?: string;
  };
};

type NeglectIntelligence = {
  generatedAtUtc: string;
  windowDays: {
    missedScheduleLookback: number;
    staleActivityLookback: number;
    staleProjectLookback: number;
  };
  rules: {
    futureItemsAreNeverNeglected: true;
    scopedByAuthenticatedUser: true;
    deterministicOnly: true;
  };
  missedScheduledItems: NeglectItem[];
  overdueProjects: NeglectItem[];
  dueUnscheduledProjects: NeglectItem[];
  dueHabitsUnscheduledIncomplete: NeglectItem[];
  staleProjects: NeglectItem[];
  staleGoals: NeglectItem[];
  staleSkills: NeglectItem[];
  staleMonuments: NeglectItem[];
  inactiveHighPriorityDomains: NeglectItem[];
  bucketCounts: {
    missedScheduledItems: number;
    overdueProjects: number;
    dueUnscheduledProjects: number;
    dueHabitsUnscheduledIncomplete: number;
    staleProjects: number;
    staleSkills: number;
    staleMonuments: number;
    inactiveHighPriorityDomains: number;
  };
  unavailableBuckets: Array<{ bucket: string; reason: string }>;
};

type CompactWindow = {
  id: string;
  label: string;
  energy: string;
  start_local: string;
  end_local: string;
  kind: string;
  location?: string | null;
  day_type_time_block_id?: string | null;
};

type CreatorAiContext = {
  dayKey: string;
  timeZone: string;
  operator_state: OperatorState;
  windows: CompactWindow[];
  schedule_instances: ScheduleSnapshotInstance[];
  goals: unknown[];
  projects: unknown[];
  habits: unknown[];
  dayTypes: unknown[];
  dayTypeTimeBlocks: unknown[];
  recentCompletions: unknown[];
};

type EntityLookupRow = {
  id: string;
  name?: string | null;
  title?: string | null;
  icon?: string | null;
  emoji?: string | null;
  priority?: string | null;
  energy?: string | null;
  goal_id?: string | null;
  project_id?: string | null;
  skill_id?: string | null;
  monument_id?: string | null;
};

type ScheduleEntityLookups = {
  projects: Map<string, EntityLookupRow>;
  tasks: Map<string, EntityLookupRow>;
  habits: Map<string, EntityLookupRow>;
  events: Map<string, EntityLookupRow>;
  skills: Map<string, EntityLookupRow>;
  goals: Map<string, EntityLookupRow>;
  projectSkillIds: Map<string, string[]>;
};

const SCHEDULE_INSTANCE_KIND_LABELS: Record<string, string> = {
  PROJECT: "Project",
  TASK: "Task",
  HABIT: "Habit",
};

function parseDayKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  const day = Number.parseInt(dayStr, 10);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  return { year, month, day };
}

const parseTimestampMs = (value?: string | null): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveScheduleInstanceTitle = (record: ScheduleInstance): string => {
  const explicit = record.event_name?.trim();
  if (explicit) return explicit;
  return resolveScheduleTypeTitle(record.source_type);
};

const resolveScheduleTypeTitle = (sourceType?: string | null): string => {
  const kind = sourceType?.trim().toUpperCase();
  if (kind) {
    if (kind in SCHEDULE_INSTANCE_KIND_LABELS) {
      return SCHEDULE_INSTANCE_KIND_LABELS[kind];
    }
    return `${kind.charAt(0)}${kind.slice(1).toLowerCase()}`;
  }
  return "Scheduled item";
};

const uniqueSourceIds = (
  records: ScheduleInstance[],
  sourceType: string
): string[] => {
  const ids = new Set<string>();
  for (const record of records) {
    if (record.source_type !== sourceType || !record.source_id) continue;
    ids.add(record.source_id);
  }
  return Array.from(ids).slice(0, 80);
};

const rowsById = (rows: EntityLookupRow[] | null | undefined) =>
  new Map((rows ?? []).map((row) => [row.id, row]));

const readMetadataString = (
  metadata: ScheduleInstance["metadata"],
  key: string
): string | null => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const compactDbError = (error: unknown) => {
  if (!error || typeof error !== "object") return { message: String(error) };
  const record = error as Record<string, unknown>;
  return {
    code: typeof record.code === "string" ? record.code : undefined,
    message: typeof record.message === "string" ? record.message : undefined,
  };
};

const isUncompletedScheduleInstance = (record: ScheduleInstance) =>
  record.status !== "completed" && !record.completed_at;

const isCanceledScheduleStatus = (status?: string | null) => {
  const normalized = status?.trim().toLowerCase();
  return normalized === "canceled" || normalized === "cancelled";
};

const isIncompleteScheduleInstance = (
  item: Pick<ScheduleSnapshotInstance, "completed" | "completed_at" | "status">
) =>
  !item.completed &&
  !item.completed_at &&
  item.status?.trim().toLowerCase() !== "completed";

const isMissedNeglectCandidate = (
  item: ScheduleSnapshotInstance,
  nowMs: number
) =>
  item.end_utc_ms <= nowMs &&
  isIncompleteScheduleInstance(item) &&
  !isCanceledScheduleStatus(item.status);

const isCurrentNeglectCandidate = (
  item: ScheduleSnapshotInstance,
  nowMs: number
) =>
  item.start_utc_ms <= nowMs &&
  nowMs < item.end_utc_ms &&
  isIncompleteScheduleInstance(item) &&
  !isCanceledScheduleStatus(item.status);

const isUpcomingNeglectCandidate = (
  item: ScheduleSnapshotInstance,
  nowMs: number
) =>
  item.start_utc_ms > nowMs &&
  isIncompleteScheduleInstance(item) &&
  !isCanceledScheduleStatus(item.status);

const formatLocalTime = (value: number | Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(value instanceof Date ? value : new Date(value));

const formatNowLocal = (value: number, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));

const formatTimeRange = (startMs: number, endMs: number, timeZone: string) =>
  `${formatLocalTime(startMs, timeZone)}-${formatLocalTime(endMs, timeZone)}`;

const formatDuration = (minutes: number) => {
  const absolute = Math.max(Math.round(Math.abs(minutes)), 0);
  const hours = Math.floor(absolute / 60);
  const mins = absolute % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
};

const formatItemTiming = (
  item: Pick<ScheduleSnapshotInstance, "start_utc_ms" | "end_utc_ms">,
  nowMs: number
) => {
  if (item.start_utc_ms > nowMs) {
    return `starts in ${formatDuration((item.start_utc_ms - nowMs) / 60_000)}`;
  }
  if (item.end_utc_ms > nowMs) {
    return `started ${formatDuration((nowMs - item.start_utc_ms) / 60_000)} ago; ends in ${formatDuration((item.end_utc_ms - nowMs) / 60_000)}`;
  }
  return `missed by ${formatDuration((nowMs - item.end_utc_ms) / 60_000)}`;
};

const getDayPhase = (nowMs: number, timeZone: string): OperatorState["dayPhase"] => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(nowMs));
  const hour = Number.parseInt(
    parts.find((part) => part.type === "hour")?.value ?? "",
    10
  );
  const localHour = Number.isFinite(hour) ? hour : new Date(nowMs).getUTCHours();
  if (localHour < 4) return "late_night";
  if (localHour < 6) return "pre_day";
  if (localHour < 12) return "morning";
  if (localHour < 15) return "midday";
  if (localHour < 18) return "afternoon";
  if (localHour < 22) return "evening";
  return "shutdown";
};

const parseLocalTimeParts = (value: string) => {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return { hour, minute };
};

const getWindowUtcRange = (
  window: CompactWindow,
  dayParts: NonNullable<ReturnType<typeof parseDayKey>>,
  timeZone: string
) => {
  const startParts = parseLocalTimeParts(window.start_local);
  const endParts = parseLocalTimeParts(window.end_local);
  if (!startParts || !endParts) return null;
  const start = makeDateInTimeZone({ ...dayParts, ...startParts }, timeZone);
  let end = makeDateInTimeZone({ ...dayParts, ...endParts }, timeZone);
  if (end.getTime() <= start.getTime()) {
    end = addDaysInTimeZone(end, 1, timeZone);
  }
  return { startMs: start.getTime(), endMs: end.getTime() };
};

async function fetchRowsByIds(
  supabase: Client,
  table: "projects" | "tasks" | "habits" | "events" | "skills" | "goals",
  columns: string,
  userId: string,
  ids: string[],
  label: string
): Promise<Map<string, EntityLookupRow>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq("user_id", userId)
    .in("id", ids);
  if (error) {
    if (table === "skills") {
      console.warn(`AI operator context optional ${label} lookup failed`, {
        userId,
        ...compactDbError(error),
      });
    } else {
      console.error(`AI operator context error loading ${label}`, error);
    }
    return new Map();
  }
  return rowsById(data as unknown as EntityLookupRow[]);
}

async function fetchScheduleEntityLookups({
  supabase,
  userId,
  instances,
}: {
  supabase: Client;
  userId: string;
  instances: ScheduleInstance[];
}): Promise<ScheduleEntityLookups> {
  const projectIds = uniqueSourceIds(instances, "PROJECT");
  const taskIds = uniqueSourceIds(instances, "TASK");
  const habitIds = uniqueSourceIds(instances, "HABIT");
  const eventIds = uniqueSourceIds(instances, "EVENT");

  const [projects, tasks, habits, events, projectSkillsResult] = await Promise.all([
    fetchRowsByIds(
      supabase,
      "projects",
      "id,name,goal_id,priority,energy,due_date",
      userId,
      projectIds,
      "scheduled projects"
    ),
    fetchRowsByIds(
      supabase,
      "tasks",
      "id,name,project_id,goal_id,priority,energy,skill_id",
      userId,
      taskIds,
      "scheduled tasks"
    ),
    fetchRowsByIds(
      supabase,
      "habits",
      "id,name,goal_id,skill_id,energy",
      userId,
      habitIds,
      "scheduled habits"
    ),
    fetchRowsByIds(
      supabase,
      "events",
      "id,title",
      userId,
      eventIds,
      "scheduled events"
    ),
    projectIds.length > 0
      ? supabase
          .from("project_skills")
          .select("project_id,skill_id")
          .in("project_id", projectIds)
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (projectSkillsResult.error) {
    console.warn("AI operator context optional project skill lookup failed", {
      userId,
      ...compactDbError(projectSkillsResult.error),
    });
  }

  const projectSkillIds = new Map<string, string[]>();
  for (const row of (projectSkillsResult.data ?? []) as Array<{
    project_id?: string | null;
    skill_id?: string | null;
  }>) {
    const projectId = row.project_id?.trim();
    const skillId = row.skill_id?.trim();
    if (!projectId || !skillId) continue;
    const existing = projectSkillIds.get(projectId) ?? [];
    if (!existing.includes(skillId)) existing.push(skillId);
    projectSkillIds.set(projectId, existing);
  }

  const skillIds = new Set<string>();
  const goalIds = new Set<string>();
  for (const row of [...projects.values(), ...tasks.values(), ...habits.values()]) {
    if (row.skill_id) skillIds.add(row.skill_id);
    if (row.goal_id) goalIds.add(row.goal_id);
  }
  for (const ids of projectSkillIds.values()) {
    for (const skillId of ids) skillIds.add(skillId);
  }
  for (const record of instances) {
    const metadataSkillId =
      readMetadataString(record.metadata, "skillId") ??
      readMetadataString(record.metadata, "skill_id");
    if (metadataSkillId) skillIds.add(metadataSkillId);
  }

  const [skills, goals] = await Promise.all([
    fetchRowsByIds(
      supabase,
      "skills",
      "id,name,icon,monument_id",
      userId,
      Array.from(skillIds).slice(0, 80),
      "scheduled skills"
    ),
    fetchRowsByIds(
      supabase,
      "goals",
      "id,name,monument_id,priority,energy",
      userId,
      Array.from(goalIds).slice(0, 80),
      "scheduled goals"
    ),
  ]);

  return { projects, tasks, habits, events, skills, goals, projectSkillIds };
}

const resolveLinkedEntity = (
  record: ScheduleInstance,
  lookups: ScheduleEntityLookups
): EntityLookupRow | null => {
  const sourceId = record.source_id ?? "";
  if (!sourceId) return null;
  if (record.source_type === "PROJECT") return lookups.projects.get(sourceId) ?? null;
  if (record.source_type === "TASK") return lookups.tasks.get(sourceId) ?? null;
  if (record.source_type === "HABIT") return lookups.habits.get(sourceId) ?? null;
  if (record.source_type === "EVENT") return lookups.events.get(sourceId) ?? null;
  return null;
};

const mapScheduleInstanceToSnapshot = (
  record: ScheduleInstance,
  lookups: ScheduleEntityLookups,
  nowMs: number,
  nextInstanceId: string | null
): ScheduleSnapshotInstance | null => {
  const startMs = parseTimestampMs(record.start_utc);
  const endMs = parseTimestampMs(record.end_utc);
  if (
    startMs === null ||
    endMs === null ||
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  ) {
    return null;
  }
  const sourceType = record.source_type?.trim().toUpperCase();
  const linkedEntity = resolveLinkedEntity(record, lookups);
  const linkedTitle =
    linkedEntity?.name?.trim() || linkedEntity?.title?.trim() || null;
  const title = record.event_name?.trim() || linkedTitle || resolveScheduleInstanceTitle(record);
  const metadataSkillId =
    readMetadataString(record.metadata, "skillId") ??
    readMetadataString(record.metadata, "skill_id");
  const projectSkillId =
    sourceType === "PROJECT" && record.source_id
      ? lookups.projectSkillIds.get(record.source_id)?.[0] ?? null
      : null;
  const skillId = metadataSkillId ?? linkedEntity?.skill_id ?? projectSkillId;
  const goalId = linkedEntity?.goal_id ?? null;
  const skill = skillId ? lookups.skills.get(skillId) ?? null : null;
  const goal = goalId ? lookups.goals.get(goalId) ?? null : null;
  const metadataSkillName =
    readMetadataString(record.metadata, "skillName") ??
    readMetadataString(record.metadata, "skill_name");
  const metadataSkillIcon =
    readMetadataString(record.metadata, "skillIcon") ??
    readMetadataString(record.metadata, "skill_icon");
  const isActive = startMs <= nowMs && endMs > nowMs;
  const isNext = record.id === nextInstanceId;
  const relation = isActive
    ? "active"
    : isNext
      ? "next"
      : startMs > nowMs
        ? "future"
        : "past";
  return {
    id: record.id,
    title,
    label: title,
    source_type: record.source_type ?? null,
    source_id: record.source_id ?? null,
    start_utc_ms: startMs,
    end_utc_ms: endMs,
    start_utc: record.start_utc ?? "",
    end_utc: record.end_utc ?? "",
    status: record.status ?? null,
    completed_at: record.completed_at ?? null,
    completed: Boolean(record.completed_at || record.status === "completed"),
    parent_time_block_id: record.time_block_id ?? null,
    parent_day_type_time_block_id: record.day_type_time_block_id ?? null,
    parent_window_id: record.overlay_window_id ?? record.window_id ?? null,
    priority: linkedEntity?.priority ?? goal?.priority ?? null,
    skill_id: skillId,
    skill_name: metadataSkillName ?? skill?.name?.trim() ?? null,
    skill_icon: metadataSkillIcon ?? skill?.icon?.trim() ?? null,
    monument_id: skill?.monument_id ?? goal?.monument_id ?? null,
    energy: linkedEntity?.energy ?? goal?.energy ?? record.energy_resolved ?? null,
    relation_to_now: relation,
    minutes_until_start:
      startMs > nowMs ? Math.round((startMs - nowMs) / 60_000) : null,
    minutes_until_end:
      endMs > nowMs ? Math.round((endMs - nowMs) / 60_000) : null,
    inside_current_or_nearest_block: isActive || isNext,
    project_id: sourceType === "PROJECT" ? record.source_id ?? null : null,
    goal_id: goalId,
    habit_id: sourceType === "HABIT" ? record.source_id ?? null : null,
    task_id: sourceType === "TASK" ? record.source_id ?? null : null,
    event_id: sourceType === "EVENT" ? record.source_id ?? null : null,
  };
};

const compactWindow = (window: WindowLite): CompactWindow => ({
  id: window.overlayWindowId ?? window.dayTypeTimeBlockId ?? window.id,
  label: window.label,
  energy: window.energy,
  start_local: window.start_local,
  end_local: window.end_local,
  kind: window.window_kind,
  location: window.location_context_name ?? window.location_context_value,
  day_type_time_block_id: window.dayTypeTimeBlockId ?? null,
});

const getBlockLookupKey = (item: ScheduleSnapshotInstance) =>
  item.parent_window_id ??
  item.parent_day_type_time_block_id ??
  item.parent_time_block_id ??
  null;

const RECOVERY_LABEL_PATTERN =
  /\b(?:sleep|rest|recovery|shutdown|wind\s*down|bedtime|break|nap|off)\b/i;

const hasRecoverySignal = (values: Array<string | null | undefined>) =>
  values.some((value) => RECOVERY_LABEL_PATTERN.test(value?.trim() ?? ""));

const isRecoveryWindow = (window: CompactWindow | null | undefined) =>
  hasRecoverySignal([window?.label, window?.kind, window?.energy]);

const isRecoverySnapshotItem = (
  item: ScheduleSnapshotInstance,
  blockLabel: string | null
) =>
  hasRecoverySignal([
    item.title,
    item.label,
    item.source_type,
    item.skill_name,
    item.energy,
    blockLabel,
  ]);

const isRecoveryOperatorItem = (item: OperatorStateItem) =>
  hasRecoverySignal([
    item.title,
    item.type,
    item.skillName,
    item.blockLabel,
  ]);

const recoveryInstructionForLabel = (label: string | null | undefined) => {
  const normalized = label?.trim() || "Recovery";
  if (/\b(?:sleep|bedtime|nap)\b/i.test(normalized)) {
    return `You're in ${normalized} now. Stay there. The next useful action is to shut the app and protect recovery.`;
  }
  return "Stay in the recovery block unless there is a real obligation.";
};

const priorityRank = (value: string | null | undefined) => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return 4;
  if (["critical", "urgent", "highest", "p0"].includes(normalized)) return 0;
  if (["high", "p1"].includes(normalized)) return 1;
  if (["medium", "normal", "p2"].includes(normalized)) return 2;
  if (["low", "lowest", "p3"].includes(normalized)) return 3;
  return 4;
};

const NEGLECT_MISSED_SCHEDULE_LOOKBACK_DAYS = 7;
const NEGLECT_STALE_ACTIVITY_LOOKBACK_DAYS = 7;
const STALE_PROJECT_DAYS = 14;
const NEGLECT_FUTURE_SCHEDULE_LOOKAHEAD_DAYS = 7;
const NEGLECT_TOTAL_ITEM_CAP = 25;
const PLACEHOLDER_MOVE_TITLE_PATTERNS = [
  "snapshot test",
  "test",
  "placeholder",
  "event name",
  "demo",
];

const unavailableNeglectBuckets = (): NeglectIntelligence["unavailableBuckets"] => [
  { bucket: "overdueTasks", reason: "tasks has no due_date" },
  { bucket: "dueUnscheduledTasks", reason: "tasks have no direct due date" },
  {
    bucket: "dueUnscheduledEvents",
    reason: "events have start/end but no completion/status semantics",
  },
  {
    bucket: "staleGoals",
    reason:
      "ambiguous in v1 because goals have no completed_at and movement needs a precise definition",
  },
  {
    bucket: "monumentChargeHistory",
    reason:
      "monuments.charge exists but no charge history timestamp was found",
  },
];

const emptyNeglectIntelligence = (nowMs: number): NeglectIntelligence => ({
  generatedAtUtc: new Date(nowMs).toISOString(),
  windowDays: {
    missedScheduleLookback: NEGLECT_MISSED_SCHEDULE_LOOKBACK_DAYS,
    staleActivityLookback: NEGLECT_STALE_ACTIVITY_LOOKBACK_DAYS,
    staleProjectLookback: STALE_PROJECT_DAYS,
  },
  rules: {
    futureItemsAreNeverNeglected: true,
    scopedByAuthenticatedUser: true,
    deterministicOnly: true,
  },
  missedScheduledItems: [],
  overdueProjects: [],
  dueUnscheduledProjects: [],
  dueHabitsUnscheduledIncomplete: [],
  staleProjects: [],
  staleGoals: [],
  staleSkills: [],
  staleMonuments: [],
  inactiveHighPriorityDomains: [],
  bucketCounts: {
    missedScheduledItems: 0,
    overdueProjects: 0,
    dueUnscheduledProjects: 0,
    dueHabitsUnscheduledIncomplete: 0,
    staleProjects: 0,
    staleSkills: 0,
    staleMonuments: 0,
    inactiveHighPriorityDomains: 0,
  },
  unavailableBuckets: unavailableNeglectBuckets(),
});

const daysSinceIso = (iso: string | null | undefined, nowMs: number) => {
  const timestamp = parseTimestampMs(iso);
  if (timestamp === null) return null;
  return Math.max(0, Math.floor((nowMs - timestamp) / 86_400_000));
};

const formatDaysAgo = (iso: string | null | undefined, nowMs: number) => {
  const days = daysSinceIso(iso, nowMs);
  if (days === null) return "no recorded";
  if (days === 0) return "less than 1 day";
  return `${days} day${days === 1 ? "" : "s"}`;
};

const dueDateDaysLate = (dueDate: string, dayKey: string) => {
  const due = parseDayKey(dueDate.slice(0, 10));
  const today = parseDayKey(dayKey);
  if (!due || !today) return null;
  const dueUtc = Date.UTC(due.year, due.month - 1, due.day);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  return Math.floor((todayUtc - dueUtc) / 86_400_000);
};

const latestIso = (...values: Array<string | null | undefined>) =>
  values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;

const isPlaceholderMoveTitle = (title: string) => {
  const normalized = title.trim().toLowerCase();
  return PLACEHOLDER_MOVE_TITLE_PATTERNS.some((pattern) =>
    normalized.includes(pattern)
  );
};

const compactLinkedIds = (ids: NonNullable<NeglectItem["linkedIds"]>) => {
  const compact = Object.fromEntries(
    Object.entries(ids).filter(([, value]) => Boolean(value))
  ) as NonNullable<NeglectItem["linkedIds"]>;
  return Object.keys(compact).length > 0 ? compact : undefined;
};

const mapLatestById = <T extends Record<string, unknown>>(
  rows: T[] | null | undefined,
  idKey: keyof T,
  atKey: keyof T
) => {
  const latest = new Map<string, string>();
  for (const row of rows ?? []) {
    const id = row[idKey];
    const at = row[atKey];
    if (typeof id !== "string" || typeof at !== "string") continue;
    const existing = latest.get(id);
    if (!existing || Date.parse(at) > Date.parse(existing)) {
      latest.set(id, at);
    }
  }
  return latest;
};

const formatOverflow = (total: number, shown: number) => {
  const extra = total - shown;
  return extra > 0 ? ` +${extra} more.` : "";
};

const formatStaleOverflow = (total: number, shown: number) => {
  const extra = Math.min(Math.max(total - shown, 0), 3);
  return extra > 0 ? ` +${extra} more signals.` : "";
};

const joinTitles = (items: NeglectItem[]) =>
  items.map((item) => item.title).join(", ");

const uniqueNeglectItems = (items: NeglectItem[]) => {
  const seen = new Set<string>();
  const result: NeglectItem[] = [];
  for (const item of items) {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
};

const formatMissedDigestLine = (
  items: NeglectItem[],
  total: number,
  timeZone: string
) => {
  if (items.length === 0) return "Missed: Nothing is clearly missed yet.";
  const firstStartMs = parseTimestampMs(items[0]?.scheduledStartAt);
  const timePhrase =
    firstStartMs === null
      ? "an older block"
      : `an older ${formatLocalTime(firstStartMs, timeZone)} block`;
  const verb = items.length === 1 ? "was" : "were";
  return `Missed: ${joinTitles(items)} ${verb} missed from ${timePhrase}.${formatOverflow(
    total,
    items.length
  )}`;
};

const formatDueDigestLine = ({
  overdue,
  dueToday,
}: {
  overdue: NeglectItem[];
  dueToday: NeglectItem[];
}) => {
  const parts: string[] = [];
  if (dueToday.length > 0) {
    parts.push(`Due today: ${joinTitles(dueToday)}.`);
  }
  if (overdue.length > 0) {
    const overdueText = overdue
      .map((item) => `${item.title} is ${item.reason}`)
      .join(", ");
    parts.push(`Overdue: ${overdueText}.`);
  }
  return parts.length > 0 ? parts.join(" ") : null;
};

const formatStaleDigestLine = (items: NeglectItem[], total: number) => {
  if (items.length === 0) return null;
  const parts = items.map((item) => {
    if (item.type === "project") {
      return `${item.title} has no recent project movement evidence`;
    }
    if (item.type === "skill") {
      return `${item.title} has no recent XP`;
    }
    return `${item.title} has no recent evidence`;
  });
  return `Stale: ${parts.join("; ")}.${formatStaleOverflow(
    total,
    items.length
  )}`;
};

const firstTrustworthyMoveCandidate = (
  items: NeglectItem[],
  bucket: string
) => {
  const item = items.find((candidate) => !isPlaceholderMoveTitle(candidate.title));
  return item ? { item, bucket } : null;
};

const buildNeglectDigest = ({
  neglectIntelligence,
  timeZone,
  isRecoveryActive,
}: {
  neglectIntelligence: NeglectIntelligence;
  timeZone: string;
  isRecoveryActive: boolean;
}) => {
  const missed = neglectIntelligence.missedScheduledItems.slice(0, 3);
  const overdue = neglectIntelligence.overdueProjects.slice(0, 3);
  const dueToday = uniqueNeglectItems([
    ...neglectIntelligence.dueHabitsUnscheduledIncomplete,
    ...neglectIntelligence.dueUnscheduledProjects,
  ])
    .slice(0, Math.max(0, 3 - overdue.length));
  const staleCandidates = uniqueNeglectItems([
    ...neglectIntelligence.staleProjects,
    ...neglectIntelligence.staleSkills,
    ...neglectIntelligence.staleMonuments,
    ...neglectIntelligence.inactiveHighPriorityDomains,
  ]);
  const stale = staleCandidates.slice(0, 2);
  const counts = neglectIntelligence.bucketCounts;
  const missedTotal = Math.max(
    counts.missedScheduledItems,
    neglectIntelligence.missedScheduledItems.length
  );
  const staleTotal = Math.max(
    counts.staleProjects +
      counts.staleSkills +
      counts.staleMonuments +
      counts.inactiveHighPriorityDomains,
    staleCandidates.length
  );
  const moveCandidate =
    firstTrustworthyMoveCandidate(missed, "missedScheduledItems") ??
    firstTrustworthyMoveCandidate(
      neglectIntelligence.overdueProjects,
      "overdueProjects"
    ) ??
    firstTrustworthyMoveCandidate(
      neglectIntelligence.dueHabitsUnscheduledIncomplete,
      "dueHabitsUnscheduledIncomplete"
    ) ??
    firstTrustworthyMoveCandidate(
      neglectIntelligence.dueUnscheduledProjects,
      "dueUnscheduledProjects"
    ) ??
    firstTrustworthyMoveCandidate(
      neglectIntelligence.staleProjects,
      "staleProjects"
    );
  const moveItem = moveCandidate?.item ?? null;
  const moveLine = moveItem
    ? isRecoveryActive
      ? `Move: Protect sleep now. When awake, handle ${moveItem.title} first.`
      : moveCandidate?.bucket === "missedScheduledItems"
        ? `Move: Handle ${moveItem.title} first, then clear one due habit.`
        : `Move: Handle ${moveItem.title} first.`
    : isRecoveryActive
      ? "Move: Protect sleep now. When awake, open Schedule and clear the first due item."
      : "Move: Open Schedule and clear the first due item.";

  return [
    formatMissedDigestLine(missed, missedTotal, timeZone),
    formatDueDigestLine({ overdue, dueToday }),
    formatStaleDigestLine(stale, staleTotal),
    moveLine,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
};

const MAX_SUGGESTED_ACTIONS = 4;

const normalizeSuggestedSourceType = (
  type: NeglectItem["type"] | string | null | undefined
): SuggestedAction["sourceType"] | undefined => {
  const normalized = type?.trim().toUpperCase();
  if (!normalized) return undefined;
  if (normalized === "SCHEDULE_INSTANCE") return "SCHEDULE_INSTANCE";
  if (normalized === "PROJECT") return "PROJECT";
  if (normalized === "TASK") return "TASK";
  if (normalized === "HABIT") return "HABIT";
  if (normalized === "EVENT") return "EVENT";
  if (normalized === "SKILL") return "SKILL";
  if (normalized === "MONUMENT") return "MONUMENT";
  if (normalized === "GOAL") return "GOAL";
  return undefined;
};

const appendFocusLaunchParam = (
  params: URLSearchParams,
  key: string,
  value: string | null | undefined
) => {
  const trimmed = value?.trim();
  if (trimmed) params.set(key, trimmed);
};

const buildFocusLaunchHref = (block: OperatorStateBlock | null) => {
  if (!block?.startUtc || !block.endUtc || !block.label.trim()) return null;
  const blockId =
    block.timeBlockId ?? block.dayTypeTimeBlockId ?? block.windowId ?? block.id;
  if (!blockId) return null;
  const params = new URLSearchParams();
  params.set("launch", "time_block_start");
  params.set("start", block.startUtc);
  params.set("end", block.endUtc);
  params.set("blockLabel", block.label);
  appendFocusLaunchParam(params, "blockKey", blockId);
  appendFocusLaunchParam(params, "timeBlockId", block.timeBlockId);
  appendFocusLaunchParam(params, "dayTypeTimeBlockId", block.dayTypeTimeBlockId);
  appendFocusLaunchParam(params, "windowId", block.windowId);
  return `/focus-pomo?${params.toString()}`;
};

const INVALID_FOCUS_LABEL_PATTERNS = [
  "snapshot test",
  "placeholder",
  "event name",
  "demo",
  "test",
];

const MAX_STANDARD_FOCUS_DURATION_MS = 12 * 60 * 60 * 1000;

const isRecoveryBlockLabel = (label: string) =>
  /\b(sleep|bedtime|nap|recovery|recover|rest|shutdown)\b/i.test(label);

const getFocusBlockRejectionReason = (
  block: OperatorStateBlock | null,
  nowMs: number
) => {
  if (!block) return "missing_block";
  const label = block.label.trim();
  if (!label) return "missing_label";
  const normalizedLabel = label.toLowerCase();
  if (
    INVALID_FOCUS_LABEL_PATTERNS.some((pattern) =>
      normalizedLabel.includes(pattern)
    )
  ) {
    return "placeholder_label";
  }
  if (!block.startUtc || !block.endUtc) return "missing_time_bounds";
  const startMs = Date.parse(block.startUtc);
  const endMs = Date.parse(block.endUtc);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return "invalid_time_bounds";
  }
  if (endMs <= startMs) return "non_positive_range";
  if (endMs <= nowMs) return "ended";
  const durationMs = endMs - startMs;
  if (durationMs < 5 * 60 * 1000) return "too_short";
  if (
    durationMs > MAX_STANDARD_FOCUS_DURATION_MS &&
    !isRecoveryBlockLabel(label)
  ) {
    return "suspicious_duration";
  }
  return null;
};

const logRejectedStartFocusCandidate = (
  intentMode: OperatorIntentMode,
  block: OperatorStateBlock | null,
  reason: string
) => {
  console.info("AI operator rejected suggested action", {
    intentMode,
    kind: "start_focus",
    candidate: block
      ? {
          id: block.id,
          label: block.label,
        }
      : null,
    reason,
  });
};

export function buildSuggestedActions(
  operatorState: Omit<OperatorState, "suggestedActions">
): SuggestedAction[] {
  const suggestions: SuggestedAction[] = [];
  const seen = new Set<string>();
  const add = (action: SuggestedAction) => {
    if (suggestions.length >= MAX_SUGGESTED_ACTIONS) return;
    const dedupeKey = [
      action.kind,
      action.sourceType ?? "",
      action.sourceId ?? "",
      action.scheduleInstanceId ?? "",
      action.href ?? "",
    ].join(":");
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    suggestions.push(action);
  };

  const addRecovery = () => {
    const recoveryBlock =
      operatorState.activeRecoveryBlock ?? operatorState.currentBlock;
    const recoveryItem = operatorState.activeRecoveryItem;
    const recoveryBlockId =
      recoveryBlock?.id ?? recoveryItem?.blockId ?? recoveryItem?.id ?? "current";
    if (!operatorState.isRecoveryActive) return;
    const labelSource = recoveryItem?.title ?? recoveryBlock?.label ?? "recovery";
    const resumeAt = recoveryBlock?.endLocal ?? recoveryItem?.endLocal ?? null;
    add({
      id: `protect_recovery:block:${recoveryBlockId}`,
      kind: "protect_recovery",
      label: /\bsleep|bedtime|nap\b/i.test(labelSource)
        ? "Protect Sleep"
        : "Stay in recovery",
      reason: resumeAt
        ? `Current block is ${labelSource}. Resume after ${resumeAt}.`
        : `Current block is ${labelSource}. Keep this read-only and protect recovery.`,
      confidence: "high",
      readOnly: true,
      href: "/schedule",
      evidence: {
        blockId: recoveryBlockId,
        blockLabel: recoveryBlock?.label ?? recoveryItem?.blockLabel ?? null,
        startUtc: recoveryBlock?.startUtc ?? recoveryItem?.startUtc ?? null,
        endUtc: recoveryBlock?.endUtc ?? recoveryItem?.endUtc ?? null,
      },
    });
  };

  const neglect = operatorState.neglectIntelligence;
  const triageCandidate =
    neglect.dueHabitsUnscheduledIncomplete[0]
      ? {
          item: neglect.dueHabitsUnscheduledIncomplete[0],
          bucket: "dueHabitsUnscheduledIncomplete",
          reason: "Due today and not cleared yet.",
        }
      : neglect.dueUnscheduledProjects[0]
        ? {
            item: neglect.dueUnscheduledProjects[0],
            bucket: "dueUnscheduledProjects",
            reason: "Due today and not cleared yet.",
          }
        : neglect.overdueProjects[0]
          ? {
              item: neglect.overdueProjects[0],
              bucket: "overdueProjects",
              reason: "Overdue project with no scheduled recovery slot.",
            }
          : null;

  const addTriageCandidate = () => {
    if (!triageCandidate) return;
    add({
      id: `triage_due_today:${normalizeSuggestedSourceType(triageCandidate.item.type) ?? "GOAL"}:${triageCandidate.item.id}`,
      kind: "triage_due_today",
      label: `Clear ${triageCandidate.item.title}`,
      reason: triageCandidate.reason,
      confidence:
        triageCandidate.bucket === "overdueProjects" ? "medium" : "high",
      readOnly: true,
      sourceType: normalizeSuggestedSourceType(triageCandidate.item.type),
      sourceId: triageCandidate.item.id,
      href: "/schedule",
      evidence: { bucket: triageCandidate.bucket },
    });
  };

  const addFocusBlock = () => {
    const focusBlock = operatorState.currentBlock ?? operatorState.nextBlock;
    if (operatorState.isRecoveryActive) {
      logRejectedStartFocusCandidate(
        operatorState.intentMode,
        focusBlock,
        "recovery_active"
      );
      return;
    }
    const rejectionReason = getFocusBlockRejectionReason(
      focusBlock,
      operatorState.nowUtcMs
    );
    if (rejectionReason) {
      logRejectedStartFocusCandidate(
        operatorState.intentMode,
        focusBlock,
        rejectionReason
      );
      return;
    }
    const focusHref = buildFocusLaunchHref(focusBlock);
    if (!focusBlock || !focusHref) return;
    const isCurrentBlock = operatorState.currentBlock?.id === focusBlock.id;
    add({
      id: `start_focus:block:${focusBlock.id}`,
      kind: "start_focus",
      label: `Start Focus Pomo: ${focusBlock.label}`,
      reason: isCurrentBlock
        ? `Current block is active until ${focusBlock.endLocal}.`
        : `Next block starts at ${focusBlock.startLocal}.`,
      confidence: isCurrentBlock ? "high" : "medium",
      readOnly: true,
      href: focusHref,
      evidence: {
        blockId: focusBlock.id,
        blockLabel: focusBlock.label,
        startUtc: focusBlock.startUtc ?? null,
        endUtc: focusBlock.endUtc ?? null,
      },
    });
  };

  const addScheduleOpen = (reason = "Review today's block order.") => {
    add({
      id: "open_context:schedule",
      kind: "open_context",
      label: "Open Schedule",
      reason,
      confidence: "medium",
      readOnly: true,
      href: "/schedule",
    });
  };

  const addMyListOpen = () => {
    const context = operatorState.myListContext;
    add({
      id: "open_context:my_list",
      kind: "open_context",
      label: "Open My List",
      reason:
        context?.rows.length
          ? `${context.rows.length} client-provided My List rows are visible read-only.`
          : "Manual My List rows are unavailable to server context unless the client snapshot is present.",
      confidence: context?.rows.length ? "high" : "low",
      readOnly: true,
      href: "/schedule",
      unavailableReason:
        context?.source === "unavailable"
          ? "I cannot see manual My List rows yet."
          : undefined,
      evidence: { bucket: "myListContext" },
    });
  };

  const addCompletionPlaceholder = () => {
    if (!triageCandidate) return;
    if (triageCandidate.bucket === "overdueProjects") return;
    add({
      id: `complete_due_item:${normalizeSuggestedSourceType(triageCandidate.item.type) ?? "GOAL"}:${triageCandidate.item.id}`,
      kind: "complete_due_item",
      label: `Complete ${triageCandidate.item.title}`,
      reason: triageCandidate.reason,
      confidence: "low",
      readOnly: true,
      sourceType: normalizeSuggestedSourceType(triageCandidate.item.type),
      sourceId: triageCandidate.item.id,
      unavailableReason:
        "Completion writes need canonical XP/streak/schedule semantics first.",
      evidence: { bucket: triageCandidate.bucket },
    });
  };

  const addMissedReschedule = () => {
    const missedToday = operatorState.missedTodayItems[0];
    const missed = missedToday
      ? {
          id: missedToday.id,
          title: missedToday.title,
          scheduledStartAt: missedToday.startUtc ?? null,
          evidenceAt: missedToday.endUtc ?? null,
          blockLabel: missedToday.blockLabel ?? null,
        }
      : neglect.missedScheduledItems[0]
        ? {
            ...neglect.missedScheduledItems[0],
            blockLabel: null,
          }
        : null;
    if (!missed) return;
    add({
      id: `reschedule_missed_item:SCHEDULE_INSTANCE:${missed.id}`,
      kind: "reschedule_missed_item",
      label: `Reschedule ${missed.title}`,
      reason: missed.blockLabel
        ? `Missed from the earlier ${missed.blockLabel} block.`
        : "Missed from an earlier schedule block.",
      confidence: "low",
      readOnly: true,
      sourceType: "SCHEDULE_INSTANCE",
      scheduleInstanceId: missed.id,
      unavailableReason:
        "Reschedule writes need target block, conflict, and cascade rules first.",
      evidence: {
        bucket: "missedScheduledItems",
        startUtc: missed.scheduledStartAt ?? null,
        endUtc: missed.evidenceAt ?? null,
      },
    });
  };

  if (operatorState.intentMode === "next_action") {
    addRecovery();
    addFocusBlock();
    if (suggestions.length === 0) {
      addTriageCandidate();
      addScheduleOpen("Review due today before choosing a recovery slot.");
    }
  } else if (operatorState.intentMode === "schedule_summary") {
    addScheduleOpen("Review today's blocks and key schedule items.");
    addFocusBlock();
  } else if (operatorState.intentMode === "missed_today") {
    addMissedReschedule();
    addScheduleOpen("Review today's missed items before choosing a recovery slot.");
    addFocusBlock();
  } else if (operatorState.intentMode === "neglect") {
    addTriageCandidate();
    addMissedReschedule();
    addCompletionPlaceholder();
    addScheduleOpen("Review due, stale, and missed context.");
  } else if (operatorState.intentMode === "plan_day") {
    addScheduleOpen("Review the day before making a read-only plan.");
    addTriageCandidate();
    addMissedReschedule();
    addFocusBlock();
  } else if (operatorState.intentMode === "goals_projects") {
    addTriageCandidate();
    addScheduleOpen("Open project and goal context from the schedule.");
    addCompletionPlaceholder();
  } else if (operatorState.intentMode === "my_list") {
    addMyListOpen();
    addScheduleOpen("Cross-check My List against today's schedule.");
  } else {
    addRecovery();
    addTriageCandidate();
    addFocusBlock();
    addScheduleOpen();
    addCompletionPlaceholder();
    addMissedReschedule();
  }

  console.info("AI operator suggested actions", {
    intentMode: operatorState.intentMode,
    actions: suggestions.map((action) => ({
      id: action.id,
      kind: action.kind,
      label: action.label,
    })),
  });

  return suggestions;
}

const dedupeAndCapNeglectIntelligence = (
  source: NeglectIntelligence
): NeglectIntelligence => {
  let remaining = NEGLECT_TOTAL_ITEM_CAP;
  const seen = new Set<string>();
  const trim = (items: NeglectItem[], cap: number) => {
    const result: NeglectItem[] = [];
    for (const item of items) {
      if (result.length >= cap || remaining <= 0) break;
      const key = `${item.type}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(item);
      remaining -= 1;
    }
    return result;
  };

  return {
    ...source,
    missedScheduledItems: trim(source.missedScheduledItems, 5),
    overdueProjects: trim(source.overdueProjects, 5),
    dueUnscheduledProjects: trim(source.dueUnscheduledProjects, 5),
    dueHabitsUnscheduledIncomplete: trim(
      source.dueHabitsUnscheduledIncomplete,
      5
    ),
    staleProjects: trim(source.staleProjects, 5),
    staleGoals: trim(source.staleGoals, 5),
    staleSkills: trim(source.staleSkills, 5),
    staleMonuments: trim(source.staleMonuments, 5),
    inactiveHighPriorityDomains: trim(source.inactiveHighPriorityDomains, 3),
  };
};

async function buildNeglectIntelligence({
  supabase,
  userId,
  timeZone,
  dayKey,
  nowMs,
}: CreatorAiContextArgs & { nowMs: number }): Promise<NeglectIntelligence> {
  const base = emptyNeglectIntelligence(nowMs);
  const nowIso = new Date(nowMs).toISOString();
  const missedSinceIso = new Date(
    nowMs - NEGLECT_MISSED_SCHEDULE_LOOKBACK_DAYS * 86_400_000
  ).toISOString();
  const staleSinceMs =
    nowMs - NEGLECT_STALE_ACTIVITY_LOOKBACK_DAYS * 86_400_000;
  const staleProjectSinceMs = nowMs - STALE_PROJECT_DAYS * 86_400_000;
  const futureScheduleUntilIso = new Date(
    nowMs + NEGLECT_FUTURE_SCHEDULE_LOOKAHEAD_DAYS * 86_400_000
  ).toISOString();

  const [
    missedScheduleResponse,
    projectsResponse,
    futureProjectScheduleResponse,
    habitCompletionResponse,
    skillsResponse,
    monumentsResponse,
    skillXpResponse,
    monumentXpResponse,
    goalsResponse,
  ] = await Promise.all([
    supabase
      .from("schedule_instances")
      .select(
        "id,event_name,project_name,source_type,source_id,start_utc,end_utc,status,completed_at"
      )
      .eq("user_id", userId)
      .not("start_utc", "is", null)
      .not("end_utc", "is", null)
      .is("completed_at", null)
      .lte("end_utc", nowIso)
      .gte("end_utc", missedSinceIso)
      .neq("status", "completed")
      .order("end_utc", { ascending: false })
      .limit(12),
    supabase
      .from("projects")
      .select("id,name,goal_id,priority,due_date,completed_at,created_at,updated_at,global_rank")
      .eq("user_id", userId)
      .is("completed_at", null)
      .order("global_rank", { ascending: true, nullsFirst: false })
      .limit(50),
    supabase
      .from("schedule_instances")
      .select("id,source_id,start_utc,end_utc,status")
      .eq("user_id", userId)
      .eq("source_type", "PROJECT")
      .not("start_utc", "is", null)
      .not("end_utc", "is", null)
      .gte("end_utc", nowIso)
      .lte("start_utc", futureScheduleUntilIso)
      .limit(100),
    supabase
      .from("habit_completion_days")
      .select("habit_id,completion_day,completed_at")
      .eq("user_id", userId)
      .eq("completion_day", dayKey)
      .limit(100),
    supabase
      .from("skills")
      .select("id,name,icon,monument_id,updated_at,sort_order")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .limit(50),
    supabase
      .from("monuments")
      .select("id,title,priority_rank,updated_at")
      .eq("user_id", userId)
      .order("priority_rank", { ascending: true, nullsFirst: false })
      .limit(50),
    supabase
      .from("xp_events")
      .select("skill_id,created_at,amount")
      .eq("user_id", userId)
      .not("skill_id", "is", null)
      .gt("amount", 0)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("xp_events")
      .select("monument_id,skill_id,created_at,amount")
      .eq("user_id", userId)
      .gt("amount", 0)
      .order("created_at", { ascending: false })
      .limit(250),
    supabase
      .from("goals")
      .select("id,monument_id")
      .eq("user_id", userId)
      .limit(100),
  ]);

  const warnOptional = (label: string, error: unknown) => {
    if (!error) return;
    console.warn(`AI operator neglect intelligence ${label} failed`, {
      userId,
      ...compactDbError(error),
    });
  };

  warnOptional("missed schedule lookup", missedScheduleResponse.error);
  warnOptional("projects lookup", projectsResponse.error);
  warnOptional("future project schedule lookup", futureProjectScheduleResponse.error);
  warnOptional("habit completion lookup", habitCompletionResponse.error);
  warnOptional("skills lookup", skillsResponse.error);
  warnOptional("monuments lookup", monumentsResponse.error);
  warnOptional("skill xp lookup", skillXpResponse.error);
  warnOptional("monument xp lookup", monumentXpResponse.error);
  warnOptional("goals lookup", goalsResponse.error);

  const missedScheduledCandidates = ((missedScheduleResponse.data ?? []) as Array<{
    id: string;
    event_name: string | null;
    project_name: string | null;
    source_type: string | null;
    source_id: string | null;
    start_utc: string | null;
    end_utc: string | null;
    status: string | null;
    completed_at: string | null;
  }>)
    .filter(
      (row) =>
        row.start_utc &&
        row.end_utc &&
        !row.completed_at &&
        parseTimestampMs(row.end_utc) !== null &&
        parseTimestampMs(row.end_utc)! <= nowMs &&
        !isCanceledScheduleStatus(row.status)
    )
    .map<NeglectItem>((row) => ({
      id: row.id,
      type: "schedule_instance",
      title:
        row.event_name?.trim() ||
        row.project_name?.trim() ||
        resolveScheduleTypeTitle(row.source_type),
      reason: `scheduled item ended ${formatDaysAgo(row.end_utc, nowMs)} ago and is incomplete`,
      evidenceAt: row.end_utc,
      scheduledStartAt: row.start_utc,
      linkedIds:
        row.source_type === "PROJECT" && row.source_id
          ? compactLinkedIds({ projectId: row.source_id })
          : undefined,
    }));
  const missedScheduledItems = missedScheduledCandidates.slice(0, 5);

  const projects = (projectsResponse.data ?? []) as Array<{
    id: string;
    name: string;
    goal_id: string | null;
    priority: string | null;
    due_date: string | null;
    created_at: string | null;
    updated_at: string | null;
    global_rank: number | null;
  }>;
  const overdueProjectCandidates = projects
    .filter((project) => project.due_date && project.due_date.slice(0, 10) < dayKey)
    .map<NeglectItem>((project) => {
      const daysLate = dueDateDaysLate(project.due_date!, dayKey);
      return {
        id: project.id,
        type: "project",
        title: project.name,
        reason:
          daysLate === null
            ? "project due date is before today"
            : `overdue by ${daysLate} day${daysLate === 1 ? "" : "s"}`,
        dueAt: project.due_date,
        priority: project.priority,
        linkedIds: compactLinkedIds({
          goalId: project.goal_id ?? undefined,
          projectId: project.id,
        }),
      };
    });
  const overdueProjects = overdueProjectCandidates.slice(0, 5);

  const scheduledProjectIds = new Set(
    ((futureProjectScheduleResponse.data ?? []) as Array<{
      source_id: string | null;
      status: string | null;
    }>)
      .filter((row) => row.source_id && !isCanceledScheduleStatus(row.status))
      .map((row) => row.source_id!)
  );
  const dueUnscheduledProjectCandidates = projects
    .filter((project) => project.due_date && project.due_date.slice(0, 10) === dayKey)
    .filter((project) => !scheduledProjectIds.has(project.id))
    .map<NeglectItem>((project) => ({
      id: project.id,
      type: "project",
      title: project.name,
      reason: "due today with no active/future scheduled project block",
      dueAt: project.due_date,
      priority: project.priority,
      linkedIds: compactLinkedIds({
        goalId: project.goal_id ?? undefined,
        projectId: project.id,
      }),
    }));
  const dueUnscheduledProjects = dueUnscheduledProjectCandidates.slice(0, 5);

  let dueHabitsUnscheduledIncomplete: NeglectItem[] = [];
  let dueHabitsUnscheduledIncompleteCount = 0;
  try {
    const habits = await fetchHabitsForSchedule(
      userId,
      supabase as unknown as Parameters<typeof fetchHabitsForSchedule>[1]
    );
    const completedHabitIds = new Set(
      ((habitCompletionResponse.data ?? []) as Array<{ habit_id: string | null }>)
        .map((row) => row.habit_id)
        .filter((id): id is string => Boolean(id))
    );
    const scheduledHabitIds = new Set<string>();
    const habitScheduleResponse = await supabase
      .from("schedule_instances")
      .select("source_id,status,start_utc,end_utc")
      .eq("user_id", userId)
      .eq("source_type", "HABIT")
      .not("start_utc", "is", null)
      .not("end_utc", "is", null)
      .gte("end_utc", nowIso)
      .lte("start_utc", futureScheduleUntilIso)
      .limit(100);
    warnOptional("future habit schedule lookup", habitScheduleResponse.error);
    for (const row of (habitScheduleResponse.data ?? []) as Array<{
      source_id: string | null;
      status: string | null;
    }>) {
      if (row.source_id && !isCanceledScheduleStatus(row.status)) {
        scheduledHabitIds.add(row.source_id);
      }
    }

    const dueHabitCandidates = habits
      .filter((habit) => {
        const evaluation = evaluateHabitDueOnDate({
          habit,
          date: makeDateInTimeZone(
            { ...parseDayKey(dayKey)!, hour: 12, minute: 0 },
            timeZone
          ),
          timeZone,
          windowDays: habit.window?.days ?? null,
          nextDueOverride: habit.nextDueOverride
            ? new Date(habit.nextDueOverride)
            : null,
        });
        return (
          evaluation.isDue &&
          !completedHabitIds.has(habit.id) &&
          !scheduledHabitIds.has(habit.id)
        );
      })
      .map<NeglectItem>((habit) => ({
        id: habit.id,
        type: "habit",
        title: habit.name,
        reason: "due today, incomplete, and not scheduled in the active/future window",
        dueAt: dayKey,
        linkedIds: compactLinkedIds({
          goalId: habit.goalId ?? undefined,
          skillId: habit.skillId ?? undefined,
          monumentId: habit.skillMonumentId ?? undefined,
        }),
      }));
    dueHabitsUnscheduledIncompleteCount = dueHabitCandidates.length;
    dueHabitsUnscheduledIncomplete = dueHabitCandidates.slice(0, 5);
  } catch (error) {
    warnOptional("habit due evaluation", error);
  }

  const projectIds = projects.map((project) => project.id);
  const [projectCompletionResponse, projectTasksResponse] = await Promise.all([
    projectIds.length > 0
      ? supabase
          .from("completion_events")
          .select("source_id,completed_at")
          .eq("user_id", userId)
          .eq("source_type", "PROJECT")
          .is("revoked_at", null)
          .in("source_id", projectIds)
          .order("completed_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length > 0
      ? supabase
          .from("tasks")
          .select("id,project_id,completed_at")
          .eq("user_id", userId)
          .in("project_id", projectIds)
          .not("completed_at", "is", null)
          .order("completed_at", { ascending: false })
          .limit(150)
      : Promise.resolve({ data: [], error: null }),
  ]);
  warnOptional("project completion lookup", projectCompletionResponse.error);
  warnOptional("project task completion lookup", projectTasksResponse.error);
  const latestProjectCompletionById = mapLatestById(
    projectCompletionResponse.data as Array<{
      source_id: string;
      completed_at: string;
    }>,
    "source_id",
    "completed_at"
  );
  const latestTaskCompletionByProjectId = mapLatestById(
    projectTasksResponse.data as Array<{
      project_id: string;
      completed_at: string;
    }>,
    "project_id",
    "completed_at"
  );
  const staleProjectCandidates = projects
    .map((project) => ({
      project,
      evidenceAt: latestIso(
        project.created_at,
        project.updated_at,
        latestProjectCompletionById.get(project.id),
        latestTaskCompletionByProjectId.get(project.id)
      ),
    }))
    .filter(({ evidenceAt }) => {
      const evidenceMs = parseTimestampMs(evidenceAt);
      return evidenceMs !== null && evidenceMs < staleProjectSinceMs;
    })
    .sort((a, b) => {
      const priorityDelta =
        priorityRank(a.project.priority) - priorityRank(b.project.priority);
      if (priorityDelta !== 0) return priorityDelta;
      const aEvidenceMs = parseTimestampMs(a.evidenceAt) ?? nowMs;
      const bEvidenceMs = parseTimestampMs(b.evidenceAt) ?? nowMs;
      const ageDelta = aEvidenceMs - bEvidenceMs;
      if (ageDelta !== 0) return ageDelta;
      const aDue = a.project.due_date ? 0 : 1;
      const bDue = b.project.due_date ? 0 : 1;
      if (aDue !== bDue) return aDue - bDue;
      return (a.project.global_rank ?? Number.MAX_SAFE_INTEGER) -
        (b.project.global_rank ?? Number.MAX_SAFE_INTEGER);
    })
    .map<NeglectItem>(({ project, evidenceAt }) => ({
      id: project.id,
      type: "project",
      title: project.name,
      reason: `no recent project movement evidence in ${formatDaysAgo(
        evidenceAt,
        nowMs
      )}`,
      evidenceAt,
      dueAt: project.due_date,
      priority: project.priority,
      linkedIds: compactLinkedIds({
        goalId: project.goal_id ?? undefined,
        projectId: project.id,
      }),
    }));
  const staleProjects = staleProjectCandidates.slice(0, 5);

  const skillLatestXp = mapLatestById(
    skillXpResponse.data as Array<{ skill_id: string; created_at: string }>,
    "skill_id",
    "created_at"
  );
  const skills = (skillsResponse.data ?? []) as Array<{
    id: string;
    name: string;
    monument_id: string | null;
  }>;
  const staleSkillCandidates = skills
    .map((skill) => ({
      skill,
      evidenceAt: skillLatestXp.get(skill.id) ?? null,
    }))
    .filter(({ evidenceAt }) => {
      const evidenceMs = parseTimestampMs(evidenceAt);
      return evidenceMs === null || evidenceMs < staleSinceMs;
    })
    .map<NeglectItem>(({ skill, evidenceAt }) => ({
      id: skill.id,
      type: "skill",
      title: skill.name,
      reason: `no recent positive XP evidence in ${formatDaysAgo(
        evidenceAt,
        nowMs
      )}`,
      evidenceAt,
      linkedIds: compactLinkedIds({
        skillId: skill.id,
        monumentId: skill.monument_id ?? undefined,
      }),
    }));
  const staleSkills = staleSkillCandidates.slice(0, 5);

  const monuments = (monumentsResponse.data ?? []) as Array<{
    id: string;
    title: string;
    priority_rank: number | null;
  }>;
  const goalsById = rowsById(
    (goalsResponse.data ?? []) as Array<{ id: string; monument_id: string | null }>
  );
  const monumentEvidence = new Map<string, string>();
  const recordMonumentEvidence = (
    monumentId: string | null | undefined,
    at: string | null | undefined
  ) => {
    if (!monumentId || !at) return;
    const existing = monumentEvidence.get(monumentId);
    if (!existing || Date.parse(at) > Date.parse(existing)) {
      monumentEvidence.set(monumentId, at);
    }
  };
  for (const row of (monumentXpResponse.data ?? []) as Array<{
    monument_id: string | null;
    skill_id: string | null;
    created_at: string;
  }>) {
    recordMonumentEvidence(row.monument_id, row.created_at);
    if (row.skill_id) {
      const linkedSkill = skills.find((skill) => skill.id === row.skill_id);
      recordMonumentEvidence(linkedSkill?.monument_id, row.created_at);
    }
  }
  for (const { project, evidenceAt } of projects.map((project) => ({
    project,
    evidenceAt: latestIso(
      latestProjectCompletionById.get(project.id),
      latestTaskCompletionByProjectId.get(project.id)
    ),
  }))) {
    const goal = project.goal_id ? goalsById.get(project.goal_id) : null;
    recordMonumentEvidence(goal?.monument_id, evidenceAt);
  }

  const staleMonumentItems = monuments
    .map((monument) => ({
      monument,
      evidenceAt: monumentEvidence.get(monument.id) ?? null,
    }))
    .filter(({ evidenceAt }) => {
      const evidenceMs = parseTimestampMs(evidenceAt);
      return evidenceMs === null || evidenceMs < staleSinceMs;
    })
    .map<NeglectItem>(({ monument, evidenceAt }) => ({
      id: monument.id,
      type: "monument",
      title: monument.title,
      reason: `no recent XP/completion evidence tied to this life domain in ${formatDaysAgo(
        evidenceAt,
        nowMs
      )}`,
      evidenceAt,
      priority: monument.priority_rank,
      linkedIds: { monumentId: monument.id },
    }));
  const staleMonuments = staleMonumentItems.slice(0, 5);
  const inactiveHighPriorityDomainCandidates = staleMonumentItems.filter(
    ({ priority }) => typeof priority === "number" && priority <= 3
  );
  const inactiveHighPriorityDomains =
    inactiveHighPriorityDomainCandidates.slice(0, 3);

  return dedupeAndCapNeglectIntelligence({
    ...base,
    missedScheduledItems,
    overdueProjects,
    dueUnscheduledProjects,
    dueHabitsUnscheduledIncomplete,
    staleProjects,
    staleSkills,
    staleMonuments,
    inactiveHighPriorityDomains,
    bucketCounts: {
      missedScheduledItems: missedScheduledCandidates.length,
      overdueProjects: overdueProjectCandidates.length,
      dueUnscheduledProjects: dueUnscheduledProjectCandidates.length,
      dueHabitsUnscheduledIncomplete: dueHabitsUnscheduledIncompleteCount,
      staleProjects: staleProjectCandidates.length,
      staleSkills: staleSkillCandidates.length,
      staleMonuments: staleMonumentItems.length,
      inactiveHighPriorityDomains: inactiveHighPriorityDomainCandidates.length,
    },
  });
}

function buildOperatorState({
  nowMs,
  timeZone,
  dayParts,
  windows,
  instances,
  neglectIntelligence,
  intentMode,
  myListContext,
}: {
  nowMs: number;
  timeZone: string;
  dayParts: NonNullable<ReturnType<typeof parseDayKey>>;
  windows: CompactWindow[];
  instances: ScheduleSnapshotInstance[];
  neglectIntelligence: NeglectIntelligence;
  intentMode: OperatorIntentMode;
  myListContext: OperatorMyListContext;
}): OperatorState {
  const blockRanges = windows
    .map((window) => {
      const range = getWindowUtcRange(window, dayParts, timeZone);
      return range
        ? {
            ...window,
            ...range,
          }
        : null;
    })
    .filter(
      (window): window is CompactWindow & { startMs: number; endMs: number } =>
        window !== null
    );
  const blockById = new Map<
    string,
    CompactWindow & { startMs: number; endMs: number }
  >();
  for (const window of blockRanges) {
    blockById.set(window.id, window);
    if (window.day_type_time_block_id) {
      blockById.set(window.day_type_time_block_id, window);
    }
  }

  const actionable = instances.filter(
    (item) =>
      isIncompleteScheduleInstance(item) &&
      !isCanceledScheduleStatus(item.status)
  );
  const blockLabelForItem = (item: ScheduleSnapshotInstance) => {
    const key = getBlockLookupKey(item);
    return key ? blockById.get(key)?.label ?? null : null;
  };
  const toOperatorItem = (item: ScheduleSnapshotInstance): OperatorStateItem => ({
    id: item.id,
    title: item.title,
    type: item.source_type,
    sourceId: item.source_id ?? null,
    status: item.status,
    startLocal: formatLocalTime(item.start_utc_ms, timeZone),
    endLocal: formatLocalTime(item.end_utc_ms, timeZone),
    timeRange: formatTimeRange(item.start_utc_ms, item.end_utc_ms, timeZone),
    timing: formatItemTiming(item, nowMs),
    start_utc_ms: item.start_utc_ms,
    end_utc_ms: item.end_utc_ms,
    startUtc: item.start_utc,
    endUtc: item.end_utc,
    skillName: item.skill_name ?? null,
    skillIcon: item.skill_icon ?? null,
    blockId: getBlockLookupKey(item),
    blockLabel: blockLabelForItem(item),
    timeBlockId: item.parent_time_block_id ?? null,
    dayTypeTimeBlockId: item.parent_day_type_time_block_id ?? null,
    windowId: item.parent_window_id ?? null,
  });
  const toOperatorBlock = (
    block: CompactWindow & { startMs: number; endMs: number },
    timing: string
  ): OperatorStateBlock => ({
    id: block.id,
    label: block.label,
    kind: block.kind ?? null,
    startLocal: formatLocalTime(block.startMs, timeZone),
    endLocal: formatLocalTime(block.endMs, timeZone),
    timeRange: formatTimeRange(block.startMs, block.endMs, timeZone),
    timing,
    itemCount: actionable.filter((item) => {
      const key = getBlockLookupKey(item);
      return key === block.id || key === block.day_type_time_block_id;
    }).length,
    startUtc: new Date(block.startMs).toISOString(),
    endUtc: new Date(block.endMs).toISOString(),
    timeBlockId: block.day_type_time_block_id ? null : block.id,
    dayTypeTimeBlockId: block.day_type_time_block_id ?? null,
    windowId: block.day_type_time_block_id ? null : block.id,
  });
  const formatBlockName = (label: string) => `**${label.toUpperCase()}**`;
  const formatOperatorItemName = (item: OperatorStateItem) =>
    item.skillIcon ? `${item.skillIcon} ${item.title}` : item.title;
  const formatOperatorItemAt = (item: OperatorStateItem) =>
    `${formatOperatorItemName(item)} at ${item.startLocal}, ${item.timing}`;
  const formatOperatorItemRange = (item: OperatorStateItem) =>
    `${formatOperatorItemName(item)} ${item.timeRange}`;
  const formatInsideItems = (items: OperatorStateItem[], max = 6) =>
    items
      .slice(0, max)
      .map((item) => `${formatOperatorItemName(item)} ${item.startLocal}`)
      .join("; ");
  const blockItems = (
    block: OperatorStateBlock | null,
    items: OperatorStateItem[]
  ) =>
    block
      ? items.filter(
          (item) => item.blockId === block.id || item.blockLabel === block.label
        )
      : [];

  const currentBlockSource =
    blockRanges.find((block) => block.startMs <= nowMs && block.endMs > nowMs) ??
    null;
  const nextBlockSource =
    blockRanges
      .filter((block) => block.startMs > nowMs)
      .sort((a, b) => a.startMs - b.startMs)[0] ?? null;
  const currentItems = instances
    .filter((item) => isCurrentNeglectCandidate(item, nowMs))
    .sort((a, b) => a.start_utc_ms - b.start_utc_ms)
    .map(toOperatorItem)
    .slice(0, 8);
  const missedItems = instances
    .filter((item) => isMissedNeglectCandidate(item, nowMs))
    .sort((a, b) => b.end_utc_ms - a.end_utc_ms);
  const localDayStartMs = makeDateInTimeZone(
    { ...dayParts, hour: 0, minute: 0 },
    timeZone
  ).getTime();
  const localDayEndMs = addDaysInTimeZone(
    new Date(localDayStartMs),
    1,
    timeZone
  ).getTime();
  const missedTodayItems = missedItems
    .filter(
      (item) =>
        item.end_utc_ms >= localDayStartMs &&
        item.end_utc_ms < localDayEndMs
    )
    .map(toOperatorItem)
    .slice(0, 8);
  const upcoming = instances
    .filter((item) => isUpcomingNeglectCandidate(item, nowMs))
    .sort((a, b) => a.start_utc_ms - b.start_utc_ms);
  const nextBlockId = nextBlockSource?.id ?? null;
  const nextBlockDayTypeId = nextBlockSource?.day_type_time_block_id ?? null;
  const nextItemsSource = nextBlockSource
    ? upcoming.filter((item) => {
        const key = getBlockLookupKey(item);
        return key === nextBlockId || key === nextBlockDayTypeId;
      })
    : upcoming;
  const todaySkills = Array.from(
    new Set(
      instances
        .map((item) => item.skill_name?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ).slice(0, 12);
  const todayItemCountsByType = instances.reduce<Record<string, number>>(
    (counts, item) => {
      const key = item.source_type?.trim().toLowerCase() || "scheduled_item";
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    },
    {}
  );
  const tonightItems = instances
    .filter((item) => {
      const localStartHour = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "2-digit",
        hourCycle: "h23",
      }).formatToParts(new Date(item.start_utc_ms));
      const hour = Number.parseInt(
        localStartHour.find((part) => part.type === "hour")?.value ?? "",
        10
      );
      return Number.isFinite(hour) && hour >= 17;
    })
    .sort((a, b) => a.start_utc_ms - b.start_utc_ms)
    .map(toOperatorItem)
    .slice(0, 6);

  const currentBlock = currentBlockSource
    ? toOperatorBlock(
        currentBlockSource,
        `started ${formatDuration((nowMs - currentBlockSource.startMs) / 60_000)} ago; ends in ${formatDuration((currentBlockSource.endMs - nowMs) / 60_000)}`
      )
    : null;
  const nextBlock = nextBlockSource
    ? toOperatorBlock(
        nextBlockSource,
        `starts in ${formatDuration((nextBlockSource.startMs - nowMs) / 60_000)}`
      )
    : null;
  const nextItems = nextItemsSource.map(toOperatorItem).slice(0, 6);
  const lastMissedItems = missedItems.map(toOperatorItem).slice(0, 5);
  const upcomingItems = upcoming.map(toOperatorItem).slice(0, 8);
  const addUniqueScheduleItems = (
    target: ScheduleSnapshotInstance[],
    source: ScheduleSnapshotInstance[],
    max: number
  ) => {
    const seen = new Set(target.map((item) => item.id));
    for (const item of source) {
      if (target.length >= max) break;
      if (seen.has(item.id)) continue;
      target.push(item);
      seen.add(item.id);
    }
  };
  const upcomingOrCurrent = [...currentItems, ...upcomingItems]
    .map((item) => instances.find((candidate) => candidate.id === item.id))
    .filter((item): item is ScheduleSnapshotInstance => Boolean(item));
  const importantWorkItems = actionable
    .filter((item) => {
      const type = item.source_type?.trim().toUpperCase();
      return (
        (type === "PROJECT" || type === "TASK") &&
        item.end_utc_ms > nowMs
      );
    })
    .sort((a, b) => {
      const priorityDelta = priorityRank(a.priority) - priorityRank(b.priority);
      return priorityDelta !== 0 ? priorityDelta : a.start_utc_ms - b.start_utc_ms;
    });
  const eveningItems = instances
    .filter((item) => {
      const localStartHour = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "2-digit",
        hourCycle: "h23",
      }).formatToParts(new Date(item.start_utc_ms));
      const hour = Number.parseInt(
        localStartHour.find((part) => part.type === "hour")?.value ?? "",
        10
      );
      return (
        Number.isFinite(hour) &&
        hour >= 17 &&
        isIncompleteScheduleInstance(item) &&
        !isCanceledScheduleStatus(item.status)
      );
    })
    .sort((a, b) => a.start_utc_ms - b.start_utc_ms);
  const scheduleSummarySources: ScheduleSnapshotInstance[] = [];
  addUniqueScheduleItems(scheduleSummarySources, upcomingOrCurrent.slice(0, 3), 8);
  addUniqueScheduleItems(scheduleSummarySources, importantWorkItems.slice(0, 3), 8);
  addUniqueScheduleItems(scheduleSummarySources, eveningItems, 8);
  const scheduleSummaryItems = scheduleSummarySources.map(toOperatorItem);
  const activeRecoveryItemSource =
    actionable.find(
      (item) =>
        item.start_utc_ms <= nowMs &&
        item.end_utc_ms > nowMs &&
        isRecoverySnapshotItem(item, blockLabelForItem(item))
    ) ?? null;
  const activeRecoveryItem = activeRecoveryItemSource
    ? toOperatorItem(activeRecoveryItemSource)
    : currentItems.find((item) => isRecoveryOperatorItem(item)) ?? null;
  const activeRecoveryBlock =
    currentBlock && isRecoveryWindow(currentBlockSource)
      ? currentBlock
      : activeRecoveryItem?.blockId && currentBlock
        ? currentBlock
        : null;
  const activeRecoveryLabel =
    activeRecoveryItem?.title ?? activeRecoveryBlock?.label ?? null;
  const isRecoveryActive = Boolean(activeRecoveryItem || activeRecoveryBlock);
  const recoveryInstruction = isRecoveryActive
    ? recoveryInstructionForLabel(activeRecoveryLabel)
    : null;

  const currentBlockItems = blockItems(currentBlock, currentItems);
  const nextBlockItems = blockItems(nextBlock, nextItems);
  const currentLine = currentBlock
    ? [
        `${formatBlockName(currentBlock.label)} until ${currentBlock.endLocal} (${currentBlock.timing})`,
        currentBlockItems.length > 0
          ? `Inside: ${formatInsideItems(currentBlockItems)}`
          : null,
      ]
        .filter((value): value is string => Boolean(value))
        .join(". ")
    : currentItems.length > 0
      ? currentItems
          .slice(0, 3)
          .map((item) => `${formatOperatorItemRange(item)}, ${item.timing}`)
          .join("; ")
      : "none";
  const missedLine =
    lastMissedItems.length > 0
      ? lastMissedItems
          .slice(0, 3)
          .map(formatOperatorItemAt)
          .join("; ")
      : "none";
  const missedTodayLine =
    missedTodayItems.length > 0
      ? missedTodayItems
          .slice(0, 8)
          .map(formatOperatorItemAt)
          .join("; ")
      : "none";
  const nextLine = nextBlock
    ? [
        `${formatBlockName(nextBlock.label)} starts at ${nextBlock.startLocal} (${nextBlock.timing})`,
        nextBlockItems.length > 0
          ? `Inside: ${formatInsideItems(nextBlockItems)}`
          : null,
      ]
        .filter((value): value is string => Boolean(value))
        .join(". ")
    : upcomingItems.length > 0
      ? formatOperatorItemAt(upcomingItems[0])
      : "none";
  const tonightLine =
    tonightItems.length > 0
      ? tonightItems
          .slice(0, 6)
          .map(formatOperatorItemRange)
          .join("; ")
      : "none";
  const summaryLine =
    scheduleSummaryItems.length > 0
      ? scheduleSummaryItems
          .slice(0, 8)
          .map((item) => {
            const blockLabel = item.blockLabel
              ? `${formatBlockName(item.blockLabel)} — `
              : "";
            return `${blockLabel}${formatOperatorItemRange(item)}`;
          })
          .join("; ")
      : "none";
  const skillsLine = todaySkills.length > 0 ? todaySkills.join(", ") : "none";
  const countsLine = `${instances.length} items, ${windows.length} blocks`;
  const showingKeyItems =
    scheduleSummaryItems.length > 0 &&
    actionable.length > scheduleSummaryItems.length
      ? " showing key items"
      : "";
  const neglectDigest = buildNeglectDigest({
    neglectIntelligence,
    timeZone,
    isRecoveryActive,
  });

  const operatorState: Omit<OperatorState, "suggestedActions"> = {
    intentMode,
    nowUtcMs: nowMs,
    nowLocal: formatNowLocal(nowMs, timeZone),
    dayPhase: getDayPhase(nowMs, timeZone),
    currentBlock,
    currentItems,
    activeRecoveryItem,
    activeRecoveryBlock,
    isRecoveryActive,
    recoveryInstruction,
    nextBlock,
    nextItems,
    lastMissedItems,
    missedTodayItems,
    upcomingItems,
    scheduleSummaryItems,
    tonightItems,
    todaySkills,
    todayItemCountsByType,
    neglectCheck: {
      missedItems: lastMissedItems,
      currentItems,
      upcomingItems: upcomingItems.slice(0, 5),
      rule:
        "Missed only if end_utc_ms <= now_utc_ms. Current only if start_utc_ms <= now_utc_ms < end_utc_ms. Upcoming only if start_utc_ms > now_utc_ms. Future items are not neglected.",
      FUTURE_ITEMS_ARE_NOT_NEGLECTED: true,
      recoveryActive: isRecoveryActive,
    },
    neglectIntelligence,
    neglectDigest,
    myListContext,
    scheduleDigest: [
      `Now: ${currentLine}.`,
      `Missed: ${missedLine}.`,
      `Missed today: ${missedTodayLine}.`,
      `Next: ${nextLine}.`,
      `Later${showingKeyItems}: ${summaryLine}.`,
      `Skills: ${skillsLine}.`,
      `Move: use Now first, then Next. Do not summarize with vague groups.`,
      `Tonight detail: ${tonightLine}.`,
      `Counts: ${countsLine}.`,
    ].join("\n"),
  };

  return {
    ...operatorState,
    suggestedActions: buildSuggestedActions(operatorState),
  };
}

function enforceContextCap(context: CreatorAiContext): CreatorAiContext {
  const copy: CreatorAiContext = {
    ...context,
    operator_state: {
      ...context.operator_state,
      currentItems: [...context.operator_state.currentItems],
      nextItems: [...context.operator_state.nextItems],
      lastMissedItems: [...context.operator_state.lastMissedItems],
      missedTodayItems: [...context.operator_state.missedTodayItems],
      upcomingItems: [...context.operator_state.upcomingItems],
      scheduleSummaryItems: [...context.operator_state.scheduleSummaryItems],
      tonightItems: [...context.operator_state.tonightItems],
      todaySkills: [...context.operator_state.todaySkills],
      suggestedActions: [...context.operator_state.suggestedActions],
      myListContext: context.operator_state.myListContext
        ? {
            ...context.operator_state.myListContext,
            rows: [...context.operator_state.myListContext.rows],
          }
        : undefined,
      neglectCheck: {
        ...context.operator_state.neglectCheck,
        missedItems: [...context.operator_state.neglectCheck.missedItems],
        currentItems: [...context.operator_state.neglectCheck.currentItems],
        upcomingItems: [...context.operator_state.neglectCheck.upcomingItems],
      },
      neglectDigest: context.operator_state.neglectDigest,
      neglectIntelligence: {
        ...context.operator_state.neglectIntelligence,
        missedScheduledItems: [
          ...context.operator_state.neglectIntelligence.missedScheduledItems,
        ],
        overdueProjects: [
          ...context.operator_state.neglectIntelligence.overdueProjects,
        ],
        dueUnscheduledProjects: [
          ...context.operator_state.neglectIntelligence.dueUnscheduledProjects,
        ],
        dueHabitsUnscheduledIncomplete: [
          ...context.operator_state.neglectIntelligence
            .dueHabitsUnscheduledIncomplete,
        ],
        staleProjects: [
          ...context.operator_state.neglectIntelligence.staleProjects,
        ],
        staleGoals: [...context.operator_state.neglectIntelligence.staleGoals],
        staleSkills: [
          ...context.operator_state.neglectIntelligence.staleSkills,
        ],
        staleMonuments: [
          ...context.operator_state.neglectIntelligence.staleMonuments,
        ],
        inactiveHighPriorityDomains: [
          ...context.operator_state.neglectIntelligence
            .inactiveHighPriorityDomains,
        ],
        bucketCounts: {
          ...context.operator_state.neglectIntelligence.bucketCounts,
        },
        unavailableBuckets: [
          ...context.operator_state.neglectIntelligence.unavailableBuckets,
        ],
      },
    },
    windows: [...context.windows],
    schedule_instances: [...context.schedule_instances],
    goals: [...context.goals],
    projects: [...context.projects],
    habits: [...context.habits],
    dayTypes: [...context.dayTypes],
    dayTypeTimeBlocks: [...context.dayTypeTimeBlocks],
    recentCompletions: [...context.recentCompletions],
  };

  const trimOrder: Array<keyof CreatorAiContext> = [
    "recentCompletions",
    "dayTypeTimeBlocks",
    "dayTypes",
    "habits",
    "projects",
    "goals",
    "schedule_instances",
    "windows",
  ];

  const trimOperatorStateArrays = () => {
    const candidates = [
      copy.operator_state.neglectCheck.upcomingItems,
      copy.operator_state.neglectCheck.currentItems,
      copy.operator_state.neglectCheck.missedItems,
      copy.operator_state.scheduleSummaryItems,
      copy.operator_state.upcomingItems,
      copy.operator_state.missedTodayItems,
      copy.operator_state.lastMissedItems,
      copy.operator_state.tonightItems,
      copy.operator_state.nextItems,
      copy.operator_state.currentItems,
      copy.operator_state.todaySkills,
      copy.operator_state.suggestedActions,
      copy.operator_state.neglectIntelligence.inactiveHighPriorityDomains,
      copy.operator_state.neglectIntelligence.staleMonuments,
      copy.operator_state.neglectIntelligence.staleSkills,
      copy.operator_state.neglectIntelligence.staleProjects,
      copy.operator_state.neglectIntelligence.dueHabitsUnscheduledIncomplete,
      copy.operator_state.neglectIntelligence.dueUnscheduledProjects,
      copy.operator_state.neglectIntelligence.overdueProjects,
      copy.operator_state.neglectIntelligence.missedScheduledItems,
    ];
    const target = candidates.find((items) => items.length > 0);
    if (!target) return false;
    target.pop();
    return true;
  };

  while (
    JSON.stringify(copy).length > AI_INTENT_MAX_SERIALIZED_CONTEXT_CHARS
  ) {
    const key = trimOrder.find(
      (candidate) =>
        Array.isArray(copy[candidate]) && copy[candidate].length > 0
    );
    if (!key) break;
    (copy[key] as unknown[]).pop();
  }

  while (
    JSON.stringify(copy).length > AI_INTENT_MAX_SERIALIZED_CONTEXT_CHARS &&
    trimOperatorStateArrays()
  ) {
    // Keep the hard context cap by removing duplicated operator-state lists.
  }

  if (
    JSON.stringify(copy).length > AI_INTENT_MAX_SERIALIZED_CONTEXT_CHARS &&
    copy.operator_state.scheduleDigest.length > 1200
  ) {
    copy.operator_state.scheduleDigest = `${copy.operator_state.scheduleDigest.slice(
      0,
      1200
    )}\n[truncated to fit context cap]`;
  }

  if (JSON.stringify(copy).length > AI_INTENT_MAX_SERIALIZED_CONTEXT_CHARS) {
    return {
      dayKey: context.dayKey,
      timeZone: context.timeZone,
      operator_state: {
        ...copy.operator_state,
        currentItems: [],
        nextItems: [],
        lastMissedItems: [],
        missedTodayItems: [],
        upcomingItems: [],
        scheduleSummaryItems: [],
        tonightItems: [],
        todaySkills: [],
        suggestedActions: [],
        neglectCheck: {
          ...copy.operator_state.neglectCheck,
          missedItems: [],
          currentItems: [],
          upcomingItems: [],
        },
        neglectIntelligence: {
          ...copy.operator_state.neglectIntelligence,
          missedScheduledItems: [],
          overdueProjects: [],
          dueUnscheduledProjects: [],
          dueHabitsUnscheduledIncomplete: [],
          staleProjects: [],
          staleGoals: [],
          staleSkills: [],
          staleMonuments: [],
          inactiveHighPriorityDomains: [],
        },
        neglectDigest: copy.operator_state.neglectDigest,
        scheduleDigest: [
          `Current: ${copy.operator_state.currentBlock?.label ?? "none"}.`,
          `Next: ${copy.operator_state.nextBlock?.label ?? "none"}.`,
          `Recovery active: ${copy.operator_state.isRecoveryActive ? "yes" : "no"}.`,
        ].join("\n"),
      },
      windows: [],
      schedule_instances: [],
      goals: [],
      projects: [],
      habits: [],
      dayTypes: [],
      dayTypeTimeBlocks: [],
      recentCompletions: [],
    };
  }

  return copy;
}

function logScheduleSummaryIconDebug(context: CreatorAiContext) {
  const summaryItems = context.operator_state.scheduleSummaryItems;
  const currentItems = context.operator_state.currentItems;
  const nextItems = context.operator_state.nextItems;
  const upcomingItems = context.operator_state.upcomingItems;
  const missedTodayItems = context.operator_state.missedTodayItems;
  const countWithIcon = (items: OperatorStateItem[]) =>
    items.filter((item) => Boolean(item.skillIcon?.trim())).length;

  console.info("AI operator schedule summary icon debug", {
    scheduleSummaryItemCount: summaryItems.length,
    scheduleSummaryItemsWithSkillIcon: countWithIcon(summaryItems),
    currentItemsWithSkillIcon: countWithIcon(currentItems),
    nextItemsWithSkillIcon: countWithIcon(nextItems),
    upcomingItemsWithSkillIcon: countWithIcon(upcomingItems),
    missedTodayItemsWithSkillIcon: countWithIcon(missedTodayItems),
    scheduleInstanceCount: context.schedule_instances.length,
    scheduleInstancesWithSkillIcon: context.schedule_instances.filter((item) =>
      Boolean(item.skill_icon?.trim())
    ).length,
    items: summaryItems.map((item) => ({
      title: item.title,
      hasSkillIcon: Boolean(item.skillIcon?.trim()),
    })),
  });
}

export async function getCreatorAiContext({
  supabase,
  userId,
  timeZone,
  dayKey,
  nowMs: providedNowMs,
  intentMode = "general",
  myListContext = { source: "unavailable", rows: [], capped: false },
}: CreatorAiContextArgs): Promise<CreatorAiContext> {
  const dayParts = parseDayKey(dayKey);
  if (!dayParts) {
    throw new Error("Invalid dayKey");
  }

  const windowDate = makeDateInTimeZone(
    {
      year: dayParts.year,
      month: dayParts.month,
      day: dayParts.day,
      hour: 4,
      minute: 0,
    },
    timeZone
  );
  const dayStart = windowDate;
  const dayEnd = addDaysInTimeZone(dayStart, 1, timeZone);

  const [
    windowsResult,
    scheduleResult,
    goalsResponse,
    projectsResponse,
    dayTypesResponse,
    dayTypeTimeBlocksResponse,
    habitsResponse,
    completionsResponse,
  ] = await Promise.all([
    fetchWindowsForDate(
      windowDate,
      supabase as unknown as Parameters<typeof fetchWindowsForDate>[1],
      timeZone,
      {
        userId,
        useDayTypes: true,
      } as Parameters<typeof fetchWindowsForDate>[3]
    ).catch((error) => {
      console.error("AI operator context error fetching windows", error);
      return [] as WindowLite[];
    }),
    fetchInstancesForRange(
      userId,
      dayStart.toISOString(),
      dayEnd.toISOString(),
      supabase as unknown as Parameters<typeof fetchInstancesForRange>[3],
      { suppressQueryLog: true }
    ).catch((error) => {
      console.error("AI operator context error fetching schedule", error);
      return { data: [], error: null };
    }),
    supabase
      .from("goals")
      .select(
        "id,name,emoji,priority,energy,priority_code,energy_code,why,active,status,weight,weight_boost,due_date,monument_id,created_at"
      )
      .eq("user_id", userId)
      .or("active.is.true,status.is.null,status.neq.completed")
      .order("weight", { ascending: false, nullsFirst: false })
      .limit(8),
    supabase
      .from("projects")
      .select(
        "id,name,goal_id,priority,energy,stage,why,duration_min,due_date,global_rank,completed_at,total_weight,updated_at"
      )
      .eq("user_id", userId)
      .is("completed_at", null)
      .order("global_rank", { ascending: true, nullsFirst: false })
      .limit(8),
    supabase
      .from("day_types")
      .select("id,name,days,is_default,is_temporary,temporary_date_key")
      .eq("user_id", userId)
      .limit(8),
    supabase
      .from("day_type_time_blocks")
      .select(
        "id,day_type_id,time_block_label,block_type,energy,time_blocks(id,label,start_local,end_local)"
      )
      .eq("user_id", userId)
      .limit(16),
    supabase
      .from("habits")
      .select(
        "id,name,goal_id,skill_id,type,habit_type,recurrence,recurrence_mode,recurrence_days,duration_minutes,energy,current_streak_days,last_completed_at,updated_at"
      )
      .eq("user_id", userId)
      .is("circle_id", null)
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase
      .from("completion_events")
      .select(
        "id,source_type,source_id,completed_at,duration_min,productivity_day_key,was_scheduled"
      )
      .eq("user_id", userId)
      .is("revoked_at", null)
      .order("completed_at", { ascending: false })
      .limit(8),
  ]);

  if (goalsResponse.error) {
    console.error("AI operator context error loading goals", goalsResponse.error);
  }
  if (projectsResponse.error) {
    console.error(
      "AI operator context error loading projects",
      projectsResponse.error
    );
  }
  if (dayTypesResponse.error) {
    console.error(
      "AI operator context error loading day types",
      dayTypesResponse.error
    );
  }
  if (dayTypeTimeBlocksResponse.error) {
    console.error(
      "AI operator context error loading day type blocks",
      dayTypeTimeBlocksResponse.error
    );
  }
  if (habitsResponse.error) {
    console.error("AI operator context error loading habits", habitsResponse.error);
  }
  if (completionsResponse.error) {
    console.error(
      "AI operator context error loading completions",
      completionsResponse.error
    );
  }

  const scheduleRows = (scheduleResult.data ?? []) as ScheduleInstance[];
  const nowMs = providedNowMs ?? Date.now();
  const nextInstanceId =
    scheduleRows
      .filter(isUncompletedScheduleInstance)
      .filter((record) => parseTimestampMs(record.start_utc) !== null)
      .filter((record) => parseTimestampMs(record.start_utc)! > nowMs)
      .sort(
        (a, b) =>
          parseTimestampMs(a.start_utc)! - parseTimestampMs(b.start_utc)!
      )[0]?.id ?? null;
  const scheduleLookups = await fetchScheduleEntityLookups({
    supabase,
    userId,
    instances: scheduleRows,
  });
  const windows = windowsResult.map(compactWindow);
  const scheduleInstances = scheduleRows
    .map((record) =>
      mapScheduleInstanceToSnapshot(
        record,
        scheduleLookups,
        nowMs,
        nextInstanceId
      )
    )
    .filter((entry): entry is ScheduleSnapshotInstance => entry !== null)
    .sort((a, b) => a.start_utc_ms - b.start_utc_ms);
  const neglectIntelligence = await buildNeglectIntelligence({
    supabase,
    userId,
    timeZone,
    dayKey,
    nowMs,
  });

  const context: CreatorAiContext = {
    dayKey,
    timeZone,
    operator_state: buildOperatorState({
      nowMs,
      timeZone,
      dayParts,
      windows,
      instances: scheduleInstances,
      neglectIntelligence,
      intentMode,
      myListContext,
    }),
    windows,
    schedule_instances: scheduleInstances,
    goals: goalsResponse.data ?? [],
    projects: projectsResponse.data ?? [],
    habits: habitsResponse.data ?? [],
    dayTypes: dayTypesResponse.data ?? [],
    dayTypeTimeBlocks: (dayTypeTimeBlocksResponse.data ?? []).map((row) => ({
      id: row.id,
      day_type_id: row.day_type_id,
      label: row.time_block_label ?? row.time_blocks?.label ?? "",
      block_type: row.block_type,
      energy: row.energy,
      start_local: row.time_blocks?.start_local ?? "",
      end_local: row.time_blocks?.end_local ?? "",
    })),
    recentCompletions: completionsResponse.data ?? [],
  };

  const cappedContext = enforceContextCap(context);
  logScheduleSummaryIconDebug(cappedContext);
  return cappedContext;
}
