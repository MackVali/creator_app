import { NextResponse } from "next/server";

import {
  buildScheduleBlockBrief,
  ScheduleBlockBriefBuildError,
  type ScheduleBlockBrief,
  type ScheduleInstance,
} from "@/lib/notifications/scheduleBlockBrief";
import { sendPushToUser } from "@/lib/notifications/sendPush";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
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

  const now = new Date();
  const nowIso = now.toISOString();
  const { data: instance, error: instanceError } = await adminClient
    .from("schedule_instances")
    .select(
      "id, event_name, project_name, source_type, source_id, start_utc, end_utc, duration_min, status, time_block_id, day_type_time_block_id, window_id",
    )
    .eq("user_id", user.id)
    .eq("status", "scheduled")
    .not("start_utc", "is", null)
    .gte("start_utc", nowIso)
    .order("start_utc", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (instanceError) {
    return NextResponse.json({ error: "Unable to load next scheduled block" }, { status: 500 });
  }

  if (!instance) {
    return NextResponse.json({ error: "No upcoming scheduled block found" }, { status: 404 });
  }

  const anchor = instance as ScheduleInstance;
  let brief: ScheduleBlockBrief;

  try {
    brief = await buildScheduleBlockBrief(adminClient, user.id, anchor, now);
  } catch (error) {
    if (error instanceof ScheduleBlockBriefBuildError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.warn("[PUSH_SCHEDULE_TEST] schedule block brief build failed", {
      userId: user.id,
      error,
    });
    return NextResponse.json(
      { error: "Unable to load scheduled events for block" },
      { status: 500 },
    );
  }

  const result = await sendPushToUser(
    adminClient,
    user.id,
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

  const response = {
    ok: result.ok,
    successCount: result.successCount,
    failureCount: result.failureCount,
    skippedReason: result.skippedReason ?? null,
    instanceId: anchor.id,
    startUtc: anchor.start_utc,
    blockLabel: brief.blockLabel,
    blockEventCount: brief.blockEventCount,
    previewEvents: brief.previewEvents,
    title: brief.title,
    body: brief.body,
    ...(result.error ? { error: result.error } : {}),
  };

  return NextResponse.json(response, { status: result.ok ? 200 : 500 });
}
