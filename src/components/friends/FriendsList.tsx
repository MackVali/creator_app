"use client";

import FriendRow from "./FriendRow";
import type { Friend } from "@/lib/mock/friends";

type FriendsListProps = {
  data: Friend[];
  onRemoveFriend?: (friend: Friend) => void;
};

export default function FriendsList({ data, onRemoveFriend }: FriendsListProps) {
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
