import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  mapContactImportStatus,
  mapDiscoveryProfile,
  mapFriendInvite,
  mapSuggestedFriend,
} from "@/lib/friends/mappers";
import { getSupabaseServer } from "@/lib/supabase";

type RelationshipStatus =
  | "self"
  | "friends"
  | "following"
  | "followed_by"
  | "incoming_request"
  | "outgoing_request"
  | "none";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer(cookieStore);

  if (!supabase) {
    return NextResponse.json(
      {
        contactImport: mapContactImportStatus(null),
        invites: [],
        discoveryProfiles: [],
        suggestions: [],
      },
      { status: 200 }
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      {
        contactImport: mapContactImportStatus(null),
        invites: [],
        discoveryProfiles: [],
        suggestions: [],
      },
      { status: 200 }
    );
  }

  const {
    data: contactRow,
    error: contactError,
  } = await supabase
    .from("friend_contact_imports")
    .select("id, user_id, total_contacts, imported_at, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (contactError) {
    console.error("Failed to load contact import status", contactError);
  }

  const contactImport = mapContactImportStatus(contactRow ?? null);

  const {
    data: inviteRows,
    error: invitesError,
  } = await supabase
    .from("friend_invites")
    .select(
      "id, user_id, email, status, sent_at, last_sent_at, sent_count, responded_at, cancelled_at, created_at, updated_at"
    )
    .eq("user_id", user.id)
    .order("last_sent_at", { ascending: false });

  if (invitesError) {
    console.error("Failed to load friend invites", invitesError);
  }

  const invites = (inviteRows ?? []).map(mapFriendInvite);

  const {
    data: discoveryRows,
    error: discoveryError,
  } = await supabase
    .from("friend_discovery_profiles")
    .select(
      "id, username, display_name, avatar_url, role, highlight, reason, mutual_friends"
    )
    .order("mutual_friends", { ascending: false })
    .limit(20);

  if (discoveryError) {
    console.error("Failed to load discovery profiles", discoveryError);
  }

  const discoveryProfiles = (discoveryRows ?? []).map(mapDiscoveryProfile);
  const suggestions = (discoveryRows ?? []).map(mapSuggestedFriend);

  const normalizedUsernames = Array.from(
    new Set(
      discoveryProfiles
        .map((profile) => profile.username.trim().toLowerCase())
        .filter(Boolean)
    )
  );

  const usernameToUserId = new Map<string, string | null>();

  if (normalizedUsernames.length) {
    const lookupResults = await Promise.all(
      normalizedUsernames.map(async (username) => {
        const { data: targetId, error: lookupError } = await supabase.rpc(
          "get_profile_user_id",
          { p_username: username }
        );

        if (lookupError) {
          console.error("Failed to resolve profile id", {
            username,
            error: lookupError,
          });
        }

        return [username, targetId ?? null] as const;
      })
    );

    for (const [username, targetId] of lookupResults) {
      usernameToUserId.set(username, targetId);
    }
  }

  const targetIds = Array.from(
    new Set(
      Array.from(usernameToUserId.values()).filter(
        (value): value is string => typeof value === "string"
      )
    )
  );

  const viewerId = user.id;
  const targetIdSet = new Set(targetIds);

  let followConnections: Array<{ user_id: string; friend_user_id: string }> =
    [];

  if (targetIds.length) {
    const { data, error: friendError } = await supabase
      .from("friend_connections")
      .select("user_id, friend_user_id")
      .in("user_id", [viewerId, ...targetIds])
      .in("friend_user_id", [viewerId, ...targetIds]);

    if (friendError && friendError.code !== "PGRST116") {
      console.error("Failed to check friend connections", friendError);
    } else if (data) {
      followConnections = data;
    }
  }

  const viewerFollowsTargets = new Set<string>();
  const targetsFollowViewer = new Set<string>();

  for (const connection of followConnections) {
    if (connection.user_id === viewerId && targetIdSet.has(connection.friend_user_id)) {
      viewerFollowsTargets.add(connection.friend_user_id);
    }

    if (connection.friend_user_id === viewerId && targetIdSet.has(connection.user_id)) {
      targetsFollowViewer.add(connection.user_id);
    }
  }

  let pendingRequests: Array<{ requester_id: string; target_id: string }> = [];

  if (targetIds.length) {
    const { data, error: requestError } = await supabase
      .from("friend_requests")
      .select("requester_id, target_id")
      .eq("status", "pending")
      .in("requester_id", [viewerId, ...targetIds])
      .in("target_id", [viewerId, ...targetIds]);

    if (requestError) {
      console.error("Failed to check pending requests", requestError);
    } else if (data) {
      pendingRequests = data;
    }
  }

  const incomingRequests = new Set<string>();
  const outgoingRequests = new Set<string>();

  for (const request of pendingRequests) {
    if (request.target_id === viewerId && targetIdSet.has(request.requester_id)) {
      incomingRequests.add(request.requester_id);
    }

    if (request.requester_id === viewerId && targetIdSet.has(request.target_id)) {
      outgoingRequests.add(request.target_id);
    }
  }

  const discoveryProfilesWithRelationship = discoveryProfiles.map((profile) => {
    const normalized = profile.username.trim().toLowerCase();
    const targetId = usernameToUserId.get(normalized) ?? null;
    let relationship: RelationshipStatus = "none";

    if (targetId === viewerId) {
      relationship = "self";
    } else if (targetId) {
      const viewerFollows = viewerFollowsTargets.has(targetId);
      const targetFollows = targetsFollowViewer.has(targetId);

      if (viewerFollows && targetFollows) {
        relationship = "friends";
      } else if (viewerFollows) {
        relationship = "following";
      } else if (targetFollows) {
        relationship = "followed_by";
      } else if (incomingRequests.has(targetId)) {
        relationship = "incoming_request";
      } else if (outgoingRequests.has(targetId)) {
        relationship = "outgoing_request";
      }
    }

    return {
      ...profile,
      relationship,
    };
  });

  return NextResponse.json(
    {
      contactImport,
      invites,
      discoveryProfiles: discoveryProfilesWithRelationship,
      suggestions,
    },
    { status: 200 }
  );
}
