import { getSupabaseBrowser } from "@/lib/supabase";

export type FocusPomoQueueKind = "chore" | "habit" | "project";

export interface FocusPomoQueueItem {
  id: string;
  kind: FocusPomoQueueKind;
  sourceType: "HABIT" | "PROJECT";
  workType?: string | null;
  title: string;
  subtitle: string;
  durationMinutes: number | null;
  durationLabel: string;
  energyLabel: string | null;
  statusLabel: string;
  status?: string | null;
  completedAt?: string | null;
  completed_at?: string | null;
  icon?: string | null;
  skillId?: string | null;
  skillName?: string | null;
  skillIcon?: string | null;
  goalId?: string | null;
  goalTitle?: string | null;
  goalIcon?: string | null;
  goal_emoji?: string | null;
  goalPriorityRank?: number | null;
  goal_priority_rank?: number | null;
  goalGlobalRank?: number | null;
  goal_global_rank?: number | null;
  goalDueDate?: string | null;
  goal_due_date?: string | null;
  goalCreatedAt?: string | null;
  goal_created_at?: string | null;
  goalUpdatedAt?: string | null;
  goal_updated_at?: string | null;
  goalMonumentId?: string | null;
  goal_monument_id?: string | null;
  goalMonumentName?: string | null;
  goal_monument_name?: string | null;
  goalMonumentIcon?: string | null;
  goal_monument_icon?: string | null;
  priorityLabel?: string | null;
  priority?: string | number | null;
  priorityRank?: number | null;
  priority_rank?: number | null;
  importance?: number | string | null;
  deadline?: string | null;
  dueDate?: string | null;
  due_date?: string | null;
  dueAt?: string | null;
  due_at?: string | null;
  targetDate?: string | null;
  target_date?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
  energyCode?: string | null;
  tags?: FocusPomoQueueTag[];
  habit_type?: string | null;
  habitType?: string | null;
  recurrence?: string | null;
  recurrence_days?: number[] | null;
  lastCompletedAt?: string | null;
  last_completed_at?: string | null;
  nextDueOverride?: string | null;
  next_due_override?: string | null;
  rawTypeLabel?: string | null;
  goal?: FocusPomoQueueRelation | null;
  goal_id?: string | null;
  goal_name?: string | null;
  projectId?: string | null;
  project_id?: string | null;
  projectName?: string | null;
  project_name?: string | null;
  projectOrder?: number | null;
  project_order?: number | null;
  projectGlobalRank?: number | null;
  project_global_rank?: number | null;
  taskId?: string | null;
  task_id?: string | null;
  taskOrder?: number | null;
  task_order?: number | null;
  campaign?: FocusPomoQueueRelation | null;
  campaignId?: string | null;
  campaign_id?: string | null;
  campaignName?: string | null;
  campaign_name?: string | null;
  campaign_goal_ids?: string[];
  campaign_monument_id?: string | null;
  campaign_circle_id?: string | null;
  campaign_roadmap_id?: string | null;
  routine?: FocusPomoQueueRelation | null;
  routineId?: string | null;
  routine_id?: string | null;
  routineName?: string | null;
  routine_name?: string | null;
}

type QueueSourceType = "monument" | "skill";

type SupabaseBrowserClient = NonNullable<ReturnType<typeof getSupabaseBrowser>>;

type QueryResponse<T> = {
  data: T[] | null;
  error: { message?: string } | null;
};

type HabitRow = {
  id?: string | null;
  name?: string | null;
  habit_type?: string | null;
  recurrence?: string | null;
  recurrence_days?: number[] | null;
  last_completed_at?: string | null;
  next_due_override?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  duration_minutes?: number | string | null;
  energy?: LookupValue;
  skill_id?: string | null;
  goal_id?: string | null;
  campaign_id?: string | null;
  routine_id?: string | null;
  tags?: unknown;
  icon?: string | null;
  emoji?: string | null;
};

