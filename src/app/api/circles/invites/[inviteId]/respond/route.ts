import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServer } from "@/lib/supabase";

const memberColumns =
  "id, circle_id, user_id, role, status, invited_by_user_id, skill_constraint_ids, location_context_ids, created_at, updated_at";

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

type RespondInviteBody = {
  action?: unknown;
};

type RespondInviteParams = {
  params: Promise<{
    inviteId: string;
  }>;
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

  return NextResponse.json({ invite: updatedInvite }, { status: 200 });
}
