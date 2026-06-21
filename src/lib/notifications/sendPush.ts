import type { SupabaseClient } from "@supabase/supabase-js";

import { getCreatorFirebaseMessaging } from "@/lib/notifications/firebaseAdmin";
import type { Database } from "@/types/supabase";

type PushNotificationPayload = {
  title: string;
  body: string;
};

type SendPushPayload = {
  notification: PushNotificationPayload;
  data?: Record<string, unknown>;
};

type SendPushOptions = {
  tokenLimit?: number;
  delivery?: {
    kind: string;
    entityType?: string | null;
    entityId?: string | null;
    scheduledFor?: string | null;
    dedupe?: boolean;
  };
};

export type SendPushToUserResult = {
  ok: boolean;
  attemptedCount: number;
  successCount: number;
  failureCount: number;
  skippedReason?: "no_tokens" | "token_load_failed" | "deduped" | "delivery_log_failed";
  error?: string;
};

type PushTokenRow = {
  token: string | null;
};

type DeliveryOptions = NonNullable<SendPushOptions["delivery"]>;

const DEFAULT_TOKEN_LIMIT = 10;

function normalizeData(data: Record<string, unknown> | undefined) {
  const normalized: Record<string, string> = {
    source: "creator",
  };

  for (const [key, value] of Object.entries(data ?? {})) {
    if (value === null || value === undefined) continue;
    normalized[key] = String(value);
  }

  return normalized;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown push send error";
}

function isUniqueConstraintError(error: { code?: string } | null) {
  return error?.code === "23505";
}

function normalizeDelivery(delivery: DeliveryOptions) {
  return {
    kind: delivery.kind,
    entityType: delivery.entityType ?? null,
    entityId: delivery.entityId ?? null,
    scheduledFor: delivery.scheduledFor ?? null,
  };
}

async function claimDelivery(
  supabase: SupabaseClient<Database>,
  userId: string,
  delivery: DeliveryOptions,
): Promise<{ deliveryId?: string; result?: SendPushToUserResult }> {
  const normalized = normalizeDelivery(delivery);

  const { data, error } = await supabase
    .from("push_notification_deliveries")
    .insert({
      user_id: userId,
      kind: normalized.kind,
      entity_type: normalized.entityType,
      entity_id: normalized.entityId,
      scheduled_for: normalized.scheduledFor,
      sent_at: null,
      status: "pending",
      error: null,
    })
    .select("id")
    .single();

  if (error) {
    return {
      result: {
        ok: isUniqueConstraintError(error),
        attemptedCount: 0,
        successCount: 0,
        failureCount: 0,
        skippedReason: isUniqueConstraintError(error) ? "deduped" : "delivery_log_failed",
        error: isUniqueConstraintError(error) ? undefined : error.message,
      },
    };
  }

  return { deliveryId: data.id };
}

async function logDelivery(
  supabase: SupabaseClient<Database>,
  userId: string,
  delivery: DeliveryOptions,
  result: SendPushToUserResult,
  firebaseAttempted: boolean,
): Promise<SendPushToUserResult> {
  const normalized = normalizeDelivery(delivery);
  const status =
    result.skippedReason === "no_tokens"
      ? "skipped"
      : result.successCount > 0 && result.failureCount === 0
        ? "sent"
        : "failed";
  const error = result.error ?? result.skippedReason ?? null;

  const { error: insertError } = await supabase.from("push_notification_deliveries").insert({
    user_id: userId,
    kind: normalized.kind,
    entity_type: normalized.entityType,
    entity_id: normalized.entityId,
    scheduled_for: normalized.scheduledFor,
    sent_at: firebaseAttempted ? new Date().toISOString() : null,
    status,
    error,
  });

  if (!insertError) {
    return result;
  }

  if (isUniqueConstraintError(insertError)) {
    return {
      ok: true,
      attemptedCount: 0,
      successCount: 0,
      failureCount: 0,
      skippedReason: "deduped",
    };
  }

  return {
    ...result,
    ok: false,
    skippedReason: "delivery_log_failed",
    error: insertError.message,
  };
}

