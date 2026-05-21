import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase";

const offerColumns =
  "id, offer_type, status, circle_id, offered_by_user_id, recipient_user_id, recipient_member_id, starts_at, ends_at, timezone, title, note, terms, responded_at, created_at, updated_at";

const allowedOfferCreatorRoles = new Set(["OWNER", "MANAGER", "OPERATOR"]);
const allowedRecipientStatuses = new Set(["ACTIVE", "INVITED", "ACCEPTED"]);
const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const localTimePattern = /^\d{2}:\d{2}$/;
const weekdayToJsDay = {
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
  SUN: 0,
} as const;

type CommandBlockWeekday = keyof typeof weekdayToJsDay;

function parseLocalDateInput(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  const date = new Date(year, month - 1, day, 0, 0, 0, 0);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function hasWeekdayInDateRange(
  startDate: Date,
  endDate: Date,
  daysOfWeek: CommandBlockWeekday[]
) {
  const selectedDays = new Set(daysOfWeek.map((day) => weekdayToJsDay[day]));
  const current = new Date(startDate);
  const searchEnd = new Date(startDate);
  searchEnd.setDate(searchEnd.getDate() + 6);

  if (endDate.getTime() < searchEnd.getTime()) {
    searchEnd.setTime(endDate.getTime());
  }

  while (current.getTime() <= searchEnd.getTime()) {
    if (selectedDays.has(current.getDay())) {
      return true;
    }

    current.setDate(current.getDate() + 1);
  }

  return false;
}

const CommandBlockTermsSchema = z
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
    const startDate = parseLocalDateInput(terms.dateStart);
    const endDate = terms.dateEnd
      ? parseLocalDateInput(terms.dateEnd)
      : null;

    if (!startDate) {
      context.addIssue({
        code: "custom",
        message: "Start date is required.",
        path: ["dateStart"],
      });
    }

    if (terms.dateEnd && !endDate) {
      context.addIssue({
        code: "custom",
        message: "End date is required.",
        path: ["dateEnd"],
      });
    }

    if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
      context.addIssue({
        code: "custom",
        message: "End date must not be before start date.",
        path: ["dateEnd"],
      });
    }

    if (
      startDate &&
      endDate &&
      endDate.getTime() >= startDate.getTime() &&
      !hasWeekdayInDateRange(startDate, endDate, terms.daysOfWeek)
    ) {
      context.addIssue({
        code: "custom",
        message: "Select a day that occurs during the offer length.",
        path: ["daysOfWeek"],
      });
    }

    if (terms.mode === "FIXED") {
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
    }
  });

const CreateOfferSchema = z.object({
  offer_type: z.literal("COMMAND_BLOCK"),
  circleId: z.string().trim().min(1, "Circle is required."),
  recipientMemberId: z.string().trim().min(1, "Recipient member is required."),
  recipientUserId: z.string().trim().min(1, "Recipient user is required."),
  startsAt: z.string().trim().optional().nullable(),
  endsAt: z.string().trim().optional().nullable(),
  timezone: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  terms: CommandBlockTermsSchema,
});

type CircleRow = {
  id: string;
  owner_user_id: string;
  status: string;
};

type CircleMemberRow = {
  id: string;
  circle_id: string;
  user_id: string;
  role: string;
  status: string;
};

type OfferRow = {
  id: string;
  offer_type: string;
  status: string;
  circle_id: string;
  offered_by_user_id: string;
  recipient_user_id: string;
  recipient_member_id: string;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string | null;
  title: string | null;
  note: string | null;
  terms: unknown;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
};

type CircleNameRow = {
  id: string;
  name: string;
};

type ProfileRow = {
  user_id: string;
  username: string | null;
  name: string | null;
};

async function getServerClient() {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer(
    cookieStore as unknown as Parameters<typeof getSupabaseServer>[0]
  );

  return supabase ? (supabase as unknown as SupabaseClient) : null;
}

