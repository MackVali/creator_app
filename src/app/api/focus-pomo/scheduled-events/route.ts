import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

type ScheduleInstanceRow = {
  id: string;
  source_type: string;
  source_id: string;
  event_name: string | null;
  project_name: string | null;
  duration_min: number | null;
  energy_resolved: string | null;
  start_utc: string | null;
  end_utc: string | null;
  status: string | null;
  time_block_id: string | null;
  day_type_time_block_id: string | null;
  window_id: string | null;
};

function readString(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function readDateParam(params: URLSearchParams, key: string): string | null {
  const value = readString(params.get(key));
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function sourceTypeLabel(value: string | null): string {
  const sourceType = value?.trim() || "Event";
  return sourceType
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function durationLabel(minutes: number | null): string {
  return minutes && minutes > 0 ? `${Math.round(minutes)} min` : "No duration";
}

function kindForSourceType(value: string | null): "chore" | "habit" | "project" {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "HABIT") return "habit";
  if (normalized === "CHORE") return "chore";
  return "project";
}

function matchesProvidedIdentity(
  row: ScheduleInstanceRow,
  identity: {
    timeBlockId: string | null;
    dayTypeTimeBlockId: string | null;
    windowId: string | null;
  },
) {
  const providedIdentities = [
    [identity.timeBlockId, row.time_block_id],
    [identity.dayTypeTimeBlockId, row.day_type_time_block_id],
    [identity.windowId, row.window_id],
  ] as const;

  if (providedIdentities.some(([provided]) => Boolean(provided))) {
    return providedIdentities.some(
      ([provided, rowValue]) => Boolean(provided) && rowValue === provided,
    );
  }

  return !row.time_block_id && !row.day_type_time_block_id && !row.window_id;
}

function mapScheduleInstance(row: ScheduleInstanceRow) {
  const sourceType = readString(row.source_type)?.toUpperCase() ?? "EVENT";
  const title =
    readString(row.event_name) ??
    readString(row.project_name) ??
    sourceTypeLabel(sourceType);
  const minutes =
    typeof row.duration_min === "number" && Number.isFinite(row.duration_min)
      ? Math.max(0, Math.round(row.duration_min))
      : null;
  const label = sourceTypeLabel(sourceType);

  return {
    id: sourceType === "EVENT" ? row.id : row.source_id,
    kind: kindForSourceType(sourceType),
    sourceType,
    source_type: sourceType,
    sourceId: row.source_id,
    source_id: row.source_id,
    workType: sourceType.toLowerCase(),
    title,
    subtitle: label,
    durationMinutes: minutes,
    durationLabel: durationLabel(minutes),
    energyLabel: sourceTypeLabel(row.energy_resolved),
    energyCode: readString(row.energy_resolved),
    statusLabel: "Scheduled Event",
    status: row.status,
    rawTypeLabel: label,
    scheduleInstanceId: row.id,
    schedule_instance_id: row.id,
    startUtc: row.start_utc,
    start_utc: row.start_utc,
    endUtc: row.end_utc,
    end_utc: row.end_utc,
    timeBlockId: row.time_block_id,
    time_block_id: row.time_block_id,
    dayTypeTimeBlockId: row.day_type_time_block_id,
    day_type_time_block_id: row.day_type_time_block_id,
    windowId: row.window_id,
    window_id: row.window_id,
  };
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client unavailable" },
      { status: 500 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const startUtc = readDateParam(url.searchParams, "start");
  const endUtc = readDateParam(url.searchParams, "end");
  if (!startUtc || !endUtc || Date.parse(startUtc) >= Date.parse(endUtc)) {
    return NextResponse.json(
      { error: "Missing or invalid Time Block start/end." },
      { status: 400 },
    );
  }

  const identity = {
    timeBlockId: readString(url.searchParams.get("timeBlockId")),
    dayTypeTimeBlockId: readString(url.searchParams.get("dayTypeTimeBlockId")),
    windowId: readString(url.searchParams.get("windowId")),
  };

  const { data, error } = await supabase
    .from("schedule_instances")
    .select(
      "id,source_type,source_id,event_name,project_name,duration_min,energy_resolved,start_utc,end_utc,status,time_block_id,day_type_time_block_id,window_id",
    )
    .eq("user_id", user.id)
    .eq("status", "scheduled")
    .gte("start_utc", startUtc)
    .lt("start_utc", endUtc)
    .order("start_utc", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Failed to load scheduled Events." },
      { status: 500 },
    );
  }

  const rows = ((data ?? []) as ScheduleInstanceRow[]).filter((row) =>
    matchesProvidedIdentity(row, identity),
  );

  return NextResponse.json({
    items: rows.map(mapScheduleInstance),
  });
}
