import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getCreatorFirebaseMessaging } from "@/lib/notifications/firebaseAdmin";

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

  const { data: tokens, error } = await supabase
    .from("push_tokens")
    .select("token")
    .eq("user_id", user.id)
    .eq("enabled", true)
    .order("last_seen_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: "Unable to load push tokens" }, { status: 500 });
  }

  const tokenValues = Array.from(
    new Set((tokens ?? []).map((entry) => entry.token).filter(Boolean)),
  );

  if (tokenValues.length === 0) {
    return NextResponse.json({ error: "No push tokens found for user" }, { status: 404 });
  }

  const messaging = getCreatorFirebaseMessaging();

  const result = await messaging.sendEachForMulticast({
    tokens: tokenValues,
    notification: {
      title,
      body,
    },
    data: {
      source: "creator",
      type: "test",
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
        },
      },
    },
  });

  return NextResponse.json({
    ok: result.failureCount === 0,
    successCount: result.successCount,
    failureCount: result.failureCount,
  });
}
