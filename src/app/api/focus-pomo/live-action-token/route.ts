import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  createFocusPomoLiveActivityActionTokens,
  upsertFocusPomoRun,
  type FocusPomoRunMode,
  type FocusPomoRunQueueItem,
} from "@/lib/focus/focusPomoLiveActionServer";

export const runtime = "nodejs";

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function isMode(value: unknown): value is FocusPomoRunMode {
  return value === "pomo" || value === "stopwatch";
}

function readQueueItem(value: unknown): FocusPomoRunQueueItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const itemKey = readString(record.itemKey);
  const sourceType = readString(record.sourceType);
  const sourceId = readString(record.sourceId ?? record.itemId);
  const title = readString(record.title);
  if (!itemKey || !sourceType || !sourceId || !title) return null;

  const durationMinutes = readNumber(record.durationMinutes);

  return {
    itemKey,
    sourceType,
    sourceId,
    itemId: readString(record.itemId) ?? sourceId,
    scheduleInstanceId: readString(record.scheduleInstanceId),
    title,
    skillIcon: readString(record.skillIcon),
    durationMinutes:
      durationMinutes !== null && durationMinutes >= 0
        ? Math.round(durationMinutes)
        : null,
  };
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client unavailable" },
      { status: 500 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        sessionId?: unknown;
        itemKey?: unknown;
        itemType?: unknown;
        sourceType?: unknown;
        itemId?: unknown;
        sourceId?: unknown;
        scheduleInstanceId?: unknown;
        queueItems?: unknown;
        mode?: unknown;
        currentIndex?: unknown;
        startedAt?: unknown;
        endsAt?: unknown;
      }
    | null;
  const sessionId = readString(body?.sessionId);
  const itemKey = readString(body?.itemKey);
  const itemType = readString(body?.itemType);
  const sourceType = readString(body?.sourceType);
  const itemId = readString(body?.itemId);
  const sourceId = readString(body?.sourceId);
  const scheduleInstanceId = readString(body?.scheduleInstanceId);
  const queueItems = Array.isArray(body?.queueItems)
    ? body.queueItems
        .map(readQueueItem)
        .filter((item): item is FocusPomoRunQueueItem => item !== null)
    : [];
  const mode = isMode(body?.mode) ? body.mode : "pomo";
  const currentIndex = readNumber(body?.currentIndex);
  const startedAt = readString(body?.startedAt) ?? new Date().toISOString();
  const endsAt = readString(body?.endsAt);

  if (!sessionId || !itemKey) {
    return NextResponse.json(
      { error: "Missing sessionId or itemKey" },
      { status: 400 }
    );
  }

  if (scheduleInstanceId) {
    const { data: instance, error } = await supabase
      .from("schedule_instances")
      .select("id,user_id,status")
      .eq("id", scheduleInstanceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message ?? "Unable to validate schedule instance" },
        { status: 500 }
      );
    }
    if (!instance) {
      return NextResponse.json(
        { error: "Schedule instance not found" },
        { status: 404 }
      );
    }
  }

  if (queueItems.length > 0) {
    try {
      await upsertFocusPomoRun(
        supabase as unknown as Parameters<typeof upsertFocusPomoRun>[0],
        {
          userId: user.id,
          sessionId,
          activeItemKey: itemKey,
          queueItems,
          mode,
          currentIndex: currentIndex ?? undefined,
          startedAt,
          endsAt,
          status: "running",
        }
      );
    } catch (error) {
      console.error("Failed to persist Focus Pomo run", error);
      return NextResponse.json(
        { error: "Unable to persist Focus Pomo run" },
        { status: 500 }
      );
    }
  }

  let tokens: ReturnType<typeof createFocusPomoLiveActivityActionTokens>;
  try {
    tokens = createFocusPomoLiveActivityActionTokens({
      userId: user.id,
      sessionId,
      itemKey,
      itemType,
      sourceType,
      itemId,
      sourceId,
      scheduleInstanceId,
    });
  } catch (error) {
    console.error("Failed to create Focus Pomo Live Activity tokens", error);
    return NextResponse.json(
      { error: "Unable to create action tokens" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ...tokens,
    actionEndpoint: "/api/focus-pomo/live-action",
  });
}
