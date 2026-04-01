"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import MessageFriendButton from "@/components/friends/MessageFriendButton";
import { DEFAULT_AVATAR_URL } from "@/lib/friends/avatar";
import type { Friend } from "@/types/friends";

type RelationshipStatus =
  | "self"
  | "friends"
  | "incoming_request"
  | "outgoing_request"
  | "none";

interface PageParams {
  params: { username: string };
}

function ringClass(enabled: boolean) {
  return enabled
    ? "bg-gradient-to-tr from-fuchsia-500 via-pink-500 to-orange-400"
    : "bg-white/10";
}

export default function FriendProfilePage({ params }: PageParams) {
  const username = useMemo(() => {
    try {
      return decodeURIComponent(params.username).trim().toLowerCase();
    } catch {
      return params.username.trim().toLowerCase();
    }
  }, [params.username]);

  const [friend, setFriend] = useState<Friend | null>(null);
  const [relationship, setRelationship] = useState<RelationshipStatus>("none");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [friendsResponse, relationshipResponse] = await Promise.all([
        fetch("/api/friends", { cache: "no-store" }),
        fetch(`/api/friends/relationship/${encodeURIComponent(username)}`, {
          cache: "no-store",
        }),
      ]);

      if (!relationshipResponse.ok) {
        const payload = (await relationshipResponse.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Unable to load relationship status.");
      }

      const relationshipPayload = (await relationshipResponse.json()) as {
        relationship: RelationshipStatus;
      };
      setRelationship(relationshipPayload.relationship ?? "none");

      if (!friendsResponse.ok) {
        const payload = (await friendsResponse.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Unable to load friends.");
      }

      const friendsPayload = (await friendsResponse.json()) as { friends: Friend[] };
      const matchedFriend =
        friendsPayload.friends.find((candidate) => candidate.username.toLowerCase() === username) ??
        null;
      setFriend(matchedFriend);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Unable to load this profile.";
      setError(message);
      setFriend(null);
    } finally {
      setIsLoading(false);
    }
  }, [username]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const displayName = friend?.displayName || username;
  const avatarSrc = friend?.avatarUrl || DEFAULT_AVATAR_URL;
  const statusText = friend?.isOnline ? "Online now" : "Offline";
  const statusTone = friend?.isOnline ? "text-emerald-300" : "text-white/60";

  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 pb-10 pt-6">
        <div className="animate-pulse space-y-5 rounded-3xl border border-white/10 bg-slate-950/60 p-6">
          <div className="h-5 w-32 rounded bg-white/10" />
          <div className="flex items-center gap-5">
            <div className="h-28 w-28 rounded-full bg-white/10" />
            <div className="flex-1 space-y-3">
              <div className="h-7 w-44 rounded bg-white/10" />
              <div className="h-4 w-28 rounded bg-white/10" />
              <div className="h-9 w-36 rounded-xl bg-white/10" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 pb-10 pt-6">
        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-5 text-sm text-rose-200">
          {error}
        </div>
      </main>
    );
  }

  const canMessage = relationship === "friends" && Boolean(friend?.userId);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-4 pb-10 pt-6">
      <section className="rounded-3xl border border-white/10 bg-gradient-to-b from-black/90 via-neutral-950/80 to-neutral-900/60 p-6 shadow-2xl shadow-black/40">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
          <div className="relative mx-auto sm:mx-0">
            <div className={`rounded-full p-1 ${ringClass(Boolean(friend?.hasRing))}`}>
              <div className="rounded-full bg-slate-950 p-1.5">
                <Image
                  src={avatarSrc}
                  alt={`${displayName} avatar`}
                  width={144}
                  height={144}
                  className="h-36 w-36 rounded-full object-cover"
                />
              </div>
            </div>
            <span className="absolute bottom-2 right-2 inline-flex h-4 w-4 rounded-full ring-4 ring-slate-950">
              <span
                className={`h-full w-full rounded-full ${friend?.isOnline ? "bg-emerald-400" : "bg-white/40"}`}
              />
            </span>
          </div>

          <div className="min-w-0 flex-1 space-y-3 text-center sm:text-left">
            <p className="text-xs uppercase tracking-[0.35em] text-white/50">Friend profile</p>
            <h1 className="truncate text-3xl font-semibold text-white">{displayName}</h1>
            <p className="text-sm text-white/70">@{username}</p>
            <p className={`text-xs font-semibold uppercase tracking-[0.3em] ${statusTone}`}>{statusText}</p>

            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              {canMessage && friend ? (
                <MessageFriendButton
                  friend={friend}
                  className="rounded-xl border border-white/20 bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-white/90"
                >
                  Message
                </MessageFriendButton>
              ) : null}
              <Link
                href={`/profile/${encodeURIComponent(username)}`}
                className="rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Open full profile
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[11px] uppercase tracking-[0.25em] text-white/50">Relationship</p>
          <p className="mt-2 text-lg font-semibold capitalize text-white">{relationship.replace("_", " ")}</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[11px] uppercase tracking-[0.25em] text-white/50">Connection</p>
          <p className="mt-2 text-lg font-semibold text-white">{friend?.hasRing ? "Close friends" : "Friend"}</p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[11px] uppercase tracking-[0.25em] text-white/50">Profile</p>
          <p className="mt-2 text-lg font-semibold text-white">Instagram-style card</p>
        </article>
      </section>
    </main>
  );
}
