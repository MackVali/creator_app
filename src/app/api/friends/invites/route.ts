import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { mapFriendInvite } from "@/lib/friends/mappers";
import { getSupabaseServer } from "@/lib/supabase";

const InviteSchema = z.object({
  email: z.string().trim().email("Provide a valid email address"),
});

function requireSupabase() {
  const cookieStore = cookies();
  const supabase = getSupabaseServer({
    get: (name: string) => cookieStore.get(name),
    set: () => {},
  });
  return supabase;
}

export async function GET() {
  const supabase = requireSupabase();

  if (!supabase) {
    return NextResponse.json({ invites: [] }, { status: 200 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ invites: [] }, { status: 200 });
  }

  const { data, error } = await supabase
    .from("friend_invites")
    .select(
      "id, user_id, email, status, sent_at, last_sent_at, sent_count, responded_at, cancelled_at, created_at, updated_at"
    )
    .eq("user_id", user.id)
    .order("last_sent_at", { ascending: false });

  if (error) {
    console.error("Failed to load friend invites", error);
    return NextResponse.json(
      { error: "Unable to load invites." },
      { status: 500 }
    );
  }

  return NextResponse.json({ invites: (data ?? []).map(mapFriendInvite) });
}

export async function POST(request: Request) {
  const supabase = requireSupabase();

  if (!supabase) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parseResult = InviteSchema.safeParse(body ?? {});

  if (!parseResult.success) {
    return NextResponse.json(
      { error: parseResult.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  const normalizedEmail = parseResult.data.email.toLowerCase();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const {
    data: existingInvite,
    error: existingError,
  } = await supabase
    .from("friend_invites")
    .select(
      "id, user_id, email, status, sent_at, last_sent_at, sent_count, responded_at, cancelled_at, created_at, updated_at"
    )
    .eq("user_id", user.id)
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existingError && existingError.code !== "PGRST116") {
    console.error("Failed to check existing invites", existingError);
    return NextResponse.json(
      { error: "Unable to send invite." },
      { status: 500 }
    );
  }

  const now = new Date().toISOString();

  if (existingInvite) {
    const { data, error } = await supabase
      .from("friend_invites")
      .update({
        status: "pending",
        last_sent_at: now,
        sent_count: (existingInvite.sent_count ?? 0) + 1,
        cancelled_at: null,
      })
      .eq("id", existingInvite.id)
      .eq("user_id", user.id)
      .select(
        "id, user_id, email, status, sent_at, last_sent_at, sent_count, responded_at, cancelled_at, created_at, updated_at"
      )
      .single();

    if (error) {
      console.error("Failed to resend invite", error);
      return NextResponse.json(
        { error: "Unable to send invite." },
        { status: 500 }
      );
    }

    return NextResponse.json({ invite: mapFriendInvite(data) }, { status: 200 });
  }

  const { data, error } = await supabase
    .from("friend_invites")
    .insert({
      user_id: user.id,
      email: normalizedEmail,
      status: "pending",
      sent_at: now,
      last_sent_at: now,
    })
    .select(
      "id, user_id, email, status, sent_at, last_sent_at, sent_count, responded_at, cancelled_at, created_at, updated_at"
    )
    .single();

  if (error) {
    console.error("Failed to create invite", error);
    return NextResponse.json(
      { error: "Unable to send invite." },
      { status: 500 }
    );
  }

  return NextResponse.json({ invite: mapFriendInvite(data) }, { status: 201 });
}
