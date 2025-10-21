"use client";
import Image from "next/image";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import FriendsList from "./FriendsList";
import type {
  DiscoveryProfile,
  Friend,
  FriendSearchResult,
} from "@/types/friends";
import { getSupabaseBrowser } from "@/lib/supabase";

type SearchFriendsProps = {
  data: Friend[];
  discoveryProfiles?: DiscoveryProfile[];
  onRemoveFriend?: (friend: Friend) => void;
  onAddFriend?: (friend: Friend) => void;
};

type DiscoveryProfileState = DiscoveryProfile & {
  status: "idle" | "requested";
};

export default function SearchFriends({
  data,
  discoveryProfiles = [],
  onRemoveFriend,
  onAddFriend,
}: SearchFriendsProps) {
  const [q, setQ] = useState("");
  const [me, setMe] = useState<Friend | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryProfileState[]>(() =>
    discoveryProfiles.map((profile) => ({ ...profile, status: "idle" }))
  );
  const [contactsImported, setContactsImported] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [searchResults, setSearchResults] = useState<FriendSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pendingAdd, setPendingAdd] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<Set<string>>(
    () => new Set<string>()
  );
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    supabase?.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const rawUsername =
          (user.user_metadata?.username as string | undefined) ||
          user.email?.split("@")[0] ||
          "me";
        const username = rawUsername.toLowerCase();
        const displayName =
          (user.user_metadata?.full_name as string | undefined) ||
          user.email ||
          "Me";
        const avatarUrl =
          (user.user_metadata?.avatar_url as string | undefined) ||
          "https://i.pravatar.cc/96?img=67";

        setMe({
          id: user.id,
          userId: user.id,
          username,
          displayName,
          avatarUrl,
          profileUrl: username ? `/profile/${username}` : null,
          hasRing: false,
          isOnline: true,
        });
      }
    });
  }, []);

  useEffect(() => {
    setDiscovery((prev) => {
      const next = discoveryProfiles.map((profile) => {
        const existing = prev.find((item) => item.id === profile.id);
        return { ...profile, status: existing?.status ?? "idle" } as DiscoveryProfileState;
      });
      return next;
    });
  }, [discoveryProfiles]);

  const dataset = useMemo(() => (me ? [me, ...data] : data), [me, data]);
  const filtered = useMemo(() => {
    const v = q.trim().toLowerCase();
    if (!v) return dataset;
    return dataset.filter((f) =>
      f.username.toLowerCase().includes(v) ||
      (f.displayName || f.username).toLowerCase().includes(v)
    );
  }, [q, dataset]);

  const trimmedQuery = q.trim();
  const hasQuery = trimmedQuery.length > 0;

  const existingFriends = useMemo(() => {
    return new Set(
      data
        .map((friend) => friend.username.toLowerCase())
        .concat(me ? [me.username.toLowerCase()] : [])
    );
  }, [data, me]);

  useEffect(() => {
    if (!hasQuery) {
      setSearchResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setIsSearching(true);
      setSearchError(null);
      setActionError(null);

      void fetch(`/api/friends/search?q=${encodeURIComponent(trimmedQuery)}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        credentials: "include",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as
              | { error?: string }
              | null;
            if (response.status === 401) {
              throw new Error("Sign in to search for creators.");
            }
            throw new Error(payload?.error ?? "Unable to search right now.");
          }

          const payload = (await response.json()) as {
            results: FriendSearchResult[];
          };

          setSearchResults(
            (payload.results ?? []).filter((result) =>
              (result.username ?? "").trim().length > 0
            )
          );
        })
        .catch((error) => {
          if (controller.signal.aborted) {
            return;
          }

          const message =
            error instanceof Error ? error.message : "Unable to search.";
          setSearchError(message);
          setSearchResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsSearching(false);
          }
        });
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [hasQuery, trimmedQuery]);

  const handleConnect = (id: string) => {
    setDiscovery((prev) =>
      prev.map((profile) =>
        profile.id === id && profile.status !== "requested"
          ? { ...profile, status: "requested" }
          : profile
      )
    );
  };

  const handleImportContacts = () => {
    setContactsImported(true);
  };

  const handleSendInvite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = inviteEmail.trim();
    if (!value || !value.includes("@")) {
      setInviteError("Enter an email so we know where to send the invite.");
      setInviteSuccess(false);
      return;
    }

    setInviteError(null);
    setInviteSuccess(true);
    setInviteEmail("");
  };

  const handleAddFriend = useCallback(
    async (result: FriendSearchResult) => {
      const username = result.username?.trim();

      if (!username) {
        return;
      }

      const lower = username.toLowerCase();
      setPendingAdd(lower);
      setActionError(null);

      try {
        const response = await fetch("/api/friends", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ username }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          if (response.status === 401) {
            throw new Error("Sign in to add friends.");
          }
          throw new Error(payload?.error ?? "Unable to add friend right now.");
        }

        const payload = (await response.json()) as { friend?: Friend };

        if (payload.friend) {
          onAddFriend?.(payload.friend);
        }

        setAddSuccess((prev) => {
          const next = new Set(prev);
          next.add(lower);
          return next;
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to add friend.";
        setActionError(message);
      } finally {
        setPendingAdd(null);
      }
    },
    [onAddFriend]
  );

  useEffect(() => {
    if (!hasQuery) {
      setAddSuccess(new Set<string>());
      setActionError(null);
    }
  }, [hasQuery]);

  const discoveryTitle = filtered.length
    ? "Looking for someone else?"
    : `No matches for “${trimmedQuery}”`;

  const discoveryDescription = filtered.length
    ? "Invite collaborators directly or explore a few creators we think you’ll click with."
    : "Invite them straight from here or explore creators we handpicked for your scene.";

  const discoveryPanel = (
    <section className="space-y-5 rounded-2xl bg-slate-900/60 p-5 ring-1 ring-white/10">
      <header className="space-y-1">
        <h2 className="text-sm font-semibold text-white">{discoveryTitle}</h2>
        <p className="text-xs text-white/60">{discoveryDescription}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={handleImportContacts}
          className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-white/15 bg-white/5 p-4 text-left transition hover:border-white/25 hover:bg-white/10"
        >
          <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/70">
            {contactsImported ? "Imported" : "Import contacts"}
          </span>
          <p className="text-sm font-semibold text-white">
            {contactsImported ? "Your contacts were added" : "Pull in your address book"}
          </p>
          <p className="text-xs text-white/60">
            {contactsImported
              ? "We’ll surface matches as soon as they land."
              : "Discover existing fans and collaborators from your email list."}
          </p>
        </button>

        <form
          onSubmit={handleSendInvite}
          className="flex flex-col gap-2 rounded-xl bg-white/5 p-4 ring-1 ring-white/10"
        >
          <div className="space-y-1">
            <label
              htmlFor="invite-email"
              className="text-xs font-semibold uppercase tracking-wide text-white/60"
            >
              Send a direct invite
            </label>
            <input
              id="invite-email"
              type="email"
              value={inviteEmail}
              onChange={(event) => {
                setInviteEmail(event.target.value);
                if (inviteError) {
                  setInviteError(null);
                }
                if (inviteSuccess) {
                  setInviteSuccess(false);
                }
              }}
              placeholder="collaborator@email.com"
              className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white/90 active:scale-[0.98]"
          >
            Send invite
          </button>
          {inviteError ? (
            <p className="text-xs text-rose-300">{inviteError}</p>
          ) : null}
          {inviteSuccess ? (
            <p className="text-xs text-emerald-300">Invite sent! We’ll let you know when they join.</p>
          ) : null}
        </form>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-white/60">
            Recommended creators
          </h3>
        </div>
        <div className="space-y-2">
          {discovery.map((profile) => (
            <article
              key={profile.id}
              className="flex items-center gap-3 rounded-2xl bg-white/[0.08] px-3 py-3 ring-1 ring-white/10"
            >
              <Image
                src={profile.avatarUrl}
                alt={`${profile.displayName} avatar`}
                width={48}
                height={48}
                className="h-12 w-12 rounded-full object-cover"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{profile.displayName}</p>
                    <p className="truncate text-xs text-white/60">@{profile.username} • {profile.role}</p>
                  </div>
                  <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/60">
                    {profile.mutualFriends} mutual
                  </span>
                </div>
                <p className="text-xs text-white/70">{profile.highlight}</p>
              </div>
              <button
                type="button"
                onClick={() => handleConnect(profile.id)}
                disabled={profile.status === "requested"}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                  profile.status === "requested"
                    ? "cursor-default bg-white/10 text-white/70"
                    : "bg-white text-slate-900 hover:bg-white/90"
                }`}
              >
                {profile.status === "requested" ? "Invite sent" : "Connect"}
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10">
        <label className="block">
          <div className="rounded-xl bg-white/5 ring-1 ring-white/10 px-3 py-2">
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search friends"
              className="w-full bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
              aria-label="Search friends"
            />
          </div>
        </label>
      </div>

      {!hasQuery ? (
        filtered.length ? (
          <FriendsList data={filtered} onRemoveFriend={onRemoveFriend} />
        ) : (
          <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-6 text-center text-sm text-white/60">
            Start typing to find a friend or discover someone new.
          </div>
        )
      ) : (
        <div className="space-y-6">
          {filtered.length ? (
            <section className="space-y-3">
              <header className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-white/50">
                  Your friends
                </h2>
                <span className="text-[11px] uppercase tracking-wide text-white/40">
                  {filtered.length} match{filtered.length === 1 ? "" : "es"}
                </span>
              </header>
              <FriendsList data={filtered} onRemoveFriend={onRemoveFriend} />
            </section>
          ) : null}

          <section className="space-y-3">
            <header className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-white/50">
                Creators on Creator
              </h2>
              {isSearching ? (
                <span className="text-[11px] uppercase tracking-wide text-white/40">
                  Searching…
                </span>
              ) : null}
            </header>

            {searchError ? (
              <div className="rounded-xl bg-rose-500/10 p-4 text-sm text-rose-200 ring-1 ring-rose-400/30">
                {searchError}
              </div>
            ) : isSearching ? (
              <div className="rounded-xl bg-white/5 p-4 text-sm text-white/60 ring-1 ring-white/10">
                Searching for “{trimmedQuery}”…
              </div>
            ) : searchResults.length ? (
              <ul
                role="list"
                className="divide-y divide-white/5 overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10"
              >
                {searchResults.map((result) => {
                  const username = result.username.trim();
                  const lower = username.toLowerCase();
                  const displayName = result.displayName || username;
                  const isExistingFriend = existingFriends.has(lower);
                  const isAdded = addSuccess.has(lower);
                  const isPending = pendingAdd === lower;
                  const disabled = isExistingFriend || isAdded || isPending;
                  const buttonLabel = isExistingFriend
                    ? "Friend"
                    : isAdded
                      ? "Added"
                      : isPending
                        ? "Adding…"
                        : "Add";
                  const avatarSrc =
                    result.avatarUrl ||
                    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}`;

                  return (
                    <li key={username} className="flex items-center gap-3 px-4 py-3">
                      <Image
                        src={avatarSrc}
                        alt={`${displayName} avatar`}
                        width={40}
                        height={40}
                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">@{username}</p>
                        <p className="truncate text-xs text-white/60">{displayName}</p>
                        {typeof result.mutualFriends === "number" ? (
                          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-white/40">
                            {result.mutualFriends > 0
                              ? `${result.mutualFriends} mutual`
                              : "No mutual friends yet"}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (disabled) return;
                          void handleAddFriend(result);
                        }}
                        disabled={disabled}
                        className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                          disabled
                            ? "cursor-default bg-white/10 text-white/60"
                            : "bg-white text-slate-900 hover:bg-white/90"
                        }`}
                      >
                        {buttonLabel}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="rounded-xl bg-white/5 p-4 text-sm text-white/60 ring-1 ring-white/10">
                No creators found for “{trimmedQuery}”.
              </div>
            )}

            {actionError ? (
              <p className="text-xs text-rose-300">{actionError}</p>
            ) : null}
          </section>

          {discoveryPanel}
        </div>
      )}
    </div>
  );
}
