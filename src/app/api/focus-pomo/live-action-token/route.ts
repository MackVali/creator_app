import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createFocusPomoLiveActivityActionTokens } from "@/lib/focus/focusPomoLiveActionServer";

export const runtime = "nodejs";

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export async function POST(request: Request) {
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

  const body = (await request.json().catch(() => null)) as
    | { sessionId?: unknown; scheduleInstanceId?: unknown }
    | null;
  const sessionId = readString(body?.sessionId);
  const scheduleInstanceId = readString(body?.scheduleInstanceId);

  if (!sessionId || !scheduleInstanceId) {
    return NextResponse.json(
      { error: "Missing sessionId or scheduleInstanceId" },
      { status: 400 }
    );
  }

  const { data: instance, error } = await supabase
    .from("schedule_instances")
    .select("id,user_id,status")
    .eq("id", scheduleInstanceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Unable to validate schedule instance" },
      { status: 500 }
    );
  }
  if (!instance) {
    return NextResponse.json(
      { error: "Schedule instance not found" },
      { status: 404 }
    );
  }

  let tokens: ReturnType<typeof createFocusPomoLiveActivityActionTokens>;
  try {
    tokens = createFocusPomoLiveActivityActionTokens({
      userId: user.id,
      sessionId,
      scheduleInstanceId,
    });
  } catch (error) {
    console.error("Failed to create Focus Pomo Live Activity tokens", error);
    return NextResponse.json(
      { error: "Unable to create action tokens" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ...tokens,
    actionEndpoint: "/api/focus-pomo/live-action",
  });
}
