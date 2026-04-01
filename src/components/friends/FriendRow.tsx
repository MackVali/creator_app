"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Friend } from "@/types/friends";
import { DEFAULT_AVATAR_URL } from "@/lib/friends/avatar";

import MessageFriendButton from "./MessageFriendButton";

type FriendRowProps = {
  f: Friend;
  onRemoveFriend?: (friend: Friend) => void;
};

export default function FriendRow({ f, onRemoveFriend }: FriendRowProps) {
  const router = useRouter();
  const defaultProfileHref = `/profile/${encodeURIComponent(f.username)}`;
  const rawProfileUrl = f.profileUrl ?? defaultProfileHref;
  const isInternalProfile = rawProfileUrl.startsWith("/");
  const isExternalProfile = /^https?:\/\//i.test(rawProfileUrl);
  const href = isInternalProfile
    ? rawProfileUrl
    : isExternalProfile
      ? rawProfileUrl
      : defaultProfileHref;
  const title = isExternalProfile ? rawProfileUrl : undefined;
  const statusText = f.isOnline ? "Online now" : "Offline";
  const statusIndicatorClass = f.isOnline ? "bg-emerald-500" : "bg-white/40";
  const statusTextClass = f.isOnline ? "text-emerald-300" : "text-white/40";
  const displayName = f.displayName || f.username;
  const avatarSrc = f.avatarUrl || DEFAULT_AVATAR_URL;

  return (
    <li className="list-none">
      <div className="flex min-h-[68px] items-center gap-4 rounded-2xl border border-white/5 bg-slate-950/60 px-4 py-3 shadow-[0_10px_30px_rgba(2,6,23,0.5)] transition hover:border-white/20 hover:bg-slate-900/75 focus-within:border-white/20 focus-within:ring-1 focus-within:ring-white/40">
        <Link
          href={href}
          className="group flex flex-1 items-center gap-4 min-w-0 rounded-2xl pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          prefetch={false}
          aria-label={`View ${displayName}'s profile — ${statusText}`}
          title={title}
        >
          <div className="relative flex-shrink-0">
            <div
              className={`rounded-full p-[2px] transition ${
                f.hasRing
                  ? "bg-gradient-to-tr from-pink-500 via-fuchsia-500 to-orange-400"
                  : "bg-transparent"
              }`}
            >
              <div className="rounded-full bg-slate-950 p-[2px]">
                <Image
                  alt={`${displayName} avatar`}
                  src={avatarSrc}
                  width={52}
                  height={52}
                  className="rounded-full object-cover"
                />
              </div>
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full ring-2 ring-slate-950">
              <span className={`h-2 w-2 rounded-full ${statusIndicatorClass}`} aria-hidden />
              <span className="sr-only">{statusText}</span>
            </span>
          </div>

          <div className="flex flex-1 items-center gap-4 min-w-0">
            <div className="min-w-0 space-y-1">
              <p className="truncate text-sm font-semibold text-white transition-colors group-hover:text-white/90 group-focus-visible:text-white/90">
                {displayName}
              </p>
              <p className="truncate text-[13px] text-white/70 transition-colors group-hover:text-white/80 group-focus-visible:text-white/80">
                @{f.username}
              </p>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">
                <span className={`h-1.5 w-1.5 rounded-full ${statusIndicatorClass}`} aria-hidden />
                <span className={statusTextClass}>{statusText}</span>
                {f.hasRing && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/70">
                    <span
                      className="h-1 w-1 rounded-full bg-gradient-to-tr from-pink-500 via-fuchsia-500 to-orange-400"
                      aria-hidden
                    />
                    Ring
                  </span>
                )}
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60 transition-colors group-hover:text-white/90 group-focus-visible:text-white/90">
              <span className="hidden sm:inline">View profile</span>
              <svg
                aria-hidden
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="h-[11px] w-[11px] stroke-current"
              >
                <path d="M3 9L9 3M3 3h6v6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <MessageFriendButton
            friend={f}
            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:border-white/30 hover:bg-white/10 active:scale-[0.97]"
            aria-label={`Message ${f.username}`}
          >
            Message
          </MessageFriendButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded-2xl border border-white/10 p-2 text-white/70 transition hover:border-white/30 hover:text-white active:scale-95"
                aria-label="More"
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/70" />
                <span className="mx-0.5 inline-block h-1.5 w-1.5 rounded-full bg-white/70" />
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-44 border-white/10 bg-slate-900/95 text-white shadow-xl backdrop-blur"
            >
              <DropdownMenuItem
                onSelect={() => {
                  router.push(href);
                }}
                className="focus:bg-white/10 focus:text-white"
              >
                View profile
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  onRemoveFriend?.(f);
                }}
              >
                Remove friend
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}
