import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { userHasAppManagerAccess } from "@/lib/auth/userRoles";
import { getSupabaseServer } from "@/lib/supabase";

const circleColumns = "id";

const memberColumns =
  "id, circle_id, user_id, role, status, invited_by_user_id, created_at, updated_at";

type CircleRow = {
  id: string;
};

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

type UpdateCircleMemberBody = {
  action?: unknown;
};

type CircleMemberAction = "remove" | "cancel_invite";

type CircleMemberParams = {
  params: Promise<{
    circleId: string;
    memberId: string;
  }>;
};

async function getServerClient() {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer(
    cookieStore as unknown as Parameters<typeof getSupabaseServer>[0]
  );

  return supabase ? (supabase as unknown as SupabaseClient) : null;
}

function normalizeAction(value: unknown): CircleMemberAction | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();

  return normalized === "remove" || normalized === "cancel_invite"
    ? normalized
    : null;
}

export async function PATCH(request: Request, context: CircleMemberParams) {
  const { circleId, memberId } = await context.params;
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

  const body = (await request.json().catch(
    () => ({})
  )) as UpdateCircleMemberBody;
  const action = normalizeAction(body.action);

  if (!action) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
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

  const { data: member, error: memberError } = await supabase
    .from("circle_members")
    .select(memberColumns)
    .eq("id", memberId)
    .eq("circle_id", circleId)
    .limit(1)
    .maybeSingle<CircleMemberRow>();

  if (memberError) {
    console.error("Failed to load circle member", memberError);
    return NextResponse.json(
      { error: "Unable to load circle member." },
      { status: 500 }
    );
  }

  if (!member) {
    return NextResponse.json(
      { error: "Circle member not found." },
      { status: 404 }
    );
  }

  if (member.role === "OWNER") {
    return NextResponse.json(
      { error: "Circle owner cannot be removed." },
      { status: 400 }
    );
  }

  if (action === "remove" && !["ACTIVE", "INVITED"].includes(member.status)) {
    return NextResponse.json(
      { error: "Only active members or pending invites can be removed." },
      { status: 400 }
    );
  }

  if (action === "cancel_invite" && member.status !== "INVITED") {
    return NextResponse.json(
      { error: "Only pending invites can be canceled." },
      { status: 400 }
    );
  }

  let updateQuery = supabase
    .from("circle_members")
    .update({
      status: "REMOVED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", member.id)
    .eq("circle_id", circleId)
    .neq("role", "OWNER");

  updateQuery =
    action === "cancel_invite"
      ? updateQuery.eq("status", "INVITED")
      : updateQuery.in("status", ["ACTIVE", "INVITED"]);

  const { data: updatedMember, error: updateError } = await updateQuery
    .select(memberColumns)
    .maybeSingle<CircleMemberRow>();

  if (updateError) {
    console.error("Failed to update circle member", updateError);
    return NextResponse.json(
      { error: "Unable to update circle member." },
      { status: 500 }
    );
  }

  if (!updatedMember) {
    return NextResponse.json(
      { error: "Circle member can no longer be updated." },
      { status: 409 }
    );
  }

  return NextResponse.json({ member: updatedMember }, { status: 200 });
}
