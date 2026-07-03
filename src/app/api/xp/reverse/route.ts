import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { reverseActiveXpAwards } from "@/lib/xp/reversibleXpAwards";
import type { Database } from "@/types/supabase";

type ServerClient = SupabaseClient<Database>;

const reverseRequestSchema = z.object({
  occurrenceStem: z.string().min(1),
  legacyOccurrenceStems: z.array(z.string().min(1)).optional(),
  strict: z.boolean().optional(),
});

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

    const result = await reverseActiveXpAwards({
      client: db,
      userId: user.id,
      occurrenceStem: parsed.data.occurrenceStem,
      legacyOccurrenceStems: parsed.data.legacyOccurrenceStems,
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
