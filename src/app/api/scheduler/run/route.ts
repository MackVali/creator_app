import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createTransientRetryFetch,
  TransientResponseError,
} from "@/lib/supabase/retry-fetch";
import {
  runSchedulerOverlayForUser,
  runSchedulerForUser,
  type RunSchedulerResult,
} from "@/lib/scheduler/runSchedulerForUser";

import { MAX_SCHEDULER_WRITE_DAYS } from "@/lib/scheduler/limits";

import {
  normalizeSchedulerModePayload,
  type SchedulerModePayload,
} from "@/lib/scheduler/modes";
import type { Database } from "@/types/supabase";
import type { SchedulerDebugDisplay } from "@/lib/scheduler/debugDisplay";
import {
  createSchedulerTiming,
  elapsedMs,
  schedulerNowMs,
  shouldLogSchedulerTiming,
} from "@/lib/scheduler/timing";

export const runtime = "nodejs";

type SchedulerRunContext = {
  localNow: Date | null;
  timeZone: string | null;
  utcOffsetMinutes: number | null;
  mode: SchedulerModePayload;
  writeThroughDays: number | null;
};

export async function POST(request: NextRequest) {
  const routeStartedAt = schedulerNowMs();
  const requestUrl = request.nextUrl;
  const includeDebugSummary = requestUrl.searchParams.get("debug") === "1";
  const timing = shouldLogSchedulerTiming(includeDebugSummary)
    ? createSchedulerTiming()
    : null;
  let routeStatus = 500;
  try {
  const {
    localNow,
    timeZone: requestTimeZone,
    utcOffsetMinutes,
    mode,
    writeThroughDays,
  } = await readRunRequestContext(request);
  // Debug diagnostics should not imply the legacy parity path.
  const enableParity = requestUrl.searchParams.get("parity") === "1";
  const writeThroughDaysOverride = parseWriteThroughDaysQueryParam(
    requestUrl.searchParams.get("writeThroughDays")
  );
  if (timing) {
    timing.route.modeType = mode.type;
    timing.route.writeThroughDays =
      writeThroughDaysOverride ?? writeThroughDays ?? null;
  }
  const retryingFetch =
    typeof globalThis.fetch === "function"
      ? createTransientRetryFetch(globalThis.fetch)
      : undefined;
  const supabase = await createClient(
    retryingFetch ? { fetch: retryingFetch } : undefined
  );
  if (!supabase) {
    routeStatus = 500;
    const responseStartedAt = schedulerNowMs();
    const response = NextResponse.json(
      { error: "supabase client unavailable" },
      { status: 500 }
    );
    if (timing) timing.route.responseMs += elapsedMs(responseStartedAt);
    return response;
  }

  const authStartedAt = schedulerNowMs();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (timing) timing.route.authMs += elapsedMs(authStartedAt);

  if (authError) {
    routeStatus = 500;
    const responseStartedAt = schedulerNowMs();
    const response = NextResponse.json(
      { error: authError.message },
      { status: 500 }
    );
    if (timing) timing.route.responseMs += elapsedMs(responseStartedAt);
    return response;
  }

  if (!user) {
    routeStatus = 401;
    const responseStartedAt = schedulerNowMs();
    const response = NextResponse.json(
      { error: "not authenticated" },
      { status: 401 }
    );
    if (timing) timing.route.responseMs += elapsedMs(responseStartedAt);
    return response;
  }

  const now = localNow ?? new Date();

  const adminSupabase = createAdminClient(
    retryingFetch ? { fetch: retryingFetch } : undefined
  );
  const schedulingClient = adminSupabase ?? supabase;

  if (!adminSupabase && process.env.NODE_ENV !== "production") {
    console.warn(
      "Falling back to user-scoped Supabase client for scheduler run"
    );
  }

  const profileTimeZoneStartedAt = schedulerNowMs();
  const profileTimeZone = await resolveProfileTimeZone(
    schedulingClient,
    user.id
  );
  if (timing) {
    timing.route.profileTimeZoneMs += elapsedMs(profileTimeZoneStartedAt);
  }
  const metadataTimeZone = extractUserTimeZone(user);
  const userTimeZone = requestTimeZone ?? profileTimeZone ?? metadataTimeZone;
  const coordinates = extractUserCoordinates(user);
  let runResult: RunSchedulerResult | undefined;
  try {
    const schedulerStartedAt = schedulerNowMs();
    runResult =
      mode.type === "OVERLAY"
        ? await runSchedulerOverlayForUser(user.id, now, schedulingClient, {
            timeZone: userTimeZone,
            location: coordinates,
            utcOffsetMinutes,
            mode,
            overlayWindowId: mode.overlayWindowId,
            writeThroughDays,
            writeThroughDaysOverride,
            debug: includeDebugSummary,
            parity: enableParity,
            timing: timing ?? undefined,
          })
        : await runSchedulerForUser(user.id, now, schedulingClient, {
            timeZone: userTimeZone,
            location: coordinates,
            utcOffsetMinutes,
            mode,
            writeThroughDays,
            writeThroughDaysOverride,
            debug: includeDebugSummary,
            parity: enableParity,
            timing: timing ?? undefined,
          });
    if (timing) timing.route.schedulerMs += elapsedMs(schedulerStartedAt);

    if (runResult.reset.error) {
      routeStatus = 500;
      const responseStartedAt = schedulerNowMs();
      const response = NextResponse.json(
        { error: runResult.reset.error.message },
        { status: 500 }
      );
      if (timing) timing.route.responseMs += elapsedMs(responseStartedAt);
      return response;
    }

    if (includeDebugSummary) {
      console.log("[SCHEDULER_HABIT_AUDIT_RESPONSE]", {
        dueEvaluation: runResult.schedule.debugSummary?.habitAudit?.dueEvaluation,
        scheduling: runResult.schedule.debugSummary?.habitAudit?.scheduling,
        windowCompatibility:
          runResult.schedule.debugSummary?.habitAudit?.windowCompatibility,
        samples: runResult.schedule.debugSummary?.habitAudit?.samples,
      });
    }

    const scheduleResult = runResult.schedule;
    // 🚫 DISABLED: project overlap cancellation is illegal during rebuild
    // Overlaps are resolved by strict rank + greedy placement
    // Habit overlap handling already happens earlier — do NOT rely on this filter
    const status = scheduleResult.error ? 500 : 200;
    routeStatus = status;

    const responseStartedAt = schedulerNowMs();
    let debugDisplay: SchedulerDebugDisplay | null = null;
    if (includeDebugSummary) {
      debugDisplay = await buildSchedulerDebugDisplay(schedulingClient, user.id);
    }

    const responsePayload: Record<string, unknown> = {
      reset: runResult.reset,
      marked: runResult.marked,
      schedule: scheduleResult,
    };
    if (includeDebugSummary && scheduleResult.projectDebugSummary) {
      responsePayload.debugProjectSummary = scheduleResult.projectDebugSummary;
    }
    if (includeDebugSummary && scheduleResult.debugSummary) {
      responsePayload.debugSummary = scheduleResult.debugSummary;
    }
    if (includeDebugSummary) {
      responsePayload.debug = {
        placementTrace: scheduleResult.placementTrace ?? null,
        display: debugDisplay ?? undefined,
      };
    }
    if (includeDebugSummary) {
      responsePayload.failures = (scheduleResult.failures ?? []).map(
        ({ itemId, reason, detail }) => ({
          itemId,
          reason,
          detail: formatFailureDetail(detail),
        })
      );
    }
    if (enableParity && scheduleResult.paritySummary) {
      responsePayload.paritySummary = scheduleResult.paritySummary;
    }

    const response = NextResponse.json(responsePayload, { status });
    if (timing) timing.route.responseMs += elapsedMs(responseStartedAt);
    return response;
  } catch (err) {
    const fatalPayload = buildSchedulerFatalPayload(err);
    console.error("SCHEDULER_FATAL", fatalPayload);
    routeStatus = 500;
    const responseStartedAt = schedulerNowMs();
    const responsePayload: Record<string, unknown> = {
      error: fatalPayload.shortMessage,
    };
    if (includeDebugSummary) {
      responsePayload.debug = {
        fatal: {
          errorMessage: fatalPayload.shortMessage,
          errorStack: String(
            ((err as { stack?: string | undefined })?.stack) ?? ""
          ),
          status: fatalPayload.status,
          rayId: fatalPayload.rayId,
        },
      };
    }
    const response = NextResponse.json(responsePayload, { status: 500 });
    if (timing) timing.route.responseMs += elapsedMs(responseStartedAt);
    return response;
  }
  } finally {
    if (timing) {
      timing.route.totalMs = elapsedMs(routeStartedAt);
      timing.route.status = routeStatus;
      console.log(timing);
    }
  }
}

