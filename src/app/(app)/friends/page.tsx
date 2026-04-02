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
  DiscoveryProfile,
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
  const [tab, setTab] = useState<'friends' | 'search' | 'requests'>('friends');
  const [friendsView, setFriendsView] = useState<'friends' | 'following' | 'followers'>('friends');
  const [sort, setSort] =
    useState<'default' | 'alphabetical' | 'online'>('default');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [invites, setInvites] = useState<SentInvite[]>([]);
  const [suggested, setSuggested] = useState<SuggestedFriend[]>([]);
  const [searchProfiles, setSearchProfiles] = useState<DiscoveryProfile[]>([]);
  const [isLoadingSearch, setIsLoadingSearch] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const friendsTabRef = useRef<HTMLButtonElement>(null);
  const searchTabRef = useRef<HTMLButtonElement>(null);
  const requestsTabRef = useRef<HTMLButtonElement>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refreshFriends = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/friends?view=${friendsView}`, {
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
        throw new Error(
          data?.error ??
            `Unable to load ${
              friendsView === 'following'
                ? 'following'
                : friendsView === 'followers'
                  ? 'followers'
                  : 'friends'
            }.`
        );
      }

      const data = (await response.json()) as { friends: Friend[] };
      if (!isMountedRef.current) {
        return;
      }

      setFriends(data.friends);
    } catch (err) {
      if (!isMountedRef.current) {
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : `Unable to load ${
              friendsView === 'following'
                ? 'following'
                : friendsView === 'followers'
                  ? 'followers'
                  : 'friends'
            }.`;
      setError(message);
      setFriends([]);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [friendsView]);

  const refreshRequests = useCallback(async () => {
    try {
      setIsLoadingRequests(true);
      setRequestsError(null);

      const response = await fetch('/api/friends/requests', {
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
        throw new Error(data?.error ?? 'Unable to load requests.');
      }

      const data = (await response.json()) as { requests: FriendRequest[] };
      if (!isMountedRef.current) {
        return;
      }
      setRequests(data.requests ?? []);
    } catch (err) {
      if (!isMountedRef.current) {
        return;
      }
      const message =
        err instanceof Error ? err.message : 'Unable to load requests.';
      setRequestsError(message);
      setRequests([]);
    } finally {
      if (isMountedRef.current) {
        setIsLoadingRequests(false);
      }
    }
  }, []);

  const refreshSearch = useCallback(async () => {
    try {
      setIsLoadingSearch(true);
      setSearchError(null);

      const response = await fetch('/api/friends/discovery', {
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
        throw new Error(data?.error ?? 'Unable to load invites.');
      }

      const data = (await response.json()) as {
        invites?: SentInvite[];
        suggestions?: SuggestedFriend[];
        discoveryProfiles?: DiscoveryProfile[];
      };

      if (!isMountedRef.current) {
        return;
      }

      setInvites(data.invites ?? []);
      setSuggested(data.suggestions ?? []);
      setSearchProfiles(data.discoveryProfiles ?? []);
    } catch (err) {
      if (!isMountedRef.current) {
        return;
      }
      const message =
        err instanceof Error ? err.message : 'Unable to load invites.';
      setSearchError(message);
      setInvites([]);
      setSuggested([]);
      setSearchProfiles([]);
    } finally {
      if (isMountedRef.current) {
        setIsLoadingSearch(false);
      }
    }
  }, []);

  const handleRequestResolved = useCallback(() => {
    void Promise.all([
      refreshFriends(),
      refreshRequests(),
      refreshSearch(),
    ]);
  }, [refreshSearch, refreshFriends, refreshRequests]);

  useEffect(() => {
    void refreshFriends();
  }, [refreshFriends, friendsView]);

  useEffect(() => {
    void refreshRequests();
  }, [refreshRequests]);

  useEffect(() => {
    void refreshSearch();
  }, [refreshSearch]);

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

    const order: Array<'friends' | 'search' | 'requests'> = [
      'friends',
      'search',
      'requests',
    ];
    const currentIndex = order.indexOf(tab);
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (currentIndex + direction + order.length) % order.length;
    const nextTab = order[nextIndex];

    setTab(nextTab);

    const targetRef =
      nextTab === 'friends'
        ? friendsTabRef
        : nextTab === 'search'
          ? searchTabRef
          : requestsTabRef;
    targetRef.current?.focus();
  };

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 pb-10 pt-6">
      <section className="space-y-4 rounded-3xl border border-white/10 bg-black/70 p-5 shadow-2xl shadow-black/40">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold text-white">Friends</h1>
            <p className="text-sm text-white/70">
              A single place to view your circle and pending invites.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/60 md:text-sm">
            <span className="uppercase tracking-[0.3em] text-white/50">Sort</span>
            <Select
              value={sort}
              onValueChange={(value) =>
                setSort(value as 'default' | 'alphabetical' | 'online')
              }
              className="w-36"
              triggerClassName="h-9 rounded-full border border-white/10 bg-white/[0.08] px-3 text-left text-xs text-white/80 hover:bg-white/10"
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
      </section>

      <div
        role="tablist"
        aria-label="Friend options"
        className="flex flex-col gap-2 rounded-full border border-white/10 bg-black/40 p-1 shadow-xl shadow-black/40 md:flex-row"
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
          className={`flex-1 rounded-full px-4 py-2 text-center text-sm font-semibold transition ${
            tab === 'friends'
              ? 'bg-gradient-to-br from-black/90 via-neutral-900/80 to-neutral-800/60 text-white shadow-inner shadow-black/60'
              : 'text-white/60 hover:bg-white/10 hover:text-white'
          }`}
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
          className={`flex-1 rounded-full px-4 py-2 text-center text-sm font-semibold transition ${
            tab === 'search'
              ? 'bg-gradient-to-br from-black/90 via-neutral-900/80 to-neutral-800/60 text-white shadow-inner shadow-black/60'
              : 'text-white/60 hover:bg-white/10 hover:text-white'
          }`}
        >
          Search
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
          className={`flex-1 rounded-full px-4 py-2 text-center text-sm font-semibold transition ${
            tab === 'requests'
              ? 'bg-gradient-to-br from-black/90 via-neutral-900/80 to-neutral-800/60 text-white shadow-inner shadow-black/60'
              : 'text-white/60 hover:bg-white/10 hover:text-white'
          }`}
        >
          Requests
        </button>
      </div>

      <section
        id="friends-panel"
        role="tabpanel"
        aria-labelledby="friends-tab"
        hidden={tab !== 'friends'}
      >
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 shadow-inner shadow-black/40">
          <span className="px-2 text-[11px] uppercase tracking-[0.18em] text-white/40">
            View
          </span>
          <div className="inline-flex rounded-full bg-black/50 p-1 ring-1 ring-white/10">
            {(['friends', 'following', 'followers'] as const).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => setFriendsView(view)}
                className={`min-w-[88px] rounded-full px-3 py-1 text-sm font-medium transition ${
                  friendsView === view
                    ? 'bg-white/90 text-black shadow-md shadow-black/30'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                {view === 'friends'
                  ? 'Friends'
                  : view === 'following'
                    ? 'Following'
                    : 'Followers'}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-2xl bg-slate-900/50 p-6 text-center text-sm text-white/60 ring-1 ring-white/10">
            {friendsView === 'following'
              ? 'Loading who you follow…'
              : friendsView === 'followers'
                ? 'Loading your followers…'
                : 'Loading your friends…'}
          </div>
        ) : !error && sortedFriends.length === 0 ? (
          <div className="rounded-2xl bg-slate-900/50 p-6 text-center text-sm text-white/60 ring-1 ring-white/10">
            {friendsView === 'following'
              ? 'You are not following anyone yet.'
              : friendsView === 'followers'
                ? 'No one is following you yet.'
                : 'You haven’t added any friends yet.'}
          </div>
        ) : (
          <FriendsList
            data={sortedFriends}
            isLoading={isLoading}
            error={error}
          />
        )}
      </section>

      <section
        id="requests-panel"
        role="tabpanel"
        aria-labelledby="requests-tab"
        hidden={tab !== 'requests'}
      >
        {requestsError ? (
          <div className="mb-3 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200 ring-1 ring-rose-400/20">
            {requestsError}
          </div>
        ) : null}
        {searchError ? (
          <div className="mb-3 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200 ring-1 ring-rose-400/20">
            {searchError}
          </div>
        ) : null}
        <RequestsInvites
          requests={requests}
          invites={invites}
          suggestions={suggested}
          onRequestResolved={handleRequestResolved}
        />
        {isLoadingRequests ? (
          <p className="mt-3 text-xs text-white/50">Loading requests…</p>
        ) : null}
        {isLoadingSearch ? (
          <p className="mt-1 text-xs text-white/50">Loading invites…</p>
        ) : null}
      </section>

      <section
        id="search-panel"
        role="tabpanel"
        aria-labelledby="search-tab"
        hidden={tab !== 'search'}
      >
        <SearchFriends
          data={sortedFriends}
          discoveryProfiles={searchProfiles}
          onRequestResolved={handleRequestResolved}
        />
      </section>

      <div className="pb-[env(safe-area-inset-bottom)]" />
    </main>
  );
}
