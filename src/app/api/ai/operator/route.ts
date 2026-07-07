import OpenAI from "openai";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  AI_INTENT_MAX_OUTPUT_TOKENS,
  AI_INTENT_MAX_PROMPT_CHARS,
  AI_INTENT_MAX_SERIALIZED_CONTEXT_CHARS,
  AI_INTENT_MAX_THREAD_MESSAGE_CHARS,
  AI_INTENT_MAX_THREAD_MESSAGES,
  AI_INTENT_MODEL,
  AI_INTENT_STATIC_INPUT_CHARS_ESTIMATE,
  AI_INTENT_TEMPERATURE,
  estimateAiIntentCostUsd,
  getAiModelPricing,
} from "@/lib/ai/config";
import {
  getCreatorAiContext,
  type OperatorIntentMode,
  type OperatorMyListContext,
  type OperatorProposedAction,
  type SuggestedAction,
} from "@/lib/ai/operatorContext";
import { buildOperatorProposedActions } from "@/lib/ai/operatorProposedActions";
import { resolveAiIntentsMode } from "@/lib/ai/openaiIntent";
import {
  fetchAiMonthlyUsage,
  getAiMonthStart,
  recordAiMonthlyUsage,
} from "@/lib/ai/usage";
import type { AiThreadPayload } from "@/lib/types/ai";

export const runtime = "nodejs";

type EntitlementRow = {
  tier?: string | null;
  is_active?: boolean | null;
};

type UsageCounterRpc = (
  fn: "increment_usage_counter",
  args: { p_key: string; p_bucket_start: string }
) => Promise<{ data: unknown; error: unknown }>;

const FALLBACK_TIME_ZONE = "America/Chicago";
const AI_OPERATOR_TIMEOUT_MS = 45_000;
const EMPTY_PROPOSED_ACTIONS: OperatorProposedAction[] = [];

const PAID_TIERS = new Set(
  ["CREATOR PLUS", "MANAGER", "ENTERPRISE", "ADMIN"].map((value) =>
    value.toUpperCase()
  )
);

const MONTHLY_AI_BUDGET_USD = (() => {
  const raw = process.env.CREATOR_PLUS_AI_BUDGET_USD;
  const parsed = Number.parseFloat(raw ?? "");
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return 1;
})();

function getConfiguredLimit(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const CREATOR_PLUS_AI_DAILY_LIMIT = getConfiguredLimit(
  process.env.CREATOR_PLUS_AI_DAILY_LIMIT,
  20
);

const CREATOR_PLUS_AI_MINUTE_LIMIT = getConfiguredLimit(
  process.env.CREATOR_PLUS_AI_MINUTE_LIMIT,
  3
);

function truncateToUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function truncateToUtcMinute(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      0,
      0
    )
  );
}

function inferCounterValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof value === "object" && value !== null) {
    for (const key of ["count", "value", "usage", "total"]) {
      const candidate = (value as Record<string, unknown>)[key];
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        return candidate;
      }
      if (typeof candidate === "string") {
        const parsed = Number.parseInt(candidate, 10);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
  }
  return null;
}

function parseDayKey(value: string) {
  return /^(\d{4})-(\d{2})-(\d{2})$/.test(value) ? value : null;
}

function formatDayKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

function normalizeTimeZone(value?: string) {
  if (!value) return FALLBACK_TIME_ZONE;
  const trimmed = value.trim();
  if (!trimmed) return FALLBACK_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed });
    return trimmed;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

async function resolveOperatorTimeZone({
  supabase,
  userId,
  requestedTimeZone,
}: {
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
  userId: string;
  requestedTimeZone?: unknown;
}) {
  if (typeof requestedTimeZone === "string") {
    const trimmed = requestedTimeZone.trim();
    if (trimmed && isValidTimeZone(trimmed)) return trimmed;
  }

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("timezone")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn("Failed to resolve AI operator profile timezone", {
        message: error.message,
        code: error.code,
      });
    } else {
      const profileTimeZone =
        typeof data?.timezone === "string" ? data.timezone.trim() : "";
      if (profileTimeZone && isValidTimeZone(profileTimeZone)) {
        return profileTimeZone;
      }
    }
  } catch (error) {
    console.warn("Failed to resolve AI operator profile timezone", error);
  }

  return normalizeTimeZone(undefined);
}

function isNextActionPrompt(message: string): boolean {
  const normalized = message
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return [
    /\bwhat should i do(?: today| next| now)?\b/,
    /\bwhat do i do(?: today| next| now)?\b/,
    /\bwhat matters (?:now|today|next)\b/,
    /\bwhat should i focus on(?: today| next| now)?\b/,
    /\bwhat do i focus on(?: today| next| now)?\b/,
  ].some((pattern) => pattern.test(normalized));
}

