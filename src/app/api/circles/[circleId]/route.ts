import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServer } from "@/lib/supabase";

const circleColumns =
  "id, owner_user_id, name, circle_type, status, description, created_at, updated_at";

const memberColumns =
  "id, circle_id, user_id, role, status, invited_by_user_id, created_at, updated_at";

type CircleType = "HOUSEHOLD" | "TEAM" | "CLIENTS" | "STUDIO" | "CUSTOM";

type CircleRow = {
  id: string;
  owner_user_id: string;
  name: string;
  circle_type: CircleType;
  status: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type CircleMemberRow = {
  id: string;
  circle_id: string;
  user_id: string;
  role: string;
  status: string;
  invited_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type ProfileRow = {
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
};

type CircleDetailParams = {
  params: Promise<{
    circleId: string;
  }>;
};

async function getServerClient() {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer(
    cookieStore as unknown as Parameters<typeof getSupabaseServer>[0]
  );

  return supabase ? (supabase as unknown as SupabaseClient) : null;
}

export async function GET(_request: Request, context: CircleDetailParams) {
  const { circleId } = await context.params;
  const supabase = await getServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: circle, error: circleError } = await supabase
    .from("circles")
    .select(circleColumns)
    .eq("id", circleId)
    .limit(1)
    .maybeSingle<CircleRow>();

  if (circleError) {
    console.error("Failed to load circle", circleError);
    return NextResponse.json(
      { error: "Unable to load circle." },
      { status: 500 }
    );
  }

  if (!circle) {
    return NextResponse.json(
      { error: "Circle not found." },
      { status: 404 }
    );
  }

  const { data: members, error: membersError } = await supabase
    .from("circle_members")
    .select(memberColumns)
    .eq("circle_id", circleId)
    .order("created_at", { ascending: true })
    .returns<CircleMemberRow[]>();

  if (membersError) {
    console.error("Failed to load circle members", membersError);
    return NextResponse.json(
      { error: "Unable to load circle members." },
      { status: 500 }
    );
  }

  const circleMembers = members ?? [];
  const memberIds = Array.from(
    new Set(circleMembers.map((member) => member.user_id))
  );
  const profileByUserId = new Map<string, ProfileRow>();

  if (memberIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .schema("public")
      .from("profiles")
      .select("user_id, username, name, avatar_url")
      .in("user_id", memberIds)
      .returns<ProfileRow[]>();

    if (profilesError) {
      console.error("Failed to load circle member profiles", profilesError);
    } else {
      for (const profile of profiles ?? []) {
        profileByUserId.set(profile.user_id, profile);
      }
    }
  }

  return NextResponse.json(
    {
      circle,
      viewerCanManageMembers: circle.owner_user_id === user.id,
      members: circleMembers.map((member) => ({
        ...member,
        profile: profileByUserId.get(member.user_id) ?? null,
      })),
    },
    { status: 200 }
  );
}
