"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type ThreadMessage = {
  id: string;
  body: string;
  senderId: string;
  recipientId: string;
  createdAt: string;
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
    if (!endRef.current) return;
    endRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const handleSend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;
    const trimmed = composerValue.trim();
    if (!trimmed) return;
    if (!participant?.username || !participant?.userId || !currentUserId) {
      setSendError("Unable to send a message right now.");
      return;
    }

    try {
      setSending(true);
      setSendError(null);

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
        message?: { id: string; createdAt: string };
      };

      const createdAt = data.message?.createdAt ?? new Date().toISOString();
      const id = data.message?.id ?? `${Date.now()}`;

      setMessages((prev) => [
        ...prev,
        {
          id,
          body: trimmed,
          senderId: currentUserId,
          recipientId: participant.userId,
          createdAt,
        },
      ]);
      setComposerValue("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to send message.";
      setSendError(message);
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
                className={`${bubbleShape} px-4 py-2.5 text-[0.92rem] leading-relaxed shadow-[0_18px_40px_rgba(0,0,0,0.35)] ${
                  isSender
                    ? "bg-white text-black"
                    : "border border-white/10 bg-white/[0.06] text-white"
                }`}
              >
                <p className="whitespace-pre-line">{message.body}</p>
              </div>
              {showTimestamp ? (
                <p
                  className={`px-1 text-[0.65rem] tracking-wide ${
                    isSender
                      ? "text-right text-white/40"
                      : "text-left text-white/35"
                  }`}
                >
                  {timeLabel}
                </p>
              ) : null}
            </div>
          </div>
        );
      }),
    [messages, currentUserId]
  );

  return (
    <div className="min-h-screen bg-[#07070b] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 pb-28 pt-3 sm:px-6">
        <header className="sticky top-0 z-20 -mx-4 mb-2 border-b border-white/10 bg-[#07070b]/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex items-center gap-2">
            <Link
              href="/inbox"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-white/70 transition hover:border-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            >
              <span className="text-[0.75rem]">←</span>
              Back
            </Link>
            {participant ? (
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-8 w-8 border border-white/10 bg-white/5">
                  {participant.avatarUrl ? (
                    <AvatarImage
                      src={participant.avatarUrl}
                      alt={`${participant.displayName} avatar`}
                    />
                  ) : null}
                  <AvatarFallback className="bg-white/10 text-[0.6rem] font-semibold text-white/80">
                    {getInitials(participant.displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {threadTitle}
                  </p>
                  {threadSubtitle ? (
                    <p className="truncate text-[0.7rem] text-white/50">
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

        <section className="flex-1 overflow-hidden rounded-[26px] border border-white/10 bg-gradient-to-br from-white/[0.04] via-transparent to-black/50 shadow-[0_24px_70px_rgba(0,0,0,0.7)]">
          <div className="flex h-full flex-col gap-4 px-4 py-5 sm:px-6">
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
                        } rounded-3xl border border-white/5 bg-white/[0.04]`}
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
              <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-[22px] border border-white/5 bg-white/[0.03] py-10 text-center text-white/70">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-white/60">
                  DM
                </div>
                <p className="text-sm font-semibold text-white">
                  No messages yet
                </p>
                <p className="text-xs text-white/55">
                  Say hello to start this conversation.
                </p>
              </div>
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
          className="sticky bottom-3 mt-3 flex flex-col gap-2 rounded-[18px] border border-white/10 bg-[#0a0a10]/95 p-2.5 shadow-[0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur"
        >
          {sendError ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
              {sendError}
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <textarea
              value={composerValue}
              onChange={(event) => setComposerValue(event.target.value)}
              placeholder="Write a message..."
              rows={1}
              className="min-h-[42px] flex-1 resize-none rounded-2xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
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
