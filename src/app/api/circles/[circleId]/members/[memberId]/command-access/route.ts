import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { userHasAppManagerAccess } from "@/lib/auth/userRoles";
import { getSupabaseServer } from "@/lib/supabase";
import { createAdminClient } from "@/lib/supabase/admin";

const circleColumns = "id, owner_user_id, status";

const memberColumns = "id, circle_id, user_id, status";

const commandAccessColumns =
  "id, mode, starts_on, ends_on, days_of_week, start_local, end_local, required_minutes_per_day, required_minutes_per_week, timezone";

type CircleRow = {
  id: string;
  owner_user_id: string;
  status: string;
};

type CircleMemberRow = {
  id: string;
  circle_id: string;
  user_id: string;
  status: string;
};

type CommandAccessRow = {
  id: string;
  mode: string;
  starts_on: string | null;
  ends_on: string | null;
  days_of_week: string[] | null;
  start_local: string | null;
  end_local: string | null;
  required_minutes_per_day: number | null;
  required_minutes_per_week: number | null;
  timezone: string | null;
};

type CommandAccessParams = {
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

export async function GET(_request: Request, context: CommandAccessParams) {
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

  const { data: circle, error: circleError } = await supabase
    .from("circles")
    .select(circleColumns)
    .eq("id", circleId)
    .eq("status", "ACTIVE")
    .limit(1)
    .maybeSingle<CircleRow>();

  if (circleError) {
    console.error("Failed to verify command access circle", circleError);
    return NextResponse.json(
      { error: "Unable to verify circle access." },
      { status: 500 }
    );
  }

  if (!circle) {
    return NextResponse.json(
      { error: "Circle not found." },
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
    console.error("Failed to load command access member", memberError);
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

  const requesterIsOwner = circle.owner_user_id === user.id;
  let requesterIsActiveMember = false;

  if (!requesterIsOwner) {
    const { data: requesterMember, error: requesterMemberError } =
      await supabase
        .from("circle_members")
        .select("id")
        .eq("circle_id", circleId)
        .eq("user_id", user.id)
        .eq("status", "ACTIVE")
        .limit(1)
        .maybeSingle<{ id: string }>();

    if (requesterMemberError) {
      console.error(
        "Failed to verify command access requester membership",
        requesterMemberError
      );
      return NextResponse.json(
        { error: "Unable to verify circle access." },
        { status: 500 }
      );
    }

    requesterIsActiveMember = Boolean(requesterMember);
  }

  if (!requesterIsOwner && !requesterIsActiveMember) {
    return NextResponse.json(
      { error: "Circle not found or access denied." },
      { status: 404 }
    );
  }

  const admin = createAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Command access service is not configured." },
      { status: 503 }
    );
  }

  const { data: commandAccess, error: commandAccessError } = await admin
    .from("command_block_rules")
    .select(commandAccessColumns)
    .eq("circle_id", circleId)
    .eq("member_id", member.id)
    .eq("status", "ACTIVE")
    .order("starts_on", { ascending: true })
    .limit(100)
    .returns<CommandAccessRow[]>();

  if (commandAccessError) {
    console.error("Failed to load command access", commandAccessError);
    return NextResponse.json(
      { error: "Unable to load command access." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { commandAccess: commandAccess ?? [] },
    { status: 200 }
  );
}
