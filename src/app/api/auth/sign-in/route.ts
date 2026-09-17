import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSupabaseServer } from "@/lib/supabase";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  checkApiSubjectRateLimit,
  getClientRateLimitSubject,
} from "@/lib/server/rateLimit";

const GENERIC_SIGN_IN_ERROR = "Invalid email or username or password";
const SIGN_IN_WINDOW_SECONDS = 15 * 60;
const SIGN_IN_IP_MAX_REQUESTS = 40;
const SIGN_IN_USERNAME_MAX_REQUESTS = 12;

const SignInSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1),
});

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function genericFailure(status = 400) {
  return NextResponse.json({ error: GENERIC_SIGN_IN_ERROR }, { status });
}

function rateLimitedFailure(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Too many sign-in attempts. Try again later." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    },
  );
}

export async function POST(request: Request) {
  const parsed = SignInSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return genericFailure();
  }

  const username = normalizeUsername(parsed.data.username);

  try {
    const ipLimit = await checkApiSubjectRateLimit({
      subject: getClientRateLimitSubject(request),
      action: "auth_sign_in_ip",
      windowSeconds: SIGN_IN_WINDOW_SECONDS,
      maxRequests: SIGN_IN_IP_MAX_REQUESTS,
    });

    if (!ipLimit.allowed) {
      return rateLimitedFailure(ipLimit.retryAfterSeconds);
    }

    const usernameLimit = await checkApiSubjectRateLimit({
      subject: `username:${username}`,
      action: "auth_sign_in_username",
      windowSeconds: SIGN_IN_WINDOW_SECONDS,
      maxRequests: SIGN_IN_USERNAME_MAX_REQUESTS,
    });

    if (!usernameLimit.allowed) {
      return rateLimitedFailure(usernameLimit.retryAfterSeconds);
    }
  } catch (rateLimitError) {
    console.error("[auth/sign-in] Rate limit check failed.", rateLimitError);
    return genericFailure(503);
  }

  const admin = createAdminClient();

  if (!admin) {
    console.error("[auth/sign-in] Supabase admin client unavailable.");
    return genericFailure(500);
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("user_id")
    .ilike("username", username)
    .maybeSingle();

  if (profileError) {
    console.error("[auth/sign-in] Failed to resolve username.", profileError);
    return genericFailure();
  }

  if (!profile?.user_id) {
    return genericFailure();
  }

  const { data: authUserData, error: authUserError } =
    await admin.auth.admin.getUserById(profile.user_id);

  const email = authUserData?.user?.email?.trim();
  if (authUserError || !email) {
    if (authUserError) {
      console.error("[auth/sign-in] Failed to load auth user.", authUserError);
    }
    return genericFailure();
  }

  const cookieStore = await cookies();
  const supabase = getSupabaseServer(cookieStore);
  if (!supabase) {
    console.error("[auth/sign-in] Supabase server client unavailable.");
    return genericFailure(500);
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (signInError) {
    return genericFailure();
  }

  return NextResponse.json({ ok: true });
}
