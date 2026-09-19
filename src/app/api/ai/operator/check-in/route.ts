import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { buildIlavCheckInForUser } from "@/lib/ai/ilavCheckIn";
import { isIlavCheckInType } from "@/lib/ai/ilavCheckInSchedule";

export const runtime = "nodejs";

function readTrimmed(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get("type");
    if (!isIlavCheckInType(type)) {
      return NextResponse.json({ error: "Invalid check-in type" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
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

    const profileResponse = await supabase
      .from("profiles")
      .select("timezone")
      .eq("user_id", user.id)
      .maybeSingle();
    const profileTimezone = readTrimmed(
      (profileResponse.data as { timezone?: unknown } | null)?.timezone
    );
    const deviceTimezone = readTrimmed(
      request.nextUrl.searchParams.get("deviceTimezone")
    );
    const creatorDayDate = readTrimmed(
      request.nextUrl.searchParams.get("creatorDayDate")
    );

    const checkIn = await buildIlavCheckInForUser({
      supabase: supabase as unknown as Parameters<
        typeof buildIlavCheckInForUser
      >[0]["supabase"],
      userId: user.id,
      type,
      profileTimezone,
      deviceTimezone,
      creatorDayDate,
    });

    return NextResponse.json({ checkIn });
  } catch (error) {
    console.error("ILAV check-in error", error);
    return NextResponse.json(
      { error: "Unable to build ILAV check-in" },
      { status: 500 }
    );
  }
}
