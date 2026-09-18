import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getSupabaseServer } from "@/lib/supabase";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _: Request,
  context: { params: Promise<{ username?: string }> },
) {
  const { username: rawUsername = "" } = await context.params;
  const username = rawUsername.trim().toLowerCase();

  if (!username) {
    return NextResponse.json(
      { error: "Username is required to load friend stats." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[profile/friend-stats] admin client missing; responding with zero counts.");
    }
    return NextResponse.json(
      { friends: 0, following: 0, followers: 0 },
      { status: 200 },
    );
  }

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
      console.error("Failed to resolve friend-stats viewer", authError);
    }

    viewerId = user?.id ?? null;
  }

  const { data: targetProfile, error: lookupError } = await admin
    .from("profiles")
    .select("user_id, is_private")
    .ilike("username", username)
    .maybeSingle();

  if (lookupError) {
    console.error("Failed to resolve profile id", lookupError);
    return NextResponse.json(
      { error: "Unable to load friend stats." },
      { status: 500 },
    );
  }

  const targetId = targetProfile?.user_id ?? null;
  if (
    !targetId ||
    (targetProfile?.is_private === true && viewerId !== targetId)
  ) {
    return NextResponse.json(
      { error: "Profile not found." },
      { status: 404 },
    );
  }

  const [followingResult, followerResult] = await Promise.all([
    admin
      .from("friend_connections")
      .select("friend_user_id")
      .eq("user_id", targetId),
    admin
      .from("friend_connections")
      .select("user_id")
      .eq("friend_user_id", targetId),
  ]);

  if (followingResult.error || followerResult.error) {
    console.error(
      "Failed to load friend stats",
      followingResult.error ?? followerResult.error,
    );
    return NextResponse.json(
      { error: "Unable to load friend stats." },
      { status: 500 },
    );
  }

  const followingIds = new Set(
    (followingResult.data ?? [])
      .map((row) => row.friend_user_id)
      .filter((id): id is string => typeof id === "string" && !!id),
  );

  const followerIds = new Set(
    (followerResult.data ?? [])
      .map((row) => row.user_id)
      .filter((id): id is string => typeof id === "string" && !!id),
  );

  let mutualCount = 0;
  for (const id of followingIds) {
    if (followerIds.has(id)) {
      mutualCount++;
    }
  }

  return NextResponse.json({
    friends: mutualCount,
    following: followingIds.size,
    followers: followerIds.size,
  });
}
