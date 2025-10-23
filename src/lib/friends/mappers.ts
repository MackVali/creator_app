import type { Database } from "@/types/supabase";
import type {
  ContactImportStatus,
  DiscoveryProfile,
  Friend,
  SentInvite,
  SuggestedFriend,
} from "@/types/friends";

type FriendConnectionRow =
  Database["public"]["Tables"]["friend_connections"]["Row"];
type FriendInviteRow = Database["public"]["Tables"]["friend_invites"]["Row"];
type FriendDiscoveryProfileRow =
  Database["public"]["Tables"]["friend_discovery_profiles"]["Row"];
type FriendContactImportRow =
  Database["public"]["Tables"]["friend_contact_imports"]["Row"];

function formatRelativeTimeFromNow(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);
  if (!Number.isFinite(diffSeconds)) {
    return null;
  }

  if (Math.abs(diffSeconds) < 5) {
    return "just now";
  }

  const thresholds: Array<{ limit: number; divisor: number; suffix: string }> = [
    { limit: 60, divisor: 1, suffix: "s" },
    { limit: 3600, divisor: 60, suffix: "m" },
    { limit: 86400, divisor: 3600, suffix: "h" },
    { limit: 604800, divisor: 86400, suffix: "d" },
    { limit: 2629800, divisor: 604800, suffix: "w" },
    { limit: 31557600, divisor: 2629800, suffix: "mo" },
    { limit: Number.POSITIVE_INFINITY, divisor: 31557600, suffix: "y" },
  ];

  const elapsed = Math.abs(diffSeconds);
  const isFuture = diffSeconds < 0;

  for (const threshold of thresholds) {
    if (elapsed < threshold.limit) {
      const magnitude = Math.max(1, Math.floor(elapsed / threshold.divisor));
      return `${magnitude}${threshold.suffix} ${isFuture ? "from now" : "ago"}`;
    }
  }

  return null;
}

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

export function mapFriendInvite(row: FriendInviteRow): SentInvite {
  const sentAgo = formatRelativeTimeFromNow(row.sent_at) ?? "just now";
  const lastSentAgo =
    formatRelativeTimeFromNow(row.last_sent_at) ?? sentAgo ?? "just now";

  return {
    id: row.id,
    email: row.email,
    status: (row.status as SentInvite["status"]) ?? "pending",
    sentAt: row.sent_at,
    lastSentAt: row.last_sent_at,
    sentAgo,
    lastSentAgo,
  };
}

export function mapDiscoveryProfile(
  row: FriendDiscoveryProfileRow
): DiscoveryProfile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl:
      row.avatar_url ??
      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(row.display_name)}`,
    mutualFriends: row.mutual_friends ?? 0,
    highlight:
      row.highlight ??
      "Active collaborator in the Creator community this season.",
    role: row.role ?? "Creator",
  };
}

export function mapSuggestedFriend(
  row: FriendDiscoveryProfileRow
): SuggestedFriend {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl:
      row.avatar_url ??
      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(row.display_name)}`,
    mutualFriends: row.mutual_friends ?? 0,
    reason:
      row.reason ??
      row.highlight ??
      "Showing momentum with people you follow",
  };
}

export function mapContactImportStatus(
  row: FriendContactImportRow | null
): ContactImportStatus {
  if (!row) {
    return { imported: false, importedAt: null, totalContacts: null };
  }

  return {
    imported: true,
    importedAt: row.imported_at,
    totalContacts: row.total_contacts,
  };
}
