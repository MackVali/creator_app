import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { mapFriendInvite } from "@/lib/friends/mappers";
import { getSupabaseServer } from "@/lib/supabase";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  if (!id) {
    return NextResponse.json({ error: "Missing invite id." }, { status: 400 });
  }

  const cookieStore = cookies();
  const supabase = getSupabaseServer({
    get: (name: string) => cookieStore.get(name),
    set: () => {},
  });

  if (!supabase) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

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

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("friend_invites")
    .update({ status: "cancelled", cancelled_at: now })
    .eq("id", id)
    .eq("user_id", user.id)
    .select(
      "id, user_id, email, status, sent_at, last_sent_at, sent_count, responded_at, cancelled_at, created_at, updated_at"
    )
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Invite not found." }, { status: 404 });
    }

    console.error("Failed to cancel invite", error);
    return NextResponse.json(
      { error: "Unable to cancel invite." },
      { status: 500 }
    );
  }

  return NextResponse.json({ invite: mapFriendInvite(data) }, { status: 200 });
}