type ProjectRow = {
  id?: string | null;
  name?: string | null;
  title?: string | null;
  duration_min?: number | string | null;
  duration_minutes?: number | string | null;
  energy?: LookupValue;
  priority?: LookupValue;
  goal_id?: string | null;
  campaign_id?: string | null;
  tags?: unknown;
  completed_at?: string | null;
  due_date?: string | null;
  deadline?: string | null;
  target_date?: string | null;
  global_rank?: number | string | null;
  sort_order?: number | string | null;
  position?: number | string | null;
  order_index?: number | string | null;
  display_order?: number | string | null;
  sequence?: number | string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type LookupValue = string | number | { name?: string | null } | null;

type SkillRow = {
  id?: string | null;
  name?: string | null;
  icon?: string | null;
  emoji?: string | null;
};

type GoalRow = {
  id?: string | null;
  name?: string | null;
  title?: string | null;
  emoji?: string | null;
  icon_emoji?: string | null;
  icon?: string | null;
  symbol?: string | null;
  monument_id?: string | null;
  monument?: {
    id?: string | null;
    name?: string | null;
    title?: string | null;
    emoji?: string | null;
    icon_emoji?: string | null;
    icon?: string | null;
    symbol?: string | null;
  } | null;
  circle_id?: string | null;
  roadmap_id?: string | null;
  priority_rank?: number | string | null;
  global_rank?: number | string | null;
  due_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type CampaignRow = {
  id?: string | null;
  name?: string | null;
  title?: string | null;
  emoji?: string | null;
  icon_emoji?: string | null;
  icon?: string | null;
  symbol?: string | null;
  goal_id?: string | null;
  goal_ids?: string[];
  monument_id?: string | null;
  primary_monument_id?: string | null;
  circle_id?: string | null;
  primary_circle_id?: string | null;
  roadmap_id?: string | null;
};

type RoutineRow = {
  id?: string | null;
  name?: string | null;
  title?: string | null;
};

type ProjectSkillRow = {
  project_id?: string | null;
  skill_id?: string | null;
};

export type FocusPomoQueueTag = {
  id?: string | null;
  name: string;
  color?: string | null;
};

export type FocusPomoQueueRelation = {
  id?: string | null;
  name: string;
  icon?: string | null;
  monumentId?: string | null;
  monumentName?: string | null;
  monumentIcon?: string | null;
};

const HABIT_BASE_COLUMNS =
  "id, name, habit_type, recurrence, recurrence_days, last_completed_at, next_due_override, created_at, updated_at, duration_minutes, energy, skill_id";

const HABIT_SELECTS = [
  `${HABIT_BASE_COLUMNS}, goal_id, campaign_id, routine_id, tags, icon, emoji`,
  `${HABIT_BASE_COLUMNS}, goal_id, campaign_id, routine_id, icon, emoji`,
  `${HABIT_BASE_COLUMNS}, goal_id, routine_id, icon, emoji`,
  `${HABIT_BASE_COLUMNS}, routine_id, icon, emoji`,
  `${HABIT_BASE_COLUMNS}, icon, emoji`,
  `${HABIT_BASE_COLUMNS}, icon`,
  `${HABIT_BASE_COLUMNS}, emoji`,
  HABIT_BASE_COLUMNS,
];

const PROJECT_SELECTS = [
  {
    columns:
      "id, name, title, duration_min, duration_minutes, energy, priority, goal_id, campaign_id, tags, completed_at, due_date, global_rank, created_at, updated_at",
    filterCompleted: true,
  },
  {
    columns:
      "id, name, title, duration_min, duration_minutes, energy, priority, goal_id, campaign_id, tags, completed_at, due_date, global_rank, created_at",
    filterCompleted: true,
  },
  {
    columns:
      "id, name, title, duration_min, duration_minutes, energy, priority, goal_id, campaign_id, completed_at, due_date, global_rank, created_at",
    filterCompleted: true,
  },
  {
    columns: "id, name, duration_min, energy, priority, goal_id, completed_at",
    filterCompleted: true,
  },
  {
    columns: "id, name, duration_min, energy, goal_id, completed_at",
    filterCompleted: true,
  },
  {
    columns: "id, name, duration_min, energy, priority, goal_id",
    filterCompleted: false,
  },
  {
    columns: "id, name, duration_min, energy, goal_id",
    filterCompleted: false,
  },
];

const ENERGY_CODES = ["NO", "LOW", "MEDIUM", "HIGH", "ULTRA", "EXTREME"];
const PRIORITY_CODES = [
  "NO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
  "ULTRA-CRITICAL",
];
const INVALID_HABIT_TYPE_CODES = new Set(["ROUTINE", "ROUTINES"]);

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readRelationIcon(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  return (
    readString(record.icon_emoji) ??
    readString(record.emoji) ??
    readString(record.icon) ??
    readString(record.symbol)
  );
}

function readGoalMonumentId(goal: GoalRow | undefined): string | null {
  return readString(goal?.monument?.id) ?? readString(goal?.monument_id);
}

function readGoalMonumentName(goal: GoalRow | undefined): string | null {
  return (
    readString(goal?.monument?.title) ??
    readString(goal?.monument?.name)
  );
}

function readGoalMonumentIcon(goal: GoalRow | undefined): string | null {
  return readRelationIcon(goal?.monument);
}

function readPositiveMinutes(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : null;

  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed);
}

function readFiniteNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(parsed) ? parsed : null;
}

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "No duration";
  return `${minutes} min`;
}

function readLookupValue(value: LookupValue | undefined): string | null {
  return typeof value === "object" && value !== null
    ? readString(value.name)
    : typeof value === "number"
      ? String(value)
      : readString(value);
}

function formatLookupLabel(raw: string | null): string | null {
  if (!raw) return null;

  const normalized = raw.trim().toUpperCase();
  if (normalized === "ULTRA-CRITICAL") return "Ultra";

  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function lookupCodeFromIndex(
  value: string | number | null,
  codes: string[]
): string | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(numeric)) return null;
  return codes[numeric - 1] ?? null;
}

function formatEnergy(
  value: HabitRow["energy"] | ProjectRow["energy"]
): string | null {
  const raw = readLookupValue(value);
  return formatLookupLabel(lookupCodeFromIndex(raw, ENERGY_CODES) ?? raw);
}

function formatPriority(value: ProjectRow["priority"]): string | null {
  const raw = readLookupValue(value);
  const normalized =
    lookupCodeFromIndex(raw, PRIORITY_CODES) ?? raw?.trim().toUpperCase();
  if (!normalized || normalized === "NO") return null;
  return formatLookupLabel(normalized);
}

function formatHabitType(value: string | null): string | null {
  return formatLookupLabel(value);
}

function normalizeHabitTypeCode(value: string | null): string | null {
  const normalized = value?.trim().toUpperCase() ?? null;
  if (!normalized || INVALID_HABIT_TYPE_CODES.has(normalized)) return null;
  return normalized;
}

function readEnergyCode(
  value: HabitRow["energy"] | ProjectRow["energy"]
): string | null {
  const valueLabel = readLookupValue(value);
  const raw =
    (lookupCodeFromIndex(valueLabel, ENERGY_CODES) ?? valueLabel)
      ?.trim()
      .toUpperCase()
      .replace(/\s+/g, "-") ?? null;

  return raw && raw.length > 0 ? raw : null;
}

function readTagOptions(value: unknown): FocusPomoQueueTag[] {
  const values = Array.isArray(value)
    ? value
    : value === undefined || value === null
      ? []
      : [value];

  return values
    .map((entry): FocusPomoQueueTag | null => {
      if (typeof entry === "string" || typeof entry === "number") {
        const name = readString(String(entry));
        return name ? { id: name, name } : null;
      }

      if (typeof entry !== "object" || entry === null) return null;

      const record = entry as Record<string, unknown>;
      const id =
        readString(record.id) ??
        readString(record.tag_id) ??
        readString(record.tagId);
      const name =
        readString(record.name) ??
        readString(record.label) ??
        readString(record.title) ??
        readString(record.value) ??
        id;
      if (!name) return null;

      return {
        id,
        name,
        color: readString(record.color) ?? readString(record.colour),
      };
    })
    .filter((tag): tag is FocusPomoQueueTag => Boolean(tag));
}

