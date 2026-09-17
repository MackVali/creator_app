import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

const PUBLIC_PROFILE_COLUMNS = [
  "user_id",
  "username",
  "name",
  "bio",
  "city",
  "avatar_url",
  "banner_url",
  "verified",
  "theme_color",
  "font_family",
  "accent_color",
].join(", ");

export async function GET(
  _: Request,
  context: { params: Promise<{ username?: string }> },
) {
  const { username: rawUsername = "" } = await context.params;
  const username = rawUsername.trim().toLowerCase();

  if (!username) {
    return NextResponse.json({ error: "Username is required." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Profile service unavailable." }, { status: 503 });
  }

  const { data, error } = await admin
    .from("profiles")
    .select(PUBLIC_PROFILE_COLUMNS)
    .ilike("username", username)
    .or("is_private.eq.false,is_private.is.null")
    .maybeSingle();

  if (error) {
    console.error("[public/profile] Failed to load profile", error);
    return NextResponse.json({ error: "Unable to load profile." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  return NextResponse.json({ profile: data }, { status: 200 });
}
