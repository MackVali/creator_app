import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { reverseActiveXpAwards } from "@/lib/xp/reversibleXpAwards";
import {
  buildScheduleXpOccurrenceStem,
  resolveScheduleXpCompletionSemantics,
} from "@/lib/xp/scheduleXpSemantics";
import type { Database, Json } from "@/types/supabase";

type ServerClient = SupabaseClient<Database>;
type ScheduleReverseContext = {
  id: string;
  source_type: string | null;
  source_id: string | null;
  event_name: string | null;
  metadata: Json | null;
};

const reverseRequestSchema = z.object({
  occurrenceStem: z.string().min(1),
  legacyOccurrenceStems: z.array(z.string().min(1)).optional(),
  scheduleInstanceId: z.string().min(1).optional(),
  strict: z.boolean().optional(),
});

async function loadScheduleReverseContext(
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
  return (data ?? null) as ScheduleReverseContext | null;
}

function mergeLegacyOccurrenceStems(...groups: (string[] | undefined)[]) {
  return Array.from(
    new Set(
      groups
        .flatMap((group) => group ?? [])
        .map((stem) => stem.trim())
        .filter(Boolean)
    )
  );
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
    const parsed = reverseRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const scheduleContext = await loadScheduleReverseContext(
      db,
      user.id,
      parsed.data.scheduleInstanceId ?? null
    );
    const scheduleSemantics =
      resolveScheduleXpCompletionSemantics(scheduleContext);
    const resolvedOccurrenceStem =
      scheduleContext && scheduleSemantics
        ? buildScheduleXpOccurrenceStem(
            scheduleContext.id,
            scheduleSemantics.xpKind
          )
        : parsed.data.occurrenceStem;
    const legacyOccurrenceStems = mergeLegacyOccurrenceStems(
      parsed.data.legacyOccurrenceStems,
      parsed.data.occurrenceStem !== resolvedOccurrenceStem
        ? [parsed.data.occurrenceStem]
        : undefined,
      scheduleSemantics?.legacyOccurrenceStems
    );

    const result = await reverseActiveXpAwards({
      client: db,
      userId: user.id,
      occurrenceStem: resolvedOccurrenceStem,
      legacyOccurrenceStems,
      scheduleInstanceId:
        parsed.data.scheduleInstanceId ?? scheduleContext?.id ?? null,
    });

    if (parsed.data.strict && result.activePositiveCount === 0) {
      return NextResponse.json(
        {
          error: "No active positive XP exists for occurrence",
          ...result,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      reversed: result.reversed,
      alreadyReversed: result.alreadyReversedCount,
      activePositivesFound: result.activePositiveCount,
      reversedAwardKeys: result.insertedReversalKeys,
      alreadyReversedAwardKeys: result.reversedAwardKeys,
      insertedReversalKeys: result.insertedReversalKeys,
    });
  } catch (error) {
    console.error("Unexpected error reversing XP", error);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    );
  }
}
