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
import {
  RELATIONSHIP_VIEWS,
  RelationshipView,
} from '@/components/friends/RelationshipViewBar';
import SearchFriends from '@/components/friends/SearchFriends';
import RequestsInvites from '@/components/friends/RequestsInvites';
import MessageFriendButton from '@/components/friends/MessageFriendButton';
import { DEFAULT_AVATAR_URL } from '@/lib/friends/avatar';
import Image from 'next/image';
import Link from 'next/link';
import {
  Select,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Camera,
  ChevronDown,
  SlidersHorizontal,
  SquarePen,
} from 'lucide-react';

export default function FriendsPage() {
  const [tab, setTab] = useState<'friends' | 'search' | 'requests'>('friends');
  const [friendsView, setFriendsView] = useState<RelationshipView>('friends');
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
  const [inboxLane, setInboxLane] = useState<'primary' | 'requests' | 'general'>(
    'primary'
  );
  const [sortMode, setSortMode] = useState<'recent' | 'name' | 'unread'>('recent');
  const [unreadOnly, setUnreadOnly] = useState(false);
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
    return [...friends].sort((a, b) =>
      (a.displayName || a.username).localeCompare(b.displayName || b.username)
    );
  }, [friends]);

  const inboxFriendThreads = useMemo(() => {
    const relativeTimes = ['5m', '22m', '1h', '3h', '8h', '1d', '2d', '4d', '1w'];
    return friends.map((friend, index) => {
      const displayName = friend.displayName || friend.username;
      const unread = friend.isOnline || index % 3 === 0;
      const isPrimary = friend.hasRing || friend.isOnline || index < 4;
      const snippet = friend.isOnline
        ? `Active now · pick up where you left off`
        : friend.hasRing
          ? `Sent a reel by ${displayName}`
          : `Sent`;
      return {
        id: friend.id,
        lane: isPrimary ? 'primary' : 'general',
        displayName,
        username: friend.username,
        avatarUrl: friend.avatarUrl || DEFAULT_AVATAR_URL,
        href: `/friends/${encodeURIComponent(friend.username)}`,
        snippet,
        unread,
        timeLabel: relativeTimes[index % relativeTimes.length],
        canMessage: Boolean(friend.userId),
        friend,
      };
    });
  }, [friends]);

  const inboxRequestThreads = useMemo(
    () =>
      requests.map((request, index) => ({
        id: request.id,
        lane: 'requests' as const,
        displayName: request.displayName || request.username,
        username: request.username,
        avatarUrl: request.avatarUrl || DEFAULT_AVATAR_URL,
        href: `/friends/${encodeURIComponent(request.username)}`,
        snippet:
          request.note && request.note.trim().length > 0
            ? request.note
            : `${request.mutualFriends} mutual friend${
                request.mutualFriends === 1 ? '' : 's'
              }`,
        unread: true,
        timeLabel: `${index + 1}d`,
      })),
    [requests]
  );

  const activeInboxThreads = useMemo(() => {
    const source =
      inboxLane === 'requests'
        ? inboxRequestThreads
        : inboxFriendThreads.filter((thread) => thread.lane === inboxLane);
    const filtered = unreadOnly ? source.filter((thread) => thread.unread) : source;
    return [...filtered].sort((a, b) => {
      if (sortMode === 'name') {
        return a.displayName.localeCompare(b.displayName);
      }
      if (sortMode === 'unread') {
        return Number(b.unread) - Number(a.unread);
      }
      return 0;
    });
  }, [inboxLane, inboxRequestThreads, inboxFriendThreads, sortMode, unreadOnly]);

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

  const getRelationshipLabel = (view: RelationshipView) =>
    view === 'friends'
      ? 'Friends'
      : view === 'following'
        ? 'Following'
        : 'Followers';

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 pb-10 pt-6">
      <div className="space-y-3">
        <h1 className="sr-only">Connect</h1>
        <div
          role="tablist"
          aria-label="Connect options"
          className="grid grid-cols-3 gap-2 rounded-full border border-white/10 bg-black/40 p-1 shadow-xl shadow-black/40"
        >
          <div className="flex flex-col gap-2">
            <Select
              value={friendsView}
              onValueChange={(value) => {
                const relationship = value as RelationshipView;
                setFriendsView(relationship);
                setTab('friends');
              }}
              className="w-full"
              triggerClassName={`flex h-12 items-center justify-between rounded-full px-4 py-2 text-sm font-semibold transition ${
                tab === 'friends'
                  ? 'bg-gradient-to-br from-black/90 via-neutral-900/80 to-neutral-800/60 text-white shadow-inner shadow-black/60'
                  : 'bg-black/40 text-white/60 hover:bg-white/10 hover:text-white'
              }`}
              contentWrapperClassName="border border-white/10 bg-black/95 text-sm text-white min-w-[200px]"
              hideChevron
              trigger={
                <div className="flex w-full items-center justify-between gap-2">
                  <span>{getRelationshipLabel(friendsView)}</span>
                  <ChevronDown className="h-4 w-4 text-white/60" />
                </div>
              }
            >
              <SelectContent className="mt-1 min-w-[200px] rounded-2xl border border-white/10 bg-black p-2 shadow-xl shadow-black/70">
                {RELATIONSHIP_VIEWS.map((view) => (
                  <SelectItem
                    key={view}
                    value={view}
                    className={`rounded-xl px-3 py-2 text-sm font-semibold uppercase tracking-[0.2em] transition ${
                      friendsView === view
                        ? 'bg-white text-black/90'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {getRelationshipLabel(view)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
            className={`h-12 rounded-full px-4 py-2 text-center text-sm font-semibold transition ${
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
            className={`h-12 rounded-full px-4 py-2 text-center text-sm font-semibold transition ${
              tab === 'requests'
                ? 'bg-gradient-to-br from-black/90 via-neutral-900/80 to-neutral-800/60 text-white shadow-inner shadow-black/60'
                : 'text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            Requests
          </button>
        </div>
      </div>

      <section
        id="friends-panel"
        role="tabpanel"
        aria-labelledby="friends-tab"
        hidden={tab !== 'friends'}
      >
        {isLoading ? (
          <div className="rounded-2xl bg-slate-900/50 p-6 text-center text-sm text-white/60 ring-1 ring-white/10">
            {friendsView === 'following'
              ? 'Loading who you follow…'
              : friendsView === 'followers'
                ? 'Loading your followers…'
                : 'Loading your friends…'}
          </div>
        ) : (
          <div className="space-y-4 rounded-[28px] border border-white/10 bg-[#050b16] p-4 shadow-[0_24px_80px_rgba(2,6,23,0.55)]">
            {error ? (
              <div className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200 ring-1 ring-rose-400/30">
                {error}
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Inbox</h2>
              <button
                type="button"
                onClick={() => setTab('search')}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/90 transition hover:border-white/30 hover:bg-white/10"
              >
                <SquarePen className="h-4 w-4" />
                New message
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setUnreadOnly((prev) => !prev)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition ${
                  unreadOnly
                    ? 'border-white/30 bg-white/10 text-white'
                    : 'border-white/15 bg-transparent text-white/80 hover:border-white/25 hover:text-white'
                }`}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filter {unreadOnly ? 'Unread' : 'All'}
              </button>
              {(['primary', 'requests', 'general'] as const).map((lane) => (
                <button
                  key={lane}
                  type="button"
                  onClick={() => setInboxLane(lane)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold capitalize transition ${
                    inboxLane === lane
                      ? 'border-transparent bg-white/15 text-white'
                      : 'border-white/15 text-white/75 hover:border-white/25 hover:text-white'
                  }`}
                >
                  {lane}
                  {lane === 'primary' ? (
                    <span className="ml-2 text-white/65">{inboxFriendThreads.filter((thread) => thread.lane === 'primary').length}</span>
                  ) : null}
                  {lane === 'requests' ? (
                    <span className="ml-2 text-white/65">{inboxRequestThreads.length}</span>
                  ) : null}
                </button>
              ))}

              <button
                type="button"
                onClick={() =>
                  setSortMode((prev) =>
                    prev === 'recent'
                      ? 'name'
                      : prev === 'name'
                        ? 'unread'
                        : 'recent'
                  )
                }
                className="ml-auto inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 text-sm font-medium text-white/80 transition hover:border-white/25 hover:text-white"
              >
                Sort:{' '}
                {sortMode === 'recent'
                  ? 'Recent'
                  : sortMode === 'name'
                    ? 'Name'
                    : 'Unread'}
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            {activeInboxThreads.length === 0 ? (
              <div className="rounded-2xl bg-slate-900/40 p-6 text-center text-sm text-white/65 ring-1 ring-white/10">
                No conversations found for this filter.
              </div>
            ) : (
              <ul className="space-y-2">
                {activeInboxThreads.map((thread) => (
                  <li key={thread.id}>
                    <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-slate-950/55 px-3 py-2 transition hover:border-white/15 hover:bg-slate-900/70">
                      <Link
                        href={thread.href}
                        className="min-w-0 flex-1"
                        prefetch={false}
                      >
                        <div className="flex items-center gap-3">
                          <Image
                            alt={`${thread.displayName} avatar`}
                            src={thread.avatarUrl}
                            width={56}
                            height={56}
                            className="h-14 w-14 rounded-full object-cover"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold text-white">
                              {thread.displayName}
                            </p>
                            <p className="truncate text-sm text-white/75">
                              {thread.snippet}{' '}
                              <span className="text-white/45">· {thread.timeLabel}</span>
                            </p>
                          </div>
                        </div>
                      </Link>
                      {thread.unread ? (
                        <span
                          className="h-2.5 w-2.5 rounded-full bg-blue-500"
                          aria-label="Unread conversation"
                        />
                      ) : null}
                      {'friend' in thread && thread.canMessage ? (
                        <MessageFriendButton
                          friend={thread.friend}
                          className="rounded-full border border-white/10 p-2 text-white/70 hover:border-white/30 hover:text-white"
                          aria-label={`Message ${thread.username}`}
                        >
                          <Camera className="h-4 w-4" />
                        </MessageFriendButton>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setTab('requests')}
                          className="rounded-full border border-white/10 p-2 text-white/70 transition hover:border-white/30 hover:text-white"
                          aria-label={`Open ${thread.username} request`}
                        >
                          <Camera className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
