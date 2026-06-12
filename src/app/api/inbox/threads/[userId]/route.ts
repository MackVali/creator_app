import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";

type ThreadMessage = {
  id: string;
  body: string;
  sender_id: string;
  recipient_id: string;
  created_at: string;
  read_at: string | null;
};

type ThreadProfile = {
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
};

const FRIEND_MESSAGE_TTL_HOURS = 24;

export async function GET(
  _request: NextRequest,
  { params }: { params: { userId: string } }
) {
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

    const participantId = params.userId;
    const messageCutoffIso = getFriendMessageCutoffIso();

    const messagesQuery = supabase
      .from("friend_messages")
      .select("id, body, sender_id, recipient_id, created_at, read_at")
      .or(
        `and(sender_id.eq.${user.id},recipient_id.eq.${participantId}),and(sender_id.eq.${participantId},recipient_id.eq.${user.id})`
      )
      .gte("created_at", messageCutoffIso)
      .order("created_at", { ascending: true })
      .limit(500);

    const profileQuery = supabase
      .from("profiles")
      .select("user_id, username, name, avatar_url")
      .eq("user_id", participantId)
      .single();

    const [
      { data: messages, error: messagesError },
      { data: profile, error: profileError },
    ] = await Promise.all([messagesQuery, profileQuery]);

    if (messagesError) {
      console.error("Failed to load inbox thread messages", messagesError);
      return NextResponse.json(
        { error: "Failed to load conversation" },
        { status: 500 }
      );
    }

    if (profileError) {
      console.error("Failed to load thread participant profile", profileError);
    }

    const participantProfile = profile as ThreadProfile | null;
    const fallbackLabel = `User ${participantId.slice(0, 6)}`;
    const displayName =
      participantProfile?.name?.trim() ||
      participantProfile?.username ||
      fallbackLabel;
    const threadMessages = (messages ?? []) as ThreadMessage[];
    const unreadIncomingMessages = threadMessages.filter(
      (message) =>
        message.sender_id === participantId &&
        message.recipient_id === user.id &&
        message.read_at === null
    );
    let readAtForOpenedMessages: string | null = null;

    if (unreadIncomingMessages.length > 0) {
      readAtForOpenedMessages = new Date().toISOString();
      const { error: markReadError } = await supabase
        .from("friend_messages")
        .update({ read_at: readAtForOpenedMessages })
        .eq("recipient_id", user.id)
        .eq("sender_id", participantId)
        .gte("created_at", messageCutoffIso)
        .is("read_at", null);

      if (markReadError) {
        console.error("Failed to mark inbox thread messages as read", markReadError);
        readAtForOpenedMessages = null;
      }
    }

    return NextResponse.json({
      currentUserId: user.id,
      participant: {
        userId: participantId,
        username: participantProfile?.username ?? null,
        displayName,
        avatarUrl: participantProfile?.avatar_url ?? null,
      },
      messages:
        threadMessages.map((message) => ({
          id: message.id,
          body: message.body,
          senderId: message.sender_id,
          recipientId: message.recipient_id,
          createdAt: message.created_at,
          readAt:
            message.read_at ??
            (readAtForOpenedMessages &&
            message.sender_id === participantId &&
            message.recipient_id === user.id
              ? readAtForOpenedMessages
              : null),
        })),
    });
  } catch (error) {
    console.error("Unhandled error loading inbox thread", error);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

function getFriendMessageCutoffIso() {
  return new Date(
    Date.now() - FRIEND_MESSAGE_TTL_HOURS * 60 * 60 * 1000
  ).toISOString();
}