function normalizeIntentText(message: string): string {
  return message
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function routeOperatorIntent(message: string): OperatorIntentMode {
  const normalized = normalizeIntentText(message);
  if (
    [
      /\bwhat should i do next\b/,
      /\bwhat should i do now\b/,
      /\bwhat now\b/,
      /\bwhat should i focus on\b/,
      /\bwhat do i focus on\b/,
      /\bwhat should i do\b/,
    ].some((pattern) => pattern.test(normalized))
  ) {
    return "next_action";
  }
  if (
    [
      /\bwhat did i miss\b/,
      /\bwhat have i missed today\b/,
      /\bwhat did i miss today\b/,
      /\bwhat should i recover from today\b/,
      /\bwhat slipped today\b/,
    ].some((pattern) => pattern.test(normalized))
  ) {
    return "missed_today";
  }
  if (
    [
      /\bwhat am i neglecting\b/,
      /\bwhat have i been neglecting\b/,
      /\bwhat am i ignoring\b/,
      /\bwhat is slipping\b/,
      /\bwhat s slipping\b/,
    ].some((pattern) => pattern.test(normalized))
  ) {
    return "neglect";
  }
  if (
    [
      /\bhelp me plan my day\b/,
      /\bplan today\b/,
      /\bplan my day\b/,
      /\border my day\b/,
      /\bplan the day\b/,
    ].some((pattern) => pattern.test(normalized))
  ) {
    return "plan_day";
  }
  if (
    [
      /\bsummarize my schedule\b/,
      /\bsummarize the schedule\b/,
      /\bwhat is today\b/,
      /\bwhat s today\b/,
      /\bwhat is on my schedule\b/,
      /\bwhat s on my schedule\b/,
    ].some((pattern) => pattern.test(normalized))
  ) {
    return "schedule_summary";
  }
  if (
    [
      /\bgoals?\b/,
      /\bprojects?\b/,
      /\bwhat goal should i work on\b/,
      /\bwhat project should i work on\b/,
    ].some((pattern) => pattern.test(normalized))
  ) {
    return "goals_projects";
  }
  if (
    [
      /\bmy list\b/,
      /\btodo list\b/,
      /\bto do list\b/,
      /\bwhat is on my list\b/,
      /\bwhat s on my list\b/,
    ].some((pattern) => pattern.test(normalized))
  ) {
    return "my_list";
  }
  if (isNextActionPrompt(message)) return "next_action";
  if (isScheduleSummaryPrompt(message)) return "schedule_summary";
  if (isNeglectPrompt(message)) return "neglect";
  return "general";
}

function isNeglectPrompt(message: string): boolean {
  const normalized = message
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return [
    /\bwhat am i neglecting\b/,
    /\bwhat have i been neglecting\b/,
    /\bwhat am i missing\b/,
    /\bwhat am i ignoring\b/,
    /\bwhat is slipping\b/,
    /\bwhat s slipping\b/,
  ].some((pattern) => pattern.test(normalized));
}

function isOvernightWorkPrompt(message: string): boolean {
  const normalized = message
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return [
    /\b(staying|stay|working|work|pulling)\s+(up\s+)?(?:overnight|all night|late)\b/,
    /\bovernight work\b/,
    /\bnight shift\b/,
    /\bi am up intentionally\b/,
    /\bi m up intentionally\b/,
  ].some((pattern) => pattern.test(normalized));
}

function isRecoveryOverridePrompt(message: string): boolean {
  const normalized = message
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return [
    /\b(?:override|skip|end|leave|ignore|cancel|stop)\s+(?:my\s+)?(?:sleep|rest|recovery|shutdown|wind down|bedtime|break|nap|off)\b/,
    /\b(?:wake|waking)\s+(?:up\s+)?(?:now|early|anyway|despite)\b/,
    /\bi\s+(?:want|need|have)\s+to\s+(?:wake up|work|keep going|stay up)\b/,
    /\bi\s+(?:am|m)\s+(?:awake|up)\s+(?:on purpose|intentionally)\b/,
  ].some((pattern) => pattern.test(normalized));
}

function isPlanningPrompt(message: string): boolean {
  const normalized = message
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return [
    /\bplan (?:my |the )?(?:day|today|tomorrow|next day)\b/,
    /\bsummarize (?:my |the )?schedule\b/,
    /\bwhat(?:'| i)?s on (?:my )?schedule\b/,
    /\blook ahead\b/,
  ].some((pattern) => pattern.test(normalized));
}

function isScheduleSummaryPrompt(message: string): boolean {
  const normalized = message
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return [
    /\bsummarize (?:my |the )?schedule(?: for today| today)?\b/,
    /\bsummary of (?:my |the )?schedule\b/,
    /\bwhat(?:'| i)?s on (?:my )?schedule\b/,
    /\bwhat is on (?:my )?schedule\b/,
  ].some((pattern) => pattern.test(normalized));
}

function formatLocalDateTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function getLocalHour(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number.parseInt(
    parts.find((part) => part.type === "hour")?.value ?? "",
    10
  );
  return Number.isFinite(hour) ? hour : date.getUTCHours();
}

function normalizeThread(value: unknown):
  | { ok: true; thread: AiThreadPayload[] }
  | { ok: false; error: string } {
  if (value === undefined) return { ok: true, thread: [] };
  if (!Array.isArray(value)) {
    return { ok: false, error: "Thread must be an array" };
  }
  if (value.length > AI_INTENT_MAX_THREAD_MESSAGES) {
    return {
      ok: false,
      error: `Thread must have ${AI_INTENT_MAX_THREAD_MESSAGES} messages or fewer`,
    };
  }

  const thread: AiThreadPayload[] = [];
  for (const entry of value) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as { role?: unknown }).role !== "string" ||
      typeof (entry as { content?: unknown }).content !== "string"
    ) {
      return { ok: false, error: "Thread items must include role and content" };
    }
    const role = (entry as { role: string }).role;
    const content = (entry as { content: string }).content.trim();
    if (role !== "user" && role !== "assistant") {
      return { ok: false, error: "Thread role must be user or assistant" };
    }
    if (content.length > AI_INTENT_MAX_THREAD_MESSAGE_CHARS) {
      return {
        ok: false,
        error: `Thread messages must be ${AI_INTENT_MAX_THREAD_MESSAGE_CHARS} characters or fewer`,
      };
    }
    if (content) {
      thread.push({ role, content });
    }
  }

  return { ok: true, thread };
}

const MY_LIST_CLIENT_ROW_CAP = 10;
const MY_LIST_TEXT_MAX_CHARS = 160;

function sanitizeText(value: unknown, maxChars: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxChars);
}

function sanitizeOptionalString(
  value: unknown,
  maxChars: number
): string | null {
  const sanitized = sanitizeText(value, maxChars);
  return sanitized || null;
}

function sanitizeClientMyListContext(value: unknown): OperatorMyListContext {
  if (!value || typeof value !== "object") {
    return { source: "unavailable", rows: [], capped: false };
  }
  const record = value as Record<string, unknown>;
  const source =
    record.source === "client_local_storage"
      ? "client_local_storage"
      : "unavailable";
  if (!Array.isArray(record.rows) || source === "unavailable") {
    return { source: "unavailable", rows: [], capped: false };
  }
  const rows: OperatorMyListContext["rows"] = [];
  const seen = new Set<string>();
  for (const row of record.rows) {
    if (rows.length >= MY_LIST_CLIENT_ROW_CAP) break;
    if (!row || typeof row !== "object") continue;
    const rowRecord = row as Record<string, unknown>;
    const id = sanitizeText(rowRecord.id, 80);
    const text = sanitizeText(rowRecord.text, MY_LIST_TEXT_MAX_CHARS);
    if (!id || !text || seen.has(id)) continue;
    seen.add(id);
    rows.push({
      id,
      text,
      done: Boolean(rowRecord.done),
      completedAt: sanitizeOptionalString(rowRecord.completedAt, 40),
      skillIcon: sanitizeOptionalString(rowRecord.skillIcon, 16),
      skillName: sanitizeOptionalString(rowRecord.skillName, 80),
      dayBucketId: sanitizeOptionalString(rowRecord.dayBucketId, 32),
      priorityId: sanitizeOptionalString(rowRecord.priorityId, 32),
    });
  }
  return {
    source: "client_local_storage",
    clientProvided: true,
    rows,
    capped: record.rows.length > rows.length,
  };
}

const toNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

function extractUsageFromResponse(response: {
  usage?: unknown;
}): { input_tokens: number; output_tokens: number } | undefined {
  const usage = response.usage;
  if (!usage || typeof usage !== "object") return undefined;
  const usageRecord = usage as Record<string, unknown>;
  const inputTokens = toNumber(
    usageRecord.prompt_tokens ?? usageRecord.input_tokens ?? usageRecord.input
  );
  const outputTokens = toNumber(
    usageRecord.completion_tokens ??
      usageRecord.output_tokens ??
      usageRecord.output
  );
  const totalTokens = toNumber(usageRecord.total_tokens);
  const resolvedInput = inputTokens ?? 0;
  let resolvedOutput = outputTokens ?? 0;
  if (!outputTokens && totalTokens !== undefined) {
    resolvedOutput = Math.max(totalTokens - resolvedInput, 0);
  }
  if (resolvedInput === 0 && resolvedOutput === 0) return undefined;
  return { input_tokens: resolvedInput, output_tokens: resolvedOutput };
}

function buildContextSummary(context: unknown) {
  const record = context as Record<string, unknown>;
  const operatorState =
    typeof record.operator_state === "object" && record.operator_state !== null
      ? (record.operator_state as Record<string, unknown>)
      : {};
  return {
    dayKey: record.dayKey,
    timeZone: record.timeZone,
    scheduleItems: Array.isArray(record.schedule_instances)
      ? record.schedule_instances.length
      : 0,
    scheduledItems: Array.isArray(record.schedule_instances)
      ? record.schedule_instances.length
      : 0,
    windows: Array.isArray(record.windows) ? record.windows.length : 0,
    blocks: Array.isArray(record.windows) ? record.windows.length : 0,
    goals: Array.isArray(record.goals) ? record.goals.length : 0,
    projects: Array.isArray(record.projects) ? record.projects.length : 0,
    habits: Array.isArray(record.habits) ? record.habits.length : 0,
    recentCompletions: Array.isArray(record.recentCompletions)
      ? record.recentCompletions.length
      : 0,
    suggestedActions: Array.isArray(operatorState.suggestedActions)
      ? operatorState.suggestedActions.length
      : 0,
  };
}

