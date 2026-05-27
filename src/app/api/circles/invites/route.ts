import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServer } from "@/lib/supabase";

const memberColumns =
  "id, circle_id, user_id, role, status, invited_by_user_id, skill_constraint_ids, location_context_ids, created_at, updated_at";

const circleColumns =
  "id, owner_user_id, name, circle_type, status, description, created_at, updated_at";

const profileColumns = "user_id, username, name, avatar_url";

type CircleRow = {
  id: string;
  owner_user_id: string;
  name: string;
  circle_type: string;
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
  skill_constraint_ids: string[] | null;
  location_context_ids: string[] | null;
  created_at: string;
  updated_at: string;
};

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

export async function GET() {
  const supabase = await getServerClient();

  if (!supabase) {
    return NextResponse.json({ invites: [] }, { status: 200 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ invites: [] }, { status: 200 });
  }

  const { data: invites, error: invitesError } = await supabase
    .schema("public")
    .from("circle_members")
    .select(memberColumns)
    .eq("user_id", user.id)
    .eq("status", "INVITED")
    .order("created_at", { ascending: false })
    .returns<CircleMemberRow[]>();

  if (invitesError) {
    console.error("Failed to load circle invites", invitesError);
    return NextResponse.json(
      { error: "Unable to load circle invites." },
      { status: 500 }
    );
  }

  const circleInvites = invites ?? [];

  if (circleInvites.length === 0) {
    return NextResponse.json({ invites: [] }, { status: 200 });
  }

  const circleIds = Array.from(
    new Set(circleInvites.map((invite) => invite.circle_id))
  );
  const { data: circles, error: circlesError } = await supabase
    .schema("public")
    .from("circles")
    .select(circleColumns)
    .in("id", circleIds)
    .returns<CircleRow[]>();

  if (circlesError) {
    console.error("Failed to load invite circles", circlesError);
    return NextResponse.json(
      { error: "Unable to load circle invites." },
      { status: 500 }
    );
  }

  const circleById = new Map(
    (circles ?? []).map((circle) => [circle.id, circle])
  );
  const invitedByUserIds = Array.from(
    new Set(
      circleInvites
        .map((invite) => invite.invited_by_user_id)
        .filter((userId): userId is string => typeof userId === "string")
    )
  );
  const profileByUserId = new Map<string, ProfileRow>();

  if (invitedByUserIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .schema("public")
      .from("profiles")
      .select(profileColumns)
      .in("user_id", invitedByUserIds)
      .returns<ProfileRow[]>();

    if (profilesError) {
      console.error("Failed to load invite sender profiles", profilesError);
    } else {
      for (const profile of profiles ?? []) {
        profileByUserId.set(profile.user_id, profile);
      }
    }
  }

  return NextResponse.json(
    {
      invites: circleInvites.map((invite) => ({
        ...invite,
        circle: circleById.get(invite.circle_id) ?? null,
        invitedByProfile: invite.invited_by_user_id
          ? profileByUserId.get(invite.invited_by_user_id) ?? null
          : null,
      })),
    },
    { status: 200 }
  );
}
