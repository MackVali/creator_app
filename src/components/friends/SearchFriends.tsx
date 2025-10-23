"use client";
import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import FriendsList from "./FriendsList";
import type { DiscoveryProfile, Friend } from "@/types/friends";
import { getSupabaseBrowser } from "@/lib/supabase";

type SearchFriendsProps = {
  data: Friend[];
  discoveryProfiles?: DiscoveryProfile[];
  onRemoveFriend?: (friend: Friend) => void;
};

type DiscoveryProfileState = DiscoveryProfile & {
  status: "idle" | "requested";
};

export default function SearchFriends({
  data,
  discoveryProfiles = [],
  onRemoveFriend,
}: SearchFriendsProps) {
  const [q, setQ] = useState("");
  const [me, setMe] = useState<Friend | null>(null);
  const [matches, setMatches] = useState<Friend[]>(data);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryProfileState[]>([]);
  const [contactsImported, setContactsImported] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  const syncDiscoveryProfiles = useCallback(
    (profiles: DiscoveryProfile[]) => {
      setDiscovery((prev) => {
        if (!profiles.length) {
          return [];
        }

        const statusMap = new Map(prev.map((item) => [item.id, item.status]));
        return profiles.map((profile) => ({
          ...profile,
          status: statusMap.get(profile.id) ?? "idle",
        }));
      });
    },
    []
  );

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
    if (discoveryProfiles.length) {
      syncDiscoveryProfiles(discoveryProfiles);
    }
  }, [discoveryProfiles, syncDiscoveryProfiles]);

  useEffect(() => {
    setMatches(data);
  }, [data]);

  useEffect(() => {
    let ignore = false;
    async function loadDiscoveryMeta() {
      try {
        const response = await fetch("/api/friends/discovery", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Unable to load discovery info.");
        }

        const payload = (await response.json()) as {
          contactImport?: { imported?: boolean };
          discoveryProfiles?: DiscoveryProfile[];
        };

        if (ignore) return;

        if (payload.contactImport) {
          setContactsImported(Boolean(payload.contactImport.imported));
        }

        if (payload.discoveryProfiles?.length) {
          syncDiscoveryProfiles(payload.discoveryProfiles);
        }
      } catch (error) {
        console.error("Failed to load discovery metadata", error);
      }
    }

    void loadDiscoveryMeta();

    return () => {
      ignore = true;
    };
  }, [syncDiscoveryProfiles]);

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;
    const trimmed = q.trim();

    async function runSearch() {
      try {
        setIsSearching(true);
        setSearchError(null);

        const params = trimmed ? `?q=${encodeURIComponent(trimmed)}` : "";
        const response = await fetch(`/api/friends/search${params}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Unable to search friends.");
        }

        const payload = (await response.json()) as {
          results: Friend[];
          discoveryProfiles: DiscoveryProfile[];
        };

        if (ignore) return;

        setMatches(payload.results ?? []);
        if (payload.discoveryProfiles) {
          syncDiscoveryProfiles(payload.discoveryProfiles);
        }
      } catch (error) {
        if (
          ignore ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        console.error("Friend search failed", error);
        setSearchError(
          error instanceof Error ? error.message : "Unable to search friends."
        );
      } finally {
        if (!ignore) {
          setIsSearching(false);
        }
      }
    }

    void runSearch();

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [q, syncDiscoveryProfiles]);

  const dataset = useMemo(
    () => (me ? [me, ...matches] : matches),
    [me, matches]
  );

  const trimmedQuery = q.trim();
  const hasQuery = trimmedQuery.length > 0;

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
    if (isImporting) return;

    setIsImporting(true);
    setImportError(null);

    void fetch("/api/friends/discovery/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Unable to import contacts.");
        }
        setContactsImported(true);
      })
      .catch((error) => {
        console.error("Contact import failed", error);
        setImportError(
          error instanceof Error ? error.message : "Unable to import contacts."
        );
      })
      .finally(() => {
        setIsImporting(false);
      });
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
    setInviteSuccess(false);

    void fetch("/api/friends/invites", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: value }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Unable to send invite.");
        }

        setInviteSuccess(true);
        setInviteEmail("");
      })
      .catch((error) => {
        console.error("Failed to send invite", error);
        setInviteError(
          error instanceof Error ? error.message : "Unable to send invite."
        );
        setInviteSuccess(false);
      });
  };

  const discoveryTitle = dataset.length
    ? "Looking for someone else?"
    : `No matches for “${trimmedQuery}”`;

  const discoveryDescription = dataset.length
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
          disabled={isImporting}
          className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-white/15 bg-white/5 p-4 text-left transition hover:border-white/25 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/70">
            {contactsImported
              ? "Imported"
              : isImporting
                ? "Importing…"
                : "Import contacts"}
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
        {importError ? (
          <p className="text-xs text-rose-300">{importError}</p>
        ) : null}

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

      {dataset.length ? (
        <>
          <FriendsList
            data={dataset}
            onRemoveFriend={onRemoveFriend}
            isLoading={isSearching}
            error={searchError}
          />
          {hasQuery ? discoveryPanel : null}
        </>
      ) : hasQuery ? (
        discoveryPanel
      ) : (
        <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-6 text-center text-sm text-white/60">
          Start typing to find a friend or discover someone new.
        </div>
      )}
    </div>
  );
}
