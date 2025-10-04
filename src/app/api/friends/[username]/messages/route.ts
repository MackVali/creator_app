import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase-server";

const sendMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Message body is required")
    .max(2000, "Message is too long"),
  senderId: z.string().min(1, "Missing sender"),
  recipientId: z.string().min(1, "Missing recipient"),
});

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
      .select("id, created_at")
      .single();

    if (error) {
      console.error("Error inserting friend message", error);
      return NextResponse.json(
        { error: "Failed to send message" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: {
        id: data.id,
        createdAt: data.created_at,
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
