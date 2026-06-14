import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  ensureCompletionEvent,
  isCompletionSchemaMissing,
} from "@/lib/completions/completionEvents";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const completionSourceTypeSchema = z.enum(["GOAL", "PROJECT", "TASK", "HABIT"]);

const completionRequestSchema = z.object({
  action: z.enum(["complete", "undo"]).optional(),
  sourceType: completionSourceTypeSchema,
  sourceId: z.string().uuid(),
  completedAt: z.string().datetime().optional(),
  scheduleInstanceId: z.string().uuid().optional(),
  wasScheduled: z.boolean().optional(),
  durationMin: z.number().int().nonnegative().nullable().optional(),
  timeZone: z.string().optional(),
  productivityDayKey: z.string().optional(),
  completionKey: z.string().optional(),
});

export async function POST(request: NextRequest) {
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

  const payload = await request.json().catch(() => null);
  const parsed = completionRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await ensureCompletionEvent({
      client: supabase,
      userId: user.id,
      input: parsed.data,
    });
    return NextResponse.json({ success: true, completionEventId: result.id });
  } catch (error) {
    if (isCompletionSchemaMissing(error)) {
      return NextResponse.json(
        { error: "Completion tracking schema is not migrated" },
        { status: 503 }
      );
    }
    console.error("Failed to record completion event", error);
    return NextResponse.json({ error: "Failed to record completion" }, { status: 500 });
  }
}
