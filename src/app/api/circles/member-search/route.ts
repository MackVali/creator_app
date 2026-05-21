import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { userHasAppManagerAccess } from "@/lib/auth/userRoles";
import { getSupabaseServer } from "@/lib/supabase";

const profileColumns = "user_id, username, name, avatar_url";

type ProfileRow = {
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
};

async function getServerClient() {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer(
    cookieStore as unknown as Parameters<typeof getSupabaseServer>[0]
  );

  return supabase ? (supabase as unknown as SupabaseClient) : null;
}

function normalizeQuery(value: string | null) {
  if (!value) return "";

  const trimmed = value.trim();
  const withoutAt = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;

  return withoutAt.trim().toLowerCase();
}

export async function GET(request: Request) {
  const supabase = await getServerClient();

  if (!supabase) {
    return NextResponse.json({ profiles: [] }, { status: 200 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ profiles: [] }, { status: 200 });
  }

  if (!userHasAppManagerAccess(user)) {
    return NextResponse.json({ profiles: [] }, { status: 200 });
  }

  const url = new URL(request.url);
  const query = normalizeQuery(url.searchParams.get("q"));

  if (query.length < 2) {
    return NextResponse.json({ profiles: [] }, { status: 200 });
  }

  const pattern = `%${query}%`;
  const { data: profiles, error: profilesError } = await supabase
    .schema("public")
    .from("profiles")
    .select(profileColumns)
    .or(`username.ilike.${pattern},name.ilike.${pattern}`)
    .neq("user_id", user.id)
    .limit(8)
    .returns<ProfileRow[]>();

  if (profilesError) {
    console.error("Failed to search circle member profiles", profilesError);
    return NextResponse.json(
      { error: "Unable to search profiles." },
      { status: 500 }
    );
  }

  return NextResponse.json({ profiles: profiles ?? [] }, { status: 200 });
}
