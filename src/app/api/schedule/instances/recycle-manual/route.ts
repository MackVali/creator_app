import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { scheduleBacklog } from "@/lib/scheduler/reschedule";
import type { Database } from "@/types/supabase";

export const runtime = "nodejs";

type Client = SupabaseClient<Database>;
type ScheduleInstance =
  Database["public"]["Tables"]["schedule_instances"]["Row"];

const RECYCLABLE_STATUSES = ["scheduled", "missed"] as const;
const RECYCLABLE_SOURCE_TYPES = ["PROJECT", "HABIT"] as const;

type RecycleSummary = {
  recycled: number;
  placed: number;
  failed: number;
  skipped: number;
  skippedByReason: Record<string, number>;
  message?: string;
};

export async function POST() {
  const supabase = (await createSupabaseServerClient()) as Client | null;
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client unavailable" },
      { status: 500 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const skippedByReason: Record<string, number> = {};

  const taskSkipResult = await fetchRecyclableManualInstances(supabase, {
    userId: user.id,
    nowIso,
    sourceTypes: ["TASK"],
    countOnly: true,
  });
  if (taskSkipResult.error) {
    console.error(
      "Failed to count TASK manual Events for recycle",
      taskSkipResult.error
    );
    return NextResponse.json(
      { error: "Unable to inspect recyclable manual Events" },
      { status: 500 }
    );
  }
  const skippedTasks = taskSkipResult.count ?? 0;
  if (skippedTasks > 0) {
    skippedByReason.TASK_UNSUPPORTED_V1 = skippedTasks;
  }

  const recyclableResult = await fetchRecyclableManualInstances(supabase, {
    userId: user.id,
    nowIso,
    sourceTypes: [...RECYCLABLE_SOURCE_TYPES],
  });
  if (recyclableResult.error) {
    console.error(
      "Failed to load recyclable manual Events",
      recyclableResult.error
    );
    return NextResponse.json(
      { error: "Unable to load recyclable manual Events" },
      { status: 500 }
    );
  }

  const recyclable = recyclableResult.data ?? [];
  const ids = recyclable.map((row) => row.id).filter(Boolean);
  if (ids.length === 0) {
    const summary: RecycleSummary = {
      recycled: 0,
      placed: 0,
      failed: 0,
      skipped: skippedTasks,
      skippedByReason,
      message:
        skippedTasks > 0
          ? "Only TASK manual Events matched; TASK recycle is not supported in v1."
          : "No stale manual PROJECT or HABIT Events were ready to recycle.",
    };
    return NextResponse.json({ ok: true, ...summary });
  }

  const { data: releasedRows, error: releaseError } = await supabase
    .from("schedule_instances")
    .update({
      locked: false,
      placement_source: "scheduler",
      status: "missed",
      start_utc: null,
      end_utc: null,
      window_id: null,
      day_type_time_block_id: null,
      time_block_id: null,
      overlay_window_id: null,
      canceled_reason: null,
      updated_at: nowIso,
    })
    .eq("user_id", user.id)
    .eq("placement_source", "manual")
    .eq("locked", true)
    .in("status", [...RECYCLABLE_STATUSES])
    .is("completed_at", null)
    .in("source_type", [...RECYCLABLE_SOURCE_TYPES])
    .or(`end_utc.lt.${nowIso},and(end_utc.is.null,start_utc.lt.${nowIso})`)
    .in("id", ids)
    .select("*");

  if (releaseError) {
    console.error("Failed to release recycled manual Events", releaseError);
    return NextResponse.json(
      { error: "Unable to release recyclable manual Events" },
      { status: 500 }
    );
  }

  const released = releasedRows ?? [];
  if (released.length === 0) {
    const summary: RecycleSummary = {
      recycled: 0,
      placed: 0,
      failed: 0,
      skipped: skippedTasks,
      skippedByReason,
      message:
        "No stale manual PROJECT or HABIT Events were released. They may have changed before recycle completed.",
    };
    return NextResponse.json({ ok: true, ...summary });
  }

  const projectIds = uniqueSourceIds(released, "PROJECT");
  const habitIds = uniqueSourceIds(released, "HABIT");
  const timeZone =
    (await resolveProfileTimeZone(supabase, user.id)) ??
    extractUserTimeZone(user) ??
    "UTC";

  const scheduleResult = await scheduleBacklog(user.id, now, supabase, {
    timeZone,
    targetSourceIds: {
      PROJECT: projectIds,
      HABIT: habitIds,
    },
  });

  if (scheduleResult.error) {
    console.error("Targeted recycle scheduling failed", scheduleResult.error);
    return NextResponse.json(
      { error: "Unable to schedule recycled manual Events" },
      { status: 500 }
    );
  }

  const recycledSourceKeys = new Set(
    released.map((row) => `${row.source_type}:${row.source_id}`)
  );
  const placed = scheduleResult.placed.filter((row) =>
    recycledSourceKeys.has(`${row.source_type}:${row.source_id}`)
  ).length;
  const failed = scheduleResult.failures.filter((failure) =>
    recycledSourceKeys.has(`PROJECT:${failure.itemId}`) ||
    recycledSourceKeys.has(`HABIT:${failure.itemId}`)
  ).length;

  const summary: RecycleSummary = {
    recycled: released.length,
    placed,
    failed,
    skipped: skippedTasks,
    skippedByReason,
    message: buildRecycleMessage({
      recycled: released.length,
      placed,
      failed,
      skipped: skippedTasks,
    }),
  };

  return NextResponse.json({ ok: true, ...summary });
}

function fetchRecyclableManualInstances(
  supabase: Client,
  params: {
    userId: string;
    nowIso: string;
    sourceTypes: string[];
    countOnly?: boolean;
  }
) {
  const query = supabase
    .from("schedule_instances")
    .select(params.countOnly ? "id" : "*", {
      count: params.countOnly ? "exact" : undefined,
      head: params.countOnly === true,
    })
    .eq("user_id", params.userId)
    .eq("placement_source", "manual")
    .eq("locked", true)
    .in("status", [...RECYCLABLE_STATUSES])
    .is("completed_at", null)
    .in("source_type", params.sourceTypes)
    .or(
      `end_utc.lt.${params.nowIso},and(end_utc.is.null,start_utc.lt.${params.nowIso})`
    );

  return query;
}

function uniqueSourceIds(
  rows: ScheduleInstance[],
  sourceType: "PROJECT" | "HABIT"
) {
  return Array.from(
    new Set(
      rows
        .filter((row) => row.source_type === sourceType)
        .map((row) => row.source_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )
  );
}

async function resolveProfileTimeZone(client: Client, userId: string) {
  try {
    const { data, error } = await client
      .from("profiles")
      .select("timezone")
      .eq("id", userId)
      .maybeSingle();
    if (error) return null;
    const timezone =
      typeof data?.timezone === "string" ? data.timezone.trim() : "";
    return timezone || null;
  } catch {
    return null;
  }
}

function extractUserTimeZone(user: {
  user_metadata?: {
    timezone?: unknown;
    timeZone?: unknown;
    tz?: unknown;
  } | null;
}) {
  const metadata = user.user_metadata ?? {};
  const candidates = [metadata.timezone, metadata.timeZone, metadata.tz];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
}

function buildRecycleMessage(summary: {
  recycled: number;
  placed: number;
  failed: number;
  skipped: number;
}) {
  if (summary.recycled === 0) return "No stale manual Events were recycled.";
  const parts = [`${summary.recycled} recycled`, `${summary.placed} placed`];
  if (summary.failed > 0) parts.push(`${summary.failed} failed`);
  if (summary.skipped > 0) parts.push(`${summary.skipped} skipped`);
  return parts.join(", ");
}
