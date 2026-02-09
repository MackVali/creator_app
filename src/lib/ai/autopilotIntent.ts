import type { AiIntent, AiIntentResponse, AiScope, AiSchedulerOp } from "@/lib/types/ai";

type AutopilotScheduleInstance = {
  id: string;
  title: string;
  start_utc_ms: number;
  end_utc_ms: number;
  completed_at: string | null;
  kind?: string;
  project_id?: string | null;
  goal_id?: string | null;
};

type AutopilotHabitSnapshot = {
  id?: string;
  name?: string | null;
  durationMinutes?: number | null;
};

type AutopilotSnapshot = {
  dayKey?: string | null;
  timeZone?: string | null;
  windows?: unknown[];
  goals?: { id: string; name?: string | null; priority?: string | number | null }[];
  projects?: { id: string; name?: string | null; global_rank?: number | null }[];
  dayTypes?: { id: string; name?: string | null }[];
  dayTypeTimeBlocks?: unknown[];
  schedule?: { items?: unknown[] } | null;
  items?: unknown[];
  windowReport?: { windows?: unknown[] } | null;
  schedule_instances?: AutopilotScheduleInstance[];
  habits?: AutopilotHabitSnapshot[];
};

type AutopilotGoalSnapshot = AutopilotSnapshot["goals"] extends Array<
  infer Item
>
  ? Item
  : never;

type AutopilotProjectSnapshot = AutopilotSnapshot["projects"] extends Array<
  infer Item
>
  ? Item
  : never;

type RunAutopilotIntentArgs = {
  prompt: string;
  scope: AiScope;
  snapshot?: AutopilotSnapshot;
  thread?: unknown[];
};

const createEmptyDraftPayload = () => ({
  name: null,
  priority: null,
  projectId: null,
  goalId: null,
});

const createIntentExtras = () => ({
  draft: createEmptyDraftPayload(),
  suggestion: { summary: null },
  missing: null,
  questions: null,
  ops: null,
});

const buildResponse = (
  scope: AiScope,
  intent: AiIntent,
  assistantMessage: string,
  followUps: string[] | null,
  snapshot?: unknown
): AiIntentResponse => ({
  scope,
  intent,
  assistant_message: assistantMessage,
  follow_ups: followUps && followUps.length > 0 ? followUps : undefined,
  snapshot,
});

const parseDayKey = (dayKey: string | undefined | null): Date | null => {
  if (!dayKey) return null;
  const parts = dayKey.split("-").map((segment) => Number.parseInt(segment, 10));
  if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) {
    return null;
  }
  const [year, month, day] = parts;
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return new Date(Date.UTC(year, month - 1, day));
};

const formatDateKey = (date: Date) => date.toISOString().slice(0, 10);

const extractNameAfterKeyword = (prompt: string, keyword: string): string | null => {
  const lower = prompt.toLowerCase();
  const index = lower.indexOf(keyword.toLowerCase());
  if (index === -1) return null;
  const after = prompt.slice(index + keyword.length).trim();
  if (!after) return null;
  if (after.startsWith("\"") || after.startsWith("'")) {
    const quote = after[0];
    const closing = after.indexOf(quote, 1);
    if (closing > 1) {
      return after.slice(1, closing).trim() || null;
    }
  }
  const cleaned = after.replace(/^(named|called|for)\s+/i, "").trim();
  if (!cleaned) return null;
  const match = cleaned.match(/(.*?)(?:\band\b|,|;|\n|\.|\?|!|$)/i);
  const candidate = match?.[1]?.trim() ?? cleaned;
  return candidate || null;
};

const findProjectMatches = (
  prompt: string,
  projects: NonNullable<AutopilotSnapshot["projects"]>
) => {
  const normalized = prompt.toLowerCase();
  return projects.filter((project) => {
    const name = project.name?.toLowerCase() ?? "";
    if (!name) return false;
    return normalized.includes(name);
  });
};

const findDayTypeMatches = (
  prompt: string,
  dayTypes: NonNullable<AutopilotSnapshot["dayTypes"]>
) => {
  const normalized = prompt.toLowerCase();
  return dayTypes.filter((dayType) => {
    const name = dayType.name?.toLowerCase() ?? "";
    return name && normalized.includes(name);
  });
};

const getSnapshotTimeZone = (snapshot?: AutopilotSnapshot) => {
  const fallback = "America/Chicago";
  const candidate = snapshot?.timeZone?.trim() || fallback;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: candidate });
    return candidate;
  } catch {
    return fallback;
  }
};

const matchesWhatNowIntent = (text: string) =>
  /(what should i do right now|what do i do now|what(?:'|’)?s next|what should i do)/.test(
    text
  );

const OVERLAY_PLANNING_PATTERN =
  /(plan(?:ning)?(?: my)? (?:next (?:few|couple|[0-9]+) hours|the next (?:few|[0-9]+) hours)|next (?:few|[0-9]+) hours|overlay window|right now)/i;
const isOverlayPlanningPrompt = (text: string) =>
  OVERLAY_PLANNING_PATTERN.test(text) || matchesWhatNowIntent(text);

const GOAL_PRIORITY_ORDER = [
  "ULTRA-CRITICAL",
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "NO",
];

const TOP_PRIORITIES_PATTERN =
  /top(?:\s+\d{1,2})?(?:\s+priority)?\s+(?:priorities?|goals?|projects?)/i;
const TOP_PRIORITIES_COUNT_PATTERN = /top\s+(\d{1,2})/i;

const isTopPrioritiesPrompt = (text: string) =>
  TOP_PRIORITIES_PATTERN.test(text.trim());

const parseTopPrioritiesCount = (text: string) => {
  const match = text.match(TOP_PRIORITIES_COUNT_PATTERN);
  if (!match) return 5;
  const parsed = Number.parseInt(match[1], 10);
  if (Number.isNaN(parsed)) return 5;
  return Math.min(10, Math.max(1, parsed));
};

const clampPriorityDisplayCount = (value: number) =>
  Math.min(Math.max(value, 3), 5);

const normalizeContextValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed.toUpperCase() : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }
  return null;
};

