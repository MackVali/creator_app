import { cookies } from "next/headers";
import { after, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { userHasAppManagerAccess } from "@/lib/auth/userRoles";
import { sendPushToUser } from "@/lib/notifications/sendPush";
import { getSupabaseServer } from "@/lib/supabase";
import { createAdminClient } from "@/lib/supabase/admin";

const circleColumns = "id, name, circle_type";

const memberColumns =
  "id, circle_id, user_id, role, status, invited_by_user_id, skill_constraint_ids, location_context_ids, created_at, updated_at";

const profileColumns = "user_id, username, name, avatar_url";

const allowedRoles = new Set(["MEMBER", "OPERATOR", "MANAGER", "VIEWER"]);

type CircleRow = {
  id: string;
  name: string | null;
  circle_type: string | null;
};

type CircleMemberRole = "MEMBER" | "OPERATOR" | "MANAGER" | "VIEWER";

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
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
};

type AddCircleMemberBody = {
  username?: unknown;
  role?: unknown;
};

type CircleMemberParams = {
  params: Promise<{
    circleId: string;
  }>;
};

type CircleInvitePushParams = {
  memberId: string;
  circleId: string;
  circleName: string | null;
  circleType: string | null;
  invitedUserId: string;
  invitedByUserId: string;
  role: string;
  timestamp: string;
};

async function getServerClient() {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer(
    cookieStore as unknown as Parameters<typeof getSupabaseServer>[0]
  );

  return supabase ? (supabase as unknown as SupabaseClient) : null;
}

function normalizeUsername(value: unknown) {
  if (typeof value !== "string") return "";

  const trimmed = value.trim();
  const withoutAt = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;

  return withoutAt.trim().toLowerCase();
}

function normalizeRole(value: unknown): CircleMemberRole | null {
  if (value === undefined || value === null) return "MEMBER";
  if (typeof value !== "string") return null;

  const normalized = value.trim().toUpperCase();

  return allowedRoles.has(normalized)
    ? (normalized as CircleMemberRole)
    : null;
}

async function sendCircleInvitePush({
  memberId,
  circleId,
  circleName,
  circleType,
  invitedUserId,
  invitedByUserId,
  role,
  timestamp,
}: CircleInvitePushParams) {
  if (invitedUserId === invitedByUserId) {
    return;
  }

  try {
    const adminClient = createAdminClient();

    if (!adminClient) {
      console.warn("Circle invite push skipped: admin client unavailable", {
        memberId,
      });
      return;
    }

    const trimmedCircleName = circleName?.trim() || null;
    const result = await sendPushToUser(
      adminClient,
      invitedUserId,
      {
        notification: {
          title: "Circle invite",
          body: trimmedCircleName
            ? `You were invited to ${trimmedCircleName}.`
            : "You have a new Circle invite.",
        },
        data: {
          type: "circle_invite",
          memberId,
          circleId,
          circleName: trimmedCircleName,
          circleType,
          role,
          invitedByUserId,
        },
      },
      {
        delivery: {
          kind: "circle_invite",
          entityType: "circle_member",
          entityId: memberId,
          scheduledFor: timestamp,
          dedupe: true,
        },
      },
    );

    if (!result.ok) {
      console.warn("Circle invite push send incomplete", {
        memberId,
        skippedReason: result.skippedReason,
        error: result.error,
      });
    }
  } catch (error) {
    console.warn("Circle invite push failed", {
      memberId,
      error: error instanceof Error ? error.message : "Unknown push error",
    });
  }
}

