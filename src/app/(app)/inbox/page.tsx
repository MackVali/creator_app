"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type InboxThread = {
  participant: {
    userId: string;
    username: string | null;
    displayName: string;
    avatarUrl: string | null;
  };
  latestMessage: {
    id: string;
    body: string;
    senderId: string;
    recipientId: string;
    createdAt: string;
  };
};

type InboxResponse = {
  threads: InboxThread[];
  currentUserId: string;
};

function formatRelativeTime(value: string | null | undefined) {
  if (!value) return "—";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "—";

  const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);
  if (!Number.isFinite(diffSeconds)) return "—";

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

  return "—";
}

function getInitials(label: string) {
  const parts = label.trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export default function InboxPage() {
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"primary" | "requests">("primary");
  const [requestsMeta] = useState({ count: 0, isLoading: false });
  const primaryTabRef = useRef<HTMLButtonElement>(null);
  const requestsTabRef = useRef<HTMLButtonElement>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const loadThreads = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch("/api/inbox/threads", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(data?.error ?? "Unable to load inbox.");
        }

        const data = (await response.json()) as InboxResponse;
        if (!isMountedRef.current) return;

        setThreads(data.threads ?? []);
        setCurrentUserId(data.currentUserId ?? null);
      } catch (err) {
        if (!isMountedRef.current) return;
        const message =
          err instanceof Error ? err.message : "Unable to load inbox.";
        setError(message);
        setThreads([]);
        setCurrentUserId(null);
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    void loadThreads();
  }, []);

  const emptyState = !loading && threads.length === 0;
  const hasRequests = requestsMeta.count > 0;

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const order: Array<"primary" | "requests"> = ["primary", "requests"];
    const currentIndex = order.indexOf(tab);
    const direction =
      event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (currentIndex + direction + order.length) % order.length;
    const nextTab = order[nextIndex];

    setTab(nextTab);
    const targetRef = nextTab === "primary" ? primaryTabRef : requestsTabRef;
    targetRef.current?.focus();
  };

  const threadRows = useMemo(
    () =>
      threads.map((thread) => {
        const relative = formatRelativeTime(thread.latestMessage.createdAt);
        const displayName = thread.participant.displayName;
        const username = thread.participant.username
          ? `@${thread.participant.username}`
          : null;
        const isSender = thread.latestMessage.senderId === currentUserId;
        const preview = thread.latestMessage.body.trim();
        const previewLabel = preview
          ? `${isSender ? "You: " : ""}${preview}`
          : "Message";

        return (
          <Link
            key={thread.participant.userId}
            href={`/inbox/${thread.participant.userId}`}
            className="group flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.04] px-3 py-2.5 text-left transition hover:border-white/10 hover:bg-white/[0.08] active:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
          >
            <Avatar className="h-11 w-11 border border-white/10 bg-white/5">
              {thread.participant.avatarUrl ? (
                <AvatarImage
                  src={thread.participant.avatarUrl}
                  alt={`${displayName} avatar`}
                />
              ) : null}
              <AvatarFallback className="bg-white/10 text-[0.7rem] font-semibold text-white/80">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {displayName}
                  </p>
                  {username ? (
                    <p className="truncate text-[0.7rem] text-white/45">
                      {username}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 text-[0.65rem] font-medium tabular-nums text-white/45">
                  {relative}
                </span>
              </div>
              <p className="mt-1 line-clamp-1 text-[0.72rem] text-white/65">
                {previewLabel}
              </p>
            </div>
          </Link>
        );
      }),
    [threads, currentUserId]
  );

  return (
    <div className="min-h-screen bg-[#07070b] text-white">
      <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4 sm:px-6 sm:pt-6">
        <header className="mb-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.4em] text-white/40">
                Messages
              </p>
              <h1 className="text-[1.5rem] font-semibold text-white">Inbox</h1>
            </div>
            <button
              type="button"
              aria-label="Compose new message"
              className="group inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] shadow-[0_12px_28px_rgba(0,0,0,0.45)] transition hover:border-white/20 hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-5 w-5 text-white/85 transition group-hover:text-white"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12.5 6.5h6v6" />
                <path d="M12.5 6.5 6 13v5h5l6.5-6.5" />
              </svg>
            </button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="Filter inbox"
              className="inline-flex h-9 items-center justify-center rounded-full border border-white/10 bg-black/50 px-3 text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            >
              <svg
                viewBox="0 0 20 20"
                aria-hidden="true"
                className="mr-1.5 h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 5h14" />
                <path d="M6 10h8" />
                <path d="M8.5 15h3" />
              </svg>
              Filters
            </button>

            <div
              role="tablist"
              aria-label="Inbox sections"
              className="flex items-center gap-1 rounded-full border border-white/10 bg-black/40 p-1"
            >
              <button
                ref={primaryTabRef}
                id="primary-tab"
                role="tab"
                type="button"
                aria-selected={tab === "primary"}
                aria-controls="primary-panel"
                tabIndex={tab === "primary" ? 0 : -1}
                onClick={() => setTab("primary")}
                onKeyDown={handleTabKeyDown}
                className={`h-9 rounded-full px-4 text-[0.75rem] font-semibold transition ${
                  tab === "primary"
                    ? "bg-gradient-to-br from-black/90 via-neutral-900/80 to-neutral-800/60 text-white shadow-inner shadow-black/60"
                    : "text-white/60 hover:bg-white/10 hover:text-white"
                }`}
              >
                Primary
              </button>
              <button
                ref={requestsTabRef}
                id="requests-tab"
                role="tab"
                type="button"
                aria-selected={tab === "requests"}
                aria-controls="requests-panel"
                tabIndex={tab === "requests" ? 0 : -1}
                onClick={() => setTab("requests")}
                onKeyDown={handleTabKeyDown}
                className={`relative h-9 rounded-full px-4 text-[0.75rem] font-semibold transition ${
                  tab === "requests"
                    ? "bg-gradient-to-br from-black/90 via-neutral-900/80 to-neutral-800/60 text-white shadow-inner shadow-black/60"
                    : "text-white/60 hover:bg-white/10 hover:text-white"
                }`}
              >
                Requests
                {requestsMeta.isLoading ? (
                  <span className="ml-1 text-[0.65rem] text-white/50">…</span>
                ) : hasRequests ? (
                  <span className="ml-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-white text-[0.6rem] font-semibold text-black">
                    {requestsMeta.count}
                  </span>
                ) : null}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
            <div className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-white/40">
              Search
            </div>
            <div className="h-3.5 w-px bg-white/10" />
            <input
              type="search"
              placeholder="Find a conversation"
              className="w-full bg-transparent text-[0.8rem] text-white/80 placeholder:text-white/35 focus:outline-none"
              aria-label="Search inbox"
            />
          </div>
        </header>

        <section
          id="primary-panel"
          role="tabpanel"
          aria-labelledby="primary-tab"
          hidden={tab !== "primary"}
          className="space-y-3 rounded-[26px] border border-white/10 bg-gradient-to-br from-white/5 via-transparent to-black/40 p-3 shadow-[0_30px_80px_rgba(0,0,0,0.6)] backdrop-blur sm:p-4"
        >
          {loading ? (
            <div className="space-y-2 px-1 py-6">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={`skeleton-${index}`}
                  className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5"
                >
                  <div className="h-11 w-11 rounded-full border border-white/10 bg-white/5" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-2/5 rounded-full bg-white/10" />
                    <div className="h-2.5 w-3/5 rounded-full bg-white/5" />
                  </div>
                  <div className="h-2.5 w-8 rounded-full bg-white/5" />
                </div>
              ))}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          {!loading && !error && emptyState ? (
            <div className="flex flex-col items-center gap-3 rounded-[22px] border border-white/5 bg-white/[0.03] px-6 py-14 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-white/60">
                DM
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-white">
                  Your inbox is quiet
                </p>
                <p className="text-xs text-white/55">
                  Start a conversation from a friend profile to see it here.
                </p>
              </div>
            </div>
          ) : null}

          {!loading && !error && !emptyState ? (
            <div className="space-y-1.5">{threadRows}</div>
          ) : null}
        </section>

        <section
          id="requests-panel"
          role="tabpanel"
          aria-labelledby="requests-tab"
          hidden={tab !== "requests"}
          className="mt-2 rounded-[26px] border border-white/10 bg-white/[0.03] p-4 text-sm text-white/65 shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Message requests</p>
              <p className="mt-1 text-xs text-white/55">
                Requests will appear here once wired to the inbox API.
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-black/60 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-white/60">
              {requestsMeta.isLoading ? "Loading" : `${requestsMeta.count} total`}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
