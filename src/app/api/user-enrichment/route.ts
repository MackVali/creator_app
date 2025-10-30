import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { userEnrichmentSchema } from "@/lib/user-enrichment";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase client unavailable" },
        { status: 500 },
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("Failed to authenticate for enrichment", authError);
      return NextResponse.json(
        { error: "Failed to authenticate" },
        { status: 500 },
      );
    }

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const json = await request.json();
    const parsed = userEnrichmentSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { eventType, context } = parsed.data;

    const { error } = await supabase
      .from("user_enrichment_events")
      .insert({
        user_id: user.id,
        event_type: eventType,
        payload: context ?? {},
      });

    if (error) {
      console.error("Failed to insert user enrichment event", error);
      return NextResponse.json(
        { error: "Failed to record enrichment" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected error in user enrichment endpoint", error);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 },
    );
  }
}