function extractUserTimeZone(user: {
  user_metadata?: Record<string, unknown> | null;
}) {
  const metadata = user.user_metadata ?? {};
  const candidates = [metadata?.timezone, metadata?.timeZone, metadata?.tz];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}

function extractUserCoordinates(user: {
  user_metadata?: Record<string, unknown> | null;
}) {
  const metadata = user.user_metadata ?? {};
  const latCandidates: unknown[] = [
    metadata?.latitude,
    metadata?.lat,
    metadata?.coords && (metadata.coords as { latitude?: unknown })?.latitude,
    metadata?.coords && (metadata.coords as { lat?: unknown })?.lat,
    metadata?.location &&
      (metadata.location as { latitude?: unknown })?.latitude,
  ];
  const lonCandidates: unknown[] = [
    metadata?.longitude,
    metadata?.lng,
    metadata?.lon,
    metadata?.coords && (metadata.coords as { longitude?: unknown })?.longitude,
    metadata?.coords && (metadata.coords as { lng?: unknown })?.lng,
    metadata?.location &&
      (metadata.location as { longitude?: unknown })?.longitude,
  ];

  const latitude = pickNumericValue(latCandidates);
  const longitude = pickNumericValue(lonCandidates);
  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
}

function pickNumericValue(values: unknown[]): number | null {
  for (const value of values) {
    const num = typeof value === "string" ? Number.parseFloat(value) : value;
    if (typeof num === "number" && Number.isFinite(num)) {
      return num;
    }
  }
  return null;
}

