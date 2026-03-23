import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  fetchWindowsForDate,
  type WindowLite,
} from "@/lib/scheduler/repo";
import {
  fetchInstancesForRange,
  type ScheduleInstance,
} from "@/lib/scheduler/instanceRepo";
import { addDaysInTimeZone, makeDateInTimeZone } from "@/lib/scheduler/timezone";
import { AI_INTENT_MODEL, getAiModelPricing } from "@/lib/ai/config";
import {
  runAiIntent,
  type RunAiIntentResult,
} from "@/lib/ai/openaiIntent";
import {
  fetchAiMonthlyUsage,
  getAiMonthStart,
  recordAiMonthlyUsage,
} from "@/lib/ai/usage";
import type { AiScope, AiThreadPayload } from "@/lib/types/ai";

export const runtime = "nodejs";

const FALLBACK_TIME_ZONE = "America/Chicago";
const AI_INTENT_TIMEOUT_MS = 45_000;

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

function normalizeThread(value: unknown): AiThreadPayload[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { role?: unknown }).role === "string" &&
        typeof (entry as { content?: unknown }).content === "string"
      ) {
        const roleValue = (entry as { role: string }).role;
        if (roleValue === "user" || roleValue === "assistant") {
          return {
            role: roleValue,
            content: (entry as { content: string }).content,
          };
        }
    }
      return null;
    })
    .filter((item): item is AiThreadPayload => item !== null);
}

