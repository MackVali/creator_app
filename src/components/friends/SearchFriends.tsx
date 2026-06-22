"use client";
import Image from "next/image";
import Link from "next/link";
import { User } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import FriendsList from "./FriendsList";
import type { DiscoveryProfile, Friend } from "@/types/friends";
import { DEFAULT_AVATAR_URL } from "@/lib/friends/avatar";
import { readNativeContactsForImport } from "@/lib/friends/nativeContacts";
import { getSupabaseBrowser } from "@/lib/supabase";
import {
  hapticComplete,
  hapticErrorPattern,
  hapticSnap,
  hapticWarningPattern,
} from "@/lib/haptics/creatorHaptics";

type SearchFriendsProps = {
  data: Friend[];
  discoveryProfiles?: DiscoveryProfile[];
  onRemoveFriend?: (friend: Friend) => void;
  onRequestResolved?: () => void | Promise<void>;
  embedded?: boolean;
  query?: string;
  hideLocalInput?: boolean;
  hideInviteTools?: boolean;
};

type DiscoveryRelationship =
  | "friends"
  | "following"
  | "followed_by"
  | "incoming_request"
  | "outgoing_request"
  | "none"
  | "self";

type DiscoveryProfileState = DiscoveryProfile & {
  relationship?: DiscoveryRelationship;
  status: "idle" | "sending" | "following" | "friends";
};

type ContactInviteRow = {
  id: string;
  name: string;
  detail: string;
};

const getDiscoveryIdentityKey = (
  profile: DiscoveryProfile | DiscoveryProfileState
) => {
  const normalizedUsername = profile.username?.trim().toLowerCase();
  return normalizedUsername || profile.id;
};

const followButtonClass =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-transparent bg-white/[0.14] px-3 text-[12px] font-semibold text-white/85 transition hover:border-white/10 hover:bg-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-55 active:scale-[0.97]";