function buildSuggestedActionsPromptSummary(actions: SuggestedAction[]) {
  if (actions.length === 0) return "none";
  return actions
    .slice(0, 4)
    .map((action) => {
      const state = action.unavailableReason
        ? `unavailable: ${action.unavailableReason}`
        : action.href
          ? `read-only link: ${action.href}`
          : "read-only";
      return `${action.kind}: ${action.label} - ${action.reason} (${state})`;
    })
    .join("\n");
}

type OperatorContext = Awaited<ReturnType<typeof getCreatorAiContext>>;

function stripSuggestedActionPrefix(label: string, prefix: string) {
  return label.startsWith(prefix) ? label.slice(prefix.length).trim() : label;
}

function getSecondaryNextActionContext(context: OperatorContext) {
  const missed = context.operator_state.missedTodayItems[0];
  if (missed) {
    return `After that, handle missed item ${missed.title} if it still matters.`;
  }

  const due =
    context.operator_state.neglectIntelligence.dueHabitsUnscheduledIncomplete[0] ??
    context.operator_state.neglectIntelligence.dueUnscheduledProjects[0] ??
    context.operator_state.neglectIntelligence.overdueProjects[0];
  if (due) {
    return `After that, clear ${due.title} if you still have capacity.`;
  }

  return null;
}

function alignNextActionAnswerWithTopSuggestion({
  answer,
  context,
  intentMode,
  suggestedActions,
}: {
  answer: string;
  context: OperatorContext;
  intentMode: OperatorIntentMode;
  suggestedActions: SuggestedAction[];
}) {
  if (intentMode !== "next_action") return answer;
  const topAction = suggestedActions.find((action) => !action.unavailableReason);
  if (!topAction) return answer;
  const secondary = getSecondaryNextActionContext(context);

  if (topAction.kind === "start_focus") {
    const blockLabel =
      topAction.evidence?.blockLabel ??
      stripSuggestedActionPrefix(topAction.label, "Start Focus Pomo:");
    const primary = topAction.reason.startsWith("Current block")
      ? `Start or continue ${blockLabel} in Focus Pomo now.`
      : `Make ${blockLabel} the next Focus Pomo block.`;
    return [primary, topAction.reason, secondary].filter(Boolean).join(" ");
  }

  if (topAction.kind === "protect_recovery") {
    return [topAction.reason, secondary].filter(Boolean).join(" ");
  }

  return [`Start with ${topAction.label}.`, topAction.reason, secondary]
    .filter(Boolean)
    .join(" ");
}

function classifyRelationToNow(item: Record<string, unknown>, nowMs: number) {
  const start = toNumber(item.start_utc_ms);
  const end = toNumber(item.end_utc_ms);
  if (start === undefined || end === undefined) return "invalid";
  if (end <= nowMs) return "missed";
  if (start > nowMs) return "upcoming";
  if (start <= nowMs && nowMs < end) return "current";
  return "invalid";
}

const PLACEHOLDER_MOVE_TITLE_PATTERNS = [
  "snapshot test",
  "test",
  "placeholder",
  "event name",
  "demo",
];

function isPlaceholderMoveTitle(title: string) {
  const normalized = title.trim().toLowerCase();
  return PLACEHOLDER_MOVE_TITLE_PATTERNS.some((pattern) =>
    normalized.includes(pattern)
  );
}

function summarizeNeglectItem(item: unknown, nowMs: number) {
  const record = typeof item === "object" && item !== null
    ? (item as Record<string, unknown>)
    : {};
  return {
    title: typeof record.title === "string" ? record.title : "Untitled",
    start_utc_ms: toNumber(record.start_utc_ms) ?? null,
    end_utc_ms: toNumber(record.end_utc_ms) ?? null,
    relation: classifyRelationToNow(record, nowMs),
  };
}

function logNeglectCheckDebug(context: unknown, runtime: { now_utc_ms: number }) {
  const record = context as Record<string, unknown>;
  const operatorState =
    typeof record.operator_state === "object" && record.operator_state !== null
      ? (record.operator_state as Record<string, unknown>)
      : {};
  const neglectCheck =
    typeof operatorState.neglectCheck === "object" &&
    operatorState.neglectCheck !== null
      ? (operatorState.neglectCheck as Record<string, unknown>)
      : {};
  const missedItems = Array.isArray(neglectCheck.missedItems)
    ? neglectCheck.missedItems
    : [];
  const currentItems = Array.isArray(neglectCheck.currentItems)
    ? neglectCheck.currentItems
    : [];
  const upcomingItems = Array.isArray(neglectCheck.upcomingItems)
    ? neglectCheck.upcomingItems
    : [];
  const neglectIntelligence =
    typeof operatorState.neglectIntelligence === "object" &&
    operatorState.neglectIntelligence !== null
      ? (operatorState.neglectIntelligence as Record<string, unknown>)
      : {};
  const titleList = (bucket: unknown, max: number) =>
    Array.isArray(bucket)
      ? bucket
          .slice(0, max)
          .map((item) =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as { title?: unknown }).title === "string"
              ? (item as { title: string }).title
              : "Untitled"
          )
      : [];
  const selectedMoveCandidate = [
    ["missedScheduledItems", neglectIntelligence.missedScheduledItems],
    ["overdueProjects", neglectIntelligence.overdueProjects],
    [
      "dueHabitsUnscheduledIncomplete",
      neglectIntelligence.dueHabitsUnscheduledIncomplete,
    ],
    ["dueUnscheduledProjects", neglectIntelligence.dueUnscheduledProjects],
    ["staleProjects", neglectIntelligence.staleProjects],
  ].reduce<{ bucket: string; title: string } | null>((selected, entry) => {
    if (selected) return selected;
    const [bucket, items] = entry;
    if (!Array.isArray(items)) return null;
    const item = items.find(
      (candidate) =>
        typeof candidate === "object" &&
        candidate !== null &&
        typeof (candidate as { title?: unknown }).title === "string" &&
        !isPlaceholderMoveTitle((candidate as { title: string }).title)
    );
    return item &&
      typeof item === "object" &&
      typeof (item as { title?: unknown }).title === "string"
      ? { bucket: String(bucket), title: (item as { title: string }).title }
      : null;
  }, null);
  const bucketCounts =
    typeof neglectIntelligence.bucketCounts === "object" &&
    neglectIntelligence.bucketCounts !== null
      ? neglectIntelligence.bucketCounts
      : null;

  console.info("AI operator neglectCheck debug", {
    nowLocal:
      typeof operatorState.nowLocal === "string" ? operatorState.nowLocal : null,
    now_utc_ms: runtime.now_utc_ms,
    missedCount: missedItems.length,
    currentCount: currentItems.length,
    upcomingCount: upcomingItems.length,
    missedItems: missedItems.map((item) =>
      summarizeNeglectItem(item, runtime.now_utc_ms)
    ),
    currentItems: currentItems.map((item) =>
      summarizeNeglectItem(item, runtime.now_utc_ms)
    ),
    upcomingItems: upcomingItems.map((item) =>
      summarizeNeglectItem(item, runtime.now_utc_ms)
    ),
    bucketCounts,
    selectedNeglectTitles: {
      missedScheduledItems: titleList(
        neglectIntelligence.missedScheduledItems,
        3
      ),
      dueItems: [
        ...titleList(neglectIntelligence.overdueProjects, 3),
        ...titleList(neglectIntelligence.dueUnscheduledProjects, 3),
        ...titleList(
          neglectIntelligence.dueHabitsUnscheduledIncomplete,
          3
        ),
      ].slice(0, 3),
      staleItems: [
        ...titleList(neglectIntelligence.staleProjects, 2),
        ...titleList(neglectIntelligence.staleSkills, 2),
        ...titleList(neglectIntelligence.staleMonuments, 2),
        ...titleList(neglectIntelligence.inactiveHighPriorityDomains, 2),
      ].slice(0, 2),
    },
    selectedMoveCandidate,
  });
}