const extractContextTags = (item: Record<string, unknown>) => {
  const tags: string[] = [];
  const addTag = (key: string) => {
    const normalized = normalizeContextValue(
      getFieldValue(item, [key]) ?? null
    );
    if (normalized && !tags.includes(normalized)) {
      tags.push(normalized);
    }
  };
  [
    "location_context",
    "location",
    "locationContext",
    "location_context_label",
  ].forEach(addTag);
  ["skill", "monument", "project", "goal", "energy"].forEach(addTag);
  return tags;
};

const normalizePriorityLabel = (
  value: string | number | null | undefined
): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value.toString();
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const hasHyphen = trimmed.includes("-");
  const segments = trimmed.split(/[-_\s]+/).filter(Boolean);
  if (segments.length === 0) return null;
  const formatted = segments
    .map((segment) => segment[0].toUpperCase() + segment.slice(1).toLowerCase())
    .join(hasHyphen ? "-" : " ");
  return formatted;
};

const getGoalPrioritySortValue = (goal?: AutopilotGoalSnapshot) => {
  if (!goal) return GOAL_PRIORITY_ORDER.length;
  if (typeof goal.priority === "number" && Number.isFinite(goal.priority)) {
    return goal.priority;
  }
  const normalized =
    typeof goal.priority === "string"
      ? goal.priority.trim().toUpperCase()
      : "";
  const index = GOAL_PRIORITY_ORDER.indexOf(normalized);
  return index === -1 ? GOAL_PRIORITY_ORDER.length : index;
};

const getProjectRankValue = (project?: AutopilotProjectSnapshot) => {
  if (!project) return Number.POSITIVE_INFINITY;
  if (typeof project.global_rank === "number" && Number.isFinite(project.global_rank)) {
    return project.global_rank;
  }
  return Number.POSITIVE_INFINITY;
};

const getNumericPart = (
  parts: Intl.DateTimeFormatPart[],
  type: "year" | "month" | "day" | "hour" | "minute" | "second"
): number | null => {
  const part = parts.find((entry) => entry.type === type);
  if (!part) return null;
  const parsed = Number.parseInt(part.value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const getFieldValue = (
  item: Record<string, unknown>,
  keys: string[]
): unknown | undefined => {
  for (const key of keys) {
    if (key in item) {
      return item[key];
    }
  }
  return undefined;
};

const parseLocalTimeToMinutes = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const segments = trimmed.split(":").map((segment) => segment.trim());
  if (segments.length < 2) return null;
  const hour = Number.parseInt(segments[0], 10);
  const minute = Number.parseInt(segments[1], 10);
  const second = segments.length >= 3 ? Number.parseInt(segments[2], 10) : 0;
  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    Number.isNaN(second) ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }
  const normalizedHour =
    hour === 24 && minute === 0 && second === 0 ? 0 : hour;
  if (normalizedHour < 0 || normalizedHour > 23) {
    return null;
  }
  return normalizedHour * 60 + minute + second / 60;
};

const formatLocalTimeShort = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "00:00";
  const parts = trimmed.split(":");
  if (parts.length < 2) return trimmed;
  const hour = Number.parseInt(parts[0], 10);
  const minute = Number.parseInt(parts[1], 10);
  const normalizedHour = hour === 24 && minute === 0 ? 0 : hour;
  if (Number.isNaN(normalizedHour) || Number.isNaN(minute)) {
    return trimmed;
  }
  return `${String(normalizedHour).padStart(2, "0")}:${String(minute).padStart(
    2,
    "0"
  )}`;
};

const formatMinutesToTime = (minutes: number): string => {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = Math.floor(normalized % 60);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const KIND_LABELS: Record<string, string> = {
  PROJECT: "Project",
  TASK: "Task",
  HABIT: "Habit",
};

const formatTimeInTimeZone = (ms: number, timeZone: string): string => {
  if (!Number.isFinite(ms)) return "00:00";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ms));
  } catch {
    return "00:00";
  }
};

const formatScheduleInstanceRange = (
  instance: AutopilotScheduleInstance,
  timeZone: string
): string => {
  const start = formatTimeInTimeZone(instance.start_utc_ms, timeZone);
  const end = formatTimeInTimeZone(instance.end_utc_ms, timeZone);
  return `${start}-${end}`;
};

const resolveInstanceTitle = (instance: AutopilotScheduleInstance): string => {
  const trimmedTitle = instance.title?.trim();
  if (trimmedTitle) return trimmedTitle;
  const kind = instance.kind?.trim().toUpperCase();
  if (kind && kind in KIND_LABELS) {
    return KIND_LABELS[kind];
  }
  if (kind) return kind.toLowerCase();
  return "Scheduled item";
};

const buildScheduleAssistantMessage = (
  instances: AutopilotScheduleInstance[],
  nowUtcMs: number,
  timeZone: string
): string | null => {
  const active = instances.find(
    (entry) =>
      entry.start_utc_ms <= nowUtcMs && nowUtcMs < entry.end_utc_ms
  );
  if (active && active.completed_at == null) {
    const title = resolveInstanceTitle(active);
    return `Right now: ${title} (${formatScheduleInstanceRange(
      active,
      timeZone
    )})`;
  }
  const next = instances.find(
    (entry) =>
      entry.start_utc_ms > nowUtcMs && entry.completed_at == null
  );
  if (next) {
    const title = resolveInstanceTitle(next);
    return `Next up: ${title} (${formatScheduleInstanceRange(
      next,
      timeZone
    )})`;
  }
  return null;
};

type NormalizedSnapshotWindow = {
  label: string;
  startMinutes: number;
  endMinutes: number;
  startDisplay: string;
  endDisplay: string;
};

