import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  ensureCompletionEvent,
  isCompletionSchemaMissing,
  type CompletionEventInput,
} from "@/lib/completions/completionEvents";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { resolveScheduleEventSkillContext } from "@/lib/schedule/eventSkillContext";
import { resolveNextReversibleAwardKeyBase } from "@/lib/xp/reversibleXpAwards";
import type { Database, Json } from "@/types/supabase";

type XpEventInsert = Database["public"]["Tables"]["xp_events"]["Insert"];
type ServerClient = SupabaseClient<Database>;
type SkillLookupRow = Pick<
  Database["public"]["Tables"]["skills"]["Row"],
  "id" | "name" | "icon" | "monument_id"
>;
type SkillSurgeRow = Pick<
  Database["public"]["Tables"]["skills"]["Row"],
  "id" | "name" | "icon"
>;

type AwardEvent = Omit<XpEventInsert, "award_key"> & {
  award_key: NonNullable<XpEventInsert["award_key"]>;
};

type XpKind = Database["public"]["Enums"]["xp_kind"];

const xpKindValues = [
  "task",
  "habit",
  "project",
  "goal",
  "event",
  "manual",
] as const satisfies readonly XpKind[];
const xpKindSchema = z.enum(xpKindValues);
const completionSourceTypeSchema = z.enum([
  "GOAL",
  "PROJECT",
  "TASK",
  "HABIT",
  "EVENT",
]);

const awardRequestSchema = z.object({
  scheduleInstanceId: z.string().min(1).optional(),
  kind: xpKindSchema,
  amount: z.number().int().optional(),
  skillIds: z.array(z.string().min(1)).optional(),
  monumentIds: z.array(z.string().min(1)).optional(),
  awardKeyBase: z.string().min(1).optional(),
  source: z.string().optional(),
  reversible: z
    .object({
      occurrenceStem: z.string().min(1),
      legacyOccurrenceStems: z.array(z.string().min(1)).optional(),
    })
    .optional(),
  completion: z
    .object({
      action: z.enum(["complete", "undo"]).optional(),
      sourceType: completionSourceTypeSchema.optional(),
      sourceId: z.string().min(1).optional(),
      completedAt: z.string().datetime().optional(),
      scheduleInstanceId: z.string().min(1).optional(),
      wasScheduled: z.boolean().optional(),
      durationMin: z.number().int().nonnegative().nullable().optional(),
      timeZone: z.string().optional(),
      productivityDayKey: z.string().optional(),
      completionKey: z.string().optional(),
    })
    .optional(),
});

const DEFAULT_AMOUNTS: Record<Exclude<XpKind, "manual">, number> = {
  task: 1,
  habit: 1,
  project: 3,
  goal: 5,
  event: 1,
};

type AwardRequest = z.infer<typeof awardRequestSchema>;

type ScheduleAwardContext = {
  id: string;
  source_type: string | null;
  source_id: string | null;
  event_name: string | null;
  metadata: Json | null;
};

type SkillAwardContext = {
  skillIds: string[];
  monumentIds: string[];
  primarySkillId: string | null;
  surge: {
    sourceType: "TASK" | "HABIT" | "PROJECT" | "GOAL" | "EVENT";
    title: string;
    sourceIcon: string | null;
    displayXp: number;
    currentLevel: number | null;
  } | null;
};

type SurgeSourceType = NonNullable<SkillAwardContext["surge"]>["sourceType"];

const SURGE_SOURCE_TYPE_BY_KIND: Partial<Record<XpKind, SurgeSourceType>> = {
  task: "TASK",
  habit: "HABIT",
  project: "PROJECT",
  goal: "GOAL",
  event: "EVENT",
};

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
  completion,
}: AwardRequest): string | undefined {
  if (awardKeyBase) return awardKeyBase;
  if (kind === "event" && completion?.sourceType === "EVENT" && completion.sourceId) {
    return `event:${completion.sourceId}`;
  }
  if (scheduleInstanceId) {
    return `sched:${scheduleInstanceId}:${kind}`;
  }
  return undefined;
}

