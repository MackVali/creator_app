import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";
import { createSupabaseServerClient } from "@/lib/supabase-server";

function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  const dt = DateTime.now().setZone(value);
  return dt.isValid;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const requestedTimeZone = body?.timezone;
    if (!isValidTimeZone(requestedTimeZone)) {
      return NextResponse.json(
        { success: false, error: "Invalid time zone" },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: "Supabase client unavailable" },
        { status: 500 }
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("timezone")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Failed to load profile for timezone update", profileError);
      return NextResponse.json(
        { success: false, error: "Failed to load profile" },
        { status: 500 }
      );
    }

    const previousTimeZone = profile?.timezone && isValidTimeZone(profile.timezone)
      ? profile.timezone
      : "UTC";

    if (previousTimeZone === requestedTimeZone) {
      return NextResponse.json({ success: true, timezone: requestedTimeZone });
    }

    const { error: updateProfileError } = await supabase
      .from("profiles")
      .update({ timezone: requestedTimeZone })
      .eq("user_id", user.id);

    if (updateProfileError) {
      console.error("Failed to update profile timezone", updateProfileError);
      return NextResponse.json(
        { success: false, error: "Failed to update timezone" },
        { status: 500 }
      );
    }

    const { data: scheduledInstances, error: fetchInstancesError } = await supabase
      .from("schedule_instances")
      .select("id, start_utc, end_utc, duration_min")
      .eq("user_id", user.id)
      .eq("status", "scheduled");

    if (fetchInstancesError) {
      console.error("Failed to fetch schedule instances for timezone update", fetchInstancesError);
      return NextResponse.json(
        { success: false, error: "Failed to update scheduled items" },
        { status: 500 }
      );
    }

    const updates: Array<{ id: string; start_utc: string; end_utc: string }> = [];

    for (const inst of scheduledInstances ?? []) {
      if (!inst?.id || !inst.start_utc) continue;
      const originalStart = DateTime.fromISO(inst.start_utc, { zone: "utc" }).setZone(
        previousTimeZone
      );
      if (!originalStart.isValid) continue;
      const targetStart = DateTime.fromObject(
        {
          year: originalStart.year,
          month: originalStart.month,
          day: originalStart.day,
          hour: originalStart.hour,
          minute: originalStart.minute,
          second: originalStart.second,
          millisecond: originalStart.millisecond,
        },
        { zone: requestedTimeZone }
      );
      if (!targetStart.isValid) continue;

      const durationMinutes = Number(inst.duration_min ?? 0);
      const computedDuration = Number.isFinite(durationMinutes) && durationMinutes > 0
        ? durationMinutes
        : Math.max(
            0,
            Math.round(
              DateTime.fromISO(inst.end_utc ?? inst.start_utc, { zone: "utc" })
                .diff(DateTime.fromISO(inst.start_utc, { zone: "utc" }), "minutes")
                .minutes ?? 0
            )
          );

      const startUtcIso = targetStart.toUTC().toISO();
      if (!startUtcIso) continue;
      const endUtcIso = targetStart
        .toUTC()
        .plus({ minutes: computedDuration })
        .toISO();
      if (!endUtcIso) continue;

      updates.push({ id: inst.id, start_utc: startUtcIso, end_utc: endUtcIso });
    }

    if (updates.length > 0) {
      const { error: updateInstancesError } = await supabase
        .from("schedule_instances")
        .upsert(updates, { onConflict: "id" });

      if (updateInstancesError) {
        console.error("Failed to update schedule instances for timezone change", updateInstancesError);
        return NextResponse.json(
          { success: false, error: "Failed to update scheduled items" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true, timezone: requestedTimeZone });
  } catch (error) {
    console.error("Unexpected error in timezone update", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
