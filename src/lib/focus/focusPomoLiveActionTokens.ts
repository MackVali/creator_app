import { createHmac, randomUUID, timingSafeEqual } from "crypto";

export type FocusPomoLiveAction = "complete" | "skip";

export type FocusPomoLiveActionTokenPayload = {
  v: 1;
  scope: "focus-pomo-live-action";
  userId: string;
  sessionId: string;
  itemKey: string;
  itemType?: string | null;
  sourceType?: string | null;
  itemId?: string | null;
  sourceId?: string | null;
  scheduleInstanceId?: string | null;
  action: FocusPomoLiveAction;
  actionId: string;
  iat: number;
  exp: number;
};

const TOKEN_TTL_SECONDS = 60 * 45;

function resolveSecret() {
  return (
    process.env.FOCUS_POMO_LIVE_ACTION_SECRET ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    process.env.SUPABASE_JWT_SECRET ??
    null
  );
}

function encodeBase64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

function sign(encodedPayload: string, secret: string) {
  return encodeBase64Url(createHmac("sha256", secret).update(encodedPayload).digest());
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function isPayload(value: unknown): value is FocusPomoLiveActionTokenPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Partial<FocusPomoLiveActionTokenPayload>;

  return (
    payload.v === 1 &&
    payload.scope === "focus-pomo-live-action" &&
    typeof payload.userId === "string" &&
    typeof payload.sessionId === "string" &&
    typeof payload.itemKey === "string" &&
    (payload.itemType == null || typeof payload.itemType === "string") &&
    (payload.sourceType == null || typeof payload.sourceType === "string") &&
    (payload.itemId == null || typeof payload.itemId === "string") &&
    (payload.sourceId == null || typeof payload.sourceId === "string") &&
    (payload.scheduleInstanceId == null ||
      typeof payload.scheduleInstanceId === "string") &&
    (payload.action === "complete" || payload.action === "skip") &&
    typeof payload.actionId === "string" &&
    typeof payload.iat === "number" &&
    typeof payload.exp === "number"
  );
}

export function createFocusPomoLiveActionToken(input: {
  userId: string;
  sessionId: string;
  itemKey: string;
  itemType?: string | null;
  sourceType?: string | null;
  itemId?: string | null;
  sourceId?: string | null;
  scheduleInstanceId?: string | null;
  action: FocusPomoLiveAction;
  actionId?: string;
  now?: Date;
}) {
  const secret = resolveSecret();
  if (!secret) {
    throw new Error("Focus Pomo Live Activity action signing secret is missing.");
  }

  const nowSeconds = Math.floor((input.now?.getTime() ?? Date.now()) / 1000);
  const payload: FocusPomoLiveActionTokenPayload = {
    v: 1,
    scope: "focus-pomo-live-action",
    userId: input.userId,
    sessionId: input.sessionId,
    itemKey: input.itemKey,
    itemType: input.itemType ?? null,
    sourceType: input.sourceType ?? null,
    itemId: input.itemId ?? null,
    sourceId: input.sourceId ?? null,
    scheduleInstanceId: input.scheduleInstanceId ?? null,
    action: input.action,
    actionId: input.actionId ?? randomUUID(),
    iat: nowSeconds,
    exp: nowSeconds + TOKEN_TTL_SECONDS,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));

  return {
    token: `${encodedPayload}.${sign(encodedPayload, secret)}`,
    actionId: payload.actionId,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

export function verifyFocusPomoLiveActionToken(token: string, now = new Date()) {
  const secret = resolveSecret();
  if (!secret) {
    return { ok: false as const, reason: "missing_secret" };
  }

  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra !== undefined) {
    return { ok: false as const, reason: "malformed_token" };
  }

  const expectedSignature = sign(encodedPayload, secret);
  if (!safeEqual(signature, expectedSignature)) {
    return { ok: false as const, reason: "invalid_signature" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeBase64Url(encodedPayload));
  } catch {
    return { ok: false as const, reason: "invalid_payload" };
  }

  if (!isPayload(parsed)) {
    return { ok: false as const, reason: "invalid_payload" };
  }

  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (parsed.exp <= nowSeconds) {
    return { ok: false as const, reason: "expired_token", payload: parsed };
  }

  return { ok: true as const, payload: parsed };
}
