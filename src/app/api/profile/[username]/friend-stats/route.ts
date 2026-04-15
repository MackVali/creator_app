import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_: Request, context: { params?: { username?: string } }) {
  const username = (context.params?.username ?? "").trim().toLowerCase();

  if (!username) {
    return NextResponse.json(
      { error: "Username is required to load friend stats." }, 
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  if (!supabase) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[profile/friend-stats] admin client missing; responding with zero counts.");
    }
    return NextResponse.json(
      { friends: 0, following: 0, followers: 0 },
      { status: 200 },
    );
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

  const [
    followingResult,
    followerResult,
  ] = await Promise.all([
    supabase
      .from("friend_connections")
      .select("friend_user_id")
      .eq("user_id", targetId),
    supabase
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