function buildRelation(
  id: string | null,
  name: string | null,
  icon?: string | null,
  metadata?: Pick<
    FocusPomoQueueRelation,
    "monumentId" | "monumentName" | "monumentIcon"
  >
): FocusPomoQueueRelation | null {
  const relationName = name ?? id;
  if (!relationName) return null;
  return {
    id,
    name: relationName,
    icon: icon ?? null,
    monumentId: metadata?.monumentId ?? null,
    monumentName: metadata?.monumentName ?? null,
    monumentIcon: metadata?.monumentIcon ?? null,
  };
}

function compareQueueItems(
  a: FocusPomoQueueItem,
  b: FocusPomoQueueItem
): number {
  const kindOrder: Record<FocusPomoQueueKind, number> = {
    chore: 0,
    habit: 1,
    project: 2,
  };

  return (
    kindOrder[a.kind] - kindOrder[b.kind] ||
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) ||
    a.id.localeCompare(b.id)
  );
}

export type FocusPomoExecutionSortContext = {
  selectedMonumentIds?: string[];
  monumentOptions?: Array<
    {
      id: string;
      name?: string | null;
      title?: string | null;
      created_at?: string | null;
      createdAt?: string | null;
      sort_order?: number | string | null;
      display_order?: number | string | null;
      order_index?: number | string | null;
      position?: number | string | null;
      sequence?: number | string | null;
    }
  >;
  goalOrderMap?: ReadonlyMap<string, number>;
  projectOrderMap?: ReadonlyMap<string, number>;
  taskOrderMap?: ReadonlyMap<string, number>;
  now?: Date;
};

type FocusPomoExecutionSortKey = {
  bucket: number;
  monumentOrder: number;
  goalOrder: number;
  projectOrder: number;
  taskOrder: number;
  deadlineMs: number;
  priorityOrder: number;
  createdMs: number;
  updatedMs: number;
  title: string;
  id: string;
};

const DAILY_RECURRENCE_VALUES = new Set(["", "daily", "everyday"]);
const NONE_RECURRENCE_NEVER_DUE_TYPES = new Set([
  "HABIT",
  "CHORE",
  "SYNC",
  "MEMO",
]);

function readRecordString(
  record: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = readString(record[key]);
    if (value) return value;
  }

  return null;
}

function readRecordNumber(
  record: Record<string, unknown>,
  keys: string[]
): number | null {
  for (const key of keys) {
    const value = readFiniteNumber(record[key]);
    if (value !== null) return value;
  }

  return null;
}

