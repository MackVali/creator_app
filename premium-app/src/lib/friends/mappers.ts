import type { Database } from "@/types/supabase";
import type { Friend } from "@/types/friends";

type FriendConnectionRow =
  Database["public"]["Tables"]["friend_connections"]["Row"];

export function mapFriendConnection(row: FriendConnectionRow): Friend {
  return {
    id: row.id,
    userId: row.friend_user_id,
    username: row.friend_username,
    displayName: row.friend_display_name ?? row.friend_username,
    avatarUrl: row.friend_avatar_url,
    profileUrl: row.friend_profile_url,
    hasRing: row.has_ring,
    isOnline: row.is_online,
  };
}
