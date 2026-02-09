import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  mapDiscoveryProfile,
  mapFriendConnection,
} from "@/lib/friends/mappers";
import { DEFAULT_AVATAR_URL } from "@/lib/friends/avatar";
import { getSupabaseServer } from "@/lib/supabase";
import { createAdminClient } from "@/lib/supabase/admin";

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

function buildAvatarFromSeed(_seedSource: string) {
  return DEFAULT_AVATAR_URL;
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

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const viewerUsername =
    typeof metadata.username === "string" && metadata.username.trim().length
      ? metadata.username.trim().toLowerCase()
      : user.email
        ? user.email.split("@")[0]?.toLowerCase() ?? null
        : null;

  const friendsQuery = supabase
    .from("friend_connections")
    .select(
      "id, friend_user_id, friend_username, friend_display_name, friend_avatar_url, friend_profile_url, has_ring, is_online"
    )
    .eq("user_id", user.id)
    .order("friend_display_name", { ascending: true });

  const trimmed = query.trim();
  const maxDiscoveryResults = 25;
  const profileClient = createAdminClient() ?? supabase;
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
  if (viewerUsername) {
    friendUsernames.add(viewerUsername);
  }

  const discoveryQuery = supabase
    .from("friend_discovery_profiles")
    .select(
      "id, username, display_name, avatar_url, role, highlight, reason, mutual_friends"
    )
    .order(trimmed ? "mutual_friends" : "created_at", { ascending: false })
    .limit(maxDiscoveryResults);

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

  const profileQuery = profileClient
    .from("profiles")
    .select("id, user_id, username, display_name, avatar_url")
    .not("username", "is", null)
    .order("created_at", { ascending: false })
    .limit(maxDiscoveryResults);

  if (trimmed) {
    const escapedProfiles = escapeForILike(trimmed);
    profileQuery.or(
      `username.ilike.%${escapedProfiles}%,display_name.ilike.%${escapedProfiles}%`
    );
  }

  const { data: profileData, error: profilesError } = await profileQuery;

  let profileRows: Array<{
    id: string;
    user_id: string | null;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  }> = [];
  if (profilesError) {
    console.error("Failed to search profiles for discovery", profilesError);
  } else if (profileData) {
    profileRows = profileData;
  }

  const seenUsernames = friendUsernames;
  const aggregated: ReturnType<typeof mapDiscoveryProfile>[] = [];

  if (profileRows.length) {
    for (const row of profileRows) {
      if (aggregated.length >= maxDiscoveryResults) {
        break;
      }
      const rawUsername = row.username ?? "";
      const username = rawUsername.trim();
      if (!username) {
        continue;
      }
      const normalized = username.toLowerCase();
      if (seenUsernames.has(normalized)) {
        continue;
      }
      if (row.user_id && row.user_id === user.id) {
        continue;
      }

      const displayName = row.display_name ?? username;
      aggregated.push({
        id: row.id,
        username,
        displayName,
        avatarUrl: row.avatar_url ?? buildAvatarFromSeed(displayName),
        mutualFriends: 0,
        highlight: trimmed ? `Search match for “${trimmed}”` : "Creator profile",
        role: "Creator",
      });
      seenUsernames.add(normalized);
    }
  }

  for (const row of discoveryRows ?? []) {
    if (aggregated.length >= maxDiscoveryResults) {
      break;
    }
    const profile = mapDiscoveryProfile(row);
    const normalized = profile.username.toLowerCase();
    if (seenUsernames.has(normalized)) {
      continue;
    }
    aggregated.push(profile);
    seenUsernames.add(normalized);
  }

  const discoveryProfiles = aggregated;

  return NextResponse.json(
    { results: friendResults, discoveryProfiles },
    { status: 200 }
  );
}
