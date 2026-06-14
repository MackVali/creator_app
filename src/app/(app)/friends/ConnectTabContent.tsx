'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { PullRefreshShell } from '@/components/ui/PullRefreshShell';
import type {
  DiscoveryProfile,
  Friend,
  FriendRequest,
  SentInvite,
  SuggestedFriend,
} from '@/types/friends';
import FriendsList from '@/components/friends/FriendsList';
import { RelationshipView } from '@/components/friends/RelationshipViewBar';
import SearchFriends from '@/components/friends/SearchFriends';
import RequestsInvites from '@/components/friends/RequestsInvites';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  Select,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { ArrowRight, Check, ChevronDown, Search } from 'lucide-react';
import { userHasAppManagerAccess } from '@/lib/auth/userRoles';
import { useProfile } from '@/lib/hooks/useProfile';

type ConnectTab = 'friends' | 'search' | 'requests' | 'circles';
type ConnectTabItem = RelationshipView | 'requests' | 'circles';

type CircleType = 'HOUSEHOLD' | 'TEAM' | 'CLIENTS' | 'STUDIO' | 'CUSTOM';

type ProfileOverviewProfile = {
  username?: string | null;
  name?: string | null;
  avatar_url?: string | null;
} | null;

type Circle = {
  id: string;
  owner_user_id: string;
  name: string;
  icon_emoji: string | null;
  circle_type: CircleType;
  status: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  viewerRole?: string | null;
  activeMemberCount?: number;
  memberPreview?: CircleMemberPreview[];
};