const normalizeSnapshotWindows = (
  snapshot?: AutopilotSnapshot
): NormalizedSnapshotWindow[] => {
  if (!Array.isArray(snapshot?.windows)) return [];
  const windows: NormalizedSnapshotWindow[] = [];
  for (const raw of snapshot.windows) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const startRaw = (
      (getFieldValue(record, [
        "start_local",
        "start",
        "window_start",
        "windowStart",
        "begin",
      ]) as string | undefined)?.trim() ?? ""
    ).trim();
    const endRaw = (
      (getFieldValue(record, [
        "end_local",
        "end",
        "window_end",
        "windowEnd",
        "finish",
      ]) as string | undefined)?.trim() ?? ""
    ).trim();
    if (!startRaw || !endRaw) continue;
    const startMinutes = parseLocalTimeToMinutes(startRaw);
    const endMinutes = parseLocalTimeToMinutes(endRaw);
    if (startMinutes === null || endMinutes === null) continue;
    const explicitLabel = (
      getFieldValue(record, ["label", "title", "name", "summary"]) as
        | string
        | undefined
    )?.trim();
    const kindLabel = (record.window_kind as string | undefined)?.trim();
    const label =
      explicitLabel ||
      (kindLabel ? kindLabel.replace(/_/g, " ") : undefined) ||
      "Unnamed block";
    windows.push({
      label,
      startMinutes,
      endMinutes,
      startDisplay: formatLocalTimeShort(startRaw),
      endDisplay: formatLocalTimeShort(endRaw),
    });
  }
  return windows.sort((a, b) => a.startMinutes - b.startMinutes);
};

const windowSpansMidnight = (current: NormalizedSnapshotWindow) =>
  current.endMinutes <= current.startMinutes;

const isNowInWindow = (
  nowMinutes: number,
  current: NormalizedSnapshotWindow
) => {
  if (windowSpansMidnight(current)) {
    return nowMinutes >= current.startMinutes || nowMinutes < current.endMinutes;
  }
  return nowMinutes >= current.startMinutes && nowMinutes < current.endMinutes;
};

const getNowMinutesFromTimeZone = (timeZone: string) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const hour = getNumericPart(parts, "hour") ?? 0;
  const minute = getNumericPart(parts, "minute") ?? 0;
  const second = getNumericPart(parts, "second") ?? 0;
  return hour * 60 + minute + second / 60;
};

const determineNextWindow = (
  windows: NormalizedSnapshotWindow[],
  nowMinutes: number,
  currentIndex: number | null
): NormalizedSnapshotWindow | null => {
  if (windows.length === 0) return null;
  if (currentIndex !== null && currentIndex >= 0) {
    const nextIndex = (currentIndex + 1) % windows.length;
    return windows[nextIndex];
  }
  const upcoming = windows.find((entry) => entry.startMinutes > nowMinutes);
  return upcoming ?? windows[0];
};

const createNoOpIntent = (message: string, confidence = 0.5): AiIntent => ({
  type: "NO_OP",
  confidence,
  title: "Autopilot idle",
  message,
  ...createIntentExtras(),
});

const createClarificationIntent = (
  title: string,
  message: string,
  missing: string[],
  questions: string[]
): AiIntent => {
  const extras = createIntentExtras();
  extras.missing = missing;
  extras.questions = questions;
  return {
    type: "NEEDS_CLARIFICATION",
    confidence: 0.7,
    title,
    message,
    ...extras,
  } as AiIntent;
};

const createDraftIntent = (
  type: AiIntent["type"],
  title: string,
  message: string,
  draft: ReturnType<typeof createEmptyDraftPayload>
): AiIntent => ({
  type,
  confidence: 0.75,
  title,
  message,
  ...createIntentExtras(),
  draft,
});

const createSchedulerIntent = (
  title: string,
  message: string,
  ops: AiSchedulerOp[]
): AiIntent => {
  const extras = createIntentExtras();
  extras.ops = ops;
  return {
    type: "DRAFT_SCHEDULER_INPUT_OPS",
    confidence: 0.75,
    title,
    message,
    ...extras,
  } as AiIntent;
};

const scopeLabels: Record<AiScope, string> = {
  read_only: "Read only",
  draft_creation: "Draft creation",
  schedule_edit: "Schedule edit",
};

const createScopeClarificationResponse = (
  actionDescription: string,
  requiredScope: AiScope,
  currentScope: AiScope,
  snapshot?: unknown,
  followUps?: string[]
) => {
  const scopeName = scopeLabels[requiredScope];
  const intent = createClarificationIntent(
    `Need ${scopeName}`,
    `I spotted a ${actionDescription} request but the helper is in ${scopeLabels[
      currentScope
    ].toLowerCase()} mode. Switch to ${scopeName} scope so I can draft it.`,
    ["scope"],
    [`Switch to ${scopeName} scope to continue.`]
  );
  return buildResponse(
    currentScope,
    intent,
    `${scopeName} scope is required to ${actionDescription}.`,
    followUps?.length
      ? followUps
      : [`Switch to ${scopeName} scope to continue.`],
    snapshot
  );
};

const matchesGoalIntent = (text: string) =>
  /(?:create|help me create)(?: a| an)? goal/.test(text) ||
  text.startsWith("create goal");

const matchesProjectIntent = (text: string) =>
  /(?:create|help me create)(?: a| an)? project/.test(text) ||
  text.startsWith("create project");

const matchesTaskIntent = (text: string) =>
  /(?:create|help me create|add)(?: a| an)? task/.test(text) ||
  text.startsWith("create task");

const matchesDayTypeIntent = (text: string) =>
  text.includes("day type") || text.includes("set day type");

const NEW_DAY_TYPE_KEYWORDS = [
  "new day type",
  "create day type",
  "day type template",
  "make a day type",
];

const DAY_TYPE_ACTION_PATTERN =
  /(?:build|create|make|design|help me create|help me build|help me make)\s+(?:a|an|the)?\s*[\w\s]{0,30}?day type/i;
const DAY_TYPE_TEMPLATE_PATTERN =
  /(?:build|create|make|design|help me create|help me build|help me make)\s+(?:a|an|the)?\s*[\w\s]{0,40}?template/i;

const CODING_PRIORITY_KEYWORDS = [
  "code",
  "coding",
  "developer",
  "dev",
  "software",
  "engineer",
  "program",
  "build",
  "debug",
  "development",
];

const normalizeForComparison = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const formatDayTypeName = (value: string) => {
  const cleaned = value
    .replace(/\b(day type|template)\b/gi, "")
    .trim();
  const base = cleaned || "New day type";
  return base
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
};

const ensureUniqueDayTypeName = (
  value: string,
  existing: Set<string>
): string => {
  let attempt = value;
  let suffix = 1;
  while (existing.has(normalizeForComparison(attempt))) {
    suffix += 1;
    attempt = `${value} ${suffix}`;
  }
  existing.add(normalizeForComparison(attempt));
  return attempt;
};

const isCodingPriorityName = (value: string) =>
  CODING_PRIORITY_KEYWORDS.some((keyword) =>
    value.toLowerCase().includes(keyword)
  );

