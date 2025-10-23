import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { mapFriendRequest } from "@/lib/friends/mappers";
import { getSupabaseServer } from "@/lib/supabase";

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

function requireSupabase() {
  const cookieStore = cookies();
  return getSupabaseServer({
    get: (name: string) => cookieStore.get(name),
    set: () => {},
  });
}

export async function GET() {
  const supabase = requireSupabase();

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
  const supabase = requireSupabase();

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

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const viewerUsername =
    (typeof metadata.username === "string" && metadata.username.trim())
      ? metadata.username.trim()
      : null;
  const viewerDisplayName =
    (typeof metadata.full_name === "string" && metadata.full_name.trim())
      ? metadata.full_name.trim()
      : user.email ?? viewerUsername ?? "Creator";
  const viewerAvatar =
    (typeof metadata.avatar_url === "string" && metadata.avatar_url.trim())
      ? metadata.avatar_url.trim()
      : null;

  if (viewerUsername && viewerUsername.toLowerCase() === normalizedUsername) {
    return NextResponse.json(
      { error: "You can’t send a request to yourself." },
      { status: 400 }
    );
  }

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
    .or(
      `and(requester_id.eq.${user.id},target_id.eq.${targetId}),and(requester_id.eq.${targetId},target_id.eq.${user.id})`
    );

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
          requester_username: viewerUsername ?? existing.requester_username,
          requester_display_name: viewerDisplayName,
          requester_avatar_url: viewerAvatar ?? existing.requester_avatar_url,
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
      return NextResponse.json(
        {
          error:
            "They already sent you a request. Check your requests tab to respond.",
        },
        { status: 409 }
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
      requester_username: viewerUsername ?? user.email ?? "creator",
      requester_display_name: viewerDisplayName,
      requester_avatar_url: viewerAvatar,
      target_id: targetId,
      target_username: normalizedUsername,
      target_display_name: normalizedUsername,
      target_avatar_url: null,
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
