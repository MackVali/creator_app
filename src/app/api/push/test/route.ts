import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { sendPushToUser } from "@/lib/notifications/sendPush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PushTestPayload = {
  title?: string;
  body?: string;
};

export async function POST(request: Request) {
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

  const payload = (await request.json().catch(() => null)) as PushTestPayload | null;

  const title = payload?.title?.trim() || "CREATOR test";
  const body = payload?.body?.trim() || "Backend push notifications are alive.";

  const result = await sendPushToUser(supabase, user.id, {
    notification: {
      title,
      body,
    },
    data: {
      type: "test",
    },
  });

  if (result.skippedReason === "token_load_failed") {
    return NextResponse.json({ error: "Unable to load push tokens" }, { status: 500 });
  }

  if (result.skippedReason === "no_tokens") {
    return NextResponse.json({ error: "No push tokens found for user" }, { status: 404 });
  }

  if (result.error) {
    return NextResponse.json({ error: "Unable to send push notification" }, { status: 500 });
  }

  return NextResponse.json({
    ok: result.ok,
    successCount: result.successCount,
    failureCount: result.failureCount,
  });
}
