import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getSupabaseServer } from "@/lib/supabase";

type RelationshipStatus =
  | "self"
  | "friends"
  | "incoming_request"
  | "outgoing_request"
  | "none";

async function requireSupabase() {
  const cookieStore = await cookies();
  return getSupabaseServer(cookieStore);
}

function respond(status: RelationshipStatus) {
  return NextResponse.json({ relationship: status }, { status: 200 });
}

export async function GET(_: Request, context: { params: { username?: string } }) {
  const normalizedUsername = (context.params?.username ?? "").trim().toLowerCase();

  if (!normalizedUsername) {
    return NextResponse.json(
      { error: "Username is required to determine relationship." },
      { status: 400 }
    );
  }

  const supabase = await requireSupabase();

  if (!supabase) {
    return respond("none");
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error("Failed to resolve authenticated user", authError);
  }

  const viewerId = user?.id ?? null;

  const { data: targetId, error: lookupError } = await supabase.rpc(
    "get_profile_user_id",
    { p_username: normalizedUsername }
  );

  if (lookupError) {
    console.error("Failed to resolve profile id", lookupError);
    return NextResponse.json(
      { error: "Unable to load relationship status." },
      { status: 500 }
    );
  }

  if (!targetId) {
    return NextResponse.json(
      { error: "Profile not found." },
      { status: 404 }
    );
  }

  if (viewerId && targetId === viewerId) {
    return respond("self");
  }

  if (!viewerId) {
    return respond("none");
  }

  const { data: existingFriend, error: friendError } = await supabase
    .from("friend_connections")
    .select("id")
    .eq("user_id", viewerId)
    .eq("friend_user_id", targetId)
    .maybeSingle();

  if (friendError && friendError.code !== "PGRST116") {
    console.error("Failed to check friend connections", friendError);
    return NextResponse.json(
      { error: "Unable to load relationship status." },
      { status: 500 }
    );
  }

  if (existingFriend) {
    return respond("friends");
  }

  const { data: pendingRequests, error: requestError } = await supabase
    .from("friend_requests")
    .select("requester_id, target_id")
    .eq("status", "pending")
    .in("requester_id", [viewerId, targetId])
    .in("target_id", [viewerId, targetId]);

  if (requestError) {
    console.error("Failed to check pending requests", requestError);
    return NextResponse.json(
      { error: "Unable to load relationship status." },
      { status: 500 }
    );
  }

  if (pendingRequests && pendingRequests.length) {
    const hasIncoming = pendingRequests.some(
      (request) => request.requester_id === targetId && request.target_id === viewerId
    );

    if (hasIncoming) {
      return respond("incoming_request");
    }

    const hasOutgoing = pendingRequests.some(
      (request) => request.requester_id === viewerId && request.target_id === targetId
    );

    if (hasOutgoing) {
      return respond("outgoing_request");
    }
  }

  return respond("none");
}