function buildScheduleTimeState(context: unknown, nowMs: number) {
  const record = context as Record<string, unknown>;
  const instances = Array.isArray(record.schedule_instances)
    ? (record.schedule_instances as Array<Record<string, unknown>>)
    : [];
  const isCanceled = (status: unknown) => {
    if (typeof status !== "string") return false;
    const normalized = status.trim().toLowerCase();
    return normalized === "canceled" || normalized === "cancelled";
  };
  const isIncomplete = (item: Record<string, unknown>) =>
    item.completed !== true &&
    item.status !== "completed" &&
    typeof item.completed_at !== "string" &&
    !isCanceled(item.status);
  const active = instances.find((item) => {
    const start = toNumber(item.start_utc_ms);
    const end = toNumber(item.end_utc_ms);
    return (
      isIncomplete(item) &&
      start !== undefined &&
      end !== undefined &&
      start <= nowMs &&
      end > nowMs
    );
  });
  const future = instances
    .filter((item) => {
      const start = toNumber(item.start_utc_ms);
      return isIncomplete(item) && start !== undefined && start > nowMs;
    })
    .sort((a, b) => {
      const aStart = toNumber(a.start_utc_ms) ?? Number.POSITIVE_INFINITY;
      const bStart = toNumber(b.start_utc_ms) ?? Number.POSITIVE_INFINITY;
      return aStart - bStart;
    });
  const next = future[0] ?? null;
  const nextStart = next ? toNumber(next.start_utc_ms) : undefined;
  const minutesUntilNext =
    nextStart !== undefined ? Math.round((nextStart - nowMs) / 60_000) : null;

  return {
    has_active_scheduled_item: Boolean(active),
    active_scheduled_item_title:
      typeof active?.title === "string" ? active.title : null,
    next_scheduled_item_title:
      typeof next?.title === "string" ? next.title : null,
    minutes_until_next_scheduled_item: minutesUntilNext,
  };
}

function getIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) =>
      typeof item === "object" && item !== null
        ? (item as { id?: unknown }).id
        : null
    )
    .filter((id): id is string => typeof id === "string");
}

function buildContextIds(context: unknown) {
  const record = context as Record<string, unknown>;
  return {
    schedule_instance_ids: getIds(record.schedule_instances),
    window_ids: getIds(record.windows),
    goal_ids: getIds(record.goals),
    project_ids: getIds(record.projects),
    habit_ids: getIds(record.habits),
  };
}

function buildProposedActionAnswer(action: OperatorProposedAction) {
  if (action.kind === "create_schedule_event") {
    return `I drafted that event for review: ${action.display.title}, ${action.display.timeRange}.`;
  }
  return "I drafted that action for review.";
}