function formatFailureDetail(detail: unknown): string | undefined {
  if (detail == null) {
    return undefined;
  }
  if (typeof detail === "string") {
    return detail;
  }
  if (typeof detail === "object") {
    const message =
      "message" in detail &&
      typeof (detail as { message?: unknown }).message === "string"
        ? (detail as { message: string }).message
        : undefined;
    if (message) return message;
    const detailField =
      "detail" in detail &&
      typeof (detail as { detail?: unknown }).detail === "string"
        ? (detail as { detail: string }).detail
        : undefined;
    if (detailField) return detailField;
  }
  return undefined;
}

async function readRunRequestContext(
  request: Request
): Promise<SchedulerRunContext> {
  if (!request) {
    return {
      localNow: null,
      timeZone: null,
      mode: { type: "REGULAR" },
      writeThroughDays: null,
    };
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return {
      localNow: null,
      timeZone: null,
      mode: { type: "REGULAR" },
      writeThroughDays: null,
    };
  }

  try {
    const payload = (await request.json()) as {
      localTimeIso?: unknown;
      timeZone?: unknown;
      utcOffsetMinutes?: unknown;
      mode?: unknown;
      writeThroughDays?: unknown;
    };

    let localNow: Date | null = null;
    if (payload && typeof payload.localTimeIso === "string") {
      const parsed = new Date(payload.localTimeIso);
      if (!Number.isNaN(parsed.getTime())) {
        localNow = parsed;
      }
    }

    let timeZone: string | null = null;
    if (
      payload &&
      typeof payload.timeZone === "string" &&
      payload.timeZone.trim()
    ) {
      timeZone = payload.timeZone;
    }

    const mode = normalizeSchedulerModePayload(payload?.mode);

    let writeThroughDays: number | null = null;
    const candidate = payload?.writeThroughDays;
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      writeThroughDays = candidate;
    } else if (typeof candidate === "string") {
      const parsed = Number.parseFloat(candidate);
      if (Number.isFinite(parsed)) {
        writeThroughDays = parsed;
      }
    }

    let utcOffsetMinutes: number | null = null;
    const offsetCandidate = payload?.utcOffsetMinutes;
    if (
      typeof offsetCandidate === "number" &&
      Number.isFinite(offsetCandidate)
    ) {
      utcOffsetMinutes = offsetCandidate;
    } else if (typeof offsetCandidate === "string") {
      const parsed = Number.parseFloat(offsetCandidate);
      if (Number.isFinite(parsed)) {
        utcOffsetMinutes = parsed;
      }
    }

    return { localNow, timeZone, utcOffsetMinutes, mode, writeThroughDays };
  } catch (error) {
    console.warn("Failed to parse scheduler run payload", error);
    return {
      localNow: null,
      timeZone: null,
      mode: { type: "REGULAR" },
      writeThroughDays: null,
    };
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "method not allowed" },
    { status: 405, headers: { Allow: "POST" } }
  );
}

async function resolveProfileTimeZone(
  client: SupabaseClient<Database> | null,
  userId: string
) {
  if (!client) return null;
  try {
    const { data, error } = await client
      .from("profiles")
      .select("timezone")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.warn("Failed to resolve profile timezone", error);
      return null;
    }
    const timezone =
      typeof data?.timezone === "string" ? data.timezone.trim() : "";
    if (timezone) return timezone;
  } catch (error) {
    console.warn("Failed to resolve profile timezone", error);
  }
  return null;
}

type SchedulerFatalPayload = {
  status?: number;
  rayId?: string;
  shortMessage: string;
};

function buildSchedulerFatalPayload(error: unknown): SchedulerFatalPayload {
  if (error instanceof TransientResponseError) {
    const payload: SchedulerFatalPayload = {
      shortMessage: error.shortMessage,
    };
    if (Number.isFinite(error.status) && error.status > 0) {
      payload.status = error.status;
    }
    if (error.rayId) {
      payload.rayId = error.rayId;
    }
    return payload;
  }

  const status = extractStatusFromUnknown(error);
  const payload: SchedulerFatalPayload = {
    shortMessage: normalizeFatalMessage(error),
  };
  if (status) {
    payload.status = status;
  }
  return payload;
}

