"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X, User } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type MouseEvent, useCallback, useEffect, useState } from "react";

export type ProfileRelationshipView = "following" | "followers" | "offers";

export type ProfileRelationshipUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  viewerFollowsUser: boolean;
  userFollowsViewer: boolean;
  isViewer: boolean;
  canInteract: boolean;
};

export type ProfileOfferPopupRow = {
  id: string;
  label: string;
  typeLabel: string;
  imageUrl?: string | null;
  href?: string | null;
  external?: boolean;
  onSelect?: () => void;
};

type RelationshipOnlyView = Exclude<ProfileRelationshipView, "offers">;

type RelationshipState =
  | { status: "idle"; users: ProfileRelationshipUser[]; error: null }
  | { status: "loading"; users: ProfileRelationshipUser[]; error: null }
  | { status: "loaded"; users: ProfileRelationshipUser[]; error: null }
  | { status: "error"; users: ProfileRelationshipUser[]; error: string };

type RelationshipRowAction =
  | { type: "follow"; label: "Follow" }
  | { type: "follow_back"; label: "Follow back" }
  | { type: "message"; label: "Message" };

type ProfileRelationshipPopupProps = {
  username: string;
  ownerDisplayName?: string | null;
  ownerAvatarUrl?: string | null;
  view: ProfileRelationshipView | null;
  offerRows?: ProfileOfferPopupRow[];
  offersLoading?: boolean;
  offersError?: string | null;
  onClose: () => void;
};

const EMPTY_COPY: Record<ProfileRelationshipView, string> = {
  following: "This profile is not following anyone yet.",
  followers: "No followers to show yet.",
  offers: "No offers to show yet.",
};

function isRelationshipOnlyView(view: ProfileRelationshipView | null): view is RelationshipOnlyView {
  return view === "following" || view === "followers";
}

function getViewLabel(view: ProfileRelationshipView | null) {
  if (view === "followers") return "Followers";
  if (view === "offers") return "Offers";
  return "Following";
}

function getPossessiveName(ownerDisplayName: string | null | undefined, username: string) {
  const ownerName = ownerDisplayName?.trim() || username.trim() || "This profile";
  const suffix = ownerName.toLowerCase().endsWith("s") ? "\u2019" : "\u2019s";

  return `${ownerName}${suffix}`;
}

function getTitle(
  view: ProfileRelationshipView | null,
  ownerDisplayName: string | null | undefined,
  username: string,
) {
  return `${getPossessiveName(ownerDisplayName, username)} ${getViewLabel(view)}`;
}

