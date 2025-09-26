import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../../../../../types/supabase";

const GENERIC_ERROR = "Invalid username or password";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const rawInput =
      typeof body?.username === "string" ? body.username.trim() : "";
    const normalizedUsername = rawInput.replace(/^@+/, "").toLowerCase();

    if (!normalizedUsername) {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing Supabase credentials for username lookup");
      return NextResponse.json(
        { error: "Authentication service unavailable" },
        { status: 500 }
      );
    }

    const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const candidates = Array.from(
      new Set(
        [
          normalizedUsername,
          rawInput.toLowerCase(),
          `@${normalizedUsername}`,
        ].filter((value) => value && typeof value === "string")
      )
    );

    let profile: { user_id: string } | null = null;

    for (const candidate of candidates) {
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("user_id")
        .ilike("username", candidate)
        .maybeSingle();

      if (profileError) {
        console.error("Failed to fetch profile for username:", profileError);
        return NextResponse.json(
          { error: "Authentication service unavailable" },
          { status: 500 }
        );
      }

      if (data?.user_id) {
        profile = data;
        break;
      }
    }

    if (!profile?.user_id) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 404 });
    }

    const { data: userResponse, error: userError } =
      await supabase.auth.admin.getUserById(profile.user_id);

    if (userError || !userResponse?.user?.email) {
      if (userError) {
        console.error("Failed to fetch user for username:", userError);
      }
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 404 });
    }

    return NextResponse.json({ email: userResponse.user.email });
  } catch (error) {
    console.error("Unexpected error resolving username:", error);
    return NextResponse.json(
      { error: "Authentication service unavailable" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
