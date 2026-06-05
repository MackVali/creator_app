import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  runSchedulerForUser,
  type RunSchedulerResult,
} from "@/lib/scheduler/runSchedulerForUser";
import type { Database } from "@/types/supabase";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 10;
const MIN_LIMIT = 1;
const MAX_LIMIT = 25;
const DEFAULT_ACTIVE_WITHIN_HOURS = 36;
const MIN_ACTIVE_WITHIN_HOURS = 1;
const MAX_ACTIVE_WITHIN_HOURS = 168;
const STALE_LOCK_MINUTES = 30;
const SUCCESS_RETRY_HOURS = 20;
const FAILURE_RETRY_HOURS = 1;
const WRITE_THROUGH_DAYS = 14;
const MAX_ERROR_LENGTH = 500;

type SchedulerUserStateRow = {
  user_id: string;
  last_active_at: string | null;
  last_scheduler_success_at: string | null;
};

type SchedulerUserStateUpdate = {
  scheduler_locked_at?: string | null;
  scheduler_lock_token?: string | null;
  last_scheduler_run_at?: string | null;
  last_scheduler_success_at?: string | null;
  last_scheduler_error_at?: string | null;
  last_scheduler_error?: string | null;
  next_scheduler_run_after?: string | null;
};

type CronClient = SupabaseClient<Database>;

type CronRequestBody = {
  limit?: unknown;
  activeWithinHours?: unknown;
  dryRun?: unknown;
};

type CronRequestOptions = {
  limit: number;
  activeWithinHours: number;
  dryRun: boolean;
};

type CronResult = {
  userId: string;
  status: "success" | "failed" | "skipped";
  placedCount?: number | null;
  error?: string;
};

async function handleCronRun(request: Request) {
  const cronSecret = process.env.SCHEDULER_CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "scheduler cron secret unavailable" },
      { status: 500 }
    );
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const adminClient: CronClient | null = createAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "supabase admin client unavailable" },
      { status: 500 }
    );
  }

  const options = await readCronRequestOptions(request);
  const now = new Date();
  const nowIso = now.toISOString();
  const activeSinceIso = new Date(
    now.getTime() - options.activeWithinHours * 60 * 60 * 1000
  ).toISOString();
  const staleLockBeforeIso = new Date(
    now.getTime() - STALE_LOCK_MINUTES * 60 * 1000
  ).toISOString();

  const { data: candidates, error: selectError } = await adminClient
    .from("scheduler_user_state")
    .select("user_id,last_active_at,last_scheduler_success_at")
    .gte("last_active_at", activeSinceIso)
    .or(`next_scheduler_run_after.is.null,next_scheduler_run_after.lte.${nowIso}`)
    .or(`scheduler_locked_at.is.null,scheduler_locked_at.lt.${staleLockBeforeIso}`)
    .order("last_scheduler_success_at", {
      ascending: true,
      nullsFirst: true,
    })
    .order("last_active_at", { ascending: true })
    .limit(options.limit);

  if (selectError) {
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  const selected = (candidates ?? []) as SchedulerUserStateRow[];
  if (options.dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      selected: selected.length,
      claimed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      results: selected.map((candidate) => ({
        userId: candidate.user_id,
        status: "skipped" as const,
      })),
    });
  }

  const lockToken = crypto.randomUUID();
  const results: CronResult[] = [];
  let claimed = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const candidate of selected) {
    const claimedUser = await claimSchedulerUser(
      adminClient,
      candidate.user_id,
      nowIso,
      staleLockBeforeIso,
      lockToken
    );

    if (!claimedUser) {
      skipped += 1;
      results.push({ userId: candidate.user_id, status: "skipped" });
      continue;
    }

    claimed += 1;
    const userId = candidate.user_id;

    try {
      const timeZone = await resolveProfileTimeZone(adminClient, userId);
      const runResult = await runSchedulerForUser(
        userId,
        now,
        adminClient,
        {
          timeZone,
          mode: { type: "REGULAR" },
          writeThroughDaysOverride: WRITE_THROUGH_DAYS,
        }
      );

      const errorMessage = getRunErrorMessage(runResult);
      if (errorMessage) {
        failed += 1;
        await recordSchedulerFailure(
          adminClient,
          userId,
          lockToken,
          now,
          errorMessage
        );
        results.push({
          userId,
          status: "failed",
          error: shortenErrorMessage(errorMessage),
        });
        continue;
      }

      succeeded += 1;
      await recordSchedulerSuccess(adminClient, userId, lockToken, now);
      results.push({
        userId,
        status: "success",
        placedCount: getPlacedCount(runResult),
      });
    } catch (error) {
      const errorMessage = errorToMessage(error);
      failed += 1;
      await recordSchedulerFailure(
        adminClient,
        userId,
        lockToken,
        now,
        errorMessage
      );
      results.push({
        userId,
        status: "failed",
        error: shortenErrorMessage(errorMessage),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun: false,
    selected: selected.length,
    claimed,
    succeeded,
    failed,
    skipped,
    results,
  });
}

export async function POST(request: Request) {
  return handleCronRun(request);
}

export async function GET(request: Request) {
  return handleCronRun(request);
}

export async function HEAD() {
  return new Response(null, { status: 405 });
}

export async function OPTIONS() {
  return methodNotAllowed();
}

export async function PUT() {
  return methodNotAllowed();
}

export async function DELETE() {
  return methodNotAllowed();
}

export async function PATCH() {
  return methodNotAllowed();
}

function methodNotAllowed() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}

