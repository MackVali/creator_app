'use client';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
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
import {
  RELATIONSHIP_VIEWS,
  RelationshipView,
} from '@/components/friends/RelationshipViewBar';
import SearchFriends from '@/components/friends/SearchFriends';
import RequestsInvites from '@/components/friends/RequestsInvites';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  Select,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { ArrowRight, Check, ChevronDown } from 'lucide-react';
import { userHasAppManagerAccess } from '@/lib/auth/userRoles';

type ConnectTab = 'friends' | 'search' | 'requests' | 'circles';

type CircleType = 'HOUSEHOLD' | 'TEAM' | 'CLIENTS' | 'STUDIO' | 'CUSTOM';

type Circle = {
  id: string;
  owner_user_id: string;
  name: string;
  circle_type: CircleType;
  status: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type CircleInvite = {
  id: string;
  circle_id: string;
  user_id: string;
  role: string;
  status: string;
  invited_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  circle: {
    id: string;
    owner_user_id: string;
    name: string;
    circle_type: CircleType;
    status: string;
    description: string | null;
    created_at: string;
    updated_at: string;
  } | null;
  invitedByProfile: {
    user_id: string;
    username: string | null;
    name: string | null;
    avatar_url: string | null;
  } | null;
};

const circleTemplates = [
  {
    name: 'Household',
    type: 'Example: Shared home system',
    members: '4 members',
    role: 'Owner',
    status: 'Template',
    chips: ['Members', 'Roles', 'Invites'],
  },
  {
    name: 'Studio Team',
    type: 'Example: Creative operations',
    members: '6 members',
    role: 'Manager',
    status: 'Template',
    chips: ['Members', 'Roles', 'Trust'],
  },
  {
    name: 'Clients',
    type: 'Example: Service relationships',
    members: '3 members',
    role: 'Operator',
    status: 'Template',
    chips: ['People', 'Access', 'Invites'],
  },
];

const circleTypeChips: Record<CircleType, string[]> = {
  HOUSEHOLD: ['Members', 'Roles', 'Invites'],
  TEAM: ['Members', 'Roles', 'Trust'],
  CLIENTS: ['People', 'Access', 'Invites'],
  STUDIO: ['Members', 'Roles', 'Circles'],
  CUSTOM: ['People', 'Trust', 'Access'],
};

const circleTypeOptions: CircleType[] = [
  'HOUSEHOLD',
  'TEAM',
  'CLIENTS',
  'STUDIO',
  'CUSTOM',
];

const circleTypeFallbacks: Record<CircleType, string> = {
  HOUSEHOLD: 'Keep household people, roles, and invites together.',
  TEAM: 'Coordinate trusted people and access for a shared circle.',
  CLIENTS: 'Manage service relationships and circle access.',
  STUDIO: 'Keep studio members, roles, and trust clear.',
  CUSTOM: 'Build a trusted circle around the people you coordinate.',
};

export default function ConnectTabContent() {
  const { user } = useAuth();
  const [tab, setTab] = useState<ConnectTab>('friends');
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
  const [circles, setCircles] = useState<Circle[]>([]);
  const [isLoadingCircles, setIsLoadingCircles] = useState(true);
  const [circlesError, setCirclesError] = useState<string | null>(null);
  const [circleInvites, setCircleInvites] = useState<CircleInvite[]>([]);
  const [isLoadingCircleInvites, setIsLoadingCircleInvites] = useState(true);
  const [circleInvitesError, setCircleInvitesError] = useState<string | null>(
    null
  );
  const [respondingCircleInviteId, setRespondingCircleInviteId] = useState<
    string | null
  >(null);
  const [isCreatingCircle, setIsCreatingCircle] = useState(false);
  const [createCircleError, setCreateCircleError] = useState<string | null>(
    null
  );
  const [showCreateCircleForm, setShowCreateCircleForm] = useState(false);
  const [newCircleName, setNewCircleName] = useState('');
  const [newCircleType, setNewCircleType] = useState<CircleType>('CUSTOM');
  const canCreateCircle = userHasAppManagerAccess(user);
  const friendsTabRef = useRef<HTMLButtonElement>(null);
  const searchTabRef = useRef<HTMLButtonElement>(null);
  const requestsTabRef = useRef<HTMLButtonElement>(null);
  const circlesTabRef = useRef<HTMLButtonElement>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refreshCircles = useCallback(async () => {
    try {
      setIsLoadingCircles(true);
      setCirclesError(null);

      const response = await fetch('/api/circles', {
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
        throw new Error(data?.error ?? 'Unable to load circles.');
      }

      const data = (await response.json()) as { circles?: Circle[] };

      if (!isMountedRef.current) {
        return;
      }

      setCircles(data.circles ?? []);
    } catch (err) {
      if (!isMountedRef.current) {
        return;
      }
      const message =
        err instanceof Error ? err.message : 'Unable to load circles.';
      setCirclesError(message);
      setCircles([]);
    } finally {
      if (isMountedRef.current) {
        setIsLoadingCircles(false);
      }
    }
  }, []);

  const handleCreateCircle = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const trimmedName = newCircleName.trim();

      if (!canCreateCircle) {
        setCreateCircleError(
          'CREATOR Manager access is required to create a Circle.'
        );
        return;
      }

      if (!trimmedName) {
        setCreateCircleError('Circle name is required.');
        return;
      }

      try {
        setIsCreatingCircle(true);
        setCreateCircleError(null);

        const response = await fetch('/api/circles', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: trimmedName,
            circleType: newCircleType,
          }),
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(data?.error ?? 'Unable to create circle.');
        }

        if (!isMountedRef.current) {
          return;
        }

        setNewCircleName('');
        setNewCircleType('CUSTOM');
        setShowCreateCircleForm(false);
        await refreshCircles();
      } catch (err) {
        if (!isMountedRef.current) {
          return;
        }
        const message =
          err instanceof Error ? err.message : 'Unable to create circle.';
        setCreateCircleError(message);
      } finally {
        if (isMountedRef.current) {
          setIsCreatingCircle(false);
        }
      }
    },
    [canCreateCircle, newCircleName, newCircleType, refreshCircles]
  );

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

  const refreshCircleInvites = useCallback(async () => {
    try {
      setIsLoadingCircleInvites(true);
      setCircleInvitesError(null);

      const response = await fetch('/api/circles/invites', {
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
        throw new Error(data?.error ?? 'Unable to load Circle invites.');
      }

      const data = (await response.json()) as { invites?: CircleInvite[] };

      if (!isMountedRef.current) {
        return;
      }

      setCircleInvites(data.invites ?? []);
    } catch (err) {
      if (!isMountedRef.current) {
        return;
      }
      const message =
        err instanceof Error ? err.message : 'Unable to load Circle invites.';
      setCircleInvitesError(message);
      setCircleInvites([]);
    } finally {
      if (isMountedRef.current) {
        setIsLoadingCircleInvites(false);
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

  const handleRequestResolved = useCallback(async () => {
    await Promise.all([
      refreshCircleInvites(),
      refreshFriends(),
      refreshRequests(),
      refreshSearch(),
    ]);
  }, [refreshCircleInvites, refreshSearch, refreshFriends, refreshRequests]);

  const handleCircleInviteResponse = useCallback(
    async (inviteId: string, action: 'accept' | 'decline') => {
      try {
        setRespondingCircleInviteId(inviteId);
        setCircleInvitesError(null);

        const response = await fetch(
          `/api/circles/invites/${encodeURIComponent(inviteId)}/respond`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action }),
          }
        );

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(data?.error ?? 'Unable to respond to Circle invite.');
        }

        await Promise.all([
          refreshCircleInvites(),
          refreshFriends(),
          ...(canCreateCircle ? [refreshCircles()] : []),
        ]);
      } catch (err) {
        if (!isMountedRef.current) {
          return;
        }
        const message =
          err instanceof Error
            ? err.message
            : 'Unable to respond to Circle invite.';
        setCircleInvitesError(message);
      } finally {
        if (isMountedRef.current) {
          setRespondingCircleInviteId(null);
        }
      }
    },
    [canCreateCircle, refreshCircleInvites, refreshCircles, refreshFriends]
  );

  useEffect(() => {
    void refreshFriends();
  }, [refreshFriends, friendsView]);

  useEffect(() => {
    void refreshRequests();
  }, [refreshRequests]);

  useEffect(() => {
    void refreshCircleInvites();
  }, [refreshCircleInvites]);

  useEffect(() => {
    void refreshSearch();
  }, [refreshSearch]);

  useEffect(() => {
    if (!canCreateCircle) {
      setCircles([]);
      setCirclesError(null);
      setIsLoadingCircles(false);
      setShowCreateCircleForm(false);
      return;
    }

    void refreshCircles();
  }, [canCreateCircle, refreshCircles]);

  const sortedFriends = useMemo(() => {
    if (!friends.length) {
      return [] as Friend[];
    }
    return [...friends].sort((a, b) =>
      (a.displayName || a.username).localeCompare(b.displayName || b.username)
    );
  }, [friends]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      return;
    }

    event.preventDefault();

    const order: ConnectTab[] = [
      'friends',
      'search',
      'requests',
      'circles',
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
          : nextTab === 'requests'
            ? requestsTabRef
            : circlesTabRef;
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
          className="grid grid-cols-4 gap-2 rounded-full border border-white/10 bg-black/40 p-1 shadow-xl shadow-black/40"
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
          <button
            ref={circlesTabRef}
            id="circles-tab"
            role="tab"
            onClick={() => setTab('circles')}
            onKeyDown={handleKeyDown}
            type="button"
            aria-selected={tab === 'circles'}
            aria-controls="circles-panel"
            tabIndex={tab === 'circles' ? 0 : -1}
            className={`h-12 rounded-full px-4 py-2 text-center text-sm font-semibold transition ${
              tab === 'circles'
                ? 'bg-gradient-to-br from-black/90 via-neutral-900/80 to-neutral-800/60 text-white shadow-inner shadow-black/60'
                : 'text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            Circles
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
          <div className="rounded-2xl border border-white/10 bg-[#050506]/90 p-6 text-center text-sm text-white/60 shadow-xl shadow-black/30">
            {friendsView === 'following'
              ? 'Loading who you follow…'
              : friendsView === 'followers'
                ? 'Loading your followers…'
                : 'Loading your friends…'}
          </div>
        ) : !error && sortedFriends.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#050506]/90 p-6 text-center text-sm text-white/60 shadow-xl shadow-black/30">
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
        <section className="mb-4 rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-xl shadow-black/30">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white">
                Circle Invites
              </h2>
              <p className="mt-1 text-sm leading-5 text-white/50">
                Review shared systems people have invited you to join.
              </p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-semibold text-white/60">
              {circleInvites.length}
            </span>
          </div>

          {isLoadingCircleInvites ? (
            <p className="mt-4 text-sm font-medium text-white/50">
              Loading Circle invites…
            </p>
          ) : null}

          {circleInvitesError ? (
            <div className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200 ring-1 ring-rose-400/20">
              {circleInvitesError}
            </div>
          ) : null}

          {!isLoadingCircleInvites &&
          !circleInvitesError &&
          circleInvites.length === 0 ? (
            <p className="mt-4 rounded-xl bg-white/[0.04] px-3 py-3 text-sm font-medium text-white/45 ring-1 ring-white/5">
              No pending Circle invites.
            </p>
          ) : null}

          {circleInvites.length > 0 ? (
            <div className="mt-4 space-y-3">
              {circleInvites.map((invite) => {
                const inviterName = invite.invitedByProfile?.name?.trim();
                const inviterUsername =
                  invite.invitedByProfile?.username?.trim();
                const invitedByLabel =
                  inviterName ||
                  (inviterUsername ? `@${inviterUsername}` : 'Unknown sender');
                const isResponding = respondingCircleInviteId === invite.id;

                return (
                  <article
                    key={invite.id}
                    className="rounded-2xl border border-white/10 bg-black/45 p-4 ring-1 ring-white/5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-white">
                            {invite.circle?.name ?? 'Circle invite'}
                          </h3>
                          <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                            {invite.circle?.circle_type ?? 'CIRCLE'}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 text-sm text-white/60 sm:grid-cols-2">
                          <p className="rounded-xl bg-white/[0.04] px-3 py-2 ring-1 ring-white/5">
                            <span className="text-white/40">Role</span>
                            <span className="ml-2 font-semibold text-white/80">
                              {invite.role}
                            </span>
                          </p>
                          <p className="rounded-xl bg-white/[0.04] px-3 py-2 ring-1 ring-white/5">
                            <span className="text-white/40">Invited by</span>
                            <span className="ml-2 font-semibold text-white/80">
                              {invitedByLabel}
                            </span>
                            {inviterName && inviterUsername ? (
                              <span className="ml-1 text-white/45">
                                @{inviterUsername}
                              </span>
                            ) : null}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          disabled={isResponding}
                          onClick={() =>
                            void handleCircleInviteResponse(invite.id, 'accept')
                          }
                          className="h-10 rounded-full bg-white px-4 text-sm font-semibold text-black/90 transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-55"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={isResponding}
                          onClick={() =>
                            void handleCircleInviteResponse(
                              invite.id,
                              'decline'
                            )
                          }
                          className="h-10 rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-55"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
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

      <section
        id="circles-panel"
        role="tabpanel"
        aria-labelledby="circles-tab"
        hidden={tab !== 'circles'}
      >
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.14),transparent_34%),linear-gradient(135deg,rgba(18,18,18,0.96),rgba(0,0,0,0.92))] p-6 shadow-2xl shadow-black/50">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/50">
                CREATOR MANAGER
              </p>
              <h2 className="max-w-2xl text-2xl font-semibold leading-tight text-white sm:text-3xl">
                Circles turn your connections into shared responsibility
                systems.
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-white/60 sm:text-base">
                Build households, teams, client groups, or crews. Keep people,
                roles, invites, and trust in one place.
              </p>
            </div>
            {canCreateCircle ? (
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateCircleForm((current) => !current);
                    setCreateCircleError(null);
                  }}
                  className="h-11 rounded-full bg-white px-5 text-sm font-semibold text-black/90 transition hover:bg-white/90"
                >
                  {showCreateCircleForm ? 'Close Form' : 'Create Circle'}
                </button>
              </div>
            ) : (
              <div className="mt-5 max-w-2xl rounded-2xl border border-white/10 bg-stone-950/70 p-4 shadow-xl shadow-black/35 ring-1 ring-white/[0.03]">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/45">
                  CREATOR MANAGER
                </p>
                <h3 className="mt-2 text-lg font-semibold leading-tight text-white">
                  Create Circles with Manager access
                </h3>
                <p className="mt-2 text-sm leading-6 text-white/60">
                  Circles are for coordinating people, roles, invites, and
                  command availability. Manager access keeps those tools out of
                  the way until your account is ready to use them.
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {[
                    'Create Circles',
                    'Manage roles and invites',
                    'Send command availability offers',
                    'Use the Command dashboard',
                  ].map((benefit) => (
                    <div
                      key={benefit}
                      className="flex items-center gap-2 text-sm font-medium text-white/75"
                    >
                      <Check className="h-4 w-4 shrink-0 text-emerald-300" />
                      <span>{benefit}</span>
                    </div>
                  ))}
                </div>
                <Link
                  href="/settings/billing"
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-black/90 transition hover:bg-white/90"
                >
                  Manage access
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>

          {canCreateCircle && showCreateCircleForm ? (
            <form
              onSubmit={handleCreateCircle}
              className="rounded-2xl border border-white/10 bg-black/55 p-4 shadow-xl shadow-black/30"
            >
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                    Circle name
                  </span>
                  <input
                    value={newCircleName}
                    onChange={(event) => {
                      setNewCircleName(event.target.value);
                      setCreateCircleError(null);
                    }}
                    placeholder="Studio launch team"
                    className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 text-sm font-medium text-white outline-none transition placeholder:text-white/30 focus:border-white/25 focus:bg-white/[0.08]"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                    Circle type
                  </span>
                  <Select
                    value={newCircleType}
                    onValueChange={(value) => {
                      setNewCircleType(value as CircleType);
                      setCreateCircleError(null);
                    }}
                    className="w-full"
                    triggerClassName="flex h-11 items-center justify-between rounded-xl border border-white/10 bg-white/[0.06] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
                    contentWrapperClassName="border border-white/10 bg-black/95 text-sm text-white min-w-[220px]"
                    hideChevron
                    disablePortal
                    trigger={
                      <div className="flex w-full items-center justify-between gap-2">
                        <span>{newCircleType}</span>
                        <ChevronDown className="h-4 w-4 text-white/50" />
                      </div>
                    }
                  >
                    <SelectContent className="mt-1 min-w-[220px] rounded-2xl border border-white/10 bg-black p-2 shadow-xl shadow-black/70">
                      {circleTypeOptions.map((type) => (
                        <SelectItem
                          key={type}
                          value={type}
                          className={`rounded-xl px-3 py-2 text-sm font-semibold uppercase tracking-[0.18em] transition ${
                            newCircleType === type
                              ? 'bg-white text-black/90'
                              : 'text-white/70 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateCircleForm(false);
                      setCreateCircleError(null);
                      setNewCircleName('');
                      setNewCircleType('CUSTOM');
                    }}
                    className="h-11 rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/65 transition hover:bg-white/10 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingCircle}
                    className="h-11 rounded-full bg-white px-5 text-sm font-semibold text-black/90 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCreatingCircle ? 'Creating' : 'Create'}
                  </button>
                </div>
              </div>

              {createCircleError ? (
                <div className="mt-3 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200 ring-1 ring-rose-400/20">
                  {createCircleError}
                </div>
              ) : null}
            </form>
          ) : null}

          {canCreateCircle && isLoadingCircles ? (
            <article className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 shadow-xl shadow-black/30">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">
                    Loading circles
                  </p>
                  <h3 className="mt-2 text-base font-semibold text-white">
                    Pulling your shared systems into view.
                  </h3>
                </div>
                <span className="h-2.5 w-2.5 rounded-full bg-white/60 shadow-[0_0_18px_rgba(255,255,255,0.45)]" />
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                <div className="h-2 rounded-full bg-white/10" />
                <div className="h-2 rounded-full bg-white/10" />
                <div className="h-2 rounded-full bg-white/10" />
              </div>
            </article>
          ) : null}

          {canCreateCircle && circlesError ? (
            <article className="rounded-2xl border border-rose-300/20 bg-rose-500/10 p-5 text-sm text-rose-100 shadow-xl shadow-rose-950/20">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-200/70">
                Circles unavailable
              </p>
              <p className="mt-2 leading-6">{circlesError}</p>
            </article>
          ) : null}

          {canCreateCircle && !isLoadingCircles && !circlesError ? (
            <div className="grid gap-3 md:grid-cols-3">
              {circles.length > 0
                ? circles.map((circle) => (
                    <article
                      key={circle.id}
                      className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-xl shadow-black/30"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-white">
                            {circle.name}
                          </h3>
                          <p className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-white/45">
                            {circle.circle_type}
                          </p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/70">
                          {circle.status}
                        </span>
                      </div>

                      <p className="mt-4 min-h-12 text-sm leading-6 text-white/60">
                        {circle.description?.trim() ||
                          circleTypeFallbacks[circle.circle_type]}
                      </p>

                      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/5">
                          <p className="text-xs text-white/45">Type</p>
                          <p className="mt-1 font-semibold text-white">
                            {circle.circle_type}
                          </p>
                        </div>
                        <div className="rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/5">
                          <p className="text-xs text-white/45">Role</p>
                          <p className="mt-1 font-semibold text-white">
                            Owner
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {circleTypeChips[circle.circle_type].map((chip) => (
                          <span
                            key={chip}
                            className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-medium text-white/60 ring-1 ring-white/10"
                          >
                            {chip}
                          </span>
                        ))}
                      </div>

                      <Link
                        href={`/friends/circles/${circle.id}`}
                        className="mt-5 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
                      >
                        Open Circle
                      </Link>
                    </article>
                  ))
                : circleTemplates.map((circle) => (
                    <article
                      key={circle.name}
                      className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-xl shadow-black/30"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-white">
                            {circle.name}
                          </h3>
                          <p className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-white/45">
                            {circle.type}
                          </p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/70">
                          {circle.status}
                        </span>
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/5">
                          <p className="text-xs text-white/45">Members</p>
                          <p className="mt-1 font-semibold text-white">
                            {circle.members}
                          </p>
                        </div>
                        <div className="rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/5">
                          <p className="text-xs text-white/45">Role</p>
                          <p className="mt-1 font-semibold text-white">
                            {circle.role}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {circle.chips.map((chip) => (
                          <span
                            key={chip}
                            className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-medium text-white/60 ring-1 ring-white/10"
                          >
                            {chip}
                          </span>
                        ))}
                      </div>
                    </article>
                  ))}
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/10 bg-black/45 p-4 shadow-lg shadow-black/30">
            <h3 className="text-sm font-semibold text-white">
              Connect is the trust layer
            </h3>
            <p className="mt-2 text-sm leading-6 text-white/60">
              Circles define who is connected, which roles they hold, and who
              can be invited into the relationship system.
            </p>
          </div>
        </div>
      </section>

      <div className="pb-[env(safe-area-inset-bottom)]" />
    </main>
  );
}
