import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { sendPushToUser } from "@/lib/notifications/sendPush";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase/admin";

const PUSH_BODY_MAX_LENGTH = 120;

const sendMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Message body is required")
    .max(2000, "Message is too long"),
  senderId: z.string().min(1, "Missing sender"),
  recipientId: z.string().min(1, "Missing recipient"),
});

function truncatePushBody(body: string) {
  if (body.length <= PUSH_BODY_MAX_LENGTH) {
    return body;
  }

  return `${body.slice(0, PUSH_BODY_MAX_LENGTH - 3).trimEnd()}...`;
}

function resolveDisplayName(profile: { name: string | null; username: string | null } | null) {
  return profile?.name?.trim() || profile?.username?.trim() || "New message";
}

async function sendFriendMessagePush({
  body,
  createdAt,
  messageId,
  recipientId,
  senderId,
}: {
  body: string;
  createdAt: string;
  messageId: string;
  recipientId: string;
  senderId: string;
}) {
  if (recipientId === senderId) {
    return;
  }

  try {
    const adminClient = createAdminClient();
    if (!adminClient) {
      console.warn("[friend_messages] Push skipped: admin client unavailable");
      return;
    }

    const { data: senderProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("name, username")
      .eq("user_id", senderId)
      .maybeSingle();

    if (profileError) {
      console.warn("[friend_messages] Sender profile lookup failed", profileError.message);
    }

    const result = await sendPushToUser(
      adminClient,
      recipientId,
      {
        notification: {
          title: resolveDisplayName(senderProfile ?? null),
          body: truncatePushBody(body),
        },
        data: {
          type: "friend_message",
          messageId,
          senderId,
          recipientId,
          threadUserId: senderId,
          createdAt,
        },
      },
      {
        delivery: {
          kind: "friend_message",
          entityType: "friend_message",
          entityId: messageId,
          scheduledFor: createdAt,
          dedupe: true,
        },
      },
    );

    if (!result.ok) {
      console.warn("[friend_messages] Push send failed", {
        messageId,
        recipientId,
        skippedReason: result.skippedReason,
        error: result.error,
      });
    }
  } catch (error) {
    console.warn("[friend_messages] Push send failed", error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { username: string } }
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

    const parsedBody = sendMessageSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const { body, senderId, recipientId } = parsedBody.data;

    if (senderId !== user.id) {
      return NextResponse.json(
        { error: "Sender mismatch" },
        { status: 403 }
      );
    }

    const {
      data: recipientUserId,
      error: recipientLookupError,
    } = await supabase.rpc("get_profile_user_id", {
      p_username: params.username,
    });

    if (recipientLookupError) {
      console.error(
        "Error looking up recipient profile",
        recipientLookupError
      );
      return NextResponse.json(
        { error: "Failed to resolve recipient" },
        { status: 500 }
      );
    }

    if (!recipientUserId) {
      return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
    }

    if (recipientUserId !== recipientId) {
      return NextResponse.json(
        { error: "Recipient mismatch" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("friend_messages")
      .insert({
        body,
        sender_id: senderId,
        recipient_id: recipientId,
      })
      .select("id, created_at, read_at")
      .single();

    if (error) {
      console.error("Error inserting friend message", error);
      return NextResponse.json(
        { error: "Failed to send message" },
        { status: 500 }
      );
    }

    void sendFriendMessagePush({
      body,
      createdAt: data.created_at,
      messageId: data.id,
      recipientId,
      senderId,
    }).catch((error) => {
      console.warn("[friend_messages] Push send failed", error);
    });

    return NextResponse.json({
      success: true,
      message: {
        id: data.id,
        createdAt: data.created_at,
        readAt: data.read_at ?? null,
      },
    });
  } catch (error) {
    console.error("Unhandled error sending friend message", error);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    );
  }
}