export async function POST(
  request: Request,
  context: CircleMemberParams
) {
  const { circleId } = await context.params;
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

  if (!userHasAppManagerAccess(user)) {
    return NextResponse.json(
      { error: "Circle not found or access denied." },
      { status: 404 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as AddCircleMemberBody;
  const username = normalizeUsername(body.username);

  if (!username) {
    return NextResponse.json(
      { error: "Username is required." },
      { status: 400 }
    );
  }

  const role = normalizeRole(body.role);

  if (!role) {
    return NextResponse.json(
      { error: "Invalid role." },
      { status: 400 }
    );
  }

  const { data: circle, error: circleError } = await supabase
    .from("circles")
    .select(circleColumns)
    .eq("id", circleId)
    .eq("owner_user_id", user.id)
    .limit(1)
    .maybeSingle<CircleRow>();

  if (circleError) {
    console.error("Failed to verify circle ownership", circleError);
    return NextResponse.json(
      { error: "Unable to verify circle access." },
      { status: 500 }
    );
  }

  if (!circle) {
    return NextResponse.json(
      { error: "Circle not found or access denied." },
      { status: 404 }
    );
  }

  const { data: profiles, error: profileError } = await supabase
    .schema("public")
    .from("profiles")
    .select(profileColumns)
    .ilike("username", username)
    .limit(10)
    .returns<ProfileRow[]>();

  if (profileError) {
    console.error("Failed to find circle member profile", profileError);
    return NextResponse.json(
      { error: "Unable to find user." },
      { status: 500 }
    );
  }

  const targetProfile =
    profiles?.find(
      (profile) => profile.username?.toLowerCase() === username
    ) ?? null;

  if (!targetProfile) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (targetProfile.user_id === user.id) {
    return NextResponse.json(
      { error: "You are already the owner of this circle." },
      { status: 400 }
    );
  }

  const { data: existingMember, error: existingMemberError } = await supabase
    .from("circle_members")
    .select(memberColumns)
    .eq("circle_id", circleId)
    .eq("user_id", targetProfile.user_id)
    .limit(1)
    .maybeSingle<CircleMemberRow>();

  if (existingMemberError) {
    console.error("Failed to check existing circle member", existingMemberError);
    return NextResponse.json(
      { error: "Unable to check circle membership." },
      { status: 500 }
    );
  }

  if (existingMember?.status === "ACTIVE") {
    return NextResponse.json(
      { error: "This person is already active in this Circle." },
      { status: 409 }
    );
  }

  if (existingMember?.status === "INVITED") {
    return NextResponse.json(
      { error: "This person already has a pending Circle invite." },
      { status: 409 }
    );
  }

  if (existingMember?.status === "BLOCKED") {
    return NextResponse.json(
      { error: "This person cannot be invited right now." },
      { status: 403 }
    );
  }

  if (existingMember?.status === "REMOVED") {
    const { data: updatedMember, error: updateError } = await supabase
      .from("circle_members")
      .update({
        role,
        status: "INVITED",
        invited_by_user_id: user.id,
        skill_constraint_ids: [],
        location_context_ids: [],
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingMember.id)
      .eq("circle_id", circleId)
      .eq("user_id", targetProfile.user_id)
      .eq("status", "REMOVED")
      .select(memberColumns)
      .maybeSingle<CircleMemberRow>();

    if (updateError) {
      console.error("Failed to re-invite circle member", updateError);
      return NextResponse.json(
        { error: "Unable to send invite." },
        { status: 500 }
      );
    }

    if (!updatedMember) {
      return NextResponse.json(
        { error: "This person can no longer be invited right now." },
        { status: 409 }
      );
    }

    after(() => {
      void sendCircleInvitePush({
        memberId: updatedMember.id,
        circleId: updatedMember.circle_id,
        circleName: circle.name,
        circleType: circle.circle_type,
        invitedUserId: updatedMember.user_id,
        invitedByUserId: user.id,
        role: updatedMember.role,
        timestamp: updatedMember.updated_at ?? updatedMember.created_at,
      }).catch((error) => {
        console.warn("Circle invite push failed", {
          memberId: updatedMember.id,
          error: error instanceof Error ? error.message : "Unknown push error",
        });
      });
    });

    return NextResponse.json(
      {
        member: {
          ...updatedMember,
          skill_constraint_ids: updatedMember.skill_constraint_ids ?? [],
          location_context_ids: updatedMember.location_context_ids ?? [],
          profile: targetProfile,
        },
      },
      { status: 200 }
    );
  }

  if (existingMember) {
    return NextResponse.json(
      { error: "This person cannot be invited right now." },
      { status: 409 }
    );
  }

  const { data: member, error: memberError } = await supabase
    .from("circle_members")
    .insert({
      circle_id: circleId,
      user_id: targetProfile.user_id,
      role,
      status: "INVITED",
      invited_by_user_id: user.id,
      skill_constraint_ids: [],
      location_context_ids: [],
    })
    .select(memberColumns)
    .single<CircleMemberRow>();

  if (memberError) {
    if (memberError.code === "23505") {
      return NextResponse.json(
        { error: "This person already has a Circle membership record." },
        { status: 409 }
      );
    }

    console.error("Failed to add circle member", memberError);
    return NextResponse.json(
      { error: "Unable to add circle member." },
      { status: 500 }
    );
  }

  after(() => {
    void sendCircleInvitePush({
      memberId: member.id,
      circleId: member.circle_id,
      circleName: circle.name,
      circleType: circle.circle_type,
      invitedUserId: member.user_id,
      invitedByUserId: user.id,
      role: member.role,
      timestamp: member.created_at,
    }).catch((error) => {
      console.warn("Circle invite push failed", {
        memberId: member.id,
        error: error instanceof Error ? error.message : "Unknown push error",
      });
    });
  });

  return NextResponse.json(
    {
      member: {
        ...member,
        skill_constraint_ids: member.skill_constraint_ids ?? [],
        location_context_ids: member.location_context_ids ?? [],
        profile: targetProfile,
      },
    },
    { status: 201 }
  );
}
