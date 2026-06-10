import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";

type ThreadMessage = {
  id: string;
  body: string;
  sender_id: string;
  recipient_id: string;
  created_at: string;
};

type ThreadProfile = {
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
};

type FriendConnectionRow = {
  friend_user_id: string | null;
  friend_username: string | null;
  friend_display_name: string | null;
  friend_avatar_url: string | null;
};

type ReverseConnectionRow = {
  user_id: string | null;
};

type InboxThread = {
  participant: {
    userId: string;
    username: string | null;
    displayName: string;
    avatarUrl: string | null;
  };
  latestMessage: {
    id: string;
    body: string;
    senderId: string;
    recipientId: string;
    createdAt: string;
  } | null;
  hasMessages: boolean;
  previewLabel?: string;
};

const FRIEND_MESSAGE_TTL_HOURS = 24;

export async function GET() {
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

    const { data: outgoingRows, error: outgoingError } = await supabase
      .from("friend_connections")
      .select(
        "friend_user_id, friend_username, friend_display_name, friend_avatar_url"
      )
      .eq("user_id", user.id);

    if (outgoingError) {
      console.error("Failed to load inbox friend connections", outgoingError);
      return NextResponse.json(
        { error: "Failed to load inbox" },
        { status: 500 }
      );
    }

    const outgoingConnections = (outgoingRows ?? []) as FriendConnectionRow[];
    const outgoingFriendIds = outgoingConnections
      .map((connection) => connection.friend_user_id)
      .filter((id): id is string => {
        return typeof id === "string" && id.trim().length > 0 && id !== "null";
      });

    if (outgoingFriendIds.length === 0) {
      return NextResponse.json({ threads: [], currentUserId: user.id });
    }

    const { data: reverseRows, error: reverseError } = await supabase
      .from("friend_connections")
      .select("user_id")
      .in("user_id", outgoingFriendIds)
      .eq("friend_user_id", user.id);

    if (reverseError) {
      console.error("Failed to load inbox mutual connections", reverseError);
      return NextResponse.json(
        { error: "Failed to load inbox" },
        { status: 500 }
      );
    }

    const reverseConnections = (reverseRows ?? []) as ReverseConnectionRow[];
    const mutualFriendIds = new Set(
      reverseConnections
        .map((connection) => connection.user_id)
        .filter((id): id is string => typeof id === "string" && !!id)
    );
    const mutualConnections = outgoingConnections.filter((connection) =>
      mutualFriendIds.has(connection.friend_user_id ?? "")
    );

    if (mutualConnections.length === 0) {
      return NextResponse.json({ threads: [], currentUserId: user.id });
    }

    const mutualParticipantIds = mutualConnections
      .map((connection) => connection.friend_user_id)
      .filter((id): id is string => typeof id === "string" && !!id);

    const { data: messages, error: messagesError } = await supabase
      .from("friend_messages")
      .select("id, body, sender_id, recipient_id, created_at")
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .gte("created_at", getFriendMessageCutoffIso())
      .order("created_at", { ascending: false })
      .limit(200);

    if (messagesError) {
      console.error("Failed to load inbox messages", messagesError);
      return NextResponse.json(
        { error: "Failed to load inbox" },
        { status: 500 }
      );
    }

    const mutualParticipantIdSet = new Set(mutualParticipantIds);
    const threadMessages = (messages ?? []) as ThreadMessage[];
    const latestMessagesByUserId = new Map<string, ThreadMessage>();
    threadMessages.forEach((message) => {
      const otherUserId =
        message.sender_id === user.id
          ? message.recipient_id
          : message.sender_id;

      if (
        mutualParticipantIdSet.has(otherUserId) &&
        !latestMessagesByUserId.has(otherUserId)
      ) {
        latestMessagesByUserId.set(otherUserId, message);
      }
    });

    const { data: profileRows, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, username, name, avatar_url")
      .in("user_id", mutualParticipantIds);

    if (profileError) {
      console.error("Failed to load inbox profile data", profileError);
    }

    const profiles = (profileRows ?? []) as ThreadProfile[];
    const profilesByUserId = new Map(
      profiles.map((profile) => [profile.user_id, profile])
    );

    const threads: InboxThread[] = mutualConnections
      .map((connection) => {
        const participantId = connection.friend_user_id;

        if (!participantId) {
          return null;
        }

        const latestMessage = latestMessagesByUserId.get(participantId);
        const profile = profilesByUserId.get(participantId);
        const username =
          profile?.username ?? connection.friend_username ?? null;
        const fallbackLabel = `User ${participantId.slice(0, 6)}`;
        const displayName =
          profile?.name?.trim() ||
          connection.friend_display_name?.trim() ||
          username ||
          fallbackLabel;
        const participant = {
          userId: participantId,
          username,
          displayName,
          avatarUrl:
            profile?.avatar_url ?? connection.friend_avatar_url ?? null,
        };

        if (!latestMessage) {
          return {
            participant,
            latestMessage: null,
            hasMessages: false,
            previewLabel: "Start a conversation",
          };
        }

        return {
          participant,
          latestMessage: {
            id: latestMessage.id,
            body: latestMessage.body,
            senderId: latestMessage.sender_id,
            recipientId: latestMessage.recipient_id,
            createdAt: latestMessage.created_at,
          },
          hasMessages: true,
        };
      })
      .filter((thread): thread is InboxThread => Boolean(thread))
      .sort((a, b) => {
        if (a.latestMessage && b.latestMessage) {
          return b.latestMessage.createdAt.localeCompare(
            a.latestMessage.createdAt
          );
        }

        if (a.latestMessage) {
          return -1;
        }

        if (b.latestMessage) {
          return 1;
        }

        return a.participant.displayName.localeCompare(
          b.participant.displayName,
          undefined,
          { sensitivity: "base" }
        );
      });

    return NextResponse.json({ threads, currentUserId: user.id });
  } catch (error) {
    console.error("Unhandled error loading inbox threads", error);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

function getFriendMessageCutoffIso() {
  return new Date(
    Date.now() - FRIEND_MESSAGE_TTL_HOURS * 60 * 60 * 1000
  ).toISOString();
}