const OPERATOR_SYSTEM_PROMPT = [
  "You are ILAV, the read-only CREATOR Operator AI.",
  "Use the provided CREATOR context to help the user create order, not infinite possibilities.",
  "Phase 1 is read-only: never claim you changed app data, created rows, completed tasks, scheduled events, or saved anything.",
  "Do not instruct the system to call apply routes or perform database writes.",
  "Act like an operator making a useful call, not a passive schedule summarizer or form filler.",
  "Voice: direct, grounded, specific, and decisive. Sound like a CREATOR Operator, not a wellness chatbot or generic productivity assistant.",
  "Avoid generic wellness/productivity phrases, including: set a positive tone, reconnect with your body, if you're ready, good next step, stay on track, prioritize self-care, prepare for the day.",
  "Never use vague/internal schedule phrases: more than 60 minutes ago, busy evening, several tasks, several calls, lots to do, later tonight.",
  "Prefer concrete verbs: start, finish, reset, prep, clear, write, send, review, complete.",
  "When the user asks what to do today, what to do next, what matters now, or anything similar, choose ONE primary action first in plain human language.",
  "For today/next/now requests, first inspect schedule_digest, context.operator_state, runtime.now_utc_ms, runtime.local_time, context.dayKey, context.timeZone, schedule_instances, and windows.",
  "If the user explicitly asks for a schedule summary, then summarize the schedule. Otherwise do not dump the full schedule.",
  "Use context.operator_state.intentMode to choose the answer shape. Do not answer every prompt as neglect/recovery.",
  "Intent mode rules:",
  "next_action: use current/next block, active recovery, and current/next items.",
  "schedule_summary: use scheduleDigest and scheduleSummaryItems.",
  "missed_today: use missedTodayItems only for missed-today claims.",
  "neglect: use neglectDigest and neglectIntelligence.",
  "plan_day: combine missedTodayItems, due today, and current/next block into a read-only plan.",
  "goals_projects: use project/goal context and project due/stale buckets.",
  "my_list: use myListContext only if available; otherwise say exactly: I cannot see manual My List rows yet.",
  "For schedule summaries, lead with structured lines from context.operator_state.scheduleDigest before interpretation.",
  "Default schedule summary structure: Now, Next, Later, Skills, Move. Include Missed only when actual missed items exist.",
  "Be specific with titles and times. If multiple scheduled items matter, name the most relevant 5 to 8 from context.operator_state.scheduleSummaryItems instead of saying several.",
  "For schedule summaries, preserve scheduled item names exactly as stored, including all caps. If an item has skillIcon, show it before the item name. Show time block/window names in bold ALL CAPS, for example **EXTENDED MORNING ROUTINE**.",
  "For schedule summaries, never use vague grouping phrases such as various evening activities, series of tasks, series of habits and tasks, other activities, various projects, busy evening, several tasks, several items, or the phrase and more.",
  "If there are more items than you can show, say 'showing key items' and list concrete named items with times.",
  "Do not call a missed item next. Next means a future item or block only. Missed items belong under Missed.",
  "Use exact relative timing strings from context.operator_state when available, such as starts in 43m, ended 41m ago, or missed by 3h 14m.",
  "Evidence rules:",
  "For every recommendation, tie it to one specific context fact: current/nearest schedule block, missed/neglected scheduled item, active project/goal, recent completion gap, or current time state.",
  "If context does not prove a claim, phrase it as uncertainty or skip it.",
  "Do not invent actions like stretch, meditation, journaling, or cleaning unless they exist in context or the user directly implies that state.",
  "Operator judgment rules:",
  "The schedule is evidence, not absolute truth.",
  "Current time and user state can override the next scheduled block.",
  "Do not recommend a future block hours early unless the user asks for planning.",
  "Never confuse upcoming with current.",
  "If context is thin, say what is most likely rather than pretending certainty.",
  "Prefer useful judgment over perfect schedule obedience.",
  "Time-state rules:",
  "Between 12:00 AM and 5:00 AM local time, if the user asks what to do next/today/now, default to RECOVERY: shutdown, sleep prep, water, room reset, and stopping the day from leaking.",
  "Late-night exception: if the user explicitly says they are intentionally working overnight or asks to plan/summarize the next day, then you may discuss the upcoming schedule.",
  "At 12:00 AM to 5:00 AM local time, do not recommend preparing for a future morning block hours away unless that exception applies.",
  "Hard sleep/recovery protection: if context.operator_state.isRecoveryActive is true and the user asks what to do now/today/next, recommend staying in recovery/sleep/shutdown. Do not tell the user to wake up, get out of sleep, leave recovery, or start the day. The only exception is when runtime.explicit_recovery_override or runtime.explicit_overnight_work is true.",
  "Never say 'get out of sleep'. If Sleep is active, use context.operator_state.recoveryInstruction when available, or say: You're in Sleep now. Stay there. The next useful action is to shut the app and protect recovery. If Recovery or Break is active, say: Stay in the recovery block unless there is a real obligation.",
  "If no active scheduled item exists and the next scheduled item/block is not near, recommend recovery/reset rather than jumping into the future block.",
  "Before the first scheduled block with a long gap: recommend a recovery, setup, or light prep action unless the user asks for planning.",
  "Inside an active scheduled block: recommend the active block if it is not already completed.",
  "Between blocks: recommend a transition/reset or the next block depending on proximity and user state.",
  "After the final block: recommend shutdown, recovery, and a clean handoff for tomorrow.",
  "If the user says they are tired, hungover, overwhelmed, anxious, fried, scattered, or lost, reduce scope and bias toward BODY, RECOVERY, ROOM, or ADMIN before ambitious work.",
  "Jurisdiction labels are optional. Include 'Jurisdiction: <label>' only when it clarifies the call naturally. Valid labels are SCHEDULE, MONEY, BODY, BUILDER, RECOVERY, ROOM, SKILL, SOCIAL, ADMIN.",
  "Use natural verbs for personal routines: start, do, run, handle, prep, reset. Avoid weird verbs like attend for personal routines.",
  "Give a short reason based on actual context: schedule time, current/next block, goal/project priority, habit, recent completion, day structure, or user state.",
  "Avoid ending with a question like 'Would you like...' unless information is truly missing and you cannot make a reasonable call.",
  "If the current block appears already completed, recommend the next uncompleted block when available.",
  "If schedule context is empty, make the best single recommendation from goals, projects, habits, and recent completions, and say schedule context is missing.",
  "Prefer one next action over many options. If the user is overwhelmed, reduce scope.",
  "Avoid generic productivity fluff. Use concrete names, times, goals, projects, habits, and completions from context when available.",
  "If the user asks what they are neglecting, prefer context.operator_state.neglectIntelligence. Do not simply list unchecked schedule items or infer neglect from future schedule items.",
  "Never call upcoming future items neglected.",
  "Never call items scheduled after the current sleep/recovery block neglected while context.operator_state.isRecoveryActive is true.",
  "Suggested actions are passive read-only proposal cards. You may mention one when relevant, but never imply the card completes, creates, moves, reschedules, saves, or writes anything.",
  "If a suggested action has unavailableReason, describe it only as not wired/read-only and do not instruct the app to apply it.",
  "For neglect answers, an item is Missed only if it appears in context.operator_state.neglectIntelligence.missedScheduledItems. Do not use lastMissedItems to expand the missed list. Future items belong under Upcoming.",
  "For missed-today answers, an item is Missed today only if it appears in context.operator_state.missedTodayItems.",
  "If context.operator_state.neglectCheck.FUTURE_ITEMS_ARE_NOT_NEGLECTED is true, treat all future items as Upcoming only.",
  "For neglect answers, do not recommend generic body/wellness actions unless BODY or RECOVERY items exist in the provided context.",
  "For neglect answers, mention stale and due buckets only when context.operator_state.neglectIntelligence contains deterministic items.",
  "If the user asks for changes, give a draft plan and say Phase 1 can only advise.",
].join("\n");

const NEXT_ACTION_RESPONSE_CONTRACT = [
  "NEXT_ACTION_INTENT is true.",
  "Answer in 2 to 5 short sentences max.",
  "Start with the recommendation in plain human language.",
  "Give one primary action.",
  "If recommending a schedule block, name the block and why it wins right now.",
  "Optionally give one fallback using sharp conditions: If that block has already passed, move to <next block>. If you cannot start it in 5 minutes, do a 10-minute reset and then enter the block.",
  "Include a Jurisdiction label only if it feels natural and useful; do not force a fake form.",
  "If it is late night/pre-day and the next block is hours away, make RECOVERY/sleep prep/reset the recommendation, then briefly name the first morning block only if helpful.",
  "If runtime.late_night_recovery_default is true, recommend shutdown/sleep/recovery first. Do not recommend morning routine, outreach, or prep for a future morning block.",
  "If runtime.active_recovery_protection is true, obey context.operator_state.recoveryInstruction as the primary answer. Do not tell the user to wake up, leave recovery, start the day, or prepare for morning.",
  "If runtime.recovery_reset_default is true, recommend recovery/reset instead of the future scheduled item.",
  "If now is inside an active uncompleted block, recommend that block plainly.",
  "If now is between blocks, recommend transition/reset or the next block based on proximity.",
  "If now is after the final block, recommend shutdown/recovery.",
  "Hard prohibitions for this response:",
  "Do not summarize the whole day.",
  "Do not list more than one primary action.",
  "Do not mention more than one schedule block unless the user asked for a schedule summary.",
  "Do not end with 'Would you like...'",
  "Do not ask for confirmation.",
  "Do not say or imply you can confirm, apply, save, schedule, or update anything.",
  "Do not randomly introduce habits or projects unless they are the current/nearest scheduled item or directly requested.",
  "Do not recommend a future schedule block hours early unless the user asks for planning.",
  "Do not prioritize an unscheduled project over an active/current schedule block unless user state or explicit project priority makes that the better call.",
].join("\n");

