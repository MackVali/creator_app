import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { userHasAppManagerAccess } from "@/lib/auth/userRoles";
import { getSupabaseServer } from "@/lib/supabase";

const circleColumns = "id";

const memberColumns =
  "id, circle_id, user_id, role, status, invited_by_user_id, created_at, updated_at";

const profileColumns = "user_id, username, name, avatar_url";

const allowedRoles = new Set(["MEMBER", "OPERATOR", "MANAGER", "VIEWER"]);

type CircleRow = {
  id: string;
};

type CircleMemberRole = "MEMBER" | "OPERATOR" | "MANAGER" | "VIEWER";

type CircleMemberRow = {
  id: string;
  circle_id: string;
  user_id: string;
  role: string;
  status: string;
  invited_by_user_id: string | null;
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

    return NextResponse.json(
      {
        member: {
          ...updatedMember,
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

  return NextResponse.json(
    {
      member: {
        ...member,
        profile: targetProfile,
      },
    },
    { status: 201 }
  );
}
