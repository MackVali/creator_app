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

type StatsCardProps = {
  label: string;
  value: number;
  helper?: string;
};

function StatsCard({ label, value, helper }: StatsCardProps) {
  return (
    <article className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 shadow-sm shadow-black/30">
      <span className="text-[11px] uppercase tracking-[0.2em] text-white/50">
        {label}
      </span>
      <p className="text-2xl font-semibold text-white">{value.toLocaleString()}</p>
      {helper ? (
        <p className="text-xs text-white/60">{helper}</p>
      ) : null}
    </article>
  );
}

export default function FriendsPage() {
  const [tab, setTab] = useState<'friends' | 'requests' | 'discover'>('friends');
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
  const [discoveryProfiles, setDiscoveryProfiles] = useState<DiscoveryProfile[]>([]);
  const [isLoadingDiscovery, setIsLoadingDiscovery] = useState(true);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const friendsTabRef = useRef<HTMLButtonElement>(null);
  const requestsTabRef = useRef<HTMLButtonElement>(null);
  const discoverTabRef = useRef<HTMLButtonElement>(null);
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
      if (!isMountedRef.current) {
        return;
      }

      setFriends(data.friends);
    } catch (err) {
      if (!isMountedRef.current) {
        return;
      }
      const message =
        err instanceof Error ? err.message : 'Unable to load friends.';
      setError(message);
      setFriends([]);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

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

  const refreshDiscovery = useCallback(async () => {
    try {
      setIsLoadingDiscovery(true);
      setDiscoveryError(null);

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
      setDiscoveryProfiles(data.discoveryProfiles ?? []);
    } catch (err) {
      if (!isMountedRef.current) {
        return;
      }
      const message =
        err instanceof Error ? err.message : 'Unable to load invites.';
      setDiscoveryError(message);
      setInvites([]);
      setSuggested([]);
      setDiscoveryProfiles([]);
    } finally {
      if (isMountedRef.current) {
        setIsLoadingDiscovery(false);
      }
    }
  }, []);

  const handleRequestResolved = useCallback(() => {
    void Promise.all([
      refreshFriends(),
      refreshRequests(),
      refreshDiscovery(),
    ]);
  }, [refreshDiscovery, refreshFriends, refreshRequests]);

  useEffect(() => {
    void refreshFriends();
  }, [refreshFriends]);

  useEffect(() => {
    void refreshRequests();
  }, [refreshRequests]);

  useEffect(() => {
    void refreshDiscovery();
  }, [refreshDiscovery]);

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

  const stats = useMemo(
    () => [
      {
        label: 'Total friends',
        value: friends.length,
        helper: `${friends.length} connection${friends.length === 1 ? '' : 's'}`,
      },
      {
        label: 'Pending requests',
        value: requests.length,
        helper: requests.length
          ? `${requests.length} awaiting response`
          : 'No new requests',
      },
      {
        label: 'Discover',
        value: discoveryProfiles.length,
        helper: 'People you can meet',
      },
    ],
    [discoveryProfiles.length, friends.length, requests.length]
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      return;
    }

    event.preventDefault();

    const order: Array<'friends' | 'requests' | 'discover'> = [
      'friends',
      'requests',
      'discover',
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
        : discoverTabRef;
    targetRef.current?.focus();
  };

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 pb-10 pt-6">
      <section className="space-y-5 rounded-3xl border border-white/10 bg-gradient-to-b from-black/90 via-neutral-950/70 to-neutral-900/60 p-5 shadow-2xl shadow-black/40">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.4em] text-white/50">
              Social hub
            </p>
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold text-white">Friends</h1>
              <p className="text-sm text-white/70">
                Keep up with your circle, answer invites, and explore new profiles.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-white/60 md:text-sm">
            <span className="uppercase tracking-[0.3em] text-white/50">Sort</span>
            <Select
              value={sort}
              onValueChange={(value) =>
                setSort(value as 'default' | 'alphabetical' | 'online')
              }
              className="w-36"
              triggerClassName="h-9 rounded-xl border border-white/10 bg-white/[0.08] px-3 text-left text-xs text-white/80 hover:bg-white/10"
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
        <div className="grid gap-3 sm:grid-cols-3">
          {stats.map((stat) => (
            <StatsCard key={stat.label} {...stat} />
          ))}
        </div>
      </section>

      <div
        role="tablist"
        aria-label="Friend options"
        className="grid grid-cols-1 gap-2 rounded-2xl border border-white/10 bg-black/30 p-1 shadow-xl shadow-black/40 md:grid-cols-3"
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
          className={`rounded-2xl px-4 py-2 text-center text-sm font-semibold transition ${
            tab === 'friends'
              ? 'bg-gradient-to-br from-black/90 via-neutral-900/80 to-neutral-800/60 text-white shadow-inner shadow-black/60'
              : 'text-white/60 hover:bg-white/10 hover:text-white'
          }`}
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
          className={`rounded-2xl px-4 py-2 text-center text-sm font-semibold transition ${
            tab === 'requests'
              ? 'bg-gradient-to-br from-black/90 via-neutral-900/80 to-neutral-800/60 text-white shadow-inner shadow-black/60'
              : 'text-white/60 hover:bg-white/10 hover:text-white'
          }`}
        >
          Requests
        </button>
        <button
          ref={discoverTabRef}
          id="discover-tab"
          role="tab"
          onClick={() => setTab('discover')}
          onKeyDown={handleKeyDown}
          type="button"
          aria-selected={tab === 'discover'}
          aria-controls="discover-panel"
          tabIndex={tab === 'discover' ? 0 : -1}
          className={`rounded-2xl px-4 py-2 text-center text-sm font-semibold transition ${
            tab === 'discover'
              ? 'bg-gradient-to-br from-black/90 via-neutral-900/80 to-neutral-800/60 text-white shadow-inner shadow-black/60'
              : 'text-white/60 hover:bg-white/10 hover:text-white'
          }`}
        >
          Discover
        </button>
      </div>

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
        {requestsError ? (
          <div className="mb-3 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200 ring-1 ring-rose-400/20">
            {requestsError}
          </div>
        ) : null}
        {discoveryError ? (
          <div className="mb-3 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200 ring-1 ring-rose-400/20">
            {discoveryError}
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
        {isLoadingDiscovery ? (
          <p className="mt-1 text-xs text-white/50">Loading invites…</p>
        ) : null}
      </section>

      <section
        id="discover-panel"
        role="tabpanel"
        aria-labelledby="discover-tab"
        hidden={tab !== 'discover'}
      >
        <SearchFriends
          data={sortedFriends}
          discoveryProfiles={discoveryProfiles}
          onRequestResolved={handleRequestResolved}
        />
      </section>

      <div className="pb-[env(safe-area-inset-bottom)]" />
    </main>
  );
}
