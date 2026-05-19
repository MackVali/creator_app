import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requirePlus } from "@/lib/entitlements/requirePlus";
import { getSupabaseServer } from "@/lib/supabase";

const circleColumns =
  "id, owner_user_id, name, circle_type, status, description, created_at, updated_at";

const circleTypes = new Set([
  "HOUSEHOLD",
  "TEAM",
  "CLIENTS",
  "STUDIO",
  "CUSTOM",
]);

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
  circle_id: string | null;
  user_id: string;
  role: string;
  created_at: string;
};

type CirclePreviewMemberRow = {
  circle_id: string | null;
  user_id: string;
  role: string;
  created_at: string;
};

type ProfileRow = {
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
};

type CreateCircleBody = {
  name?: unknown;
  circleType?: unknown;
  description?: unknown;
};

async function getServerClient() {
  const cookieStore = await cookies();
  const supabase = getSupabaseServer(
    cookieStore as unknown as Parameters<typeof getSupabaseServer>[0]
  );

  return supabase ? (supabase as unknown as SupabaseClient) : null;
}

function normalizeCircleType(value: unknown): CircleType {
  if (typeof value !== "string") return "CUSTOM";

  const normalized = value.trim().toUpperCase();

  return circleTypes.has(normalized) ? (normalized as CircleType) : "CUSTOM";
}

function normalizeDescription(value: unknown) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function shortenUserId(userId: string) {
  if (userId.length <= 12) return userId;

  return `${userId.slice(0, 6)}...${userId.slice(-4)}`;
}

function getInitials(displayName: string, fallback: string) {
  const words = displayName.trim().split(/\s+/).filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  return (words[0]?.slice(0, 2) || fallback.slice(0, 2)).toUpperCase();
}

export async function GET() {
  const supabase = await getServerClient();

  if (!supabase) {
    return NextResponse.json({ circles: [] }, { status: 200 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ circles: [] }, { status: 200 });
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("circle_members")
    .select("circle_id, user_id, role, created_at")
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .returns<CircleMemberRow[]>();

  if (membershipsError) {
    console.error("Failed to load circle memberships", membershipsError);
    return NextResponse.json(
      { circles: [], error: "Unable to load circles." },
      { status: 500 }
    );
  }

  const memberCircleIds = [
    ...new Set(
      (memberships ?? [])
        .map((membership) => membership.circle_id)
        .filter((circleId): circleId is string => typeof circleId === "string")
    ),
  ];

  const circlesQuery = supabase
    .from("circles")
    .select(circleColumns)
    .order("updated_at", { ascending: false });

  const { data: circles, error: circlesError } =
    memberCircleIds.length > 0
      ? await circlesQuery
          .or(
            `owner_user_id.eq.${user.id},id.in.(${memberCircleIds.join(",")})`
          )
          .returns<CircleRow[]>()
      : await circlesQuery.eq("owner_user_id", user.id).returns<CircleRow[]>();

  if (circlesError) {
    console.error("Failed to load circles", circlesError);
    return NextResponse.json(
      { circles: [], error: "Unable to load circles." },
      { status: 500 }
    );
  }

  const circleRows = circles ?? [];
  const circleIds = circleRows.map((circle) => circle.id);
  const viewerRoleByCircleId = new Map(
    (memberships ?? [])
      .filter((membership) => typeof membership.circle_id === "string")
      .map((membership) => [membership.circle_id as string, membership.role])
  );
  const activeMembersByCircleId = new Map<string, CirclePreviewMemberRow[]>();
  const profileByUserId = new Map<string, ProfileRow>();

  if (circleIds.length > 0) {
    const { data: activeMembers, error: activeMembersError } = await supabase
      .from("circle_members")
      .select("circle_id, user_id, role, created_at")
      .in("circle_id", circleIds)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: true })
      .returns<CirclePreviewMemberRow[]>();

    if (activeMembersError) {
      console.error("Failed to load circle member previews", activeMembersError);
    } else {
      for (const member of activeMembers ?? []) {
        if (!member.circle_id) continue;

        const membersForCircle =
          activeMembersByCircleId.get(member.circle_id) ?? [];
        membersForCircle.push(member);
        activeMembersByCircleId.set(member.circle_id, membersForCircle);
      }

      const previewUserIds = Array.from(
        new Set(
          circleIds.flatMap((circleId) =>
            (activeMembersByCircleId.get(circleId) ?? [])
              .slice(0, 3)
              .map((member) => member.user_id)
          )
        )
      );

      if (previewUserIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .schema("public")
          .from("profiles")
          .select("user_id, username, name, avatar_url")
          .in("user_id", previewUserIds)
          .returns<ProfileRow[]>();

        if (profilesError) {
          console.error("Failed to load circle preview profiles", profilesError);
        } else {
          for (const profile of profiles ?? []) {
            profileByUserId.set(profile.user_id, profile);
          }
        }
      }
    }
  }

  return NextResponse.json(
    {
      circles: circleRows.map((circle) => {
        const members = activeMembersByCircleId.get(circle.id) ?? [];

        return {
          ...circle,
          viewerRole:
            circle.owner_user_id === user.id
              ? "OWNER"
              : viewerRoleByCircleId.get(circle.id) ?? null,
          activeMemberCount: members.length,
          memberPreview: members.slice(0, 3).map((member) => {
            const profile = profileByUserId.get(member.user_id);
            const fallback = shortenUserId(member.user_id);
            const displayName =
              profile?.name?.trim() || profile?.username?.trim() || fallback;

            return {
              userId: member.user_id,
              role: member.role,
              displayName,
              username: profile?.username ?? null,
              avatarUrl: profile?.avatar_url ?? null,
              initials: getInitials(displayName, fallback),
            };
          }),
        };
      }),
    },
    { status: 200 }
  );
}

export async function POST(request: Request) {
  const gate = await requirePlus();
  if (gate) {
    return gate;
  }

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

  const body = (await request.json().catch(() => ({}))) as CreateCircleBody;
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json(
      { error: "Name is required." },
      { status: 400 }
    );
  }

  const circleType = normalizeCircleType(body.circleType);
  const description = normalizeDescription(body.description);

  const { data: circle, error: circleError } = await supabase
    .from("circles")
    .insert({
      owner_user_id: user.id,
      name,
      circle_type: circleType,
      description,
      status: "ACTIVE",
    })
    .select(circleColumns)
    .single<CircleRow>();

  if (circleError) {
    console.error("Failed to create circle", circleError);
    return NextResponse.json(
      { error: "Unable to create circle." },
      { status: 500 }
    );
  }

  const { error: membershipError } = await supabase
    .from("circle_members")
    .insert({
      circle_id: circle.id,
      user_id: user.id,
      role: "OWNER",
      status: "ACTIVE",
      invited_by_user_id: user.id,
    });

  if (membershipError) {
    console.error("Failed to create owner circle membership", membershipError);
  }

  return NextResponse.json({ circle }, { status: 201 });
}
