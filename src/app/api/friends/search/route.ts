import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  mapDiscoveryProfile,
  mapFriendConnection,
} from "@/lib/friends/mappers";
import { getSupabaseServer } from "@/lib/supabase";

const QuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(64, "Search queries can be at most 64 characters")
    .optional(),
});

function escapeForILike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parseResult = QuerySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
  });

  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid search query." },
      { status: 400 }
    );
  }

  const query = parseResult.data.q ?? "";
  const cookieStore = cookies();
  const supabase = getSupabaseServer({
    get: (name: string) => cookieStore.get(name),
    set: () => {},
  });

  if (!supabase) {
    return NextResponse.json(
      { results: [], discoveryProfiles: [] },
      { status: 200 }
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { results: [], discoveryProfiles: [] },
      { status: 200 }
    );
  }

  const friendsQuery = supabase
    .from("friend_connections")
    .select(
      "id, friend_user_id, friend_username, friend_display_name, friend_avatar_url, friend_profile_url, has_ring, is_online"
    )
    .eq("user_id", user.id)
    .order("friend_display_name", { ascending: true });

  const trimmed = query.trim();
  if (trimmed) {
    const escaped = escapeForILike(trimmed);
    friendsQuery.or(
      `friend_username.ilike.%${escaped}%,friend_display_name.ilike.%${escaped}%`
    );
  }

  const { data: friendRows, error: friendsError } = await friendsQuery;

  if (friendsError) {
    console.error("Failed to search friend connections", friendsError);
    return NextResponse.json(
      { error: "Unable to search friends." },
      { status: 500 }
    );
  }

  const friendResults = (friendRows ?? []).map(mapFriendConnection);
  const friendUsernames = new Set(
    friendResults.map((friend) => friend.username.toLowerCase())
  );

  const discoveryQuery = supabase
    .from("friend_discovery_profiles")
    .select(
      "id, username, display_name, avatar_url, role, highlight, reason, mutual_friends"
    )
    .order(trimmed ? "mutual_friends" : "created_at", { ascending: false })
    .limit(12);

  if (trimmed) {
    const escaped = escapeForILike(trimmed);
    discoveryQuery.or(
      `username.ilike.%${escaped}%,display_name.ilike.%${escaped}%,role.ilike.%${escaped}%`
    );
  }

  const { data: discoveryRows, error: discoveryError } = await discoveryQuery;

  if (discoveryError) {
    console.error("Failed to load friend discovery profiles", discoveryError);
  }

  const discoveryProfiles = (discoveryRows ?? [])
    .filter(
      (row) => !friendUsernames.has((row.username ?? "").toLowerCase())
    )
    .map(mapDiscoveryProfile);

  return NextResponse.json(
    { results: friendResults, discoveryProfiles },
    { status: 200 }
  );
}
