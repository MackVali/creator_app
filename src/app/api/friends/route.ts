import { NextRequest, NextResponse } from "next/server";

import { mapFriendConnection } from "@/lib/friends/mappers";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const FRIEND_COLUMNS =
  "id, friend_user_id, friend_username, friend_display_name, friend_avatar_url, friend_profile_url, has_ring, is_online";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();

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
      .select(FRIEND_COLUMNS)
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
  } catch (error) {
    console.error("Unhandled error loading friends", error);
    return NextResponse.json(
      { friends: [], error: "Unable to load friends." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { username?: string | null }
      | null;
    const requestedUsername = body?.username?.trim();

    if (!requestedUsername) {
      return NextResponse.json(
        { error: "Username is required." },
        { status: 400 }
      );
    }

    const normalizedUsername = requestedUsername.toLowerCase();
    const supabase = await createSupabaseServerClient();

    if (!supabase) {
      return NextResponse.json(
        { error: "Unable to connect to Supabase." },
        { status: 500 }
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { data: existingFriendByUsername } = await supabase
      .from("friend_connections")
      .select(FRIEND_COLUMNS)
      .eq("user_id", user.id)
      .ilike("friend_username", normalizedUsername)
      .maybeSingle();

    if (
      existingFriendByUsername &&
      existingFriendByUsername.friend_username?.toLowerCase() === normalizedUsername
    ) {
      return NextResponse.json(
        { friend: mapFriendConnection(existingFriendByUsername), alreadyFriend: true },
        { status: 200 }
      );
    }

    const { data: searchResults, error: searchError } = await supabase.rpc(
      "search_friend_profiles",
      {
        p_query: requestedUsername,
        p_limit: 25,
      }
    );

    if (searchError) {
      console.error("Failed to search profiles while adding friend", searchError);
      return NextResponse.json(
        { error: "Unable to find that creator right now." },
        { status: 500 }
      );
    }

    const match = (searchResults ?? []).find((row) =>
      (row.username ?? "").toLowerCase() === normalizedUsername
    );

    if (!match) {
      return NextResponse.json(
        { error: "We couldn't find that creator." },
        { status: 404 }
      );
    }

    if (match.user_id && match.user_id === user.id) {
      return NextResponse.json(
        { error: "You can't add yourself as a friend." },
        { status: 400 }
      );
    }

    if (match.user_id) {
      const { data: existingFriendByUserId } = await supabase
        .from("friend_connections")
        .select(FRIEND_COLUMNS)
        .eq("user_id", user.id)
        .eq("friend_user_id", match.user_id)
        .maybeSingle();

      if (existingFriendByUserId) {
        return NextResponse.json(
          { friend: mapFriendConnection(existingFriendByUserId), alreadyFriend: true },
          { status: 200 }
        );
      }
    }

    const payload = {
      user_id: user.id,
      friend_user_id: match.user_id,
      friend_username: match.username ?? requestedUsername,
      friend_display_name:
        match.display_name ?? match.username ?? requestedUsername,
      friend_avatar_url: match.avatar_url,
      friend_profile_url: match.profile_url,
      has_ring: false,
      is_online: false,
    };

    const { data, error } = await supabase
      .from("friend_connections")
      .insert(payload)
      .select(FRIEND_COLUMNS)
      .single();

    if (error) {
      if (typeof error.code === "string" && error.code === "23505") {
        const { data: duplicate } = await supabase
          .from("friend_connections")
          .select(FRIEND_COLUMNS)
          .eq("user_id", user.id)
          .ilike("friend_username", normalizedUsername)
          .maybeSingle();

        if (duplicate) {
          return NextResponse.json(
            { friend: mapFriendConnection(duplicate), alreadyFriend: true },
            { status: 200 }
          );
        }
      }

      console.error("Failed to add friend connection", error);
      return NextResponse.json(
        { error: "Unable to add friend right now." },
        { status: 500 }
      );
    }

    const friend = mapFriendConnection(data);

    return NextResponse.json({ friend }, { status: 201 });
  } catch (error) {
    console.error("Unhandled error adding friend", error);
    return NextResponse.json(
      { error: "Unexpected error while adding friend." },
      { status: 500 }
    );
  }
}
