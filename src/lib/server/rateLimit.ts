import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type ApiRateLimitRpcRow = Record<string, unknown> & {
  allowed?: boolean;
  remaining?: number | string;
  reset_at?: string;
  request_count?: number | string;
};

export type ApiRateLimitDecision = {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
  requestCount: number;
};

type CheckApiRateLimitOptions = {
  userId: string;
  action: string;
  windowSeconds: number;
  maxRequests: number;
};

function toFiniteNumber(value: number | string | null | undefined, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRpcRow(
  row: ApiRateLimitRpcRow | null,
  fallbackResetAt: Date,
): ApiRateLimitDecision {
  const resetAt =
    row?.reset_at && !Number.isNaN(new Date(row.reset_at).getTime())
      ? new Date(row.reset_at)
      : fallbackResetAt;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((resetAt.getTime() - Date.now()) / 1000),
  );

  return {
    allowed: row?.allowed === true,
    remaining: Math.max(0, Math.floor(toFiniteNumber(row?.remaining))),
    resetAt,
    retryAfterSeconds,
    requestCount: Math.max(0, Math.floor(toFiniteNumber(row?.request_count))),
  };
}

export async function checkApiRateLimit({
  userId,
  action,
  windowSeconds,
  maxRequests,
}: CheckApiRateLimitOptions): Promise<ApiRateLimitDecision> {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error("Supabase admin client not initialized");
  }

  const { data, error } = await admin.rpc("check_api_rate_limit", {
    p_user_id: userId,
    p_action: action,
    p_window_seconds: windowSeconds,
    p_max_requests: maxRequests,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data)
    ? (data[0] as ApiRateLimitRpcRow | undefined)
    : (data as ApiRateLimitRpcRow | null);
  const fallbackResetAt = new Date(Date.now() + windowSeconds * 1000);

  return normalizeRpcRow(row ?? null, fallbackResetAt);
}
