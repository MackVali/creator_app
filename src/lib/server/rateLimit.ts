import "server-only";

import { createHash } from "crypto";

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

type CheckApiSubjectRateLimitOptions = {
  subject: string;
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

function normalizeClientAddress(value: string | null) {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first || null;
}

export function getClientRateLimitSubject(request: Request) {
  const clientAddress =
    normalizeClientAddress(request.headers.get("x-vercel-forwarded-for")) ??
    normalizeClientAddress(request.headers.get("x-forwarded-for")) ??
    normalizeClientAddress(request.headers.get("x-real-ip"));

  return clientAddress ? `ip:${clientAddress}` : "ip:unknown";
}

export function hashApiRateLimitSubject(subject: string) {
  return createHash("sha256").update(subject).digest("hex");
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

export async function checkApiSubjectRateLimit({
  subject,
  action,
  windowSeconds,
  maxRequests,
}: CheckApiSubjectRateLimitOptions): Promise<ApiRateLimitDecision> {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error("Supabase admin client not initialized");
  }

  const subjectHash = hashApiRateLimitSubject(subject);
  const { data, error } = await admin.rpc("check_api_subject_rate_limit", {
    p_subject_hash: subjectHash,
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
