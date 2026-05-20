import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase";

const commandBlockColumns =
  "id, offer_id, circle_id, member_id, user_id, starts_at, ends_at, timezone, status, created_at, updated_at";

type CommandBlockRow = {
  id: string;
  offer_id: string | null;
  circle_id: string;
  member_id: string;
  user_id: string;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type CircleDisplayRow = {
  id: string;
  name: string;
  icon_emoji: string | null;
};

async function getServerClient() {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer(
    cookieStore as unknown as Parameters<typeof getSupabaseServer>[0]
  );

  return supabase ? (supabase as unknown as SupabaseClient) : null;
}

function parseRangeDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const rangeStart = parseRangeDate(url.searchParams.get("start"));
  const rangeEnd = parseRangeDate(url.searchParams.get("end"));

  if (!rangeStart || !rangeEnd || rangeEnd.getTime() <= rangeStart.getTime()) {
    return NextResponse.json(
      { error: "A valid start and end range is required." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Command block service is not configured." },
      { status: 503 }
    );
  }

  const { data: commandBlocks, error: commandBlocksError } = await admin
    .from("command_blocks")
    .select(commandBlockColumns)
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .not("starts_at", "is", null)
    .not("ends_at", "is", null)
    .lt("starts_at", rangeEnd.toISOString())
    .gt("ends_at", rangeStart.toISOString())
    .order("starts_at", { ascending: true })
    .limit(200)
    .returns<CommandBlockRow[]>();

  if (commandBlocksError) {
    console.error("Failed to load command blocks", commandBlocksError);
    return NextResponse.json(
      { error: "Unable to load command blocks." },
      { status: 500 }
    );
  }

  const rows = commandBlocks ?? [];
  const circleIds = Array.from(
    new Set(rows.map((row) => row.circle_id).filter(Boolean))
  );
  const circleById = new Map<string, CircleDisplayRow>();

  if (circleIds.length > 0) {
    const { data: circles, error: circlesError } = await admin
      .from("circles")
      .select("id, name, icon_emoji")
      .in("id", circleIds)
      .returns<CircleDisplayRow[]>();

    if (circlesError) {
      console.error("Failed to load command block circles", circlesError);
    } else {
      for (const circle of circles ?? []) {
        circleById.set(circle.id, circle);
      }
    }
  }

  return NextResponse.json(
    {
      commandBlocks: rows.map((row) => {
        const circle = circleById.get(row.circle_id);

        return {
          ...row,
          circle_name: circle?.name ?? null,
          circle_icon_emoji: circle?.icon_emoji ?? null,
        };
      }),
    },
    { status: 200 }
  );
}