async function readCronRequestOptions(
  request: Request
): Promise<CronRequestOptions> {
  let body: CronRequestBody | null = null;

  try {
    const parsed: unknown = await request.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as CronRequestBody;
    }
  } catch {
    body = null;
  }

  return {
    limit: clampInteger(body?.limit, DEFAULT_LIMIT, MIN_LIMIT, MAX_LIMIT),
    activeWithinHours: clampInteger(
      body?.activeWithinHours,
      DEFAULT_ACTIVE_WITHIN_HOURS,
      MIN_ACTIVE_WITHIN_HOURS,
      MAX_ACTIVE_WITHIN_HOURS
    ),
    dryRun: body?.dryRun === true,
  };
}

function clampInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

async function claimSchedulerUser(
  adminClient: CronClient,
  userId: string,
  nowIso: string,
  staleLockBeforeIso: string,
  lockToken: string
) {
  const { data, error } = await adminClient
    .from("scheduler_user_state")
    .update({
      scheduler_locked_at: nowIso,
      scheduler_lock_token: lockToken,
      last_scheduler_run_at: nowIso,
    })
    .eq("user_id", userId)
    .or(`scheduler_locked_at.is.null,scheduler_locked_at.lt.${staleLockBeforeIso}`)
    .select("user_id")
    .maybeSingle();

  if (error) {
    console.warn("[SCHEDULER_CRON] claim failed", { userId, error });
    return false;
  }

  return Boolean(data?.user_id);
}

async function resolveProfileTimeZone(
  adminClient: CronClient,
  userId: string
) {
  const { data, error } = await adminClient
    .from("profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[SCHEDULER_CRON] timezone lookup failed", {
      userId,
      error,
    });
    return null;
  }

  const profile = data as { timezone?: unknown } | null;
  const timeZone = profile?.timezone;
  return typeof timeZone === "string" && timeZone.trim() ? timeZone : null;
}

function getRunErrorMessage(
  runResult: RunSchedulerResult
) {
  if (runResult.reset.error) {
    return errorToMessage(runResult.reset.error);
  }

  if ("schedule" in runResult && runResult.schedule.error) {
    return errorToMessage(runResult.schedule.error);
  }

  return null;
}

function getPlacedCount(
  runResult: RunSchedulerResult
) {
  if (runResult.reset.error || !("schedule" in runResult)) {
    return null;
  }

  return Array.isArray(runResult.schedule.placed)
    ? runResult.schedule.placed.length
    : null;
}

async function recordSchedulerSuccess(
  adminClient: CronClient,
  userId: string,
  lockToken: string,
  now: Date
) {
  const nowIso = now.toISOString();
  const nextRunAfterIso = new Date(
    now.getTime() + SUCCESS_RETRY_HOURS * 60 * 60 * 1000
  ).toISOString();

  await updateLockedSchedulerState(adminClient, userId, lockToken, {
    last_scheduler_success_at: nowIso,
    last_scheduler_error_at: null,
    last_scheduler_error: null,
    next_scheduler_run_after: nextRunAfterIso,
    scheduler_locked_at: null,
    scheduler_lock_token: null,
  });
}

async function recordSchedulerFailure(
  adminClient: CronClient,
  userId: string,
  lockToken: string,
  now: Date,
  errorMessage: string
) {
  const nextRunAfterIso = new Date(
    now.getTime() + FAILURE_RETRY_HOURS * 60 * 60 * 1000
  ).toISOString();

  await updateLockedSchedulerState(adminClient, userId, lockToken, {
    last_scheduler_error_at: now.toISOString(),
    last_scheduler_error: shortenErrorMessage(errorMessage),
    next_scheduler_run_after: nextRunAfterIso,
    scheduler_locked_at: null,
    scheduler_lock_token: null,
  });
}

async function updateLockedSchedulerState(
  adminClient: CronClient,
  userId: string,
  lockToken: string,
  update: SchedulerUserStateUpdate
) {
  const { error } = await adminClient
    .from("scheduler_user_state")
    .update(update)
    .eq("user_id", userId)
    .eq("scheduler_lock_token", lockToken);

  if (error) {
    console.warn("[SCHEDULER_CRON] state update failed", { userId, error });
  }
}

function errorToMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message;
  }

  return "Unknown scheduler error";
}

function shortenErrorMessage(message: string) {
  const trimmed = message.trim() || "Unknown scheduler error";
  return trimmed.length > MAX_ERROR_LENGTH
    ? `${trimmed.slice(0, MAX_ERROR_LENGTH - 1)}...`
    : trimmed;
}