function getInitials(displayName: string, username: string) {
  const source = displayName.trim() || username.trim();
  const parts = source.split(/\s+/).filter(Boolean);
  const initials =
    parts.length > 1
      ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`
      : source.slice(0, 2);

  return initials.toUpperCase() || "?";
}

function normalizeRelationshipUsers(
  users: ProfileRelationshipUser[],
): ProfileRelationshipUser[] {
  return users.map((user) => ({
    ...user,
    viewerFollowsUser: Boolean(user.viewerFollowsUser),
    userFollowsViewer: Boolean(user.userFollowsViewer),
    isViewer: Boolean(user.isViewer),
    canInteract: Boolean(user.canInteract),
  }));
}

function getRelationshipAction(
  user: ProfileRelationshipUser,
): RelationshipRowAction | null {
  if (!user.canInteract || user.isViewer) {
    return null;
  }

  if (user.viewerFollowsUser) {
    return { type: "message", label: "Message" };
  }

  if (user.userFollowsViewer) {
    return { type: "follow_back", label: "Follow back" };
  }

  return { type: "follow", label: "Follow" };
}

export default function ProfileRelationshipPopup({
  username,
  ownerDisplayName,
  ownerAvatarUrl,
  view,
  offerRows = [],
  offersLoading = false,
  offersError = null,
  onClose,
}: ProfileRelationshipPopupProps) {
  const router = useRouter();
  const [state, setState] = useState<RelationshipState>({
    status: "idle",
    users: [],
    error: null,
  });
  const [pendingActionUserId, setPendingActionUserId] = useState<string | null>(null);
  const isOpen = view !== null;

  useEffect(() => {
    if (!isRelationshipOnlyView(view) || !username) {
      setState({ status: "idle", users: [], error: null });
      return;
    }

    let isActive = true;
    const controller = new AbortController();

    setState({ status: "loading", users: [], error: null });

    (async () => {
      try {
        const response = await fetch(
          `/api/profile/${encodeURIComponent(username)}/relationships?view=${view}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error(`Unable to load ${getViewLabel(view).toLowerCase()}.`);
        }

        const payload = (await response.json().catch(() => null)) as
          | { users?: ProfileRelationshipUser[] }
          | null;
        const users = Array.isArray(payload?.users)
          ? normalizeRelationshipUsers(payload.users)
          : [];

        if (isActive) {
          setState({ status: "loaded", users, error: null });
        }
      } catch (error) {
        if ((error as { name?: string }).name === "AbortError") {
          return;
        }

        if (isActive) {
          setState({
            status: "error",
            users: [],
            error:
              error instanceof Error
                ? error.message
                : `Unable to load ${getViewLabel(view).toLowerCase()}.`,
          });
        }
      }
    })();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [username, view]);

  const handleRelationshipAction = useCallback(
    (
      event: MouseEvent<HTMLButtonElement>,
      relationshipUser: ProfileRelationshipUser,
      action: RelationshipRowAction,
    ) => {
      event.preventDefault();
      event.stopPropagation();

      if (action.type === "message") {
        onClose();
        router.push(`/inbox/${relationshipUser.id}`);
        return;
      }

      if (pendingActionUserId) {
        return;
      }

      setPendingActionUserId(relationshipUser.id);

      void (async () => {
        try {
          const response = await fetch("/api/friends", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: relationshipUser.username }),
          });

          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;

          if (!response.ok) {
            console.error(
              "Failed to follow relationship popup user",
              payload?.error ?? response.status,
            );
            return;
          }

          setState((previous) => ({
            ...previous,
            users: previous.users.map((user) =>
              user.id === relationshipUser.id
                ? { ...user, viewerFollowsUser: true }
                : user,
            ),
          }));
        } catch (error) {
          console.error("Failed to follow relationship popup user", error);
        } finally {
          setPendingActionUserId((current) =>
            current === relationshipUser.id ? null : current,
          );
        }
      })();
    },
    [onClose, pendingActionUserId, router],
  );

  const title = getTitle(view, ownerDisplayName, username);
  const ownerName = ownerDisplayName?.trim() || username.trim() || "This profile";
  const ownerAvatarSrc = ownerAvatarUrl?.trim() || null;
  const ownerInitials = getInitials(ownerName, username);
  const users = state.users;
  const isOffersView = view === "offers";

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[220] bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[230] w-[calc(100vw-2rem)] max-w-[360px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[22px] border border-white/10 bg-[#05070c]/95 text-white shadow-[0_24px_70px_rgba(0,0,0,0.72)] backdrop-blur-xl focus:outline-none">
          <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-neutral-800 via-neutral-900 to-black text-[0.62rem] font-semibold text-white ring-1 ring-white/10">
                {ownerAvatarSrc ? (
                  <Image
                    src={ownerAvatarSrc}
                    alt={`${ownerName} avatar`}
                    width={28}
                    height={28}
                    unoptimized
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <>
                    <span aria-hidden="true">{ownerInitials}</span>
                    <span className="sr-only">{`${ownerName}'s initials`}</span>
                  </>
                )}
              </span>
              <Dialog.Title className="truncate text-sm font-semibold text-white/55">
                {title}
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-transparent text-white/65 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                aria-label={`Close ${title}`}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>

          <div className="max-h-[min(420px,70dvh)] overflow-y-auto px-2 py-2">
            {!isOffersView && state.status === "loading" ? (
              <div className="space-y-2 px-1">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 rounded-[14px] border border-white/5 bg-white/[0.03] px-3 py-2"
                  >
                    <div className="h-10 w-10 animate-pulse rounded-full bg-white/10" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-3 w-28 animate-pulse rounded-full bg-white/10" />
                      <div className="h-2.5 w-20 animate-pulse rounded-full bg-white/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {isOffersView && offersLoading ? (
              <div className="space-y-1 px-1">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`offer-skeleton-${index}`}
                    className="flex items-center justify-between gap-3 rounded-[12px] border border-white/5 bg-white/[0.03] px-3 py-2"
                  >
                    <div className="h-3 w-36 animate-pulse rounded-full bg-white/10" />
                    <div className="h-2.5 w-14 animate-pulse rounded-full bg-white/5" />
                  </div>
                ))}
              </div>
            ) : null}

            {!isOffersView && state.status === "error" ? (
              <div className="rounded-[16px] border border-red-400/20 bg-red-500/10 px-4 py-4 text-sm text-red-100">
                {state.error}
              </div>
            ) : null}

            {isOffersView && offersError ? (
              <div className="mb-2 rounded-[16px] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {offersError}
              </div>
            ) : null}

            {!isOffersView && state.status === "loaded" && users.length === 0 && view ? (
              <div className="rounded-[16px] border border-white/8 bg-white/[0.03] px-4 py-6 text-center text-sm text-white/55">
                {EMPTY_COPY[view]}
              </div>
            ) : null}

            {isOffersView && !offersLoading && offerRows.length === 0 ? (
              <div className="rounded-[16px] border border-white/8 bg-white/[0.03] px-4 py-6 text-center text-sm text-white/55">
                {EMPTY_COPY.offers}
              </div>
            ) : null}

            {!isOffersView && users.length > 0 ? (
              <ul className="space-y-1">
                {users.map((relationshipUser) => {
                  const displayName =
                    relationshipUser.displayName || relationshipUser.username;
                  const avatarSrc = relationshipUser.avatarUrl?.trim() || null;
                  const href = `/profile/${encodeURIComponent(relationshipUser.username)}`;
                  const action = getRelationshipAction(relationshipUser);
                  const isActionPending = pendingActionUserId === relationshipUser.id;

                  return (
                    <li key={relationshipUser.id}>
                      <div className="flex min-w-0 items-center gap-2 rounded-[14px] px-3 py-2 transition hover:bg-white/[0.06] focus-within:bg-white/[0.05]">
                        <Link
                          href={href}
                          prefetch={false}
                          onClick={onClose}
                          className="flex min-w-0 flex-1 items-center gap-3 rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/[0.07] ring-1 ring-white/10">
                            {avatarSrc ? (
                              <Image
                                src={avatarSrc}
                                alt={`${displayName} avatar`}
                                width={40}
                                height={40}
                                unoptimized
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <>
                                <User className="h-4 w-4 text-white/50" aria-hidden="true" />
                                <span className="sr-only">
                                  {getInitials(displayName, relationshipUser.username)}
                                </span>
                              </>
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-white">
                              {displayName}
                            </span>
                            <span className="block truncate text-xs text-white/55">
                              @{relationshipUser.username}
                            </span>
                          </span>
                        </Link>
                        {action ? (
                          <button
                            type="button"
                            onClick={(event) =>
                              handleRelationshipAction(event, relationshipUser, action)
                            }
                            disabled={isActionPending}
                            className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.12] px-2.5 text-[11px] font-semibold text-white/85 transition hover:bg-white/[0.18] hover:text-white disabled:cursor-wait disabled:opacity-60"
                            aria-label={`${action.label} ${displayName}`}
                          >
                            {action.label}
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {isOffersView && !offersLoading && offerRows.length > 0 ? (
              <ul className="space-y-1">
                {offerRows.map((row) => {
                  const imageSrc = row.imageUrl?.trim() || null;
                  const rowClassName =
                    "flex min-w-0 items-center justify-between gap-3 rounded-[12px] px-3 py-2 text-left transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50";
                  const rowContent = (
                    <>
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        {imageSrc ? (
                          <span className="relative flex h-6 w-6 shrink-0 overflow-hidden rounded-md bg-white/[0.07] ring-1 ring-white/10">
                            <Image
                              src={imageSrc}
                              alt=""
                              width={24}
                              height={24}
                              unoptimized
                              className="h-full w-full object-cover"
                            />
                          </span>
                        ) : null}
                        <span className="min-w-0 truncate text-sm font-medium text-white">
                          {row.label}
                        </span>
                      </span>
                      <span className="shrink-0 text-[10px] font-semibold uppercase text-white/40">
                        {row.typeLabel}
                      </span>
                    </>
                  );

                  return (
                    <li key={row.id}>
                      {row.href ? (
                        <Link
                          href={row.href}
                          prefetch={false}
                          target={row.external ? "_blank" : undefined}
                          rel={row.external ? "noopener noreferrer" : undefined}
                          onClick={() => {
                            row.onSelect?.();
                            onClose();
                          }}
                          className={rowClassName}
                        >
                          {rowContent}
                        </Link>
                      ) : row.onSelect ? (
                        <button
                          type="button"
                          onClick={() => {
                            row.onSelect?.();
                            onClose();
                          }}
                          className={rowClassName}
                        >
                          {rowContent}
                        </button>
                      ) : (
                        <div className={rowClassName}>{rowContent}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
