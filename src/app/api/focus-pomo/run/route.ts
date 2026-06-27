import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  clearFocusPomoRun,
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

async function getAuthenticatedClient() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: NextResponse.json({ error: "Supabase client unavailable" }, { status: 500 }) };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }

  return { supabase, user };
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedClient();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as
    | {
        sessionId?: unknown;
        activeItemKey?: unknown;
        queueItems?: unknown;
        mode?: unknown;
        currentIndex?: unknown;
        startedAt?: unknown;
        endsAt?: unknown;
      }
    | null;

  const sessionId = readString(body?.sessionId);
  const activeItemKey = readString(body?.activeItemKey);
  const queueItems = Array.isArray(body?.queueItems)
    ? body.queueItems
        .map(readQueueItem)
        .filter((item): item is FocusPomoRunQueueItem => item !== null)
    : [];
  const mode = isMode(body?.mode) ? body.mode : null;
  const currentIndex = readNumber(body?.currentIndex);
  const startedAt = readString(body?.startedAt);

  if (!sessionId || !activeItemKey || !mode || !startedAt || queueItems.length === 0) {
    return NextResponse.json({ error: "Invalid Focus Pomo run" }, { status: 400 });
  }

  try {
    await upsertFocusPomoRun(
      auth.supabase as unknown as Parameters<typeof upsertFocusPomoRun>[0],
      {
        userId: auth.user.id,
        sessionId,
        activeItemKey,
        queueItems,
        mode,
        currentIndex: currentIndex ?? undefined,
        startedAt,
        endsAt: readString(body?.endsAt),
        status: "running",
      }
    );
  } catch (error) {
    console.error("Failed to sync Focus Pomo run", error);
    return NextResponse.json({ error: "Unable to sync Focus Pomo run" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await getAuthenticatedClient();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as
    | { sessionId?: unknown; status?: unknown }
    | null;
  const sessionId = readString(body?.sessionId);
  const status = body?.status === "completed" ? "completed" : "canceled";
  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  try {
    await clearFocusPomoRun(
      auth.supabase as unknown as Parameters<typeof clearFocusPomoRun>[0],
      {
        userId: auth.user.id,
        sessionId,
        status,
      }
    );
  } catch (error) {
    console.error("Failed to clear Focus Pomo run", error);
    return NextResponse.json({ error: "Unable to clear Focus Pomo run" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