function extractStatusFromUnknown(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidates = [
    (value as { status?: number }).status,
    (value as { statusCode?: number }).statusCode,
    (value as { code?: number }).code,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function normalizeFatalMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return truncateMessage(error.message);
  }
  if (typeof error === "string" && error.trim()) {
    return truncateMessage(error.trim());
  }
  if (typeof error === "object" && error !== null) {
    try {
      const json = JSON.stringify(error);
      if (json && json !== "{}") {
        return truncateMessage(json);
      }
    } catch {
      // fall through to default
    }
  }
  return "Scheduler run failed due to an upstream error";
}

function truncateMessage(value: string, limit = 200) {
  return value.length <= limit ? value : value.slice(0, limit);
}

const EMPTY_SCHEDULER_DEBUG_DISPLAY: SchedulerDebugDisplay = {
  projectsById: {},
  timeBlocksById: {},
  dayTypeTimeBlocksById: {},
  windowsById: {},
  habitsById: {},
};

async function buildSchedulerDebugDisplay(
  client: SupabaseClient<Database> | null,
  userId: string | null | undefined
): Promise<SchedulerDebugDisplay> {
  if (!client || !userId) return EMPTY_SCHEDULER_DEBUG_DISPLAY;

  const safeSelect = async <T>(
    description: string,
    query: Promise<{ data: T[] | null; error: unknown }>
  ): Promise<T[]> => {
    const { data, error } = await query;
    if (error) {
      console.warn(
        `[SCHEDULER DEBUG] Failed to load ${description} for display metadata`,
        error
      );
      return [];
    }
    return (data ?? []) as T[];
  };

  const [
    projectRows,
    habitRows,
    timeBlockRows,
    windowRows,
    dayTypeTimeBlockRows,
  ] = await Promise.all([
    safeSelect(
      "projects",
      client.from("projects").select("id, name").eq("user_id", userId)
    ),
    safeSelect(
      "habits",
      client
        .from("habits")
        .select("id, name")
        .eq("user_id", userId)
        .is("circle_id", null)
    ),
    safeSelect(
      "time blocks",
      client.from("time_blocks").select("id, label").eq("user_id", userId)
    ),
    safeSelect(
      "windows",
      client.from("windows").select("id, label").eq("user_id", userId)
    ),
    safeSelect(
      "day type time blocks",
      client
        .from("day_type_time_blocks")
        .select("id, day_types(name), time_blocks(label)")
        .eq("user_id", userId)
    ),
  ]);

  const display: SchedulerDebugDisplay = {
    projectsById: {},
    timeBlocksById: {},
    dayTypeTimeBlocksById: {},
    windowsById: {},
    habitsById: {},
  };

  for (const row of projectRows) {
    const id = typeof (row as { id?: string }).id === "string" ? row.id : null;
    const name = normalizeDisplayValue(
      (row as { name?: string | null }).name
    );
    if (id && name) {
      display.projectsById[id] = name;
    }
  }

  for (const row of habitRows) {
    const id = typeof (row as { id?: string }).id === "string" ? row.id : null;
    const name = normalizeDisplayValue(
      (row as { name?: string | null }).name
    );
    if (id && name) {
      display.habitsById[id] = name;
    }
  }

  for (const row of timeBlockRows) {
    const id = typeof (row as { id?: string }).id === "string" ? row.id : null;
    const label = normalizeDisplayValue(
      (row as { label?: string | null }).label
    );
    if (id && label) {
      display.timeBlocksById[id] = label;
    }
  }

  for (const row of windowRows) {
    const id = typeof (row as { id?: string }).id === "string" ? row.id : null;
    const label = normalizeDisplayValue(
      (row as { label?: string | null }).label
    );
    if (id && label) {
      display.windowsById[id] = label;
    }
  }

  for (const row of dayTypeTimeBlockRows) {
    const id = typeof (row as { id?: string }).id === "string" ? row.id : null;
    const dayTypeName = normalizeDisplayValue(
      (row as { day_types?: { name?: string | null } | null }).day_types?.name
    );
    const blockLabel = normalizeDisplayValue(
      (row as { time_blocks?: { label?: string | null } | null }).time_blocks
        ?.label
    );
    const combined = [dayTypeName, blockLabel].filter(Boolean).join(" • ");
    if (id && combined) {
      display.dayTypeTimeBlocksById[id] = combined;
    }
  }

  return display;
}

function normalizeDisplayValue(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.toString().trim();
  return normalized.length === 0 ? null : normalized;
}

function parseWriteThroughDaysQueryParam(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(parsed, MAX_SCHEDULER_WRITE_DAYS);
}
