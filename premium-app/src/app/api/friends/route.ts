import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { mapFriendConnection } from "@/lib/friends/mappers";
import { getSupabaseServer } from "@/lib/supabase";

export async function GET() {
  const cookieStore = cookies();
  const supabase = getSupabaseServer({
    get: (name: string) => cookieStore.get(name),
    set: () => {},
  });

  if (!supabase) {
    return NextResponse.json({ friends: [] }, { status: 200 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ friends: [] }, { status: 200 });
  }

  const { data, error } = await supabase
    .from("friend_connections")
    .select(
      "id, friend_user_id, friend_username, friend_display_name, friend_avatar_url, friend_profile_url, has_ring, is_online"
    )
    .eq("user_id", user.id)
    .order("friend_display_name", { ascending: true });

  if (error) {
    console.error("Failed to load friend connections", error);
    return NextResponse.json(
      { friends: [], error: "Unable to load friends." },
      { status: 500 }
    );
  }

  const friends = (data ?? []).map(mapFriendConnection);

  return NextResponse.json({ friends }, { status: 200 });
}
