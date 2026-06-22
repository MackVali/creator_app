import { cookies } from "next/headers";
import { after, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { sendPushToUser } from "@/lib/notifications/sendPush";
import { getSupabaseServer } from "@/lib/supabase";
import { createAdminClient } from "@/lib/supabase/admin";

const circleColumns = "id, name, circle_type";

const memberColumns =
  "id, circle_id, user_id, role, status, invited_by_user_id, skill_constraint_ids, location_context_ids, created_at, updated_at";

const profileColumns = "name, username";

type CircleRow = {
  id: string;
  name: string | null;
  circle_type: string | null;
};

type CircleMemberRow = {
  id: string;
  circle_id: string;
  user_id: string;
  role: string;
  status: string;
  invited_by_user_id: string | null;
  skill_constraint_ids: string[] | null;
  location_context_ids: string[] | null;
  created_at: string;
  updated_at: string;
};

type ProfileRow = {
  name: string | null;
  username: string | null;
};

type RespondInviteBody = {
  action?: unknown;
};

type RespondInviteParams = {
  params: Promise<{
    inviteId: string;
  }>;
};

type CircleInviteResponsePushParams = {
  memberId: string;
  circleId: string;
  invitedUserId: string;
  invitedByUserId: string | null;
  action: "accept" | "decline";
  timestamp: string;
};

async function getServerClient() {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer(
    cookieStore as unknown as Parameters<typeof getSupabaseServer>[0]
  );

  return supabase ? (supabase as unknown as SupabaseClient) : null;
}

function normalizeAction(value: unknown) {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();

  return normalized === "accept" || normalized === "decline"
    ? normalized
    : null;
}

async function sendCircleInviteResponsePush({
  memberId,
  circleId,
  invitedUserId,
  invitedByUserId,
  action,
  timestamp,
}: CircleInviteResponsePushParams) {
  if (!invitedByUserId || invitedByUserId === invitedUserId) {
    return;
  }

  const adminClient = createAdminClient();

  if (!adminClient) {
    console.warn("Circle invite response push skipped: admin client unavailable", {
      memberId,
    });
    return;
  }

  const [{ data: circle, error: circleError }, { data: profile, error: profileError }] =
    await Promise.all([
      adminClient
        .from("circles")
        .select(circleColumns)
        .eq("id", circleId)
        .limit(1)
        .maybeSingle<CircleRow>(),
      adminClient
        .from("profiles")
        .select(profileColumns)
        .eq("user_id", invitedUserId)
        .limit(1)
        .maybeSingle<ProfileRow>(),
    ]);

  if (circleError) {
    console.warn("Circle invite response push circle load failed", {
      memberId,
      error: circleError.message,
    });
  }

  if (profileError) {
    console.warn("Circle invite response push profile load failed", {
      memberId,
      error: profileError.message,
    });
  }

  const circleName = circle?.name?.trim() || null;
  const displayName =
    profile?.name?.trim() || profile?.username?.trim() || "Someone";
  const kind =
    action === "accept"
      ? "circle_invite_accepted"
      : "circle_invite_declined";
  const body =
    action === "accept"
      ? circleName
        ? `${displayName} joined ${circleName}.`
        : `${displayName} accepted your Circle invite.`
      : circleName
        ? `${displayName} declined the invite to ${circleName}.`
        : `${displayName} declined your Circle invite.`;

  const result = await sendPushToUser(
    adminClient,
    invitedByUserId,
    {
      notification: {
        title:
          action === "accept"
            ? "Circle invite accepted"
            : "Circle invite declined",
        body,
      },
      data: {
        type: kind,
        memberId,
        circleId,
        invitedUserId,
        invitedByUserId,
        circleName,
        circleType: circle?.circle_type ?? null,
      },
    },
    {
      delivery: {
        kind,
        entityType: "circle_member",
        entityId: memberId,
        scheduledFor: timestamp,
        dedupe: true,
      },
    },
  );

  if (!result.ok) {
    console.warn("Circle invite response push send incomplete", {
      memberId,
      skippedReason: result.skippedReason,
      error: result.error,
    });
  }
}

export async function POST(
  request: Request,
  context: RespondInviteParams
) {
  const { inviteId } = await context.params;
  const supabase = await getServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as RespondInviteBody;
  const action = normalizeAction(body.action);

  if (!action) {
    return NextResponse.json(
      { error: "Invalid action." },
      { status: 400 }
    );
  }

  const { data: invite, error: inviteError } = await supabase
    .schema("public")
    .from("circle_members")
    .select(memberColumns)
    .eq("id", inviteId)
    .eq("user_id", user.id)
    .eq("status", "INVITED")
    .limit(1)
    .maybeSingle<CircleMemberRow>();

  if (inviteError) {
    console.error("Failed to load circle invite", inviteError);
    return NextResponse.json(
      { error: "Unable to respond to invite." },
      { status: 500 }
    );
  }

  if (!invite) {
    return NextResponse.json(
      { error: "Invite not found." },
      { status: 404 }
    );
  }

  const nextStatus = action === "accept" ? "ACTIVE" : "REMOVED";
  const { data: updatedInvite, error: updateError } = await supabase
    .schema("public")
    .from("circle_members")
    .update({
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invite.id)
    .eq("user_id", user.id)
    .eq("status", "INVITED")
    .select(memberColumns)
    .single<CircleMemberRow>();

  if (updateError) {
    console.error("Failed to respond to circle invite", updateError);
    return NextResponse.json(
      { error: "Unable to respond to invite." },
      { status: 500 }
    );
  }

  after(() => {
    void sendCircleInviteResponsePush({
      memberId: updatedInvite.id,
      circleId: updatedInvite.circle_id,
      invitedUserId: updatedInvite.user_id,
      invitedByUserId: updatedInvite.invited_by_user_id,
      action,
      timestamp: updatedInvite.updated_at ?? new Date().toISOString(),
    }).catch((error) => {
      console.warn("Circle invite response push failed", {
        memberId: updatedInvite.id,
        error: error instanceof Error ? error.message : "Unknown push error",
      });
    });
  });

  return NextResponse.json({ invite: updatedInvite }, { status: 200 });
}
