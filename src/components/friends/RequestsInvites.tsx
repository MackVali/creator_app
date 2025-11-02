"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import type {
  FriendRequest,
  SentInvite,
  SuggestedFriend,
} from "@/types/friends";

const actionButtonClass =
  "rounded-xl px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40";

const mutedButtonClass =
  "rounded-xl px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-40";

type RequestsInvitesProps = {
  requests: FriendRequest[];
  invites: SentInvite[];
  suggestions: SuggestedFriend[];
};

type RequestStatus = "pending" | "accepted" | "declined";
type SuggestionStatus = "idle" | "requested";

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
}: RequestsInvitesProps) {
  const [requestState, setRequestState] = useState<RequestState[]>(() =>
    requests.map((req) => ({ ...req, status: "pending" }))
  );
  const [inviteState, setInviteState] = useState<SentInvite[]>(invites);
  const [suggestionState, setSuggestionState] = useState<SuggestionState[]>(() =>
    suggestions.map((suggestion) => ({ ...suggestion, status: "idle" }))
  );
  const [pendingInviteId, setPendingInviteId] = useState<string | null>(null);

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

  const respondedRequests = useMemo(
    () => requestState.filter((req) => req.status !== "pending"),
    [requestState]
  );

  const handleRespond = (id: string, status: RequestStatus) => {
    setRequestState((prev) =>
      prev.map((req) => (req.id === id ? { ...req, status } : req))
    );
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

  const handleSendInvite = (id: string) => {
    setSuggestionState((prev) =>
      prev.map((suggestion) =>
        suggestion.id === id
          ? { ...suggestion, status: "requested" }
          : suggestion
      )
    );
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <header className="flex items-baseline justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
              Incoming requests
            </h2>
            <p className="text-xs text-white/50">
              Confirm the people who want to follow your creative journey.
            </p>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/70">
            {pendingRequests.length} waiting
          </span>
        </header>

        <div className="space-y-2">
          {pendingRequests.length ? (
            pendingRequests.map((req) => (
              <article
                key={req.id}
                className="flex items-start gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10"
              >
                <Image
                  src={req.avatarUrl}
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
                      className={`${actionButtonClass} bg-white text-slate-900 hover:bg-white/90 active:scale-[0.98]`}
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
            ))
          ) : (
            <div className="rounded-2xl bg-white/5 p-6 text-center text-sm text-white/60 ring-1 ring-white/10">
              You’re caught up for now.
            </div>
          )}
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
                ? "text-emerald-300"
                : invite.status === "pending"
                ? "text-amber-200"
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
              People you may know
            </h2>
            <p className="text-xs text-white/50">
              Suggestions are based on mutual collaborators and recent activity.
            </p>
          </div>
        </header>
        <div className="space-y-2">
          {suggestionState.map((suggestion) => (
            <article
              key={suggestion.id}
              className="flex items-start gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10"
            >
              <Image
                src={suggestion.avatarUrl}
                alt={`${suggestion.displayName} avatar`}
                width={48}
                height={48}
                className="h-12 w-12 rounded-full object-cover"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {suggestion.displayName}
                    </p>
                    <p className="truncate text-xs text-white/60">
                      @{suggestion.username}
                    </p>
                    <p className="mt-1 text-xs text-white/50">
                      {suggestion.mutualFriends} mutual friends · {suggestion.reason}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {suggestion.status === "requested" ? (
                    <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-200">
                      Invite sent
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSendInvite(suggestion.id)}
                      className={`${actionButtonClass} bg-white text-slate-900 hover:bg-white/90 active:scale-[0.98]`}
                    >
                      Send invite
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
