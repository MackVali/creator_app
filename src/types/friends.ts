export type Friend = {
  id: string;
  userId: string | null;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  profileUrl: string | null;
  hasRing: boolean;
  isOnline: boolean;
};

export type FriendRequest = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  mutualFriends: number;
  note?: string;
};

export type SentInvite = {
  id: string;
  email: string;
  sentAgo: string;
  status: "pending" | "accepted" | "expired";
};

export type SuggestedFriend = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  mutualFriends: number;
  reason: string;
};

export type DiscoveryProfile = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  mutualFriends: number;
  highlight: string;
  role: string;
};

export type FriendSearchResult = {
  userId: string | null;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  profileUrl: string | null;
  mutualFriends: number | null;
};
