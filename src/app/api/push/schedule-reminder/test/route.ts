import { NextResponse } from "next/server";

import { formatDateKeyInTimeZone } from "@/lib/scheduler/timezone";
import { sendPushToUser } from "@/lib/notifications/sendPush";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_TIME_ZONE = "America/Chicago";

function pickBlockName(eventName: string | null, projectName: string | null) {
  return eventName?.trim() || projectName?.trim() || "Your scheduled block";
}

function normalizeTimeZoneOrFallback(timeZone: string | null) {
  const trimmed = timeZone?.trim();
  if (!trimmed) return FALLBACK_TIME_ZONE;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed });
    return trimmed;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

async function resolveProfileTimeZone(
  client: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  if (!client) return null;

  try {
    const { data, error } = await client
      .from("profiles")
      .select("timezone")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn("[PUSH_SCHEDULE_TEST] timezone lookup failed", {
        userId,
        error,
      });
      return null;
    }

    const timeZone = (data as { timezone?: unknown } | null)?.timezone;
    return typeof timeZone === "string" && timeZone.trim() ? timeZone : null;
  } catch (error) {
    console.warn("[PUSH_SCHEDULE_TEST] timezone lookup failed", {
      userId,
      error,
    });
    return null;
  }
}

function formatLocalTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatWeekday(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
  }).format(date);
}

function normalizeDurationMinutes(durationMin: number | null) {
  if (typeof durationMin !== "number" || !Number.isFinite(durationMin)) {
    return null;
  }

  const rounded = Math.round(durationMin);
  return rounded > 0 && rounded <= 24 * 60 ? rounded : null;
}

function buildReminderCopy({
  blockName,
  now,
  start,
  timeZone,
}: {
  blockName: string;
  now: Date;
  start: Date;
  timeZone: string;
}) {
  const minutesUntilStart = Math.max(0, (start.getTime() - now.getTime()) / 60000);

  if (minutesUntilStart <= 2) {
    return {
      title: "Time to start",
      body: `${blockName} is ready now.`,
    };
  }

  if (minutesUntilStart < 60) {
    return {
      title: "Upcoming block",
      body: `${blockName} starts in ${Math.ceil(minutesUntilStart)} min.`,
    };
  }

  const localTime = formatLocalTime(start, timeZone);
  const todayKey = formatDateKeyInTimeZone(now, timeZone);
  const startKey = formatDateKeyInTimeZone(start, timeZone);

  if (startKey === todayKey) {
    return {
      title: "Later today",
      body: `${blockName} starts at ${localTime}.`,
    };
  }

  return {
    title: "Scheduled block",
    body: `${blockName} starts ${formatWeekday(start, timeZone)} at ${localTime}.`,
  };
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

  const now = new Date();
  const nowIso = now.toISOString();
  const { data: instance, error: instanceError } = await adminClient
    .from("schedule_instances")
    .select("id, event_name, project_name, source_type, source_id, start_utc, duration_min")
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

  const timeZone = normalizeTimeZoneOrFallback(
    await resolveProfileTimeZone(adminClient, user.id),
  );
  const blockName = pickBlockName(instance.event_name, instance.project_name);
  const start = new Date(instance.start_utc);
  const { title, body } = buildReminderCopy({
    blockName,
    now,
    start,
    timeZone,
  });
  const durationMinutes = normalizeDurationMinutes(instance.duration_min);

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
    ...(durationMinutes !== null ? { durationMinutes } : {}),
    title,
    body,
    ...(result.error ? { error: result.error } : {}),
  };

  return NextResponse.json(response, { status: result.ok ? 200 : 500 });
}
