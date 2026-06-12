"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
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
    readAt?: string | null;
  } | null;
  hasMessages?: boolean;
  previewLabel?: string;
};

type InboxResponse = {
  threads: InboxThread[];
  currentUserId: string;
};

type InboxSearchResponse = {
  results?: InboxThread[];
  currentUserId: string;
};

type InboxTab = "primary" | "requests" | "saved";

const INBOX_REFRESH_REQUEST_KEY = "premium-app:inbox-refresh-requested";

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
  const pathname = usePathname();
  const router = useRouter();
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [hasLoadedThreads, setHasLoadedThreads] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<InboxTab>("primary");
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<InboxThread[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [requestsMeta] = useState({ count: 0, isLoading: false });
  const primaryTabRef = useRef<HTMLButtonElement>(null);
  const requestsTabRef = useRef<HTMLButtonElement>(null);
  const savedTabRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchControlRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);
  const threadsRef = useRef<InboxThread[]>([]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  const loadThreads = useCallback(async () => {
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

      const nextThreads = data.threads ?? [];
      threadsRef.current = nextThreads;
      setThreads(nextThreads);
      setCurrentUserId(data.currentUserId ?? null);
      setHasLoadedThreads(true);
    } catch (err) {
      if (!isMountedRef.current) return;
      const message =
        err instanceof Error ? err.message : "Unable to load inbox.";
      setError(message);

      if (threadsRef.current.length === 0) {
        setThreads([]);
        setCurrentUserId(null);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const consumeRefreshRequest = useCallback(() => {
    try {
      if (sessionStorage.getItem(INBOX_REFRESH_REQUEST_KEY) !== "1") {
        return false;
      }

      sessionStorage.removeItem(INBOX_REFRESH_REQUEST_KEY);
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    consumeRefreshRequest();
    void loadThreads();
  }, [consumeRefreshRequest, loadThreads]);

  useEffect(() => {
    if (pathname !== "/inbox" || !consumeRefreshRequest()) return;

    void loadThreads();
  }, [consumeRefreshRequest, loadThreads, pathname]);

  useEffect(() => {
    if (searchExpanded) {
      searchInputRef.current?.focus();
    }
  }, [searchExpanded]);

  useEffect(() => {
    if (!searchExpanded) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (searchControlRef.current && !searchControlRef.current.contains(event.target as Node)) {
        setSearchExpanded(false);
        setSearchQuery("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [searchExpanded]);

  const showInitialLoading = loading && !hasLoadedThreads;
  const hasRequests = requestsMeta.count > 0;
  const trimmedSearchQuery = searchQuery.trim();
  const isSearching = trimmedSearchQuery.length > 0;
  const emptyState = hasLoadedThreads && threads.length === 0 && !isSearching;

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const order: InboxTab[] = ["primary", "requests", "saved"];
    const currentIndex = order.indexOf(tab);
    const direction =
      event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (currentIndex + direction + order.length) % order.length;
    const nextTab = order[nextIndex];

    setTab(nextTab);
    const targetRef =
      nextTab === "primary"
        ? primaryTabRef
        : nextTab === "requests"
          ? requestsTabRef
          : savedTabRef;
    targetRef.current?.focus();
  };

  const handleSearchToggle = () => {
    if (!searchExpanded) {
      setSearchExpanded(true);
      return;
    }

    if (searchQuery) {
      setSearchQuery("");
      searchInputRef.current?.focus();
      return;
    }

    setSearchExpanded(false);
  };

  const handleThreadSelect = useCallback(
    (userId: string) => {
      router.push(`/inbox/${userId}`);

      if (searchExpanded || searchQuery) {
        setSearchExpanded(false);
        setSearchQuery("");
      }
    },
    [router, searchExpanded, searchQuery]
  );

  useEffect(() => {
    if (!isSearching) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        setSearchLoading(true);
        setSearchError(null);

        const response = await fetch(
          `/api/inbox/threads?q=${encodeURIComponent(trimmedSearchQuery)}`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(data?.error ?? "Unable to search inbox.");
        }

        const data = (await response.json()) as InboxSearchResponse;
        if (!isMountedRef.current || controller.signal.aborted) return;

        setSearchResults(data.results ?? []);
        setCurrentUserId(data.currentUserId ?? null);
      } catch (err) {
        if (
          !isMountedRef.current ||
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === "AbortError")
        ) {
          return;
        }

        const message =
          err instanceof Error ? err.message : "Unable to search inbox.";
        setSearchError(message);
        setSearchResults([]);
      } finally {
        if (isMountedRef.current && !controller.signal.aborted) {
          setSearchLoading(false);
        }
      }
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [isSearching, trimmedSearchQuery]);

  const visibleRows = isSearching ? searchResults : threads;

  const threadRows = useMemo(
    () =>
      visibleRows.map((thread) => {
        const displayName = thread.participant.displayName;
        const username = thread.participant.username
          ? `@${thread.participant.username}`
          : null;
        const identityLabel = username ?? displayName;
        const latestMessage = thread.latestMessage;
        const relative = latestMessage
          ? formatRelativeTime(latestMessage.createdAt)
          : "";
        const isSender = latestMessage?.senderId === currentUserId;
        const preview = latestMessage?.body.trim() ?? "";
        const previewLabel = latestMessage
          ? preview
            ? `${isSender ? "You: " : ""}${preview}`
            : "Message"
          : thread.previewLabel ?? `Say hi to ${displayName}`;

        return (
          <Link
            key={thread.participant.userId}
            href={`/inbox/${thread.participant.userId}`}
            onPointerDown={
              isSearching
                ? (event) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    handleThreadSelect(thread.participant.userId);
                  }
                : undefined
            }
            onClick={
              isSearching
                ? (event) => {
                    event.preventDefault();
                    handleThreadSelect(thread.participant.userId);
                  }
                : undefined
            }
            className="group flex w-full items-center gap-3 border-b border-white/10 px-1 py-3 text-left transition last:border-b-0 hover:bg-white/[0.04] active:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
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
                    {identityLabel}
                  </p>
                </div>
                {latestMessage ? (
                  <span className="shrink-0 text-[0.65rem] font-medium tabular-nums text-white/45">
                    {relative}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 line-clamp-1 text-[0.72rem] text-white/65">
                {previewLabel}
              </p>
            </div>
          </Link>
        );
      }),
    [visibleRows, currentUserId, handleThreadSelect, isSearching]
  );

  return (
    <div className="min-h-screen bg-[#07070b] text-white">
      <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4 sm:px-6 sm:pt-6">
        <header className="mb-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.65rem] uppercase tracking-[0.4em] text-white/40">
              INBOX
            </p>
          </div>

          <div className="flex w-full items-center gap-1.5 overflow-hidden">
            <div
              role="tablist"
              aria-label="Inbox sections"
              aria-hidden={searchExpanded}
              className={`inline-flex min-w-0 items-center gap-1.5 overflow-hidden transition-[max-width,opacity,transform] duration-200 ease-out ${
                searchExpanded
                  ? "pointer-events-none max-w-0 -translate-x-2 opacity-0"
                  : "max-w-[calc(100%-38px)] translate-x-0 opacity-100"
              }`}
            >
              <button
                ref={primaryTabRef}
                id="primary-tab"
                role="tab"
                type="button"
                aria-selected={tab === "primary"}
                aria-controls="primary-panel"
                tabIndex={searchExpanded ? -1 : tab === "primary" ? 0 : -1}
                onClick={() => setTab("primary")}
                onKeyDown={handleTabKeyDown}
                className={`rounded-md px-3 py-1.5 text-[0.72rem] font-semibold transition ${
                  tab === "primary"
                    ? "bg-white/[0.12] text-white"
                    : "bg-white/[0.06] text-white/50 hover:bg-white/[0.09] hover:text-white/80"
                }`}
              >
                Main
              </button>
              <button
                ref={requestsTabRef}
                id="requests-tab"
                role="tab"
                type="button"
                aria-selected={tab === "requests"}
                aria-controls="requests-panel"
                tabIndex={searchExpanded ? -1 : tab === "requests" ? 0 : -1}
                onClick={() => setTab("requests")}
                onKeyDown={handleTabKeyDown}
                className={`relative rounded-md px-3 py-1.5 text-[0.72rem] font-semibold transition ${
                  tab === "requests"
                    ? "bg-white/[0.12] text-white"
                    : "bg-white/[0.06] text-white/50 hover:bg-white/[0.09] hover:text-white/80"
                }`}
              >
                Requests
                {requestsMeta.isLoading ? (
                  <span className="ml-1 text-[0.65rem] opacity-60">...</span>
                ) : hasRequests ? (
                  <span
                    className={`ml-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full text-[0.6rem] font-semibold ${
                      tab === "requests"
                        ? "bg-white/[0.18] text-white"
                        : "bg-white/[0.12] text-white/80"
                    }`}
                  >
                    {requestsMeta.count}
                  </span>
                ) : null}
              </button>
              <button
                ref={savedTabRef}
                id="saved-tab"
                role="tab"
                type="button"
                aria-selected={tab === "saved"}
                aria-controls="saved-panel"
                tabIndex={searchExpanded ? -1 : tab === "saved" ? 0 : -1}
                onClick={() => setTab("saved")}
                onKeyDown={handleTabKeyDown}
                className={`rounded-md px-3 py-1.5 text-[0.72rem] font-semibold transition ${
                  tab === "saved"
                    ? "bg-white/[0.12] text-white"
                    : "bg-white/[0.06] text-white/50 hover:bg-white/[0.09] hover:text-white/80"
                }`}
              >
                Saved
              </button>
            </div>

            <div
              ref={searchControlRef}
              className={`flex h-[30px] min-w-0 items-center overflow-hidden rounded-md bg-white/[0.06] text-white/60 transition-[width,flex-grow,transform,background-color] duration-200 ease-out hover:bg-white/[0.09] focus-within:bg-white/[0.09] ${
                searchExpanded ? "w-full flex-1 translate-x-0" : "w-[30px] flex-none"
              }`}
            >
              <button
                type="button"
                aria-label={
                  searchExpanded
                    ? searchQuery
                      ? "Clear inbox search"
                      : "Collapse inbox search"
                    : "Search inbox"
                }
                aria-expanded={searchExpanded}
                onClick={handleSearchToggle}
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md text-white/65 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
              >
                <svg
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="8.5" cy="8.5" r="5" />
                  <path d="m12.2 12.2 3.3 3.3" />
                </svg>
              </button>
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    if (searchQuery) {
                      setSearchQuery("");
                    } else {
                      setSearchExpanded(false);
                    }
                  }
                }}
                placeholder="Search"
                aria-label="Search inbox by profile name or username"
                tabIndex={searchExpanded ? 0 : -1}
                className={`min-w-0 flex-1 bg-transparent pr-2 text-[0.72rem] font-medium text-white transition-[opacity,transform] duration-150 ease-out placeholder:text-white/35 focus:outline-none ${
                  searchExpanded
                    ? "translate-x-0 opacity-100"
                    : "translate-x-2 opacity-0"
                }`}
              />
            </div>
          </div>
        </header>

        <section
          id="primary-panel"
          role="tabpanel"
          aria-labelledby="primary-tab"
          hidden={tab !== "primary"}
          className="space-y-3"
        >
          {showInitialLoading ? (
            <div className="space-y-0 px-1 py-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={`skeleton-${index}`}
                  className="flex items-center gap-3 border-b border-white/10 px-1 py-3 last:border-b-0"
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

          {searchError ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {searchError}
            </div>
          ) : null}

          {!error && emptyState ? (
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

          {!showInitialLoading && !emptyState && threadRows.length > 0 ? (
            <div>
              {threadRows}
              {!isSearching ? (
                <Link
                  href="/friends?tab=search"
                  className="group flex w-full items-center gap-3 px-1 py-3 text-left transition hover:bg-white/[0.03] active:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                >
                  <Avatar className="h-11 w-11 border border-white/10 bg-white/[0.04]">
                    <AvatarFallback className="bg-white/[0.06] text-white/50">
                      <svg
                        viewBox="0 0 20 20"
                        aria-hidden="true"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M10 4v12" />
                        <path d="M4 10h12" />
                      </svg>
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white/80">
                      Can&apos;t find who you&apos;re looking for?
                    </p>
                    <p className="mt-1 text-[0.72rem] font-medium text-white/45 transition group-hover:text-white/60">
                      Add contacts
                    </p>
                  </div>
                </Link>
              ) : null}
            </div>
          ) : null}

          {!showInitialLoading && !emptyState && isSearching && searchLoading ? (
            <div className="space-y-0 px-1 py-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`search-skeleton-${index}`}
                  className="flex items-center gap-3 border-b border-white/10 px-1 py-3 last:border-b-0"
                >
                  <div className="h-11 w-11 rounded-full border border-white/10 bg-white/5" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-2/5 rounded-full bg-white/10" />
                    <div className="h-2.5 w-3/5 rounded-full bg-white/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {!showInitialLoading &&
          !emptyState &&
          isSearching &&
          !searchLoading &&
          threadRows.length === 0 ? (
            <div className="px-1 py-6 text-sm text-white/55">
              No matching CREATOR chats.
            </div>
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

        <section
          id="saved-panel"
          role="tabpanel"
          aria-labelledby="saved-tab"
          hidden={tab !== "saved"}
          className="px-1 py-4 text-sm text-white/55"
        >
          No saved chats yet.
        </section>
      </div>
    </div>
  );
}
