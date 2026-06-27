import { NextResponse } from "next/server";
import { performFocusPomoLiveAction } from "@/lib/focus/focusPomoLiveActionServer";
import {
  verifyFocusPomoLiveActionToken,
  type FocusPomoLiveAction,
} from "@/lib/focus/focusPomoLiveActionTokens";

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
        scheduleInstanceId?: unknown;
        actionId?: unknown;
        token?: unknown;
      }
    | null;

  const action = body?.action;
  const sessionId = readString(body?.sessionId);
  const scheduleInstanceId = readString(body?.scheduleInstanceId);
  const actionId = readString(body?.actionId);
  const token = readString(body?.token);

  if (!isAction(action) || !sessionId || !scheduleInstanceId || !actionId || !token) {
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
    payload.scheduleInstanceId !== scheduleInstanceId ||
    payload.actionId !== actionId
  ) {
    return NextResponse.json(
      { error: "Action token does not match request" },
      { status: 403 }
    );
  }

  let result: Awaited<ReturnType<typeof performFocusPomoLiveAction>>;
  try {
    result = await performFocusPomoLiveAction({
      userId: payload.userId,
      sessionId,
      scheduleInstanceId,
      action,
      actionId,
    });
  } catch (error) {
    console.error("Focus Pomo Live Activity action failed", error);
    return NextResponse.json(
      { error: "Unable to perform Focus Pomo action" },
      { status: 500 }
    );
  }

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json({ ok: true, next: result.next });
}
