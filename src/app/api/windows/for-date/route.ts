import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchWindowsForDate, type WindowLite } from "@/lib/scheduler/repo";
import { makeDateInTimeZone } from "@/lib/scheduler/timezone";

export const runtime = "nodejs";

/**
 * API endpoint to fetch day-type-aware windows for a specific date
 *
 * Query Parameters:
 * - dayKey: YYYY-MM-DD format date string
 * - timeZone: IANA timezone string (e.g., "America/Chicago")
 *
 * Returns: { windows: WindowLite[] }
 *
 * Example curl:
 * curl "http://localhost:3000/api/windows/for-date?dayKey=2024-01-15&timeZone=America%2FChicago" \\
 *   -H "Authorization: Bearer YOUR_TOKEN"
 */
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

  // Parse query parameters
  const url = new URL(request.url);
  const dayKey = url.searchParams.get("dayKey");
  const timeZone = url.searchParams.get("timeZone") || "UTC";

  if (!dayKey) {
    return NextResponse.json(
      { error: "dayKey parameter is required in YYYY-MM-DD format" },
      { status: 400 }
    );
  }

  // Parse the date key into year, month, day
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!dateMatch) {
    return NextResponse.json(
      { error: "dayKey must be in YYYY-MM-DD format" },
      { status: 400 }
    );
  }

  const [, yearStr, monthStr, dayStr] = dateMatch;
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return NextResponse.json(
      { error: "invalid dayKey values" },
      { status: 400 }
    );
  }

  try {
    // Create the date in the specified timezone at 4am to align with GLOBAL_DAY_START_HOUR
    // This ensures day_type_assignments lookup uses the correct date_key for the requested day
    const date = makeDateInTimeZone(
      { year, month, day, hour: 4, minute: 0 },
      timeZone
    );

    // Fetch windows for this date using day-type-aware method
    // fetchWindowsForDate will automatically use getWindowsForDate_v2 when day types are available
    const windows = await fetchWindowsForDate(date, supabase, timeZone, {
      userId: user.id,
      useDayTypes: true, // Explicitly enable day-type awareness
    });

    return NextResponse.json({ windows });
  } catch (error) {
    console.error("Failed to fetch windows for date", error);
    return NextResponse.json(
      {
        error: "failed to fetch windows",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
