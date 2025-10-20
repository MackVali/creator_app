import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { FriendSearchResult } from "@/types/friends";

type SearchFriendRow = {
  user_id: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  profile_url: string | null;
  mutual_friend_count: number | null;
};

const DEFAULT_LIMIT = 12;

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("q")?.trim();

  if (!search) {
    return NextResponse.json({ results: [] as FriendSearchResult[] }, { status: 200 });
  }

  try {
    const supabase = await createSupabaseServerClient();

    if (!supabase) {
      return NextResponse.json(
        { error: "Unable to create Supabase client", results: [] },
        { status: 500 }
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ results: [] }, { status: 401 });
    }

    const { data, error } = await supabase.rpc("search_friend_profiles", {
      p_query: search,
      p_limit: DEFAULT_LIMIT,
    });

    if (error) {
      console.error("Failed to search friend profiles", error);
      return NextResponse.json(
        { error: "Unable to search right now.", results: [] },
        { status: 500 }
      );
    }

    const results: FriendSearchResult[] = (data ?? []).map((row: SearchFriendRow) => ({
      userId: row.user_id,
      username: (row.username ?? "").trim(),
      displayName: (row.display_name ?? row.username ?? "").trim() || "Creator",
      avatarUrl: row.avatar_url,
      profileUrl: row.profile_url,
      mutualFriends: row.mutual_friend_count,
    }));

    return NextResponse.json({ results }, { status: 200 });
  } catch (error) {
    console.error("Unhandled error searching for friends", error);
    return NextResponse.json(
      { error: "Unexpected error searching for friends.", results: [] },
      { status: 500 }
    );
  }
}
