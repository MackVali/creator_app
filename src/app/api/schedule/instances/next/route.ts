import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
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

  const url = new URL(request.url);
  const sourceId = url.searchParams.get("sourceId");
  const sourceType = url.searchParams.get("sourceType");

  if (!sourceId || !sourceType) {
    return NextResponse.json({ error: "Missing sourceId or sourceType" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("schedule_instances")
    .select("id, start_utc, duration_min")
    .eq("user_id", user.id)
    .eq("source_id", sourceId)
    .eq("source_type", sourceType)
    .eq("status", "scheduled")
    .gte("start_utc", nowIso)
    .order("start_utc", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Next schedule lookup failed", error);
    return NextResponse.json({ error: "Unable to load schedule" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ instanceId: null, startUtc: null, durationMinutes: null });
  }

  return NextResponse.json({
    instanceId: data.id ?? null,
    startUtc: data.start_utc ?? null,
    durationMinutes:
      typeof data.duration_min === "number" && Number.isFinite(data.duration_min)
        ? data.duration_min
        : null,
  });
}