const addMinutesToTime = (time: string, minutes: number) => {
  const [hourPart, minutePart] = time.split(":");
  const hour = Number.parseInt(hourPart, 10);
  const minute = Number.parseInt(minutePart ?? "0", 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return time;
  }
  const totalMinutes = hour * 60 + minute + minutes;
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const newHour = Math.floor(normalized / 60);
  const newMinute = normalized % 60;
  return `${String(newHour).padStart(2, "0")}:${String(newMinute).padStart(
    2,
    "0"
  )}`;
};

const extractDayTypeNameFromPrompt = (prompt: string): string | null => {
  const patterns = [
    /(?:build|create|make|design|help me create|help me build|help me make)\s+(?:a|an|the)?\s*(.+?)\s+day type/i,
    /day type\s+(?:called|named|for)\s+(.+?)(?:[,.!?]|\s|$)/i,
    /\b(\w*day)\s+template\b/i,
    /template\s+(?:for|focused on|about|to)?\s*(.+?)(?:[,.!?]|\s|$)/i,
  ];
  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
};

const matchesNewDayTypeIntent = (text: string) => {
  const normalized = text.toLowerCase();
  if (NEW_DAY_TYPE_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return true;
  }
  if (DAY_TYPE_ACTION_PATTERN.test(text)) {
    return true;
  }
  if (
    DAY_TYPE_TEMPLATE_PATTERN.test(text) &&
    (normalized.includes("day") || normalized.includes("workday"))
  ) {
    return true;
  }
  return false;
};

const isDayTypeCreationPrompt = (text: string) =>
  matchesNewDayTypeIntent(text);

const getPriorityNames = (
  goals: AutopilotSnapshot["goals"],
  projects: AutopilotSnapshot["projects"],
  limit = 3
) => {
  const names: string[] = [];
  const sortedGoals = [...goals].sort(
    (a, b) => getGoalPrioritySortValue(a) - getGoalPrioritySortValue(b)
  );
  for (const goal of sortedGoals) {
    const trimmed = goal?.name?.trim();
    if (trimmed) {
      names.push(trimmed);
      if (names.length >= limit) {
        return names;
      }
    }
  }
  const sortedProjects = [...projects].sort(
    (a, b) => getProjectRankValue(a) - getProjectRankValue(b)
  );
  for (const project of sortedProjects) {
    const trimmed = project?.name?.trim();
    if (trimmed) {
      names.push(trimmed);
      if (names.length >= limit) {
        break;
      }
    }
  }
  return names;
};

type DayTypeBlock = {
  label: string;
  start: string;
  end: string;
  blockType: "FOCUS" | "PRACTICE" | "BREAK";
  energy: AiSchedulerOp["energy"];
};

const MINUTES_PER_DAY = 24 * 60;

const parseDayTypeTimeValue = (value: string): number | null => {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    minute < 0 ||
    minute > 59 ||
    hour < 0 ||
    hour > 24
  ) {
    return null;
  }
  if (hour === 24 && minute !== 0) {
    return null;
  }
  return hour === 24 ? MINUTES_PER_DAY : hour * 60 + minute;
};