export default function SearchFriends({
  data,
  discoveryProfiles = [],
  onRemoveFriend,
  onRequestResolved,
  embedded = false,
  query,
  hideLocalInput = false,
  hideInviteTools = false,
}: SearchFriendsProps) {
  const [q, setQ] = useState("");
  const [me, setMe] = useState<Friend | null>(null);
  const [matches, setMatches] = useState<Friend[]>(data);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryProfileState[]>([]);
  const [contactsImported, setContactsImported] = useState(false);
  const [contactInviteRows, setContactInviteRows] = useState<ContactInviteRow[]>(
    []
  );
  const [pendingContactInviteId, setPendingContactInviteId] = useState<
    string | null
  >(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);
  const effectiveQuery = query ?? q;

  const syncDiscoveryProfiles = useCallback(
    (profiles: DiscoveryProfile[]) => {
      setDiscovery((prev) => {
        if (!profiles.length) {
          return [];
        }

        const statusMap = new Map(
          prev.map((item) => [getDiscoveryIdentityKey(item), item.status])
        );
        const mapRelationshipToStatus = (
          relationship?: DiscoveryRelationship
        ): DiscoveryProfileState["status"] | null => {
          switch (relationship) {
            case "friends":
              return "friends";
            case "following":
              return "following";
            case "followed_by":
            case "incoming_request":
            case "outgoing_request":
            case "none":
              return "idle";
            case "self":
              return null;
            default:
              return null;
          }
        };

        return profiles.map((profile) => {
          const typedProfile = profile as DiscoveryProfile & {
            relationship?: DiscoveryRelationship;
          };
          const relationship = typedProfile.relationship;
          const relationshipStatus = mapRelationshipToStatus(relationship);
          const identityKey = getDiscoveryIdentityKey(profile);

          return {
            ...profile,
            relationship,
            status:
              statusMap.get(identityKey) === "sending"
                ? "sending"
                : relationshipStatus ??
                  statusMap.get(identityKey) ??
                  "idle",
          };
        });
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
          DEFAULT_AVATAR_URL;

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
    if (!embedded && discoveryProfiles.length) {
      syncDiscoveryProfiles(discoveryProfiles);
    }
  }, [discoveryProfiles, embedded, syncDiscoveryProfiles]);

  useEffect(() => {
    setMatches(data);
  }, [data]);

  useEffect(() => {
    setFollowError(null);
  }, [effectiveQuery]);

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
          unmatchedContacts?: ContactInviteRow[];
        };

        if (ignore) return;

        if (payload.contactImport) {
          setContactsImported(Boolean(payload.contactImport.imported));
        }

        if (payload.discoveryProfiles?.length) {
          syncDiscoveryProfiles(payload.discoveryProfiles);
        }

        if (payload.unmatchedContacts?.length) {
          setContactInviteRows(payload.unmatchedContacts);
        }
      } catch (error) {
        console.error("Failed to load discovery metadata", error);
      }
    }

    if (!embedded) {
      void loadDiscoveryMeta();
    }

    return () => {
      ignore = true;
    };
  }, [embedded, syncDiscoveryProfiles]);

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;
    const trimmed = effectiveQuery.trim();

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
  }, [effectiveQuery, syncDiscoveryProfiles]);

  const uniqueDiscovery = useMemo(() => {
    const seen = new Set<string>();
    return discovery.filter((profile) => {
      const identityKey = getDiscoveryIdentityKey(profile);
      if (seen.has(identityKey)) return false;
      seen.add(identityKey);
      return true;
    });
  }, [discovery]);

  const actionableDiscovery = useMemo(
    () => uniqueDiscovery.filter((profile) => profile.relationship !== "self"),
    [uniqueDiscovery]
  );

  const dataset = useMemo(
    () => (me ? [me, ...matches] : matches),
    [me, matches]
  );

  const trimmedQuery = effectiveQuery.trim();
  const hasQuery = trimmedQuery.length > 0;
  const hasContactInviteRows = contactInviteRows.length > 0;
  const shouldShowDiscovery =
    uniqueDiscovery.length > 0 || hasContactInviteRows || hasQuery;
  const shouldHideLocalInput = embedded || hideLocalInput;
  const shouldHideInviteTools = embedded || hideInviteTools;

  const handleFollow = useCallback(
    (profile: DiscoveryProfileState) => {
      if (profile.status !== "idle") {
        return;
      }

      const identityKey = getDiscoveryIdentityKey(profile);
      const updateStatus = (status: DiscoveryProfileState["status"]) => {
        setDiscovery((prev) =>
          prev.map((item) =>
            getDiscoveryIdentityKey(item) === identityKey
              ? { ...item, status }
              : item
          )
        );
      };

      updateStatus("sending");
      setFollowError(null);

      void (async () => {
        try {
          const response = await fetch("/api/friends", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ username: profile.username }),
          });

          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;

          if (!response.ok) {
            const message = payload?.error ?? "Unable to follow right now.";
            updateStatus("idle");
            void hapticErrorPattern();
            setFollowError(message);
            return;
          }

          updateStatus("following");
          setFollowError(null);
          await onRequestResolved?.();
          void hapticComplete();
        } catch (error) {
          console.error("Failed to follow user", error);
          updateStatus("idle");
          void hapticErrorPattern();
          setFollowError(
            error instanceof Error ? error.message : "Unable to follow right now."
          );
        }
      })();
    },
    [onRequestResolved]
  );

  const handleImportContacts = () => {
    if (isImporting) return;

    setIsImporting(true);
    setImportError(null);
    setImportNotice(null);

    void (async () => {
      try {
        const nativeContacts = await readNativeContactsForImport();

        if (nativeContacts.status === "unsupported") {
          void hapticWarningPattern();
          setImportError(nativeContacts.message);
          return;
        }

        if (nativeContacts.status === "denied") {
          void hapticWarningPattern();
          setImportError(nativeContacts.message);
          return;
        }

        if (nativeContacts.status === "empty") {
          void hapticWarningPattern();
          setImportNotice(nativeContacts.message);
          return;
        }

        const response = await fetch("/api/friends/discovery/import", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            totalContacts: nativeContacts.totalContacts,
            contacts: nativeContacts.contacts,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Unable to import contacts.");
        }

        const payload = (await response.json()) as {
          matchedProfiles?: DiscoveryProfile[];
          unmatchedContacts?: ContactInviteRow[];
        };
        const matchedProfiles = payload.matchedProfiles ?? [];
        const unmatchedContacts = payload.unmatchedContacts ?? [];

        if (matchedProfiles.length) {
          syncDiscoveryProfiles([...matchedProfiles, ...uniqueDiscovery]);
        }

        setContactInviteRows(unmatchedContacts);
        setContactsImported(true);
        setImportNotice(
          matchedProfiles.length || unmatchedContacts.length
            ? `${matchedProfiles.length} CREATOR match${
                matchedProfiles.length === 1 ? "" : "es"
              } found. ${unmatchedContacts.length} contact${
                unmatchedContacts.length === 1 ? "" : "s"
              } ready to invite.`
            : "No contacts found on CREATOR yet."
        );
        void hapticComplete();
      } catch (error) {
        console.error("Contact import failed", error);
        void hapticErrorPattern();
        setImportError(
          error instanceof Error ? error.message : "Unable to import contacts."
        );
      } finally {
        setIsImporting(false);
      }
    })();
  };

  const handleInviteContact = (contact: ContactInviteRow) => {
    if (pendingContactInviteId) return;

    setPendingContactInviteId(contact.id);
    setImportError(null);
    setImportNotice(null);

    void (async () => {
      const inviteUrl =
        typeof window !== "undefined"
          ? new URL("/friends", window.location.origin).toString()
          : "https://trycreator.app/friends";
      const inviteText = `Join me on CREATOR: ${inviteUrl}`;

      try {
        if (typeof navigator !== "undefined" && navigator.share) {
          await navigator.share({
            title: "Join CREATOR",
            text: inviteText,
            url: inviteUrl,
          });
          setImportNotice(`Invite ready for ${contact.name}.`);
          void hapticComplete();
          return;
        }

        if (
          typeof navigator !== "undefined" &&
          navigator.clipboard?.writeText
        ) {
          await navigator.clipboard.writeText(inviteText);
          setImportNotice("Invite link copied.");
          void hapticComplete();
          return;
        }

        void hapticWarningPattern();
        setImportError("Sharing is not supported on this device.");
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") {
          void hapticSnap();
          return;
        }

        console.error("Failed to invite contact", error);
        void hapticErrorPattern();
        setImportError(
          error instanceof Error ? error.message : "Unable to invite right now."
        );
      } finally {
        setPendingContactInviteId(null);
      }
    })();
  };

  const handleSendInvite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = inviteEmail.trim();
    if (!value || !value.includes("@")) {
      void hapticWarningPattern();
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
        void hapticComplete();
      })
      .catch((error) => {
        console.error("Failed to send invite", error);
        void hapticErrorPattern();
        setInviteError(
          error instanceof Error ? error.message : "Unable to send invite."
        );
        setInviteSuccess(false);
      });
  };

  const discoveryTitle = hasQuery
    ? "Search every profile"
    : dataset.length
      ? "Looking for someone else?"
      : `No matches for “${trimmedQuery}”`;

  const discoveryDescription = hasQuery
    ? "We pull matches from every profile on the platform so you can follow anyone."
    : dataset.length
      ? "Invite collaborators directly or explore a few creators we think you’ll click with."
      : "Invite them straight from here or explore creators we handpicked for your scene.";

  const discoveryResultsTitle = hasQuery
    ? `Search results for “${trimmedQuery}”`
    : "Recommended creators";

  const discoveryResultsCount =
    hasQuery && actionableDiscovery.length > 0
      ? `${actionableDiscovery.length} profile${actionableDiscovery.length === 1 ? "" : "s"}`
      : null;

  const discoveryResultsList = actionableDiscovery.length ? (
    <div className="space-y-2">
      {actionableDiscovery.map((profile) => {
        const followLabel =
          profile.status === "sending"
            ? "Following…"
            : profile.status === "following" || profile.status === "friends"
              ? "Following"
              : "Follow";

        return (
          <article
            key={profile.id}
            className="flex min-h-[56px] items-center gap-3 rounded-none border border-black/80 bg-black/70 px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.38)] transition hover:border-white/10 hover:bg-[#050506]/85"
          >
            <Link
              href={profile.profileUrl ?? `/profile/${profile.username}`}
              className="group flex min-w-0 flex-1 items-center gap-3 rounded-2xl pr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              {profile.avatarUrl && profile.avatarUrl !== DEFAULT_AVATAR_URL ? (
                <Image
                  src={profile.avatarUrl}
                  alt={`${profile.displayName} avatar`}
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-full object-cover opacity-80 grayscale-[10%]"
                />
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white/34 ring-1 ring-white/8">
                  <User className="h-6 w-6" aria-hidden="true" />
                  <span className="sr-only">{profile.displayName} avatar</span>
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-[13px] font-semibold text-white transition-colors group-hover:text-white/90">
                    {profile.displayName}
                  </p>
                  <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/50">
                    {profile.mutualFriends} mutual
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-white/65 transition-colors group-hover:text-white/80">
                  @{profile.username}
                </p>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => handleFollow(profile)}
              disabled={profile.status !== "idle"}
              className={followButtonClass}
              aria-label={`${followLabel} ${profile.username}`}
            >
              {followLabel}
            </button>
          </article>
        );
      })}
    </div>
  ) : (
    <p className="text-xs text-white/60">
      {hasQuery
        ? `No profiles matched “${trimmedQuery}”. Try a different name and we’ll search every account.`
        : "Follow creators to see personalized recommendations in this space."}
    </p>
  );

  const contactInviteResultsList = hasContactInviteRows ? (
    <div className="space-y-2">
      {contactInviteRows.map((contact) => {
        const isInviting = pendingContactInviteId === contact.id;

        return (
          <article
            key={contact.id}
            className="flex min-h-[56px] items-center gap-3 rounded-none border border-black/80 bg-black/70 px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.38)]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white/34 ring-1 ring-white/8">
              <User className="h-6 w-6" aria-hidden="true" />
              <span className="sr-only">{contact.name} avatar</span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-white">
                {contact.name}
              </p>
              <p className="mt-0.5 truncate text-xs text-white/65">
                {contact.detail}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleInviteContact(contact)}
              disabled={Boolean(pendingContactInviteId)}
              className={followButtonClass}
              aria-label={`Invite ${contact.name}`}
            >
              {isInviting ? "Inviting..." : "Invite"}
            </button>
          </article>
        );
      })}
    </div>
  ) : null;

  const discoveryPanel = embedded ? (
    <section className="space-y-3 border-t border-white/10 pt-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Search</h2>
        {discoveryResultsCount ? (
          <span className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
            {discoveryResultsCount}
          </span>
        ) : null}
      </div>
      {followError ? (
        <p className="text-xs text-rose-300">{followError}</p>
      ) : null}
      {isSearching ? (
        <p className="text-xs text-white/50">Searching profiles...</p>
      ) : null}
      {searchError ? (
        <p className="text-xs text-rose-300">{searchError}</p>
      ) : null}
      {discoveryResultsList}
    </section>
  ) : (
    <section className="space-y-5 rounded-2xl bg-black/60 p-5 ring-1 ring-white/10">
      <header className="space-y-1">
        <h2 className="text-sm font-semibold text-white">{discoveryTitle}</h2>
        <p className="text-xs text-white/60">{discoveryDescription}</p>
      </header>

      <div className="space-y-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-white/60">
              {discoveryResultsTitle}
            </h3>
            {discoveryResultsCount ? (
              <span className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
                {discoveryResultsCount}
              </span>
            ) : null}
          </div>
          {followError ? (
            <p className="text-xs text-rose-300">{followError}</p>
          ) : null}
          {discoveryResultsList}
        </div>

        {contactInviteResultsList ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-white/60">
                Contacts to invite
              </h3>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-white/50">
                {contactInviteRows.length}
              </span>
            </div>
            {contactInviteResultsList}
          </div>
        ) : null}

        {shouldHideInviteTools ? null : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleImportContacts}
                disabled={isImporting}
                className="flex w-full flex-col items-start gap-2 rounded-xl border border-dashed border-white/15 bg-white/5 p-4 text-left transition hover:border-white/25 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/70">
                  {contactsImported
                    ? "Imported"
                    : isImporting
                      ? "Importing…"
                      : "Import contacts"}
                </span>
                <p className="text-sm font-semibold text-white">
                  {contactsImported
                    ? "Your contacts were added"
                    : "Pull in your address book"}
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
              {importNotice ? (
                <p className="text-xs font-semibold text-white/75">
                  {importNotice}
                </p>
              ) : null}
            </div>

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
                  className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black/80 transition hover:bg-white/90 active:scale-[0.98]"
              >
                Send invite
              </button>
              {inviteError ? (
                <p className="text-xs text-rose-300">{inviteError}</p>
              ) : null}
              {inviteSuccess ? (
                <p className="text-xs font-semibold text-white/80">
                  Invite sent! We’ll let you know when they join.
                </p>
              ) : null}
            </form>
          </div>
        )}
      </div>
    </section>
  );

  if (embedded) {
    return discoveryPanel;
  }

  return (
    <div className="space-y-3">
      {shouldHideLocalInput ? null : (
        <div className="sticky top-0 z-10">
          <label className="block">
            <div className="rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10">
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
      )}

      {dataset.length ? (
        <>
          <FriendsList
            data={dataset}
            onRemoveFriend={onRemoveFriend}
            isLoading={isSearching}
            error={searchError}
          />
          {shouldShowDiscovery ? discoveryPanel : null}
        </>
      ) : shouldShowDiscovery ? (
        discoveryPanel
      ) : (
        <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-6 text-center text-sm text-white/60">
          Start typing to find a friend or discover someone new.
        </div>
      )}
    </div>
  );
}
