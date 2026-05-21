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

const allowedOfferManagerRoles = new Set(["OWNER", "MANAGER", "OPERATOR"]);

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

type RequesterMemberRow = {
  id: string;
  role: string;
};

type OfferRow = {
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
};

type CancelMemberOfferParams = {
  params: Promise<{
    circleId: string;
    memberId: string;
    offerId: string;
  }>;
};

async function getServerClient() {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer(
    cookieStore as unknown as Parameters<typeof getSupabaseServer>[0]
  );

  return supabase ? (supabase as unknown as SupabaseClient) : null;
}

export async function POST(_request: Request, context: CancelMemberOfferParams) {
  const { circleId, memberId, offerId } = await context.params;
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
    console.error("Failed to verify offer cancellation circle", circleError);
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
    console.error("Failed to load offer cancellation member", memberError);
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
  let requesterCanManageOffers = requesterIsOwner;

  if (!requesterCanManageOffers) {
    const { data: requesterMember, error: requesterMemberError } =
      await supabase
        .from("circle_members")
        .select("id, role")
        .eq("circle_id", circleId)
        .eq("user_id", user.id)
        .eq("status", "ACTIVE")
        .limit(1)
        .maybeSingle<RequesterMemberRow>();

    if (requesterMemberError) {
      console.error(
        "Failed to verify offer cancellation requester membership",
        requesterMemberError
      );
      return NextResponse.json(
        { error: "Unable to verify circle access." },
        { status: 500 }
      );
    }

    requesterCanManageOffers =
      !!requesterMember &&
      allowedOfferManagerRoles.has(requesterMember.role.trim().toUpperCase());
  }

  if (!requesterCanManageOffers) {
    return NextResponse.json(
      { error: "Not authorized to cancel offers for this Circle." },
      { status: 403 }
    );
  }

  const admin = createAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Offer service is not configured." },
      { status: 503 }
    );
  }

  const { data: offer, error: offerError } = await admin
    .from("offers")
    .select(offerColumns)
    .eq("id", offerId)
    .eq("circle_id", circleId)
    .eq("recipient_member_id", member.id)
    .eq("offer_type", "COMMAND_BLOCK")
    .eq("status", "PENDING")
    .limit(1)
    .maybeSingle<OfferRow>();

  if (offerError) {
    console.error("Failed to load pending offer for cancellation", offerError);
    return NextResponse.json(
      { error: "Unable to load pending offer." },
      { status: 500 }
    );
  }

  if (!offer) {
    return NextResponse.json(
      { error: "Pending Command Block offer not found." },
      { status: 404 }
    );
  }

  const { data: updatedOffer, error: updateError } = await admin
    .from("offers")
    .update({
      status: "CANCELLED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", offer.id)
    .eq("circle_id", circleId)
    .eq("recipient_member_id", member.id)
    .eq("offer_type", "COMMAND_BLOCK")
    .eq("status", "PENDING")
    .select(offerColumns)
    .maybeSingle<OfferRow>();

  if (updateError) {
    console.error("Failed to cancel pending offer", updateError);
    return NextResponse.json(
      { error: "Unable to cancel pending offer." },
      { status: 500 }
    );
  }

  if (!updatedOffer) {
    return NextResponse.json(
      { error: "Pending Command Block offer not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, offer: updatedOffer }, { status: 200 });
}
