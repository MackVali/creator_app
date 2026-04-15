import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";

type ThreadMessage = {
  id: string;
  body: string;
  sender_id: string;
  recipient_id: string;
  created_at: string;
};

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

    const { data: messages, error: messagesError } = await supabase
      .from("friend_messages")
      .select("id, body, sender_id, recipient_id, created_at")
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(200);

    if (messagesError) {
      console.error("Failed to load inbox messages", messagesError);
      return NextResponse.json(
        { error: "Failed to load inbox" },
        { status: 500 }
      );
    }

    const threadsByUserId = new Map<string, ThreadMessage>();
    (messages ?? []).forEach((message) => {
      const otherUserId =
        message.sender_id === user.id
          ? message.recipient_id
          : message.sender_id;

      if (!threadsByUserId.has(otherUserId)) {
        threadsByUserId.set(otherUserId, message);
      }
    });

    const participantIds = Array.from(threadsByUserId.keys());

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

    const profilesByUserId = new Map(
      (profileRows ?? []).map((profile) => [profile.user_id, profile])
    );

    const threads = participantIds
      .map((participantId) => {
        const latestMessage = threadsByUserId.get(participantId);
        const profile = profilesByUserId.get(participantId);
        const fallbackLabel = `User ${participantId.slice(0, 6)}`;
        const displayName =
          profile?.name?.trim() || profile?.username || fallbackLabel;

        if (!latestMessage) {
          return null;
        }

        return {
          participant: {
            userId: participantId,
            username: profile?.username ?? null,
            displayName,
            avatarUrl: profile?.avatar_url ?? null,
          },
          latestMessage: {
            id: latestMessage.id,
            body: latestMessage.body,
            senderId: latestMessage.sender_id,
            recipientId: latestMessage.recipient_id,
            createdAt: latestMessage.created_at,
          },
        };
      })
      .filter((thread): thread is NonNullable<typeof thread> => Boolean(thread))
      .sort((a, b) =>
        b.latestMessage.createdAt.localeCompare(a.latestMessage.createdAt)
      );

    return NextResponse.json({ threads, currentUserId: user.id });
  } catch (error) {
    console.error("Unhandled error loading inbox threads", error);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