function getConfiguredLimit(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const CREATOR_PLUS_AI_DAILY_LIMIT = getConfiguredLimit(
  process.env.CREATOR_PLUS_AI_DAILY_LIMIT,
  60
);

const CREATOR_PLUS_AI_MINUTE_LIMIT = getConfiguredLimit(
  process.env.CREATOR_PLUS_AI_MINUTE_LIMIT,
  6
);

const PAID_TIERS = new Set(
  [
    "CREATOR PLUS",
    "MANAGER",
    "ENTERPRISE",
    "ADMIN",
  ].map((value) => value.toUpperCase())
);

const MONTHLY_AI_BUDGET_USD = (() => {
  const raw = process.env.CREATOR_PLUS_AI_BUDGET_USD;
  const parsed = Number.parseFloat(raw ?? "");
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return 5;
})();

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
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  if (typeof value === "object" && value !== null) {
    const candidates = ["count", "value", "usage", "total"];
    for (const key of candidates) {
      const candidate = (value as Record<string, unknown>)[key];
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        return candidate;
      }
      if (typeof candidate === "string") {
        const parsed = Number.parseInt(candidate, 10);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
  }
  return null;
}

type ScheduleSnapshotInstance = {
  id: string;
  title: string;
  start_utc_ms: number;
  end_utc_ms: number;
  completed_at: string | null;
  kind?: string;
  project_id?: string | null;
  goal_id?: string | null;
};

const SCHEDULE_INSTANCE_KIND_LABELS: Record<string, string> = {
  PROJECT: "Project",
  TASK: "Task",
  HABIT: "Habit",
};

const parseTimestampMs = (value?: string | null): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveScheduleInstanceTitle = (record: ScheduleInstance): string => {
  const explicit = record.event_name?.trim();
  if (explicit) return explicit;
  const kind = record.source_type?.trim().toUpperCase();
  if (kind) {
    if (kind in SCHEDULE_INSTANCE_KIND_LABELS) {
      return SCHEDULE_INSTANCE_KIND_LABELS[kind];
    }
    return `${kind.charAt(0)}${kind.slice(1).toLowerCase()}`;
  }
  return "Scheduled item";
};

const mapScheduleInstanceToSnapshot = (
  record: ScheduleInstance
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
  return {
    id: record.id,
    title: resolveScheduleInstanceTitle(record),
    start_utc_ms: startMs,
    end_utc_ms: endMs,
    completed_at: record.completed_at ?? null,
    kind: record.source_type ?? undefined,
    project_id:
      record.source_type === "PROJECT" ? record.source_id ?? null : null,
    goal_id: null,
  };
};

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log("AI_INTENT start", startTime);
  try {
    const supabase = await createSupabaseServerClient();
    console.log("AI_INTENT supabase_ok=%s", Boolean(supabase), Date.now());
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase client unavailable" },
        { status: 500 }
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    console.log("AI_INTENT user_present=%s", Boolean(user), Date.now());

    if (!user) {
      console.warn("AI_INTENT unauthorized - returning 401", Date.now());
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    console.log("AI_INTENT authed user_id=%s", user.id, Date.now());

    const payload = (await request.json().catch(() => null)) as
      | {
          prompt?: unknown;
          scope?: unknown;
          timeZone?: unknown;
          dayKey?: unknown;
          thread?: unknown;
        }
      | null;

    const prompt =
      typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt must be a non-empty string" },
        { status: 400 }
      );
    }
    const promptLower = prompt.toLowerCase();

    console.log("AI_INTENT parsed", Date.now());

    const entitlementResult = await supabase
      .from("user_entitlements")
      .select("tier,is_active,current_period_end")
      .eq("user_id", user.id)
      .maybeSingle();

    let tier = "CREATOR";
    let isActive = false;

    if (entitlementResult.error) {
      console.error(
        "AI intent error loading entitlement",
        entitlementResult.error
      );
    } else if (entitlementResult.data) {
      const storedTier = entitlementResult.data.tier;
      if (typeof storedTier === "string" && storedTier.trim()) {
        tier = storedTier.trim();
      }
      if (tier.trim().toUpperCase() === "ADMIN") {
        isActive = true;
      } else {
        isActive = Boolean(entitlementResult.data.is_active);
      }
    }

    tier = tier.trim();
    const normalizedTier = tier.toUpperCase();
    const isPaidTier = PAID_TIERS.has(normalizedTier);
    const paidActive =
      normalizedTier === "ADMIN" || (isPaidTier && isActive);

    if (!paidActive) {
      return NextResponse.json(
        { error: "AI requires CREATOR PLUS", tier: normalizedTier },
        { status: 403 }
      );
    }

    if (normalizedTier !== "ADMIN") {
      const dailyLimit = CREATOR_PLUS_AI_DAILY_LIMIT;
      const minuteLimit = CREATOR_PLUS_AI_MINUTE_LIMIT;
      const now = new Date();
      const bucketDay = truncateToUtcDay(now).toISOString();
      const bucketMinute = truncateToUtcMinute(now).toISOString();

      let dailyCount: number | null = null;
      try {
        const dailyResult = await supabase.rpc("increment_usage_counter", {
          p_key: "ai_intent:day",
          p_bucket_start: bucketDay,
        });
        if (dailyResult.error) {
          throw dailyResult.error;
        }
        dailyCount = inferCounterValue(dailyResult.data);
      } catch (limitError) {
        console.error(
          "AI intent rate limit RPC failed (daily)",
          limitError
        );
      }

      if (dailyCount !== null && dailyCount > dailyLimit) {
        return NextResponse.json(
          {
            error: "Rate limit exceeded",
            tier: normalizedTier,
            dailyLimit,
            minuteLimit,
          },
          { status: 429, headers: { "Retry-After": "60" } }
        );
      }

      let minuteCount: number | null = null;
      try {
        const minuteResult = await supabase.rpc("increment_usage_counter", {
          p_key: "ai_intent:minute",
          p_bucket_start: bucketMinute,
        });
        if (minuteResult.error) {
          throw minuteResult.error;
        }
        minuteCount = inferCounterValue(minuteResult.data);
      } catch (limitError) {
        console.error(
          "AI intent rate limit RPC failed (minute)",
          limitError
        );
      }

      if (minuteCount !== null && minuteCount > minuteLimit) {
        return NextResponse.json(
          {
            error: "Rate limit exceeded",
            tier: normalizedTier,
            dailyLimit,
            minuteLimit,
          },
          { status: 429, headers: { "Retry-After": "60" } }
        );
      }
    }

    const dayTypeKeywords = [
      "day type",
      "daytype",
      "workday",
      "template",
      "set my day type",
      "set day type",
      "assign day type",
      "time blocks",
      "schedule my day",
    ];
    const dayTypeCreationPattern = /\b(?:create|make|design|build)\b.*\bday\s*type\b/i;
    const isDayTypeSchedulerIntent =
      dayTypeKeywords.some((keyword) => promptLower.includes(keyword)) ||
      dayTypeCreationPattern.test(prompt);
    // day type creation is a scheduler operation and must use schedule_edit so autopilotIntent and scheduler ops are enabled.
    const forcedScopeForDayType: AiScope | null = isDayTypeSchedulerIntent
      ? "schedule_edit"
      : null;

    const wantsDraft =
      payload?.scope === "draft_creation" &&
      /\b(create|add|draft|make)\b/i.test(prompt);

    const maybeScope =
      forcedScopeForDayType ??
      (payload?.scope === "schedule_edit"
        ? "schedule_edit"
        : wantsDraft
          ? "draft_creation"
          : "read_only");

    const scope: AiScope = maybeScope;

    const timeZone = normalizeTimeZone(
      typeof payload?.timeZone === "string" ? payload.timeZone : undefined
    );

    const fallbackDayKey = formatDayKey(new Date(), timeZone);
    const requestedDayKey =
      typeof payload?.dayKey === "string" && payload.dayKey.trim()
        ? payload.dayKey.trim()
        : null;
    const parsedFallback = parseDayKey(fallbackDayKey)!;
    let dayKey = fallbackDayKey;
    let dayParts = parsedFallback;
    if (requestedDayKey) {
      const parsedRequested = parseDayKey(requestedDayKey);
      if (parsedRequested) {
        dayKey = requestedDayKey;
        dayParts = parsedRequested;
      }
    }

    console.log("AI_INTENT snapshot start", Date.now());

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

    let windows: WindowLite[] = [];
    try {
      windows = await fetchWindowsForDate(windowDate, supabase, timeZone, {
        userId: user.id,
        useDayTypes: true,
      });
    } catch (error) {
      console.error("AI intent snapshot error fetching windows", error);
    }

    const dayStart = windowDate;
    const dayEnd = addDaysInTimeZone(dayStart, 1, timeZone);
    let scheduleInstances: ScheduleSnapshotInstance[] = [];
    try {
      const scheduleResponse = await fetchInstancesForRange(
        user.id,
        dayStart.toISOString(),
        dayEnd.toISOString(),
        supabase
      );
      if (scheduleResponse.error) {
        console.error(
          "AI intent snapshot error loading schedule instances",
          scheduleResponse.error
        );
      } else if (Array.isArray(scheduleResponse.data)) {
        scheduleInstances = scheduleResponse.data
          .map(mapScheduleInstanceToSnapshot)
          .filter(
            (entry): entry is ScheduleSnapshotInstance => entry !== null
          )
          .sort((a, b) => a.start_utc_ms - b.start_utc_ms);
      }
    } catch (error) {
      console.error(
        "AI intent snapshot error loading schedule instances",
        error
      );
    }

    const goalsResponse = await supabase
      .from("goals")
      .select(
        "id,name,emoji,priority,energy,priority_code,energy_code,why,created_at,active,status,monument_id,weight,weight_boost,due_date,monument:monuments(emoji)"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);
    const goals =
      goalsResponse.error || !goalsResponse.data
        ? []
        : goalsResponse.data.map((goal: any) => ({
            ...goal,
            monumentEmoji: goal?.monument?.emoji ?? null,
          }));
    if (goalsResponse.error) {
      console.error(
        "AI intent snapshot error loading goals",
        goalsResponse.error
      );
    }

    const projectsResponse = await supabase
      .from("projects")
      .select(
        "id,name,goal_id,priority,energy,stage,why,duration_min,created_at,global_rank,completed_at"
      )
      .eq("user_id", user.id)
      .order("global_rank", { ascending: true, nullsFirst: false })
      .limit(10);
    const projects =
      projectsResponse.error || !projectsResponse.data
        ? []
        : projectsResponse.data;
    if (projectsResponse.error) {
      console.error(
        "AI intent snapshot error loading projects",
        projectsResponse.error
      );
    }

    const [
      dayTypesResponse,
      dayTypeTimeBlocksResponse,
      habitsResponse,
    ] = await Promise.all([
      supabase
        .from("day_types")
        .select("id,name")
        .eq("user_id", user.id),
      supabase
        .from("day_type_time_blocks")
        .select(
          "id,day_type_id,time_blocks(id,label,start_local,end_local)"
        )
        .eq("user_id", user.id),
      supabase
        .from("habits")
        .select("id,name,duration_minutes,updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(10),
    ]);

    const dayTypes =
      dayTypesResponse.error || !dayTypesResponse.data
        ? []
        : dayTypesResponse.data;
    if (dayTypesResponse.error) {
      console.error(
        "AI intent snapshot error loading day types",
        dayTypesResponse.error
      );
    }

    const dayTypeTimeBlocks =
      dayTypeTimeBlocksResponse.error || !dayTypeTimeBlocksResponse.data
        ? []
        : dayTypeTimeBlocksResponse.data
            .map((row) => ({
              id: row.id,
              day_type_id: row.day_type_id,
              label: row.time_blocks?.label ?? "",
              start_local: row.time_blocks?.start_local ?? "",
              end_local: row.time_blocks?.end_local ?? "",
            }))
            .filter(
              (block): block is {
                id: string;
                day_type_id: string;
                label: string;
                start_local: string;
                end_local: string;
              } => Boolean(block.day_type_id && block.label)
            );
    if (dayTypeTimeBlocksResponse.error) {
      console.error(
        "AI intent snapshot error loading day type time blocks",
        dayTypeTimeBlocksResponse.error
      );
    }

    const habits =
      habitsResponse.error || !habitsResponse.data
        ? []
        : habitsResponse.data;
    if (habitsResponse.error) {
      console.error(
        "AI intent snapshot error loading habits",
        habitsResponse.error
      );
    }

    const habitSnapshots = habits.map((habit) => ({
      id: habit.id,
      name: habit.name ?? null,
      durationMinutes:
        typeof habit.duration_minutes === "number" &&
        Number.isFinite(habit.duration_minutes)
          ? habit.duration_minutes
          : null,
    }));

    let snapshot:
      | {
          dayKey: string;
          timeZone: string;
          windows: WindowLite[];
          goals: typeof goals;
          projects: typeof projects;
          dayTypes: typeof dayTypes;
          dayTypeTimeBlocks: typeof dayTypeTimeBlocks;
          schedule_instances: ScheduleSnapshotInstance[];
          habits: {
            id: string;
            name: string | null;
            durationMinutes: number | null;
          }[];
        }
      | undefined;

    try {
      snapshot = {
        dayKey,
        timeZone,
        windows,
        goals,
        projects,
        dayTypes,
        dayTypeTimeBlocks,
        schedule_instances: scheduleInstances,
        habits: habitSnapshots,
      };
    } catch (snapshotError) {
      console.error("AI intent snapshot build failed", snapshotError);
      snapshot = undefined;
    }

    console.log("AI_INTENT snapshot done", Date.now());

    const sanitizedThread = normalizeThread(payload?.thread);
    const limitedThread = sanitizedThread.slice(-10);
    const aiController = new AbortController();
    let aiTimeoutId: ReturnType<typeof setTimeout> | undefined;
    let aiResult: RunAiIntentResult;
    console.log("AI_INTENT runAiIntent start mode=%s", scope, Date.now());
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        aiTimeoutId = setTimeout(() => {
          aiController.abort();
          reject(new Error("AI request timed out"));
        }, AI_INTENT_TIMEOUT_MS);
      });
      aiResult = await Promise.race([
        runAiIntent({
          prompt,
          scope,
          snapshot,
          thread: limitedThread.length ? limitedThread : undefined,
          signal: aiController.signal,
        }),
        timeoutPromise,
      ]);
      console.log("AI_INTENT runAiIntent done", Date.now());
    } catch (error) {
      const isTimedOut =
        error instanceof Error && error.message === "AI request timed out";
      const isAbortTimeout =
        error instanceof Error &&
        error.name === "AbortError" &&
        aiController.signal.aborted;
      if (isTimedOut || isAbortTimeout) {
        return NextResponse.json(
          { error: "ILAV timed out. Try a shorter request or retry." },
          { status: 504 }
        );
      }
      throw error;
    } finally {
      if (aiTimeoutId) {
        clearTimeout(aiTimeoutId);
      }
    }
    const aiResponse = aiResult.ai;
    const normalizedAiResponse = { ...aiResponse };
    if (Array.isArray(normalizedAiResponse.intents) && normalizedAiResponse.intents.length) {
      normalizedAiResponse.intent = normalizedAiResponse.intents[0];
    }
    const monthStart = getAiMonthStart(new Date());
    let usageRow = null;
    if (aiResult.usage) {
      const pricing = getAiModelPricing(AI_INTENT_MODEL);
      const costUsd =
        (aiResult.usage.input_tokens * pricing.inputUsdPerMillion +
          aiResult.usage.output_tokens * pricing.outputUsdPerMillion) /
        1_000_000;
      usageRow = await recordAiMonthlyUsage({
        supabase,
        userId: user.id,
        monthStart,
        model: AI_INTENT_MODEL,
        inputTokens: aiResult.usage.input_tokens,
        outputTokens: aiResult.usage.output_tokens,
        costUsd,
      });
    }
    if (!usageRow) {
      usageRow = await fetchAiMonthlyUsage({
        supabase,
        userId: user.id,
        monthStart,
        model: AI_INTENT_MODEL,
      });
    }
    const usedUsd = usageRow?.cost_usd ?? 0;
    const rawPercent =
      MONTHLY_AI_BUDGET_USD > 0
        ? (usedUsd / MONTHLY_AI_BUDGET_USD) * 100
        : usedUsd > 0
        ? 100
        : 0;
    const percentUsed = Number.isFinite(rawPercent) ? rawPercent : 0;
    const quota = {
      month_start: monthStart,
      budget_usd: MONTHLY_AI_BUDGET_USD,
      used_usd: usedUsd,
      percent_used: percentUsed,
    };
    const response = NextResponse.json({ ...normalizedAiResponse, quota });
    response.headers.set(
      "X-ILAV-PARSE-PATH",
      aiResponse._debug?.parse_path ?? "unknown"
    );
    response.headers.set(
      "X-ILAV-MODEL",
      aiResponse._debug?.model ?? "unknown"
    );
    console.log("AI_INTENT respond ok", Date.now());
    return response;
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    console.error("AI_INTENT error", error, elapsedMs);
    return NextResponse.json(
      { error: "Unable to process AI intent" },
      { status: 500 }
    );
  }
}