const NEGLECT_RESPONSE_CONTRACT = [
  "NEGLECT_INTENT is true.",
  "Use context.operator_state.neglectDigest as the answer contract. Follow its selected titles and overflow counts; do not expand from raw bucket arrays.",
  "Answer in at most 4 labeled lines using only labels present in the digest: Missed, Due today, Overdue, Stale, Move. Omit empty Due today, Overdue, or Stale lines.",
  "Each line must have at most 2 sentences.",
  "Never list more than 3 missed items, 3 total due/overdue items, or 2 stale items. If the digest says +N more or +N more signals, keep that exact capped overflow phrase.",
  "Missed: only use context.operator_state.neglectIntelligence.missedScheduledItems or the Missed line from context.operator_state.neglectDigest. If that bucket is empty, say exactly: Missed: Nothing is clearly missed yet.",
  "Due today: only use dueUnscheduledProjects and dueHabitsUnscheduledIncomplete selected by the digest. Overdue: only use overdueProjects selected by the digest. Never call due-today items overdue.",
  "Stale: only use staleProjects, staleSkills, staleMonuments, and inactiveHighPriorityDomains selected by the digest. Phrase as no recent evidence, no recent XP, or no recent project movement evidence; never claim no work happened.",
  "Future/upcoming scheduled items may be shown only as Upcoming, never Missed or Neglected.",
  "Never call upcoming future items neglected.",
  "Never call items scheduled after the current sleep/recovery block neglected while context.operator_state.isRecoveryActive is true.",
  "Do not infer neglect from future schedule items.",
  "If nothing is actually missed, say exactly: Missed: Nothing is clearly missed yet.",
  "FUTURE_ITEMS_ARE_NOT_NEGLECTED: true.",
  "Use context as evidence, but do not treat unchecked future schedule items as neglect.",
  "Do not say Neglect: as a label.",
  "Do not say Next step:.",
  "Use Move: for the final action line.",
  "Do not say regain momentum, stay on track, set a positive tone, reconnect with your body, several other, various, and more, not scheduled in active window, or no work happened.",
  "Do not call something critical unless its actual priority field is CRITICAL or ULTRA-CRITICAL.",
  "If it is late night/pre-day or recovery is active, protect recovery first, then separate actual missed items from daytime upcoming items.",
  "During active Sleep/Recovery, the Move line must start with protecting sleep/recovery now; do not tell the user to handle a future morning item now.",
  "End with one concrete Move: line using an exact item name when one is available.",
  "Do not recommend generic body/wellness actions unless BODY or RECOVERY items exist in the provided context.",
  "Do not invent stretch, meditation, journaling, cleaning, or other recovery actions unless they exist in context or the user directly implies that state.",
  "Do not list the full schedule.",
  "Do not pretend certainty when context is thin.",
].join("\n");

const MISSED_TODAY_RESPONSE_CONTRACT = [
  "MISSED_TODAY_INTENT is true.",
  "Use context.operator_state.missedTodayItems as the source of truth for missed-today answers.",
  "Missed today means same local day, incomplete, non-canceled, and end_utc <= runtime.now_utc_ms.",
  "Future/upcoming items are never missed.",
  "Answer in 2 to 4 compact labeled lines: Missed today, Still open, Move.",
  "List at most 4 missed-today item names with exact times. Include skillIcon before the item name when present.",
  "Include block/window labels when available.",
  "If missedTodayItems is empty, say: Missed today: Nothing is clearly missed today.",
  "Do not expand from long-range neglect buckets unless the user also asks what they are neglecting.",
  "Do not claim anything was moved, rescheduled, completed, created, or saved.",
].join("\n");

const PLAN_DAY_RESPONSE_CONTRACT = [
  "PLAN_DAY_INTENT is true.",
  "Build a read-only day plan from scheduleDigest, missedTodayItems, due/stale intelligence, and the current/next block.",
  "Answer in 3 to 5 short labeled lines such as Plan, Watch, Move.",
  "Recover current missed-today items before due/stale items when missedTodayItems has values.",
  "Do not write or schedule anything; phrase schedule changes as manual read-only moves.",
  "Do not dump the full schedule.",
].join("\n");

const GOALS_PROJECTS_RESPONSE_CONTRACT = [
  "GOALS_PROJECTS_INTENT is true.",
  "Use projects, goals, and neglectIntelligence overdue/due/stale project buckets first.",
  "Do not answer as a generic schedule recovery stack unless schedule evidence directly controls the decision.",
  "Name exact goal/project titles when context includes them.",
  "Keep the answer compact and read-only.",
].join("\n");

const MY_LIST_RESPONSE_CONTRACT = [
  "MY_LIST_INTENT is true.",
  "Use context.operator_state.myListContext only when source is client_local_storage or server and rows are present.",
  "If My List context is unavailable or empty, say plainly: I cannot see manual My List rows yet.",
  "When rows are present, state that the rows are a client-provided read-only snapshot, not database truth.",
  "List at most 6 rows. Include skillIcon before text when present, and preserve done state when useful.",
  "Do not claim My List rows were completed, moved, created, scheduled, or saved.",
].join("\n");

