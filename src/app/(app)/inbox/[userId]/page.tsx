"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type ThreadMessage = {
  id: string;
  body: string;
  senderId: string;
  recipientId: string;
  createdAt: string;
  readAt?: string | null;
  isPending?: boolean;
};

type ThreadParticipant = {
  userId: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
};

type ThreadResponse = {
  currentUserId: string;
  participant: ThreadParticipant;
  messages: ThreadMessage[];
};

const INBOX_REFRESH_REQUEST_KEY = "premium-app:inbox-refresh-requested";

function formatRelativeTime(value: string | null | undefined) {
  if (!value) return "";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "";

  const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);
  if (!Number.isFinite(diffSeconds)) return "";

  if (Math.abs(diffSeconds) < 5) return "just now";

  const elapsed = Math.abs(diffSeconds);
  const ranges: Array<[number, number, string]> = [
    [60, 1, "s"],
    [3600, 60, "m"],
    [86400, 3600, "h"],
    [604800, 86400, "d"],
    [2629800, 604800, "w"],
    [31557600, 2629800, "mo"],
    [Number.POSITIVE_INFINITY, 31557600, "y"],
  ];

  for (const [limit, divisor, suffix] of ranges) {
    if (elapsed < limit) {
      const magnitude = Math.max(1, Math.floor(elapsed / divisor));
      return `${magnitude}${suffix}`;
    }
  }

  return "";
}

