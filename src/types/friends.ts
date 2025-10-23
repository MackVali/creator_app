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
  status: "pending" | "accepted" | "expired" | "cancelled";
  sentAt: string;
  lastSentAt: string | null;
  sentAgo: string;
  lastSentAgo: string | null;
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

export type ContactImportStatus = {
  imported: boolean;
  importedAt: string | null;
  totalContacts: number | null;
};
