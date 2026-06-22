import { NextResponse } from "next/server";

import {
  buildScheduleBlockBrief,
  type ScheduleInstance,
} from "@/lib/notifications/scheduleBlockBrief";
import { sendPushToUser } from "@/lib/notifications/sendPush";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCAN_WINDOW_START_MINUTES = 4;
const SCAN_WINDOW_END_MINUTES = 6;
const CANDIDATE_LIMIT = 100;
const MAX_ERROR_LENGTH = 500;

type ScheduleBlockBriefCandidate = ScheduleInstance & {
  user_id: string;
};

type RunResult = {
  userId: string;
  instanceId: string;
  startUtc: string;
  blockLabel: string | null;
  status: "sent" | "failed" | "skipped";
  skippedReason?: string | null;
  error?: string | null;
};

function blockEntityId(instance: ScheduleInstance) {
  return (
    instance.time_block_id ??
    instance.day_type_time_block_id ??
    instance.window_id ??
    instance.id
  );
}

function blockGroupKey(instance: ScheduleBlockBriefCandidate) {
  return `${instance.user_id}:${blockEntityId(instance)}`;
}

function earliestAnchorByBlock(candidates: ScheduleBlockBriefCandidate[]) {
  const anchorsByKey = new Map<string, ScheduleBlockBriefCandidate>();

  for (const candidate of candidates) {
    const key = blockGroupKey(candidate);
    const current = anchorsByKey.get(key);

    if (!current || candidate.start_utc < current.start_utc) {
      anchorsByKey.set(key, candidate);
    }
  }

  return Array.from(anchorsByKey.values()).sort((left, right) =>
    left.start_utc.localeCompare(right.start_utc),
  );
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

  return "Unknown schedule block brief error";
}

function shortenErrorMessage(error: unknown) {
  const message = errorToMessage(error).trim() || "Unknown schedule block brief error";
  return message.length > MAX_ERROR_LENGTH
    ? `${message.slice(0, MAX_ERROR_LENGTH - 1)}...`
    : message;
}

function isAuthorizedCronRequest(request: Request) {
  const schedulerCronSecret = process.env.SCHEDULER_CRON_SECRET;
  const vercelCronSecret = process.env.CRON_SECRET;
  const cronSecrets = [schedulerCronSecret, vercelCronSecret].filter(Boolean);

  if (cronSecrets.length === 0) {
    return { hasSecret: false, authorized: false };
  }

  const authorization = request.headers.get("authorization");

  return {
    hasSecret: true,
    authorized: cronSecrets.some((secret) => authorization === `Bearer ${secret}`),
  };
}

async function handleScheduleBlockBriefRun(request: Request) {
  const cronAuthorization = isAuthorizedCronRequest(request);
  if (!cronAuthorization.hasSecret) {
    return NextResponse.json(
      { error: "cron secret unavailable" },
      { status: 500 },
    );
  }

  if (!cronAuthorization.authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "supabase admin client unavailable" },
      { status: 500 },
    );
  }

  const now = new Date();
  const windowStart = new Date(
    now.getTime() + SCAN_WINDOW_START_MINUTES * 60 * 1000,
  );
  const windowEnd = new Date(now.getTime() + SCAN_WINDOW_END_MINUTES * 60 * 1000);
  const windowStartIso = windowStart.toISOString();
  const windowEndIso = windowEnd.toISOString();

  const { data, error } = await adminClient
    .from("schedule_instances")
    .select(
      "id, user_id, event_name, project_name, source_type, source_id, start_utc, end_utc, duration_min, status, time_block_id, day_type_time_block_id, window_id",
    )
    .eq("status", "scheduled")
    .not("start_utc", "is", null)
    .gte("start_utc", windowStartIso)
    .lt("start_utc", windowEndIso)
    .order("start_utc", { ascending: true })
    .limit(CANDIDATE_LIMIT);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const candidates = (data ?? []) as ScheduleBlockBriefCandidate[];
  const anchors = earliestAnchorByBlock(candidates);
  const results: RunResult[] = [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const anchor of anchors) {
    try {
      const brief = await buildScheduleBlockBrief(
        adminClient,
        anchor.user_id,
        anchor,
        now,
      );
      const pushResult = await sendPushToUser(
        adminClient,
        anchor.user_id,
        {
          notification: {
            title: brief.title,
            body: brief.body,
          },
          data: brief.dataPayload,
        },
        {
          delivery: {
            kind: "schedule_block_brief",
            entityType: "schedule_block",
            entityId: brief.entityId,
            scheduledFor: anchor.start_utc,
            dedupe: true,
          },
        },
      );

      if (pushResult.skippedReason) {
        skipped += 1;
        results.push({
          userId: anchor.user_id,
          instanceId: anchor.id,
          startUtc: anchor.start_utc,
          blockLabel: brief.blockLabel,
          status: "skipped",
          skippedReason: pushResult.skippedReason,
          error: pushResult.error ?? null,
        });
      } else if (pushResult.ok) {
        sent += 1;
        results.push({
          userId: anchor.user_id,
          instanceId: anchor.id,
          startUtc: anchor.start_utc,
          blockLabel: brief.blockLabel,
          status: "sent",
          skippedReason: null,
          error: null,
        });
      } else {
        failed += 1;
        results.push({
          userId: anchor.user_id,
          instanceId: anchor.id,
          startUtc: anchor.start_utc,
          blockLabel: brief.blockLabel,
          status: "failed",
          skippedReason: pushResult.skippedReason ?? null,
          error: pushResult.error ?? "Push send failed",
        });
      }
    } catch (error) {
      const errorMessage = shortenErrorMessage(error);
      failed += 1;
      console.warn("[SCHEDULE_BLOCK_BRIEFS_RUN] anchor failed", {
        userId: anchor.user_id,
        instanceId: anchor.id,
        error: errorMessage,
      });
      results.push({
        userId: anchor.user_id,
        instanceId: anchor.id,
        startUtc: anchor.start_utc,
        blockLabel: null,
        status: "failed",
        skippedReason: null,
        error: errorMessage,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    windowStart: windowStartIso,
    windowEnd: windowEndIso,
    candidateCount: candidates.length,
    groupCount: anchors.length,
    sent,
    failed,
    skipped,
    results,
  });
}

export async function POST(request: Request) {
  return handleScheduleBlockBriefRun(request);
}

export async function GET(request: Request) {
  return handleScheduleBlockBriefRun(request);
}
