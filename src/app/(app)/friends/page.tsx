'use client';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type {
  Friend,
  FriendRequest,
  SentInvite,
  SuggestedFriend,
} from '@/types/friends';
import FriendsList from '@/components/friends/FriendsList';
import SearchFriends from '@/components/friends/SearchFriends';
import RequestsInvites from '@/components/friends/RequestsInvites';
import { Select, SelectContent, SelectItem } from '@/components/ui/select';

export default function FriendsPage() {
  const [tab, setTab] = useState<'friends' | 'requests' | 'search'>('friends');
  const [sort, setSort] =
    useState<'default' | 'alphabetical' | 'online'>('default');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requests] = useState<FriendRequest[]>([]);
  const [invites] = useState<SentInvite[]>([]);
  const [suggested] = useState<SuggestedFriend[]>([]);
  const friendsTabRef = useRef<HTMLButtonElement>(null);
  const requestsTabRef = useRef<HTMLButtonElement>(null);
  const searchTabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadFriends() {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch('/api/friends', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(data?.error ?? 'Unable to load friends.');
        }

        const data = (await response.json()) as { friends: Friend[] };
        if (isMounted) {
          setFriends(data.friends);
        }
      } catch (err) {
        if (!isMounted) return;
        const message =
          err instanceof Error ? err.message : 'Unable to load friends.';
        setError(message);
        setFriends([]);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadFriends();

    return () => {
      isMounted = false;
    };
  }, []);

  const sortedFriends = useMemo(() => {
    if (!friends.length) {
      return [] as Friend[];
    }
    if (sort === 'alphabetical') {
      return [...friends].sort((a, b) =>
        (a.displayName || a.username).localeCompare(
          b.displayName || b.username
        )
      );
    }

    if (sort === 'online') {
      return [...friends].sort((a, b) => {
        const aOnline = a.isOnline ? 1 : 0;
        const bOnline = b.isOnline ? 1 : 0;

        if (aOnline !== bOnline) {
          return bOnline - aOnline;
        }

        return (a.displayName || a.username).localeCompare(
          b.displayName || b.username
        );
      });
    }

    return [...friends];
  }, [friends, sort]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      return;
    }

    event.preventDefault();

    const order: Array<'friends' | 'requests' | 'search'> = [
      'friends',
      'requests',
      'search',
    ];
    const currentIndex = order.indexOf(tab);
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (currentIndex + direction + order.length) % order.length;
    const nextTab = order[nextIndex];

    setTab(nextTab);

    const targetRef =
      nextTab === 'friends'
        ? friendsTabRef
        : nextTab === 'requests'
          ? requestsTabRef
          : searchTabRef;
    targetRef.current?.focus();
  };

  const handleFriendAdded = useCallback((friend: Friend) => {
    setFriends((prev) => {
      const friendUsername = friend.username.toLowerCase();
      const exists = prev.some(
        (item) =>
          item.id === friend.id || item.username.toLowerCase() === friendUsername
      );

      if (exists) {
        return prev.map((item) =>
          item.id === friend.id || item.username.toLowerCase() === friendUsername
            ? friend
            : item
        );
      }

      return [...prev, friend];
    });
  }, []);

  return (
    <main className="mx-auto max-w-screen-sm px-4 py-4 space-y-4">
      {/* Header */}
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-white">Friends</h1>
        <div className="flex items-center justify-between text-xs text-white/60">
          <div className="flex items-center gap-3">
            <span className="text-white/60">Sort by</span>
            <Select
              value={sort}
              onValueChange={(value) =>
                setSort(value as 'default' | 'alphabetical' | 'online')
              }
              className="w-36"
              triggerClassName="h-8 rounded-lg border-white/10 bg-white/[0.07] px-3 text-left text-xs text-white/80 hover:bg-white/10"
              contentWrapperClassName="bg-slate-900/95"
            >
              <SelectContent className="text-xs text-white/80">
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="alphabetical">Alphabetical</SelectItem>
                <SelectItem value="online">Online first</SelectItem>
              </SelectContent>
            </Select>
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
          ref={requestsTabRef}
          id="requests-tab"
          role="tab"
          onClick={() => setTab('requests')}
          onKeyDown={handleKeyDown}
          type="button"
          aria-selected={tab === 'requests'}
          aria-controls="requests-panel"
          tabIndex={tab === 'requests' ? 0 : -1}
          className={`flex-1 rounded-lg px-3 py-2 text-sm transition ${tab === 'requests' ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10'}`}
        >
          Requests & Invites
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
        <FriendsList
          data={sortedFriends}
          isLoading={isLoading}
          error={error}
        />
      </section>
      <section
        id="requests-panel"
        role="tabpanel"
        aria-labelledby="requests-tab"
        hidden={tab !== 'requests'}
      >
        <RequestsInvites
          requests={requests}
          invites={invites}
          suggestions={suggested}
        />
      </section>
      <section
        id="search-panel"
        role="tabpanel"
        aria-labelledby="search-tab"
        hidden={tab !== 'search'}
      >
        <SearchFriends
          data={sortedFriends}
          discoveryProfiles={[]}
          onAddFriend={handleFriendAdded}
        />
      </section>

      {/* Bottom padding for safe-area / bottom nav */}
      <div className="pb-[env(safe-area-inset-bottom)]" />
    </main>
  );
}
