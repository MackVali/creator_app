import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { userHasAppManagerAccess } from "@/lib/auth/userRoles";
import { requirePlus } from "@/lib/entitlements/requirePlus";
import { getSupabaseServer } from "@/lib/supabase";

const circleColumns =
  "id, owner_user_id, name, icon_emoji, circle_type, status, description, created_at, updated_at";

const memberColumns =
  "id, circle_id, user_id, role, status, invited_by_user_id, skill_constraint_ids, location_context_ids, created_at, updated_at";

const habitColumns =
  "id, circle_id, name, habit_type, recurrence, recurrence_days, duration_minutes, created_at, updated_at";

type CircleType = "HOUSEHOLD" | "TEAM" | "CLIENTS" | "STUDIO" | "CUSTOM";

type CircleRow = {
  id: string;
  owner_user_id: string;
  name: string;
  icon_emoji: string | null;
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
  skill_constraint_ids: string[] | null;
  location_context_ids: string[] | null;
  created_at: string;
  updated_at: string;
};

type CircleHabitRow = {
  id: string;
  circle_id: string | null;
  name: string | null;
  habit_type: string | null;
  recurrence: string | null;
  recurrence_days: number[] | null;
  duration_minutes: number | null;
  created_at: string;
  updated_at: string;
};

type ProfileRow = {
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
};

type OwnerSkillRow = {
  id: string;
  name: string | null;
  icon: string | null;
};

type OwnerLocationContextRow = {
  id: string;
  label: string | null;
  value: string | null;
};

type UpdateCircleBody = {
  name?: unknown;
  icon_emoji?: unknown;
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

  if (!userHasAppManagerAccess(user)) {
    return NextResponse.json(
      { error: "Circle not found or access denied." },
      { status: 404 }
    );
  }

  const { data: circle, error: circleError } = await supabase
    .from("circles")
    .select(circleColumns)
    .eq("id", circleId)
    .eq("status", "ACTIVE")
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

  let ownerSkills: OwnerSkillRow[] = [];
  const { data: skillOptions, error: skillOptionsError } = await supabase
    .from("skills")
    .select("id, name, icon")
    .eq("user_id", circle.owner_user_id)
    .order("name", { ascending: true })
    .returns<OwnerSkillRow[]>();

  if (skillOptionsError) {
    console.error("Failed to load circle owner skills", skillOptionsError);
  } else {
    ownerSkills = (skillOptions ?? []).map((skill) => ({
      id: skill.id,
      name: skill.name?.trim() || "Untitled skill",
      icon: skill.icon ?? null,
    }));
  }

  let ownerLocationContexts: OwnerLocationContextRow[] = [];
  const { data: locationOptions, error: locationOptionsError } = await supabase
    .from("location_contexts")
    .select("id, label, value")
    .eq("user_id", circle.owner_user_id)
    .order("label", { ascending: true })
    .returns<OwnerLocationContextRow[]>();

  if (locationOptionsError) {
    console.error(
      "Failed to load circle owner location contexts",
      locationOptionsError
    );
  } else {
    ownerLocationContexts = (locationOptions ?? []).map((locationContext) => ({
      id: locationContext.id,
      label: locationContext.label ?? null,
      value: locationContext.value ?? null,
    }));
  }

  const { data: habits, error: habitsError } = await supabase
    .from("habits")
    .select(habitColumns)
    .eq("circle_id", circleId)
    .order("created_at", { ascending: false })
    .returns<CircleHabitRow[]>();

  if (habitsError) {
    console.error("Failed to load circle habits", habitsError);
    return NextResponse.json(
      { error: "Unable to load Circle habits." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      circle,
      viewerCanManageMembers: circle.owner_user_id === user.id,
      habits: habits ?? [],
      ownerSkills,
      ownerLocationContexts,
      members: circleMembers.map((member) => ({
        ...member,
        skill_constraint_ids: member.skill_constraint_ids ?? [],
        location_context_ids: member.location_context_ids ?? [],
        profile: profileByUserId.get(member.user_id) ?? null,
      })),
    },
    { status: 200 }
  );
}

export async function PATCH(request: Request, context: CircleDetailParams) {
  const gate = await requirePlus();
  if (gate) {
    return gate;
  }

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

  if (!userHasAppManagerAccess(user)) {
    return NextResponse.json(
      { error: "Circle not found or access denied." },
      { status: 404 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as UpdateCircleBody;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const hasIconEmoji = Object.prototype.hasOwnProperty.call(
    body,
    "icon_emoji"
  );
  const iconEmoji =
    hasIconEmoji && typeof body.icon_emoji === "string"
      ? body.icon_emoji.trim() || null
      : null;

  if (!name) {
    return NextResponse.json(
      { error: "Name is required." },
      { status: 400 }
    );
  }

  const { data: circle, error: circleError } = await supabase
    .from("circles")
    .select("id")
    .eq("id", circleId)
    .eq("owner_user_id", user.id)
    .eq("status", "ACTIVE")
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (circleError) {
    console.error("Failed to verify circle ownership", circleError);
    return NextResponse.json(
      { error: "Unable to verify circle access." },
      { status: 500 }
    );
  }

  if (!circle) {
    return NextResponse.json(
      { error: "Circle not found or access denied." },
      { status: 404 }
    );
  }

  const updateValues: {
    name: string;
    updated_at: string;
    icon_emoji?: string | null;
  } = {
    name,
    updated_at: new Date().toISOString(),
  };

  if (hasIconEmoji) {
    updateValues.icon_emoji = iconEmoji;
  }

  const { data: updatedCircle, error: updateError } = await supabase
    .from("circles")
    .update(updateValues)
    .eq("id", circleId)
    .eq("owner_user_id", user.id)
    .eq("status", "ACTIVE")
    .select(circleColumns)
    .maybeSingle<CircleRow>();

  if (updateError) {
    console.error("Failed to update circle", updateError);
    return NextResponse.json(
      { error: "Unable to update circle." },
      { status: 500 }
    );
  }

  if (!updatedCircle) {
    return NextResponse.json(
      { error: "Circle can no longer be updated." },
      { status: 409 }
    );
  }

  return NextResponse.json({ circle: updatedCircle }, { status: 200 });
}

export async function DELETE(_request: Request, context: CircleDetailParams) {
  const gate = await requirePlus();
  if (gate) {
    return gate;
  }

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

  if (!userHasAppManagerAccess(user)) {
    return NextResponse.json(
      { error: "Circle not found or access denied." },
      { status: 404 }
    );
  }

  const { data: circle, error: circleError } = await supabase
    .from("circles")
    .select("id")
    .eq("id", circleId)
    .eq("owner_user_id", user.id)
    .eq("status", "ACTIVE")
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (circleError) {
    console.error("Failed to verify circle ownership", circleError);
    return NextResponse.json(
      { error: "Unable to verify circle access." },
      { status: 500 }
    );
  }

  if (!circle) {
    return NextResponse.json(
      { error: "Circle not found or access denied." },
      { status: 404 }
    );
  }

  const { data: deletedCircle, error: deleteError } = await supabase
    .from("circles")
    .update({
      status: "DELETED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", circleId)
    .eq("owner_user_id", user.id)
    .eq("status", "ACTIVE")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (deleteError) {
    console.error("Failed to delete circle", deleteError);
    return NextResponse.json(
      { error: "Unable to delete circle." },
      { status: 500 }
    );
  }

  if (!deletedCircle) {
    return NextResponse.json(
      { error: "Circle can no longer be deleted." },
      { status: 409 }
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
