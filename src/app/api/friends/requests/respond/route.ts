import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { mapFriendRequest } from "@/lib/friends/mappers";
import { getSupabaseServer } from "@/lib/supabase";

const RespondSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["accepted", "declined"]),
});

const selectFields =
  "id, requester_id, requester_username, requester_display_name, requester_avatar_url, target_id, target_username, target_display_name, target_avatar_url, note, status, mutual_friends, responded_at, created_at, updated_at";

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
  const parseResult = RespondSchema.safeParse(body ?? {});

  if (!parseResult.success) {
    return NextResponse.json(
      { error: parseResult.error.issues[0]?.message ?? "Invalid request." },
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

  const { data: requestRow, error: requestError } = await supabase
    .from("friend_requests")
    .select(selectFields)
    .eq("id", parseResult.data.id)
    .maybeSingle();

  if (requestError) {
    console.error("Failed to load friend request", requestError);
    return NextResponse.json(
      { error: "Unable to respond to request." },
      { status: 500 }
    );
  }

  if (!requestRow) {
    return NextResponse.json(
      { error: "Friend request not found." },
      { status: 404 }
    );
  }

  if (requestRow.target_id !== user.id) {
    return NextResponse.json(
      { error: "Not authorized to respond to this request." },
      { status: 403 }
    );
  }

  if (requestRow.status !== "pending") {
    return NextResponse.json(
      { error: "Request already handled." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  if (parseResult.data.status === "declined") {
    const { data: updated, error: updateError } = await supabase
      .from("friend_requests")
      .update({ status: "declined", responded_at: now })
      .eq("id", requestRow.id)
      .select(selectFields)
      .single();

    if (updateError || !updated) {
      console.error("Failed to decline friend request", updateError);
      return NextResponse.json(
        { error: "Unable to respond to request." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { request: mapFriendRequest(updated, user.id) },
      { status: 200 }
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from("friend_requests")
    .update({ status: "accepted", responded_at: now })
    .eq("id", requestRow.id)
    .select(selectFields)
    .single();

  if (updateError || !updated) {
    console.error("Failed to accept friend request", updateError);
    return NextResponse.json(
      { error: "Unable to respond to request." },
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
    const { data: existing, error: existingError } = await supabase
      .from("friend_connections")
      .select("id")
      .eq("user_id", connection.user_id)
      .eq("friend_user_id", connection.friend_user_id)
      .maybeSingle();

    if (existingError && existingError.code !== "PGRST116") {
      console.error("Failed to check existing friend connection", existingError);
      continue;
    }

    if (existing) {
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