const SCHEDULE_SUMMARY_RESPONSE_CONTRACT = [
  "SCHEDULE_SUMMARY_INTENT is true.",
  "Use exactly this compact structure unless the user asks for a different format: Now, Next, Later, Skills, Move. Add Missed only if context.operator_state.lastMissedItems has actual values.",
  "Use context.operator_state.scheduleDigest as the primary source for formatting and hierarchy.",
  "Now: name the current block/item or say none. Show time block/window names in bold ALL CAPS, for example **EXTENDED MORNING ROUTINE**. If digest includes Inside, keep those concrete item names.",
  "Missed: list up to 3 missed incomplete items with exact relative timing only when present.",
  "Next: name the next future item or block with its time and exact time until start. If it is a block, show the block first, then concrete Inside items when provided.",
  "Later: name 5 to 8 concrete key items or blocks with times using context.operator_state.scheduleSummaryItems or the Later digest line when available.",
  "If the day has more scheduled items than you can list, say 'showing key items' and still list concrete titles/times. Never replace concrete items with a vague group.",
  "Preserve scheduled item names exactly as stored, including all caps. If skillIcon exists on an item, put it before the event name.",
  "Skills: compact list only if context.operator_state.todaySkills has values. Avoid 'and more'; if capped, say 'showing key items.'",
  "Move: one recommended action only if useful.",
  "Do not say various evening activities, series of tasks, series of habits and tasks, other activities, and more, various projects, busy evening, several tasks, several calls, several items, more than 60 minutes ago, stay on track, set a positive tone, or prepare for the day.",
].join("\n");

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json(
        {
          error: "Supabase client unavailable",
          proposedActions: EMPTY_PROPOSED_ACTIONS,
        },
        { status: 500 }
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated", proposedActions: EMPTY_PROPOSED_ACTIONS },
        { status: 401 }
      );
    }

    const payload = (await request.json().catch(() => null)) as
      | {
          message?: unknown;
          timeZone?: unknown;
          dayKey?: unknown;
          thread?: unknown;
          clientContext?: unknown;
        }
      | null;

    const message =
      typeof payload?.message === "string" ? payload.message.trim() : "";
    if (!message) {
      return NextResponse.json(
        {
          error: "Message must be a non-empty string",
          proposedActions: EMPTY_PROPOSED_ACTIONS,
        },
        { status: 400 }
      );
    }
    if (message.length > AI_INTENT_MAX_PROMPT_CHARS) {
      return NextResponse.json(
        {
          error: `Message must be ${AI_INTENT_MAX_PROMPT_CHARS} characters or fewer`,
          proposedActions: EMPTY_PROPOSED_ACTIONS,
        },
        { status: 400 }
      );
    }
    const intentMode = routeOperatorIntent(message);
    const hasNextActionIntent = intentMode === "next_action";
    const hasNeglectIntent = intentMode === "neglect";
    const hasScheduleSummaryIntent = intentMode === "schedule_summary";
    const hasMissedTodayIntent = intentMode === "missed_today";
    const hasPlanDayIntent = intentMode === "plan_day";
    const hasGoalsProjectsIntent = intentMode === "goals_projects";
    const hasMyListIntent = intentMode === "my_list";
    const clientContext =
      typeof payload?.clientContext === "object" && payload.clientContext !== null
        ? (payload.clientContext as Record<string, unknown>)
        : {};
    const myListContext = sanitizeClientMyListContext(
      clientContext.myListManualRows
    );

    const normalizedThread = normalizeThread(payload?.thread);
    if (!normalizedThread.ok) {
      return NextResponse.json(
        {
          error: normalizedThread.error,
          proposedActions: EMPTY_PROPOSED_ACTIONS,
        },
        { status: 400 }
      );
    }

    const entitlementResult = await supabase
      .from("user_entitlements")
      .select("tier,is_active,current_period_end")
      .eq("user_id", user.id)
      .maybeSingle();

    let tier = "CREATOR";
    let isActive = false;

    if (entitlementResult.error) {
      console.error(
        "AI operator error loading entitlement",
        entitlementResult.error
      );
    } else if (entitlementResult.data) {
      const entitlement = entitlementResult.data as EntitlementRow;
      const storedTier = entitlement.tier;
      if (typeof storedTier === "string" && storedTier.trim()) {
        tier = storedTier.trim();
      }
      isActive =
        tier.trim().toUpperCase() === "ADMIN" ||
        Boolean(entitlement.is_active);
    }

    const normalizedTier = tier.trim().toUpperCase();
    const paidActive =
      normalizedTier === "ADMIN" ||
      (PAID_TIERS.has(normalizedTier) && isActive);

    if (!paidActive) {
      return NextResponse.json(
        {
          error: "AI requires CREATOR Pro",
          tier: normalizedTier,
          proposedActions: EMPTY_PROPOSED_ACTIONS,
        },
        { status: 403 }
      );
    }

    const timeZone = await resolveOperatorTimeZone({
      supabase,
      userId: user.id,
      requestedTimeZone: payload?.timeZone,
    });
    const fallbackDayKey = formatDayKey(new Date(), timeZone);
    const dayKey =
      typeof payload?.dayKey === "string" && parseDayKey(payload.dayKey.trim())
        ? payload.dayKey.trim()
        : fallbackDayKey;
    const requestTime = new Date();
    const proposedActions = buildOperatorProposedActions({
      message,
      now: requestTime,
      timezone: timeZone,
    });

    if (proposedActions.length > 0) {
      const context = await getCreatorAiContext({
        supabase: supabase as unknown as Parameters<
          typeof getCreatorAiContext
        >[0]["supabase"],
        userId: user.id,
        timeZone,
        dayKey,
        nowMs: requestTime.getTime(),
        intentMode,
        myListContext,
      });
      const suggestedActions = context.operator_state.suggestedActions;

      return NextResponse.json({
        answer: buildProposedActionAnswer(proposedActions[0]),
        contextSummary: buildContextSummary(context),
        contextIds: buildContextIds(context),
        suggestedActions,
        proposedActions,
      });
    }

    if (normalizedTier !== "ADMIN") {
      const now = new Date();
      const bucketDay = truncateToUtcDay(now).toISOString();
      const bucketMinute = truncateToUtcMinute(now).toISOString();

      try {
        const dailyResult = await (supabase.rpc as unknown as UsageCounterRpc)("increment_usage_counter", {
          p_key: "ai_intent:day",
          p_bucket_start: bucketDay,
        });
        if (dailyResult.error) throw dailyResult.error;
        const dailyCount = inferCounterValue(dailyResult.data);
        if (
          dailyCount !== null &&
          dailyCount > CREATOR_PLUS_AI_DAILY_LIMIT
        ) {
          return NextResponse.json(
            {
              error: "Rate limit exceeded",
              tier: normalizedTier,
              dailyLimit: CREATOR_PLUS_AI_DAILY_LIMIT,
              minuteLimit: CREATOR_PLUS_AI_MINUTE_LIMIT,
              proposedActions: EMPTY_PROPOSED_ACTIONS,
            },
            { status: 429, headers: { "Retry-After": "60" } }
          );
        }
      } catch (error) {
        console.error("AI operator rate limit RPC failed (daily)", error);
      }

      try {
        const minuteResult = await (supabase.rpc as unknown as UsageCounterRpc)("increment_usage_counter", {
          p_key: "ai_intent:minute",
          p_bucket_start: bucketMinute,
        });
        if (minuteResult.error) throw minuteResult.error;
        const minuteCount = inferCounterValue(minuteResult.data);
        if (
          minuteCount !== null &&
          minuteCount > CREATOR_PLUS_AI_MINUTE_LIMIT
        ) {
          return NextResponse.json(
            {
              error: "Rate limit exceeded",
              tier: normalizedTier,
              dailyLimit: CREATOR_PLUS_AI_DAILY_LIMIT,
              minuteLimit: CREATOR_PLUS_AI_MINUTE_LIMIT,
              proposedActions: EMPTY_PROPOSED_ACTIONS,
            },
            { status: 429, headers: { "Retry-After": "60" } }
          );
        }
      } catch (error) {
        console.error("AI operator rate limit RPC failed (minute)", error);
      }
    }

    const localHour = getLocalHour(requestTime, timeZone);
    const explicitOvernightWork = isOvernightWorkPrompt(message);
    const explicitRecoveryOverride = isRecoveryOverridePrompt(message);
    const explicitPlanning = isPlanningPrompt(message);
    const runtimeContext = {
      now_utc: requestTime.toISOString(),
      now_utc_ms: requestTime.getTime(),
      local_time: formatLocalDateTime(requestTime, timeZone),
      local_hour: localHour,
      timeZone,
      dayKey,
      late_night_window: localHour >= 0 && localHour < 5,
      explicit_overnight_work: explicitOvernightWork,
      explicit_recovery_override: explicitRecoveryOverride,
      explicit_planning_request: explicitPlanning,
      late_night_recovery_default:
        hasNextActionIntent &&
        localHour >= 0 &&
        localHour < 5 &&
        !explicitOvernightWork &&
        !explicitRecoveryOverride &&
        !explicitPlanning,
    };

    const context = await getCreatorAiContext({
      supabase: supabase as unknown as Parameters<
        typeof getCreatorAiContext
      >[0]["supabase"],
      userId: user.id,
      timeZone,
      dayKey,
      nowMs: requestTime.getTime(),
      intentMode,
      myListContext,
    });
    const scheduleTimeState = buildScheduleTimeState(
      context,
      requestTime.getTime()
    );
    const nextScheduledItemHasLongGap =
      typeof scheduleTimeState.minutes_until_next_scheduled_item === "number" &&
      scheduleTimeState.minutes_until_next_scheduled_item > 60;
    const runtimeContextForPrompt = {
      ...runtimeContext,
      schedule_time_state: scheduleTimeState,
      active_recovery_protection:
        hasNextActionIntent &&
        context.operator_state.isRecoveryActive &&
        !explicitOvernightWork &&
        !explicitRecoveryOverride,
      recovery_reset_default:
        hasNextActionIntent &&
        !scheduleTimeState.has_active_scheduled_item &&
        nextScheduledItemHasLongGap &&
        !explicitPlanning &&
        !explicitRecoveryOverride,
    };
    const serializedContext = JSON.stringify(context);
    if (serializedContext.length > AI_INTENT_MAX_SERIALIZED_CONTEXT_CHARS) {
      return NextResponse.json(
        {
          error: "AI context is too large. Try again with a narrower schedule view.",
          proposedActions: EMPTY_PROPOSED_ACTIONS,
        },
        { status: 413 }
      );
    }
    const suggestedActions = context.operator_state.suggestedActions;
    const suggestedActionsPromptSummary =
      buildSuggestedActionsPromptSummary(suggestedActions);
    console.info("AI operator context counts", {
      ...buildContextSummary(context),
      lateNightRecoveryDefault: runtimeContext.late_night_recovery_default,
      recoveryResetDefault: runtimeContextForPrompt.recovery_reset_default,
      activeRecoveryProtection:
        runtimeContextForPrompt.active_recovery_protection,
      isRecoveryActive: context.operator_state.isRecoveryActive,
      hasActiveScheduledItem: scheduleTimeState.has_active_scheduled_item,
      minutesUntilNextScheduledItem:
        scheduleTimeState.minutes_until_next_scheduled_item,
      operatorDayPhase: context.operator_state.dayPhase,
      intentMode,
      missedTodayItems: context.operator_state.missedTodayItems.length,
      myListRows: context.operator_state.myListContext?.rows.length ?? 0,
    });
    if (hasNeglectIntent) {
      logNeglectCheckDebug(context, runtimeContext);
    }

    const threadChars = normalizedThread.thread.reduce(
      (total, item) => total + item.content.length,
      0
    );
    const monthStart = getAiMonthStart(new Date());
    const estimatedCostUsd = estimateAiIntentCostUsd({
      model: AI_INTENT_MODEL,
      inputChars:
        AI_INTENT_STATIC_INPUT_CHARS_ESTIMATE +
        message.length +
        threadChars +
        suggestedActionsPromptSummary.length +
        serializedContext.length,
      maxOutputTokens: AI_INTENT_MAX_OUTPUT_TOKENS,
    });

    if (resolveAiIntentsMode() !== "live") {
      return NextResponse.json(
        {
          error: "ILAV Operator live AI is not enabled.",
          contextSummary: buildContextSummary(context),
          contextIds: buildContextIds(context),
          suggestedActions,
          proposedActions: EMPTY_PROPOSED_ACTIONS,
        },
        { status: 503 }
      );
    }

    const existingUsageRow = await fetchAiMonthlyUsage({
      supabase: supabase as unknown as Parameters<
        typeof fetchAiMonthlyUsage
      >[0]["supabase"],
      userId: user.id,
      monthStart,
      model: AI_INTENT_MODEL,
    });
    const usedUsd = existingUsageRow?.cost_usd ?? 0;
    if (usedUsd + estimatedCostUsd > MONTHLY_AI_BUDGET_USD) {
      return NextResponse.json(
        {
          error: "AI monthly budget exceeded",
          quota: {
            month_start: monthStart,
            budget_usd: MONTHLY_AI_BUDGET_USD,
            used_usd: usedUsd,
            estimated_request_usd: estimatedCostUsd,
          },
          proposedActions: EMPTY_PROPOSED_ACTIONS,
        },
        { status: 429 }
      );
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const input = [
      { role: "system" as const, content: OPERATOR_SYSTEM_PROMPT },
      ...(hasNextActionIntent
        ? [{ role: "system" as const, content: NEXT_ACTION_RESPONSE_CONTRACT }]
        : []),
      ...(hasNeglectIntent
        ? [{ role: "system" as const, content: NEGLECT_RESPONSE_CONTRACT }]
        : []),
      ...(hasMissedTodayIntent
        ? [
            {
              role: "system" as const,
              content: MISSED_TODAY_RESPONSE_CONTRACT,
            },
          ]
        : []),
      ...(hasScheduleSummaryIntent
        ? [
            {
              role: "system" as const,
              content: SCHEDULE_SUMMARY_RESPONSE_CONTRACT,
            },
          ]
        : []),
      ...(hasPlanDayIntent
        ? [{ role: "system" as const, content: PLAN_DAY_RESPONSE_CONTRACT }]
        : []),
      ...(hasGoalsProjectsIntent
        ? [
            {
              role: "system" as const,
              content: GOALS_PROJECTS_RESPONSE_CONTRACT,
            },
          ]
        : []),
      ...(hasMyListIntent
        ? [{ role: "system" as const, content: MY_LIST_RESPONSE_CONTRACT }]
        : []),
      ...normalizedThread.thread,
      {
        role: "user" as const,
        content: `Message: ${message}\nINTENT_MODE: ${intentMode}\nNEXT_ACTION_INTENT: ${hasNextActionIntent}\nMISSED_TODAY_INTENT: ${hasMissedTodayIntent}\nNEGLECT_INTENT: ${hasNeglectIntent}\nSCHEDULE_SUMMARY_INTENT: ${hasScheduleSummaryIntent}\nPLAN_DAY_INTENT: ${hasPlanDayIntent}\nGOALS_PROJECTS_INTENT: ${hasGoalsProjectsIntent}\nMY_LIST_INTENT: ${hasMyListIntent}\nSchedule digest:\n${context.operator_state.scheduleDigest}\nNeglect digest:\n${context.operator_state.neglectDigest}\nSuggested actions summary:\n${suggestedActionsPromptSummary}\nRuntime JSON: ${JSON.stringify(runtimeContextForPrompt)}\nCREATOR context JSON: ${serializedContext}`,
      },
    ];

    const response = await Promise.race([
      client.responses.create(
        {
          model: AI_INTENT_MODEL,
          store: false,
          max_output_tokens: AI_INTENT_MAX_OUTPUT_TOKENS,
          temperature: AI_INTENT_TEMPERATURE,
          input,
        },
        { signal: controller.signal }
      ),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(new Error("AI request timed out"));
        }, AI_OPERATOR_TIMEOUT_MS);
      }),
    ]).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });

    const rawAnswer =
      response.output_text?.trim() || "I could not produce an answer.";
    const answer = alignNextActionAnswerWithTopSuggestion({
      answer: rawAnswer,
      context,
      intentMode,
      suggestedActions,
    });
    const usage = extractUsageFromResponse(response);
    let usageRow = null;
    if (usage) {
      const pricing = getAiModelPricing(AI_INTENT_MODEL);
      const costUsd =
        (usage.input_tokens * pricing.inputUsdPerMillion +
          usage.output_tokens * pricing.outputUsdPerMillion) /
        1_000_000;
      usageRow = await recordAiMonthlyUsage({
        supabase: supabase as unknown as Parameters<
          typeof recordAiMonthlyUsage
        >[0]["supabase"],
        userId: user.id,
        monthStart,
        model: AI_INTENT_MODEL,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        costUsd,
      });
    }

    const finalUsageRow =
      usageRow ??
      (await fetchAiMonthlyUsage({
        supabase: supabase as unknown as Parameters<
          typeof fetchAiMonthlyUsage
        >[0]["supabase"],
        userId: user.id,
        monthStart,
        model: AI_INTENT_MODEL,
      }));

    return NextResponse.json({
      answer,
      contextSummary: buildContextSummary(context),
      contextIds: buildContextIds(context),
      suggestedActions,
      proposedActions: EMPTY_PROPOSED_ACTIONS,
      usage: usage
        ? {
            ...usage,
            model: AI_INTENT_MODEL,
            month_start: monthStart,
            budget_usd: MONTHLY_AI_BUDGET_USD,
            used_usd: finalUsageRow?.cost_usd ?? 0,
          }
        : undefined,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "AI request timed out") {
      return NextResponse.json(
        {
          error: "ILAV timed out. Try a shorter request or retry.",
          proposedActions: EMPTY_PROPOSED_ACTIONS,
        },
        { status: 504 }
      );
    }
    console.error("AI_OPERATOR error", error);
    return NextResponse.json(
      {
        error: "Unable to process ILAV Operator request",
        proposedActions: EMPTY_PROPOSED_ACTIONS,
      },
      { status: 500 }
    );
  }
}
