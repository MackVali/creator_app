import { NextResponse } from "next/server";

import {
  buildScheduleBlockBrief,
  ScheduleBlockBriefBuildError,
  type ScheduleInstance,
} from "@/lib/notifications/scheduleBlockBrief";
import { fetchWindowsForDate } from "@/lib/scheduler/repo";
import { normalizeTimeZone } from "@/lib/scheduler/timezone";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_TIME_ZONE = "America/Chicago";

type ProfileTimezoneRow = {
  timezone?: string | null;
};

function normalizeProfileTimeZone(timeZone: string | null | undefined) {
  const normalized = normalizeTimeZone(timeZone);
  return normalized === "UTC" && timeZone?.trim() !== "UTC"
    ? FALLBACK_TIME_ZONE
    : normalized;
}

function blockKeyForInstance(instance: ScheduleInstance) {
  return (
    instance.time_block_id ??
    instance.day_type_time_block_id ??
    instance.window_id ??
    instance.id
  );
}

function instanceMatchesTimeBlock(
  instance: ScheduleInstance,
  timeBlockId: string,
  dayTypeTimeBlockId: string | null,
) {
  if (dayTypeTimeBlockId && instance.day_type_time_block_id === dayTypeTimeBlockId) {
    return true;
  }

  return instance.time_block_id === timeBlockId || instance.window_id === timeBlockId;
}

export async function GET() {
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

  const { data: profileRow, error: profileError } = await adminClient
    .from("profiles")
    .select("timezone")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: "Unable to load user timezone" }, { status: 500 });
  }

  const timeZone = normalizeProfileTimeZone(
    (profileRow as ProfileTimezoneRow | null)?.timezone,
  );
  const now = new Date();
  const nowMs = now.getTime();
  const windows = await fetchWindowsForDate(now, adminClient, timeZone, {
    userId: user.id,
    useDayTypes: true,
  });
  const currentTimeBlock = windows
    .filter((window) => {
      const startMs = window.dayTypeStartUtcMs;
      const endMs = window.dayTypeEndUtcMs;
      return (
        typeof startMs === "number" &&
        typeof endMs === "number" &&
        Number.isFinite(startMs) &&
        Number.isFinite(endMs) &&
        startMs <= nowMs &&
        nowMs < endMs
      );
    })
    .sort((left, right) => {
      const startDiff =
        (left.dayTypeStartUtcMs ?? 0) - (right.dayTypeStartUtcMs ?? 0);
      if (startDiff !== 0) return startDiff;
      return left.id.localeCompare(right.id);
    })[0];

  if (!currentTimeBlock) {
    return NextResponse.json(
      {
        ok: false,
        reason: "no_current_time_block",
        message: "No current Time Block found.",
      },
      { status: 404 },
    );
  }

  const startMs = currentTimeBlock.dayTypeStartUtcMs;
  const endMs = currentTimeBlock.dayTypeEndUtcMs;

  if (
    typeof startMs !== "number" ||
    typeof endMs !== "number" ||
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs)
  ) {
    return NextResponse.json(
      {
        ok: false,
        reason: "no_current_time_block",
        message: "No current Time Block found.",
      },
      { status: 404 },
    );
  }

  const blockStart = new Date(startMs);
  const blockEnd = new Date(endMs);
  const dayTypeTimeBlockId = currentTimeBlock.dayTypeTimeBlockId ?? null;

  const { data: instanceRows, error: instanceError } = await adminClient
    .from("schedule_instances")
    .select(
      "id, event_name, project_name, source_type, source_id, start_utc, end_utc, duration_min, status, time_block_id, day_type_time_block_id, window_id",
    )
    .eq("user_id", user.id)
    .eq("status", "scheduled")
    .not("start_utc", "is", null)
    .gte("start_utc", blockStart.toISOString())
    .lt("start_utc", blockEnd.toISOString())
    .order("start_utc", { ascending: true });

  if (instanceError) {
    return NextResponse.json(
      { error: "Unable to load scheduled Events for current Time Block" },
      { status: 500 },
    );
  }

  const currentBlockInstances = ((instanceRows as ScheduleInstance[] | null) ?? [])
    .filter((instance) =>
      instanceMatchesTimeBlock(instance, currentTimeBlock.id, dayTypeTimeBlockId),
    )
    .sort((left, right) => left.start_utc.localeCompare(right.start_utc));

  const anchor = currentBlockInstances[0];

  if (!anchor) {
    return NextResponse.json(
      {
        ok: false,
        reason: "current_time_block_empty",
        message: "Current Time Block has no scheduled Events.",
        blockLabel: currentTimeBlock.label || "Time Block",
        blockStartUtc: blockStart.toISOString(),
        blockEndUtc: blockEnd.toISOString(),
      },
      { status: 409 },
    );
  }

  try {
    const brief = await buildScheduleBlockBrief(adminClient, user.id, anchor, now);

    return NextResponse.json({
      ok: true,
      notification: {
        title: brief.title,
        body: brief.body,
        blockKey: blockKeyForInstance(anchor),
        anchorInstanceId: anchor.id,
        startUtc: anchor.start_utc,
        blockLabel: brief.blockLabel,
        blockEventCount: brief.blockEventCount,
      },
      currentTimeBlock: {
        id: currentTimeBlock.id,
        dayTypeTimeBlockId,
        label: brief.blockLabel,
        startUtc: blockStart.toISOString(),
        endUtc: blockEnd.toISOString(),
      },
      previewEvents: brief.previewEvents,
    });
  } catch (error) {
    if (error instanceof ScheduleBlockBriefBuildError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.warn("[LOCAL_SCHEDULE_BRIEF_TEST] schedule block brief build failed", {
      userId: user.id,
      error,
    });

    return NextResponse.json(
      { error: "Unable to build current Time Block brief" },
      { status: 500 },
    );
  }
}
