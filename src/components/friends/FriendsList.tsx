"use client";

import FriendRow from "./FriendRow";
import type { Friend } from "@/types/friends";

type RelationshipView = "friends" | "following" | "followers";

type FriendsListProps = {
  data: Friend[];
  isLoading?: boolean;
  error?: string | null;
  onRemoveFriend?: (friend: Friend) => void;
  relationshipView?: RelationshipView;
};

export default function FriendsList({
  data,
  isLoading,
  error,
  onRemoveFriend,
  relationshipView = "friends",
}: FriendsListProps) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-8" aria-label="Loading">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-rose-500/10 p-6 text-center text-sm text-rose-200 ring-1 ring-rose-400/30">
        {error}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#050506]/90 p-6 text-center text-sm text-white/60 shadow-xl shadow-black/30">
        You haven’t added any friends yet.
      </div>
    );
  }

  return (
    <ul
      role="list"
      className="space-y-0"
    >
      {data.map((f) => (
        <FriendRow
          key={f.id}
          f={f}
          onRemoveFriend={onRemoveFriend}
          relationshipView={relationshipView}
        />
      ))}
    </ul>
  );
}
