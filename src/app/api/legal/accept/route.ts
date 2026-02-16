import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";

const TERMS_VERSION = "1.0";
const PRIVACY_VERSION = "1.0";
const TERMS_URL = "/legal/terms";
const PRIVACY_URL = "/legal/privacy";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client unavailable" },
      { status: 500 }
    );
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const user = session?.user;
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  const acceptedAt = new Date().toISOString();

  const { error } = await supabase
    .from("user_legal_acceptances")
    .upsert(
      {
        user_id: user.id,
        terms_accepted_at: acceptedAt,
        privacy_accepted_at: acceptedAt,
        terms_version: TERMS_VERSION,
        privacy_version: PRIVACY_VERSION,
        terms_url: TERMS_URL,
        privacy_url: PRIVACY_URL,
      },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("Failed to record legal acceptance", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