function buildEvents(
  userId: string,
  request: AwardRequest,
  amount: number,
  awardKeyBase: string,
  completionEventId: string | null
): AwardEvent[] {
  const base = {
    user_id: userId,
    kind: request.kind,
    amount,
    schedule_instance_id: request.scheduleInstanceId ?? null,
    completion_event_id: completionEventId,
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

async function loadScheduleAwardContext(
  client: ServerClient,
  userId: string,
  scheduleInstanceId: string | null | undefined
) {
  if (!scheduleInstanceId) return null;
  const { data, error } = await client
    .from("schedule_instances")
    .select("id, source_type, source_id, event_name, metadata")
    .eq("id", scheduleInstanceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as ScheduleAwardContext | null;
}

async function resolveEventAwardContext({
  client,
  userId,
  request,
  amount,
  schedule,
}: {
  client: ServerClient;
  userId: string;
  request: AwardRequest;
  amount: number;
  schedule: ScheduleAwardContext | null;
}): Promise<SkillAwardContext | { skippedReason: string }> {
  const candidateSkillIds = new Set<string>();
  for (const id of request.skillIds ?? []) {
    if (id.trim()) candidateSkillIds.add(id.trim());
  }
  for (const id of resolveScheduleEventSkillContext(schedule?.metadata).skillIds) {
    candidateSkillIds.add(id);
  }

  if (candidateSkillIds.size === 0) {
    return { skippedReason: "EVENT XP skipped: no skill context" };
  }

  const { data: skillRowsRaw, error: skillError } = await client
    .from("skills")
    .select("id, name, icon, monument_id")
    .eq("user_id", userId)
    .in("id", Array.from(candidateSkillIds));

  if (skillError) throw skillError;

  const verifiedSkills = ((skillRowsRaw ?? []) as SkillLookupRow[]).filter(
    (skill) => typeof skill.id === "string" && skill.id.length > 0
  );

  if (verifiedSkills.length === 0) {
    return { skippedReason: "EVENT XP skipped: no skill context" };
  }

  const skillIds = verifiedSkills.map((skill) => skill.id);
  const monumentIds = Array.from(
    new Set(
      [
        ...verifiedSkills.map((skill) => skill.monument_id),
        ...(request.monumentIds ?? []),
      ].filter((id): id is string => typeof id === "string" && id.length > 0)
    )
  );
  const primarySkill = verifiedSkills[0] ?? null;

  return {
    skillIds,
    monumentIds,
    primarySkillId: primarySkill.id,
    surge: primarySkill
      ? {
          sourceType: "EVENT",
          title:
            primarySkill.name?.trim() ||
            schedule?.event_name?.trim() ||
            "Event XP",
          sourceIcon: primarySkill.icon?.trim() || null,
          displayXp: amount,
          currentLevel: null,
        }
      : null,
  };
}

async function resolveSkillBackedSurge({
  client,
  userId,
  request,
  amount,
  schedule,
}: {
  client: ServerClient;
  userId: string;
  request: AwardRequest;
  amount: number;
  schedule: ScheduleAwardContext | null;
}): Promise<Pick<SkillAwardContext, "primarySkillId" | "surge"> | null> {
  if (request.kind === "manual") return null;
  const sourceType = SURGE_SOURCE_TYPE_BY_KIND[request.kind];
  const candidateSkillId = request.skillIds?.find(
    (id) => typeof id === "string" && id.trim().length > 0
  );
  if (!sourceType || !candidateSkillId) return null;

  const { data, error } = await client
    .from("skills")
    .select("id, name, icon")
    .eq("user_id", userId)
    .eq("id", candidateSkillId.trim())
    .maybeSingle();
  if (error) throw error;
  const skill = data as SkillSurgeRow | null;
  if (!skill?.id) return null;

  return {
    primarySkillId: skill.id,
    surge: {
      sourceType,
      title:
        skill.name?.trim() ||
        schedule?.event_name?.trim() ||
        `${sourceType[0]}${sourceType.slice(1).toLowerCase()} XP`,
      sourceIcon: skill.icon?.trim() || null,
      displayXp: amount,
      currentLevel: null,
    },
  };
}

async function loadCurrentSkillLevel(
  client: ServerClient,
  userId: string,
  skillId: string | null
) {
  if (!skillId) return null;
  const { data, error } = await client
    .from("skill_progress")
    .select("level")
    .eq("user_id", userId)
    .eq("skill_id", skillId)
    .maybeSingle();
  if (error) return null;
  const level = (data as { level?: number | null } | null)?.level;
  return typeof level === "number" && Number.isFinite(level) ? level : null;
}

function withResolvedEventContext(
  request: AwardRequest,
  context: SkillAwardContext
): AwardRequest {
  if (request.kind !== "event") return request;
  return {
    ...request,
    skillIds: context.skillIds,
    monumentIds: context.monumentIds,
  };
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
    const db = supabase as unknown as ServerClient;

    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser();

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

    let awardRequest = parsed.data;

    let amount: number;
    try {
      amount = resolveAmount(awardRequest.kind, awardRequest.amount);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid amount" },
        { status: 400 }
      );
    }

    const scheduleAwardContext = await loadScheduleAwardContext(
      db,
      user.id,
      awardRequest.scheduleInstanceId ??
        awardRequest.completion?.scheduleInstanceId ??
        null
    );

    let surgePayload: SkillAwardContext["surge"] = null;
    let surgeSkillId: string | null = null;
    if (
      awardRequest.kind === "event" ||
      awardRequest.completion?.sourceType === "EVENT" ||
      scheduleAwardContext?.source_type === "EVENT"
    ) {
      const eventContext = await resolveEventAwardContext({
        client: db,
        userId: user.id,
        request: awardRequest,
        amount,
        schedule: scheduleAwardContext,
      });
      if ("skippedReason" in eventContext) {
        if (process.env.NODE_ENV !== "production") {
          console.info(eventContext.skippedReason, {
            scheduleInstanceId: awardRequest.scheduleInstanceId ?? null,
            sourceId: awardRequest.completion?.sourceId ?? null,
          });
        }
        return NextResponse.json({
          success: true,
          skipped: true,
          inserted: 0,
          reason: eventContext.skippedReason,
        });
      }
      awardRequest = withResolvedEventContext(awardRequest, eventContext);
      surgePayload = eventContext.surge;
      surgeSkillId = eventContext.primarySkillId;
    } else {
      const skillBackedSurge = await resolveSkillBackedSurge({
        client: db,
        userId: user.id,
        request: awardRequest,
        amount,
        schedule: scheduleAwardContext,
      });
      surgePayload = skillBackedSurge?.surge ?? null;
      surgeSkillId = skillBackedSurge?.primarySkillId ?? null;
    }

    let awardKeyBase = buildAwardKeyBase(awardRequest);

    if (!awardKeyBase) {
      return NextResponse.json(
        { error: "awardKeyBase is required for XP awards" },
        { status: 400 }
      );
    }

    let reversibleStatus:
      | Awaited<ReturnType<typeof resolveNextReversibleAwardKeyBase>>
      | null = null;
    if (amount > 0 && awardRequest.reversible) {
      reversibleStatus = await resolveNextReversibleAwardKeyBase({
        client: db,
        userId: user.id,
        occurrenceStem: awardRequest.reversible.occurrenceStem,
        legacyOccurrenceStems: awardRequest.reversible.legacyOccurrenceStems,
      });
      if (reversibleStatus.blockedByActivePositive) {
        return NextResponse.json({
          success: true,
          deduped: true,
          inserted: 0,
          activePositiveCount: reversibleStatus.activePositiveCount,
          alreadyReversedCount: reversibleStatus.alreadyReversedCount,
          reason: "Active positive XP already exists for this occurrence",
        });
      }
      awardKeyBase = reversibleStatus.awardKeyBase;
    }

    let completionEventId: string | null = null;
    const completionInput: CompletionEventInput | null = awardRequest.completion
      ? {
          ...awardRequest.completion,
          scheduleInstanceId:
            awardRequest.completion.scheduleInstanceId ??
            awardRequest.scheduleInstanceId,
        }
      : awardRequest.scheduleInstanceId
        ? {
            action: amount < 0 ? "undo" : "complete",
            scheduleInstanceId: awardRequest.scheduleInstanceId,
            wasScheduled: true,
          }
        : null;

    if (completionInput) {
      try {
        const completion = await ensureCompletionEvent({
          client: db,
          userId: user.id,
          input: completionInput,
        });
        completionEventId = amount > 0 ? completion.id : null;
      } catch (error) {
        if (!isCompletionSchemaMissing(error)) {
          console.error("Failed to link XP to completion event", error);
        }
        completionEventId = null;
      }
    }

    const events = buildEvents(
      user.id,
      awardRequest,
      amount,
      awardKeyBase,
      completionEventId
    );

    const dedupeCandidates = events.map((event) => event.award_key);

    let deduped = false;
    let eventsToInsert = events;

    if (dedupeCandidates.length > 0) {
      const { data: existing, error: selectError } = await db
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
        if (completionEventId && existingKeys.size > 0) {
          const { error: linkExistingError } = await db
            .from("xp_events")
            .update({ completion_event_id: completionEventId })
            .eq("user_id", user.id)
            .is("completion_event_id", null)
            .in("award_key", Array.from(existingKeys));
          if (linkExistingError && !isCompletionSchemaMissing(linkExistingError)) {
            console.error(
              "Failed to link existing XP events to completion",
              linkExistingError
            );
          }
        }
        eventsToInsert = events.filter(
          (event) => !existingKeys.has(event.award_key)
        );
      }
    }

    if (eventsToInsert.length === 0) {
      return NextResponse.json({ success: true, deduped, inserted: 0 });
    }

    const { data, error } = await db
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

    const currentLevel = await loadCurrentSkillLevel(
      db,
      user.id,
      surgeSkillId
    );
    if (surgePayload && currentLevel !== null) {
      surgePayload = { ...surgePayload, currentLevel };
    }

    return NextResponse.json({
      success: true,
      deduped,
      inserted: data?.length ?? eventsToInsert.length,
      surge: surgePayload,
      awardKeyBase,
      activePositiveCount: reversibleStatus?.activePositiveCount,
      alreadyReversedCount: reversibleStatus?.alreadyReversedCount,
    });
  } catch (error) {
    console.error("Unexpected error awarding XP", error);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    );
  }
}
