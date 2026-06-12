"use client";

import Image from "next/image";
import { BookUser, User, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type {
  FriendRequest,
  SentInvite,
  SuggestedFriend,
  ContactImportStatus,
} from "@/types/friends";
import { DEFAULT_AVATAR_URL } from "@/lib/friends/avatar";

const actionButtonClass =
  "rounded-xl px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40";

const mutedButtonClass =
  "rounded-xl px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-40";

const followButtonClass =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-transparent bg-white/[0.14] px-3 text-[12px] font-semibold text-white/85 transition hover:border-white/10 hover:bg-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-55 active:scale-[0.97]";

type RequestsInvitesProps = {
  requests: FriendRequest[];
  invites: SentInvite[];
  suggestions: SuggestedFriend[];
  contactImport: ContactImportStatus | null;
  circleInvites: CircleInvite[];
  isLoadingCircleInvites: boolean;
  circleInvitesError: string | null;
  respondingCircleInviteId: string | null;
  handleCircleInviteResponse: (
    inviteId: string,
    action: "accept" | "decline"
  ) => void | Promise<void>;
  onRequestResolved?: () => void | Promise<void>;
};

type RequestStatus = "pending" | "accepted" | "declined";
type SuggestionStatus = "idle" | "sending" | "following";

type CircleInvite = {
  id: string;
  role: string;
  circle: {
    name: string;
    circle_type: string;
  } | null;
  invitedByProfile: {
    username: string | null;
    name: string | null;
  } | null;
};

type RequestState = FriendRequest & {
  status: RequestStatus;
};

type SuggestionState = SuggestedFriend & {
  status: SuggestionStatus;
};

export default function RequestsInvites({
  requests,
  invites,
  suggestions,
  circleInvites,
  isLoadingCircleInvites,
  circleInvitesError,
  respondingCircleInviteId,
  handleCircleInviteResponse,
  onRequestResolved,
}: RequestsInvitesProps) {
  const [requestState, setRequestState] = useState<RequestState[]>(() =>
    requests.map((req) => ({ ...req, status: "pending" }))
  );
  const [inviteState, setInviteState] = useState<SentInvite[]>(invites);
  const [suggestionState, setSuggestionState] = useState<SuggestionState[]>(() =>
    suggestions.map((suggestion) => ({ ...suggestion, status: "idle" }))
  );
  const [pendingInviteId, setPendingInviteId] = useState<string | null>(null);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);

  useEffect(() => {
    setRequestState(requests.map((req) => ({ ...req, status: "pending" })));
  }, [requests]);

  useEffect(() => {
    setInviteState(invites);
  }, [invites]);

  useEffect(() => {
    setSuggestionState(
      suggestions.map((suggestion) => ({ ...suggestion, status: "idle" }))
    );
  }, [suggestions]);

  const pendingRequests = useMemo(
    () => requestState.filter((req) => req.status === "pending"),
    [requestState]
  );

  const incomingCount = pendingRequests.length + circleInvites.length;

  const respondedRequests = useMemo(
    () => requestState.filter((req) => req.status !== "pending"),
    [requestState]
  );

  const handleRespond = async (id: string, status: RequestStatus) => {
    try {
      const response = await fetch("/api/friends/requests/respond", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, status }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to respond to request.");
      }

      setRequestState((prev) =>
        prev.map((req) => (req.id === id ? { ...req, status } : req))
      );
      await onRequestResolved?.();
    } catch (error) {
      console.error("Failed to respond to request", error);
    }
  };

  const handleCancelInvite = async (id: string) => {
    setPendingInviteId(id);

    try {
      const response = await fetch(`/api/friends/invites/${id}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Unable to cancel invite.");
      }

      const payload = (await response.json()) as { invite: SentInvite };
      setInviteState((prev) =>
        prev.map((invite) => (invite.id === id ? payload.invite : invite))
      );
    } catch (error) {
      console.error("Failed to cancel invite", error);
    } finally {
      setPendingInviteId(null);
    }
  };

  const handleResendInvite = async (id: string) => {
    setPendingInviteId(id);

    try {
      const response = await fetch(`/api/friends/invites/${id}/resend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Unable to resend invite.");
      }

      const payload = (await response.json()) as { invite: SentInvite };
      setInviteState((prev) =>
        prev.map((invite) => (invite.id === id ? payload.invite : invite))
      );
    } catch (error) {
      console.error("Failed to resend invite", error);
    } finally {
      setPendingInviteId(null);
    }
  };

  const handleSendInvite = async (suggestion: SuggestionState) => {
    if (suggestion.status !== "idle") {
      return;
    }

    setSuggestionError(null);
    setSuggestionState((prev) =>
      prev.map((item) =>
        item.id === suggestion.id ? { ...item, status: "sending" } : item
      )
    );

    try {
      const response = await fetch("/api/friends", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: suggestion.username }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to follow right now.");
      }

      setSuggestionState((prev) =>
        prev.map((item) =>
          item.id === suggestion.id ? { ...item, status: "following" } : item
        )
      );
      await onRequestResolved?.();
    } catch (error) {
      console.error("Failed to follow suggested profile", error);
      setSuggestionState((prev) =>
        prev.map((item) =>
          item.id === suggestion.id ? { ...item, status: "idle" } : item
        )
      );
      setSuggestionError(
        error instanceof Error ? error.message : "Unable to follow right now."
      );
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <header className="flex items-baseline justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
              Incoming requests
            </h2>
            <p className="mt-1 text-xs text-white/45">
              Review new people and Circle invites.
            </p>
          </div>
          {incomingCount > 0 ? (
            <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/70">
              {incomingCount} waiting
            </span>
          ) : null}
        </header>

        <div className="space-y-2">
          {pendingRequests.map((req) => (
            <article
              key={req.id}
              className="flex min-h-[56px] items-center gap-3 rounded-none border border-black/80 bg-black/70 px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.38)] transition hover:border-white/10 hover:bg-[#050506]/85"
            >
              <Image
                src={req.avatarUrl || DEFAULT_AVATAR_URL}
                alt={`${req.displayName} avatar`}
                width={52}
                height={52}
                className="h-[52px] w-[52px] rounded-full object-cover"
              />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {req.displayName}
                    </p>
                    <p className="truncate text-xs text-white/60">@{req.username}</p>
                    <p className="mt-1 text-xs text-white/50">
                      {req.mutualFriends} mutual friends
                    </p>
                  </div>
                </div>
                {req.note ? (
                  <p className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white/70">
                    “{req.note}”
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleRespond(req.id, "accepted")}
                    className={`${actionButtonClass} bg-white text-black/80 hover:bg-white/90 active:scale-[0.98]`}
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRespond(req.id, "declined")}
                    className={`${mutedButtonClass} active:scale-[0.98]`}
                  >
                    Not now
                  </button>
                </div>
              </div>
              </article>
            ))}

          {circleInvites.map((invite) => {
            const inviterName = invite.invitedByProfile?.name?.trim();
            const inviterUsername = invite.invitedByProfile?.username?.trim();
            const invitedByLabel =
              inviterName ||
              (inviterUsername ? `@${inviterUsername}` : "Unknown sender");
            const isResponding = respondingCircleInviteId === invite.id;

            return (
              <article
                key={invite.id}
                className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-white">
                        {invite.circle?.name ?? "Circle invite"}
                      </h3>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/55">
                        {invite.circle?.circle_type ?? "CIRCLE"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-white/55">
                      Role <span className="font-semibold text-white/75">{invite.role}</span>
                      <span className="text-white/25"> · </span>
                      Invited by{" "}
                      <span className="font-semibold text-white/75">
                        {invitedByLabel}
                      </span>
                      {inviterName && inviterUsername ? (
                        <span className="ml-1 text-white/45">@{inviterUsername}</span>
                      ) : null}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={isResponding}
                      onClick={() =>
                        void handleCircleInviteResponse(invite.id, "accept")
                      }
                      className={`${actionButtonClass} bg-white text-black/80 hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-55 active:scale-[0.98]`}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      disabled={isResponding}
                      onClick={() =>
                        void handleCircleInviteResponse(invite.id, "decline")
                      }
                      className={`${mutedButtonClass} active:scale-[0.98]`}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              </article>
            );
          })}

          {isLoadingCircleInvites ? (
            <p className="px-1 text-xs text-white/50">Loading Circle invites…</p>
          ) : null}

          {circleInvitesError ? (
            <div className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200 ring-1 ring-rose-400/20">
              {circleInvitesError}
            </div>
          ) : null}
        </div>

        {respondedRequests.length ? (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-white/40">
              Recent actions
            </h3>
            {respondedRequests.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-xs text-white/60 ring-1 ring-white/10"
              >
                <span className="truncate">
                  {req.displayName} • {req.status === "accepted" ? "Added" : "Dismissed"}
                </span>
                <button
                  type="button"
                  onClick={() => handleRespond(req.id, "pending")}
                  className="text-[11px] font-semibold uppercase tracking-wide text-white/70 transition hover:text-white"
                >
                  Undo
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <header className="flex items-baseline justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
              Sent invites
            </h2>
            <p className="text-xs text-white/50">
              Track who you’ve invited and follow up when they respond.
            </p>
          </div>
        </header>
        <div className="space-y-2">
          {inviteState.map((invite) => {
            const displayStatus = invite.status;
            const statusTone =
              invite.status === "cancelled"
                ? "text-rose-300"
                : invite.status === "accepted"
                ? "text-white/80"
                : invite.status === "pending"
                ? "text-white/60"
                : "text-white/50";
            const disableFollowUps =
              invite.status === "accepted" || invite.status === "cancelled";
            const isProcessing = pendingInviteId === invite.id;
            const relativeSentAgo = invite.lastSentAgo ?? invite.sentAgo;

            return (
            <div
              key={invite.id}
              className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-3 py-2 text-sm text-white/70 ring-1 ring-white/10"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-white">{invite.email}</p>
                <p className="text-xs text-white/50">
                  {relativeSentAgo} ·{' '}
                  <span className={`font-semibold uppercase tracking-wide ${statusTone}`}>
                    {displayStatus}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleResendInvite(invite.id)}
                  className={`${mutedButtonClass} active:scale-[0.98]`}
                  disabled={disableFollowUps || isProcessing}
                >
                  {isProcessing && !disableFollowUps ? "Sending…" : "Resend"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCancelInvite(invite.id)}
                  className={`${mutedButtonClass} text-rose-300 hover:text-rose-200 active:scale-[0.98]`}
                  disabled={invite.status === "cancelled" || isProcessing}
                >
                  Cancel
                </button>
              </div>
            </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <header className="flex items-baseline justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
              Suggested
            </h2>
            <p className="text-xs text-white/50">
              Suggestions are based on mutual collaborators and recent activity.
            </p>
          </div>
        </header>
        <div className="space-y-2">
          {suggestionError ? (
            <p className="px-1 text-xs text-rose-300">{suggestionError}</p>
          ) : null}
          {suggestionState.map((suggestion) => {
            const followLabel =
              suggestion.status === "sending"
                ? "Following…"
                : suggestion.status === "following"
                  ? "Following"
                  : "Follow";

            return (
              <article
                key={suggestion.id}
                className="flex min-h-[56px] items-center gap-3 rounded-none border border-black/80 bg-black/70 px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.38)] transition hover:border-white/10 hover:bg-[#050506]/85"
              >
                {suggestion.avatarUrl && suggestion.avatarUrl !== DEFAULT_AVATAR_URL ? (
                  <Image
                    src={suggestion.avatarUrl}
                    alt={`${suggestion.displayName} avatar`}
                    width={48}
                    height={48}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white/34 ring-1 ring-white/8">
                    <User className="h-6 w-6" aria-hidden="true" />
                    <span className="sr-only">{suggestion.displayName} avatar</span>
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-[13px] font-semibold text-white">
                      {suggestion.displayName}
                    </p>
                    <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/50">
                      {suggestion.mutualFriends} mutual
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-white/65">
                    @{suggestion.username}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSendInvite(suggestion)}
                  disabled={suggestion.status !== "idle"}
                  className={followButtonClass}
                  aria-label={`${followLabel} ${suggestion.username}`}
                >
                  {followLabel}
                </button>
              </article>
            );
          })}
        </div>

        <div className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-black/70 px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.28)]">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-white/75 ring-1 ring-white/10">
            <BookUser className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-white">
              Connect contacts
            </h3>
            <p className="truncate text-xs text-white/50">
              Find people you know
            </p>
          </div>
          <button
            type="button"
            onClick={() => {}}
            className="shrink-0 rounded-xl bg-zinc-700 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 active:scale-[0.98]"
          >
            Connect
          </button>
          <button
            type="button"
            onClick={() => {}}
            aria-label="Dismiss connect contacts"
            className="flex h-8 w-8 shrink-0 items-center justify-center text-white/45 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </section>
    </div>
  );
}