type CircleMemberPreview = {
  userId: string;
  role: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  initials: string;
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

const circleTypeOptions: CircleType[] = [
  'HOUSEHOLD',
  'TEAM',
  'CLIENTS',
  'STUDIO',
  'CUSTOM',
];

const relationshipTabOptions: Array<{
  view: RelationshipView;
  refKey: 'following' | 'followers' | 'friends';
}> = [
  { view: 'following', refKey: 'following' },
  { view: 'followers', refKey: 'followers' },
  { view: 'friends', refKey: 'friends' },
];

const normalizeSearchValue = (value: string | null | undefined) =>
  value?.toLowerCase().trim() ?? '';

const matchesSearchQuery = (
  query: string,
  values: Array<string | null | undefined>
) => {
  if (!query) {
    return true;
  }

  return values.some((value) => normalizeSearchValue(value).includes(query));
};

export default function ConnectTabContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const [tab, setTab] = useState<ConnectTab>(() =>
    searchParams.get('tab') === 'search' ? 'search' : 'friends'
  );
  const [friendsView, setFriendsView] = useState<RelationshipView>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [invites, setInvites] = useState<SentInvite[]>([]);
  const [contactImport, setContactImport] = useState<ContactImportStatus | null>(null);
  const [suggested, setSuggested] = useState<SuggestedFriend[]>([]);
  const [searchProfiles, setSearchProfiles] = useState<DiscoveryProfile[]>([]);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [isLoadingCircles, setIsLoadingCircles] = useState(false);
  const [circlesError, setCirclesError] = useState<string | null>(null);
  const [circleInvites, setCircleInvites] = useState<CircleInvite[]>([]);
  const [isLoadingCircleInvites, setIsLoadingCircleInvites] = useState(false);
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
  const [tabSearchQuery, setTabSearchQuery] = useState('');
  const canCreateCircle = userHasAppManagerAccess(user);
  const followingTabRef = useRef<HTMLButtonElement>(null);
  const followersTabRef = useRef<HTMLButtonElement>(null);
  const friendsTabRef = useRef<HTMLButtonElement>(null);
  const requestsTabRef = useRef<HTMLButtonElement>(null);
  const circlesTabRef = useRef<HTMLButtonElement>(null);
  const isMountedRef = useRef(true);
  const hasRequestedRequestsRef = useRef(false);
  const hasRequestedCircleInvitesRef = useRef(false);
  const hasRequestedSearchRef = useRef(false);
  const hasRequestedCirclesRef = useRef(false);

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
        contactImport?: ContactImportStatus;
        invites?: SentInvite[];
        suggestions?: SuggestedFriend[];
        discoveryProfiles?: DiscoveryProfile[];
      };

      if (!isMountedRef.current) {
        return;
      }

      setContactImport(data.contactImport ?? null);
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
      setContactImport(null);
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
    if (tab !== 'requests') return;
    if (hasRequestedRequestsRef.current) return;
    hasRequestedRequestsRef.current = true;
    void refreshRequests();
  }, [refreshRequests, tab]);

  useEffect(() => {
    if (tab !== 'requests') return;
    if (hasRequestedCircleInvitesRef.current) return;
    hasRequestedCircleInvitesRef.current = true;
    void refreshCircleInvites();
  }, [refreshCircleInvites, tab]);

  useEffect(() => {
    if (tab !== 'search' && tab !== 'requests' && tabSearchQuery.trim().length === 0) {
      return;
    }
    if (hasRequestedSearchRef.current) return;
    hasRequestedSearchRef.current = true;
    void refreshSearch();
  }, [refreshSearch, tab, tabSearchQuery]);

  useEffect(() => {
    if (!canCreateCircle) {
      setCircles([]);
      setCirclesError(null);
      setIsLoadingCircles(false);
      setShowCreateCircleForm(false);
      return;
    }

    if (tab !== 'circles') return;
    if (hasRequestedCirclesRef.current) return;
    hasRequestedCirclesRef.current = true;

    void refreshCircles();
  }, [canCreateCircle, refreshCircles, tab]);

  const sortedFriends = useMemo(() => {
    if (!friends.length) {
      return [] as Friend[];
    }
    return [...friends].sort((a, b) =>
      (a.displayName || a.username).localeCompare(b.displayName || b.username)
    );
  }, [friends]);

  const normalizedTabSearchQuery = useMemo(
    () => normalizeSearchValue(tabSearchQuery),
    [tabSearchQuery]
  );
  const hasTabSearchQuery = tabSearchQuery.trim().length > 0;

  const filteredFriends = useMemo(
    () =>
      sortedFriends.filter((friend) =>
        matchesSearchQuery(normalizedTabSearchQuery, [
          friend.displayName,
          friend.username,
        ])
      ),
    [normalizedTabSearchQuery, sortedFriends]
  );

  const filteredRequests = useMemo(
    () =>
      requests.filter((request) =>
        matchesSearchQuery(normalizedTabSearchQuery, [
          request.displayName,
          request.username,
        ])
      ),
    [normalizedTabSearchQuery, requests]
  );

  const filteredCircleInvites = useMemo(
    () =>
      circleInvites.filter((invite) =>
        matchesSearchQuery(normalizedTabSearchQuery, [
          invite.circle?.name,
          invite.role,
          invite.invitedByProfile?.name,
          invite.invitedByProfile?.username,
          invite.circle?.circle_type,
        ])
      ),
    [circleInvites, normalizedTabSearchQuery]
  );

  const filteredCircles = useMemo(
    () =>
      circles.filter((circle) =>
        matchesSearchQuery(normalizedTabSearchQuery, [
          circle.name,
          circle.circle_type,
          circle.description,
        ])
      ),
    [circles, normalizedTabSearchQuery]
  );

  const tabSearchPlaceholder =
    tab === 'requests'
      ? 'Search requests'
      : tab === 'circles'
        ? 'Search circles'
        : friendsView === 'following'
          ? 'Search following'
          : friendsView === 'followers'
            ? 'Search followers'
            : 'Search friends';

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      return;
    }

    event.preventDefault();

    const order: ConnectTabItem[] = [
      'following',
      'followers',
      'friends',
      'requests',
      'circles',
    ];
    const currentTab: ConnectTabItem =
      tab === 'friends' ? friendsView : tab === 'search' ? 'friends' : tab;
    const currentIndex = order.indexOf(currentTab);
    const direction =
      event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (currentIndex + direction + order.length) % order.length;
    const nextTab = order[nextIndex];

    if (nextTab === 'requests' || nextTab === 'circles') {
      setTab(nextTab);
    } else {
      setFriendsView(nextTab);
      setTab('friends');
    }

    const targetRef =
      nextTab === 'following'
        ? followingTabRef
        : nextTab === 'followers'
          ? followersTabRef
          : nextTab === 'friends'
            ? friendsTabRef
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

  const overviewProfile = profile as ProfileOverviewProfile;
  const email = user?.email ?? '';
  const initials = profileLoading
    ? ''
    : getInitials(
        overviewProfile?.name || overviewProfile?.username || null,
        email
      );

  const handlePullRefresh = useCallback(async () => {
    const promises: Promise<void>[] = [
      refreshFriends(),
      refreshRequests(),
      refreshCircleInvites(),
      refreshSearch(),
    ];
    if (canCreateCircle) {
      promises.push(refreshCircles());
    }
    await Promise.all(promises);
  }, [
    refreshFriends,
    refreshRequests,
    refreshCircleInvites,
    refreshSearch,
    refreshCircles,
    canCreateCircle,
  ]);

  return (
    <PullRefreshShell
      onRefresh={handlePullRefresh}
      lockDocumentScroll={false}
      contentClassName="mx-auto w-full max-w-4xl space-y-6 px-4 pb-10 pt-6"
    >
      <div className="space-y-3">
        <h1 className="sr-only">Connect</h1>
        <ProfileOverview
          profile={overviewProfile}
          email={email}
          initials={initials}
        />
        <div
          role="tablist"
          aria-label="Connect options"
          className="flex w-full gap-6 overflow-x-auto bg-black px-1 py-1 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
        >
          {relationshipTabOptions.map(({ view, refKey }) => {
            const ref =
              refKey === 'following'
                ? followingTabRef
                : refKey === 'followers'
                  ? followersTabRef
                  : friendsTabRef;
            const isSelected = tab === 'friends' && friendsView === view;

            return (
              <button
                key={view}
                ref={ref}
                id={`${view}-tab`}
                role="tab"
                onClick={() => {
                  setFriendsView(view);
                  setTab('friends');
                }}
                onKeyDown={handleKeyDown}
                type="button"
                aria-selected={isSelected}
                aria-controls="friends-panel"
                tabIndex={isSelected ? 0 : -1}
                className={`h-10 shrink-0 border-b px-0.5 text-sm font-semibold transition ${
                  isSelected
                    ? 'border-white/70 text-white'
                    : 'border-transparent text-white/48 hover:text-white/80'
                }`}
              >
                {getRelationshipLabel(view)}
              </button>
            );
          })}
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
            className={`h-10 shrink-0 border-b px-0.5 text-sm font-semibold transition ${
              tab === 'requests'
                ? 'border-white/70 text-white'
                : 'border-transparent text-white/48 hover:text-white/80'
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
            className={`h-10 shrink-0 border-b px-0.5 text-sm font-semibold transition ${
              tab === 'circles'
                ? 'border-white/70 text-white'
                : 'border-transparent text-white/48 hover:text-white/80'
            }`}
          >
            Circles
          </button>
        </div>
        <label className="block">
          <span className="sr-only">{tabSearchPlaceholder}</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" aria-hidden="true" />
            <input
              type="search"
              value={tabSearchQuery}
              onChange={(event) => setTabSearchQuery(event.target.value)}
              placeholder={tabSearchPlaceholder}
              className="h-11 w-full rounded-full bg-black pl-11 pr-4 text-sm font-medium text-white outline-none ring-1 ring-white/10 transition placeholder:text-white/35 focus:ring-white/35"
            />
          </div>
        </label>
      </div>

      <section
        id="friends-panel"
        role="tabpanel"
        aria-labelledby="friends-tab"
        hidden={tab !== 'friends'}
      >

        {isLoading ? (
          <div className="flex justify-center py-8" aria-label="Loading">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
          </div>
        ) : !error && sortedFriends.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#050506]/90 p-6 text-center text-sm text-white/60 shadow-xl shadow-black/30">
            {friendsView === 'following'
              ? 'You are not following anyone yet.'
              : friendsView === 'followers'
                ? 'No one is following you yet.'
                : 'You haven’t added any friends yet.'}
          </div>
        ) : !error && filteredFriends.length === 0 ? (
          <p className="px-1 text-sm text-white/50">No matches.</p>
        ) : (
          <FriendsList
            data={filteredFriends}
            isLoading={isLoading}
            error={error}
            relationshipView={friendsView}
          />
        )}
        {tab === 'friends' && hasTabSearchQuery ? (
          <SearchFriends
            data={sortedFriends}
            discoveryProfiles={searchProfiles}
            onRequestResolved={handleRequestResolved}
            embedded
            query={tabSearchQuery}
          />
        ) : null}
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
        {tab === 'requests' && hasTabSearchQuery ? (
          <SearchFriends
            data={sortedFriends}
            discoveryProfiles={searchProfiles}
            onRequestResolved={handleRequestResolved}
            embedded
            query={tabSearchQuery}
          />
        ) : null}
        <RequestsInvites
          requests={filteredRequests}
          invites={invites}
          suggestions={suggested}
          contactImport={contactImport}
          circleInvites={filteredCircleInvites}
          isLoadingCircleInvites={isLoadingCircleInvites}
          circleInvitesError={circleInvitesError}
          respondingCircleInviteId={respondingCircleInviteId}
          handleCircleInviteResponse={handleCircleInviteResponse}
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
        aria-label="Search friends"
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
          {canCreateCircle ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowCreateCircleForm((current) => !current);
                  setCreateCircleError(null);
                }}
                className="h-10 rounded-full border border-white/10 bg-white/[0.06] px-4 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white"
              >
                {showCreateCircleForm ? 'Close Form' : 'Create Circle'}
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/55 p-4 shadow-xl shadow-black/30">
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
            circles.length > 0 ? (
              filteredCircles.length > 0 ? (
                <div className="space-y-2">
                  {filteredCircles.map((circle) => (
                    <CircleOverviewRow
                      key={circle.id}
                      circle={circle}
                    />
                  ))}
                </div>
              ) : (
                <p className="px-1 text-sm text-white/50">No matches.</p>
              )
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/55 p-5 text-center text-sm text-white/60 shadow-xl shadow-black/30">
                No circles yet.
              </div>
            )
          ) : null}
          {tab === 'circles' && hasTabSearchQuery ? (
            <SearchFriends
              data={sortedFriends}
              discoveryProfiles={searchProfiles}
              onRequestResolved={handleRequestResolved}
              embedded
              query={tabSearchQuery}
            />
          ) : null}
        </div>
      </section>

      <div className="pb-[env(safe-area-inset-bottom)]" />
    </PullRefreshShell>
  );
}

type ProfileOverviewProps = {
  profile: ProfileOverviewProfile;
  email: string;
  initials: string;
};

type CircleOverviewRowProps = {
  circle: Circle;
};

function CircleOverviewRow({ circle }: CircleOverviewRowProps) {
  const icon = circle.icon_emoji?.trim() || circle.name.charAt(0).toUpperCase();
  const memberPreview = circle.memberPreview ?? [];
  const activeMemberCount = circle.activeMemberCount ?? memberPreview.length;

  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-black/55 shadow-xl shadow-black/30 transition hover:border-white/18 hover:bg-white/[0.035]">
      <Link
        href={`/friends/circles/${circle.id}`}
        className="group flex w-full items-start gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-base font-semibold text-white shadow-inner shadow-black/25">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-5 text-white">
            {circle.name}
          </span>
          <CircleMemberAvatars
            members={memberPreview}
            totalCount={activeMemberCount}
          />
        </span>
        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-white/45 transition group-hover:text-white/70" aria-hidden="true" />
      </Link>
    </article>
  );
}

function CircleMemberAvatars({
  members,
  totalCount,
}: {
  members: CircleMemberPreview[];
  totalCount: number;
}) {
  const visibleMembers = members.slice(0, 3);
  const hiddenCount = Math.max(totalCount - visibleMembers.length, 0);

  if (totalCount === 0) {
    return (
      <span className="mt-2 block text-xs font-medium text-white/40">
        No active members
      </span>
    );
  }

  return (
    <span className="mt-2 flex items-center">
      {visibleMembers.map((member, index) => (
        <CircleMemberAvatar
          key={member.userId}
          member={member}
          index={index}
        />
      ))}
      {hiddenCount > 0 ? (
        <span
          className="-ml-2 flex h-7 min-w-7 items-center justify-center rounded-full border border-black bg-white px-1.5 text-[10px] font-bold text-black shadow-sm"
          aria-label={`${hiddenCount} more members`}
        >
          +{hiddenCount}
        </span>
      ) : null}
    </span>
  );
}

function CircleMemberAvatar({
  member,
  index,
}: {
  member: CircleMemberPreview;
  index: number;
}) {
  const marginClass = index === 0 ? '' : '-ml-2';

  if (member.avatarUrl) {
    return (
      <Image
        src={member.avatarUrl}
        alt={member.displayName}
        width={28}
        height={28}
        unoptimized
        className={`${marginClass} h-7 w-7 rounded-full border border-black object-cover shadow-sm`}
      />
    );
  }

  return (
    <span
      className={`${marginClass} flex h-7 w-7 items-center justify-center rounded-full border border-black bg-white/[0.12] text-[10px] font-bold text-white shadow-sm`}
      aria-label={member.displayName}
    >
      {member.initials || member.displayName.charAt(0).toUpperCase()}
    </span>
  );
}

function ProfileOverview({
  profile,
  email,
  initials,
}: ProfileOverviewProps) {
  const handle = profile?.username?.trim();
  const displayName = profile?.name?.trim() || handle || email || 'Your profile';
  const secondaryIdentifier = handle
    ? `@${handle}`
    : email && email !== displayName
      ? email
      : null;
  const avatarUrl = profile?.avatar_url;

  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.025]">
      <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <ProfileAvatar src={avatarUrl} alt={displayName} fallback={initials} />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold leading-tight text-[var(--text)]">
              {displayName}
            </h2>
            {secondaryIdentifier && (
              <p className="mt-0.5 truncate text-xs leading-5 text-[var(--muted)]">
                {secondaryIdentifier}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

type ProfileAvatarProps = {
  src?: string | null;
  alt: string;
  fallback: string;
};

function ProfileAvatar({ src, alt, fallback }: ProfileAvatarProps) {
  const fallbackValue = fallback || alt.charAt(0).toUpperCase();

  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        width={64}
        height={64}
        unoptimized
        className="h-16 w-16 rounded-full object-cover shadow-md shadow-black/25"
      />
    );
  }

  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.08] text-lg font-semibold text-white shadow-inner shadow-black/30">
      {fallbackValue}
    </div>
  );
}

function getInitials(name: string | null, email: string) {
  if (name) {
    return name
      .split(' ')
      .filter(Boolean)
      .map((word) => word.charAt(0))
      .join('')
      .toUpperCase();
  }

  if (email) {
    return email.charAt(0).toUpperCase();
  }

  return '';
}