function getInitials(label: string) {
  const parts = label.trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export default function InboxThreadPage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const participantId = params?.userId;

  const [participant, setParticipant] = useState<ThreadParticipant | null>(
    null
  );
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composerValue, setComposerValue] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const composerEditVersionRef = useRef(0);

  const loadThread = useCallback(async () => {
    if (!participantId) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/inbox/threads/${participantId}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "Unable to load conversation.");
      }

      const data = (await response.json()) as ThreadResponse;
      setParticipant(data.participant);
      setMessages(data.messages ?? []);
      setCurrentUserId(data.currentUserId ?? null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to load conversation.";
      setError(message);
      setParticipant(null);
      setMessages([]);
      setCurrentUserId(null);
    } finally {
      setLoading(false);
    }
  }, [participantId]);

  useEffect(() => {
    void loadThread();
  }, [loadThread]);

  useEffect(() => {
    router.prefetch("/inbox");
  }, [router]);

  useEffect(() => {
    if (!endRef.current) return;
    endRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const handleBackToInbox = useCallback(() => {
    try {
      sessionStorage.setItem(INBOX_REFRESH_REQUEST_KEY, "1");
    } catch {
      // Navigation should still proceed if session storage is unavailable.
    }

    const historyState = window.history.state as { idx?: number } | null;

    if (typeof historyState?.idx === "number" && historyState.idx > 0) {
      router.back();
      return;
    }

    router.push("/inbox");
  }, [router]);

  const handleSend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;
    const submittedComposerValue = composerValue;
    const composerEditVersionAtSubmit = composerEditVersionRef.current;
    const trimmed = composerValue.trim();
    if (!trimmed) return;
    if (!participant?.username || !participant?.userId || !currentUserId) {
      setSendError("Unable to send a message right now.");
      return;
    }

    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticCreatedAt = new Date().toISOString();
    const optimisticMessage: ThreadMessage = {
      id: optimisticId,
      body: trimmed,
      senderId: currentUserId,
      recipientId: participant.userId,
      createdAt: optimisticCreatedAt,
      readAt: null,
      isPending: true,
    };

    try {
      setSending(true);
      setSendError(null);
      setComposerValue("");
      setMessages((prev) => [...prev, optimisticMessage]);

      const response = await fetch(
        `/api/friends/${encodeURIComponent(participant.username)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: trimmed,
            senderId: currentUserId,
            recipientId: participant.userId,
          }),
        }
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "Unable to send message.");
      }

      const data = (await response.json()) as {
        message?: { id: string; createdAt: string; readAt?: string | null };
      };

      const createdAt = data.message?.createdAt ?? new Date().toISOString();
      const id = data.message?.id ?? `${Date.now()}`;
      const readAt = data.message?.readAt ?? null;

      setMessages((prev) =>
        prev.map((message) =>
          message.id === optimisticId
            ? {
                ...message,
                id,
                createdAt,
                readAt,
                isPending: false,
              }
            : message
        )
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to send message.";
      setSendError(message);
      setMessages((prev) =>
        prev.filter((message) => message.id !== optimisticId)
      );
      if (composerEditVersionRef.current === composerEditVersionAtSubmit) {
        setComposerValue(submittedComposerValue);
      }
    } finally {
      setSending(false);
    }
  };

  const threadTitle = participant?.displayName ?? "Conversation";
  const threadSubtitle = participant?.username
    ? `@${participant.username}`
    : null;

  const messageItems = useMemo(
    () =>
      messages.map((message, index) => {
        const isSender = message.senderId === currentUserId;
        const prevMessage = messages[index - 1];
        const nextMessage = messages[index + 1];
        const isSameAsPrev = prevMessage?.senderId === message.senderId;
        const isSameAsNext = nextMessage?.senderId === message.senderId;
        const timeLabel = formatRelativeTime(message.createdAt);
        const showTimestamp = Boolean(timeLabel) && !isSameAsNext;
        const statusLabel = isSender
          ? message.isPending
            ? "Sending…"
            : message.readAt
              ? "Read"
              : "Sent"
          : null;
        const metaLabel = [statusLabel, showTimestamp ? timeLabel : null]
          .filter(Boolean)
          .join(" · ");
        const showMeta = Boolean(metaLabel) && !isSameAsNext;

        const spacingClass =
          index === 0 ? "mt-0" : isSameAsPrev ? "mt-1" : "mt-3";

        const bubbleShape = isSender
          ? [
              "rounded-3xl",
              isSameAsPrev ? "rounded-tr-xl" : "rounded-tr-3xl",
              isSameAsNext ? "rounded-br-xl" : "rounded-br-lg",
            ].join(" ")
          : [
              "rounded-3xl",
              isSameAsPrev ? "rounded-tl-xl" : "rounded-tl-3xl",
              isSameAsNext ? "rounded-bl-xl" : "rounded-bl-lg",
            ].join(" ");

        return (
          <div
            key={message.id}
            className={`flex ${spacingClass} ${
              isSender ? "justify-end" : "justify-start"
            }`}
          >
            <div className="flex max-w-[82%] flex-col gap-1">
              <div
                className={`${bubbleShape} px-4 py-2.5 text-[0.92rem] leading-relaxed ${
                  isSender
                    ? "bg-[#343438] text-white"
                    : "bg-[#242428] text-white/95"
                }`}
              >
                <p className="whitespace-pre-line">{message.body}</p>
              </div>
              {showMeta ? (
                <p
                  className={`px-1 text-[0.65rem] tracking-wide ${
                    isSender
                      ? "text-right text-white/40"
                      : "text-left text-white/35"
                  }`}
                >
                  {metaLabel}
                </p>
              ) : null}
            </div>
          </div>
        );
      }),
    [messages, currentUserId]
  );

  return (
    <div className="h-[100dvh] min-h-screen overflow-hidden bg-black text-white">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col px-4 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] sm:px-6">
        <header className="sticky top-0 z-20 -mx-4 mb-1 shrink-0 border-b border-white/5 bg-black/95 px-4 py-1.5 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex min-h-11 items-center gap-2">
            <button
              type="button"
              aria-label="Back to inbox"
              onClick={handleBackToInbox}
              className="-ml-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-2xl leading-none text-white/55 transition hover:bg-white/5 hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            >
              <svg
                aria-hidden="true"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="none"
              >
                <path
                  d="M12.5 4.5 7 10l5.5 5.5"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
            </button>
            {participant ? (
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar className="h-8 w-8 bg-white/10">
                  {participant.avatarUrl ? (
                    <AvatarImage
                      src={participant.avatarUrl}
                      alt={`${participant.displayName} avatar`}
                    />
                  ) : null}
                  <AvatarFallback className="bg-white/10 text-[0.6rem] font-semibold text-white/75">
                    {getInitials(participant.displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {threadTitle}
                  </p>
                  {threadSubtitle ? (
                    <p className="truncate text-[0.7rem] text-white/45">
                      {threadSubtitle}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-sm font-semibold text-white">{threadTitle}</p>
            )}
          </div>
        </header>

        <section className="min-h-0 flex-1 overflow-hidden bg-black">
          <div className="flex h-full min-h-0 flex-col gap-4 px-1 py-4 sm:px-2">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, index) => {
                  const isSender = index % 2 === 0;
                  return (
                    <div
                      key={`skeleton-${index}`}
                      className={`flex ${isSender ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`h-9 ${
                          isSender ? "w-[55%]" : "w-[62%]"
                        } rounded-3xl bg-white/[0.07]`}
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}

            {!loading && !error && messages.length === 0 ? (
              <p className="mt-auto px-6 pb-1 text-center text-sm text-white/35">
                Say hello to start this conversation.
              </p>
            ) : null}

            {!loading && !error && messages.length > 0 ? (
              <div className="flex flex-1 flex-col overflow-y-auto pr-1">
                {messageItems}
                <div ref={endRef} />
              </div>
            ) : null}
          </div>
        </section>

        <form
          onSubmit={handleSend}
          className="-mx-4 mt-2 flex shrink-0 flex-col gap-2 border-t border-white/10 bg-black/95 px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur sm:-mx-6 sm:px-6"
        >
          {sendError ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
              {sendError}
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <textarea
              value={composerValue}
              onChange={(event) => {
                composerEditVersionRef.current += 1;
                setComposerValue(event.target.value);
              }}
              placeholder="Write a message..."
              rows={1}
              className="min-h-[42px] flex-1 resize-none rounded-2xl border border-white/10 bg-[#1c1c1e] px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
            />
            <button
              type="submit"
              disabled={
                sending ||
                !composerValue.trim() ||
                !participant?.username ||
                !currentUserId
              }
              className="h-10 rounded-2xl bg-white px-4 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/40"
            >
              {sending ? "Sending" : "Send"}
            </button>
          </div>
          {!participant?.username ? (
            <p className="text-[0.65rem] text-white/40">
              Replying is unavailable until this profile is resolved.
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
