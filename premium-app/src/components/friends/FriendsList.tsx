"use client";

import FriendRow from "./FriendRow";
import type { Friend } from "@/types/friends";

type FriendsListProps = {
  data: Friend[];
  isLoading?: boolean;
  error?: string | null;
  onRemoveFriend?: (friend: Friend) => void;
};

export default function FriendsList({
  data,
  isLoading,
  error,
  onRemoveFriend,
}: FriendsListProps) {
  if (isLoading) {
    return (
      <div className="rounded-2xl bg-slate-900/50 p-6 text-center text-sm text-white/60 ring-1 ring-white/10">
        Loading your friends…
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
      <div className="rounded-2xl bg-slate-900/50 p-6 text-center text-sm text-white/60 ring-1 ring-white/10">
        You haven’t added any friends yet.
      </div>
    );
  }

  return (
    <ul
      role="list"
      className="divide-y divide-white/5 rounded-2xl bg-slate-900/50 ring-1 ring-white/10"
    >
      {data.map((f) => (
        <FriendRow key={f.id} f={f} onRemoveFriend={onRemoveFriend} />
      ))}
    </ul>
  );
}
