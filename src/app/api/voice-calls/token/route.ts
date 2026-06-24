import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

type VoiceCallTokenRequest = {
  targetUserId?: unknown;
  callType?: unknown;
};

function getLiveKitConfig() {
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim();

  if (!apiKey || !apiSecret || !serverUrl) {
    return null;
  }

  return { apiKey, apiSecret, serverUrl };
}

function getPairRoomName(
  userId: string,
  targetUserId: string,
  callType: "voice" | "video"
) {
  return `creator-${callType}-${[userId, targetUserId].sort().join("-")}`;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase client unavailable" },
        { status: 500 }
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | VoiceCallTokenRequest
      | null;
    const targetUserId =
      typeof body?.targetUserId === "string" ? body.targetUserId.trim() : "";
    const callType = body?.callType === "video" ? "video" : "voice";

    if (!targetUserId || targetUserId === user.id) {
      return NextResponse.json(
        { error: "A mutual friend is required to start a call." },
        { status: 400 }
      );
    }

    const viewerFriendQuery = supabase
      .from("friend_connections")
      .select("id")
      .eq("user_id", user.id)
      .eq("friend_user_id", targetUserId)
      .maybeSingle();

    const targetFriendQuery = supabase
      .from("friend_connections")
      .select("id")
      .eq("user_id", targetUserId)
      .eq("friend_user_id", user.id)
      .maybeSingle();

    const [
      { data: viewerFriend, error: viewerFriendError },
      { data: targetFriend, error: targetFriendError },
    ] = await Promise.all([viewerFriendQuery, targetFriendQuery]);

    if (viewerFriendError || targetFriendError) {
      console.error("Failed to verify call friendship", {
        viewerFriendError,
        targetFriendError,
      });
      return NextResponse.json(
        { error: "Unable to verify voice call access." },
        { status: 500 }
      );
    }

    if (!viewerFriend || !targetFriend) {
      return NextResponse.json(
        { error: "Calls are only available between mutual friends." },
        { status: 403 }
      );
    }

    const livekit = getLiveKitConfig();
    if (!livekit) {
      // LiveKit stays server-gated so missing secrets never leak to the client.
      return NextResponse.json(
        { error: "Calls are not configured yet." },
        { status: 503 }
      );
    }

    const roomName = getPairRoomName(user.id, targetUserId, callType);
    const accessToken = new AccessToken(livekit.apiKey, livekit.apiSecret, {
      identity: user.id,
      ttl: "1h",
    });

    accessToken.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
    });

    const token = await accessToken.toJwt();

    return NextResponse.json({
      serverUrl: livekit.serverUrl,
      token,
      callType,
    });
  } catch (error) {
    console.error("Unhandled error creating call token", error);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
