import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildAnalyticsHistoryDay,
  type HistoryCompletionRow,
  type HistoryXpEventRow,
} from "@/lib/analytics/history";
import {
  normalizeObservedScheduleAnalyticsRows,
  type RawObservedScheduleAnalyticsRow,
} from "@/lib/analytics/scheduleSummary";
import { requirePlus } from "@/lib/entitlements/requirePlus";
import { resolveCreatorDayForDate } from "@/lib/creatorDay";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { normalizeTimeZone } from "@/lib/scheduler/timezone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function getBearerToken(authorization: string | null) {
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token;
}

async function resolveProfileTimeZone(
  client: { from: SupabaseClient["from"] },
  userId: string
) {
  try {
    const { data, error } = await client
      .from("profiles")
      .select("timezone")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      return null;
    }
    return typeof data?.timezone === "string" ? data.timezone.trim() : null;
  } catch {
    return null;
  }
}

function isDateKey(value: string | null): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function mergeById<T extends { id: string }>(first: T[], second: T[]) {
  const byId = new Map<string, T>();
  for (const row of first) byId.set(row.id, row);
  for (const row of second) byId.set(row.id, row);
  return Array.from(byId.values());
}

export async function GET(request: NextRequest) {
  const accessToken = getBearerToken(request.headers.get("authorization"));
  const gate = await requirePlus({ accessToken });
  if (gate) {
    return gate;
  }

  const supabase = await createSupabaseServerClient({ accessToken });
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client not initialized" },
      { status: 500 }
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken ?? undefined);

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const requestedDate = url.searchParams.get("date");
  if (!isDateKey(requestedDate)) {
    return NextResponse.json(
      { error: "Expected date query parameter in YYYY-MM-DD format" },
      { status: 400 }
    );
  }

  const profileTimeZone = await resolveProfileTimeZone(supabase, user.id);
  const timeZone = profileTimeZone
    ? normalizeTimeZone(profileTimeZone)
    : "America/Chicago";
  const creatorDay = resolveCreatorDayForDate(
    requestedDate,
    timeZone,
    profileTimeZone ? "profile" : "utc"
  );
  const dayStartUtc = creatorDay.startsAt;
  const dayEndUtc = creatorDay.endsAt;

  const [completionByKeyRes, legacyCompletionRes, observedRes] =
    await Promise.all([
      supabase
        .from("completion_events")
        .select(
          "id, source_type, source_id, source_title, completed_at, schedule_instance_id, was_scheduled, duration_min, productivity_day_key, revoked_at"
        )
        .eq("user_id", user.id)
        .eq("productivity_day_key", requestedDate)
        .is("revoked_at", null)
        .order("completed_at", { ascending: false }),
      supabase
        .from("completion_events")
        .select(
          "id, source_type, source_id, source_title, completed_at, schedule_instance_id, was_scheduled, duration_min, productivity_day_key, revoked_at"
        )
        .eq("user_id", user.id)
        .is("productivity_day_key", null)
        .is("revoked_at", null)
        .gte("completed_at", dayStartUtc)
        .lt("completed_at", dayEndUtc)
        .order("completed_at", { ascending: false }),
      supabase
        .from("daily_schedule_analytics_observed_instances")
        .select(
          "id, schedule_instance_id, source_id, source_type, observed_status, scheduled_start_utc, scheduled_end_utc, day_start_utc, day_end_utc, duration_min, time_block_id, day_type_time_block_id, window_id"
        )
        .eq("user_id", user.id)
        .eq("day_key", requestedDate)
        .order("scheduled_start_utc", { ascending: true }),
    ]);

  const firstError =
    completionByKeyRes.error || legacyCompletionRes.error || observedRes.error;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  const completions = mergeById(
    (completionByKeyRes.data ?? []) as HistoryCompletionRow[],
    (legacyCompletionRes.data ?? []) as HistoryCompletionRow[]
  );
  const completionIds = completions.map((completion) => completion.id);

  const xpEventsRes =
    completionIds.length > 0
      ? await supabase
          .from("xp_events")
          .select(
            "id, amount, kind, skill_id, monument_id, area_id, award_key, completion_event_id"
          )
          .eq("user_id", user.id)
          .in("completion_event_id", completionIds)
      : { data: [], error: null };

  if (xpEventsRes.error) {
    return NextResponse.json({ error: xpEventsRes.error.message }, { status: 500 });
  }

  const [
    areasRes,
    skillsRes,
    areaSkillsRes,
    monumentsRes,
    goalsRes,
    projectsRes,
    tasksRes,
    habitsRes,
  ] = await Promise.all([
    supabase.from("areas").select("id, label"),
    supabase.from("skills").select("id, name, monument_id").eq("user_id", user.id),
    supabase.from("area_skills").select("area_id, skill_id").eq("user_id", user.id),
    supabase
      .from("monuments")
      .select("id, title, area_id")
      .eq("user_id", user.id),
    supabase
      .from("goals")
      .select("id, name, area_id, monument_id")
      .eq("user_id", user.id),
    supabase.from("projects").select("id, name, goal_id").eq("user_id", user.id),
    supabase
      .from("tasks")
      .select("id, name, project_id, goal_id, skill_id")
      .eq("user_id", user.id),
    supabase
      .from("habits")
      .select("id, name, goal_id, skill_id")
      .eq("user_id", user.id)
      .is("circle_id", null),
  ]);

  const entityError =
    areasRes.error ||
    skillsRes.error ||
    areaSkillsRes.error ||
    monumentsRes.error ||
    goalsRes.error ||
    projectsRes.error ||
    tasksRes.error ||
    habitsRes.error;
  if (entityError) {
    return NextResponse.json({ error: entityError.message }, { status: 500 });
  }

  const observedInstances = normalizeObservedScheduleAnalyticsRows(
    (observedRes.data ?? []) as RawObservedScheduleAnalyticsRow[]
  );

  const history = buildAnalyticsHistoryDay({
    dayKey: requestedDate,
    dayStartUtc,
    dayEndUtc,
    timezone: timeZone,
    now: new Date(),
    completions,
    xpEvents: (xpEventsRes.data ?? []) as HistoryXpEventRow[],
    observedInstances,
    areas: areasRes.data ?? [],
    skills: skillsRes.data ?? [],
    areaSkills: areaSkillsRes.data ?? [],
    monuments: monumentsRes.data ?? [],
    goals: goalsRes.data ?? [],
    projects: projectsRes.data ?? [],
    tasks: tasksRes.data ?? [],
    habits: habitsRes.data ?? [],
  });

  return NextResponse.json(history, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
