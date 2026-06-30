import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSupabaseServer } from "@/lib/supabase";
import { createAdminClient } from "@/lib/supabase/admin";

const GENERIC_SIGN_IN_ERROR = "Invalid email or username or password";

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

export async function POST(request: Request) {
  const parsed = SignInSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return genericFailure();
  }

  const username = normalizeUsername(parsed.data.username);
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
