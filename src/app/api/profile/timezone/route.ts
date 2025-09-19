import { NextRequest, NextResponse } from "next/server";
import { updateMyTimezone } from "@/lib/db/profiles";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => ({}));
    const rawTimezone = (payload as { timezone?: unknown }).timezone;
    const timezone = typeof rawTimezone === "string" ? rawTimezone : null;
    const result = await updateMyTimezone(timezone);
    const status = result.success ? 200 : 400;
    return NextResponse.json(result, { status });
  } catch (error) {
    console.error("Failed to update timezone", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
