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

type FriendConnectionRow = {
  friend_user_id: string | null;
  friend_username: string | null;
  friend_display_name: string | null;
  friend_avatar_url: string | null;
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
    readAt: string | null;
  } | null;
  hasMessages: boolean;
  previewLabel?: string;
};

function escapeForILike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const rawSearchQuery = searchParams.get("q");
    const searchQuery = rawSearchQuery?.trim() ?? "";

    if (rawSearchQuery !== null) {
      if (searchQuery.length === 0) {
        return NextResponse.json({
          results: [],
          currentUserId: user.id,
        });
      }

      if (searchQuery.length > 64) {
        return NextResponse.json(
          { error: "Invalid search query" },
          { status: 400 }
        );
      }

      const escapedQuery = escapeForILike(searchQuery);
      const { data: connectionRows, error: connectionsError } = await supabase
        .from("friend_connections")
        .select(
          "friend_user_id, friend_username, friend_display_name, friend_avatar_url"
        )
        .eq("user_id", user.id)
        .neq("friend_user_id", user.id)
        .or(
          `friend_username.ilike.*${escapedQuery}*,friend_display_name.ilike.*${escapedQuery}*`
        )
        .order("friend_display_name", { ascending: true })
        .limit(20);

      if (connectionsError) {
        console.error("Failed to search inbox chat connections", connectionsError);
        return NextResponse.json(
          { error: "Failed to search inbox" },
          { status: 500 }
        );
      }

      const connections = (connectionRows ?? []) as FriendConnectionRow[];
      const participantIds = Array.from(
        new Set(
          connections
            .map((connection) => connection.friend_user_id)
            .filter(
              (id): id is string =>
                typeof id === "string" &&
                id.trim().length > 0 &&
                id !== user.id &&
                id !== "null"
            )
        )
      );

      const { data: profileRows, error: profileError } =
        participantIds.length > 0
          ? await supabase
              .from("profiles")
              .select("user_id, username, name, avatar_url")
              .in("user_id", participantIds)
          : { data: [], error: null };

      if (profileError) {
        console.error("Failed to load inbox search profile data", profileError);
      }

      const profiles = (profileRows ?? []) as ThreadProfile[];
      const profilesByUserId = new Map(
        profiles.map((profile) => [profile.user_id, profile])
      );
      const results: InboxThread[] = connections
        .map((connection) => {
          const participantId = connection.friend_user_id;

          if (!participantId || participantId === user.id) {
            return null;
          }

          const profile = profilesByUserId.get(participantId);
          const username =
            profile?.username ?? connection.friend_username ?? null;
          const fallbackLabel = `User ${participantId.slice(0, 6)}`;
          const displayName =
            profile?.name?.trim() ||
            connection.friend_display_name?.trim() ||
            username ||
            fallbackLabel;

          return {
            participant: {
              userId: participantId,
              username,
              displayName,
              avatarUrl:
                profile?.avatar_url ?? connection.friend_avatar_url ?? null,
            },
            latestMessage: null,
            hasMessages: false,
            previewLabel: "Start a conversation",
          };
        })
        .filter((thread): thread is InboxThread => Boolean(thread));

      return NextResponse.json({
        results,
        currentUserId: user.id,
      });
    }

    const threadMessages: ThreadMessage[] = [];
    const pageSize = 1000;
    let pageStart = 0;

    while (true) {
      const { data: messagePage, error: messagesError } = await supabase
        .from("friend_messages")
        .select("id, body, sender_id, recipient_id, created_at, read_at")
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .range(pageStart, pageStart + pageSize - 1);

      if (messagesError) {
        console.error("Failed to load inbox messages", messagesError);
        return NextResponse.json(
          { error: "Failed to load inbox" },
          { status: 500 }
        );
      }

      const nextMessages = (messagePage ?? []) as ThreadMessage[];
      threadMessages.push(...nextMessages);

      if (nextMessages.length < pageSize) {
        break;
      }

      pageStart += pageSize;
    }

    const latestMessagesByUserId = new Map<string, ThreadMessage>();
    threadMessages.forEach((message) => {
      const otherUserId =
        message.sender_id === user.id
          ? message.recipient_id
          : message.sender_id;

      if (
        otherUserId &&
        otherUserId !== user.id &&
        !latestMessagesByUserId.has(otherUserId)
      ) {
        latestMessagesByUserId.set(otherUserId, message);
      }
    });

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
    const friendParticipantIds = outgoingConnections
      .map((connection) => connection.friend_user_id)
      .filter(
        (id): id is string =>
          typeof id === "string" &&
          id.trim().length > 0 &&
          id !== user.id &&
          id !== "null"
      );
    const participantIds = Array.from(
      new Set([...latestMessagesByUserId.keys(), ...friendParticipantIds])
    );

    if (participantIds.length === 0) {
      return NextResponse.json({ threads: [], currentUserId: user.id });
    }

    const { data: profileRows, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, username, name, avatar_url")
      .in("user_id", participantIds);

    if (profileError) {
      console.error("Failed to load inbox profile data", profileError);
    }

    const profiles = (profileRows ?? []) as ThreadProfile[];
    const profilesByUserId = new Map(
      profiles.map((profile) => [profile.user_id, profile])
    );
    const outgoingConnectionsByUserId = new Map(
      outgoingConnections
        .filter((connection) => typeof connection.friend_user_id === "string")
        .map((connection) => [connection.friend_user_id as string, connection])
    );

    const threads: InboxThread[] = participantIds
      .map((participantId) => {
        const latestMessage = latestMessagesByUserId.get(participantId);
        const profile = profilesByUserId.get(participantId);
        const connection = outgoingConnectionsByUserId.get(participantId);
        const username =
          profile?.username ?? connection?.friend_username ?? null;
        const fallbackLabel = `User ${participantId.slice(0, 6)}`;
        const displayName =
          profile?.name?.trim() ||
          connection?.friend_display_name?.trim() ||
          username ||
          fallbackLabel;

        return {
          participant: {
            userId: participantId,
            username,
            displayName,
            avatarUrl:
              profile?.avatar_url ?? connection?.friend_avatar_url ?? null,
          },
          latestMessage: latestMessage
            ? {
                id: latestMessage.id,
                body: latestMessage.body,
                senderId: latestMessage.sender_id,
                recipientId: latestMessage.recipient_id,
                createdAt: latestMessage.created_at,
                readAt: latestMessage.read_at,
              }
            : null,
          hasMessages: Boolean(latestMessage),
          previewLabel: latestMessage ? undefined : "Start a conversation",
        };
      })
      .sort((a, b) => {
        if (a.latestMessage || b.latestMessage) {
          return (b.latestMessage?.createdAt ?? "").localeCompare(
            a.latestMessage?.createdAt ?? ""
          );
        }

        return a.participant.displayName.localeCompare(
          b.participant.displayName
        );
      });

    return NextResponse.json({ threads, currentUserId: user.id });
  } catch (error) {
    console.error("Unhandled error loading inbox threads", error);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
