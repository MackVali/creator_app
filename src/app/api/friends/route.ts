import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { mapFriendConnection } from "@/lib/friends/mappers";
import { getSupabaseServer } from "@/lib/supabase";

function resolveDisplayName(profile?: {
  name?: string | null;
  username?: string | null;
}) {
  const trimmed = profile?.name?.trim();
  return trimmed ? trimmed : profile?.username;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawView = (searchParams.get("view") ?? "").toLowerCase();
  const view: "friends" | "following" | "followers" =
    rawView === "following" || rawView === "followers" ? rawView : "friends";

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

  const selectColumns =
    "id, created_at, updated_at, friend_user_id, friend_username, friend_display_name, friend_avatar_url, friend_profile_url, has_ring, is_online";

  if (view === "followers") {
    const { data: incomingConnections, error: incomingError } = await supabase
      .from("friend_connections")
      .select("id, created_at, updated_at, user_id, has_ring, is_online")
      .eq("friend_user_id", user.id);

    if (incomingError) {
      console.error("Failed to load follower connections", incomingError);
      return NextResponse.json(
        { friends: [], error: "Unable to load friends." },
        { status: 500 }
      );
    }

    const incoming = incomingConnections ?? [];

    if (incoming.length === 0) {
      return NextResponse.json({ friends: [] }, { status: 200 });
    }

    const followerIds = incoming
      .map((row) => row.user_id)
      .filter((id): id is string => typeof id === "string" && !!id);

    const { data: followerProfiles, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, username, name, avatar_url")
      .in("user_id", followerIds);

    if (profileError) {
      console.error("Failed to load follower profiles", profileError);
      return NextResponse.json(
        { friends: [], error: "Unable to load friends." },
        { status: 500 }
      );
    }

    const profileById = new Map(
      (followerProfiles ?? []).map((profile) => [profile.user_id, profile])
    );

    const followers = incoming.map((row) => {
      const profile = profileById.get(row.user_id ?? "");
      const username =
        (typeof profile?.username === "string" && profile.username.trim()) ||
        row.user_id ||
        "unknown";
      const displayName =
        resolveDisplayName(profile ?? undefined) ?? username;
      const avatarUrl =
        (profile?.avatar_url ?? null) as string | null;

      const syntheticConnection = {
        id: row.id,
        created_at: row.created_at ?? "",
        updated_at: row.updated_at ?? row.created_at ?? "",
        user_id: user.id,
        friend_user_id: row.user_id,
        friend_username: username,
        friend_display_name: displayName,
        friend_avatar_url: avatarUrl,
        friend_profile_url: username ? `/profile/${encodeURIComponent(username)}` : null,
        has_ring: row.has_ring ?? false,
        is_online: row.is_online ?? false,
      };

      return mapFriendConnection(
        syntheticConnection as Parameters<typeof mapFriendConnection>[0]
      );
    });

    return NextResponse.json({ friends: followers }, { status: 200 });
  }

  const { data: outgoingConnections, error: outgoingError } = await supabase
    .from("friend_connections")
    .select(selectColumns)
    .eq("user_id", user.id)
    .order("friend_display_name", { ascending: true });

  if (outgoingError) {
    console.error("Failed to load friend connections", outgoingError);
    return NextResponse.json(
      { friends: [], error: "Unable to load friends." },
      { status: 500 }
    );
  }

  const outgoing = outgoingConnections ?? [];

  if (outgoing.length === 0) {
    return NextResponse.json({ friends: [] }, { status: 200 });
  }

  if (view === "following") {
    const friends = outgoing.map(mapFriendConnection);
    return NextResponse.json({ friends }, { status: 200 });
  }

  const friendIds = outgoing.map((connection) => connection.friend_user_id);

  const { data: reverseConnections, error: reverseError } = await supabase
    .from("friend_connections")
    .select("user_id")
    .in("user_id", friendIds)
    .eq("friend_user_id", user.id);

  if (reverseError) {
    console.error("Failed to load mutual friend connections", reverseError);
    return NextResponse.json(
      { friends: [], error: "Unable to load friends." },
      { status: 500 }
    );
  }

  const mutualFriendIds = new Set((reverseConnections ?? []).map((row) => row.user_id));
  const mutualConnections = outgoing.filter((connection) =>
    mutualFriendIds.has(connection.friend_user_id)
  );

  const friends = mutualConnections.map(mapFriendConnection);

  return NextResponse.json({ friends }, { status: 200 });
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer(cookieStore);

  if (!supabase) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const rawUsername = typeof body?.username === "string" ? body.username : "";
  const normalizedUsername = rawUsername.trim().toLowerCase();

  if (!normalizedUsername) {
    return NextResponse.json(
      { error: "Username is required." },
      { status: 400 }
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

  const { data: targetUserId, error: lookupError } = await supabase.rpc(
    "get_profile_user_id",
    { p_username: normalizedUsername }
  );

  if (lookupError) {
    console.error("Failed to resolve profile id", lookupError);
    return NextResponse.json(
      { error: "Unable to follow user." },
      { status: 500 }
    );
  }

  if (!targetUserId) {
    return NextResponse.json(
      { error: "Profile not found." },
      { status: 404 }
    );
  }

  if (targetUserId === user.id) {
    return NextResponse.json(
      { error: "Cannot follow yourself." },
      { status: 400 }
    );
  }

  const { data: targetProfile, error: profileError } = await supabase
    .from("profiles")
    .select("username, name, avatar_url")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (profileError || !targetProfile) {
    console.error("Missing canonical profile data", profileError);
    return NextResponse.json(
      { error: "Unable to follow user." },
      { status: 500 }
    );
  }

  const canonicalTargetUsername = targetProfile.username?.trim();

  if (!canonicalTargetUsername) {
    console.error("Canonical username missing for profile", targetProfile);
    return NextResponse.json(
      { error: "Unable to follow user." },
      { status: 500 }
    );
  }

  const targetDisplayName =
    resolveDisplayName(targetProfile) ?? canonicalTargetUsername;
  const targetAvatarUrl = targetProfile.avatar_url ?? null;

  const { data: existingConnection, error: existingError } = await supabase
    .from("friend_connections")
    .select("id")
    .eq("user_id", user.id)
    .eq("friend_user_id", targetUserId)
    .maybeSingle();

  if (existingError && existingError.code !== "PGRST116") {
    console.error("Failed to check existing friend connection", existingError);
  }

  if (existingConnection) {
    return NextResponse.json({ success: true }, { status: 200 });
  }

  const connection = {
    user_id: user.id,
    friend_user_id: targetUserId,
    friend_username: canonicalTargetUsername,
    friend_display_name: targetDisplayName,
    friend_avatar_url: targetAvatarUrl,
    friend_profile_url: null,
    has_ring: false,
    is_online: false,
  };

  const { error: insertError } = await supabase
    .from("friend_connections")
    .insert(connection);

  if (insertError) {
    console.error("Failed to insert friend connection", insertError);
    return NextResponse.json(
      { error: "Unable to follow user." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