function parseDateTime(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function optionalText(value: string | null | undefined) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET() {
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
    .eq("recipient_user_id", user.id)
    .eq("status", "PENDING")
    .order("created_at", { ascending: false })
    .returns<OfferRow[]>();

  if (offersError) {
    console.error("Failed to load pending offers", offersError);
    return NextResponse.json(
      { error: "Unable to load offers." },
      { status: 500 }
    );
  }

  const pendingOffers = offers ?? [];
  const circleIds = Array.from(
    new Set(pendingOffers.map((offer) => offer.circle_id).filter(Boolean))
  );
  const offeredByUserIds = Array.from(
    new Set(
      pendingOffers
        .map((offer) => offer.offered_by_user_id)
        .filter(Boolean)
    )
  );

  const circleNameById = new Map<string, string>();
  const profileByUserId = new Map<string, ProfileRow>();

  if (circleIds.length > 0) {
    const { data: circles, error: circlesError } = await admin
      .from("circles")
      .select("id, name")
      .in("id", circleIds)
      .returns<CircleNameRow[]>();

    if (circlesError) {
      console.error("Failed to load offer circles", circlesError);
    } else {
      for (const circle of circles ?? []) {
        circleNameById.set(circle.id, circle.name);
      }
    }
  }

  if (offeredByUserIds.length > 0) {
    const { data: profiles, error: profilesError } = await admin
      .schema("public")
      .from("profiles")
      .select("user_id, username, name")
      .in("user_id", offeredByUserIds)
      .returns<ProfileRow[]>();

    if (profilesError) {
      console.error("Failed to load offer sender profiles", profilesError);
    } else {
      for (const profile of profiles ?? []) {
        profileByUserId.set(profile.user_id, profile);
      }
    }
  }

  return NextResponse.json(
    {
      offers: pendingOffers.map((offer) => ({
        ...offer,
        circle_name: circleNameById.get(offer.circle_id) ?? null,
        offered_by_profile:
          profileByUserId.get(offer.offered_by_user_id) ?? null,
      })),
    },
    { status: 200 }
  );
}

export async function POST(request: Request) {
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
  const parsed = CreateOfferSchema.safeParse(body ?? {});

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid offer payload." },
      { status: 400 }
    );
  }

  const startsAt = parseDateTime(parsed.data.startsAt);
  const endsAt = parseDateTime(parsed.data.endsAt);

  if (parsed.data.terms.mode === "FIXED" && (!startsAt || !endsAt)) {
    return NextResponse.json(
      { error: "Fixed offers require valid start and end datetimes." },
      { status: 400 }
    );
  }

  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    return NextResponse.json(
      { error: "End time must be after start time." },
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

  const { data: circle, error: circleError } = await admin
    .from("circles")
    .select("id, owner_user_id, status")
    .eq("id", parsed.data.circleId)
    .eq("status", "ACTIVE")
    .limit(1)
    .maybeSingle<CircleRow>();

  if (circleError) {
    console.error("Failed to load circle for offer", circleError);
    return NextResponse.json(
      { error: "Unable to verify circle." },
      { status: 500 }
    );
  }

  if (!circle) {
    return NextResponse.json({ error: "Circle not found." }, { status: 404 });
  }

  let canCreateOffer = circle.owner_user_id === user.id;

  if (!canCreateOffer) {
    const { data: creatorMember, error: creatorMemberError } = await admin
      .from("circle_members")
      .select("id, circle_id, user_id, role, status")
      .eq("circle_id", circle.id)
      .eq("user_id", user.id)
      .eq("status", "ACTIVE")
      .limit(1)
      .maybeSingle<CircleMemberRow>();

    if (creatorMemberError) {
      console.error("Failed to verify offer creator membership", creatorMemberError);
      return NextResponse.json(
        { error: "Unable to verify circle access." },
        { status: 500 }
      );
    }

    canCreateOffer =
      !!creatorMember &&
      allowedOfferCreatorRoles.has(creatorMember.role.trim().toUpperCase());
  }

  if (!canCreateOffer) {
    return NextResponse.json(
      { error: "Not authorized to create offers for this Circle." },
      { status: 403 }
    );
  }

  const { data: recipientMember, error: recipientMemberError } = await admin
    .from("circle_members")
    .select("id, circle_id, user_id, role, status")
    .eq("id", parsed.data.recipientMemberId)
    .eq("circle_id", circle.id)
    .limit(1)
    .maybeSingle<CircleMemberRow>();

  if (recipientMemberError) {
    console.error("Failed to load recipient circle member", recipientMemberError);
    return NextResponse.json(
      { error: "Unable to verify recipient member." },
      { status: 500 }
    );
  }

  if (!recipientMember) {
    return NextResponse.json(
      { error: "Recipient member not found." },
      { status: 404 }
    );
  }

  if (!allowedRecipientStatuses.has(recipientMember.status.trim().toUpperCase())) {
    return NextResponse.json(
      { error: "Recipient member is not eligible for offers." },
      { status: 403 }
    );
  }

  if (recipientMember.user_id !== parsed.data.recipientUserId) {
    return NextResponse.json(
      { error: "Recipient user does not match recipient member." },
      { status: 400 }
    );
  }

  const { data: offer, error: offerError } = await admin
    .from("offers")
    .insert({
      offer_type: "COMMAND_BLOCK",
      status: "PENDING",
      circle_id: circle.id,
      offered_by_user_id: user.id,
      recipient_user_id: parsed.data.recipientUserId,
      recipient_member_id: recipientMember.id,
      starts_at: startsAt?.toISOString() ?? null,
      ends_at: endsAt?.toISOString() ?? null,
      timezone: optionalText(parsed.data.timezone),
      title: optionalText(parsed.data.title),
      note: optionalText(parsed.data.note),
      terms: parsed.data.terms,
    })
    .select(offerColumns)
    .single();

  if (offerError) {
    console.error("Failed to create command block offer", offerError);
    return NextResponse.json(
      { error: "Unable to create offer." },
      { status: 500 }
    );
  }

  return NextResponse.json({ offer }, { status: 201 });
}
