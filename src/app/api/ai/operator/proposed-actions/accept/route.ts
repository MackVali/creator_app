import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createScheduleEventInstance } from "@/lib/schedule/createScheduleEventInstance";
import type { Database, Json } from "@/types/supabase";

export const runtime = "nodejs";

const ACTION_KIND = "create_schedule_event";
const FALLBACK_TIME_ZONE = "America/Chicago";
const MAX_TITLE_LENGTH = 120;
const MIN_DURATION_MS = 5 * 60 * 1000;
const MAX_DURATION_MS = 12 * 60 * 60 * 1000;

type ProposedActionPayload = {
  action?: unknown;
};

type CreateScheduleEventAction = {
  kind?: unknown;
  title?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  timezone?: unknown;
  notes?: unknown;
};

function invalidProposedAction(status = 400) {
  return NextResponse.json(
    { ok: false, error: "Invalid proposed action." },
    { status }
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: string[]) {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function normalizeTitle(value: unknown) {
  if (typeof value !== "string") return null;
  const title = value.trim();
  if (!title || title.length > MAX_TITLE_LENGTH) return null;
  return title;
}

function parseDate(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function normalizeRequestedTimeZone(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const timezone = value.trim();
  if (!timezone || !isValidTimeZone(timezone)) return null;
  return timezone;
}

function normalizeNotes(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return null;
  const notes = value.trim();
  return notes.length > 0 ? notes : null;
}

async function resolveProfileTimeZone(
  supabase: SupabaseClient<Database>,
  userId: string
) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("timezone")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn("Failed to resolve proposed action profile timezone", {
        message: error.message,
        code: error.code,
      });
      return null;
    }

    const timezone =
      typeof data?.timezone === "string" ? data.timezone.trim() : "";
    return timezone && isValidTimeZone(timezone) ? timezone : null;
  } catch (error) {
    console.warn("Failed to resolve proposed action profile timezone", error);
    return null;
  }
}

function formatTimeRange(start: Date, end: Date, timezone: string) {
  const sameDay =
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(start) ===
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(end);

  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  });

  if (sameDay) {
    return `${dateFormatter.format(start)}, ${timeFormatter.format(
      start
    )} - ${timeFormatter.format(end)}`;
  }

  return `${dateFormatter.format(start)}, ${timeFormatter.format(
    start
  )} - ${dateFormatter.format(end)}, ${timeFormatter.format(end)}`;
}

export async function POST(request: NextRequest) {
  const supabase =
    (await createSupabaseServerClient()) as SupabaseClient<Database> | null;

  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Unable to accept proposed action." },
      { status: 500 }
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.warn("Failed to authenticate proposed action accept", {
      message: authError.message,
    });
    return NextResponse.json(
      { ok: false, error: "Unable to accept proposed action." },
      { status: 500 }
    );
  }

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated." },
      { status: 401 }
    );
  }

  const payload = (await request.json().catch(() => null)) as
    | ProposedActionPayload
    | null;

  if (!isRecord(payload) || !hasOnlyKeys(payload, ["action"])) {
    return invalidProposedAction();
  }

  const action = payload.action as CreateScheduleEventAction;
  if (
    !isRecord(action) ||
    !hasOnlyKeys(action, [
      "kind",
      "title",
      "startAt",
      "endAt",
      "timezone",
      "notes",
    ])
  ) {
    return invalidProposedAction();
  }

  if (action.kind !== ACTION_KIND) {
    return invalidProposedAction();
  }

  const title = normalizeTitle(action.title);
  const start = parseDate(action.startAt);
  const end = parseDate(action.endAt);
  const requestedTimeZone = normalizeRequestedTimeZone(action.timezone);
  const notes = normalizeNotes(action.notes);

  if (
    !title ||
    !start ||
    !end ||
    requestedTimeZone === null ||
    notes === null && action.notes !== undefined && action.notes !== null
  ) {
    return invalidProposedAction();
  }

  const durationMs = end.getTime() - start.getTime();
  if (
    durationMs <= 0 ||
    durationMs < MIN_DURATION_MS ||
    durationMs > MAX_DURATION_MS
  ) {
    return invalidProposedAction();
  }

  const timezone =
    requestedTimeZone ??
    (await resolveProfileTimeZone(supabase, user.id)) ??
    FALLBACK_TIME_ZONE;
  const startAt = start.toISOString();
  const endAt = end.toISOString();

  try {
    const created = await createScheduleEventInstance({
      supabase,
      userId: user.id,
      title,
      start,
      startUtc: startAt,
      endUtc: endAt,
      durationMin: Math.round(durationMs / 60_000),
      timezone,
      notes,
      energyResolved: "NO",
      eventName: title,
      metadata: {
        source: "ai_operator_proposed_action",
        actionKind: ACTION_KIND,
      } satisfies Json,
      timeBlockId: null,
      windowId: null,
      dayTypeTimeBlockId: null,
      overlayWindowId: null,
    });

    return NextResponse.json({
      ok: true,
      action: {
        kind: ACTION_KIND,
        status: "accepted",
      },
      event: {
        id: created.eventId,
        instanceId: created.instance.id,
        title,
        startAt,
        endAt,
        timezone,
      },
      display: {
        title,
        timeRange: formatTimeRange(start, end, timezone),
      },
    });
  } catch (error) {
    console.error("Failed to accept proposed schedule event action", error);
    return NextResponse.json(
      { ok: false, error: "Unable to accept proposed action." },
      { status: 500 }
    );
  }
}
