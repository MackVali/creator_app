import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { mapFriendConnection } from "@/lib/friends/mappers";
import { getSupabaseServer } from "@/lib/supabase";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer(cookieStore);

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

  const mappedConnections = (data ?? []).map(mapFriendConnection);
  const friendMap = new Map(
    mappedConnections.map((friend) => [friend.userId ?? friend.username, friend])
  );

  const { data: acceptedRows, error: acceptedError } = await supabase
    .from("friend_requests")
    .select(
      "id, requester_id, requester_username, requester_display_name, requester_avatar_url, target_id, target_username, target_display_name, target_avatar_url, status, responded_at"
    )
    .eq("status", "accepted")
    .or(`requester_id.eq.${user.id},target_id.eq.${user.id}`)
    .order("responded_at", { ascending: false });

  if (acceptedError) {
    console.error("Failed to load accepted friend requests", acceptedError);
  }

  for (const row of acceptedRows ?? []) {
    const isRequester = row.requester_id === user.id;
    const friendUserId = isRequester ? row.target_id : row.requester_id;
    const friendUsername = isRequester
      ? row.target_username
      : row.requester_username;
    const friendDisplayName =
      (isRequester ? row.target_display_name : row.requester_display_name) ??
      friendUsername;
    const friendAvatarUrl = isRequester
      ? row.target_avatar_url
      : row.requester_avatar_url;
    const mapKey = friendUserId ?? friendUsername;

    if (friendMap.has(mapKey)) {
      continue;
    }

    friendMap.set(mapKey, {
      id: row.id,
      userId: friendUserId,
      username: friendUsername,
      displayName: friendDisplayName,
      avatarUrl: friendAvatarUrl,
      profileUrl: `/profile/${encodeURIComponent(friendUsername)}`,
      hasRing: false,
      isOnline: false,
    });

    if (!friendUserId) {
      continue;
    }

    const { error: upsertError } = await supabase.from("friend_connections").upsert(
      {
        user_id: user.id,
        friend_user_id: friendUserId,
        friend_username: friendUsername,
        friend_display_name: friendDisplayName,
        friend_avatar_url: friendAvatarUrl,
        friend_profile_url: `/profile/${encodeURIComponent(friendUsername)}`,
        has_ring: false,
        is_online: false,
      },
      { onConflict: "user_id,friend_user_id" }
    );

    if (upsertError) {
      console.error("Failed to backfill friend connection", upsertError);
    }
  }

  const friends = [...friendMap.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );

  return NextResponse.json({ friends }, { status: 200 });
}
