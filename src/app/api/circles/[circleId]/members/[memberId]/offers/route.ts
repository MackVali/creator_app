import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { userHasAppManagerAccess } from "@/lib/auth/userRoles";
import { getSupabaseServer } from "@/lib/supabase";
import { createAdminClient } from "@/lib/supabase/admin";

const circleColumns = "id, owner_user_id, status";

const memberColumns = "id, circle_id, user_id, status";

const offerColumns =
  "id, offer_type, status, title, note, starts_at, ends_at, timezone, terms, created_at, updated_at";

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

type MemberOffersParams = {
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

export async function GET(_request: Request, context: MemberOffersParams) {
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
    console.error("Failed to verify member offers circle", circleError);
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
    console.error("Failed to load member offers member", memberError);
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
        "Failed to verify member offers requester membership",
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
      { error: "Offer service is not configured." },
      { status: 503 }
    );
  }

  const { data: offers, error: offersError } = await admin
    .from("offers")
    .select(offerColumns)
    .eq("circle_id", circleId)
    .eq("recipient_member_id", member.id)
    .eq("status", "PENDING")
    .eq("offer_type", "COMMAND_BLOCK")
    .order("created_at", { ascending: false })
    .returns<
      {
        id: string;
        offer_type: string;
        status: string;
        title: string | null;
        note: string | null;
        starts_at: string | null;
        ends_at: string | null;
        timezone: string | null;
        terms: unknown;
        created_at: string;
        updated_at: string;
      }[]
    >();

  if (offersError) {
    console.error("Failed to load member pending offers", offersError);
    return NextResponse.json(
      { error: "Unable to load pending offers." },
      { status: 500 }
    );
  }

  return NextResponse.json({ offers: offers ?? [] }, { status: 200 });
}
