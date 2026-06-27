import { NextResponse } from "next/server";
import {
  verifyFocusPomoLiveActionToken,
  type FocusPomoLiveAction,
} from "@/lib/focus/focusPomoLiveActionTokens";
import { performFocusPomoLiveAction } from "@/lib/focus/focusPomoLiveActionServer";

export const runtime = "nodejs";

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function isAction(value: unknown): value is FocusPomoLiveAction {
  return value === "complete" || value === "skip";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        action?: unknown;
        sessionId?: unknown;
        itemKey?: unknown;
        itemType?: unknown;
        sourceType?: unknown;
        itemId?: unknown;
        sourceId?: unknown;
        scheduleInstanceId?: unknown;
        actionId?: unknown;
        token?: unknown;
      }
    | null;

  const action = body?.action;
  const sessionId = readString(body?.sessionId);
  const itemKey = readString(body?.itemKey);
  const itemType = readString(body?.itemType);
  const sourceType = readString(body?.sourceType);
  const itemId = readString(body?.itemId);
  const sourceId = readString(body?.sourceId);
  const scheduleInstanceId = readString(body?.scheduleInstanceId);
  const actionId = readString(body?.actionId);
  const token = readString(body?.token);

  if (!isAction(action) || !sessionId || !itemKey || !actionId || !token) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const tokenResult = verifyFocusPomoLiveActionToken(token);
  if (!tokenResult.ok) {
    return NextResponse.json(
      { error: "Invalid action token", reason: tokenResult.reason },
      { status: tokenResult.reason === "expired_token" ? 401 : 403 }
    );
  }

  const payload = tokenResult.payload;
  if (
    payload.action !== action ||
    payload.sessionId !== sessionId ||
    payload.itemKey !== itemKey ||
    (payload.itemType ?? null) !== itemType ||
    (payload.sourceType ?? null) !== sourceType ||
    (payload.itemId ?? null) !== itemId ||
    (payload.sourceId ?? null) !== sourceId ||
    (payload.scheduleInstanceId ?? null) !== scheduleInstanceId ||
    payload.actionId !== actionId
  ) {
    return NextResponse.json(
      { error: "Action token does not match request" },
      { status: 403 }
    );
  }

  try {
    const result = await performFocusPomoLiveAction({
      userId: payload.userId,
      sessionId,
      itemKey,
      sourceType,
      itemId,
      sourceId,
      scheduleInstanceId,
      action,
      actionId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({ ok: true, next: result.next });
  } catch (error) {
    console.error("Focus Pomo live action failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to apply Focus Pomo action" },
      { status: 500 }
    );
  }
}
