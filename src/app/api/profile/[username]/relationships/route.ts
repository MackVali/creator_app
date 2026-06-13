import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase";

type RelationshipView = "following" | "followers";

type ProfileRelationshipUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  viewerFollowsUser: boolean;
  userFollowsViewer: boolean;
  isViewer: boolean;
  canInteract: boolean;
};

function resolveDisplayName(profile?: {
  name?: string | null;
  username?: string | null;
}) {
  const trimmed = profile?.name?.trim();
  return trimmed ? trimmed : profile?.username ?? "Unknown";
}

function normalizeProfileRows(
  profiles: Array<{
    user_id: string | null;
    username: string | null;
    name: string | null;
    avatar_url: string | null;
  }>,
  viewerId: string | null,
  viewerFollowsUserIds: Set<string>,
  usersFollowingViewerIds: Set<string>,
): ProfileRelationshipUser[] {
  return profiles
    .filter(
      (profile): profile is {
        user_id: string;
        username: string;
        name: string | null;
        avatar_url: string | null;
      } =>
        typeof profile.user_id === "string" &&
        profile.user_id.length > 0 &&
        typeof profile.username === "string" &&
        profile.username.trim().length > 0,
    )
    .map((profile) => ({
      id: profile.user_id,
      username: profile.username.trim(),
      displayName: resolveDisplayName(profile),
      avatarUrl: profile.avatar_url ?? null,
      viewerFollowsUser: viewerFollowsUserIds.has(profile.user_id),
      userFollowsViewer: usersFollowingViewerIds.has(profile.user_id),
      isViewer: viewerId === profile.user_id,
      canInteract: Boolean(viewerId) && viewerId !== profile.user_id,
    }));
}

export async function GET(
  request: Request,
  context: { params: Promise<{ username?: string }> },
) {
  const { searchParams } = new URL(request.url);
  const rawView = (searchParams.get("view") ?? "").toLowerCase();
  const view: RelationshipView =
    rawView === "followers" ? "followers" : "following";
  const { username: rawUsername = "" } = await context.params;
  const username = rawUsername.trim().toLowerCase();

  if (!username) {
    return NextResponse.json(
      { error: "Username is required to load relationships." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const cookieStore = await cookies();
  const serverSupabase = getSupabaseServer({
    get: (name) => cookieStore.get(name),
  });
  let viewerId: string | null = null;

  if (serverSupabase) {
    const {
      data: { user },
      error: authError,
    } = await serverSupabase.auth.getUser();

    if (authError) {
      console.error("Failed to resolve relationship popup viewer", authError);
    }

    viewerId = user?.id ?? null;
  }

  if (!supabase) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[profile/relationships] admin client missing; responding with empty list.");
    }
    return NextResponse.json({ users: [] }, { status: 200 });
  }

  const { data: targetId, error: lookupError } = await supabase.rpc(
    "get_profile_user_id",
    { p_username: username },
  );

  if (lookupError || !targetId) {
    console.error("Failed to resolve profile id", lookupError);
    return NextResponse.json(
      { error: "Profile not found." },
      { status: 404 },
    );
  }

  const { data: relationshipRows, error: relationshipError } =
    view === "followers"
      ? await supabase
          .from("friend_connections")
          .select("user_id")
          .eq("friend_user_id", targetId)
      : await supabase
          .from("friend_connections")
          .select("friend_user_id")
          .eq("user_id", targetId);

  if (relationshipError) {
    console.error("Failed to load profile relationships", relationshipError);
    return NextResponse.json(
      { error: "Unable to load relationships." },
      { status: 500 },
    );
  }

  const relatedIds = Array.from(
    new Set(
      (relationshipRows ?? [])
        .map((row) =>
          view === "followers"
            ? (row as { user_id?: string | null }).user_id
            : (row as { friend_user_id?: string | null }).friend_user_id,
        )
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  if (relatedIds.length === 0) {
    return NextResponse.json({ users: [] }, { status: 200 });
  }

  const profilesQuery = supabase
    .from("profiles")
    .select("user_id, username, name, avatar_url")
    .in("user_id", relatedIds)
    .order("name", { ascending: true });
  const viewerFollowingQuery = viewerId
    ? supabase
        .from("friend_connections")
        .select("friend_user_id")
        .eq("user_id", viewerId)
        .in("friend_user_id", relatedIds)
    : Promise.resolve({ data: [], error: null });
  const usersFollowingViewerQuery = viewerId
    ? supabase
        .from("friend_connections")
        .select("user_id")
        .eq("friend_user_id", viewerId)
        .in("user_id", relatedIds)
    : Promise.resolve({ data: [], error: null });

  const [
    { data: profiles, error: profilesError },
    { data: viewerFollowingRows, error: viewerFollowingError },
    { data: usersFollowingViewerRows, error: usersFollowingViewerError },
  ] = await Promise.all([
    profilesQuery,
    viewerFollowingQuery,
    usersFollowingViewerQuery,
  ]);

  if (profilesError) {
    console.error("Failed to load relationship profiles", profilesError);
    return NextResponse.json(
      { error: "Unable to load relationships." },
      { status: 500 },
    );
  }

  if (viewerFollowingError || usersFollowingViewerError) {
    console.error("Failed to load viewer relationship state", {
      viewerFollowingError,
      usersFollowingViewerError,
    });
    return NextResponse.json(
      { error: "Unable to load relationships." },
      { status: 500 },
    );
  }

  const viewerFollowsUserIds = new Set(
    (viewerFollowingRows ?? [])
      .map((row) => row.friend_user_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );
  const usersFollowingViewerIds = new Set(
    (usersFollowingViewerRows ?? [])
      .map((row) => row.user_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );

  return NextResponse.json(
    {
      users: normalizeProfileRows(
        profiles ?? [],
        viewerId,
        viewerFollowsUserIds,
        usersFollowingViewerIds,
      ),
    },
    { status: 200 },
  );
}
