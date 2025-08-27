'use client';
import { useState } from 'react';
import { MOCK_FRIENDS } from '@/lib/mock/friends';
import FriendsList from '@/components/friends/FriendsList';
import SearchFriends from '@/components/friends/SearchFriends';

export default function FriendsPage() {
  const [tab, setTab] = useState<'friends'|'search'>('friends');

  return (
    <main className="mx-auto max-w-screen-sm px-4 py-4 space-y-4">
      {/* Header */}
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">Friends</h1>
        <div className="flex items-center justify-between text-xs text-white/60">
          <div className="flex items-center gap-2">
            <span>Sort by <span className="font-semibold text-white">Default</span></span>
            <span aria-hidden>⇅</span>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-2 rounded-xl bg-white/5 p-1 ring-1 ring-white/10">
        <button
          onClick={() => setTab('friends')}
          className={`flex-1 rounded-lg px-3 py-2 text-sm transition ${tab==='friends' ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10'}`}
        >
          Friends
        </button>
        <button
          onClick={() => setTab('search')}
          className={`flex-1 rounded-lg px-3 py-2 text-sm transition ${tab==='search' ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10'}`}
        >
          Search
        </button>
      </div>

      {/* Content */}
      {tab === 'friends' ? (
        <FriendsList data={MOCK_FRIENDS} />
      ) : (
        <SearchFriends data={MOCK_FRIENDS} />
      )}

      {/* Bottom padding for safe-area / bottom nav */}
      <div className="pb-[env(safe-area-inset-bottom)]" />
    </main>
  );
}
