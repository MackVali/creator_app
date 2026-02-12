import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";

const REVENUECAT_ENTITLEMENT_IDENTIFIER = "creator_plus";
const REVENUECAT_BASE_URL = "https://api.revenuecat.com/v1";

export const runtime = "nodejs";

async function parseJsonBody<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function normalizeAppUserId(rawId: string | undefined | null, fallback: string) {
  const trimmed = rawId?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

type RevenueCatEntitlementsPayload = Record<
  string,
  {
    expires_date?: string | null;
    expiresDate?: string | null;
    is_active?: boolean;
    isActive?: boolean;
  }
>;

type RevenueCatFetchResult =
  | {
      ok: true;
      isActive: boolean;
      currentPeriodEnd: string | null;
    }
  | {
      ok: false;
      message: string;
    };

function parseExpiration(value?: string | null) {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function findEntitlement(
  entitlements: RevenueCatEntitlementsPayload | undefined
): RevenueCatEntitlementsPayload[string] | null {
  if (!entitlements) {
    return null;
  }

  const normalizedIdentifier = REVENUECAT_ENTITLEMENT_IDENTIFIER.toLowerCase();

  for (const [key, entitlement] of Object.entries(entitlements)) {
    if (key.toLowerCase() === normalizedIdentifier) {
      return entitlement;
    }
  }

  return null;
}

async function fetchRevenueCatEntitlement(appUserId: string): Promise<RevenueCatFetchResult> {
  const secretKey = process.env.REVENUECAT_SECRET_KEY;
  if (!secretKey) {
    return {
      ok: false,
      message: "RevenueCat configuration is incomplete.",
    };
  }

  const endpoint = `${REVENUECAT_BASE_URL}/subscribers/${encodeURIComponent(appUserId)}`;
  let response: Response;

  try {
    response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        Accept: "application/json",
      },
    });
  } catch (cause) {
    console.error("RevenueCat request failed", cause);
    return {
      ok: false,
      message: "Unable to verify entitlement right now.",
    };
  }

  if (!response.ok) {
    console.error("RevenueCat returned an error", response.status);
    return {
      ok: false,
      message: "Unable to verify entitlement right now.",
    };
  }

  const payload = (await response.json().catch(() => null)) as {
    subscriber?: { entitlements?: RevenueCatEntitlementsPayload };
  } | null;

  const entitlement = findEntitlement(payload?.subscriber?.entitlements);
  if (!entitlement) {
    return { ok: true, isActive: false, currentPeriodEnd: null };
  }

  const expiresAt =
    parseExpiration(entitlement.expires_date) ?? parseExpiration(entitlement.expiresDate);
  const isActiveField =
    entitlement.is_active ?? entitlement.isActive ?? (expiresAt ? expiresAt > Date.now() : false);

  const normalizedExpiration =
    expiresAt === null ? null : new Date(expiresAt).toISOString();

  return {
    ok: true,
    isActive: Boolean(isActiveField),
    currentPeriodEnd: normalizedExpiration,
  };
}

type RequestBody = { appUserId?: string };

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Unable to initialize authentication." },
      { status: 500 }
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await parseJsonBody<RequestBody>(request)) ?? undefined;
  const appUserId = normalizeAppUserId(body?.appUserId, user.id);

  const entitlementResult = await fetchRevenueCatEntitlement(appUserId);
  if (!entitlementResult.ok) {
    return NextResponse.json({ error: entitlementResult.message }, { status: 502 });
  }

  const { data: existingEntitlement } = await supabase
    .from("user_entitlements")
    .select("tier")
    .eq("user_id", user.id)
    .maybeSingle();

  const existingTier = (existingEntitlement?.tier ?? "").trim().toUpperCase();
  const computedTier = entitlementResult.isActive ? "CREATOR PLUS" : "CREATOR";
  const tier = existingTier === "ADMIN" ? "ADMIN" : computedTier;

  const { error: upsertError } = await supabase
    .from("user_entitlements")
    .upsert(
      {
        user_id: user.id,
        tier,
        is_active: entitlementResult.isActive,
        current_period_end: entitlementResult.currentPeriodEnd,
      },
      { onConflict: "user_id" }
    );

  if (upsertError) {
    console.error("Failed to persist entitlement", upsertError);
    return NextResponse.json(
      { error: "Unable to save entitlement." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      tier,
      is_active: entitlementResult.isActive,
      current_period_end: entitlementResult.currentPeriodEnd,
    },
    { status: 200 }
  );
}
