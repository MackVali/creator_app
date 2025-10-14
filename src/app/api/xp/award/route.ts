import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import type { SupabaseClient } from "@supabase/supabase-js";

import { type UserEnrichmentPayload } from "@/lib/user-enrichment";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { Database } from "@/types/supabase";

type XpEventInsert = Database["public"]["Tables"]["xp_events"]["Insert"];

type AwardEvent = Omit<XpEventInsert, "award_key"> & {
  award_key: NonNullable<XpEventInsert["award_key"]>;
};

type XpKind = Database["public"]["Enums"]["xp_kind"];

const xpKindValues = ["task", "habit", "project", "goal", "manual"] as const satisfies readonly XpKind[];
const xpKindSchema = z.enum(xpKindValues);

const awardRequestSchema = z.object({
  scheduleInstanceId: z.string().min(1).optional(),
  kind: xpKindSchema,
  amount: z.number().int().optional(),
  skillIds: z.array(z.string().min(1)).optional(),
  monumentIds: z.array(z.string().min(1)).optional(),
  awardKeyBase: z.string().min(1).optional(),
  source: z.string().optional(),
});

const DEFAULT_AMOUNTS: Record<Exclude<XpKind, "manual">, number> = {
  task: 1,
  habit: 1,
  project: 3,
  goal: 5,
};

type AwardRequest = z.infer<typeof awardRequestSchema>;

type UserEnrichmentClient = SupabaseClient<Database>;

function resolveAmount(kind: XpKind, amount: AwardRequest["amount"]): number {
  if (typeof amount === "number") return amount;
  if (kind === "manual") {
    throw new Error("Manual awards require an explicit amount");
  }
  return DEFAULT_AMOUNTS[kind];
}

function buildAwardKeyBase({
  awardKeyBase,
  scheduleInstanceId,
  kind,
}: AwardRequest): string | undefined {
  if (awardKeyBase) return awardKeyBase;
  if (scheduleInstanceId) {
    return `sched:${scheduleInstanceId}:${kind}`;
  }
  return undefined;
}

function buildEvents(
  userId: string,
  request: AwardRequest,
  amount: number,
  awardKeyBase: string
): AwardEvent[] {
  const base = {
    user_id: userId,
    kind: request.kind,
    amount,
    schedule_instance_id: request.scheduleInstanceId ?? null,
    skill_id: null,
    monument_id: null,
    award_key: awardKeyBase,
    source: request.source ?? null,
  } satisfies AwardEvent;

  const events: AwardEvent[] = [];

  for (const skillId of request.skillIds ?? []) {
    events.push({
      ...base,
      skill_id: skillId,
      award_key: `${awardKeyBase}:skill:${skillId}`,
    });
  }

  for (const monumentId of request.monumentIds ?? []) {
    events.push({
      ...base,
      monument_id: monumentId,
      award_key: `${awardKeyBase}:mon:${monumentId}`,
    });
  }

  if (events.length === 0) {
    events.push(base);
  }

  return events;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase client unavailable" },
        { status: 500 }
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await request.json();
    const parsed = awardRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const awardRequest = parsed.data;

    let amount: number;
    try {
      amount = resolveAmount(awardRequest.kind, awardRequest.amount);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid amount" },
        { status: 400 }
      );
    }

    const awardKeyBase = buildAwardKeyBase(awardRequest);

    if (!awardKeyBase) {
      return NextResponse.json(
        { error: "awardKeyBase is required for XP awards" },
        { status: 400 }
      );
    }

    const events = buildEvents(user.id, awardRequest, amount, awardKeyBase);

    const dedupeCandidates = events.map((event) => event.award_key);

    let deduped = false;
    let eventsToInsert = events;

    if (dedupeCandidates.length > 0) {
      const { data: existing, error: selectError } = await supabase
        .from("xp_events")
        .select("award_key")
        .eq("user_id", user.id)
        .in("award_key", dedupeCandidates);

      if (selectError) {
        console.error("Failed to check existing XP events", selectError);
        return NextResponse.json(
          { error: "Failed to verify award uniqueness" },
          { status: 500 }
        );
      }

      if (existing && existing.length > 0) {
        deduped = true;
        const existingKeys = new Set(
          existing
            .map((row) => row.award_key)
            .filter((key): key is string => typeof key === "string")
        );
        eventsToInsert = events.filter(
          (event) => !existingKeys.has(event.award_key)
        );
      }
    }

    if (eventsToInsert.length === 0) {
      return NextResponse.json({ success: true, deduped, inserted: 0 });
    }

    const { data, error } = await supabase
      .from("xp_events")
      .insert(eventsToInsert)
      .select("id");

    if (error) {
      if (error.code === "23505") {
        await recordUserEnrichment(supabase, user.id, {
          eventType: "xp_award",
          context: buildEnrichmentContext(
            awardRequest,
            amount,
            true,
            0,
          ),
        });
        return NextResponse.json({ success: true, deduped: true, inserted: 0 });
      }

      console.error("Failed to insert XP events", error);
      return NextResponse.json(
        { error: "Failed to award XP" },
        { status: 500 }
      );
    }

    const inserted = data?.length ?? eventsToInsert.length;

    await recordUserEnrichment(supabase, user.id, {
      eventType: "xp_award",
      context: buildEnrichmentContext(
        awardRequest,
        amount,
        deduped,
        inserted,
      ),
    });

    return NextResponse.json({
      success: true,
      deduped,
      inserted,
    });
  } catch (error) {
    console.error("Unexpected error awarding XP", error);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    );
  }
}

function buildEnrichmentContext(
  awardRequest: AwardRequest,
  amount: number,
  deduped: boolean,
  inserted: number,
) {
  return {
    scheduleInstanceId: awardRequest.scheduleInstanceId ?? null,
    kind: awardRequest.kind,
    amount,
    skillIds: awardRequest.skillIds ?? [],
    monumentIds: awardRequest.monumentIds ?? [],
    deduped,
    inserted,
    source: awardRequest.source ?? null,
  } satisfies UserEnrichmentPayload["context"];
}

async function recordUserEnrichment(
  supabase: UserEnrichmentClient,
  userId: string,
  payload: { eventType: string; context?: Record<string, unknown> | null },
) {
  try {
    const enrichmentPayload = {
      user_id: userId,
      event_type: payload.eventType,
      payload: payload.context ?? {},
    } satisfies Database["public"]["Tables"]["user_enrichment_events"]["Insert"];

    const { error } = await supabase
      .from("user_enrichment_events")
      .insert(enrichmentPayload);

    if (error) {
      console.error("Failed to record XP enrichment event", error);
    }
  } catch (error) {
    console.error("Unexpected error recording XP enrichment", error);
  }
}
