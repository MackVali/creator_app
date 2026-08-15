import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  getFocusGateSettings,
  getFocusGateStatus,
  upsertFocusGateSettings,
} from "@/lib/focus-gate/server";
import type { FocusGateSettings } from "@/lib/focus-gate/types";
import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type ServerClient = SupabaseClient<Database>;

const updateSchema = z
  .object({
    enabled: z.boolean().optional(),
    minutesPerXp: z.number().int().min(1).max(120).optional(),
    dailyMaxMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  })
  .strict();

async function authenticateFocusGateRequest() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      response: NextResponse.json(
        { error: "Supabase client unavailable" },
        { status: 500 }
      ),
    };
  }

  const db = supabase as unknown as ServerClient;
  const {
    data: { user },
    error,
  } = await db.auth.getUser();

  if (error || !user) {
    return {
      response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }

  return { db, user };
}

async function resolveProfileTimezone(client: ServerClient, userId: string) {
  const { data, error } = await client
    .from("profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return null;
  return typeof data?.timezone === "string" ? data.timezone : null;
}

async function buildStatusResponse(
  client: ServerClient,
  userId: string,
  deviceTimezone?: string | null
) {
  const profileTimezone = await resolveProfileTimezone(client, userId);
  return getFocusGateStatus({
    client,
    userId,
    profileTimezone,
    deviceTimezone,
  });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateFocusGateRequest();
    if ("response" in auth) return auth.response;

    const status = await buildStatusResponse(
      auth.db,
      auth.user.id,
      request.nextUrl.searchParams.get("device_timezone")
    );

    return NextResponse.json(status);
  } catch (error) {
    console.error("Failed to load Focus Gate status", error);
    return NextResponse.json(
      { error: "Unable to load Focus Gate status" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticateFocusGateRequest();
    if ("response" in auth) return auth.response;

    const body = await request.json().catch(() => null);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid Focus Gate settings", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const current = await getFocusGateSettings(auth.db, auth.user.id);
    const next: FocusGateSettings = {
      enabled: parsed.data.enabled ?? current.enabled,
      minutesPerXp: parsed.data.minutesPerXp ?? current.minutesPerXp,
      dailyMaxMinutes:
        parsed.data.dailyMaxMinutes === undefined
          ? current.dailyMaxMinutes
          : parsed.data.dailyMaxMinutes,
    };

    await upsertFocusGateSettings(auth.db, auth.user.id, next);
    const status = await buildStatusResponse(
      auth.db,
      auth.user.id,
      request.nextUrl.searchParams.get("device_timezone")
    );

    return NextResponse.json(status);
  } catch (error) {
    console.error("Failed to update Focus Gate settings", error);
    return NextResponse.json(
      { error: "Unable to update Focus Gate settings" },
      { status: 500 }
    );
  }
}
