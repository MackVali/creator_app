import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  completeIlavCheckInItem,
  type IlavCompleteCheckInItemRequest,
} from "@/lib/ai/ilavCheckInCompletion";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const requestSchema = z.discriminatedUnion("itemType", [
  z.object({
    itemType: z.literal("due_habit"),
    habitId: z.string().uuid(),
    timeZone: z.string().min(1),
    completedAt: z.string().datetime().optional(),
  }),
  z.object({
    itemType: z.literal("scheduled_instance"),
    scheduleInstanceId: z.string().uuid(),
    timeZone: z.string().min(1),
    completedAt: z.string().datetime().optional(),
  }),
]);

function buildSelfFetch(request: NextRequest) {
  const cookie = request.headers.get("cookie") ?? "";
  return ((input, init) => {
    const url =
      typeof input === "string" && input.startsWith("/")
        ? new URL(input, request.url)
        : input;
    const headers = new Headers(init?.headers);
    if (cookie && !headers.has("cookie")) headers.set("cookie", cookie);
    return fetch(url, { ...init, headers });
  }) satisfies typeof fetch;
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

    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await completeIlavCheckInItem({
      client: supabase as Parameters<typeof completeIlavCheckInItem>[0]["client"],
      userId: user.id,
      request: parsed.data as IlavCompleteCheckInItemRequest,
      fetchFn: buildSelfFetch(request),
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to complete check-in item";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
