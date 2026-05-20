import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase";

const offerColumns =
  "id, offer_type, status, circle_id, offered_by_user_id, recipient_user_id, recipient_member_id, starts_at, ends_at, timezone, title, note, terms, responded_at, created_at, updated_at";

const commandBlockColumns =
  "id, offer_id, circle_id, member_id, user_id, starts_at, ends_at, timezone, status, created_at, updated_at";

const commandBlockRuleColumns =
  "id, offer_id, circle_id, member_id, user_id, mode, status, starts_on, ends_on, days_of_week, start_local, end_local, required_minutes_per_day, required_minutes_per_week, timezone, terms, created_at, updated_at";

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const localTimePattern = /^\d{2}:\d{2}$/;

const RespondOfferSchema = z.object({
  response: z.enum(["ACCEPTED", "DECLINED"]),
});

const CommandBlockRuleTermsSchema = z
  .object({
    mode: z.enum(["FIXED", "FLEXIBLE"]),
    dateStart: z.string().regex(localDatePattern, "Start date is required."),
    dateEnd: z
      .string()
      .regex(localDatePattern, "End date is required.")
      .nullable(),
    daysOfWeek: z
      .array(z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]))
      .min(1, "Select at least one day."),
    requiredMinutes: z
      .number()
      .int("Required duration must be whole minutes.")
      .positive("Required duration must be greater than 0."),
    fixedStartLocal: z
      .string()
      .regex(localTimePattern, "Start time is required.")
      .nullable(),
    fixedEndLocal: z
      .string()
      .regex(localTimePattern, "End time is required.")
      .nullable(),
  })
  .superRefine((terms, context) => {
    if (terms.dateEnd && terms.dateEnd < terms.dateStart) {
      context.addIssue({
        code: "custom",
        message: "End date must not be before start date.",
        path: ["dateEnd"],
      });
    }

    if (terms.mode !== "FIXED") {
      return;
    }

    if (!terms.fixedStartLocal || !terms.fixedEndLocal) {
      context.addIssue({
        code: "custom",
        message: "Fixed offers require a start and end time.",
        path: ["fixedStartLocal"],
      });
      return;
    }

    if (terms.fixedEndLocal <= terms.fixedStartLocal) {
      context.addIssue({
        code: "custom",
        message: "End time must be after start time.",
        path: ["fixedEndLocal"],
      });
    }
  });

type OfferRow = {
  id: string;
  offer_type: string;
  status: string;
  circle_id: string;
  recipient_user_id: string;
  recipient_member_id: string;
  starts_at: string;
  ends_at: string;
  timezone: string | null;
  terms: unknown;
};

type RespondOfferParams = {
  params: Promise<{
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

export async function POST(request: Request, context: RespondOfferParams) {
  const { offerId } = await context.params;
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

  const body = await request.json().catch(() => ({}));
  const parsed = RespondOfferSchema.safeParse(body ?? {});

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid response." },
      { status: 400 }
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
    .limit(1)
    .maybeSingle<OfferRow>();

  if (offerError) {
    console.error("Failed to load offer", offerError);
    return NextResponse.json(
      { error: "Unable to load offer." },
      { status: 500 }
    );
  }

  if (!offer) {
    return NextResponse.json({ error: "Offer not found." }, { status: 404 });
  }

  if (offer.offer_type !== "COMMAND_BLOCK") {
    return NextResponse.json(
      { error: "Unsupported offer type." },
      { status: 400 }
    );
  }

  if (offer.recipient_user_id !== user.id) {
    return NextResponse.json(
      { error: "Not authorized to respond to this offer." },
      { status: 403 }
    );
  }

  if (offer.status !== "PENDING") {
    return NextResponse.json(
      { error: "Offer already handled." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  if (parsed.data.response === "DECLINED") {
    const { data: updatedOffer, error: updateError } = await admin
      .from("offers")
      .update({
        status: "DECLINED",
        responded_at: now,
        updated_at: now,
      })
      .eq("id", offer.id)
      .eq("status", "PENDING")
      .select(offerColumns)
      .maybeSingle();

    if (updateError) {
      console.error("Failed to decline offer", updateError);
      return NextResponse.json(
        { error: "Unable to respond to offer." },
        { status: 500 }
      );
    }

    if (!updatedOffer) {
      return NextResponse.json(
        { error: "Offer already handled." },
        { status: 400 }
      );
    }

    return NextResponse.json({ offer: updatedOffer }, { status: 200 });
  }

  const parsedTerms = CommandBlockRuleTermsSchema.safeParse(offer.terms);

  if (!parsedTerms.success) {
    return NextResponse.json(
      {
        error:
          parsedTerms.error.issues[0]?.message ??
          "Offer terms are invalid for command block acceptance.",
      },
      { status: 400 }
    );
  }

  if (parsedTerms.data.mode === "FLEXIBLE") {
    return NextResponse.json(
      { error: "Flexible offer acceptance is not ready yet." },
      { status: 400 }
    );
  }

  const fixedTerms = parsedTerms.data;

  const { data: updatedOffer, error: updateError } = await admin
    .from("offers")
    .update({
      status: "ACCEPTED",
      responded_at: now,
      updated_at: now,
    })
    .eq("id", offer.id)
    .eq("status", "PENDING")
    .select(offerColumns)
    .maybeSingle();

  if (updateError) {
    console.error("Failed to accept offer", updateError);
    return NextResponse.json(
      { error: "Unable to respond to offer." },
      { status: 500 }
    );
  }

  if (!updatedOffer) {
    return NextResponse.json(
      { error: "Offer already handled." },
      { status: 400 }
    );
  }

  const { data: commandBlockRule, error: commandBlockRuleError } = await admin
    .from("command_block_rules")
    .insert({
      offer_id: offer.id,
      circle_id: offer.circle_id,
      member_id: offer.recipient_member_id,
      user_id: offer.recipient_user_id,
      mode: "FIXED",
      status: "ACTIVE",
      starts_on: fixedTerms.dateStart,
      ends_on: fixedTerms.dateEnd,
      days_of_week: fixedTerms.daysOfWeek,
      start_local: fixedTerms.fixedStartLocal,
      end_local: fixedTerms.fixedEndLocal,
      required_minutes_per_day: fixedTerms.requiredMinutes,
      required_minutes_per_week: null,
      timezone: offer.timezone,
      terms: offer.terms,
    })
    .select(commandBlockRuleColumns)
    .single();

  if (commandBlockRuleError) {
    console.error(
      "Failed to create command block rule from offer",
      commandBlockRuleError
    );
    return NextResponse.json(
      { error: "Offer accepted, but unable to create command block rule." },
      { status: 500 }
    );
  }

  // TODO: Move schedule rendering to command_block_rules, then remove this
  // one-off command_blocks compatibility insert.
  const { data: commandBlock, error: commandBlockError } = await admin
    .from("command_blocks")
    .insert({
      offer_id: offer.id,
      circle_id: offer.circle_id,
      member_id: offer.recipient_member_id,
      user_id: offer.recipient_user_id,
      starts_at: offer.starts_at,
      ends_at: offer.ends_at,
      timezone: offer.timezone,
      status: "ACTIVE",
    })
    .select(commandBlockColumns)
    .single();

  if (commandBlockError) {
    console.error("Failed to create command block from offer", commandBlockError);
    return NextResponse.json(
      { error: "Offer accepted, but unable to create command block." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { offer: updatedOffer, commandBlockRule, commandBlock },
    { status: 200 }
  );
}
