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
  const admin = createAdminClient();
  const profileClient = admin ?? supabase;
  const trimmedLower = trimmed.toLowerCase();
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
      "id, username, name, avatar_url, role, highlight, reason, mutual_friends"
    )
    .order(trimmed ? "mutual_friends" : "created_at", { ascending: false })
    .limit(maxDiscoveryResults);

  if (trimmed) {
    const escaped = escapeForILike(trimmed);
    discoveryQuery.or(
      `username.ilike.%${escaped}%,name.ilike.%${escaped}%,role.ilike.%${escaped}%`
    );
  }

  const { data: discoveryRows, error: discoveryError } = await discoveryQuery;

  if (discoveryError) {
    console.error("Failed to load friend discovery profiles", discoveryError);
  }

  const profileQuery = profileClient
    .from("profiles")
    .select("id, user_id, username, name, avatar_url")
    .not("username", "is", null)
    .eq("is_private", false)
    .order("created_at", { ascending: false })
    .limit(maxDiscoveryResults);

  if (trimmed) {
    const escapedProfiles = escapeForILike(trimmed);
    profileQuery.or(
      `username.ilike.%${escapedProfiles}%,name.ilike.%${escapedProfiles}%`
    );
  }

  const { data: profileData, error: profilesError } = await profileQuery;

  let profileRows: Array<{
    id: string;
    user_id: string | null;
    username: string;
    name: string | null;
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

      const displayName = row.name ?? username;
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
    const normalizedRow = {
      ...row,
      display_name:
        (row as any).name ?? (row as any).display_name ?? null,
    };
    const profile = mapDiscoveryProfile(normalizedRow);
    const normalized = profile.username.toLowerCase();
    if (seenUsernames.has(normalized)) {
      continue;
    }
    aggregated.push(profile);
    seenUsernames.add(normalized);
  }

  if (
    trimmed &&
    aggregated.length < maxDiscoveryResults &&
    admin?.auth?.admin?.listUsers
  ) {
    try {
      const { data: adminUsersData, error: adminUsersError } =
        await admin.auth.admin.listUsers({ page: 1, perPage: 200 });

      if (adminUsersError) {
        console.error(
          "Failed to list users for admin discovery fallback",
          adminUsersError
        );
      } else {
        const adminUsers = adminUsersData?.users ?? [];

        for (const adminUser of adminUsers) {
          if (aggregated.length >= maxDiscoveryResults) {
            break;
          }

          if (adminUser.id === user.id) {
            continue;
          }

          const adminMetadata =
            (adminUser.user_metadata ?? {}) as Record<string, unknown>;
          const metadataUsername =
            typeof adminMetadata.username === "string"
              ? adminMetadata.username.trim()
              : "";
          const metadataName =
            typeof adminMetadata.name === "string"
              ? adminMetadata.name.trim()
              : "";
          const metadataDisplayName =
            typeof adminMetadata.display_name === "string"
              ? adminMetadata.display_name.trim()
              : "";
          const metadataFullName =
            typeof adminMetadata.full_name === "string"
              ? adminMetadata.full_name.trim()
              : "";
          const metadataAvatar =
            typeof adminMetadata.avatar_url === "string" &&
            adminMetadata.avatar_url.trim().length
              ? adminMetadata.avatar_url.trim()
              : null;
          const email =
            typeof adminUser.email === "string"
              ? adminUser.email.trim()
              : "";
          const emailPrefix = email.split("@")[0]?.trim() ?? "";
          const usernameCandidate = metadataUsername || emailPrefix;
          if (!usernameCandidate) {
            continue;
          }

          const normalizedCandidate = usernameCandidate.toLowerCase();
          if (seenUsernames.has(normalizedCandidate)) {
            continue;
          }

          const matchesQuery = [
            metadataUsername,
            metadataName,
            metadataDisplayName,
            email,
          ].some(
            (value) =>
              value &&
              value.toLowerCase().includes(trimmedLower)
          );
          if (!matchesQuery) {
            continue;
          }

          const displayNameCandidate =
            metadataName ||
            metadataDisplayName ||
            metadataFullName ||
            usernameCandidate;
          const avatarUrl =
            metadataAvatar ?? buildAvatarFromSeed(displayNameCandidate);

          aggregated.push({
            id: adminUser.id,
            username: usernameCandidate,
            displayName: displayNameCandidate,
            avatarUrl,
            mutualFriends: 0,
            highlight: `Search match for “${trimmed}”`,
            role: "Creator",
          });
          seenUsernames.add(normalizedCandidate);
        }
      }
    } catch (adminFallbackError) {
      console.error(
        "Admin discovery fallback search failed",
        adminFallbackError
      );
    }
  }

  const discoveryProfiles = aggregated;

  return NextResponse.json(
    { results: friendResults, discoveryProfiles },
    { status: 200 }
  );
}
