import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { Database } from "@/types/supabase";

type XpEventInsert = Database["public"]["Tables"]["xp_events"]["Insert"];

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
  awardKeyBase: string | undefined
): XpEventInsert[] {
  const base = {
    user_id: userId,
    kind: request.kind,
    amount,
    schedule_instance_id: request.scheduleInstanceId ?? null,
    skill_id: null,
    monument_id: null,
    award_key: null,
    source: request.source ?? null,
  } satisfies XpEventInsert;

  const events: XpEventInsert[] = [];

  for (const skillId of request.skillIds ?? []) {
    events.push({
      ...base,
      skill_id: skillId,
      award_key: awardKeyBase ? `${awardKeyBase}:skill:${skillId}` : null,
    });
  }

  for (const monumentId of request.monumentIds ?? []) {
    events.push({
      ...base,
      monument_id: monumentId,
      award_key: awardKeyBase ? `${awardKeyBase}:mon:${monumentId}` : null,
    });
  }

  if (events.length === 0) {
    events.push({ ...base, award_key: awardKeyBase ?? null });
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
    const events = buildEvents(user.id, awardRequest, amount, awardKeyBase);

    const dedupeCandidates = events
      .map((event) => event.award_key)
      .filter((key): key is string => !!key);

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
        const existingKeys = new Set(existing.map((row) => row.award_key));
        eventsToInsert = events.filter(
          (event) => !event.award_key || !existingKeys.has(event.award_key)
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
        return NextResponse.json({ success: true, deduped: true, inserted: 0 });
      }

      console.error("Failed to insert XP events", error);
      return NextResponse.json(
        { error: "Failed to award XP" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      deduped,
      inserted: data?.length ?? eventsToInsert.length,
    });
  } catch (error) {
    console.error("Unexpected error awarding XP", error);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    );
  }
}
