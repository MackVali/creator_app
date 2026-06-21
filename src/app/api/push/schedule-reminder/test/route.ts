import { NextResponse } from "next/server";

import { sendPushToUser } from "@/lib/notifications/sendPush";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickBlockName(eventName: string | null, projectName: string | null) {
  return eventName?.trim() || projectName?.trim() || "Your scheduled block";
}

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

  const nowIso = new Date().toISOString();
  const { data: instance, error: instanceError } = await adminClient
    .from("schedule_instances")
    .select("id, event_name, project_name, source_type, source_id, start_utc")
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

  const title = "Up next in CREATOR";
  const body = `${pickBlockName(instance.event_name, instance.project_name)} starts soon.`;

  const result = await sendPushToUser(
    adminClient,
    user.id,
    {
      notification: {
        title,
        body,
      },
      data: {
        type: "schedule_start_reminder",
        instanceId: instance.id,
        sourceType: instance.source_type,
        sourceId: instance.source_id,
        startUtc: instance.start_utc,
      },
    },
    {
      delivery: {
        kind: "schedule_start_reminder",
        entityType: "schedule_instance",
        entityId: instance.id,
        scheduledFor: instance.start_utc,
        dedupe: true,
      },
    },
  );

  const response = {
    ok: result.ok,
    successCount: result.successCount,
    failureCount: result.failureCount,
    skippedReason: result.skippedReason ?? null,
    instanceId: instance.id,
    startUtc: instance.start_utc,
    title,
    body,
    ...(result.error ? { error: result.error } : {}),
  };

  return NextResponse.json(response, { status: result.ok ? 200 : 500 });
}