async function updateClaimedDelivery(
  supabase: SupabaseClient<Database>,
  deliveryId: string,
  result: SendPushToUserResult,
  firebaseAttempted: boolean,
): Promise<SendPushToUserResult> {
  const status =
    result.skippedReason === "no_tokens"
      ? "skipped"
      : result.successCount > 0 && result.failureCount === 0
        ? "sent"
        : "failed";
  const error = result.error ?? result.skippedReason ?? null;

  const { error: updateError } = await supabase
    .from("push_notification_deliveries")
    .update({
      sent_at: firebaseAttempted ? new Date().toISOString() : null,
      status,
      error,
    })
    .eq("id", deliveryId);

  if (!updateError) {
    return result;
  }

  return {
    ...result,
    ok: false,
    skippedReason: "delivery_log_failed",
    error: updateError.message,
  };
}

async function maybeLogDelivery(
  supabase: SupabaseClient<Database>,
  userId: string,
  delivery: DeliveryOptions | undefined,
  result: SendPushToUserResult,
  firebaseAttempted: boolean,
  claimedDeliveryId?: string,
) {
  if (claimedDeliveryId) {
    return updateClaimedDelivery(supabase, claimedDeliveryId, result, firebaseAttempted);
  }

  if (!delivery) {
    return result;
  }

  return logDelivery(supabase, userId, delivery, result, firebaseAttempted);
}

export async function sendPushToUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  payload: SendPushPayload,
  options?: SendPushOptions,
): Promise<SendPushToUserResult> {
  const tokenLimit = options?.tokenLimit ?? DEFAULT_TOKEN_LIMIT;
  const delivery = options?.delivery;
  let claimedDeliveryId: string | undefined;

  if (delivery?.dedupe) {
    const claim = await claimDelivery(supabase, userId, delivery);

    if (claim.result) {
      return claim.result;
    }

    claimedDeliveryId = claim.deliveryId;
  }

  const { data: tokens, error } = await supabase
    .from("push_tokens")
    .select("token")
    .eq("user_id", userId)
    .eq("enabled", true)
    .order("last_seen_at", { ascending: false })
    .limit(tokenLimit);

  if (error) {
    const result: SendPushToUserResult = {
      ok: false,
      attemptedCount: 0,
      successCount: 0,
      failureCount: 0,
      skippedReason: "token_load_failed",
      error: error.message,
    };

    if (claimedDeliveryId) {
      return updateClaimedDelivery(supabase, claimedDeliveryId, result, false);
    }

    return result;
  }

  const tokenValues = Array.from(
    new Set(
      ((tokens ?? []) as PushTokenRow[])
        .map((entry) => entry.token)
        .filter((token): token is string => Boolean(token)),
    ),
  );

  if (tokenValues.length === 0) {
    return maybeLogDelivery(supabase, userId, delivery, {
      ok: true,
      attemptedCount: 0,
      successCount: 0,
      failureCount: 0,
      skippedReason: "no_tokens",
    }, false, claimedDeliveryId);
  }

  try {
    const result = await getCreatorFirebaseMessaging().sendEachForMulticast({
      tokens: tokenValues,
      notification: payload.notification,
      data: normalizeData(payload.data),
      apns: {
        payload: {
          aps: {
            sound: "default",
          },
        },
      },
    });

    return maybeLogDelivery(supabase, userId, delivery, {
      ok: result.failureCount === 0,
      attemptedCount: tokenValues.length,
      successCount: result.successCount,
      failureCount: result.failureCount,
    }, true, claimedDeliveryId);
  } catch (error) {
    return maybeLogDelivery(supabase, userId, delivery, {
      ok: false,
      attemptedCount: tokenValues.length,
      successCount: 0,
      failureCount: tokenValues.length,
      error: errorMessage(error),
    }, true, claimedDeliveryId);
  }
}
