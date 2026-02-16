import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildScheduleEventDataset } from "@/lib/scheduler/dataset";
import { MAX_SCHEDULE_LOOKAHEAD_DAYS } from "@/lib/scheduler/limits";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "supabase client unavailable" },
      { status: 500 }
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return NextResponse.json(
      { error: authError.message ?? "failed to authenticate user" },
      { status: 500 }
    );
  }

  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const lookaheadParam = url.searchParams.get("lookaheadDays");
  const requestedTimeZone = url.searchParams.get("timeZone");
  const lookaheadDays = parseLookaheadDays(lookaheadParam);
  const effectiveTimeZone =
    requestedTimeZone?.trim() || extractUserTimeZone(user) || "UTC";

  try {
    const dataset = await buildScheduleEventDataset({
      userId: user.id,
      client: supabase,
      baseDate: new Date(),
      timeZone: effectiveTimeZone,
      lookaheadDays,
    });
    return NextResponse.json(dataset);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "unknown error");
    const stack = error instanceof Error ? error.stack ?? null : null;
    console.error({
      message,
      stack,
      userId: user.id,
      lookaheadDays,
      effectiveTimeZone,
    });
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json(
        {
          error: "failed to load schedule data",
          detail: message,
          stack,
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "failed to load schedule data" },
      { status: 500 }
    );
  }
}

function parseLookaheadDays(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.min(MAX_SCHEDULE_LOOKAHEAD_DAYS, Math.max(1, parsed));
}

function extractUserTimeZone(user: {
  user_metadata?: Record<string, unknown> | null;
}) {
  const metadata = user.user_metadata ?? {};
  const candidates = [metadata?.timezone, metadata?.timeZone, metadata?.tz];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return null;
}