function readRecordTimestamp(
  record: Record<string, unknown>,
  keys: string[]
): number {
  for (const key of keys) {
    const value = readString(record[key]);
    if (!value) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return Number.POSITIVE_INFINITY;
}

function readItemMonumentIds(item: FocusPomoQueueItem): string[] {
  const record = item as unknown as Record<string, unknown>;
  const ids = [
    readString(item.goalMonumentId),
    readString(item.goal_monument_id),
    readRecordString(record, [
      "monumentId",
      "monument_id",
      "campaign_monument_id",
      "primary_monument_id",
    ]),
  ];
  const options = record.monuments;
  if (Array.isArray(options)) {
    for (const option of options) {
      if (typeof option === "object" && option !== null) {
        ids.push(readString((option as Record<string, unknown>).id));
      }
    }
  }

  return Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
}

function normalizeRecurrenceValue(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "daily";
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addUtcMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function parseEveryDays(value: string): number | null {
  const match = /^every\s+(\d+)\s+days?$/i.exec(value.trim());
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function recurrenceInterval(
  recurrence: string,
  recurrenceDays: number[] | null | undefined
): { days?: number; months?: number } {
  if (DAILY_RECURRENCE_VALUES.has(recurrence)) return { days: 1 };
  if (recurrence === "weekly") return { days: 7 };
  if (recurrence === "bi-weekly") return { days: 14 };
  if (recurrence === "monthly") return { months: 1 };
  if (recurrence === "bi-monthly") return { months: 2 };
  if (recurrence === "every 6 months") return { months: 6 };
  if (recurrence === "yearly") return { months: 12 };
  if (recurrence === "every x days") {
    const interval = Array.isArray(recurrenceDays)
      ? recurrenceDays.find((day) => Number.isFinite(day) && day > 0)
      : null;
    return interval ? { days: interval } : { days: 1 };
  }

  const everyDays = parseEveryDays(recurrence);
  return everyDays ? { days: everyDays } : { days: 1 };
}

function isPracticeQueueItem(item: FocusPomoQueueItem): boolean {
  const raw = item.habitType ?? item.habit_type ?? "";
  return raw.trim().toUpperCase() === "PRACTICE";
}

function isNoneRecurrenceNeverDueQueueItem(item: FocusPomoQueueItem): boolean {
  const raw = item.habitType ?? item.habit_type ?? "HABIT";
  return NONE_RECURRENCE_NEVER_DUE_TYPES.has(raw.trim().toUpperCase());
}

function startOfLocalDayMs(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();
}

function isHabitDueNow(item: FocusPomoQueueItem, now: Date): boolean {
  const record = item as unknown as Record<string, unknown>;
  const override = readRecordString(record, [
    "nextDueOverride",
    "next_due_override",
    "next_due",
    "due_at",
    "dueAt",
    "due_date",
    "dueDate",
  ]);
  if (override) {
    const overrideMs = Date.parse(override);
    if (Number.isFinite(overrideMs)) {
      return overrideMs <= now.getTime();
    }
  }

  const recurrence = normalizeRecurrenceValue(readString(item.recurrence));
  if (
    recurrence === "none" &&
    !isPracticeQueueItem(item) &&
    isNoneRecurrenceNeverDueQueueItem(item)
  ) {
    return false;
  }

  const lastCompletedAt = readRecordString(record, [
    "lastCompletedAt",
    "last_completed_at",
  ]);
  if (!lastCompletedAt) return true;

  const lastCompletedMs = Date.parse(lastCompletedAt);
  if (!Number.isFinite(lastCompletedMs)) return false;

  const recurrenceDays = Array.isArray(item.recurrence_days)
    ? item.recurrence_days
    : null;
  const todayStart = startOfLocalDayMs(now);
  if (
    DAILY_RECURRENCE_VALUES.has(recurrence) &&
    startOfLocalDayMs(new Date(lastCompletedMs)) >= todayStart
  ) {
    return false;
  }
  if (
    recurrence === "weekly" &&
    recurrenceDays &&
    recurrenceDays.length > 0 &&
    !recurrenceDays.includes(now.getDay())
  ) {
    return false;
  }

  const interval = recurrenceInterval(recurrence, recurrenceDays);
  const nextDue =
    typeof interval.days === "number"
      ? addUtcDays(new Date(lastCompletedMs), interval.days)
      : addUtcMonths(new Date(lastCompletedMs), interval.months ?? 1);

  return nextDue.getTime() <= now.getTime();
}

function isHabitItem(item: FocusPomoQueueItem): boolean {
  return item.sourceType === "HABIT" || item.kind === "habit" || item.kind === "chore";
}

function isCompletedQueueItem(item: FocusPomoQueueItem): boolean {
  const record = item as unknown as Record<string, unknown>;
  const completedAt = readRecordString(record, ["completedAt", "completed_at"]);
  if (completedAt) return true;

  const status = readRecordString(record, ["status", "statusLabel"]);
  const normalizedStatus = status?.trim().toUpperCase();
  return (
    normalizedStatus === "COMPLETE" ||
    normalizedStatus === "COMPLETED" ||
    normalizedStatus === "DONE" ||
    normalizedStatus === "FINISHED"
  );
}

function isQueueItemEligibleToRun(
  item: FocusPomoQueueItem,
  now: Date
): boolean {
  if (isCompletedQueueItem(item)) return false;
  if (isHabitItem(item)) return isHabitDueNow(item, now);
  return true;
}

function filterEligibleQueueItems(
  items: FocusPomoQueueItem[],
  now: Date
): FocusPomoQueueItem[] {
  return items.filter((item) => isQueueItemEligibleToRun(item, now));
}

function isChoreItem(item: FocusPomoQueueItem): boolean {
  const raw = (item.habitType ?? item.habit_type ?? item.kind ?? "")
    .trim()
    .toUpperCase();
  return raw === "CHORE";
}

function isRoadmapWorkItem(item: FocusPomoQueueItem): boolean {
  if (isHabitItem(item)) return false;
  const record = item as unknown as Record<string, unknown>;
  return Boolean(
    readString(item.goalId) ??
      readString(item.goal_id) ??
      readString(item.projectId) ??
      readString(item.project_id) ??
      readString(item.taskId) ??
      readString(item.task_id) ??
      readRecordString(record, ["goalId", "goal_id", "projectId", "project_id"])
  );
}

function mapLookupOrder(
  id: string | null,
  map: ReadonlyMap<string, number> | undefined
): number | null {
  if (!id || !map) return null;
  const value = map.get(id);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getMonumentOrder(
  item: FocusPomoQueueItem,
  context: FocusPomoExecutionSortContext
): number {
  const selectedOrder = new Map(
    (context.selectedMonumentIds ?? []).map((id, index) => [id, index])
  );
  const optionOrder = new Map<string, number>();
  for (const [index, option] of (context.monumentOptions ?? []).entries()) {
    const explicitOrder =
      readFiniteNumber(option.sort_order) ??
      readFiniteNumber(option.display_order) ??
      readFiniteNumber(option.order_index) ??
      readFiniteNumber(option.position) ??
      readFiniteNumber(option.sequence);
    optionOrder.set(option.id, explicitOrder ?? index);
  }

  for (const id of readItemMonumentIds(item)) {
    const selected = selectedOrder.get(id);
    if (selected !== undefined) return selected;
    const option = optionOrder.get(id);
    if (option !== undefined) return option;
  }

  return Number.POSITIVE_INFINITY;
}

function getGoalOrder(
  item: FocusPomoQueueItem,
  context: FocusPomoExecutionSortContext
): number {
  const goalId = readString(item.goalId) ?? readString(item.goal_id);
  const monumentId = readItemMonumentIds(item)[0] ?? null;
  const roadmapOrder =
    mapLookupOrder(
      goalId && monumentId ? `${monumentId}:${goalId}` : null,
      context.goalOrderMap
    ) ?? mapLookupOrder(goalId, context.goalOrderMap);
  if (roadmapOrder !== null) return roadmapOrder;

  return (
    readFiniteNumber(item.goalPriorityRank) ??
    readFiniteNumber(item.goal_priority_rank) ??
    readFiniteNumber(item.goalGlobalRank) ??
    readFiniteNumber(item.goal_global_rank) ??
    Number.POSITIVE_INFINITY
  );
}

function priorityOrder(item: FocusPomoQueueItem): number {
  const record = item as unknown as Record<string, unknown>;
  const raw =
    readRecordString(record, [
      "priorityLabel",
      "priority",
      "priority_code",
      "priorityCode",
      "importance",
    ]) ?? "";
  const normalized = raw.trim().toUpperCase().replace(/[\s_]+/g, "-");
  const numeric = readFiniteNumber(raw);
  if (numeric !== null) return Math.max(0, 6 - numeric);

  switch (normalized) {
    case "ULTRA-CRITICAL":
      return 0;
    case "CRITICAL":
      return 1;
    case "HIGH":
      return 2;
    case "MEDIUM":
      return 3;
    case "LOW":
      return 4;
    case "NO":
      return 5;
    default:
      return Number.POSITIVE_INFINITY;
  }
}

export function getFocusPomoExecutionSortKey(
  item: FocusPomoQueueItem,
  context: FocusPomoExecutionSortContext = {}
): FocusPomoExecutionSortKey {
  const now = context.now ?? new Date();
  const dueHabit = isHabitItem(item) && isHabitDueNow(item, now);
  const bucket = dueHabit
    ? isChoreItem(item)
      ? 0
      : 1
    : isRoadmapWorkItem(item)
      ? 2
      : 3;
  const record = item as unknown as Record<string, unknown>;
  const projectId = readString(item.projectId) ?? readString(item.project_id);
  const taskId = readString(item.taskId) ?? readString(item.task_id);

  return {
    bucket,
    monumentOrder: getMonumentOrder(item, context),
    goalOrder: getGoalOrder(item, context),
    projectOrder:
      mapLookupOrder(projectId, context.projectOrderMap) ??
      readFiniteNumber(item.projectOrder) ??
      readFiniteNumber(item.project_order) ??
      readRecordNumber(record, [
        "sort_order",
        "position",
        "order_index",
        "display_order",
        "sequence",
      ]) ??
      Number.POSITIVE_INFINITY,
    taskOrder:
      mapLookupOrder(taskId, context.taskOrderMap) ??
      readFiniteNumber(item.taskOrder) ??
      readFiniteNumber(item.task_order) ??
      Number.POSITIVE_INFINITY,
    deadlineMs: readRecordTimestamp(record, [
      "deadline",
      "dueDate",
      "due_date",
      "dueAt",
      "due_at",
      "targetDate",
      "target_date",
      "goalDueDate",
      "goal_due_date",
    ]),
    priorityOrder: priorityOrder(item),
    createdMs: readRecordTimestamp(record, [
      "createdAt",
      "created_at",
      "goalCreatedAt",
      "goal_created_at",
    ]),
    updatedMs: readRecordTimestamp(record, [
      "updatedAt",
      "updated_at",
      "goalUpdatedAt",
      "goal_updated_at",
    ]),
    title: item.title,
    id: item.id,
  };
}

function compareSortKey(
  a: FocusPomoExecutionSortKey,
  b: FocusPomoExecutionSortKey
): number {
  return (
    a.bucket - b.bucket ||
    a.monumentOrder - b.monumentOrder ||
    a.goalOrder - b.goalOrder ||
    a.projectOrder - b.projectOrder ||
    a.taskOrder - b.taskOrder ||
    a.deadlineMs - b.deadlineMs ||
    a.priorityOrder - b.priorityOrder ||
    a.createdMs - b.createdMs ||
    a.updatedMs - b.updatedMs ||
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) ||
    a.id.localeCompare(b.id)
  );
}

export function sortFocusPomoQueue(
  items: FocusPomoQueueItem[],
  context: FocusPomoExecutionSortContext = {}
): FocusPomoQueueItem[] {
  return items
    .map((item, index) => ({
      item,
      index,
      sortKey: getFocusPomoExecutionSortKey(item, context),
    }))
    .sort((a, b) => compareSortKey(a.sortKey, b.sortKey) || a.index - b.index)
    .map(({ item }) => item);
}

function mapHabit(
  row: HabitRow,
  options: {
    skillById: Map<string, SkillRow>;
    goalById: Map<string, GoalRow>;
    campaignById: Map<string, CampaignRow>;
    routineById: Map<string, RoutineRow>;
  }
): FocusPomoQueueItem | null {
  const id = readString(row.id);
  const title = readString(row.name);
  if (!id || !title) return null;

  const durationMinutes = readPositiveMinutes(row.duration_minutes);
  const habitType = normalizeHabitTypeCode(readString(row.habit_type));
  const rawTypeLabel = formatHabitType(habitType) ?? "Habit";
  const kind: FocusPomoQueueKind = habitType === "CHORE" ? "chore" : "habit";
  const skillId = readString(row.skill_id);
  const skill = skillId ? options.skillById.get(skillId) : undefined;
  const goalId = readString(row.goal_id);
  const goal = goalId ? options.goalById.get(goalId) : undefined;
  const campaignId = readString(row.campaign_id);
  const campaign = campaignId ? options.campaignById.get(campaignId) : undefined;
  const routineId = readString(row.routine_id);
  const routine = routineId ? options.routineById.get(routineId) : undefined;
  const goalName = readString(goal?.title) ?? readString(goal?.name);
  const goalIcon = readRelationIcon(goal);
  const goalMonumentId = readGoalMonumentId(goal);
  const goalMonumentName = readGoalMonumentName(goal);
  const goalMonumentIcon = readGoalMonumentIcon(goal);
  const campaignName =
    readString(campaign?.title) ?? readString(campaign?.name);
  const campaignIcon = readRelationIcon(campaign);
  const routineName = readString(routine?.title) ?? readString(routine?.name);
  const icon =
    readString(row.icon) ??
    readString(row.emoji) ??
    readString(skill?.icon) ??
    readString(skill?.emoji);

  return {
    id,
    kind,
    sourceType: "HABIT",
    workType: "habit",
    title,
    subtitle: rawTypeLabel,
    durationMinutes,
    durationLabel: formatDuration(durationMinutes),
    energyLabel: formatEnergy(row.energy),
    energyCode: readEnergyCode(row.energy),
    createdAt: readString(row.created_at),
    created_at: readString(row.created_at),
    updatedAt: readString(row.updated_at),
    updated_at: readString(row.updated_at),
    statusLabel: "Ready",
    icon,
    skillId,
    skillName: readString(skill?.name),
    skillIcon: readString(skill?.icon) ?? readString(skill?.emoji),
    goalId,
    goal_id: goalId,
    goalTitle: goalName,
    goalIcon,
    goal_emoji: goalIcon,
    goalPriorityRank: readFiniteNumber(goal?.priority_rank),
    goal_priority_rank: readFiniteNumber(goal?.priority_rank),
    goalGlobalRank: readFiniteNumber(goal?.global_rank),
    goal_global_rank: readFiniteNumber(goal?.global_rank),
    goalDueDate: readString(goal?.due_date),
    goal_due_date: readString(goal?.due_date),
    goalCreatedAt: readString(goal?.created_at),
    goal_created_at: readString(goal?.created_at),
    goalUpdatedAt: readString(goal?.updated_at),
    goal_updated_at: readString(goal?.updated_at),
    goalMonumentId,
    goal_monument_id: goalMonumentId,
    goalMonumentName,
    goal_monument_name: goalMonumentName,
    goalMonumentIcon,
    goal_monument_icon: goalMonumentIcon,
    goal_name: goalName,
    goal: buildRelation(goalId, goalName, goalIcon, {
      monumentId: goalMonumentId,
      monumentName: goalMonumentName,
      monumentIcon: goalMonumentIcon,
    }),
    campaignId,
    campaign_id: campaignId,
    campaignName,
    campaign_name: campaignName,
    campaign_goal_ids: campaign?.goal_ids ?? [],
    campaign_monument_id:
      readString(campaign?.primary_monument_id) ?? readString(campaign?.monument_id),
    campaign_circle_id:
      readString(campaign?.primary_circle_id) ?? readString(campaign?.circle_id),
    campaign_roadmap_id: readString(campaign?.roadmap_id),
    campaign: buildRelation(campaignId, campaignName, campaignIcon),
    routineId,
    routine_id: routineId,
    routineName,
    routine_name: routineName,
    routine: buildRelation(routineId, routineName),
    tags: readTagOptions(row.tags),
    habit_type: habitType,
    habitType,
    recurrence: readString(row.recurrence),
    recurrence_days: Array.isArray(row.recurrence_days)
      ? row.recurrence_days
      : null,
    lastCompletedAt: readString(row.last_completed_at),
    last_completed_at: readString(row.last_completed_at),
    nextDueOverride: readString(row.next_due_override),
    next_due_override: readString(row.next_due_override),
    rawTypeLabel,
  };
}

function mapProject(
  row: ProjectRow,
  options: {
    goalById: Map<string, GoalRow>;
    campaignById: Map<string, CampaignRow>;
    projectSkillByProjectId: Map<string, string>;
    skillById: Map<string, SkillRow>;
  }
): FocusPomoQueueItem | null {
  const id = readString(row.id);
  const title = readString(row.title) ?? readString(row.name);
  if (!id || !title) return null;

  const durationMinutes =
    readPositiveMinutes(row.duration_min) ??
    readPositiveMinutes(row.duration_minutes);
  const goalId = readString(row.goal_id);
  const goal = goalId ? options.goalById.get(goalId) : undefined;
  const goalName = readString(goal?.title) ?? readString(goal?.name);
  const goalIcon = readRelationIcon(goal);
  const goalMonumentId = readGoalMonumentId(goal);
  const goalMonumentName = readGoalMonumentName(goal);
  const goalMonumentIcon = readGoalMonumentIcon(goal);
  const campaignId = readString(row.campaign_id);
  const campaign = campaignId ? options.campaignById.get(campaignId) : undefined;
  const campaignName =
    readString(campaign?.title) ?? readString(campaign?.name);
  const campaignIcon = readRelationIcon(campaign);
  const skillId = options.projectSkillByProjectId.get(id) ?? null;
  const skill = skillId ? options.skillById.get(skillId) : undefined;
  const skillIcon = readString(skill?.icon) ?? readString(skill?.emoji);

  return {
    id,
    kind: "project",
    sourceType: "PROJECT",
    workType: "project",
    title,
    subtitle: "Project",
    durationMinutes,
    durationLabel: formatDuration(durationMinutes),
    energyLabel: formatEnergy(row.energy),
    energyCode: readEnergyCode(row.energy),
    priority: readLookupValue(row.priority),
    priorityRank: readFiniteNumber(row.global_rank),
    priority_rank: readFiniteNumber(row.global_rank),
    projectId: id,
    project_id: id,
    projectName: title,
    project_name: title,
    projectOrder:
      readFiniteNumber(row.sort_order) ??
      readFiniteNumber(row.position) ??
      readFiniteNumber(row.order_index) ??
      readFiniteNumber(row.display_order) ??
      readFiniteNumber(row.sequence) ??
      readFiniteNumber(row.global_rank),
    project_order:
      readFiniteNumber(row.sort_order) ??
      readFiniteNumber(row.position) ??
      readFiniteNumber(row.order_index) ??
      readFiniteNumber(row.display_order) ??
      readFiniteNumber(row.sequence) ??
      readFiniteNumber(row.global_rank),
    projectGlobalRank: readFiniteNumber(row.global_rank),
    project_global_rank: readFiniteNumber(row.global_rank),
    dueDate: readString(row.due_date),
    due_date: readString(row.due_date),
    deadline: readString(row.deadline),
    targetDate: readString(row.target_date),
    target_date: readString(row.target_date),
    completedAt: readString(row.completed_at),
    completed_at: readString(row.completed_at),
    createdAt: readString(row.created_at),
    created_at: readString(row.created_at),
    updatedAt: readString(row.updated_at),
    updated_at: readString(row.updated_at),
    statusLabel: "Ready",
    icon: skillIcon,
    skillId,
    skillName: readString(skill?.name),
    skillIcon,
    goalId,
    goal_id: goalId,
    goalTitle: goalName,
    goalIcon,
    goal_emoji: goalIcon,
    goalPriorityRank: readFiniteNumber(goal?.priority_rank),
    goal_priority_rank: readFiniteNumber(goal?.priority_rank),
    goalGlobalRank: readFiniteNumber(goal?.global_rank),
    goal_global_rank: readFiniteNumber(goal?.global_rank),
    goalDueDate: readString(goal?.due_date),
    goal_due_date: readString(goal?.due_date),
    goalCreatedAt: readString(goal?.created_at),
    goal_created_at: readString(goal?.created_at),
    goalUpdatedAt: readString(goal?.updated_at),
    goal_updated_at: readString(goal?.updated_at),
    goalMonumentId,
    goal_monument_id: goalMonumentId,
    goalMonumentName,
    goal_monument_name: goalMonumentName,
    goalMonumentIcon,
    goal_monument_icon: goalMonumentIcon,
    goal_name: goalName,
    goal: buildRelation(goalId, goalName, goalIcon, {
      monumentId: goalMonumentId,
      monumentName: goalMonumentName,
      monumentIcon: goalMonumentIcon,
    }),
    campaignId,
    campaign_id: campaignId,
    campaignName,
    campaign_name: campaignName,
    campaign_goal_ids: campaign?.goal_ids ?? [],
    campaign_monument_id:
      readString(campaign?.primary_monument_id) ?? readString(campaign?.monument_id),
    campaign_circle_id:
      readString(campaign?.primary_circle_id) ?? readString(campaign?.circle_id),
    campaign_roadmap_id: readString(campaign?.roadmap_id),
    campaign: buildRelation(campaignId, campaignName, campaignIcon),
    tags: readTagOptions(row.tags),
    priorityLabel: formatPriority(row.priority),
  };
}

async function fetchSkillMetadata(
  supabase: SupabaseBrowserClient,
  userId: string,
  skillIds: string[]
): Promise<Map<string, SkillRow>> {
  const ids = Array.from(new Set(skillIds.filter(Boolean)));
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from("skills")
    .select("id, name, icon")
    .eq("user_id", userId)
    .in("id", ids);

  if (error) throw error;

  return new Map(
    ((data ?? []) as SkillRow[])
      .map((row) => [readString(row.id), row] as const)
      .filter((entry): entry is readonly [string, SkillRow] =>
        Boolean(entry[0])
      )
  );
}

async function fetchGoalMetadata(
  supabase: SupabaseBrowserClient,
  userId: string,
  goalIds: string[]
): Promise<Map<string, GoalRow>> {
  const ids = Array.from(new Set(goalIds.filter(Boolean)));
  if (ids.length === 0) return new Map();

  const selects = [
    "id, name, title, emoji, icon_emoji, icon, symbol, monument_id, circle_id, roadmap_id, priority_rank, global_rank, due_date, created_at, updated_at, monument:monuments(id, title, emoji)",
    "id, name, title, emoji, icon_emoji, icon, symbol, monument_id, circle_id, roadmap_id, priority_rank, global_rank, due_date, created_at, updated_at",
    "id, name, title, emoji, monument_id, circle_id, roadmap_id, priority_rank, global_rank, due_date, created_at",
    "id, name, title, emoji, monument_id, circle_id, roadmap_id",
    "id, name, emoji, monument_id, circle_id, roadmap_id",
    "id, name, emoji",
    "id, name",
  ];
  let lastError: { message?: string } | null = null;

  for (const select of selects) {
    const { data, error } = await supabase
      .from("goals")
      .select(select)
      .eq("user_id", userId)
      .in("id", ids);

    if (!error) {
      return new Map(
        ((data ?? []) as GoalRow[])
          .map((row) => [readString(row.id), row] as const)
          .filter((entry): entry is readonly [string, GoalRow] =>
            Boolean(entry[0])
          )
      );
    }

    lastError = error;
  }

  throw new Error(lastError?.message ?? "Failed to load goal metadata.");
}

async function fetchCampaignGoalIds(
  supabase: SupabaseBrowserClient,
  userId: string,
  campaignIds: string[]
): Promise<Map<string, string[]>> {
  const ids = Array.from(new Set(campaignIds.filter(Boolean)));
  if (ids.length === 0) return new Map();

  const queries = [
    () =>
      supabase
        .from("campaign_goals")
        .select("campaign_id, goal_id")
        .eq("user_id", userId)
        .in("campaign_id", ids),
    () =>
      supabase
        .from("campaign_goals")
        .select("campaign_id, goal_id")
        .in("campaign_id", ids),
  ];

  for (const runQuery of queries) {
    const { data, error } = await runQuery();
    if (error) continue;

    const map = new Map<string, string[]>();
    for (const row of data ?? []) {
      const record = row as Record<string, unknown>;
      const campaignId = readString(record.campaign_id);
      const goalId = readString(record.goal_id);
      if (!campaignId || !goalId) continue;
      map.set(campaignId, [...(map.get(campaignId) ?? []), goalId]);
    }

    return map;
  }

  return new Map();
}

async function fetchCampaignMetadata(
  supabase: SupabaseBrowserClient,
  userId: string,
  campaignIds: string[]
): Promise<Map<string, CampaignRow>> {
  const ids = Array.from(new Set(campaignIds.filter(Boolean)));
  if (ids.length === 0) return new Map();

  const selects = [
    "id, name, title, emoji, icon_emoji, icon, symbol, goal_id, monument_id, primary_monument_id, circle_id, primary_circle_id, roadmap_id",
    "id, name, title, emoji, primary_monument_id, primary_circle_id, roadmap_id",
    "id, name, emoji, primary_monument_id, primary_circle_id, roadmap_id",
    "id, name, emoji",
    "id, name",
  ];
  let lastError: { message?: string } | null = null;

  for (const select of selects) {
    const { data, error } = await supabase
      .from("campaigns")
      .select(select)
      .eq("user_id", userId)
      .in("id", ids);

    if (!error) {
      const rows = (data ?? []) as CampaignRow[];
      const goalIdsByCampaignId = await fetchCampaignGoalIds(
        supabase,
        userId,
        ids
      );

      return new Map(
        rows
          .map((row) => {
            const id = readString(row.id);
            return [
              id,
              id ? { ...row, goal_ids: goalIdsByCampaignId.get(id) ?? [] } : row,
            ] as const;
          })
          .filter((entry): entry is readonly [string, CampaignRow] =>
            Boolean(entry[0])
          )
      );
    }

    lastError = error;
  }

  throw new Error(lastError?.message ?? "Failed to load campaign metadata.");
}

async function fetchRoutineMetadata(
  supabase: SupabaseBrowserClient,
  userId: string,
  routineIds: string[]
): Promise<Map<string, RoutineRow>> {
  const ids = Array.from(new Set(routineIds.filter(Boolean)));
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from("habit_routines")
    .select("id, name")
    .eq("user_id", userId)
    .in("id", ids);

  if (error) throw error;

  return new Map(
    ((data ?? []) as RoutineRow[])
      .map((row) => [readString(row.id), row] as const)
      .filter((entry): entry is readonly [string, RoutineRow] =>
        Boolean(entry[0])
      )
  );
}

async function fetchProjectSkillMetadata(
  supabase: SupabaseBrowserClient,
  projectIds: string[]
): Promise<Map<string, string>> {
  const ids = Array.from(new Set(projectIds.filter(Boolean)));
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from("project_skills")
    .select("project_id, skill_id")
    .in("project_id", ids);

  if (error) throw error;

  const map = new Map<string, string>();
  for (const row of (data ?? []) as ProjectSkillRow[]) {
    const projectId = readString(row.project_id);
    const skillId = readString(row.skill_id);
    if (projectId && skillId && !map.has(projectId)) {
      map.set(projectId, skillId);
    }
  }

  return map;
}

async function fetchSkillIdsForMonument(
  supabase: SupabaseBrowserClient,
  userId: string,
  monumentId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("skills")
    .select("id")
    .eq("user_id", userId)
    .eq("monument_id", monumentId);

  if (error) throw error;

  return (data ?? [])
    .map((row) => readString((row as { id?: string | null }).id))
    .filter((id): id is string => Boolean(id));
}

async function fetchGoalIdsForMonument(
  supabase: SupabaseBrowserClient,
  userId: string,
  monumentId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("goals")
    .select("id")
    .eq("user_id", userId)
    .eq("monument_id", monumentId);

  if (error) throw error;

  return (data ?? [])
    .map((row) => readString((row as { id?: string | null }).id))
    .filter((id): id is string => Boolean(id));
}

async function fetchProjectIdsForSkill(
  supabase: SupabaseBrowserClient,
  skillId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("project_skills")
    .select("project_id")
    .eq("skill_id", skillId);

  if (error) throw error;

  return Array.from(
    new Set(
      (data ?? [])
        .map((row) =>
          readString((row as { project_id?: string | null }).project_id)
        )
        .filter((id): id is string => Boolean(id))
    )
  );
}

async function fetchHabits(
  supabase: SupabaseBrowserClient,
  userId: string,
  skillIds?: string[]
): Promise<FocusPomoQueueItem[]> {
  if (skillIds && skillIds.length === 0) return [];

  let lastError: { message?: string } | null = null;

  for (const select of HABIT_SELECTS) {
    let query = supabase
      .from("habits")
      .select(select)
      .eq("user_id", userId)
      .is("circle_id", null);

    if (skillIds) {
      query = query.in("skill_id", skillIds);
    }

    const response = (await query) as QueryResponse<HabitRow>;

    if (!response.error) {
      const rows = response.data ?? [];
      const skillIds = rows
        .map((row) => readString(row.skill_id))
        .filter((id): id is string => Boolean(id));
      const goalIds = rows
        .map((row) => readString(row.goal_id))
        .filter((id): id is string => Boolean(id));
      const campaignIds = rows
        .map((row) => readString(row.campaign_id))
        .filter((id): id is string => Boolean(id));
      const routineIds = rows
        .map((row) => readString(row.routine_id))
        .filter((id): id is string => Boolean(id));
      const [skillById, goalById, campaignById, routineById] =
        await Promise.all([
          fetchSkillMetadata(supabase, userId, skillIds),
          fetchGoalMetadata(supabase, userId, goalIds),
          fetchCampaignMetadata(supabase, userId, campaignIds),
          fetchRoutineMetadata(supabase, userId, routineIds),
        ]);

      return rows
        .map((row) =>
          mapHabit(row, {
            skillById,
            goalById,
            campaignById,
            routineById,
          })
        )
        .filter((item): item is FocusPomoQueueItem => Boolean(item));
    }

    lastError = response.error;
  }

  throw new Error(lastError?.message ?? "Failed to load habits.");
}

async function fetchProjects(
  supabase: SupabaseBrowserClient,
  userId: string,
  params:
    | { sourceType: "all" }
    | { sourceType: "monument"; goalIds: string[] }
    | { sourceType: "skill"; projectIds: string[] }
): Promise<FocusPomoQueueItem[]> {
  if (
    (params.sourceType === "monument" && params.goalIds.length === 0) ||
    (params.sourceType === "skill" && params.projectIds.length === 0)
  ) {
    return [];
  }

  let lastError: { message?: string } | null = null;

  for (const variant of PROJECT_SELECTS) {
    let query = supabase
      .from("projects")
      .select(variant.columns)
      .eq("user_id", userId);

    if (variant.filterCompleted) {
      query = query.is("completed_at", null);
    }

    if (params.sourceType === "monument") {
      query = query.in("goal_id", params.goalIds);
    } else if (params.sourceType === "skill") {
      query = query.in("id", params.projectIds);
    }

    const response = (await query) as QueryResponse<ProjectRow>;

    if (!response.error) {
      const rows = (response.data ?? []).filter((row) => !row.completed_at);
      const projectIds = rows
        .map((row) => readString(row.id))
        .filter((id): id is string => Boolean(id));
      const goalIds = rows
        .map((row) => readString(row.goal_id))
        .filter((id): id is string => Boolean(id));
      const campaignIds = rows
        .map((row) => readString(row.campaign_id))
        .filter((id): id is string => Boolean(id));
      const [goalById, campaignById, projectSkillByProjectId] =
        await Promise.all([
          fetchGoalMetadata(supabase, userId, goalIds),
          fetchCampaignMetadata(supabase, userId, campaignIds),
          fetchProjectSkillMetadata(supabase, projectIds),
        ]);
      const skillById = await fetchSkillMetadata(
        supabase,
        userId,
        Array.from(projectSkillByProjectId.values())
      );

      return rows
        .map((row) =>
          mapProject(row, {
            goalById,
            campaignById,
            projectSkillByProjectId,
            skillById,
          })
        )
        .filter((item): item is FocusPomoQueueItem => Boolean(item));
    }

    lastError = response.error;
  }

  throw new Error(lastError?.message ?? "Failed to load projects.");
}

export async function fetchFocusPomoQueue(params: {
  sourceType?: QueueSourceType;
  sourceId?: string;
}): Promise<FocusPomoQueueItem[]> {
  const supabase = getSupabaseBrowser();

  if (!supabase) return [];

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) return [];

  const sourceId = readString(params.sourceId);
  if (!params.sourceType && !sourceId) {
    const [habits, projects] = await Promise.all([
      fetchHabits(supabase, user.id),
      fetchProjects(supabase, user.id, { sourceType: "all" }),
    ]);

    const now = new Date();
    return filterEligibleQueueItems([...habits, ...projects], now).sort(
      compareQueueItems
    );
  }

  if (!sourceId) return [];
  if (!params.sourceType) return [];

  let skillIds: string[];
  let projectScope:
    | { sourceType: "monument"; goalIds: string[] }
    | { sourceType: "skill"; projectIds: string[] };

  if (params.sourceType === "skill") {
    skillIds = [sourceId];
    projectScope = {
      sourceType: "skill",
      projectIds: await fetchProjectIdsForSkill(supabase, sourceId),
    };
  } else {
    skillIds = await fetchSkillIdsForMonument(supabase, user.id, sourceId);
    projectScope = {
      sourceType: "monument",
      goalIds: await fetchGoalIdsForMonument(supabase, user.id, sourceId),
    };
  }

  const [habits, projects] = await Promise.all([
    fetchHabits(supabase, user.id, skillIds),
    fetchProjects(supabase, user.id, projectScope),
  ]);

  const now = new Date();
  return filterEligibleQueueItems([...habits, ...projects], now).sort(
    compareQueueItems
  );
}