const formatMinutesForDayTypeOps = (minutes: number): string => {
  const rounded = Math.round(minutes);
  if (rounded >= MINUTES_PER_DAY) {
    return "24:00";
  }
  if (rounded < 0) {
    return "00:00";
  }
  const hour = Math.floor(rounded / 60);
  const minute = rounded % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

type NormalizedDayTypeSegment = {
  label: string;
  startMin: number;
  endMin: number;
  blockType: DayTypeBlock["blockType"];
  energy?: AiSchedulerOp["energy"];
  isFiller?: boolean;
};

const normalizeDayTypeSegments = (
  blocks: DayTypeBlock[],
  sleepStartMin: number | null
): NormalizedDayTypeSegment[] => {
  const segments: NormalizedDayTypeSegment[] = [];
  for (const block of blocks) {
    const startMinutes = parseDayTypeTimeValue(block.start);
    const endMinutes = parseDayTypeTimeValue(block.end);
    if (startMinutes === null || endMinutes === null) continue;
    const normalizedEnd =
      endMinutes <= startMinutes ? endMinutes + MINUTES_PER_DAY : endMinutes;
    const normalizedLabel =
      block.label?.trim().toUpperCase() || block.blockType || "BLOCK";
    const pushSegment = (segmentStart: number, segmentEnd: number) => {
      if (segmentEnd <= segmentStart) return;
      segments.push({
        label: normalizedLabel,
        startMin: segmentStart,
        endMin: segmentEnd,
        blockType: block.blockType,
        energy: block.energy,
        isFiller: false,
      });
    };
    pushSegment(startMinutes, Math.min(normalizedEnd, MINUTES_PER_DAY));
    if (normalizedEnd > MINUTES_PER_DAY) {
      pushSegment(0, normalizedEnd - MINUTES_PER_DAY);
    }
  }

  const sorted = segments.sort((a, b) => {
    if (a.startMin !== b.startMin) return a.startMin - b.startMin;
    return a.endMin - b.endMin;
  });

  const fillerLabelForGap = (gapStart: number, gapEnd: number) => {
    if (gapStart === 0) {
      if (sleepStartMin !== null && gapEnd > sleepStartMin) {
        return "FLEX";
      }
      return "WIND DOWN";
    }
    return "FLEX";
  };

  const createGapSegment = (
    start: number,
    end: number
  ): NormalizedDayTypeSegment => ({
    label: fillerLabelForGap(start, end),
    startMin: start,
    endMin: end,
    blockType: "BREAK",
    energy: "LOW",
    isFiller: true,
  });

  const normalized: NormalizedDayTypeSegment[] = [];
  let currentMin = 0;
  for (const segment of sorted) {
    if (segment.endMin <= currentMin) continue;
    if (segment.startMin > currentMin) {
      normalized.push(createGapSegment(currentMin, segment.startMin));
    }
    const clampedStart = Math.max(segment.startMin, currentMin);
    if (clampedStart < segment.endMin) {
      normalized.push({ ...segment, startMin: clampedStart });
      currentMin = segment.endMin;
    }
  }
  if (currentMin < MINUTES_PER_DAY) {
    normalized.push(createGapSegment(currentMin, MINUTES_PER_DAY));
  }
  if (normalized.length === 0) {
    normalized.push(createGapSegment(0, MINUTES_PER_DAY));
  }

  const merged: NormalizedDayTypeSegment[] = [];
  for (const segment of normalized) {
    if (
      segment.isFiller &&
      merged.length > 0 &&
      merged[merged.length - 1].isFiller
    ) {
      merged[merged.length - 1].endMin = segment.endMin;
    } else {
      merged.push(segment);
    }
  }

  const finalSegments: NormalizedDayTypeSegment[] = [];
  for (let i = 0; i < merged.length; i += 1) {
    const segment = merged[i];
    const duration = segment.endMin - segment.startMin;
    if (segment.isFiller && duration < 15) {
      const prev = finalSegments[finalSegments.length - 1];
      const next = merged[i + 1];
      if (prev && !prev.isFiller) {
        prev.endMin = segment.endMin;
        continue;
      }
      if (next && !next.isFiller) {
        next.startMin = segment.startMin;
        continue;
      }
      if (prev) {
        prev.endMin = segment.endMin;
        continue;
      }
    }
    finalSegments.push(segment);
  }

  return finalSegments;
};

const buildHabitBlockDefinitions = (
  habits?: AutopilotSnapshot["habits"],
  limit = 2
): { label: string; durationMinutes: number }[] => {
  if (!Array.isArray(habits) || habits.length === 0) return [];
  return habits
    .map((habit, index) => {
      const label = habit?.name?.trim() || `Habit ${index + 1}`;
      const safeDuration =
        typeof habit?.durationMinutes === "number" &&
        Number.isFinite(habit.durationMinutes) &&
        habit.durationMinutes > 0
          ? Math.min(60, Math.max(15, Math.round(habit.durationMinutes)))
          : 30;
      return { label, durationMinutes: safeDuration };
    })
    .slice(0, limit);
};

const determineSleepWindowTimes = (
  windows: NormalizedSnapshotWindow[]
): { start: string; end: string } => {
  const sleepKeyword = /(sleep|bed|rest|night)/i;
  const sleepWindow = windows.find((entry) =>
    sleepKeyword.test(entry.label)
  );
  if (sleepWindow) {
    return {
      start: sleepWindow.startDisplay,
      end: sleepWindow.endDisplay,
    };
  }
  return { start: "23:00", end: "06:30" };
};

const calculateGapToSleep = (
  currentTime: string,
  sleepStart: string
): number => {
  const currentMinutes = parseLocalTimeToMinutes(currentTime);
  const sleepStartMinutes = parseLocalTimeToMinutes(sleepStart);
  if (currentMinutes === null || sleepStartMinutes === null) {
    return 0;
  }
  const delta = sleepStartMinutes - currentMinutes;
  return delta > 0 ? delta : 0;
};

const buildFullDayTypeBlockOps = ({
  dayTypeName,
  focusThemes,
  habits,
  windows,
}: {
  dayTypeName: string;
  focusThemes: string[];
  habits?: AutopilotSnapshot["habits"];
  windows: NormalizedSnapshotWindow[];
}): AiSchedulerOp[] => {
  const { start: sleepStart, end: sleepEnd } = determineSleepWindowTimes(
    windows
  );
  const normalizedDayTypeName = dayTypeName.toUpperCase();
  const sequentialBlocks: DayTypeBlock[] = [];
  let currentTime = sleepEnd;

  const addSequentialBlock = (block: {
    label: string;
    durationMinutes: number;
    blockType: DayTypeBlock["blockType"];
    energy: AiSchedulerOp["energy"];
  }) => {
    if (block.durationMinutes <= 0) return;
    const start = currentTime;
    const end = addMinutesToTime(start, block.durationMinutes);
    sequentialBlocks.push({
      label: block.label,
      start,
      end,
      blockType: block.blockType,
      energy: block.energy,
    });
    currentTime = end;
  };

  const anchorBlocks = [
    { label: "Wake buffer", durationMinutes: 30, blockType: "BREAK", energy: "LOW" },
    { label: "Hygiene routine", durationMinutes: 30, blockType: "PRACTICE", energy: "LOW" },
    { label: "Breakfast", durationMinutes: 30, blockType: "BREAK", energy: "LOW" },
  ];
  anchorBlocks.forEach(addSequentialBlock);

  const sanitizedThemes = focusThemes.map((theme) =>
    theme?.trim() ? theme.trim() : null
  );
  const defaultFocusLabels = ["Morning focus", "Midday focus", "Afternoon focus"];
  const focusDurations = [150, 150, 120];
  const focusEnergies: AiSchedulerOp["energy"][] = ["HIGH", "MEDIUM", "MEDIUM"];

  addSequentialBlock({
    label:
      sanitizedThemes[0]
        ? `Focus on ${sanitizedThemes[0]}`
        : defaultFocusLabels[0],
    durationMinutes: focusDurations[0],
    blockType: "FOCUS",
    energy: focusEnergies[0],
  });
  addSequentialBlock({
    label: "Transition & reset",
    durationMinutes: 30,
    blockType: "BREAK",
    energy: "LOW",
  });
  addSequentialBlock({
    label: "Lunch",
    durationMinutes: 45,
    blockType: "BREAK",
    energy: "LOW",
  });
  addSequentialBlock({
    label:
      sanitizedThemes[1]
        ? `Focus on ${sanitizedThemes[1]}`
        : defaultFocusLabels[1],
    durationMinutes: focusDurations[1],
    blockType: "FOCUS",
    energy: focusEnergies[1],
  });
  addSequentialBlock({
    label: "Afternoon reset",
    durationMinutes: 30,
    blockType: "BREAK",
    energy: "LOW",
  });

  const habitBlocks = buildHabitBlockDefinitions(habits);
  habitBlocks.forEach((habit) =>
    addSequentialBlock({
      label: `Habit: ${habit.label}`,
      durationMinutes: habit.durationMinutes,
      blockType: "PRACTICE",
      energy: "LOW",
    })
  );

  addSequentialBlock({
    label:
      sanitizedThemes[2]
        ? `Focus on ${sanitizedThemes[2]}`
        : defaultFocusLabels[2],
    durationMinutes: focusDurations[2],
    blockType: "FOCUS",
    energy: focusEnergies[2],
  });
  addSequentialBlock({
    label: "Dinner",
    durationMinutes: 45,
    blockType: "BREAK",
    energy: "LOW",
  });
  addSequentialBlock({
    label: "Evening focus & planning",
    durationMinutes: 90,
    blockType: "FOCUS",
    energy: "LOW",
  });

  const gapMinutes = calculateGapToSleep(currentTime, sleepStart);
  if (gapMinutes > 0) {
    addSequentialBlock({
      label: "Evening wind-down & buffer",
      durationMinutes: gapMinutes,
      blockType: "BREAK",
      energy: "LOW",
    });
  }

  const allBlocks: DayTypeBlock[] = [
    ...sequentialBlocks,
    {
      label: "Sleep",
      start: sleepStart,
      end: sleepEnd,
      blockType: "PRACTICE",
      energy: "NO",
    },
  ];

  const sleepStartMin = parseDayTypeTimeValue(sleepStart);
  const normalizedSegments = normalizeDayTypeSegments(
    allBlocks,
    sleepStartMin
  );
  return normalizedSegments.map((segment) => ({
    type: "CREATE_DAY_TYPE_TIME_BLOCK",
    day_type_name: normalizedDayTypeName,
    label: segment.label,
    start_local: formatMinutesForDayTypeOps(segment.startMin),
    end_local: formatMinutesForDayTypeOps(segment.endMin),
    block_type: segment.blockType,
    energy: segment.energy,
  }));
};

export function runAutopilotIntent({
  prompt,
  scope,
  snapshot,
}: RunAutopilotIntentArgs): AiIntentResponse {
  const trimmedPrompt = prompt.trim();
  const normalized = trimmedPrompt.toLowerCase();
  const goals = Array.isArray(snapshot?.goals) ? snapshot.goals : [];
  const projects = Array.isArray(snapshot?.projects) ? snapshot.projects : [];
  const dayTypes = Array.isArray(snapshot?.dayTypes) ? snapshot.dayTypes : [];
  const timeZone = getSnapshotTimeZone(snapshot);
  const windows = normalizeSnapshotWindows(snapshot);
  const recurringHabits = Array.isArray(snapshot?.habits)
    ? snapshot.habits
    : [];

  if (isTopPrioritiesPrompt(normalized)) {
    if (!snapshot) {
      const extras = createIntentExtras();
      const intent: AiIntent = {
        type: "NO_OP",
        confidence: 0.8,
        title: "Top priorities",
        message: "Snapshot data is unavailable to list your priorities right now.",
        ...extras,
      };
      return buildResponse(
        scope,
        intent,
        "Snapshot data is unavailable; I can't pull your priorities right now.",
        undefined,
        snapshot
      );
    }

    const requestedCount = parseTopPrioritiesCount(normalized);
    const resultLimit = clampPriorityDisplayCount(requestedCount);
    const mentionsGoals = /\bgoals?\b/.test(normalized);
    const mentionsProjects = /\bprojects?\b/.test(normalized);
    const onlyGoals = mentionsGoals && !mentionsProjects;
    const onlyProjects = mentionsProjects && !mentionsGoals;
    const showBoth = !onlyGoals && !onlyProjects;

    const sortedGoals = [...goals].sort(
      (a, b) => getGoalPrioritySortValue(a) - getGoalPrioritySortValue(b)
    );
    const sortedProjects = [...projects].sort(
      (a, b) => getProjectRankValue(a) - getProjectRankValue(b)
    );

    let displayedCount = 0;
    const sections: string[] = [];

    const appendSection = <T extends Record<string, unknown>>(
      label: string,
      items: T[],
      formatter: (item: T, ordinal: number) => string
    ) => {
      if (displayedCount >= resultLimit) return;
      const lines: string[] = [];
      for (const item of items) {
        if (displayedCount >= resultLimit) break;
        const line = formatter(item, displayedCount + 1);
        lines.push(line);
        displayedCount += 1;
      }
      if (lines.length > 0) {
        sections.push(`${label}:\n${lines.join("\n")}`);
      }
    };

    const formatGoalLine = (
      goal: AutopilotGoalSnapshot,
      ordinal: number
    ): string => {
      const title = (goal.name?.trim() || "Unnamed goal").toUpperCase();
      const priorityLabel = normalizePriorityLabel(goal.priority);
      const contextTags = extractContextTags(goal as Record<string, unknown>);
      const detailParts: string[] = [];
      if (priorityLabel) detailParts.push(`Priority: ${priorityLabel}`);
      if (contextTags.length) detailParts.push(contextTags.join(" / "));
      return `${ordinal}. ${title}${
        detailParts.length ? ` (${detailParts.join(", ")})` : ""
      }`;
    };

    const formatProjectLine = (
      project: AutopilotProjectSnapshot,
      ordinal: number
    ): string => {
      const title = (project.name?.trim() || "Unnamed project").toUpperCase();
      const rankValue =
        typeof project.global_rank === "number" &&
        Number.isFinite(project.global_rank)
          ? project.global_rank
          : null;
      const contextTags = extractContextTags(project as Record<string, unknown>);
      const detailParts: string[] = [];
      if (rankValue !== null) detailParts.push(`Rank ${rankValue}`);
      if (contextTags.length) detailParts.push(contextTags.join(" / "));
      return `${ordinal}. ${title}${
        detailParts.length ? ` (${detailParts.join(", ")})` : ""
      }`;
    };

    if (showBoth || onlyGoals) {
      appendSection("Top goals", sortedGoals, formatGoalLine);
    }
    if ((showBoth && displayedCount < resultLimit) || onlyProjects) {
      appendSection("Top projects", sortedProjects, formatProjectLine);
    }

    if (sections.length === 0) {
      const assistantMessage =
        "No goals or projects are tracked yet—link some priorities and try again.";
      const extras = createIntentExtras();
      const intent: AiIntent = {
        type: "NO_OP",
        confidence: 0.6,
        title: "Top priorities",
        message: "No priorities available yet.",
        ...extras,
      };
      return buildResponse(scope, intent, assistantMessage, undefined, snapshot);
    }

    const assistantMessage = sections.join("\n\n");
    const summaryTarget = onlyGoals
      ? "goals"
      : onlyProjects
      ? "projects"
      : "priorities";
    const extras = createIntentExtras();
    const intent: AiIntent = {
      type: "NO_OP",
      confidence: 0.8,
      title: "Top priorities",
      message: `Shared your top ${summaryTarget}.`,
      ...extras,
    };
    return buildResponse(scope, intent, assistantMessage, undefined, snapshot);
  }

  if (isOverlayPlanningPrompt(normalized)) {
    const overlayDurationHours = 3;
    const nowMinutes = getNowMinutesFromTimeZone(timeZone);
    const overlayEnd = formatMinutesToTime(
      Math.floor(nowMinutes) + overlayDurationHours * 60
    );
    const focusTargets = getPriorityNames(goals, projects, 3);
    const habitLabels = recurringHabits
      .map((habit) => habit?.name?.trim())
      .filter(Boolean);
    const planSegments = [
      focusTargets[0]
        ? `1. Deep focus on ${focusTargets[0]} (~90 min)`
        : "1. Deep focus on your top priority (~90 min)",
      focusTargets[1]
        ? `2. Advance ${focusTargets[1]} or another priority (~45 min)`
        : "2. Handle a supporting priority or quick win (~45 min)",
      habitLabels[0]
        ? `3. Reserve ${habitLabels[0]} as a habit anchor/reset (~30 min)`
        : "3. Slot a wellness habit or reset (~30 min)",
    ];
    const assistantMessage = `Overlay window plan (start now, end around ${overlayEnd}):\n${planSegments.join(
      "\n"
    )}`;
    const followUps = [
      "Turn this overlay into a day type template",
      "Capture a task from the first focus block",
      "Share more recurring habits if they should repeat daily",
    ];
    const intent = createNoOpIntent("Overlay window plan", 0.8);
    return buildResponse(
      "read_only",
      intent,
      assistantMessage,
      followUps,
      snapshot
    );
  }

  const goalName = extractNameAfterKeyword(trimmedPrompt, "create goal");
  if (matchesGoalIntent(normalized)) {
    if (scope === "read_only") {
      const followUps = [
        "Switch scope to Draft Creation",
        goalName ? `Create a new goal: ${goalName}` : "Create a new goal",
      ];
      return createScopeClarificationResponse(
        "create a goal",
        "draft_creation",
        scope,
        snapshot,
        followUps
      );
    }
    if (!goalName) {
      const intent = createClarificationIntent(
        "Need a goal name",
        "I caught that you want to create a goal but didn’t catch the name.",
        ["goal_name"],
        [
          "What do you want to name the goal?",
          "What priority? (optional)",
          "Any target timeframe? (optional)",
        ]
      );
      return buildResponse(
        scope,
        intent,
        "Goal creation needs a name before I can draft it.",
        ["Share the goal name"],
        snapshot
      );
    }
    const draft = {
      name: goalName,
      priority: null,
      projectId: null,
      goalId: null,
    };
    const intent = createDraftIntent(
      "DRAFT_CREATE_GOAL",
      "Autopilot goal draft",
      `Preparing to create the goal "${goalName}".`,
      draft
    );
    return buildResponse(
      scope,
      intent,
      `Draft goal "${goalName}" is ready for confirmation.`,
      ["Review the goal", "Confirm to create it"],
      snapshot
    );
  }

  const projectName = extractNameAfterKeyword(trimmedPrompt, "create project");
  if (matchesProjectIntent(normalized)) {
    if (scope === "read_only") {
      const followUps = [
        "Switch scope to Draft Creation",
        projectName
          ? `Create a new project: ${projectName}`
          : "Create a new project",
      ];
      return createScopeClarificationResponse(
        "create a project",
        "draft_creation",
        scope,
        snapshot,
        followUps
      );
    }
    if (!projectName) {
      const intent = createClarificationIntent(
        "Need a project name",
        "I noticed you want a project but didn\'t catch the name.",
        ["project name"],
        ["What should the project be called?"]
      );
      return buildResponse(
        scope,
        intent,
        "Project creation needs a name before I can draft it.",
        ["Provide a project name"],
        snapshot
      );
    }

    const draft = {
      name: projectName,
      priority: null,
      projectId: null,
      goalId: null,
    };
    const intent = createDraftIntent(
      "DRAFT_CREATE_PROJECT",
      "Autopilot project draft",
      `Preparing to create the project "${projectName}".`,
      draft
    );
    return buildResponse(
      scope,
      intent,
      `Draft project named "${projectName}" is ready for confirmation.`,
      ["Review the project", "Confirm to create it"],
      snapshot
    );
  }

  const taskName = extractNameAfterKeyword(trimmedPrompt, "create task");
  if (matchesTaskIntent(normalized)) {
    if (scope === "read_only") {
      const followUps = [
        "Switch scope to Draft Creation",
        taskName ? `Create a new task: ${taskName}` : "Create a new task",
      ];
      return createScopeClarificationResponse(
        "create a task",
        "draft_creation",
        scope,
        snapshot,
        followUps
      );
    }
    if (!taskName) {
      const intent = createClarificationIntent(
        "Need a task name",
        "I spotted a request to create a task but didn\'t catch the name.",
        ["task name"],
        ["What should the task be called?"]
      );
      return buildResponse(
        scope,
        intent,
        "Task creation needs a name before I can draft it.",
        ["Provide a task name"],
        snapshot
      );
    }

    const projectMatches = findProjectMatches(trimmedPrompt, projects);
    if (projectMatches.length === 1) {
      const draft = {
        name: taskName,
        priority: null,
        projectId: projectMatches[0].id,
        goalId: null,
      };
      const intent = createDraftIntent(
        "DRAFT_CREATE_TASK",
        "Autopilot task draft",
        `Preparing to create the task "${taskName}" under project ${projectMatches[0].name}.`,
        draft
      );
      return buildResponse(
        scope,
        intent,
        `Draft task "${taskName}" is ready for confirmation.`,
        ["Review the task", "Confirm to create it"],
        snapshot
      );
    }

    if (projectMatches.length > 1) {
      const intent = createClarificationIntent(
        "Which project?",
        "Multiple projects match the name you mentioned.",
        ["target project"],
        ["Which project should own this task?"]
      );
      const followUps = projectMatches
        .map((project) => project.name)
        .filter(Boolean) as string[];
      return buildResponse(
        scope,
        intent,
        "Clarify which project should own this task.",
        followUps,
        snapshot
      );
    }

  const intent = createClarificationIntent(
    "Need a project",
    "I couldn\'t match a project for this task.",
    ["project name"],
    ["Which project should the task belong to?"]
  );
  return buildResponse(
    scope,
    intent,
    "Task creation needs a project before I can draft it.",
    projects.map((project) => project.name).filter(Boolean) as string[],
    snapshot
  );
}

if (isDayTypeCreationPrompt(normalized)) {
  if (scope !== "schedule_edit") {
    const followUps = [
      "Switch scope to Schedule Edit",
      "Plan a new day type template",
    ];
    return createScopeClarificationResponse(
      "create a day type",
      "schedule_edit",
      scope,
      snapshot,
      followUps
    );
  }
  const existingDayTypeNames = new Set<string>(
    dayTypes
      .map((entry) => normalizeForComparison(entry.name ?? ""))
      .filter((value): value is string => Boolean(value))
  );
  const priorityNames = getPriorityNames(goals, projects);
  const extractedName = extractDayTypeNameFromPrompt(trimmedPrompt);
  const baseName =
    extractedName ||
    (priorityNames[0] ? `${priorityNames[0]} day type` : "New day type");
  const formattedBase = formatDayTypeName(baseName);
  const dayTypeName = ensureUniqueDayTypeName(
    formattedBase,
    existingDayTypeNames
  );
  const hasAnchorData = windows.length > 0 || recurringHabits.length > 0;
  if (!snapshot || !hasAnchorData) {
    const missingItems: string[] = [];
    if (!snapshot) missingItems.push("snapshot");
    if (!windows.length) missingItems.push("day windows");
    if (!recurringHabits.length) missingItems.push("recurring habits");
    const intent = createClarificationIntent(
      "Need day type anchors",
      "I need recurring habit or window data before crafting a full 24-hour day type template.",
      missingItems,
      [
        "What recurring habits anchor your day (sleep, meals, routines)?",
        "What should a complete day type include for you (meals, anchor windows, focus)?",
        "Do you have preferences for sleep and meal windows or a day-type schema?",
      ]
    );
    return buildResponse(
      scope,
      intent,
      "Please share the anchor data (habits/windows) so I can draft the day type.",
      [
        "Describe your recurring habits and windows",
        "Share any schema or sleep/mealtime preferences",
      ],
      snapshot
    );
  }
  const uppercaseDayTypeName = dayTypeName.toUpperCase();
  const blockOps = buildFullDayTypeBlockOps({
    dayTypeName: uppercaseDayTypeName,
    focusThemes: priorityNames,
    habits: recurringHabits,
    windows,
  });
  const ops: AiSchedulerOp[] = [
    { type: "CREATE_DAY_TYPE", name: uppercaseDayTypeName },
    ...blockOps,
  ];
  const focusHighlight = priorityNames[0] ?? "your priorities";
  const assistantMessage = `Drafted the "${uppercaseDayTypeName}" template with ${blockOps.length} blocks spanning 00:00-24:00, weaving sleep, meals, recurring habits, and focus time for ${focusHighlight}.`;
  const followUps = [
    "Review or tweak the block labels and durations",
    "Assign the new day type when you are ready",
  ];
  const intent = createSchedulerIntent(
    "Autopilot day type template",
    `Suggesting day type "${uppercaseDayTypeName}".`,
    ops
  );
  return buildResponse(scope, intent, assistantMessage, followUps, snapshot);
}

if (matchesDayTypeIntent(normalized)) {
    if (scope === "read_only") {
      const followUps = [
        "Switch scope to Schedule Edit",
        "Set a day type assignment",
      ];
      return createScopeClarificationResponse(
        "assign a day type",
        "schedule_edit",
        scope,
        snapshot,
        followUps
      );
    }

    const matches = findDayTypeMatches(trimmedPrompt, dayTypes);
    if (matches.length === 0) {
      const intent = createClarificationIntent(
        "Need a day type",
        "I didn\'t catch which day type you want to assign.",
        ["day type"],
        ["Which day type should I set?"]
      );
      return buildResponse(
        scope,
        intent,
        "Tell me which day type you want to assign.",
        dayTypes.map((dayType) => dayType.name).filter(Boolean) as string[],
        snapshot
      );
    }

    const dayType = matches[0];
    const wantsTomorrow = normalized.includes("tomorrow");
    const anchorDate = parseDayKey(snapshot?.dayKey) ?? new Date();
    const targetDate = new Date(anchorDate);
    if (wantsTomorrow) {
      targetDate.setDate(targetDate.getDate() + 1);
    }
    const targetDayKey = formatDateKey(targetDate);
    const ops: AiSchedulerOp[] = [
      {
        type: "SET_DAY_TYPE_ASSIGNMENT",
        date: targetDate.toISOString(),
        day_type_name: dayType.name ?? "",
      },
    ];
    const intent = createSchedulerIntent(
      "Autopilot day type",
      `Prepare to set ${dayType.name} for ${targetDayKey}.`,
      ops
    );
    return buildResponse(
      scope,
      intent,
      `Drafted setting ${dayType.name} for ${targetDayKey}.`,
      ["Preview the proposed assignment", "Confirm when ready"],
      snapshot
    );
  }

  const goalCount = goals.length;
  const projectCount = projects.length;
  const windowCount = Array.isArray(snapshot?.windows) ? snapshot.windows.length : 0;
  const summaryParts = [];
  if (goalCount > 0) {
    summaryParts.push(`Tracking ${goalCount} goal${goalCount === 1 ? "" : "s"}`);
  }
  if (projectCount > 0) {
    summaryParts.push(`Working in ${projectCount} project${projectCount === 1 ? "" : "s"}`);
  }
  if (windowCount > 0) {
    summaryParts.push(`${windowCount} scheduled window${windowCount === 1 ? "" : "s"}`);
  }
  const summary = summaryParts.length > 0
    ? summaryParts.join(" - ")
    : "No active goals or projects yet.";
  const intent = createNoOpIntent("Autopilot standing by.");
  return buildResponse(
    scope,
    intent,
    `Autopilot summary: ${summary}`,
    ["Create a new goal", "Link a task to a project", "Adjust your schedule"],
    snapshot
  );
}
