import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { mapFriendRequest } from "@/lib/friends/mappers";
import { getSupabaseServer } from "@/lib/supabase";

const profileSelect = "user_id, username, name, avatar_url";

function getDisplayName(profile?: { name?: string | null; username: string }) {
  const trimmed = profile?.name?.trim();
  return trimmed ? trimmed : profile?.username;
}

const RequestSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Provide a username to connect with.")
    .max(64, "Usernames can be at most 64 characters."),
  note: z
    .string()
    .trim()
    .max(280, "Notes can be at most 280 characters.")
    .optional(),
});

async function requireSupabase() {
  const cookieStore = await cookies();
  return getSupabaseServer(cookieStore);
}

export async function GET() {
  const supabase = await requireSupabase();

  if (!supabase) {
    return NextResponse.json({ requests: [] }, { status: 200 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ requests: [] }, { status: 200 });
  }

  const { data, error } = await supabase
    .from("friend_requests")
    .select(
      "id, requester_id, requester_username, requester_display_name, requester_avatar_url, target_id, target_username, target_display_name, target_avatar_url, note, status, mutual_friends, responded_at, created_at, updated_at"
    )
    .eq("target_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load friend requests", error);
    return NextResponse.json(
      { error: "Unable to load requests." },
      { status: 500 }
    );
  }

  const requests = (data ?? []).map((row) => mapFriendRequest(row, user.id));
  return NextResponse.json({ requests }, { status: 200 });
}

