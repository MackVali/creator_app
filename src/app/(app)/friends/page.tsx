'use client';
import { useRef, useState, type KeyboardEvent } from 'react';
import { MOCK_FRIENDS } from '@/lib/mock/friends';
import FriendsList from '@/components/friends/FriendsList';
import SearchFriends from '@/components/friends/SearchFriends';

export default function FriendsPage() {
  const [tab, setTab] = useState<'friends' | 'search'>('friends');
  const friendsTabRef = useRef<HTMLButtonElement>(null);
  const searchTabRef = useRef<HTMLButtonElement>(null);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      return;
    }

    event.preventDefault();

    const order: Array<'friends' | 'search'> = ['friends', 'search'];
    const currentIndex = order.indexOf(tab);
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (currentIndex + direction + order.length) % order.length;
    const nextTab = order[nextIndex];

    setTab(nextTab);

    const targetRef = nextTab === 'friends' ? friendsTabRef : searchTabRef;
    targetRef.current?.focus();
  };

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
      <div
        role="tablist"
        aria-label="Friend options"
        className="flex items-center gap-2 rounded-xl bg-white/5 p-1 ring-1 ring-white/10"
      >
        <button
          ref={friendsTabRef}
          id="friends-tab"
          role="tab"
          onClick={() => setTab('friends')}
          onKeyDown={handleKeyDown}
          type="button"
          aria-selected={tab === 'friends'}
          aria-controls="friends-panel"
          tabIndex={tab === 'friends' ? 0 : -1}
          className={`flex-1 rounded-lg px-3 py-2 text-sm transition ${tab === 'friends' ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10'}`}
        >
          Friends
        </button>
        <button
          ref={searchTabRef}
          id="search-tab"
          role="tab"
          onClick={() => setTab('search')}
          onKeyDown={handleKeyDown}
          type="button"
          aria-selected={tab === 'search'}
          aria-controls="search-panel"
          tabIndex={tab === 'search' ? 0 : -1}
          className={`flex-1 rounded-lg px-3 py-2 text-sm transition ${tab === 'search' ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10'}`}
        >
          Search
        </button>
      </div>

      {/* Content */}
      <section
        id="friends-panel"
        role="tabpanel"
        aria-labelledby="friends-tab"
        hidden={tab !== 'friends'}
      >
        <FriendsList data={MOCK_FRIENDS} />
      </section>
      <section
        id="search-panel"
        role="tabpanel"
        aria-labelledby="search-tab"
        hidden={tab !== 'search'}
      >
        <SearchFriends data={MOCK_FRIENDS} />
      </section>

      {/* Bottom padding for safe-area / bottom nav */}
      <div className="pb-[env(safe-area-inset-bottom)]" />
    </main>
  );
}