export async function POST(request: Request) {
  const supabase = await requireSupabase();

  if (!supabase) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parseResult = RequestSchema.safeParse(body ?? {});

  if (!parseResult.success) {
    return NextResponse.json(
      { error: parseResult.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  const normalizedUsername = parseResult.data.username.toLowerCase();

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
    data: requesterProfile,
    error: requesterProfileError,
  } = await supabase
    .from("profiles")
    .select(profileSelect)
    .eq("user_id", user.id)
    .maybeSingle();

  if (requesterProfileError) {
    console.error("Failed to load requester profile", requesterProfileError);
    return NextResponse.json(
      { error: "Unable to send request." },
      { status: 500 }
    );
  }

  if (!requesterProfile?.username?.trim()) {
    console.error("Requester profile missing canonical username", requesterProfile);
    return NextResponse.json(
      { error: "Unable to send request." },
      { status: 500 }
    );
  }

  const canonicalRequesterUsername = requesterProfile.username.trim();
  const requesterDisplayName = getDisplayName(requesterProfile);
  const requesterAvatarUrl = requesterProfile.avatar_url ?? null;

  const { data: targetId, error: lookupError } = await supabase.rpc(
    "get_profile_user_id",
    { p_username: normalizedUsername }
  );

  if (lookupError) {
    console.error("Failed to resolve username to user ID", lookupError);
    return NextResponse.json(
      { error: "Unable to send request." },
      { status: 500 }
    );
  }

  if (!targetId) {
    return NextResponse.json(
      { error: "We couldn’t find that creator." },
      { status: 404 }
    );
  }

  if (targetId === user.id) {
    return NextResponse.json(
      { error: "You can’t send a request to yourself." },
      { status: 400 }
    );
  }

  const {
    data: targetProfile,
    error: targetProfileError,
  } = await supabase
    .from("profiles")
    .select(profileSelect)
    .eq("user_id", targetId)
    .maybeSingle();

  if (targetProfileError) {
    console.error("Failed to load target profile", targetProfileError);
    return NextResponse.json(
      { error: "Unable to send request." },
      { status: 500 }
    );
  }

  if (!targetProfile?.username?.trim()) {
    console.error("Target profile missing canonical username", targetProfile);
    return NextResponse.json(
      { error: "We couldn’t find that creator." },
      { status: 404 }
    );
  }

  const canonicalTargetUsername = targetProfile.username.trim();
  const targetDisplayName = getDisplayName(targetProfile);
  const targetAvatarUrl = targetProfile.avatar_url ?? null;

  if (
    canonicalRequesterUsername.toLowerCase() ===
    canonicalTargetUsername.toLowerCase()
  ) {
    return NextResponse.json(
      { error: "You can’t send a request to yourself." },
      { status: 400 }
    );
  }

  const { data: existingFriend, error: friendError } = await supabase
    .from("friend_connections")
    .select("id")
    .eq("user_id", user.id)
    .eq("friend_user_id", targetId)
    .maybeSingle();

  if (friendError && friendError.code !== "PGRST116") {
    console.error("Failed to check existing connections", friendError);
    return NextResponse.json(
      { error: "Unable to send request." },
      { status: 500 }
    );
  }

  if (existingFriend) {
    return NextResponse.json(
      { error: "You’re already connected." },
      { status: 409 }
    );
  }

  const { data: existingRequests, error: existingError } = await supabase
    .from("friend_requests")
    .select(
      "id, requester_id, target_id, status, requester_username, requester_display_name, requester_avatar_url, target_username, target_display_name, target_avatar_url, note, mutual_friends, responded_at, created_at, updated_at"
    )
    .in("requester_id", [user.id, targetId])
    .in("target_id", [user.id, targetId]);

  if (existingError) {
    console.error("Failed to check existing friend requests", existingError);
    return NextResponse.json(
      { error: "Unable to send request." },
      { status: 500 }
    );
  }

  if (existingRequests?.length) {
    const existing = existingRequests[0];

    if (existing.requester_id === user.id) {
      if (existing.status === "pending") {
        return NextResponse.json(
          { error: "You already sent them a request." },
          { status: 409 }
        );
      }

      const { data: updated, error: updateError } = await supabase
        .from("friend_requests")
        .update({
          status: "pending",
          note: parseResult.data.note ?? existing.note,
          responded_at: null,
          requester_username: canonicalRequesterUsername,
          requester_display_name: requesterDisplayName,
          requester_avatar_url: requesterAvatarUrl ?? existing.requester_avatar_url,
          target_username: canonicalTargetUsername,
          target_display_name: targetDisplayName,
          target_avatar_url: targetAvatarUrl ?? existing.target_avatar_url,
        })
        .eq("id", existing.id)
        .select(
          "id, requester_id, requester_username, requester_display_name, requester_avatar_url, target_id, target_username, target_display_name, target_avatar_url, note, status, mutual_friends, responded_at, created_at, updated_at"
        )
        .single();

      if (updateError || !updated) {
        console.error("Failed to resend friend request", updateError);
        return NextResponse.json(
          { error: "Unable to send request." },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { request: mapFriendRequest(updated, user.id) },
        { status: 200 }
      );
    }

    if (existing.status === "pending") {
      const now = new Date().toISOString();

      const { data: updated, error: updateError } = await supabase
        .from("friend_requests")
        .update({ status: "accepted", responded_at: now })
        .eq("id", existing.id)
        .select(
          "id, requester_id, requester_username, requester_display_name, requester_avatar_url, target_id, target_username, target_display_name, target_avatar_url, note, status, mutual_friends, responded_at, created_at, updated_at"
        )
        .single();

      if (updateError || !updated) {
        console.error("Failed to accept reciprocal friend request", updateError);
        return NextResponse.json(
          { error: "Unable to send request." },
          { status: 500 }
        );
      }

      const connectionSeeds = [
        {
          user_id: updated.requester_id,
          friend_user_id: updated.target_id,
          friend_username: updated.target_username,
          friend_display_name:
            updated.target_display_name ?? updated.target_username,
          friend_avatar_url: updated.target_avatar_url,
          friend_profile_url: null,
          has_ring: false,
          is_online: false,
        },
        {
          user_id: updated.target_id,
          friend_user_id: updated.requester_id,
          friend_username: updated.requester_username,
          friend_display_name:
            updated.requester_display_name ?? updated.requester_username,
          friend_avatar_url: updated.requester_avatar_url,
          friend_profile_url: null,
          has_ring: false,
          is_online: false,
        },
      ];

      for (const connection of connectionSeeds) {
        const { data: existingConnection, error: existingConnectionError } =
          await supabase
            .from("friend_connections")
            .select("id")
            .eq("user_id", connection.user_id)
            .eq("friend_user_id", connection.friend_user_id)
            .maybeSingle();

        if (existingConnectionError && existingConnectionError.code !== "PGRST116") {
          console.error(
            "Failed to check existing friend connection",
            existingConnectionError
          );
          continue;
        }

        if (existingConnection) {
          continue;
        }

        const { error: insertError } = await supabase
          .from("friend_connections")
          .insert(connection);

        if (insertError) {
          console.error("Failed to insert friend connection", insertError);
        }
      }

      return NextResponse.json(
        { request: mapFriendRequest(updated, user.id) },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { error: "You’re already connected." },
      { status: 409 }
    );
  }

  const {
    data: inserted,
    error: insertError,
  } = await supabase
    .from("friend_requests")
    .insert({
      requester_id: user.id,
      requester_username: canonicalRequesterUsername,
      requester_display_name: requesterDisplayName,
      requester_avatar_url: requesterAvatarUrl,
      target_id: targetProfile.user_id,
      target_username: canonicalTargetUsername,
      target_display_name: targetDisplayName,
      target_avatar_url: targetAvatarUrl,
      note: parseResult.data.note ?? null,
      status: "pending",
      mutual_friends: 0,
    })
    .select(
      "id, requester_id, requester_username, requester_display_name, requester_avatar_url, target_id, target_username, target_display_name, target_avatar_url, note, status, mutual_friends, responded_at, created_at, updated_at"
    )
    .single();

  if (insertError || !inserted) {
    console.error("Failed to create friend request", insertError);
    return NextResponse.json(
      { error: "Unable to send request." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { request: mapFriendRequest(inserted, user.id) },
    { status: 201 }
  );
}
